/**
 * Cuentas del cobro del POS (POS-PLAN §2.6, L41), movidas LITERALMENTE de
 * `CheckoutDialog.tsx` (paso 1 del rediseño). Sin React: reciben importes ya
 * calculados y no deciden nada de impuestos.
 *
 * - `baseTotal`: el total con impuestos que calculó el diálogo; si el diálogo
 *   no calculó impuestos pero el carrito ya los trae (la mesa con
 *   `useMesaTaxes`), el total del carrito.
 * - `cartTotal = baseTotal + propina + flete`. El flete suma aunque el envío
 *   quede «Pendiente» de pago: ese estado solo viaja al envío (L46, E-15).
 * - `remaining` (lo que falta), `change` (el cambio) y `canComplete`
 *   (pagado ≥ total). No hay abono parcial (E-34): sin cubrir el total no se
 *   completa la venta.
 *
 * `CheckoutDialog.tsx` conserva escritas las líneas de `totalPaid` y
 * `remaining` porque las pruebas de `__tests__/pos-display/` las leen del
 * fuente; son la misma cuenta que devuelve `cuentasDelCobro`.
 */

/** Totales con impuestos que calcula el diálogo (`calculateCartTotals`). */
export interface TotalesCalculadosCobro {
  subtotal: number;
  totalTaxAmount: number;
  finalTotal: number;
}

/** Lo que el diálogo sabe del carrito para decidir la base. */
export interface CarritoParaCuentas {
  total: number;
  tax_total: number;
}

export interface EntradaCuentasCobro {
  calculatedTotals: TotalesCalculadosCobro;
  cart: CarritoParaCuentas;
  tipAmount: number;
  shippingFee: number;
  totalPaid: number;
}

export interface CuentasCobro {
  baseTotal: number;
  cartTotal: number;
  remaining: number;
  change: number;
  canComplete: boolean;
}

/** Total con impuestos, sin propina ni flete: la base de la propina (tip.ts). */
export function baseDelCobro(calculatedTotals: TotalesCalculadosCobro, cart: CarritoParaCuentas): number {
  // Si el dialog calculó impuestos, usar su finalTotal.
  // Si no calculó impuestos pero el carrito ya los tiene (ej. desde mesa con useMesaTaxes), usar cart.total.
  return (calculatedTotals.totalTaxAmount === 0 && cart.tax_total > 0)
    ? cart.total
    : (calculatedTotals.finalTotal > 0 ? calculatedTotals.finalTotal : cart.total);
}

export function cuentasDelCobro({ calculatedTotals, cart, tipAmount, shippingFee, totalPaid }: EntradaCuentasCobro): CuentasCobro {
  const baseTotal = baseDelCobro(calculatedTotals, cart);
  const cartTotal = baseTotal + tipAmount + shippingFee;
  const remaining = Math.max(0, cartTotal - totalPaid);
  const change = Math.max(0, totalPaid - cartTotal);
  const canComplete = totalPaid >= cartTotal;
  return { baseTotal, cartTotal, remaining, change, canComplete };
}
