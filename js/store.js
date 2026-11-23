// Almacén: un único documento JSON guardado de forma atómica (IndexedDB en el navegador, Map en tests),
// con copias de seguridad automáticas (antes de migrar y una al día) y exportación/importación versionada.
import { APP_ID, CURRENT_SCHEMA, emptyDoc, migrate } from './migrations.js';

const DOC_KEY = 'doc';
const BACKUP_PREFIX = 'backup:';
export const BACKUP_KEEP = 7;
const DAY_MS = 86400000;

/** Adaptador en memoria (tests y respaldo cuando IndexedDB no está disponible). */
export function memoryAdapter() {
  const m = new Map();
  return {
    async get(k) {
      return m.has(k) ? structuredClone(m.get(k)) : undefined;
    },
    async put(k, v) {
      m.set(k, structuredClone(v));
    },
    async del(k) {
      m.delete(k);
    },
    async keys() {
      return [...m.keys()];
    },
  };
}

/** Adaptador IndexedDB (un solo almacén clave-valor). */
export function indexedDbAdapter(name = 'shopping-list') {
  const open = new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async (mode, fn) => {
    const db = await open;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const out = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(out?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    get: (k) => run('readonly', (s) => s.get(k)),
    put: (k, v) => run('readwrite', (s) => s.put(v, k)),
    del: (k) => run('readwrite', (s) => s.delete(k)),
    keys: () => run('readonly', (s) => s.getAllKeys()),
  };
}

export function createStore(adapter, { now = () => Date.now() } = {}) {
  let doc = emptyDoc();
  const listeners = new Set();
  let saving = Promise.resolve();

  async function snapshot(reason, source) {
    const stamp = now();
    await adapter.put(`${BACKUP_PREFIX}${String(stamp).padStart(15, '0')}`, { reason, createdAt: stamp, doc: source });
    const keys = (await adapter.keys()).filter((k) => k.startsWith(BACKUP_PREFIX)).sort();
    for (const old of keys.slice(0, Math.max(0, keys.length - BACKUP_KEEP))) await adapter.del(old);
  }

  return {
    /** Carga (y migra) los datos. Devuelve info de lo ocurrido para avisar al usuario. */
    async load() {
      const raw = await adapter.get(DOC_KEY);
      const info = { created: false, migratedFrom: null };
      if (raw === undefined) {
        doc = emptyDoc();
        await adapter.put(DOC_KEY, doc);
        info.created = true;
        return info;
      }
      const result = migrate(raw); // si es de una versión más nueva lanza error y NO se toca nada
      if (result.from !== result.to) {
        await snapshot(`antes de migrar del esquema ${result.from} al ${result.to}`, raw);
        info.migratedFrom = result.from;
      }
      doc = result.doc;
      if (result.from !== result.to) await adapter.put(DOC_KEY, doc);
      return info;
    },

    get state() {
      return doc;
    },

    /** Aplica un cambio sobre una copia, valida y persiste. `fn` recibe el borrador y puede devolver el nuevo documento o mutarlo. */
    async update(fn) {
      const draft = structuredClone(doc);
      const result = fn(draft);
      const next = result && typeof result === 'object' && !Array.isArray(result) && result.products ? result : draft;
      doc = migrate({ ...next, schemaVersion: CURRENT_SCHEMA }).doc;
      listeners.forEach((l) => l(doc));
      saving = saving.then(() => adapter.put(DOC_KEY, doc));
      await saving;
      return result && result !== next ? result : undefined;
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /** Copia diaria automática (como máximo una cada 24 h). */
    async autoBackup() {
      const last = doc.meta.lastAutoBackup ?? 0;
      if (now() - last < DAY_MS || doc.products.length === 0) return false;
      await snapshot('copia automática diaria', doc);
      await this.update((d) => {
        d.meta.lastAutoBackup = now();
      });
      return true;
    },

    async listBackups() {
      const keys = (await adapter.keys()).filter((k) => k.startsWith(BACKUP_PREFIX)).sort().reverse();
      const out = [];
      for (const key of keys) {
        const b = await adapter.get(key);
        out.push({ key, reason: b.reason, createdAt: b.createdAt, products: b.doc?.products?.length ?? 0 });
      }
      return out;
    },

    /** Restaura una copia; antes guarda el estado actual por si hubo error. */
    async restoreBackup(key) {
      const b = await adapter.get(key);
      if (!b) throw new Error('La copia ya no existe.');
      const restored = migrate(b.doc).doc;
      await snapshot('antes de restaurar una copia', doc);
      doc = restored;
      listeners.forEach((l) => l(doc));
      await adapter.put(DOC_KEY, doc);
    },

    exportJson() {
      return JSON.stringify({ app: APP_ID, schemaVersion: CURRENT_SCHEMA, exportedAt: new Date(now()).toISOString(), data: doc }, null, 2);
    },

    async markExported() {
      await this.update((d) => {
        d.meta.lastExport = now();
      });
    },

    /** Importa un fichero exportado. mode: 'replace' (sustituye todo, con copia previa) o 'merge' (añade lo que falte). */
    async importJson(text, mode = 'replace') {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('El fichero no es un JSON válido.');
      }
      if (parsed?.app !== APP_ID || !parsed.data) throw new Error('El fichero no es una exportación de shopping-list.');
      const incoming = migrate({ ...parsed.data, schemaVersion: parsed.schemaVersion ?? parsed.data.schemaVersion }).doc;
      await snapshot(`antes de importar (${mode})`, doc);
      if (mode === 'replace') {
        doc = { ...incoming, meta: { ...incoming.meta, lastExport: doc.meta.lastExport } };
      } else {
        const productIds = new Set(doc.products.map((p) => p.id));
        const storeIds = new Set(doc.stores.map((s) => s.id));
        const newProducts = incoming.products.filter((p) => !productIds.has(p.id));
        const newStores = incoming.stores.filter((s) => !storeIds.has(s.id));
        const newIds = new Set(newProducts.map((p) => p.id));
        const listed = new Set(doc.items.map((i) => i.productId));
        doc = migrate({
          ...doc,
          stores: [...doc.stores, ...newStores],
          products: [...doc.products, ...newProducts],
          items: [...doc.items, ...incoming.items.filter((i) => newIds.has(i.productId) && !listed.has(i.productId))],
        }).doc;
      }
      listeners.forEach((l) => l(doc));
      await adapter.put(DOC_KEY, doc);
      return { products: doc.products.length };
    },

    /** ¿Toca recordar la copia manual? */
    backupDue() {
      if (doc.products.length === 0) return false;
      // Sin exportaciones previas se cuenta desde el producto más antiguo, para no avisar nada más empezar.
      const since = doc.meta.lastExport ?? Math.min(...doc.products.map((p) => p.createdAt));
      return now() - since > doc.settings.backupReminderDays * DAY_MS;
    },
  };
}
