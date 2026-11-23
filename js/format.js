// Utilidades puras de formato y texto (sin DOM ni reloj).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 'AAAA-MM-DD' → 'DD/MM/AAAA'. */
export const fmtDate = (k) => (k ? `${k.slice(8, 10)}/${k.slice(5, 7)}/${k.slice(0, 4)}` : '');

/** Clave local 'AAAA-MM-DD' de una fecha. */
export function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const isValidKey = (k) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k) && !Number.isNaN(Date.parse(`${k}T00:00:00Z`)) && new Date(`${k}T00:00:00Z`).toISOString().slice(0, 10) === k;

/** Importe en euros con coma decimal: 9.8 → '9,80 €'. */
export const eur = (n) => `${(Math.round(n * 100) / 100).toFixed(2).replace('.', ',')} €`;

/** Número con dos decimales y coma, sin símbolo: 2.4 → '2,40'. */
export const num2 = (n) => (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');

/** Cantidad con coma decimal y sin ceros sobrantes: 0.5 → '0,5'. */
export const fq = (n) => String(+Number(n).toFixed(3)).replace('.', ',');

/** Número escrito por una persona ('0,5', '2.40') → número o null. */
export function parseNum(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (t === '' || !/^-?\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Minúsculas sin acentos, para buscar. */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const compareNames = (a, b) => String(a).localeCompare(String(b), 'es', { sensitivity: 'base' });

export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
