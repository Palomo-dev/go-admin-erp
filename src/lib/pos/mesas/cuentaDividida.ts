/**
 * Cuenta dividida de una mesa: reglas puras del navegador.
 *
 * El saldo NO se decide aquí: lo decide el servidor con los pagos
 * (`fn_pos_mesa_saldo` y `pos_checkout_v1` en modo settle, migración
 * 20260929060000). Cada cobro abona a las líneas lo que de verdad entró
 * (`sale_items.paid_amount`) y una línea solo queda pagada (`paid_at`) cuando
 * su abono cubre su total. Antes el servidor marcaba pagada la línea entera
 * aunque la parte llevara 1 de 3 unidades y la mesa se liberaba con saldo (E1
 * de docs/design/POS-MESAS-FLUJO-COMPLETO.md).
 *
 * Aquí solo se arma lo que el navegador manda:
 * - «Partes iguales» y «montos» se cobran por MONTO (sin platos): cada parte
 *   paga su importe y el servidor lo abona a las líneas pendientes.
 * - «Por ítems» se cobra por platos con su cantidad.
 */

export interface LineaCuenta {
  total: number | string;
  paid_at?: string | null;
  paid_amount?: number | string | null;
}

export interface ParteCuenta {
  items: ReadonlyArray<unknown>;
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/** Redondea a los decimales de la moneda (COP 0, USD 2). */
export function redondearMoneda(valor: number, decimales: number): number {
  const factor = 10 ** Math.max(0, Math.trunc(decimales));
  return Math.round((valor + Number.EPSILON) * factor) / factor;
}

/**
 * Reparte `total` en `partes` importes iguales redondeados a los decimales de
 * la moneda. La última parte absorbe el residuo del redondeo, así la suma es
 * exactamente el total y la cuenta queda saldada al cobrar la última.
 * Ej.: 62.000 en 3 partes (COP) → 20.667 + 20.667 + 20.666.
 */
export function repartirPartesIguales(total: number, partes: number, decimales: number): number[] {
  const n = Math.max(1, Math.trunc(partes));
  const t = redondearMoneda(Math.max(0, numero(total)), decimales);
  const base = redondearMoneda(t / n, decimales);
  const importes = Array.from({ length: n - 1 }, () => base);
  importes.push(redondearMoneda(t - base * (n - 1), decimales));
  return importes;
}

/** Lo ya abonado a las líneas que siguen sin pagar (cobros parciales de una cuenta dividida). */
export function abonadoPendiente(lineas: ReadonlyArray<LineaCuenta>): number {
  return lineas
    .filter((l) => !l.paid_at)
    .reduce((suma, l) => suma + Math.min(Math.max(0, numero(l.paid_amount)), Math.max(0, numero(l.total))), 0);
}

/** Lo que falta por cobrar de las líneas sin pagar: Σ (total − abonado). */
export function saldoDeLineas(lineas: ReadonlyArray<LineaCuenta>): number {
  const pendientes = lineas.filter((l) => !l.paid_at);
  const total = pendientes.reduce((suma, l) => suma + Math.max(0, numero(l.total)), 0);
  return Math.max(0, total - abonadoPendiente(pendientes));
}

/**
 * ¿La división es por monto («partes iguales» o «montos») y no por platos?
 * Las partes por monto no llevan platos: no hay «productos sin asignar».
 */
export function esDivisionPorMonto(partes: ReadonlyArray<ParteCuenta> | null | undefined): boolean {
  return !!partes && partes.length > 0 && partes.every((p) => p.items.length === 0);
}
