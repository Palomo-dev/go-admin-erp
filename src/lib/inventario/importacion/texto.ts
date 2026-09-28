/**
 * Normalizadores de texto y números que comparten todos los importadores de
 * productos: el asistente de importación (archivo y web) y la carga masiva del
 * GO Assistant (`src/lib/ai/agent/tools/cargaMasiva.ts`). Una sola definición:
 * antes había cuatro normalizadores de nombre y dos de cabecera distintos
 * (INVENTARIO-PRODUCTOS-Y-POS.md §2.6).
 *
 * Módulo puro: sirve en navegador, servidor y tests.
 */

/** "Código de barras" → "codigodebarras". Para comparar cabeceras. */
export function normalizarCabecera(h: unknown): string {
  return String(h ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Nombre comparable: minúsculas, sin tildes, signos → espacio, espacios
 * colapsados. «  Café  Premium! » → «cafe premium».
 */
export function normalizarNombre(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Slug sin tildes con guiones: «Ropa de Niños» → «ropa-de-ninos». */
export function slugificar(s: unknown): string {
  return normalizarNombre(s).replace(/\s+/g, '-');
}

/**
 * "1.234,50", "1,234.50", "$ 12.000", "12.000" (doce mil en Colombia) → número.
 * `null` si no hay número.
 */
export function parseNumero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma > -1 && punto > -1) {
    // El último separador es el decimal; el otro, de miles.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma > -1) {
    // Solo comas: si hay exactamente 3 dígitos detrás, son miles ("12,000").
    s = /,\d{3}$/.test(s) && s.split(',').length === 2 ? s.replace(',', '') : s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (punto > -1) {
    if (s.split('.').length > 2) {
      // "1.299.900": varios puntos solo pueden ser miles.
      s = s.replace(/\./g, '');
    } else if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(s)) {
      // "12.000" y "1.500" en Colombia son miles; "12.50" y "0.500" no llegan aquí.
      s = s.replace('.', '');
    }
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** «Sí», «si», «true», «1», «x», «verdadero», «yes» → true; «no», «false», «0» → false. */
export function parseBooleano(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = normalizarNombre(v);
  if (!s) return undefined;
  if (['si', 'true', '1', 'x', 'verdadero', 'yes', 'y', 's', 'oui', 'sim', 'vrai'].includes(s)) return true;
  if (['no', 'false', '0', 'falso', 'n', 'non', 'nao', 'faux'].includes(s)) return false;
  return undefined;
}

/** Texto de celda limpio o `undefined` si está vacía. */
export function textoCelda(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
}
