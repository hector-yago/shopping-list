// Lógica pura de la compra actual: visibilidad por súper, iconos, orden, totales y finalización.
import { compareNames, newId } from './format.js';
import { activeStores, storeById } from './stores.js';
import { avgPrice, createHistoryEntry, DEFAULT_THRESHOLD_PCT, lastPurchase, preferenceOf, priceFlag } from './products.js';

export const SORT_MODES = Object.freeze(['az', 'oldest', 'newest']);
export const SORT_LABELS = Object.freeze({ az: 'A–Z', oldest: 'Compra: antigua primero', newest: 'Compra: reciente primero' });
export const nextSort = (mode) => SORT_MODES[(SORT_MODES.indexOf(mode) + 1) % SORT_MODES.length];

/**
 * Súpers cuyo icono se muestra en un producto.
 *  - Vista «Todos»: los súpers preferidos (uno o varios).
 *  - Vista de un súper: solo los OTROS súpers preferidos, y solo si este súper no es el preferido del producto.
 *    Sin preferidos no hay iconos.
 */
export function iconStores(product, stores, selected) {
  const prefs = activeStores(stores).filter((s) => preferenceOf(product, s.id) === 'p');
  if (selected === 'all') return prefs;
  if (preferenceOf(product, selected) === 'p') return [];
  return prefs.filter((s) => s.id !== selected);
}

/** En la vista de un súper, un producto «no válido» ahí no aparece entre los pendientes. */
export const isHiddenIn = (product, selected) => selected !== 'all' && preferenceOf(product, selected) === 'n';

/** Precio por unidad que se usa: el escrito a mano o, por defecto, la media de compras anteriores (null si no hay). */
export const effectivePrice = (item, product) => item.price ?? avgPrice(product);

function compareEntries(mode) {
  if (mode === 'az') return (a, b) => compareNames(a.product.name, b.product.name);
  const dir = mode === 'oldest' ? 1 : -1;
  return (a, b) => {
    const da = a.last;
    const db = b.last;
    if (da === db) return compareNames(a.product.name, b.product.name);
    if (da === null) return 1; // nunca comprados, siempre al final
    if (db === null) return -1;
    return (da < db ? -1 : 1) * dir;
  };
}

/**
 * Construye la vista de la lista para un súper (o «all»).
 * Devuelve secciones ordenadas, los pendientes ocultos por «no válido», contadores y totales.
 */
export function buildList(doc, selected, sortMode = 'az', thresholdPct = DEFAULT_THRESHOLD_PCT) {
  const products = new Map(doc.products.map((p) => [p.id, p]));
  const sections = { pending: [], done: [], na: [] };
  const hidden = [];
  for (const item of doc.items) {
    const product = products.get(item.productId);
    if (!product) continue;
    const price = effectivePrice(item, product);
    const entry = {
      item,
      product,
      price,
      estimated: item.price == null,
      total: price == null ? 0 : price * item.qty,
      flag: priceFlag(item.price, product, thresholdPct),
      avg: avgPrice(product),
      last: lastPurchase(product),
      icons: iconStores(product, doc.stores, selected),
    };
    if (item.status === 'pending' && isHiddenIn(product, selected)) hidden.push(entry);
    else sections[item.status].push(entry);
  }
  const cmp = compareEntries(sortMode);
  for (const list of [sections.pending, sections.done, sections.na, hidden]) list.sort(cmp);
  const sum = (list) => list.reduce((s, e) => s + e.total, 0);
  const counts = { done: sections.done.length, na: sections.na.length, pending: sections.pending.length };
  counts.total = counts.done + counts.na + counts.pending;
  return {
    ...sections,
    hidden,
    counts,
    totals: { got: sum(sections.done), left: sum(sections.pending), leftWithoutPrice: sections.pending.filter((e) => e.price == null).length },
  };
}

/* ---------- mutaciones sobre un borrador del documento ---------- */

/** Añade un producto a la lista. Devuelve 'added' o 'exists'. */
export function addItem(draft, productId) {
  const product = draft.products.find((p) => p.id === productId);
  if (!product) throw new Error('El producto no existe.');
  if (draft.items.some((i) => i.productId === productId)) return 'exists';
  draft.items.push({ id: newId(), productId, qty: product.defaultQty, price: null, status: 'pending' });
  return 'added';
}

export function setStatus(draft, itemId, status) {
  const item = draft.items.find((i) => i.id === itemId);
  if (item) item.status = status;
}

export function removeItem(draft, itemId) {
  draft.items = draft.items.filter((i) => i.id !== itemId);
}

/**
 * Finaliza la compra: lo comprado pasa al historial (fecha, súper, cantidad y precio si lo hay) y sale de la lista;
 * lo «no disponible» vuelve a pendiente; lo pendiente se queda. Devuelve null si no había nada comprado.
 */
export function finalize(draft, { storeId = '', date }) {
  const bought = draft.items.filter((i) => i.status === 'done');
  if (!bought.length) return null;
  const store = storeById(draft.stores, storeId);
  const pid = newId();
  let total = 0;
  for (const item of bought) {
    const product = draft.products.find((p) => p.id === item.productId);
    if (!product) continue;
    product.history.push(createHistoryEntry({ date, storeId: store?.id ?? '', storeName: store?.name ?? '', qty: item.qty, price: item.price ?? null, pid }));
    product.defaultQty = item.qty;
    if (item.price != null) total += item.price * item.qty;
  }
  const returned = draft.items.filter((i) => i.status === 'na').length;
  draft.items = draft.items.filter((i) => i.status !== 'done');
  for (const i of draft.items) if (i.status === 'na') i.status = 'pending';
  if (store) draft.settings.lastStore = store.id;
  return { bought: bought.length, returned, total, pid };
}
