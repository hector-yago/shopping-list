// Estadísticas puras a partir del historial de precios de los productos.
import { compareNames } from './format.js';
import { avgPrice, pricedHistory, sortedHistory } from './products.js';

/**
 * Compras realizadas: se agrupan las líneas de historial de una misma «finalizar compra» (pid).
 * Las líneas añadidas a mano (sin pid) se agrupan por fecha y súper.
 */
export function purchasesOf(doc) {
  const map = new Map();
  for (const p of doc.products) {
    for (const h of p.history) {
      const key = h.pid ?? `${h.date}|${h.storeId}`;
      if (!map.has(key)) map.set(key, { key, date: h.date, storeId: h.storeId, storeName: h.storeName, lines: [], total: 0, pricedLines: 0 });
      const purchase = map.get(key);
      purchase.lines.push({ productId: p.id, name: p.name, unit: p.unit, qty: h.qty, price: h.price });
      if (Number.isFinite(h.price)) {
        purchase.total += h.price * h.qty;
        purchase.pricedLines += 1;
      }
    }
  }
  const list = [...map.values()];
  for (const c of list) c.lines.sort((a, b) => compareNames(a.name, b.name));
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Resumen de gasto desde una fecha (inclusive). */
export function spendSince(purchases, sinceKey) {
  const inRange = purchases.filter((c) => c.date >= sinceKey);
  const total = inRange.reduce((s, c) => s + c.total, 0);
  return { purchases: inRange.length, total, average: inRange.length ? total / inRange.length : 0 };
}

/** 'AAAA-MM-DD' menos N días (aritmética UTC sobre la clave). */
export function daysAgo(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Estadísticas de precio de un producto: última compra, anterior, media, mínimo, máximo y media por súper. */
export function productPriceStats(product) {
  const series = pricedHistory(product).map((h) => ({ date: h.date, price: h.price, storeName: h.storeName, storeId: h.storeId }));
  if (!series.length) return null;
  const prices = series.map((s) => s.price);
  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const perStore = new Map();
  for (const s of series) {
    const name = s.storeName || 'Sin indicar';
    const e = perStore.get(name) ?? { storeName: name, sum: 0, n: 0 };
    e.sum += s.price;
    e.n += 1;
    perStore.set(name, e);
  }
  return {
    series,
    last,
    prev,
    avg: avgPrice(product),
    min: Math.min(...prices),
    max: Math.max(...prices),
    count: series.length,
    byStore: [...perStore.values()].map((e) => ({ storeName: e.storeName, avg: e.sum / e.n, n: e.n })).sort((a, b) => a.avg - b.avg),
  };
}

/** Variación de la última compra frente a la anterior: 'up' | 'down' | 'same' | null. */
export function trendOf(stats) {
  if (!stats?.prev) return null;
  const d = stats.last.price - stats.prev.price;
  return Math.abs(d) < 0.005 ? 'same' : d > 0 ? 'up' : 'down';
}

/** Productos con algún precio, de compra más reciente a más antigua. */
export function pricedProducts(products) {
  return products
    .map((product) => ({ product, stats: productPriceStats(product) }))
    .filter((e) => e.stats)
    .sort((a, b) => (a.stats.last.date < b.stats.last.date ? 1 : a.stats.last.date > b.stats.last.date ? -1 : compareNames(a.product.name, b.product.name)));
}

export const hasHistory = (product) => sortedHistory(product).length > 0;
