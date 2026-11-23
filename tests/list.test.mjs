import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, migrate } from '../js/migrations.js';
import { createHistoryEntry, createProduct, avgPrice, priceFlag, lastPurchase } from '../js/products.js';
import { addItem, buildList, finalize, iconStores, nextSort, setStatus } from '../js/list.js';
import { createCustomStore, DEFAULT_STORES, normalizeStores } from '../js/stores.js';
import { eur, fq, norm, parseNum } from '../js/format.js';

/** Documento de prueba con datos ficticios. */
function sample() {
  const d = emptyDoc();
  const mk = (name, extra = {}) => {
    const p = createProduct({ name, ...extra });
    d.products.push(p);
    return p;
  };
  return { d, mk };
}
const hist = (p, entries) => entries.forEach(([date, price, storeId = 'mercadona']) => p.history.push(createHistoryEntry({ date, storeId, storeName: storeId, qty: 1, price })));

test('formato: importes, cantidades decimales y números con coma', () => {
  assert.equal(eur(9.8), '9,80 €');
  assert.equal(fq(0.5), '0,5');
  assert.equal(fq(2), '2');
  assert.equal(parseNum('0,5'), 0.5);
  assert.equal(parseNum('2.40'), 2.4);
  assert.equal(parseNum('abc'), null);
  assert.equal(parseNum(''), null);
  assert.equal(norm('  ÁRBOL Ñandú '), 'arbol nandu');
});

test('súpers: todos los de la base existen y se pueden crear otros', () => {
  assert.ok(DEFAULT_STORES.length >= 12);
  assert.ok(DEFAULT_STORES.some((s) => s.id === 'mercadona' && s.active));
  const c = createCustomStore('  Frutería Juani ');
  assert.equal(c.custom, true);
  assert.equal(c.name, 'Frutería Juani');
  assert.equal(c.ini, 'FJ');
  const list = normalizeStores([c, { id: 'mercadona', active: false }]);
  assert.equal(list.find((s) => s.id === 'mercadona').active, false);
  assert.ok(list.some((s) => s.id === c.id));
  assert.equal(list.length, DEFAULT_STORES.length + 1);
});

test('iconos: «Todos» muestra los preferidos; en un súper solo los OTROS preferidos y solo si este no lo es', () => {
  const { d, mk } = sample();
  const leche = mk('Leche', { prefs: { mercadona: 'p', lidl: 'p' } });
  const pan = mk('Pan', { prefs: { lidl: 'p' } });
  const agua = mk('Agua', { prefs: { dia: 'n' } });
  const ids = (p, sel) => iconStores(p, d.stores, sel).map((s) => s.id);
  assert.deepEqual(ids(leche, 'all'), ['mercadona', 'lidl']);
  assert.deepEqual(ids(leche, 'mercadona'), []); // aquí es preferido: sin icono
  assert.deepEqual(ids(leche, 'carrefour'), ['mercadona', 'lidl']); // aquí no: se ven los otros
  assert.deepEqual(ids(pan, 'mercadona'), ['lidl']);
  assert.deepEqual(ids(pan, 'lidl'), []);
  assert.deepEqual(ids(agua, 'all'), []); // sin preferido, sin icono
  assert.deepEqual(ids(agua, 'mercadona'), []);
});

test('iconos: un súper desactivado no aparece', () => {
  const { d, mk } = sample();
  const p = mk('Leche', { prefs: { lidl: 'p', mercadona: 'p' } });
  d.stores.find((s) => s.id === 'lidl').active = false;
  assert.deepEqual(iconStores(p, d.stores, 'all').map((s) => s.id), ['mercadona']);
});

test('lista: «no válido» en el súper elegido oculta solo los pendientes', () => {
  const { d, mk } = sample();
  const a = mk('Aceite', { prefs: { dia: 'n' } });
  const b = mk('Bizcocho', { prefs: { dia: 'n' } });
  const c = mk('Café');
  [a, b, c].forEach((p) => addItem(d, p.id));
  setStatus(d, d.items[1].id, 'done'); // Bizcocho ya comprado
  const dia = buildList(d, 'dia');
  assert.deepEqual(dia.pending.map((e) => e.product.name), ['Café']);
  assert.deepEqual(dia.hidden.map((e) => e.product.name), ['Aceite']);
  assert.deepEqual(dia.done.map((e) => e.product.name), ['Bizcocho']);
  const all = buildList(d, 'all');
  assert.equal(all.hidden.length, 0);
  assert.equal(all.counts.total, 3);
  assert.equal(buildList(d, 'mercadona').hidden.length, 0); // sin marcar = válido
});

test('lista: contadores, precio por defecto = media y totales', () => {
  const { d, mk } = sample();
  const leche = mk('Leche', { unit: 'ud' });
  hist(leche, [['2026-10-01', 1.0], ['2026-10-15', 0.8]]);
  const manzanas = mk('Manzanas', { unit: 'kg' });
  const sal = mk('Sal');
  [leche, manzanas, sal].forEach((p) => addItem(d, p.id));
  const byName = (n) => d.items.find((i) => d.products.find((p) => p.id === i.productId).name === n);
  byName('Leche').qty = 6;
  byName('Manzanas').qty = 0.5;
  byName('Manzanas').price = 2.4;
  setStatus(d, byName('Manzanas').id, 'done');
  setStatus(d, byName('Sal').id, 'na');
  const L = buildList(d, 'all');
  assert.deepEqual(L.counts, { done: 1, na: 1, pending: 1, total: 3 });
  assert.ok(Math.abs(L.totals.left - 0.9 * 6) < 1e-9); // media 0,90 × 6
  assert.ok(Math.abs(L.totals.got - 1.2) < 1e-9); // 0,5 kg × 2,40
  const leche1 = L.pending[0];
  assert.equal(leche1.estimated, true);
  assert.equal(L.totals.leftWithoutPrice, 0);
  assert.equal(L.na[0].price, null); // sin precio ni historial
});

test('precio caro/barato: solo con ≥2 compras con precio y respecto a la media propia', () => {
  const { mk } = sample();
  const p = mk('Aceite');
  assert.equal(priceFlag(9, p), null); // sin historial
  hist(p, [['2026-09-01', 8]]);
  assert.equal(priceFlag(12, p), null); // una sola compra: sin referencia
  hist(p, [['2026-10-01', 10]]);
  assert.equal(avgPrice(p), 9);
  assert.equal(priceFlag(10.5, p), 'exp'); // > +15 %
  assert.equal(priceFlag(7.5, p), 'cheap'); // < -15 %
  assert.equal(priceFlag(9.5, p), null);
  assert.equal(priceFlag(10.5, p, 20), null); // umbral configurable
  assert.equal(priceFlag(null, p), null);
});

test('la media usa solo las últimas 5 compras con precio', () => {
  const { mk } = sample();
  const p = mk('Café');
  hist(p, [['2026-01-01', 100], ['2026-02-01', 1], ['2026-03-01', 1], ['2026-04-01', 1], ['2026-05-01', 1], ['2026-06-01', 1]]);
  assert.equal(avgPrice(p), 1);
  p.history.push(createHistoryEntry({ date: '2026-07-01', qty: 1, price: null })); // sin precio: no cuenta en la media
  assert.equal(avgPrice(p), 1);
  assert.equal(lastPurchase(p), '2026-07-01');
});

test('orden: A–Z o por última compra (↑ antigua primero, ↓ reciente primero; nunca comprados al final)', () => {
  const { d, mk } = sample();
  const a = mk('Arroz');
  const b = mk('Berenjena');
  const c = mk('Cebolla');
  const e = mk('Espinacas');
  hist(a, [['2026-11-10', 1]]);
  hist(b, [['2026-09-01', 1]]);
  hist(c, [['2026-10-01', 1]]);
  [e, c, b, a].forEach((p) => addItem(d, p.id));
  const names = (mode) => buildList(d, 'all', mode).pending.map((x) => x.product.name);
  assert.deepEqual(names('az'), ['Arroz', 'Berenjena', 'Cebolla', 'Espinacas']);
  assert.deepEqual(names('oldest'), ['Berenjena', 'Cebolla', 'Arroz', 'Espinacas']);
  assert.deepEqual(names('newest'), ['Arroz', 'Cebolla', 'Berenjena', 'Espinacas']);
  assert.equal(nextSort('az'), 'oldest');
  assert.equal(nextSort('newest'), 'az');
});

test('añadir: un producto solo una vez en la lista; la cantidad parte de la última compra', () => {
  const { d, mk } = sample();
  const p = mk('Manzanas', { unit: 'kg', defaultQty: 0.5 });
  assert.equal(addItem(d, p.id), 'added');
  assert.equal(addItem(d, p.id), 'exists');
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].qty, 0.5);
  assert.throws(() => addItem(d, 'no-existe'));
});

test('finalizar: comprados → historial; no disponibles vuelven a pendiente; pendientes se quedan', () => {
  const { d, mk } = sample();
  const [a, b, c] = ['Atún', 'Bonito', 'Caballa'].map((n) => mk(n));
  [a, b, c].forEach((p) => addItem(d, p.id));
  d.items[0].price = 1.5;
  d.items[0].qty = 3;
  setStatus(d, d.items[0].id, 'done');
  setStatus(d, d.items[1].id, 'na');
  const r = finalize(d, { storeId: 'lidl', date: '2026-11-23' });
  assert.equal(r.bought, 1);
  assert.equal(r.returned, 1);
  assert.equal(r.total, 4.5);
  assert.deepEqual(d.items.map((i) => i.status), ['pending', 'pending']);
  assert.equal(d.items.length, 2);
  const h = a.history[0];
  assert.deepEqual([h.date, h.storeId, h.storeName, h.qty, h.price], ['2026-11-23', 'lidl', 'Lidl', 3, 1.5]);
  assert.ok(h.pid);
  assert.equal(a.defaultQty, 3);
  assert.equal(d.settings.lastStore, 'lidl');
  assert.equal(finalize(d, { date: '2026-11-24' }), null); // nada comprado
});

test('finalizar sin precio guarda la compra sin precio (no contamina la media)', () => {
  const { d, mk } = sample();
  const p = mk('Pan');
  addItem(d, p.id);
  setStatus(d, d.items[0].id, 'done');
  finalize(d, { storeId: '', date: '2026-11-23' });
  assert.equal(p.history[0].price, null);
  assert.equal(avgPrice(p), null);
  assert.equal(p.history[0].storeName, '');
});

test('migrar el resultado de un documento vacío no pierde los súpers de la base', () => {
  const { doc } = migrate({});
  assert.equal(doc.stores.length, DEFAULT_STORES.length);
  assert.equal(doc.settings.viewStore, 'all');
});
