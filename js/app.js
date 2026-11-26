// Interfaz de Lista de la compra: vistas Actual, Habituales, Estadísticas y Súpers/ajustes. Sin dependencias ni paso de build.
import { VERSION } from './version.js';
import { compareNames, dayKey, eur, esc, fmtDate, fq, norm, num2, parseNum } from './format.js';
import { activeStores, createCustomStore, storeById, UNIT_STEP, UNITS } from './stores.js';
import { avgPrice, createHistoryEntry, createProduct, filterHabituales, lastPurchase, setHidden, sortByName, sortHabituales } from './products.js';
import { addItem, buildList, finalize, iconStores, nextSort, removeItem, setStatus } from './list.js';
import { daysAgo, pricedProducts, productPriceStats, purchasesOf, spendSince, trendOf } from './stats.js';
import { createStore, indexedDbAdapter, memoryAdapter } from './store.js';

/* ---------- utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const fmtStamp = (ms) => new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

// En localhost se puede fijar el día con ?hoy=AAAA-MM-DD (pruebas). En producción siempre es el día real.
const params = new URLSearchParams(location.search);
const FAKE_OK = ['localhost', '127.0.0.1'].includes(location.hostname);
let fakeToday = FAKE_OK && /^\d{4}-\d{2}-\d{2}$/.test(params.get('hoy') ?? '') ? params.get('hoy') : null;
const today = () => fakeToday ?? dayKey(new Date());
if (FAKE_OK) window.__setToday = (k) => { fakeToday = k; render(); };

const svg = (inner, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${inner}</svg>`;
const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  cart: svg('<path d="M3 4h2l2.4 11h10.2l2-8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>'),
  star: svg('<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>'),
  chart: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  store: svg('<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>'),
};

/* ---------- estado ---------- */
const ui = { view: 'actual', q: '', hq: '', sq: '', showHidden: false, persisted: null, storageWarning: '' };
let store;
let toastTimer;

const SORT_SHORT = { az: 'A–Z', oldest: 'Última compra ↑', newest: 'Última compra ↓' };
const HAB_FILTER_LABELS = [['visible', 'Visibles'], ['hidden', 'Ocultos'], ['all', 'Todos']];
const SORT_ARIA ={ az: 'orden alfabético', oldest: 'orden por última compra, la más antigua primero', newest: 'orden por última compra, la más reciente primero' };
const LEVEL_LABEL = { v: 'Válido (por defecto)', p: 'Preferido', n: 'No válido' };
const NEXT_LEVEL = { v: 'p', p: 'n', n: 'v' };

function toast(text, actionLabel, onAction) {
  $('#toast-root')?.remove();
  const el = document.createElement('div');
  el.id = 'toast-root';
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(text)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
  if (actionLabel) el.querySelector('button').addEventListener('click', () => { clearTimeout(toastTimer); el.remove(); onAction(); });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), actionLabel ? 6000 : 3000);
}

/* ---------- hojas modales ---------- */
function openSheet(html, mount) {
  closeSheet();
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'sheet-root';
  overlay.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeSheet(); });
  document.body.append(overlay);
  const sheet = overlay.firstElementChild;
  sheet.querySelectorAll('[data-sheet=close]').forEach((b) => b.addEventListener('click', closeSheet));
  mount?.(sheet);
  sheet.querySelector('[autofocus]')?.focus({ preventScroll: true });
  return sheet;
}
function closeSheet() {
  $('#sheet-root')?.remove();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

/* ---------- piezas de interfaz ---------- */
const storeIcon = (s) => `<span class="si" style="background:${esc(s.color)}" title="${esc(s.name)}" aria-label="${esc(s.name)}">${esc(s.ini)}</span>`;
const iconsHtml = (list) => (list.length ? `<span class="ics" aria-label="Súper preferido: ${esc(list.map((s) => s.name).join(', '))}">${list.map(storeIcon).join('')}</span>` : '');
const productById = (id) => store.state.products.find((p) => p.id === id);
const itemOf = (id) => store.state.items.find((i) => i.id === id);

function segButtons(options, current, attrs) {
  return options.map(([v, l]) => `<button type="button" ${attrs} data-v="${esc(v)}" aria-pressed="${String(current) === String(v)}">${esc(l)}</button>`).join('');
}

/* ---------- vista Actual ---------- */
function entryRow(e, sort) {
  const { item, product } = e;
  const status = item.status;
  const meta = [
    e.avg != null ? `Media ${eur(e.avg)}/${product.unit}` : 'Sin historial',
    sort !== 'az' && e.last ? `última ${fmtDate(e.last)}` : '',
  ].filter(Boolean).join(' · ');
  const flag = e.flag === 'exp' ? '<span class="badge exp">⬆ caro</span>' : e.flag === 'cheap' ? '<span class="badge cheap">⬇ barato</span>' : '';
  const price = e.price == null
    ? `<b class="add-price">＋ precio</b><small>${fq(item.qty)} ${esc(product.unit)}</small>`
    : `<b>${e.estimated ? '≈ ' : ''}${eur(e.total)}</b><small>${fq(item.qty)} ${esc(product.unit)} × ${eur(e.price)}</small>`;
  const label = status === 'done' ? 'Desmarcar' : status === 'na' ? 'Volver a pendiente' : 'Marcar como comprado';
  return `<li class="row ${status}">
    <button class="check" data-action="toggle" data-id="${esc(item.id)}" aria-label="${label}: ${esc(product.name)}" aria-pressed="${status === 'done'}">${status === 'na' ? '✕' : ICON.check}</button>
    <button class="body" data-action="edit" data-id="${esc(item.id)}"><span class="title">${esc(product.name)}${flag}</span><span class="meta">${esc(meta)}</span></button>
    ${iconsHtml(e.icons)}
    <button class="pbtn${e.estimated && e.price != null ? ' est' : ''}" data-action="edit" data-id="${esc(item.id)}" aria-label="Cantidad y precio de ${esc(product.name)}">${price}</button>
    <button class="more" data-action="menu" data-id="${esc(item.id)}" aria-label="Más acciones de ${esc(product.name)}">⋯</button>
  </li>`;
}

function viewActual() {
  const d = store.state;
  const s = d.settings;
  const sel = s.viewStore;
  const L = buildList(d, sel, s.sort, s.thresholdPct);
  const selName = sel === 'all' ? '' : storeById(d.stores, sel)?.name ?? '';
  const { counts, totals } = L;
  const C = 2 * Math.PI * 26;
  const arc = (from, n) => (counts.total ? `stroke-dasharray="${(C * n) / counts.total} ${C}" stroke-dashoffset="${-(C * from) / counts.total}"` : `stroke-dasharray="0 ${C}"`);
  try { navigator.setAppBadge?.(counts.pending > 0 ? counts.pending : 0); } catch { /* sin soporte */ }

  const chips = [['all', 'Todos', ''], ...activeStores(d.stores).map((x) => [x.id, x.name, storeIcon(x)])]
    .map(([id, name, icon]) => `<button class="store-chip" data-action="store" data-id="${esc(id)}" aria-pressed="${sel === id}">${icon}${esc(name)}</button>`).join('');

  const section = (title, list, extra = '') => (list.length ? `<section class="group"><h2><span>${title}</span>${extra}</h2><ul class="list">${list.map((e) => entryRow(e, s.sort)).join('')}</ul></section>` : '');
  const hidden = L.hidden.length
    ? `<button class="hid-btn" data-action="toggle-hidden" aria-expanded="${ui.showHidden}">${ui.showHidden ? '▾' : '▸'} ${L.hidden.length} oculto${L.hidden.length === 1 ? '' : 's'} en ${esc(selName)} (no válido${L.hidden.length === 1 ? '' : 's'})</button>${ui.showHidden ? `<ul class="hid-list">${L.hidden.map((e) => `<li>${esc(e.product.name)}</li>`).join('')}</ul>` : ''}`
    : '';
  const empty = counts.total === 0 && !L.hidden.length
    ? '<div class="empty"><b>La lista está vacía</b>Escribe arriba un producto, o pulsa ⭐ para elegir de tus habituales.</div>' : '';
  const backup = store.backupDue() ? '<div class="banner"><span>Hace tiempo que no exportas una copia.</span><button class="btn small" data-action="tab" data-v="supers">Ir a copias</button></div>' : '';
  const warn = ui.storageWarning ? `<div class="banner">${esc(ui.storageWarning)}</div>` : '';

  return `<header class="top"><div class="titles"><h1>Compra</h1><div class="sub">${sel === 'all' ? 'Todos los supermercados' : esc(selName)}</div></div>
      <button class="pill" data-action="sort" aria-label="Ordenar: ${SORT_ARIA[s.sort]}. Pulsa para cambiar">${SORT_SHORT[s.sort]} ⇅</button></header>
    ${warn}${backup}
    <div class="stores" role="group" aria-label="Supermercado">${chips}</div>
    <div class="prog">
      <div class="ring" role="img" aria-label="${counts.done + counts.na} de ${counts.total} resueltos"><svg viewBox="0 0 64 64"><circle class="trk" cx="32" cy="32" r="26"/><circle class="r" cx="32" cy="32" r="26" ${arc(counts.done, counts.na)}/><circle class="g" cx="32" cy="32" r="26" ${arc(0, counts.done)}/></svg><span>${counts.done + counts.na}/${counts.total}</span></div>
      <div class="pt"><div><span class="dot" style="background:var(--ok)"></span>Comprados <b>${counts.done}</b> · <span class="dot" style="background:var(--danger)"></span>No disp. <b>${counts.na}</b> · Faltan <b>${counts.pending}</b></div>
      <div>Llevo <b>${eur(totals.got)}</b> · Faltan ~<b>${eur(totals.left)}</b>${totals.leftWithoutPrice ? ` <span title="Sin precio ni historial">(${totals.leftWithoutPrice} sin precio)</span>` : ''}</div></div>
    </div>
    <div class="add"><input id="q" type="text" placeholder="Añadir producto…" autocomplete="off" autocapitalize="sentences" enterkeyhint="done" value="${esc(ui.q)}" aria-label="Añadir producto" />
      <button class="btn primary" data-action="add-text" aria-label="Añadir">＋</button><button class="btn" data-action="pick-habituals" aria-label="Elegir de habituales">⭐</button></div>
    <div class="sugg hidden" id="sugg"></div>
    ${empty}${section('Pendientes', L.pending)}${hidden}${section('Comprados', L.done, `<span>${counts.done}</span>`)}${section('No disponibles', L.na, '<span>vuelven al finalizar</span>')}
    ${counts.done ? '<div class="finish"><button class="btn ok" data-action="finish">Finalizar compra</button></div>' : ''}`;
}

/* ---------- vista Habituales ---------- */
function viewHabituales() {
  const d = store.state;
  const q = norm(ui.hq);
  const listed = new Set(d.items.map((i) => i.productId));
  const { habFilter, habSort } = d.settings;
  const hiddenCount = d.products.filter((p) => p.hidden).length;
  const counts = { visible: d.products.length - hiddenCount, hidden: hiddenCount, all: d.products.length };
  const rows = sortHabituales(filterHabituales(d.products, habFilter), habSort).filter((p) => !q || norm(p.name).includes(q)).map((p) => {
    const avg = avgPrice(p);
    const last = lastPurchase(p);
    const meta = [p.unit, last ? `última ${fmtDate(last)}` : 'nunca comprado', avg != null ? `media ${eur(avg)}` : ''].filter(Boolean).join(' · ');
    const inList = listed.has(p.id);
    const id = esc(p.id);
    const action = inList
      ? '<span class="badge cheap">En la lista</span>'
      : `<button class="btn small" data-action="${p.hidden ? 'unhide' : 'hide'}" data-id="${id}">${p.hidden ? 'Mostrar' : 'Ocultar'}</button>
         ${p.hidden ? '' : `<button class="btn small" data-action="quick-add" data-id="${id}">＋ Añadir</button>`}`;
    return `<li class="row${p.hidden ? ' is-hidden' : ''}"><button class="body" data-action="product" data-id="${id}"><span class="title">${esc(p.name)}${p.hidden ? ' <span class="badge">Oculto</span>' : ''}</span><span class="meta">${esc(meta)}</span></button>
      ${iconsHtml(iconStores(p, d.stores, 'all'))}
      ${action}</li>`;
  }).join('');
  const emptyMsg = !d.products.length ? '' : q ? 'Sin resultados.' : habFilter === 'hidden' ? 'No hay productos ocultos.' : 'No hay productos visibles. Cambia el filtro.';
  const empty = !d.products.length ? '<div class="empty"><b>Aún no hay habituales</b>Se crean solos al añadir productos nuevos en Compra, o con «+ Nuevo».</div>' : `<div class="empty">${emptyMsg}</div>`;
  const filters = HAB_FILTER_LABELS.map(([k, label]) => `<button class="chip${habFilter === k ? ' on' : ''}" data-action="hab-filter" data-v="${k}" aria-pressed="${habFilter === k}">${label} (${counts[k]})</button>`).join('');
  return `<header class="top"><div class="titles"><h1>Habituales</h1><div class="sub">${d.products.length} producto${d.products.length === 1 ? '' : 's'}${hiddenCount ? ` · ${hiddenCount} oculto${hiddenCount === 1 ? '' : 's'}` : ''}</div></div><button class="pill" data-action="new-product">＋ Nuevo</button></header>
    <div class="add"><input id="hq" type="search" placeholder="Buscar…" autocomplete="off" value="${esc(ui.hq)}" aria-label="Buscar habitual" /></div>
    <div class="filters">${filters}<button class="pill" data-action="hab-sort" aria-label="Ordenar: ${habSort === 'az' ? 'orden alfabético' : 'última compra, la más reciente primero'}. Pulsa para cambiar">${habSort === 'az' ? 'A–Z' : 'Última compra'} ⇅</button></div>
    ${rows ? `<ul class="list">${rows}</ul>` : empty}`;
}

/* ---------- vista Estadísticas ---------- */
const TREND = { up: '<span class="trend-up" title="Más caro que la compra anterior">▲</span>', down: '<span class="trend-down" title="Más barato que la compra anterior">▼</span>', same: '<span title="Igual que la anterior">＝</span>' };

function viewStats() {
  const d = store.state;
  const purchases = purchasesOf(d);
  const month = spendSince(purchases, daysAgo(today(), 30));
  const q = norm(ui.sq);
  const priced = pricedProducts(d.products).filter((e) => !q || norm(e.product.name).includes(q));
  const compras = purchases.slice(0, 8).map((c) => {
    const st = storeById(d.stores, c.storeId);
    const name = st?.name ?? (c.storeName || 'Sin indicar');
    const lines = c.lines.map((l) => `<tr><td>${esc(l.name)}</td><td class="num">${fq(l.qty)} ${esc(l.unit)}</td><td class="num">${Number.isFinite(l.price) ? eur(l.price) : '—'}</td></tr>`).join('');
    return `<details class="fold"><summary><span class="line" style="width:100%;border:0;padding:0"><span class="nm">${st ? storeIcon(st) : ''}<span>${fmtDate(c.date)} · ${esc(name)}</span></span><b>${c.pricedLines ? eur(c.total) : '—'}</b></span></summary>
      <table class="hist"><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Precio/ud.</th></tr>${lines}</table></details>`;
  }).join('');
  const prods = priced.map(({ product, stats }) => {
    const trend = trendOf(stats);
    return `<li class="row"><button class="body" data-action="stat-product" data-id="${esc(product.id)}"><span class="title">${esc(product.name)}</span>
      <span class="meta">${fmtDate(stats.last.date)}${stats.last.storeName ? ` · ${esc(stats.last.storeName)}` : ''} · media ${eur(stats.avg)} · mín ${eur(stats.min)} · máx ${eur(stats.max)}</span></button>
      <span class="pbtn" style="cursor:default"><b>${eur(stats.last.price)} ${trend ? TREND[trend] : ''}</b><small>por ${esc(product.unit)}</small></span></li>`;
  }).join('');
  return `<header class="top"><div class="titles"><h1>Estadísticas</h1><div class="sub">Precios de tus últimas compras</div></div></header>
    <div class="kpis"><div class="kpi"><small>Gasto 30 días</small><b>${eur(month.total)}</b></div><div class="kpi"><small>Compras</small><b>${month.purchases}</b></div><div class="kpi"><small>Ticket medio</small><b>${eur(month.average)}</b></div></div>
    <p class="hint">Solo suman los productos a los que pusiste precio al comprar.</p>
    <section class="group"><h2><span>Últimas compras</span><span>${purchases.length} en total</span></h2>${compras ? `<div class="card" style="padding:4px 14px">${compras}</div>` : '<div class="empty">Aún no hay compras. Cuando finalices una, aparecerá aquí.</div>'}</section>
    <section class="group"><h2><span>Precio por producto</span></h2>
      <div class="add"><input id="sq" type="search" placeholder="Buscar producto…" autocomplete="off" value="${esc(ui.sq)}" aria-label="Buscar producto" /></div>
      ${prods ? `<ul class="list">${prods}</ul>` : '<div class="empty">Sin precios todavía. Pon el precio al comprar y se guardará al finalizar.</div>'}</section>`;
}

function sparkSvg(series, avg) {
  const W = 300, H = 90, P = 10;
  const prices = series.map((s) => s.price);
  let min = Math.min(...prices, avg ?? Infinity);
  let max = Math.max(...prices, avg ?? -Infinity);
  if (max === min) { max += 1; min -= 1; }
  const x = (i) => (series.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (series.length - 1));
  const y = (v) => H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.price).toFixed(1)}`).join(' ');
  const avgLine = avg != null ? `<line class="avg" x1="${P}" x2="${W - P}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del precio">${avgLine}<polyline points="${pts}"/>${series.map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s.price).toFixed(1)}" r="3.2"/>`).join('')}</svg>`;
}

function priceSheet(productId) {
  const p = productById(productId);
  const st = p && productPriceStats(p);
  if (!st) return;
  const recent = st.series.slice(-12);
  const rows = [...st.series].reverse().slice(0, 10).map((s) => `<tr><td>${fmtDate(s.date)}</td><td>${esc(s.storeName || 'Sin indicar')}</td><td class="num">${eur(s.price)}</td></tr>`).join('');
  const per = st.byStore.length > 1 ? `<h3 style="margin:14px 0 6px;font-size:.95rem">Media por súper</h3>${st.byStore.map((b) => `<div class="line"><span>${esc(b.storeName)} <small style="color:var(--muted)">(${b.n})</small></span><b>${eur(b.avg)}</b></div>`).join('')}` : '';
  openSheet(`<h2>${esc(p.name)}</h2>
    <p class="hint">Precio por ${esc(p.unit)} · ${st.count} compra${st.count === 1 ? '' : 's'} con precio · media ${eur(st.avg)} (últimas 5) · mín ${eur(st.min)} · máx ${eur(st.max)}</p>
    ${sparkSvg(recent, st.avg)}<p class="hint" style="text-align:center">Línea discontinua: media</p>
    <table class="hist"><tr><th>Fecha</th><th>Súper</th><th class="num">Precio</th></tr>${rows}</table>${per}
    <div class="actions"><button class="btn grow" data-sheet="close">Cerrar</button></div>`);
}

/* ---------- vista Súpers y ajustes ---------- */
function viewSupers() {
  const d = store.state;
  const s = d.settings;
  const lines = d.stores.map((x) => `<div class="line"><span class="nm">${storeIcon(x)}<span>${esc(x.name)}</span></span>
    ${x.custom ? `<button class="btn small" data-action="edit-store" data-id="${esc(x.id)}">Editar</button>` : ''}
    <button class="tog" role="switch" aria-checked="${x.active}" aria-label="${x.active ? 'Ocultar' : 'Mostrar'} ${esc(x.name)}" data-action="toggle-store" data-id="${esc(x.id)}"></button></div>`).join('');
  return `<header class="top"><div class="titles"><h1>Súpers y ajustes</h1><div class="sub">Lista de la compra ${esc(VERSION)}</div></div></header>
    <div class="card"><h3>Supermercados</h3><p>Los activos salen en Compra y en las fichas. Un súper sin marcar en un producto cuenta como «válido».</p>${lines}
      <div class="actions"><button class="btn" data-action="new-store">+ Crear otro supermercado</button></div></div>
    <div class="card"><h3>Precio caro / barato</h3><p>Se avisa cuando el precio que pones se aleja de la media de las últimas 5 compras de ese producto (hacen falta al menos 2).</p>
      <div class="seg" role="group" aria-label="Umbral">${segButtons([10, 15, 20, 25].map((n) => [n, `${n} %`]), s.thresholdPct, 'data-action="threshold"')}</div></div>
    <div class="card"><h3>Apariencia</h3><div class="seg" role="group" aria-label="Tema">${segButtons([['system', 'Sistema'], ['light', 'Claro'], ['dark', 'Oscuro']], s.theme, 'data-action="theme"')}</div></div>
    <div class="card"><h3>Copias de seguridad</h3><p>Tus datos solo están en este dispositivo. Última exportación: ${d.meta.lastExport ? fmtStamp(d.meta.lastExport) : 'nunca'}.</p>
      <div class="actions"><button class="btn primary" data-action="export">Exportar a un fichero</button><button class="btn" data-action="import">Importar fichero</button><button class="btn" data-action="backups">Copias automáticas</button></div></div>
    <div class="card"><h3>Instalar en el iPhone</h3><p>En Safari: Compartir → «Añadir a pantalla de inicio». Ábrela siempre desde ese icono para que iOS conserve tus datos.</p><p>Almacenamiento protegido: ${ui.persisted === true ? 'sí' : ui.persisted === false ? 'no solicitado/denegado (exporta copias a menudo)' : 'desconocido'}.</p></div>`;
}

const TABS = [['actual', 'Compra', ICON.cart], ['habituales', 'Habituales', ICON.star], ['stats', 'Estadísticas', ICON.chart], ['supers', 'Súpers', ICON.store]];

function render() {
  if (!store) return;
  const y = window.scrollY;
  const view = { actual: viewActual, habituales: viewHabituales, stats: viewStats, supers: viewSupers }[ui.view]();
  const focus = document.activeElement;
  const focusId = focus?.id;
  const pos = focus?.selectionStart;
  $('#app').innerHTML = `${view}
    <nav class="tabs" aria-label="Secciones"><div class="inner">${TABS.map(([id, label, icon]) => `<button data-action="tab" data-v="${id}" ${ui.view === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('')}</div></nav>`;
  if (['q', 'hq', 'sq'].includes(focusId)) { const el = $(`#${focusId}`); el?.focus(); if (pos != null) try { el?.setSelectionRange(pos, pos); } catch { /* tipo search */ } }
  renderSugg();
  window.scrollTo(0, y);
  applyTheme();
}

function applyTheme() {
  const th = store.state.settings.theme;
  if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('sl-theme', th); } catch { /* sin almacenamiento */ }
}

/* ---------- añadir a la lista ---------- */
function suggestionsFor(text) {
  const q = norm(text);
  if (!q) return { matches: [], exact: null };
  const d = store.state;
  const listed = new Set(d.items.map((i) => i.productId));
  const all = d.products.filter((p) => norm(p.name).includes(q));
  const exact = all.find((p) => norm(p.name) === q) ?? null;
  all.sort((a, b) => (norm(a.name).startsWith(q) === norm(b.name).startsWith(q) ? compareNames(a.name, b.name) : norm(a.name).startsWith(q) ? -1 : 1));
  return { matches: all.slice(0, 6).map((p) => ({ p, listed: listed.has(p.id) })), exact };
}

function renderSugg() {
  const box = $('#sugg');
  if (!box) return;
  const text = ui.q.trim();
  if (!text) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  const { matches, exact } = suggestionsFor(text);
  box.innerHTML = matches.map(({ p, listed }) => `<button data-action="add-product" data-id="${esc(p.id)}">⭐ ${esc(p.name)}<span class="hint">${listed ? 'ya está en la lista' : '1 toque'}</span></button>`).join('')
    + (exact ? '' : `<button data-action="create-add">＋ Crear «${esc(text)}» como nuevo</button>`);
  box.classList.remove('hidden');
}

async function addProductToList(productId, { keepFocus = true } = {}) {
  const r = await store.update((d) => addItem(d, productId));
  if (r === 'exists') toast('Ya está en la lista.');
  ui.q = '';
  render();
  if (keepFocus && ui.view === 'actual') $('#q')?.focus();
}

async function createAndAdd(name) {
  const clean = name.trim();
  if (!clean) return;
  await store.update((d) => {
    const p = createProduct({ name: clean });
    d.products.push(p);
    addItem(d, p.id);
  });
  ui.q = '';
  render();
  $('#q')?.focus();
}

async function submitText() {
  const text = ui.q.trim();
  if (!text) { $('#q')?.focus(); return; }
  const { exact } = suggestionsFor(text);
  if (exact) await addProductToList(exact.id);
  else await createAndAdd(text);
}

function habitualsPicker() {
  const d = store.state;
  const listed = new Set(d.items.map((i) => i.productId));
  const chosen = new Set();
  let filter = '';
  const list = (sheet) => {
    const q = norm(filter);
    sheet.querySelector('#pk-list').innerHTML = sortByName(d.products).filter((p) => !q || norm(p.name).includes(q)).map((p) => {
      const inList = listed.has(p.id);
      return `<label class="line"><span class="nm"><input type="checkbox" value="${esc(p.id)}" ${inList ? 'disabled checked' : chosen.has(p.id) ? 'checked' : ''}/> <span>${esc(p.name)}${inList ? ' <small style="color:var(--muted)">(en la lista)</small>' : ''}</span></span>${iconsHtml(iconStores(p, d.stores, 'all'))}</label>`;
    }).join('') || '<p class="hint">No hay productos.</p>';
    sheet.querySelector('#pk-count').textContent = chosen.size;
  };
  openSheet(`<h2>Añadir de tus habituales</h2><div class="field"><input id="pk-q" type="search" placeholder="Buscar…" autocomplete="off" /></div>
    <div id="pk-list" style="max-height:50dvh;overflow-y:auto"></div>
    <div class="actions"><button class="btn primary grow" id="pk-ok">Añadir (<span id="pk-count">0</span>)</button><button class="btn" data-sheet="close">Cancelar</button></div>`, (sheet) => {
    list(sheet);
    sheet.querySelector('#pk-q').addEventListener('input', (e) => { filter = e.target.value; list(sheet); });
    sheet.querySelector('#pk-list').addEventListener('change', (e) => {
      if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value);
      sheet.querySelector('#pk-count').textContent = chosen.size;
    });
    sheet.querySelector('#pk-ok').addEventListener('click', async () => {
      if (!chosen.size) return closeSheet();
      await store.update((dr) => { for (const id of chosen) addItem(dr, id); });
      closeSheet();
      toast(`${chosen.size} producto${chosen.size === 1 ? '' : 's'} añadido${chosen.size === 1 ? '' : 's'}.`);
    });
  });
}

/* ---------- editar cantidad y precio de un elemento de la lista ---------- */
function itemSheet(itemId) {
  const item = itemOf(itemId);
  const product = item && productById(item.productId);
  if (!product) return;
  const avg = avgPrice(product);
  let unit = product.unit;
  openSheet(`<h2>${esc(product.name)}</h2>
    <form id="item-form" novalidate>
      <div class="field"><label for="f-qty">Cantidad (admite decimales: 0,5)</label>
        <div class="step"><button type="button" data-step="-1" aria-label="Menos">−</button><input id="f-qty" type="text" inputmode="decimal" autocomplete="off" value="${fq(item.qty)}" /><button type="button" data-step="1" aria-label="Más">＋</button></div>
        <div class="seg wide" role="group" aria-label="Unidad">${UNITS.map((u) => `<button type="button" data-unit="${u}" aria-pressed="${u === unit}">${u}</button>`).join('')}</div></div>
      <div class="field"><label for="f-price">Precio por <span id="f-unit">${esc(unit)}</span> (opcional)</label>
        <input id="f-price" type="text" inputmode="decimal" autocomplete="off" placeholder="${avg != null ? `Media: ${num2(avg)}` : 'Sin indicar'}" value="${item.price != null ? esc(num2(item.price)) : ''}" /></div>
      <p class="hint">${avg != null ? `Si lo dejas vacío se usa la media de tus compras anteriores (${eur(avg)}/${esc(product.unit)}).` : 'Aún no hay historial de precio de este producto.'}</p>
      <div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div>
      <div class="actions"><button class="btn small" type="button" data-act="card">Ver ficha</button><button class="btn small danger" type="button" data-act="remove">Quitar de la lista</button></div>
    </form>`, (sheet) => {
    const qty = $('#f-qty', sheet);
    sheet.addEventListener('click', (e) => {
      const step = e.target.closest('[data-step]');
      const u = e.target.closest('[data-unit]');
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (step) {
        const st = UNIT_STEP[unit];
        const next = Math.round(((parseNum(qty.value) ?? 0) + Number(step.dataset.step) * st) * 1000) / 1000;
        qty.value = fq(Math.max(st, next));
      }
      if (u) {
        unit = u.dataset.unit;
        sheet.querySelectorAll('[data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b === u)));
        $('#f-unit', sheet).textContent = unit;
      }
      if (act === 'remove') { store.update((d) => removeItem(d, itemId)); closeSheet(); toast('Quitado de la lista.'); }
      if (act === 'card') { closeSheet(); productSheet(product.id); }
    });
    $('#item-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const q = parseNum(qty.value);
      if (q == null || q <= 0) return toast('La cantidad debe ser un número mayor que 0.');
      const raw = $('#f-price', sheet).value.trim();
      const pr = raw === '' ? null : parseNum(raw);
      if (raw !== '' && (pr == null || pr < 0)) return toast('El precio no es válido.');
      await store.update((d) => {
        const it = d.items.find((i) => i.id === itemId);
        const pd = d.products.find((p) => p.id === it?.productId);
        if (!it || !pd) return;
        it.qty = q;
        it.price = pr;
        pd.unit = unit;
      });
      closeSheet();
    });
    qty.focus({ preventScroll: true });
    qty.select();
  });
}

function rowMenu(itemId) {
  const item = itemOf(itemId);
  const product = item && productById(item.productId);
  if (!product) return;
  openSheet(`<h2>${esc(product.name)}</h2><div class="stack">
    ${item.status === 'na' ? '<button class="btn block" data-act="pending">Volver a pendiente</button>' : '<button class="btn block" data-act="na">Marcar como no disponible</button>'}
    <button class="btn block" data-act="edit">Cantidad y precio</button>
    <button class="btn block" data-act="card">Ver ficha del producto</button>
    <button class="btn block danger" data-act="remove">Quitar de la lista</button>
    <button class="btn block" data-sheet="close">Cerrar</button></div>`, (sheet) => {
    sheet.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      closeSheet();
      if (act === 'na') await store.update((d) => setStatus(d, itemId, 'na'));
      if (act === 'pending') await store.update((d) => setStatus(d, itemId, 'pending'));
      if (act === 'edit') itemSheet(itemId);
      if (act === 'card') productSheet(product.id);
      if (act === 'remove') { await store.update((d) => removeItem(d, itemId)); toast('Quitado de la lista.'); }
    });
  });
}

/* ---------- ficha de un habitual ---------- */
function productSheet(productId) {
  const d = store.state;
  const existing = productId ? productById(productId) : null;
  const draft = existing ? structuredClone(existing) : createProduct({ name: '' });
  const actives = activeStores(d.stores);
  const histRows = () => {
    const rows = [...draft.history].sort((a, b) => (a.date < b.date ? 1 : -1)).map((h) => `<tr><td>${fmtDate(h.date)}</td><td>${esc(h.storeName || '—')}</td><td class="num">${fq(h.qty)}</td><td class="num">${Number.isFinite(h.price) ? eur(h.price) : '—'}</td><td><button type="button" data-del="${esc(h.id)}" aria-label="Eliminar esta compra del historial">✕</button></td></tr>`).join('');
    return rows ? `<table class="hist"><tr><th>Fecha</th><th>Súper</th><th class="num">Cant.</th><th class="num">Precio/${esc(draft.unit)}</th><th></th></tr>${rows}</table>` : '<p class="hint">Sin compras registradas todavía.</p>';
  };
  const prefRows = () => actives.map((s) => {
    const v = draft.prefs[s.id] ?? 'v';
    return `<div class="line"><span class="nm">${storeIcon(s)}<span>${esc(s.name)}</span></span><button type="button" class="lvl" data-pref="${esc(s.id)}" data-v="${v}">${LEVEL_LABEL[v]}</button></div>`;
  }).join('');
  openSheet(`<h2>${existing ? 'Ficha del producto' : 'Nuevo habitual'}</h2>
    <form id="prod-form" novalidate>
      <div class="field"><label for="p-name">Nombre</label><input id="p-name" type="text" maxlength="120" autocomplete="off" value="${esc(draft.name)}" ${existing ? '' : 'autofocus'} /></div>
      <div class="field"><span class="lbl">Unidad habitual</span><div class="seg wide" role="group" aria-label="Unidad">${UNITS.map((u) => `<button type="button" data-unit="${u}" aria-pressed="${u === draft.unit}">${u}</button>`).join('')}</div></div>
      <div class="field"><span class="lbl">Dónde prefieres comprarlo</span><p class="hint" style="margin:0">Toca para cambiar: válido → preferido → no válido. Un súper sin marcar equivale a «válido».</p><div id="p-prefs">${prefRows()}</div></div>
      <div class="field"><span class="lbl">Historial de compras</span><div id="p-hist">${histRows()}</div>
        <details class="fold"><summary>＋ Añadir una compra al historial</summary>
          <div class="field"><label for="h-date">Fecha</label><input id="h-date" type="date" value="${today()}" /></div>
          <div class="field"><label for="h-store">Súper</label><select id="h-store"><option value="">Sin indicar</option>${actives.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="h-qty">Cantidad</label><input id="h-qty" type="text" inputmode="decimal" value="1" /></div>
          <div class="field"><label for="h-price">Precio por unidad (opcional)</label><input id="h-price" type="text" inputmode="decimal" placeholder="2,40" /></div>
          <button type="button" class="btn small" id="h-add">Añadir al historial</button></details></div>
      <div class="actions"><button class="btn primary grow" type="submit">Guardar</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div>
      ${existing ? '<div class="actions"><button class="btn small danger" type="button" data-act="delete">Eliminar producto</button></div>' : ''}
    </form>`, (sheet) => {
    sheet.addEventListener('click', (e) => {
      const pref = e.target.closest('[data-pref]');
      const u = e.target.closest('[data-unit]');
      const del = e.target.closest('[data-del]');
      if (pref) {
        const id = pref.dataset.pref;
        const next = NEXT_LEVEL[draft.prefs[id] ?? 'v'];
        if (next === 'v') delete draft.prefs[id]; else draft.prefs[id] = next;
        pref.dataset.v = next;
        pref.textContent = LEVEL_LABEL[next];
      }
      if (u) {
        draft.unit = u.dataset.unit;
        sheet.querySelectorAll('[data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b === u)));
        $('#p-hist', sheet).innerHTML = histRows();
      }
      if (del) { draft.history = draft.history.filter((h) => h.id !== del.dataset.del); $('#p-hist', sheet).innerHTML = histRows(); }
      if (e.target.closest('#h-add')) {
        const date = $('#h-date', sheet).value;
        const qty = parseNum($('#h-qty', sheet).value);
        const rawPrice = $('#h-price', sheet).value.trim();
        const price = rawPrice === '' ? null : parseNum(rawPrice);
        if (!date) return toast('Indica la fecha.');
        if (qty == null || qty <= 0) return toast('La cantidad no es válida.');
        if (rawPrice !== '' && (price == null || price < 0)) return toast('El precio no es válido.');
        const st = storeById(d.stores, $('#h-store', sheet).value);
        draft.history.push(createHistoryEntry({ date, storeId: st?.id ?? '', storeName: st?.name ?? '', qty, price }));
        $('#p-hist', sheet).innerHTML = histRows();
        toast('Añadido al historial (se guarda al pulsar Guardar).');
      }
      if (e.target.closest('[data-act=delete]')) {
        if (!confirm(`¿Eliminar «${existing.name}» de tus habituales? También saldrá de la lista y se perderá su historial.`)) return;
        store.update((dr) => { dr.products = dr.products.filter((p) => p.id !== productId); });
        closeSheet();
        toast('Producto eliminado.');
      }
    });
    $('#prod-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#p-name', sheet).value.trim();
      if (!name) return toast('Escribe un nombre.');
      const dup = store.state.products.find((p) => p.id !== draft.id && norm(p.name) === norm(name));
      if (dup) return toast('Ya existe un producto con ese nombre.');
      draft.name = name;
      await store.update((dr) => {
        const i = dr.products.findIndex((p) => p.id === draft.id);
        if (i >= 0) dr.products[i] = draft; else dr.products.push(draft);
      });
      closeSheet();
    });
  });
}

/* ---------- súpers ---------- */
function storeSheet(id) {
  const existing = id ? storeById(store.state.stores, id) : null;
  openSheet(`<h2>${existing ? 'Editar supermercado' : 'Nuevo supermercado'}</h2>
    <form id="store-form" novalidate><div class="field"><label for="s-name">Nombre</label><input id="s-name" type="text" maxlength="40" autocomplete="off" value="${esc(existing?.name ?? '')}" autofocus /></div>
      <div class="actions"><button class="btn primary grow" type="submit">${existing ? 'Guardar' : 'Crear'}</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div>
      ${existing ? '<div class="actions"><button class="btn small danger" type="button" data-act="delete">Eliminar</button></div>' : ''}</form>`, (sheet) => {
    $('#store-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = $('#s-name', sheet).value.trim();
      if (!name) return toast('Escribe un nombre.');
      if (store.state.stores.some((s) => s.id !== id && norm(s.name) === norm(name))) return toast('Ya existe un supermercado con ese nombre.');
      await store.update((d) => {
        if (existing) {
          const s = d.stores.find((x) => x.id === id);
          s.name = name.slice(0, 40);
        } else d.stores.push(createCustomStore(name));
      });
      closeSheet();
    });
    sheet.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar «${existing.name}»? Las compras ya registradas conservarán su nombre.`)) return;
      await store.update((d) => { d.stores = d.stores.filter((s) => s.id !== id); });
      closeSheet();
    });
  });
}

/* ---------- finalizar compra ---------- */
function finishSheet() {
  const d = store.state;
  const L = buildList(d, d.settings.viewStore, d.settings.sort, d.settings.thresholdPct);
  if (!L.counts.done) return toast('Aún no has marcado nada como comprado.');
  const def = d.settings.viewStore !== 'all' ? d.settings.viewStore : d.settings.lastStore;
  const opts = `<option value="">Sin indicar</option>${activeStores(d.stores).map((s) => `<option value="${esc(s.id)}" ${s.id === def ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}`;
  openSheet(`<h2>Finalizar compra</h2>
    <p><b>${L.counts.done}</b> comprado${L.counts.done === 1 ? '' : 's'} · <b>${eur(L.totals.got)}</b> (los que tienen precio)<br>
    ${L.counts.na ? `${L.counts.na} no disponible${L.counts.na === 1 ? '' : 's'} vuelven a pendiente · ` : ''}${L.counts.pending ? `${L.counts.pending} pendiente${L.counts.pending === 1 ? '' : 's'} se mantienen` : 'no queda nada pendiente'}</p>
    <div class="field"><label for="fin-store">¿En qué súper has comprado?</label><select id="fin-store">${opts}</select></div>
    <div class="actions"><button class="btn ok grow" id="fin-ok">Finalizar</button><button class="btn" data-sheet="close">Cancelar</button></div>`, (sheet) => {
    $('#fin-ok', sheet).addEventListener('click', async () => {
      const storeId = $('#fin-store', sheet).value;
      const prev = structuredClone(store.state);
      const r = await store.update((dr) => finalize(dr, { storeId, date: today() }));
      closeSheet();
      if (r) toast(`Compra guardada: ${r.bought} producto${r.bought === 1 ? '' : 's'}${r.total ? ` · ${eur(r.total)}` : ''}.`, 'Deshacer', () => store.update(() => prev));
    });
  });
}

/* ---------- copias, exportar e importar ---------- */
async function doExport() {
  const json = store.exportJson();
  const name = `shopping-list-${today()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  try {
    let shared = false;
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Copia de Lista de la compra' });
        shared = true;
      } catch (err) {
        if (err?.name === 'AbortError') return; // el usuario cerró la hoja de compartir
        // Algunos navegadores (p. ej. Edge en Windows) anuncian que pueden compartir ficheros y luego fallan: se descarga.
      }
    }
    if (!shared) download();
    await store.markExported();
    toast(shared ? 'Copia exportada.' : `Copia descargada: ${name}`);
  } catch (err) {
    toast(`No se pudo exportar: ${err.message}`);
  }
}

function importSheet() {
  openSheet(`<h2>Importar copia</h2><form id="imp-form"><div class="field"><label for="imp-file">Fichero .json exportado</label><input id="imp-file" type="file" accept="application/json,.json" /></div>
    <div class="field"><label for="imp-mode">¿Qué hacer con lo importado?</label><select id="imp-mode"><option value="merge">Fusionar: añadir lo que falte, sin tocar lo actual</option><option value="replace">Reemplazar todo (se guarda una copia antes)</option></select></div>
    <div class="actions"><button class="btn primary grow" type="submit">Importar</button><button class="btn" type="button" data-sheet="close">Cancelar</button></div></form>`, (sheet) => {
    $('#imp-form', sheet).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = $('#imp-file', sheet).files[0];
      if (!f) return toast('Elige un fichero.');
      try {
        const r = await store.importJson(await f.text(), $('#imp-mode', sheet).value);
        closeSheet(); toast(`Importado. Ahora hay ${r.products} productos.`);
      } catch (err) { toast(err.message); }
    });
  });
}

async function backupsSheet() {
  const list = await store.listBackups();
  openSheet(`<h2>Copias automáticas</h2><p class="hint">Se guardan una al día y antes de migrar, importar o restaurar (las últimas 7). Restaurar guarda antes el estado actual.</p>
    ${list.length ? list.map((b) => `<div class="line"><span>${fmtStamp(b.createdAt)}<br><small style="color:var(--muted)">${esc(b.reason)} · ${b.products} productos</small></span><button class="btn small" data-restore="${esc(b.key)}">Restaurar</button></div>`).join('') : '<p>Todavía no hay copias.</p>'}
    <div class="actions"><button class="btn" data-sheet="close">Cerrar</button></div>`, (sheet) => {
    sheet.addEventListener('click', async (e) => {
      const key = e.target.closest('[data-restore]')?.dataset.restore;
      if (!key) return;
      try { await store.restoreBackup(key); closeSheet(); toast('Copia restaurada.'); } catch (err) { toast(err.message); }
    });
  });
}

/* ---------- eventos ---------- */
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('#sheet-root')) return;
  const { action, id, v } = el.dataset;
  const set = (fn) => store.update(fn);
  switch (action) {
    case 'tab': ui.view = v; render(); window.scrollTo(0, 0); break;
    case 'store': await set((d) => { d.settings.viewStore = id; }); ui.showHidden = false; break;
    case 'sort': await set((d) => { d.settings.sort = nextSort(d.settings.sort); }); break;
    case 'toggle': {
      const it = itemOf(id);
      if (it) await set((d) => setStatus(d, id, it.status === 'pending' ? 'done' : 'pending'));
      break;
    }
    case 'edit': itemSheet(id); break;
    case 'menu': rowMenu(id); break;
    case 'toggle-hidden': ui.showHidden = !ui.showHidden; render(); break;
    case 'add-text': await submitText(); break;
    case 'add-product': await addProductToList(id); break;
    case 'create-add': await createAndAdd(ui.q); break;
    case 'pick-habituals': habitualsPicker(); break;
    case 'finish': finishSheet(); break;
    case 'product': productSheet(id); break;
    case 'new-product': productSheet(null); break;
    case 'quick-add': { const r = await store.update((d) => addItem(d, id)); toast(r === 'exists' ? 'Ya está en la lista.' : 'Añadido a la compra.'); break; }
    case 'hide': case 'unhide': {
      const hide = action === 'hide';
      const prev = structuredClone(store.state);
      await store.update((d) => setHidden(d, id, hide));
      toast(hide ? 'Ocultado (reaparece al finalizar la compra).' : 'Mostrado de nuevo.', 'Deshacer', () => store.update(() => prev));
      break;
    }
    case 'hab-filter': await set((d) => { d.settings.habFilter = v; }); break;
    case 'hab-sort': await set((d) => { d.settings.habSort = d.settings.habSort === 'az' ? 'last' : 'az'; }); break;
    case 'stat-product': priceSheet(id); break;
    case 'toggle-store': await set((d) => { const s = d.stores.find((x) => x.id === id); if (s) s.active = !s.active; }); break;
    case 'edit-store': storeSheet(id); break;
    case 'new-store': storeSheet(null); break;
    case 'threshold': await set((d) => { d.settings.thresholdPct = Number(v); }); break;
    case 'theme': await set((d) => { d.settings.theme = v; }); break;
    case 'export': await doExport(); break;
    case 'import': importSheet(); break;
    case 'backups': await backupsSheet(); break;
    default: break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { ui.q = e.target.value; renderSugg(); }
  if (e.target.id === 'hq') { ui.hq = e.target.value; render(); }
  if (e.target.id === 'sq') { ui.sq = e.target.value; render(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'q' && e.key === 'Enter') { e.preventDefault(); submitText(); }
});

/* ---------- arranque ---------- */
async function boot() {
  let adapter;
  try {
    adapter = indexedDbAdapter();
    await adapter.get('probe');
  } catch {
    adapter = memoryAdapter();
    ui.storageWarning = 'Este navegador no permite guardar datos (¿modo privado?). Lo que añadas se perderá al cerrar. Exporta una copia.';
  }
  store = createStore(adapter);
  try {
    const info = await store.load();
    if (info.migratedFrom !== null) toast('Datos actualizados a la nueva versión (copia previa guardada).');
  } catch (err) {
    $('#app').innerHTML = `<div class="fatal"><h1>No se pueden abrir los datos</h1><p>${esc(err.message)}</p><p>No se ha modificado nada.</p></div>`;
    return;
  }
  store.subscribe(render);
  try { ui.persisted = (await navigator.storage?.persist?.()) ?? null; } catch { ui.persisted = null; }
  render();
  store.autoBackup().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
if (FAKE_OK) window.__store = () => store;
