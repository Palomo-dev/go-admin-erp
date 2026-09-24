/**
 * Regla única de la línea de venta del POS (la que `pos_checkout_v1` valida
 * en el servidor con la misma fórmula, ver fn_pos_validar_linea_venta):
 *
 *   neto     = cantidad × precio − descuento
 *   impuesto = incluido ? neto − neto / (1 + tasa/100) : neto × tasa/100   (redondeado a centavos)
 *   total    = incluido ? neto : neto + impuesto
 *
 * La usan el cobro de mostrador (POSService.checkout), la deuda
 * (holdCartWithDebt) y las líneas de la mesa. No decide QUÉ tasa aplica: eso
 * sigue siendo de cada motor de impuestos (unificarlos es decisión pendiente
 * del dueño, POS-CARRITO-LINEAS-NOTAS.md §7).
 */

export interface EntradaLineaVenta {
  quantity: number | null | undefined;
  unit_price: number | null | undefined;
  discount_amount?: number | null;
  tax_rate?: number | null;
  tax_included: boolean;
}

export interface LineaVentaCalculada {
  lineNet: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxIncluded: boolean;
  discount: number;
}

export function calcularLineaVenta(entrada: EntradaLineaVenta): LineaVentaCalculada {
  const lineTotal = (Number(entrada.unit_price) || 0) * (Number(entrada.quantity) || 1);
  const discount = Number(entrada.discount_amount) || 0;
  const lineNet = lineTotal - discount;
  const taxRate = Number(entrada.tax_rate) || 0;
  const taxIncluded = entrada.tax_included;
  const itemTax = taxIncluded
    ? lineNet - (lineNet / (1 + taxRate / 100))
    : lineNet * taxRate / 100;
  const taxAmount = Math.round(itemTax * 100) / 100;
  const total = taxIncluded ? lineNet : lineNet + taxAmount;
  return { lineNet, taxRate, taxAmount, total, taxIncluded, discount };
}

/** Totales de cabecera a partir de las líneas (misma regla que el cobro). */
export function totalesDeLineas(lineas: LineaVentaCalculada[]): {
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
} {
  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  let total = 0;
  for (const l of lineas) {
    subtotal += l.taxIncluded ? l.lineNet - l.taxAmount : l.lineNet;
    taxTotal += l.taxAmount;
    discountTotal += l.discount;
    total += l.total;
  }
  return { subtotal, taxTotal, discountTotal, total };
}
