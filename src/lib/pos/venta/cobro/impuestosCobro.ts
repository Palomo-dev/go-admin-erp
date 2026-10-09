/**
 * «Impuestos incluidos» del cobro del POS.
 *
 * El carrito puede quedar con `tax_included` en true (la preferencia del
 * puesto o un interruptor anterior) aunque ninguna línea lo tenga: al agregar
 * productos el flag no se copia y el total que ve el cajero SUMA el impuesto.
 * Si el cobro hereda ese flag, saca el impuesto del precio y cobra de menos
 * (17.496 con 8 % encima pasa a 16.200) y apagar la casilla no lo revierte,
 * porque el cálculo seguía leyendo el flag del carrito.
 *
 * La casilla del cobro arranca como las líneas (lo que ya muestra el carrito).
 * Si el cajero la mueve, solo cambia las líneas que no dicen nada: la que ya
 * trae el impuesto en el precio no lo suma otra vez, y la que lo tiene encima
 * no se lo saca. Al abrir se sueltan la casilla y el total de la venta
 * anterior: mientras el cálculo de esta apertura no llega, se muestra el
 * total del carrito. Cuando el cálculo ya llegó, ese es el total y el
 * desglose: no se reemplaza por el del carrito.
 */

import type { TotalesCalculadosCobro } from '@/lib/pos/venta/cobro/cuentasCobro';

export interface LineaImpuestoCobro {
  tax_included?: boolean | null;
  tax_excluded?: boolean | null;
}

/**
 * Valor inicial de la casilla: encendida solo cuando todas las líneas que
 * llevan impuesto ya lo traen en el precio. Sin líneas marcadas, apagada,
 * aunque el carrito diga lo contrario.
 */
export function casillaInicialImpuestosIncluidos(items: readonly LineaImpuestoCobro[]): boolean {
  const conImpuesto = items.filter((item) => !item.tax_excluded);
  if (conImpuesto.length === 0) return false;
  return conImpuesto.every((item) => item.tax_included === true);
}

/** Totales en cero: el cobro todavía no calculó esta apertura. */
export const TOTALES_COBRO_VACIOS: TotalesCalculadosCobro = {
  subtotal: 0,
  totalTaxAmount: 0,
  finalTotal: 0,
};

/**
 * Cambia al cerrar el cobro y al pasar a otro carrito. El diálogo no se
 * desmonta entre ventas del mismo carrito, así que esta firma es la que
 * obliga a soltar la casilla de la venta anterior antes de pintar.
 */
export function firmaAperturaCobro(abierto: boolean, cartId: string): string {
  return `${abierto ? '1' : '0'}:${cartId}`;
}

/** Estado con el que abre el cobro: casilla según las líneas y totales vacíos. */
export function ajusteAlAbrirCobro(items: readonly LineaImpuestoCobro[]): {
  taxIncluded: boolean;
  casillaMovida: false;
  calculatedTotals: TotalesCalculadosCobro;
} {
  return {
    taxIncluded: casillaInicialImpuestosIncluidos(items),
    casillaMovida: false,
    calculatedTotals: TOTALES_COBRO_VACIOS,
  };
}

/**
 * Mientras el cajero no toque la casilla de este cobro, sigue a las líneas.
 * Así, si prende «Impuestos incluidos» en el carrito, el cobro se prende
 * también. Si ya la movió, se queda con lo que eligió.
 */
export function casillaSiElCajeroNoLaMovio(
  casilla: boolean,
  casillaMovida: boolean,
  items: readonly LineaImpuestoCobro[],
): boolean {
  if (casillaMovida) return casilla;
  return casillaInicialImpuestosIncluidos(items);
}

/** Totales del carrito, usados mientras el cálculo de esta apertura está en cero. */
export interface CarritoVisibleEnCobro {
  subtotal: number;
  tax_total: number;
  total: number;
}

/**
 * Total que se muestra y se cobra.
 * Si el cálculo de ESTA apertura ya respondió, manda él —el mismo del que
 * sale el desglose—: puede sumar un impuesto de la organización que el
 * carrito todavía no trae. Si sigue en cero (acabamos de abrir), se usa el
 * total del carrito para no pintar el `finalTotal` de la venta anterior ni
 * cobrar $0. No se cambia un cálculo ya hecho por el total del carrito:
 * eso dejaba el desglose del recibo en una cifra y el total en otra.
 */
export function totalesVisiblesDelCobro(
  calculated: TotalesCalculadosCobro,
  cart: CarritoVisibleEnCobro,
): TotalesCalculadosCobro {
  if (!(calculated.finalTotal > 0)) {
    return {
      subtotal: cart.subtotal,
      totalTaxAmount: cart.tax_total,
      finalTotal: cart.total,
    };
  }
  return calculated;
}

/**
 * Desglose del recibo. Solo se usa si suma lo mismo que el impuesto del
 * total. Si no cuadra, el recibo muestra ese impuesto y no un desglose viejo.
 */
export function desgloseQueCuadraConElTotal<T extends { amount: number }>(
  desglose: readonly T[],
  impuestoDelTotal: number,
): readonly T[] | null {
  if (desglose.length === 0) return null;
  const suma = desglose.reduce((s, fila) => s + fila.amount, 0);
  if (Math.abs(suma - impuestoDelTotal) > 0.5) return null;
  return desglose;
}
