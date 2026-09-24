/**
 * Color propio de una etiqueta de producto (`product_tags.color`). Siempre se
 * guarda en hex; unas pocas etiquetas viejas quedaron con una clase de
 * Tailwind (`bg-blue-500`) que ya no pinta nada: se muestran con su hex
 * equivalente. Es el único lugar donde se admite un hex fijo (el color lo
 * eligió el usuario, no es un color de la interfaz).
 */

export const COLORES_ETIQUETA = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#ef4444',
  '#06b6d4',
  '#84cc16',
  '#f97316',
] as const;

export const COLOR_ETIQUETA_POR_DEFECTO = COLORES_ETIQUETA[0];

/** Tono 500 de la paleta de Tailwind, para las etiquetas guardadas como clase. */
const TAILWIND_500: Record<string, string> = {
  slate: '#64748b',
  gray: '#6b7280',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c',
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function esHex(valor: string | null | undefined): boolean {
  return !!valor && HEX.test(valor.trim());
}

/** Hex para pintar el color guardado (hex, clase Tailwind o vacío). */
export function hexEtiqueta(color: string | null | undefined): string {
  const v = (color ?? '').trim();
  if (esHex(v)) return v.toLowerCase();
  const m = /^(?:bg|text|border)-([a-z]+)-\d{2,3}$/.exec(v);
  if (m && TAILWIND_500[m[1]]) return TAILWIND_500[m[1]];
  return '#94a3b8';
}

/** Normaliza lo que escribe el usuario en el campo hex («6366F1» → «#6366f1»). */
export function normalizarHex(valor: string): string | null {
  const v = valor.trim().replace(/^#?/, '#').toLowerCase();
  if (!esHex(v)) return null;
  if (v.length === 4) return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  return v;
}
