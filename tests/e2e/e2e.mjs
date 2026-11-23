// Prueba de extremo a extremo en Edge/Chrome headless (sin dependencias: CDP por WebSocket de Node 22).
// Uso: node tests/e2e/e2e.mjs [--shots=carpeta]   (por defecto no guarda capturas)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) throw new Error('No hay Edge ni Chrome instalados.');
const shots = process.argv.find((a) => a.startsWith('--shots='))?.slice(8);
if (shots) mkdirSync(shots, { recursive: true });

const PORT = 8198;
const CDP = 9334;
const profile = mkdtempSync(join(tmpdir(), 'sl-e2e-'));
const server = spawn(process.execPath, ['serve.mjs', String(PORT)], { stdio: 'ignore' });
const proc = spawn(browser, [`--remote-debugging-port=${CDP}`, `--user-data-dir=${profile}`, '--headless=new', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => { proc.kill(); server.kill(); try { rmSync(profile, { recursive: true, force: true }); } catch { /* en uso */ } };
process.on('exit', cleanup);

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
      const page = targets.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* aún arrancando */ }
    await sleep(250);
  }
  throw new Error('No se pudo conectar con el navegador.');
}

const ws = new WebSocket(await connect());
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result)));
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const goto = async (url) => { await send('Page.navigate', { url }); await sleep(1000); };
const shot = async (name) => {
  if (!shots) return;
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(shots, `${name}.png`), Buffer.from(data, 'base64'));
};
const click = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`);
const text = () => evaluate('document.body.innerText');
const rowOf = (name) => `[...document.querySelectorAll('#app .row')].find((r) => r.querySelector('.title')?.textContent.startsWith(${JSON.stringify(name)}))`;
const hasRow = (name) => evaluate(`!!(${rowOf(name)})`);
const tab = async (v) => { await click(`[data-action=tab][data-v=${v}]`); await sleep(150); };
const chip = async (storeId) => { await click(`[data-action=store][data-id=${storeId}]`); await sleep(200); };
const type = async (sel, value) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); })()`);

try {
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const base = `http://localhost:${PORT}/`;
  await goto(`${base}?hoy=2026-11-23`);
  assert.match(await text(), /La lista está vacía/i);
  assert.match(await text(), /Todos/);
  await shot('01-vacia');

  // Semilla: datos de ejemplo ficticios (historial para precios y estadísticas)
  await evaluate(`(async () => {
    const P = await import('./js/products.js');
    const L = await import('./js/list.js');
    await window.__store().update((d) => {
      const mk = (name, extra, hist = []) => {
        const p = P.createProduct({ name, ...extra });
        hist.forEach(([date, price, sid, sname, qty = 1, pid]) => p.history.push(P.createHistoryEntry({ date, storeId: sid, storeName: sname, qty, price, pid })));
        d.products.push(p);
        return p;
      };
      const leche = mk('Leche entera', { unit: 'ud', defaultQty: 6, prefs: { mercadona: 'p', lidl: 'p' } }, [['2026-10-05', 0.9, 'mercadona', 'Mercadona', 6, 'c1'], ['2026-11-02', 0.95, 'lidl', 'Lidl', 6, 'c2']]);
      const aceite = mk('Aceite de oliva', { unit: 'l', defaultQty: 1, prefs: { dia: 'n', mercadona: 'p' } }, [['2026-10-05', 8.2, 'mercadona', 'Mercadona', 1, 'c1'], ['2026-11-02', 8.4, 'lidl', 'Lidl', 1, 'c2']]);
      const manzanas = mk('Manzanas', { unit: 'kg', defaultQty: 0.5, prefs: {} }, [['2026-11-02', 2.1, 'lidl', 'Lidl', 0.5, 'c2']]);
      const papel = mk('Papel de cocina', { unit: 'ud', prefs: { dia: 'p' } });
      mk('Yogur natural', { unit: 'ud', prefs: {} });
      [leche, aceite, manzanas, papel].forEach((p) => L.addItem(d, p.id));
      d.items.find((i) => i.productId === aceite.id).price = 10.5; // caro vs. su media (8,30)
    });
  })()`);
  await sleep(250);
  let t = await text();
  for (const s of ['Leche entera', 'Aceite de oliva', 'Manzanas', 'Papel de cocina', 'Pendientes']) assert.match(t, new RegExp(s, 'i'), `falta «${s}»`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-action=store]').length`), 9, 'Todos + 8 súpers activos por defecto');
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-action=store]')].some((b) => /Condis/.test(b.textContent))`), false, 'Condis está desactivado por defecto');
  assert.match(await evaluate(`${rowOf('Aceite de oliva')}.innerText`), /caro/, 'el aceite debería marcarse como caro');
  assert.match(await evaluate(`${rowOf('Manzanas')}.innerText`), /≈ 1,05/, 'sin precio manual se usa la media (≈)');
  assert.match(await text(), /0\/4/);
  await shot('02-todos');

  // Iconos: «Todos» muestra los preferidos; en Mercadona la leche (preferida allí) no lleva icono; en Carrefour sí
  const icons = (name) => evaluate(`${rowOf(name)}.querySelectorAll('.ics .si').length`);
  assert.equal(await icons('Leche entera'), 2);
  await chip('mercadona');
  assert.equal(await icons('Leche entera'), 0, 'en Mercadona no se pone su propio icono');
  await chip('carrefour');
  assert.equal(await icons('Leche entera'), 2);
  await chip('lidl');
  assert.equal(await icons('Leche entera'), 0, 'en Lidl la leche también es preferida: sin icono');
  assert.equal(await icons('Aceite de oliva'), 1, 'en Lidl se ve el súper preferido del aceite (Mercadona)');
  assert.equal(await icons('Manzanas'), 0, 'sin preferido no hay icono');

  // No válido en Dia: el aceite no aparece entre los pendientes y queda la línea de ocultos
  await chip('dia');
  assert.equal(await hasRow('Aceite de oliva'), false);
  assert.match(await text(), /1 oculto en Dia/);
  assert.equal(await icons('Papel de cocina'), 0, 'en Dia el papel es el preferido');
  await shot('03-dia');
  await chip('all');

  // Marcar comprado y no disponible; el círculo cuenta comprados + no disponibles
  await evaluate(`${rowOf('Leche entera')}.querySelector('.check').click()`);
  await sleep(150);
  assert.match(await text(), /1\/4/);
  await evaluate(`${rowOf('Manzanas')}.querySelector('.more').click()`);
  await sleep(100);
  await evaluate(`[...document.querySelectorAll('#sheet-root [data-act]')].find((b) => b.dataset.act === 'na').click()`);
  await sleep(200);
  assert.match(await text(), /2\/4/);
  assert.match(await text(), /no disponibles/i);
  assert.equal(await evaluate(`document.querySelectorAll('#app section')[1] && true`), true);
  await shot('04-estados');

  // Editar cantidad decimal y precio desde la hoja
  await evaluate(`${rowOf('Papel de cocina')}.querySelector('.pbtn').click()`);
  await sleep(150);
  await shot('05-hoja-precio');
  await evaluate(`(() => { document.querySelector('#f-qty').value = '0,5'; document.querySelector('#sheet-root [data-unit=kg]').click(); document.querySelector('#f-price').value = '2,40'; document.querySelector('#item-form').requestSubmit(); })()`);
  await sleep(250);
  const papel = await evaluate(`${rowOf('Papel de cocina')}.innerText`);
  assert.match(papel, /0,5 kg × 2,40/);
  assert.match(papel, /1,20/);

  // Añadir con el buscador: un habitual (1 toque) y uno nuevo (Enter)
  await type('#q', 'yog');
  await sleep(100);
  assert.match(await evaluate(`document.querySelector('#sugg').innerText`), /Yogur natural/);
  await click('#sugg [data-action=add-product]');
  await sleep(200);
  assert.equal(await hasRow('Yogur natural'), true);
  await type('#q', 'Galletas');
  await evaluate(`document.querySelector('#q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(250);
  assert.equal(await hasRow('Galletas'), true);
  assert.equal(await evaluate(`window.__store().state.products.some((p) => p.name === 'Galletas')`), true, 'el producto nuevo pasa a habituales');
  await type('#q', 'yogur natural');
  await sleep(100);
  assert.match(await evaluate(`document.querySelector('#sugg').innerText`), /ya está en la lista/);
  await type('#q', '');

  // Finalizar: lo comprado va al historial y sale de la lista; lo no disponible vuelve a pendiente
  await evaluate(`${rowOf('Papel de cocina')}.querySelector('.check').click()`);
  await sleep(150);
  await click('[data-action=finish]');
  await sleep(200);
  await shot('06-finalizar');
  await evaluate(`document.querySelector('#fin-store').value = 'lidl'; document.querySelector('#fin-ok').click()`);
  await sleep(300);
  assert.equal(await hasRow('Leche entera'), false);
  assert.equal(await hasRow('Papel de cocina'), false);
  assert.equal(await evaluate(`${rowOf('Manzanas')}.classList.contains('na')`), false, 'la no disponible vuelve a pendiente');
  const leche = await evaluate(`JSON.stringify(window.__store().state.products.find((p) => p.name === 'Leche entera').history.at(-1))`);
  assert.match(leche, /"storeId":"lidl"/);
  assert.match(leche, /"date":"2026-11-23"/);

  // Estadísticas
  await tab('stats');
  t = await text();
  assert.match(t, /últimas compras/i);
  assert.match(t, /23\/11\/2026 · Lidl/);
  assert.match(t, /Leche entera/);
  await shot('07-estadisticas');
  await click('[data-action=stat-product]');
  await sleep(150);
  assert.ok(await evaluate(`!!document.querySelector('#sheet-root svg.spark')`), 'falta el gráfico de precios');
  await shot('08-precio-producto');
  await click('#sheet-root [data-sheet=close]');

  // Habituales: ficha con preferencias e historial
  await tab('habituales');
  await evaluate(`[...document.querySelectorAll('[data-action=product]')].find((b) => b.innerText.startsWith('Aceite')).click()`);
  await sleep(150);
  assert.match(await evaluate(`document.querySelector('#sheet-root').innerText`), /No válido/);
  await shot('09-ficha');
  await click('#sheet-root [data-sheet=close]');
  await shot('10-habituales');

  // Súpers: desactivar uno y crear otro
  await tab('supers');
  await click('[data-action=toggle-store][data-id=aldi]');
  await sleep(150);
  await click('[data-action=new-store]');
  await sleep(100);
  await evaluate(`document.querySelector('#s-name').value = 'Frutería Juani'; document.querySelector('#store-form').requestSubmit()`);
  await sleep(250);
  await shot('11-supers');
  await tab('actual');
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-action=store]')].some((b) => /Aldi/.test(b.textContent))`), false, 'Aldi desactivado no sale');
  assert.equal(await evaluate(`[...document.querySelectorAll('[data-action=store]')].some((b) => /Frutería Juani/.test(b.textContent))`), true, 'el súper creado sale');

  // Persistencia tras recargar y orden por última compra
  await goto(`${base}?hoy=2026-11-23`);
  assert.equal(await hasRow('Galletas'), true, 'los datos no persisten tras recargar');
  await click('[data-action=sort]');
  await sleep(200);
  assert.match(await evaluate(`document.querySelector('[data-action=sort]').innerText`), /Última compra ↑/);
  await click('[data-action=sort]');
  await click('[data-action=sort]');
  assert.match(await evaluate(`document.querySelector('[data-action=sort]').innerText`), /A–Z/);

  // Tema oscuro
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await sleep(150);
  await shot('12-actual-oscuro');
  await tab('stats');
  await shot('13-estadisticas-oscuro');

  // Exportar → contenido válido; service worker y manifiesto
  const exported = JSON.parse(await evaluate(`window.__store().exportJson()`));
  assert.equal(exported.app, 'shopping-list');
  assert.ok(exported.data.products.length >= 6);
  assert.equal(await evaluate(`navigator.serviceWorker.ready.then((r) => !!r.active)`), true, 'el service worker no se activó');
  assert.ok((await evaluate(`fetch('manifest.webmanifest').then((r) => r.json()).then((j) => j.icons.length)`)) >= 3);
  console.log('E2E correcto');
} finally {
  cleanup();
}
process.exit(0);
