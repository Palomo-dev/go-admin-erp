/**
 * Pesada en curso en la pantalla del cliente (docs/design/PRODUCTOS-POR-PESO-BASCULA.md
 * §2.6): «Pesando: 0,735 kg × $ 18.900 / kg = $ 13.892» mientras «Pesar» está
 * abierto en la caja.
 *
 * Puro y sin navegador: lo usan la caja (al construir lo que emite), la
 * pantalla (al sanear lo que recibe) y los tests. Nunca lanza.
 */

import { pesoLegible, precioVisiblePeso } from '@printing/peso';
import type { DisplayWeighing } from './protocol';

function finito(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
}

function decimales(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 3;
}

export interface EntradaPesada {
  name: string | null | undefined;
  /** Cantidad válida (ya redondeada a los decimales del producto) o null mientras no hay peso. */
  qty: number | null | undefined;
  unit: string | null | undefined;
  decimals: number | null | undefined;
  unitPrice: number | null | undefined;
  /** Decimales de la moneda de la organización (`currencies.decimals`). */
  moneyDecimals?: number | null;
}

/** Lo que la caja emite. `null` si falta el nombre o el precio no es un número. */
export function buildDisplayWeighing(e: EntradaPesada): DisplayWeighing | null {
  const name = typeof e.name === 'string' ? e.name.trim() : '';
  const unitPrice = finito(e.unitPrice);
  if (!name || unitPrice === null || unitPrice < 0) return null;
  const q = finito(e.qty);
  const qty = q !== null && q > 0 ? q : null;
  return {
    name,
    qty,
    unit: typeof e.unit === 'string' ? e.unit.trim() : '',
    decimals: decimales(e.decimals),
    unitPrice,
    // Importe exacto, como la línea del carrito: se redondea solo al formatear.
    total: qty === null ? 0 : qty * unitPrice,
    ...(e.moneyDecimals != null && Number.isFinite(Number(e.moneyDecimals))
      ? { moneyDecimals: Math.max(0, Math.min(4, Math.trunc(Number(e.moneyDecimals)))) }
      : {}),
  };
}

/** Lo que la pantalla acepta de la caja (defensa por campo, como el resto de logic.ts). */
export function sanitizeDisplayWeighing(value: unknown): DisplayWeighing | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return buildDisplayWeighing({
    name: typeof v.name === 'string' ? v.name : null,
    qty: typeof v.qty === 'number' ? v.qty : null,
    unit: typeof v.unit === 'string' ? v.unit : null,
    decimals: typeof v.decimals === 'number' ? v.decimals : null,
    unitPrice: typeof v.unitPrice === 'number' ? v.unitPrice : null,
    moneyDecimals: typeof v.moneyDecimals === 'number' ? v.moneyDecimals : null,
  });
}

/** ¿Dos pesadas pintan lo mismo? (para no reemitir en cada render de la caja). */
export function sameWeighing(a: DisplayWeighing | null, b: DisplayWeighing | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.name === b.name &&
    a.qty === b.qty &&
    a.unit === b.unit &&
    a.decimals === b.decimals &&
    a.unitPrice === b.unitPrice &&
    a.moneyDecimals === b.moneyDecimals
  );
}

/**
 * Importe de la pesada con los decimales de la moneda de la organización
 * (redondeo medio hacia arriba de Intl): 13.891,50 → «$ 13.892» en COP.
 */
export function formatWeighingMoney(value: number, currency: string, locale: string, moneyDecimals?: number): string {
  const d = moneyDecimals ?? 2;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
  } catch {
    return `${currency} ${value.toFixed(d)}`;
  }
}

/** Cantidad con los decimales del producto y su unidad: «0,735 kg». */
export function formatWeighingQty(w: Pick<DisplayWeighing, 'qty' | 'unit' | 'decimals'>, locale: string): string {
  if (w.qty === null) return w.unit ? `— ${w.unit}` : '—';
  // Por peso, legible sea cual sea la unidad: «735 g», «1,250 kg» (conversión única).
  const peso = pesoLegible(w.qty, w.unit, locale);
  if (peso !== null) return peso;
  let texto: string;
  try {
    texto = new Intl.NumberFormat(locale, { minimumFractionDigits: w.decimals, maximumFractionDigits: w.decimals }).format(w.qty);
  } catch {
    texto = w.qty.toFixed(w.decimals);
  }
  return (w.unit ? `${texto} ${w.unit}` : texto).replace(/[  ]/g, ' ');
}

/** Precio que ve el cliente: por kg aunque la pesada vaya en gramos («$ 12.000/kg»), por lb en libras. */
export function weighingVisiblePrice(w: Pick<DisplayWeighing, 'unitPrice' | 'unit'>): { price: number; unit: string } {
  const v = precioVisiblePeso(w.unitPrice, w.unit);
  return v ? { price: v.precio, unit: v.unidad } : { price: w.unitPrice, unit: w.unit };
}
