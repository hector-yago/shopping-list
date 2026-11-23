// Productos habituales: preferencias por súper, historial de compras y precio medio. Puro.
import { compareNames, isValidKey, newId } from './format.js';
import { UNITS } from './stores.js';

/** Para la media se usan las últimas N compras con precio. */
export const AVG_N = 5;
export const HISTORY_LIMIT = 500;
export const DEFAULT_THRESHOLD_PCT = 15;

export function createProduct({ name, unit = 'ud', prefs = {}, defaultQty = 1 }, now = Date.now()) {
  return { id: newId(), name: String(name).trim().slice(0, 120), unit: UNITS.includes(unit) ? unit : 'ud', defaultQty, prefs: { ...prefs }, history: [], createdAt: now };
}

export function createHistoryEntry({ date, storeId = '', storeName = '', qty = 1, price = null, pid }) {
  return { id: newId(), date, storeId, storeName, qty, price, ...(pid ? { pid } : {}) };
}

/** 'p' preferido · 'n' no válido · 'v' válido (un súper sin marcar equivale a válido). */
export const preferenceOf = (product, storeId) => product.prefs?.[storeId] ?? 'v';

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function sortedHistory(product) {
  return [...product.history].sort(byDate);
}

/** Entradas con precio, de más antigua a más reciente. */
export const pricedHistory = (product) => sortedHistory(product).filter((h) => Number.isFinite(h.price));

/** Precio medio (por unidad de medida) de las últimas compras con precio; null si no hay ninguna. */
export function avgPrice(product, n = AVG_N) {
  const last = pricedHistory(product).slice(-n);
  if (!last.length) return null;
  return last.reduce((s, h) => s + h.price, 0) / last.length;
}

/** Fecha de la última compra o null. */
export function lastPurchase(product) {
  const h = sortedHistory(product);
  return h.length ? h[h.length - 1].date : null;
}

/**
 * ¿Caro o barato? Compara un precio con la media de su propio historial.
 * Solo se valora con al menos 2 compras con precio (con menos no hay referencia fiable).
 */
export function priceFlag(price, product, pct = DEFAULT_THRESHOLD_PCT) {
  if (!Number.isFinite(price)) return null;
  if (pricedHistory(product).length < 2) return null;
  const avg = avgPrice(product);
  if (price > avg * (1 + pct / 100)) return 'exp';
  if (price < avg * (1 - pct / 100)) return 'cheap';
  return null;
}

export function normalizeProduct(raw, storeIds) {
  const name = String(raw?.name ?? '').trim().slice(0, 120);
  if (!raw?.id || !name) return null;
  const prefs = {};
  for (const [sid, v] of Object.entries(raw.prefs ?? {})) if (storeIds.has(sid) && (v === 'p' || v === 'n')) prefs[sid] = v;
  const seen = new Set();
  const history = [];
  for (const h of Array.isArray(raw.history) ? raw.history : []) {
    if (!isValidKey(h?.date)) continue;
    const id = h.id && !seen.has(h.id) ? String(h.id) : newId();
    seen.add(id);
    history.push({
      id,
      date: h.date,
      storeId: String(h.storeId ?? ''),
      storeName: String(h.storeName ?? '').slice(0, 60),
      qty: Number.isFinite(h.qty) && h.qty > 0 ? h.qty : 1,
      price: Number.isFinite(h.price) && h.price >= 0 ? h.price : null,
      ...(h.pid ? { pid: String(h.pid) } : {}),
    });
  }
  history.sort(byDate);
  return {
    id: String(raw.id),
    name,
    unit: UNITS.includes(raw.unit) ? raw.unit : 'ud',
    defaultQty: Number.isFinite(raw.defaultQty) && raw.defaultQty > 0 ? raw.defaultQty : 1,
    prefs,
    history: history.slice(-HISTORY_LIMIT),
    createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
  };
}

export const sortByName = (products) => [...products].sort((a, b) => compareNames(a.name, b.name));
