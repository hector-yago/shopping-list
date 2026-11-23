// Catálogo de supermercados (los principales de España + los que cree el usuario). Puro.
import { newId } from './format.js';

export const UNITS = Object.freeze(['ud', 'kg', 'g', 'l']);
/** Salto de los botones − / + de la cantidad, por unidad. */
export const UNIT_STEP = Object.freeze({ ud: 1, kg: 0.25, g: 100, l: 0.5 });

// Colores y siglas orientativos (no son logotipos oficiales).
const BASE = [
  ['mercadona', 'Mercadona', 'M', '#1f7a3a', true],
  ['carrefour', 'Carrefour', 'Cf', '#1d4ed8', true],
  ['lidl', 'Lidl', 'L', '#c2410c', true],
  ['dia', 'Dia', 'D', '#b91c1c', true],
  ['alcampo', 'Alcampo', 'Ac', '#dc2626', true],
  ['eroski', 'Eroski', 'E', '#be123c', true],
  ['aldi', 'Aldi', 'Ad', '#0369a1', true],
  ['consum', 'Consum', 'Cs', '#d97706', true],
  ['el-corte-ingles', 'El Corte Inglés / Hipercor', 'EC', '#15803d', false],
  ['ahorramas', 'Ahorramás', 'Ah', '#7c3aed', false],
  ['caprabo', 'Caprabo', 'Cp', '#0e7490', false],
  ['condis', 'Condis', 'Cd', '#a21caf', false],
  ['bonpreu', 'Bonpreu / Esclat', 'Bp', '#4d7c0f', false],
  ['gadis', 'Gadis', 'Gd', '#b45309', false],
  ['froiz', 'Froiz', 'Fz', '#0f766e', false],
];

export const DEFAULT_STORES = Object.freeze(BASE.map(([id, name, ini, color, active]) => Object.freeze({ id, name, ini, color, custom: false, active })));
const DEFAULT_IDS = new Set(BASE.map((b) => b[0]));
const PALETTE = ['#475569', '#0d9488', '#9333ea', '#ca8a04', '#db2777', '#2563eb', '#ea580c', '#65a30d'];

export function initialsOf(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0][0].toUpperCase() + (words[0][1] ?? '').toLowerCase();
}

export function colorFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function createCustomStore(name) {
  const n = String(name).trim().slice(0, 40);
  return { id: `c-${newId()}`, name: n, ini: initialsOf(n), color: colorFor(n), custom: true, active: true };
}

/** Garantiza que estén todos los súpers de la base (aunque el documento sea antiguo) y limpia los personalizados. */
export function normalizeStores(list) {
  const input = Array.isArray(list) ? list : [];
  const byId = new Map(input.filter((s) => s && typeof s.id === 'string').map((s) => [s.id, s]));
  const out = DEFAULT_STORES.map((d) => ({ ...d, active: byId.has(d.id) ? Boolean(byId.get(d.id).active) : d.active }));
  const seen = new Set(DEFAULT_IDS);
  for (const s of input) {
    const name = String(s?.name ?? '').trim().slice(0, 40);
    if (!s || DEFAULT_IDS.has(s.id) || typeof s.id !== 'string' || !s.id || seen.has(s.id) || !name) continue;
    seen.add(s.id);
    out.push({ id: s.id, name, ini: String(s.ini || initialsOf(name)).slice(0, 3), color: /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : colorFor(name), custom: true, active: Boolean(s.active) });
  }
  return out;
}

export const activeStores = (stores) => stores.filter((s) => s.active);
export const storeById = (stores, id) => stores.find((s) => s.id === id) ?? null;
