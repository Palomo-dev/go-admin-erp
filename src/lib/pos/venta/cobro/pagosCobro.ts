/**
 * Pagos del cobro del POS (POS-PLAN §2.6, L42), movidos LITERALMENTE de
 * `CheckoutDialog.tsx`. Sin React: cada función recibe la lista y devuelve la
 * lista nueva (o la misma, si no cambia nada).
 *
 * - Pago mixto: una entrada por medio; la nueva entra en efectivo por lo que
 *   falta (la primera, al abrir el cobro, por el total).
 * - Quitar solo se puede con más de una entrada: siempre queda una.
 * - El importe tecleado se guarda como número (`Number(value) || 0`).
 * - Los medios son los de la organización (`organization_payment_methods`,
 *   `POSService.getPaymentMethods`), cuyo `id` es el código del medio.
 *
 * Lo que marca una entrada como «tocada» (`touchedIds`) sigue en el diálogo:
 * las pruebas de la pantalla del cliente leen esa línea del fuente.
 */

export interface EntradaPago {
  id: string;
  method: string;
  amount: number;
}

/** Medio por defecto de una entrada nueva y el único con montos rápidos (L43). */
export const METODO_EFECTIVO = 'cash';

/** Medio de la organización tal como lo usa el cobro para nombrar un pago. */
export interface MetodoPagoNombrado {
  code: string;
  name: string;
}

/** Entrada nueva: en efectivo, por el importe que se le pasa (lo que falta). */
export function entradaDePagoNueva({ id, amount }: { id: string; amount: number }): EntradaPago {
  return {
    id,
    method: METODO_EFECTIVO,
    amount,
  };
}

/** Cambia el medio o el importe de UNA entrada; el importe siempre como número. */
export function actualizarEntradaPago(
  payments: EntradaPago[],
  id: string,
  field: 'method' | 'amount',
  value: string | number,
): EntradaPago[] {
  return payments.map(payment =>
    payment.id === id
      ? { ...payment, [field]: field === 'amount' ? Number(value) || 0 : value }
      : payment
  );
}

/** Con una sola entrada no se ofrece «Eliminar». */
export function puedeQuitarPagos(payments: EntradaPago[]): boolean {
  return payments.length > 1;
}

/** Quita una entrada; con una sola devuelve la MISMA lista (React no re-renderiza). */
export function quitarEntradaPago(payments: EntradaPago[], id: string): EntradaPago[] {
  if (!puedeQuitarPagos(payments)) return payments;
  return payments.filter(payment => payment.id !== id);
}

/** Los pagos tal como viajan en el sobre del cobro (`CheckoutData.payments`). */
export function pagosDelSobre(payments: EntradaPago[]): { method: string; amount: number }[] {
  return payments.map(p => ({ method: p.method, amount: p.amount }));
}

/**
 * Los pagos del ticket físico y de la factura electrónica: sin entradas en
 * cero y con el nombre del medio de la organización (o su código si no está).
 */
export function pagosParaImpresion(
  payments: EntradaPago[],
  paymentMethods: MetodoPagoNombrado[],
): { method: string; methodName: string; amount: number }[] {
  return payments.filter(p => p.amount > 0).map(p => ({
    method: p.method,
    methodName: paymentMethods.find(pm => pm.code === p.method)?.name || p.method,
    amount: p.amount,
  }));
}

/** ¿Hay efectivo de verdad (importe > 0)? Decide si se abre el cajón (L52). */
export function hayPagoEnEfectivo(payments: EntradaPago[]): boolean {
  return payments.some(p => p.amount > 0 && p.method === METODO_EFECTIVO);
}
