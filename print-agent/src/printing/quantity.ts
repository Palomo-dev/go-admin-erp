/**
 * Cantidad de una línea impresa (tiquete 80/58 mm, comanda, factura HTML y
 * ESC/POS). Un único formateador para todos los renderizadores, que antes
 * imprimían «${quantity}x» y «c/u» a mano: una venta por peso salía
 * «0.735x Queso» y «(0.735 unidades)».
 *
 * - Línea por unidad (sin `unit`): «3x Producto» y «$ 1.000 c/u», como siempre.
 * - Línea por peso o medida (con `unit`, p. ej. «kg»): «Queso» y
 *   «0,735 kg x $ 18.900/kg» (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.6).
 *
 * - Línea por peso (g, kg, lb): el peso legible de `./peso` («735 g»,
 *   «1,250 kg») y el precio por kg («735 g x $ 12.000/kg»), sea cual sea la
 *   unidad en que se guardó (gramos, kilos). Un agente viejo, sin este
 *   archivo, imprime «735 g x $ 12/g»: la misma cuenta, menos legible.
 *
 * TypeScript puro (se compila con el agente y con Next.js): solo `Intl`.
 */

import { pesoLegible, precioVisiblePeso, unidadPeso } from './peso';

export interface QuantityLine {
  quantity: number;
  /** Símbolo de la unidad de venta («kg», «lb», «m», «L») solo en líneas por peso o medida. */
  unit?: string | null;
  /** Decimales de la cantidad del producto (3 en kg). */
  qtyDecimals?: number | null;
}

const DEFAULT_LOCALE = 'es-CO';

function safeLocale(locale?: string): string {
  const l = locale || DEFAULT_LOCALE;
  try {
    new Intl.NumberFormat(l);
    return l;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** ¿La línea se vende por peso o medida? */
export function isMeasuredLine(item: QuantityLine): boolean {
  return !!(item.unit && item.unit.trim());
}

/**
 * Cantidad sola, con los decimales del producto: «0,735 kg», «2,50 m», «3».
 * Una cantidad por unidad con decimales (dato viejo) muestra hasta 3.
 */
export function formatQuantity(item: QuantityLine, locale?: string): string {
  const q = num(item.quantity);
  const loc = safeLocale(locale);
  const peso = isMeasuredLine(item) ? pesoLegible(q, item.unit, loc) : null;
  if (peso !== null) return peso;
  if (isMeasuredLine(item)) {
    const d = Math.max(0, Math.min(3, Math.trunc(num(item.qtyDecimals ?? 3))));
    const text = new Intl.NumberFormat(loc, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true }).format(q);
    return `${text} ${String(item.unit).trim()}`.replace(/[  ]/g, ' ');
  }
  return new Intl.NumberFormat(loc, { maximumFractionDigits: 3, useGrouping: false }).format(q);
}

/** Prefijo del nombre en la línea: «3x » por unidad; nada por peso (la cantidad va en el detalle). */
export function lineNamePrefix(item: QuantityLine, locale?: string): string {
  return isMeasuredLine(item) ? '' : `${formatQuantity(item, locale)}x `;
}

/**
 * Detalle del precio: «$ 1.000 c/u» por unidad; «0,735 kg x $ 18.900/kg» por peso.
 * `money` es el formateador del documento (con o sin símbolo).
 */
export function linePriceDetail(item: QuantityLine & { unitPrice: number }, money: (n: number) => string, locale?: string): string {
  if (!isMeasuredLine(item)) return `${money(num(item.unitPrice))} c/u`;
  const ref = precioVisiblePeso(num(item.unitPrice), item.unit);
  if (ref) return `${formatQuantity(item, locale)} x ${money(ref.precio)}/${ref.unidad}`;
  return `${formatQuantity(item, locale)} x ${money(num(item.unitPrice))}/${String(item.unit).trim()}`;
}

/**
 * Resumen de ítems de la cabecera. Sin líneas por peso, el de siempre:
 * «3 (5 unidades)». Con líneas por peso: «4 líneas · 2 unidades · 3,235 kg».
 */
export function itemsSummary(items: QuantityLine[], locale?: string): string {
  const measured = items.filter(isMeasuredLine);
  const unitCount = items.filter((i) => !isMeasuredLine(i)).reduce((s, i) => s + num(i.quantity), 0);
  const unitText = new Intl.NumberFormat(safeLocale(locale), { maximumFractionDigits: 3, useGrouping: false }).format(unitCount);
  if (measured.length === 0) return `${items.length} (${unitText} unidades)`;
  const byUnit = new Map<string, { total: number; decimals: number }>();
  for (const i of measured) {
    // Gramos y kilos se suman juntos (en gramos) y se muestran legibles.
    const peso = unidadPeso(i.unit);
    const u = peso === 'GR' || peso === 'KG' ? 'g' : String(i.unit).trim();
    const q = peso === 'KG' ? num(i.quantity) * 1000 : num(i.quantity);
    const prev = byUnit.get(u) ?? { total: 0, decimals: 0 };
    byUnit.set(u, { total: prev.total + q, decimals: Math.max(prev.decimals, Math.trunc(num(i.qtyDecimals ?? 3))) });
  }
  const parts = [`${items.length} ${items.length === 1 ? 'línea' : 'líneas'}`];
  if (unitCount > 0) parts.push(`${unitText} ${unitCount === 1 ? 'unidad' : 'unidades'}`);
  for (const [u, v] of byUnit) parts.push(formatQuantity({ quantity: Math.round(v.total * 1000) / 1000, unit: u, qtyDecimals: v.decimals }, locale));
  return parts.join(' · ');
}
