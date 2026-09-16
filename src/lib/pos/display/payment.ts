/**
 * Del método de pago del POS (`payment_methods.code`) al estado de cobro que
 * ve el cliente (PLAN §4.2, «Cobro»). Pura, sin React: CheckoutDialog la
 * llama en cada tecla y las pruebas la ejercitan en Node.
 *
 * Tres estados en pantalla, muchos códigos en la BD:
 * - `cash`  → efectivo: total, recibido y cambio en grande.
 * - `card`  → «Siga las instrucciones del datáfono»: `card`, `bold_card` y,
 *              por defecto, cualquier código que no sea efectivo ni QR
 *              (`wompi`, `bold_link`, `credit`…): el cliente ve el total y
 *              el nombre del medio; nunca un QR roto ni un estado inventado.
 * - `qr`    → el QR a pantalla completa con el nombre del medio: `nequi`,
 *              `daviplata`, `transfer`, `qr` y todo código terminado en `_qr`
 *              (`breb_qr`, `bold_qr`, `bancolombia_qr`, `bancolombia_qr_wompi`,
 *              `redeban_qr`…). En Fase 0 `qr` va en null: la imagen llega en F2.
 */

import type { DisplayPayment } from './protocol';

/** Códigos que se cobran con QR aunque no terminen en `_qr`. */
const QR_CODES: ReadonlySet<string> = new Set(['nequi', 'daviplata', 'transfer', 'qr']);

export function isQrPaymentCode(code: string): boolean {
  const normalized = code.trim().toLowerCase();
  return QR_CODES.has(normalized) || normalized.endsWith('_qr') || normalized.includes('_qr_');
}

export interface DisplayPaymentInput {
  /** `payment_methods.code` del medio elegido en la caja. */
  methodCode: string;
  /** Nombre legible del medio (`payment_methods.name`); null si no se conoce. */
  methodName: string | null;
  /** Lo que el cliente paga: total con propina y domicilio. */
  total: number;
  /** Efectivo: importe tecleado hasta ahora; null si aún no hay nada. */
  received?: number | null;
  /** Efectivo: cambio calculado por la caja; null si aún no hay recibido. */
  change?: number | null;
}

function toAmount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toNullableAmount(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = toAmount(value);
  return Number.isFinite(n) ? n : null;
}

/** Lo mínimo de una entrada de pago del modal de cobro que necesita `resolveCashReceived`. */
export interface CashReceivedEntry {
  /** Id de la entrada en el modal (`PaymentEntry.id`); con él se sabe si el cajero tecleó ESE importe. */
  id: string;
  method: string;
  amount: number;
}

function isCashEntry(entry: CashReceivedEntry | null | undefined): entry is CashReceivedEntry {
  return !!entry && typeof entry.method === 'string' && entry.method.trim().toLowerCase() === 'cash';
}

/**
 * Efectivo «recibido» que ve el cliente (PLAN §4.2: recibido y cambio en vivo
 * MIENTRAS EL CAJERO TECLEA). CheckoutDialog pre-rellena cada entrada nueva
 * con el importe pendiente (la primera con el total; «Agregar pago» con el
 * resto), así que sin esta función la pantalla mostraría «Recibido: $TOTAL ·
 * Cambio: $0» antes de que el cliente entregue nada. Por eso el «tocado» es
 * POR ENTRADA (`touchedIds`: ids cuyo importe editó el cajero), no global:
 * con pago mixto, teclear la tarjeta no convierte en «recibido» un efectivo
 * pre-rellenado que nadie ha entregado.
 * - Ninguna entrada en efectivo tocada → null: la pantalla muestra solo el
 *   total (y el cambio viaja null).
 * - Si no → la suma de las entradas en efectivo tocadas, solo de esas: con
 *   efectivo 15.000 tecleado + tarjeta 10.000 el recibido es 15.000.
 * Pura y tolerante: importes no numéricos cuentan como 0.
 */
export function resolveCashReceived(payments: ReadonlyArray<CashReceivedEntry>, touchedIds: ReadonlySet<string>): number | null {
  if (!Array.isArray(payments) || !touchedIds || typeof touchedIds.has !== 'function') return null;
  const touchedCash = payments.filter((entry) => isCashEntry(entry) && typeof entry.id === 'string' && touchedIds.has(entry.id));
  if (touchedCash.length === 0) return null;
  return touchedCash.reduce((sum, entry) => sum + toAmount(entry.amount), 0);
}

/** Estado de cobro para la pantalla según el método. Nunca lanza. */
export function toDisplayPayment(input: DisplayPaymentInput): DisplayPayment {
  const code = typeof input.methodCode === 'string' ? input.methodCode.trim().toLowerCase() : '';
  const total = toAmount(input.total);
  const name = typeof input.methodName === 'string' && input.methodName.trim().length > 0 ? input.methodName.trim() : null;

  if (code === 'cash') {
    const received = toNullableAmount(input.received);
    return {
      method: 'cash',
      total,
      received,
      change: received === null ? null : toNullableAmount(input.change),
    };
  }

  if (isQrPaymentCode(code)) {
    return { method: 'qr', total, provider: name ?? code, qr: null, expiresAt: null };
  }

  // Tarjeta y datáfono (`card`, `bold_card`) y cualquier otro medio sin
  // estado propio en pantalla: el cliente ve el total y el nombre del medio.
  return { method: 'card', total, provider: code === 'card' ? null : name ?? code };
}
