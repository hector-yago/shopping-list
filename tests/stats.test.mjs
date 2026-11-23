import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '../js/migrations.js';
import { createHistoryEntry, createProduct } from '../js/products.js';
import { daysAgo, pricedProducts, productPriceStats, purchasesOf, spendSince, trendOf } from '../js/stats.js';

function sample() {
  const d = emptyDoc();
  const leche = createProduct({ name: 'Leche' });
  const pan = createProduct({ name: 'Pan' });
  const add = (p, date, price, storeId, storeName, qty = 1, pid) => p.history.push(createHistoryEntry({ date, storeId, storeName, qty, price, pid }));
  add(leche, '2026-10-05', 0.9, 'mercadona', 'Mercadona', 6, 'c1');
  add(pan, '2026-10-05', 1.4, 'mercadona', 'Mercadona', 1, 'c1');
  add(leche, '2026-11-02', 0.8, 'lidl', 'Lidl', 6, 'c2');
  add(leche, '2026-11-20', 1.1, 'mercadona', 'Mercadona', 6, 'c3');
  add(pan, '2026-11-20', null, 'mercadona', 'Mercadona', 1, 'c3'); // sin precio
  add(pan, '2026-09-01', 1.3, '', '', 1); // línea manual sin pid
  d.products.push(leche, pan);
  return d;
}

test('compras: se agrupan por «finalizar compra» y suman solo lo que tiene precio', () => {
  const list = purchasesOf(sample());
  assert.deepEqual(list.map((c) => c.date), ['2026-11-20', '2026-11-02', '2026-10-05', '2026-09-01']);
  const c1 = list.find((c) => c.key === 'c1');
  assert.equal(c1.lines.length, 2);
  assert.ok(Math.abs(c1.total - (0.9 * 6 + 1.4)) < 1e-9);
  const c3 = list.find((c) => c.key === 'c3');
  assert.equal(c3.pricedLines, 1);
  assert.ok(Math.abs(c3.total - 6.6) < 1e-9);
  assert.equal(list.find((c) => c.date === '2026-09-01').lines.length, 1);
});

test('gasto de los últimos días', () => {
  const list = purchasesOf(sample());
  assert.equal(daysAgo('2026-11-23', 30), '2026-10-24');
  const s = spendSince(list, daysAgo('2026-11-23', 30));
  assert.equal(s.purchases, 2);
  assert.ok(Math.abs(s.total - (0.8 * 6 + 6.6)) < 1e-9);
  assert.ok(Math.abs(s.average - s.total / 2) < 1e-9);
  assert.deepEqual(spendSince([], '2026-01-01'), { purchases: 0, total: 0, average: 0 });
});

test('estadísticas de precio de un producto', () => {
  const [leche, pan] = sample().products;
  const st = productPriceStats(leche);
  assert.equal(st.count, 3);
  assert.equal(st.last.price, 1.1);
  assert.equal(st.prev.price, 0.8);
  assert.equal(st.min, 0.8);
  assert.equal(st.max, 1.1);
  assert.ok(Math.abs(st.avg - 0.9333333) < 1e-6);
  assert.equal(trendOf(st), 'up');
  assert.deepEqual(st.byStore.map((b) => b.storeName), ['Lidl', 'Mercadona']); // más barato primero
  assert.equal(productPriceStats(createProduct({ name: 'Nuevo' })), null);
  assert.equal(productPriceStats(pan).count, 2); // la línea sin precio no cuenta
  assert.equal(productPriceStats(pan).byStore.some((b) => b.storeName === 'Sin indicar'), true);
});

test('productos con precio: más recientes primero', () => {
  const d = sample();
  d.products.push(createProduct({ name: 'Sin precio' }));
  const list = pricedProducts(d.products);
  assert.deepEqual(list.map((e) => e.product.name), ['Leche', 'Pan']);
});
