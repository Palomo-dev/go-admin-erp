/**
 * Calificación del cliente en la pantalla del POS, lado CAJA (Fase 4,
 * PLAN §4.2).
 *
 * La pantalla solo manda una INTENCIÓN (`UpMessage` `rating`, protocol.ts):
 * un número de 1 a 5. Quien la registra es la caja, porque es la única que
 * sabe QUÉ venta acaba de confirmar (`emitter.ratingSaleId`). El `saleId`
 * que trae el mensaje de subida se IGNORA a propósito: el canal remoto de
 * una terminal lo puede escribir cualquier miembro activo de su sucursal, así
 * que un id de venta llegado por ahí sería un id elegido por el emisor.
 *
 * La escritura va por `/api/pos/display/feedback`, que resuelve organización
 * y sucursal desde `pos_terminals` (CLAUDE.md regla 5) y deduplica por venta.
 * Aquí, además, se recuerda lo ya enviado en esta ventana para no hacer ni
 * siquiera la llamada cuando el cliente pulsa dos veces.
 *
 * Nunca lanza: una calificación que no se puede registrar no puede romper la
 * caja ni la venta (PLAN §5.5).
 */

import type { Rating } from './protocol';

export const DISPLAY_FEEDBACK_ENDPOINT = '/api/pos/display/feedback';

export interface SendDisplayRatingInput {
  terminalId: string;
  /** Venta recién confirmada, o null si la caja no la conoce (p. ej. una venta a crédito). */
  saleId: string | null;
  rating: Rating;
}

export interface SendDisplayRatingResult {
  /** true si la llamada terminó bien (aunque el servidor la contara como repetida). */
  ok: boolean;
  /** true si esta ventana ya había mandado la calificación de esa misma venta. */
  alreadySent: boolean;
}

/** Ventas ya calificadas desde esta ventana de caja. Por venta; sin venta, por terminal. */
const sent = new Set<string>();

function key(input: SendDisplayRatingInput): string {
  return `${input.terminalId}|${input.saleId ?? 'sin-venta'}`;
}

/** Solo para pruebas: olvida lo ya enviado. */
export function _resetDisplayRatingMemory(): void {
  sent.clear();
}

function isRating(value: unknown): value is Rating {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Registra la calificación. Devuelve `alreadySent` cuando esta ventana ya la
 * mandó para esa venta (no se llama al servidor). Un fallo de red o un
 * rechazo del servidor devuelven `ok: false` y NO se recuerdan: si el cliente
 * vuelve a pulsar, se reintenta.
 *
 * `fetchImpl` existe solo para las pruebas.
 */
export async function sendDisplayRating(
  input: SendDisplayRatingInput,
  fetchImpl: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): Promise<SendDisplayRatingResult> {
  try {
    if (!input.terminalId || !isRating(input.rating)) return { ok: false, alreadySent: false };
    const memoryKey = key(input);
    if (sent.has(memoryKey)) return { ok: true, alreadySent: true };
    if (!fetchImpl) return { ok: false, alreadySent: false };

    const response = await fetchImpl(DISPLAY_FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ terminalId: input.terminalId, saleId: input.saleId, rating: input.rating }),
    });
    if (!response.ok) {
      console.warn('[pos-display] no se pudo registrar la calificación:', response.status);
      return { ok: false, alreadySent: false };
    }
    sent.add(memoryKey);
    return { ok: true, alreadySent: false };
  } catch (err) {
    console.warn('[pos-display] no se pudo registrar la calificación:', err instanceof Error ? err.message : err);
    return { ok: false, alreadySent: false };
  }
}
