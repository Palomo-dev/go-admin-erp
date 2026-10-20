/**
 * Una sola cuenta por línea del carrito del POS.
 *
 * La fórmula es `calcularLineaVenta` (la que `pos_checkout_v1` valida).
 * La tasa sale de los impuestos del producto; si no tiene, de los que el
 * carrito tiene elegidos o de los predeterminados de la organización.
 * «Excluir impuesto» deja la línea en tasa 0 y sí resta el descuento.
 * Lo que la línea dice de «incluido» manda sobre la casilla: la casilla
 * solo llena las líneas que no dicen nada.
 */

import { calcularLineaVenta, totalesDeLineas, type LineaVentaCalculada } from '@/lib/pos/lineaVenta';
import { impuestoIncluidoDeLinea } from '@/lib/utils/taxCalculations';

export interface ImpuestoDeLinea {
  id: string;
  name: string;
  rate: number;
  tax_included?: boolean | null;
  is_active?: boolean | null;
  is_default?: boolean | null;
}

export interface EntradaLineaCarrito {
  quantity: number;
  unit_price: number;
  discount_amount?: number | null;
  tax_rate?: number | null;
  tax_included?: boolean | null;
  tax_excluded?: boolean | null;
  /** La tasa ya se decidió (también si es 0). No se vuelve a sumar la de los impuestos. */
  tasaDecidida?: boolean | null;
  tax_name?: string | null;
}

/**
 * Impuestos que aplican a una línea: los del producto si tiene; si no, los
 * elegidos en el carrito; si nunca eligió, los predeterminados.
 */
export function impuestosQueAplican(
  delProducto: readonly ImpuestoDeLinea[],
  deLaOrganizacion: readonly ImpuestoDeLinea[],
  appliedIds: readonly string[] | undefined,
): ImpuestoDeLinea[] {
  const activosProducto = delProducto.filter((t) => t.is_active !== false);
  if (activosProducto.length > 0) return activosProducto;
  const org = deLaOrganizacion.filter((t) => t.is_active !== false);
  if (appliedIds) {
    const ids = new Set(appliedIds);
    return org.filter((t) => ids.has(t.id));
  }
  return org.filter((t) => t.is_default);
}

/**
 * Valor inicial de «impuestos incluidos»: encendido solo cuando hay impuestos
 * y todos traen el precio con el impuesto dentro. Sin impuestos, apagado.
 */
export function incluidoPorImpuestos(impuestos: readonly { tax_included?: boolean | null }[]): boolean {
  return impuestos.length > 0 && impuestos.every((t) => t.tax_included === true);
}

export function tasaDeImpuestos(impuestos: readonly { rate: number }[]): number {
  return impuestos.reduce((s, t) => s + (Number(t.rate) || 0), 0);
}

export function nombreDeImpuestos(impuestos: readonly { name: string; rate: number }[]): string | null {
  const conTasa = impuestos.filter((t) => (Number(t.rate) || 0) > 0);
  if (conTasa.length === 0) return null;
  if (conTasa.length === 1) return conTasa[0].name;
  return conTasa.map((t) => t.name).join(' + ');
}

export interface LineaCarritoCalculada extends LineaVentaCalculada {
  taxIncludedEfectivo: boolean;
  taxName: string | null;
}

/**
 * Cuenta de una línea. `impuestos` vacíos: se usa la tasa que la línea ya
 * trae (el carrito ya la resolvió). Con impuestos, esa tasa manda, salvo
 * `tasaDecidida`.
 */
export function calcularLineaDelCarrito(
  item: EntradaLineaCarrito,
  impuestos: readonly ImpuestoDeLinea[] = [],
  casilla = false,
): LineaCarritoCalculada {
  if (item.tax_excluded) {
    const calc = calcularLineaVenta({
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount_amount: item.discount_amount || 0,
      tax_rate: 0,
      tax_included: false,
    });
    return { ...calc, taxIncludedEfectivo: false, taxName: null };
  }
  const incluido = item.tax_included != null
    ? item.tax_included === true
    : impuestoIncluidoDeLinea(
        { tax_included: incluidoPorImpuestos(impuestos) ? true : null },
        casilla,
      );
  const tasa = item.tasaDecidida || impuestos.length === 0
    ? (Number(item.tax_rate) || 0)
    : tasaDeImpuestos(impuestos);
  const calc = calcularLineaVenta({
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount_amount: item.discount_amount || 0,
    tax_rate: tasa,
    tax_included: incluido,
  });
  return {
    ...calc,
    taxIncludedEfectivo: incluido,
    taxName: item.tax_name || nombreDeImpuestos(impuestos),
  };
}

export function totalesDeLineasDelCarrito(lineas: readonly LineaCarritoCalculada[]): {
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
} {
  const t = totalesDeLineas([...lineas]);
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    subtotal: r(t.subtotal),
    taxTotal: r(t.taxTotal),
    discountTotal: r(t.discountTotal),
    total: r(t.total),
  };
}

export interface FilaDesglose {
  name: string;
  rate: number;
  amount: number;
}

/** Desglose por nombre y tasa, con el impuesto que salió de la regla única. */
export function desgloseDeLineas(lineas: readonly LineaCarritoCalculada[]): FilaDesglose[] {
  const mapa = new Map<string, FilaDesglose>();
  for (const l of lineas) {
    if (!(l.taxAmount > 0)) continue;
    const name = l.taxName || `Impuesto ${l.taxRate}%`;
    const clave = `${name}|${l.taxRate}`;
    const previa = mapa.get(clave);
    if (previa) previa.amount = Math.round((previa.amount + l.taxAmount) * 100) / 100;
    else mapa.set(clave, { name, rate: l.taxRate, amount: l.taxAmount });
  }
  return Array.from(mapa.values());
}
