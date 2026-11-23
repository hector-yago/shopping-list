import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BACKUP_KEEP, createStore, memoryAdapter } from '../js/store.js';
import { CURRENT_SCHEMA, emptyDoc, migrate } from '../js/migrations.js';
import { createProduct } from '../js/products.js';
import { addItem, finalize, setStatus } from '../js/list.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const clock = (start = 1_800_000_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms) => (t += ms) };
};

test('primer arranque crea el documento y los cambios persisten entre sesiones', async () => {
  const adapter = memoryAdapter();
  const s1 = createStore(adapter);
  assert.equal((await s1.load()).created, true);
  await s1.update((d) => {
    const p = createProduct({ name: 'Leche' });
    d.products.push(p);
    addItem(d, p.id);
  });
  const s2 = createStore(adapter);
  const info = await s2.load();
  assert.equal(info.created, false);
  assert.equal(s2.state.products.length, 1);
  assert.equal(s2.state.items.length, 1);
});

test('migración: fixture de la v1 publicada se abre sin perder nada', async () => {
  const v1 = fixture('v1.json');
  const adapter = memoryAdapter();
  await adapter.put('doc', v1);
  const s = createStore(adapter);
  const info = await s.load();
  assert.equal(info.migratedFrom, null);
  assert.equal(s.state.schemaVersion, CURRENT_SCHEMA);
  assert.equal(s.state.products.length, v1.products.length);
  assert.deepEqual(s.state.products[0].history.map((h) => [h.date, h.price, h.storeName]), v1.products[0].history.map((h) => [h.date, h.price, h.storeName]));
  assert.deepEqual(s.state.products[0].prefs, v1.products[0].prefs);
  assert.equal(s.state.products[1].defaultQty, 0.5);
  assert.deepEqual(s.state.items.map((i) => [i.productId, i.qty, i.price, i.status]), v1.items.map((i) => [i.productId, i.qty, i.price, i.status]));
  assert.equal(s.state.settings.thresholdPct, 20);
  assert.equal(s.state.settings.viewStore, 'mercadona');
  assert.ok(s.state.stores.some((x) => x.id === 'c-tienda1' && x.custom && x.active));
  assert.equal(s.state.stores.find((x) => x.id === 'lidl').active, false);
  assert.ok(s.state.stores.length > 3); // se completan los súpers de la base
});

test('documento sin versión se migra y una versión futura NO se toca', async () => {
  const adapter = memoryAdapter();
  await adapter.put('doc', { products: [{ id: 'a', name: 'Pan' }] });
  const s = createStore(adapter);
  const info = await s.load();
  assert.equal(info.migratedFrom, 0);
  assert.equal(s.state.products[0].unit, 'ud');
  assert.equal((await s.listBackups()).length, 1);

  const future = { schemaVersion: CURRENT_SCHEMA + 1, products: [], x: 'dato futuro' };
  const a2 = memoryAdapter();
  await a2.put('doc', future);
  await assert.rejects(() => createStore(a2).load(), /versión más nueva/);
  assert.deepEqual(await a2.get('doc'), future);
});

test('saneado: descarta lo irrecuperable y conserva lo válido', () => {
  const { doc } = migrate({
    stores: [{ id: 'mercadona', active: false }, { id: 'x', name: '' }],
    products: [
      { id: 'a', name: ' Leche ', unit: 'cajas', defaultQty: -1, prefs: { mercadona: 'p', inventado: 'p', lidl: 'x' }, history: [{ date: 'mal', price: 1 }, { date: '2026-11-01', qty: 0, price: -3 }, { date: '2026-11-02', qty: 2, price: 1.5 }] },
      { id: 'a', name: 'Duplicado' },
      { id: 'b', name: '   ' },
    ],
    items: [{ id: 'i1', productId: 'a', qty: 0, price: 'x', status: 'raro' }, { id: 'i2', productId: 'a' }, { id: 'i3', productId: 'zzz' }],
    settings: { viewStore: 'no-existe', thresholdPct: 0, sort: 'x', theme: '??' },
  });
  assert.equal(doc.products.length, 1);
  const p = doc.products[0];
  assert.deepEqual([p.name, p.unit, p.defaultQty], ['Leche', 'ud', 1]);
  assert.deepEqual(p.prefs, { mercadona: 'p' });
  assert.deepEqual(p.history.map((h) => [h.date, h.qty, h.price]), [['2026-11-01', 1, null], ['2026-11-02', 2, 1.5]]);
  assert.deepEqual(doc.items.map((i) => [i.productId, i.qty, i.price, i.status]), [['a', 1, null, 'pending']]);
  assert.deepEqual([doc.settings.viewStore, doc.settings.thresholdPct, doc.settings.sort, doc.settings.theme], ['all', 15, 'az', 'system']);
  assert.equal(doc.stores.find((s) => s.id === 'mercadona').active, false);
});

test('desactivar el súper seleccionado devuelve la vista a «Todos»; borrar un producto lo quita de la lista', async () => {
  const s = createStore(memoryAdapter());
  await s.load();
  await s.update((d) => {
    const p = createProduct({ name: 'Leche' });
    d.products.push(p);
    addItem(d, p.id);
    d.settings.viewStore = 'lidl';
  });
  assert.equal(s.state.settings.viewStore, 'lidl');
  await s.update((d) => { d.stores.find((x) => x.id === 'lidl').active = false; });
  assert.equal(s.state.settings.viewStore, 'all');
  await s.update((d) => { d.products = []; });
  assert.equal(s.state.items.length, 0);
});

test('update devuelve el resultado de la operación (finalizar) y se puede deshacer', async () => {
  const s = createStore(memoryAdapter());
  await s.load();
  await s.update((d) => {
    const p = createProduct({ name: 'Leche' });
    d.products.push(p);
    addItem(d, p.id);
    setStatus(d, d.items[0].id, 'done');
  });
  const prev = structuredClone(s.state);
  const r = await s.update((d) => finalize(d, { storeId: 'mercadona', date: '2026-11-23' }));
  assert.equal(r.bought, 1);
  assert.equal(s.state.items.length, 0);
  assert.equal(s.state.products[0].history.length, 1);
  await s.update(() => prev);
  assert.equal(s.state.items.length, 1);
  assert.equal(s.state.products[0].history.length, 0);
});

test('exportar e importar: reemplazar y fusionar, con copia previa', async () => {
  const a = createStore(memoryAdapter());
  await a.load();
  await a.update((d) => {
    d.products.push(createProduct({ name: 'Leche' }), createProduct({ name: 'Pan' }));
    d.stores.push({ id: 'c-fruteria', name: 'Frutería', ini: 'Fr', color: '#475569', custom: true, active: true });
  });
  const json = a.exportJson();
  assert.equal(JSON.parse(json).app, 'shopping-list');

  const c = clock();
  const b = createStore(memoryAdapter(), { now: c.now });
  await b.load();
  await b.update((d) => { d.products.push(createProduct({ name: 'Solo en B' })); });
  const merged = await b.importJson(json, 'merge');
  assert.equal(merged.products, 3);
  assert.ok(b.state.stores.some((x) => x.id === 'c-fruteria'));
  c.advance(1000);
  const replaced = await b.importJson(json, 'replace');
  assert.equal(replaced.products, 2);
  assert.equal((await b.listBackups()).length, 2);

  await assert.rejects(() => b.importJson('no es json'), /JSON válido/);
  await assert.rejects(() => b.importJson(JSON.stringify({ app: 'otra', data: {} })), /no es una exportación/);
});

test('copia diaria automática y rotación', async () => {
  const c = clock();
  const s = createStore(memoryAdapter(), { now: c.now });
  await s.load();
  assert.equal(await s.autoBackup(), false); // sin productos no hay nada que copiar
  await s.update((d) => { d.products.push(createProduct({ name: 'Leche' })); });
  assert.equal(await s.autoBackup(), true);
  assert.equal(await s.autoBackup(), false); // ya hay una de hoy
  for (let i = 0; i < BACKUP_KEEP + 3; i++) {
    c.advance(86_400_000 + 1000);
    await s.autoBackup();
  }
  assert.equal((await s.listBackups()).length, BACKUP_KEEP);
  const [last] = await s.listBackups();
  await s.restoreBackup(last.key);
  assert.equal(s.state.products.length, 1);
});

test('aviso de copia manual', async () => {
  const c = clock();
  const s = createStore(memoryAdapter(), { now: c.now });
  await s.load();
  assert.equal(s.backupDue(), false);
  await s.update((d) => { d.products.push(createProduct({ name: 'Leche' }, c.now())); });
  assert.equal(s.backupDue(), false);
  c.advance(15 * 86_400_000);
  assert.equal(s.backupDue(), true);
  await s.markExported();
  assert.equal(s.backupDue(), false);
});

test('el documento vacío es válido para la migración actual', () => {
  const { doc, from, to } = migrate(emptyDoc());
  assert.equal(from, to);
  assert.deepEqual(doc.items, []);
});
