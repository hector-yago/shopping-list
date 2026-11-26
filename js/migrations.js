// Versionado del esquema de datos. REGLAS (ver docs/datos-y-migraciones.md):
//  - Nunca se edita una migración ya publicada; se añade una nueva (N → N+1) y se sube CURRENT_SCHEMA.
//  - Cada migración es pura e idempotente sobre el documento y NO elimina datos del usuario.
//  - Antes de migrar, el almacén guarda una copia del documento original (store.js).
//  - Cada versión publicada deja un fixture en tests/fixtures/ y un test que lo migra a la actual.
import { DEFAULT_THRESHOLD_PCT, normalizeProduct } from './products.js';
import { DEFAULT_STORES, normalizeStores } from './stores.js';

export const CURRENT_SCHEMA = 2;
export const APP_ID = 'shopping-list';
const STATUSES = ['pending', 'done', 'na'];
const SORTS = ['az', 'oldest', 'newest'];
export const HAB_FILTERS = ['visible', 'hidden', 'all'];
export const HAB_SORTS = ['az', 'last'];

export const DEFAULT_SETTINGS = Object.freeze({
  theme: 'system', // 'system' | 'light' | 'dark'
  sort: 'az', // orden de la lista
  viewStore: 'all', // súper seleccionado en Actual
  lastStore: '', // último súper en el que se finalizó una compra
  thresholdPct: DEFAULT_THRESHOLD_PCT, // % sobre/bajo la media para marcar caro/barato
  backupReminderDays: 14,
  habFilter: 'visible', // Habituales: 'visible' | 'hidden' | 'all'
  habSort: 'az', // Habituales: 'az' | 'last' (última compra)
});

export function emptyDoc() {
  return { schemaVersion: CURRENT_SCHEMA, stores: DEFAULT_STORES.map((s) => ({ ...s })), products: [], items: [], settings: { ...DEFAULT_SETTINGS }, meta: {} };
}

// Cada clave N convierte un documento de versión N en versión N+1.
const steps = {
  // 0 → 1: documento sin versión (p. ej. importado a mano). La normalización final hace el trabajo.
  0: (doc) => ({ ...doc, schemaVersion: 1 }),
  // 1 → 2: Habituales puede ocultar productos (product.hidden) y recuerda filtro y orden (settings). Solo añade campos.
  1: (doc) => ({
    ...doc,
    schemaVersion: 2,
    products: Array.isArray(doc.products) ? doc.products.map((p) => ({ ...p, hidden: p?.hidden === true })) : doc.products,
    settings: { habFilter: 'visible', habSort: 'az', ...(doc.settings ?? {}) },
  }),
};

export function migrate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('El documento de datos no es válido.');
  let doc = { ...input };
  const from = Number.isInteger(doc.schemaVersion) ? doc.schemaVersion : 0;
  if (from > CURRENT_SCHEMA) {
    throw new Error(`Los datos son de una versión más nueva de la app (esquema ${from}). Actualiza la app antes de abrirlos.`);
  }
  doc.schemaVersion = from;
  for (let v = from; v < CURRENT_SCHEMA; v++) {
    if (!steps[v]) throw new Error(`Falta la migración del esquema ${v} al ${v + 1}.`);
    doc = steps[v](doc);
  }
  return { doc: sanitize(doc), from, to: CURRENT_SCHEMA };
}

/** Normaliza y descarta lo irrecuperable, sin tocar lo válido. Se aplica también a las importaciones. */
export function sanitize(doc) {
  const stores = normalizeStores(doc.stores);
  const storeIds = new Set(stores.map((s) => s.id));
  const seen = new Set();
  const products = [];
  for (const raw of Array.isArray(doc.products) ? doc.products : []) {
    const p = normalizeProduct(raw, storeIds);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    products.push(p);
  }
  const used = new Set();
  const items = [];
  for (const i of Array.isArray(doc.items) ? doc.items : []) {
    if (!i?.id || !seen.has(i.productId) || used.has(i.productId)) continue;
    used.add(i.productId);
    items.push({
      id: String(i.id),
      productId: i.productId,
      qty: Number.isFinite(i.qty) && i.qty > 0 ? i.qty : 1,
      price: Number.isFinite(i.price) && i.price >= 0 ? i.price : null,
      status: STATUSES.includes(i.status) ? i.status : 'pending',
    });
  }
  const s = { ...DEFAULT_SETTINGS, ...(doc.settings ?? {}) };
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
  if (!SORTS.includes(s.sort)) s.sort = 'az';
  if (!HAB_FILTERS.includes(s.habFilter)) s.habFilter = 'visible';
  if (!HAB_SORTS.includes(s.habSort)) s.habSort = 'az';
  if (s.viewStore !== 'all' && !stores.some((x) => x.id === s.viewStore && x.active)) s.viewStore = 'all';
  if (!stores.some((x) => x.id === s.lastStore)) s.lastStore = '';
  s.thresholdPct = Number.isInteger(s.thresholdPct) && s.thresholdPct >= 1 && s.thresholdPct <= 100 ? s.thresholdPct : DEFAULT_THRESHOLD_PCT;
  s.backupReminderDays = Number.isInteger(s.backupReminderDays) && s.backupReminderDays > 0 ? s.backupReminderDays : 14;
  const meta = {};
  for (const k of ['lastExport', 'lastAutoBackup']) if (Number.isFinite(doc.meta?.[k])) meta[k] = doc.meta[k];
  return { schemaVersion: CURRENT_SCHEMA, stores, products, items, settings: s, meta };
}
