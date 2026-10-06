/**
 * Unidades de peso: la ÚNICA conversión de la caja, el ticket, la pantalla del
 * cliente y la báscula (docs/design/PRODUCTOS-POR-PESO-BASCULA.md). En la base
 * la repite `fn_peso_convertir` con las mismas constantes.
 *
 * Estándar de los POS de pesaje:
 * - Un producto por peso guarda su cantidad en su unidad de inventario: GR
 *   (gramos enteros), KG o LB (3 decimales). El precio se guarda por esa unidad.
 * - Se lee y se muestra legible: menos de 1 kg en gramos («735 g»), desde 1 kg
 *   en kilos («1,250 kg»). Un producto en libras se muestra en libras
 *   («1,500 lb»), porque su precio es por libra y el cliente tiene que poder
 *   comprobar peso × precio en el ticket.
 * - El precio se muestra por kg («$ 12.000/kg»), salvo en libras («/lb»).
 *
 * 1 kg = 1000 g y 1 lb = 453,59237 g (definición internacional, exacta).
 * TypeScript puro (lo compilan el agente y Next.js): solo `Intl`.
 */

/** GR, KG y LB son unidades de producto; OZ solo llega de algunas básculas. */
export type UnidadPeso = 'GR' | 'KG' | 'LB' | 'OZ';

/** Gramos que contiene una unidad de peso. */
export const GRAMOS_POR_UNIDAD: Readonly<Record<UnidadPeso, number>> = { GR: 1, KG: 1000, LB: 453.59237, OZ: 28.349523125 };

/** Alias que llegan de `units` (relleno de char(4)), de la báscula o del símbolo impreso. */
const ALIAS: Record<string, UnidadPeso> = { GR: 'GR', G: 'GR', KG: 'KG', LB: 'LB', LBS: 'LB', OZ: 'OZ' };

/** «GR», «g», «KG  », «kg», «lb» → código de peso; null si no es una unidad de peso. */
export function unidadPeso(unidad: string | null | undefined): UnidadPeso | null {
  return ALIAS[(unidad ?? '').trim().toUpperCase()] ?? null;
}

/** Decimales de la cantidad en esa unidad: gramos enteros, kg y lb con 3 decimales. */
export function decimalesPeso(unidad: string | null | undefined): number {
  return unidadPeso(unidad) === 'GR' ? 0 : 3;
}

/** Convierte un peso entre unidades (sin redondear); null si alguna no es de peso. */
export function convertirPeso(valor: number, de: string | null | undefined, a: string | null | undefined): number | null {
  const d = unidadPeso(de);
  const h = unidadPeso(a);
  if (!d || !h) return null;
  if (d === h) return valor;
  return (valor * GRAMOS_POR_UNIDAD[d]) / GRAMOS_POR_UNIDAD[h];
}

/** Redondeo medio hacia arriba a `d` decimales, por texto (0,7355 × 1000 da 735,4999… en binario). */
export function redondearPeso(valor: number, d: number): number {
  const n = Number(valor) || 0;
  const dec = Math.max(0, Math.min(3, Math.trunc(d)));
  return Math.sign(n) * Number(`${Math.round(Number(`${Math.abs(n)}e${dec}`))}e-${dec}`);
}

/** Convierte a la unidad del producto y redondea a sus decimales (0,735 kg → 735 g). */
export function pesoEnUnidad(valor: number, de: string | null | undefined, a: string | null | undefined): number | null {
  const v = convertirPeso(valor, de, a);
  return v === null ? null : redondearPeso(v, decimalesPeso(a));
}

function seguro(locale?: string): string {
  const l = locale || 'es-CO';
  try {
    new Intl.NumberFormat(l);
    return l;
  } catch {
    return 'es-CO';
  }
}

/**
 * Peso legible: «735 g», «1,250 kg», «1,500 lb». `null` si la unidad no es de
 * peso (quien llama decide cómo pintar las demás).
 */
export function pesoLegible(valor: number, unidad: string | null | undefined, locale?: string): string | null {
  const u = unidadPeso(unidad);
  if (!u) return null;
  const loc = seguro(locale);
  const n = Number(valor) || 0;
  const fmt = (x: number, d: number, simbolo: string) =>
    `${new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d }).format(x)} ${simbolo}`.replace(/[  ]/g, ' ');
  if (u === 'LB') return fmt(redondearPeso(n, 3), 3, 'lb');
  const gramos = redondearPeso(convertirPeso(n, u, 'GR') ?? 0, 0);
  return Math.abs(gramos) < 1000 ? fmt(gramos, 0, 'g') : fmt(redondearPeso(gramos / 1000, 3), 3, 'kg');
}

/**
 * Precio que se muestra por la unidad de referencia: por kg (GR y KG) o por lb.
 * 12 por gramo → { precio: 12000, unidad: 'kg' }. `null` si no es de peso.
 */
export function precioVisiblePeso(
  precioPorUnidad: number,
  unidad: string | null | undefined,
): { precio: number; unidad: 'kg' | 'lb' } | null {
  const u = unidadPeso(unidad);
  if (!u) return null;
  const p = Number(precioPorUnidad) || 0;
  if (u === 'LB') return { precio: p, unidad: 'lb' };
  // Precio por kg = precio por unidad × unidades que caben en un kg (redondeo de centavos).
  return { precio: Math.round(((p * 1000) / GRAMOS_POR_UNIDAD[u]) * 100) / 100, unidad: 'kg' };
}
