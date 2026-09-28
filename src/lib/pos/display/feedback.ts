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
 * Ese recuerdo CADUCA, y ahí estaba el defecto de la ronda 1: sin venta la
 * clave era `terminal|sin-venta` en un Set de módulo que no se limpiaba
 * nunca, así que de toda la jornada solo llegaba al servidor la PRIMERA
 * calificación anónima. Y anónimas son todas las de una venta a crédito
 * (CartView.handleHoldWithDebt entra en «Gracias» sin `saleId`): el informe
 * de satisfacción las subcontaba sin que nadie se enterara. Ahora se guarda
 * el INSTANTE, y sin venta solo se considera repetida dentro de
 * `FEEDBACK_ANONYMOUS_WINDOW_MS` —la misma ventana con la que deduplica el
 * servidor—, que es justo lo que cubre los 8 s de «Gracias» sin tapar al
 * cliente siguiente de una caja con cola.
 *
 * Nunca lanza: una calificación que no se puede registrar no puede romper la
 * caja ni la venta (PLAN §5.5).
 */

import type { Rating } from './protocol';

export const DISPLAY_FEEDBACK_ENDPOINT = '/api/pos/display/feedback';

/**
 * Ventana en la que una calificación SIN venta (`saleId` null) se considera
 * repetida en la misma terminal. La unicidad de la base es
 * `(terminal_id, sale_id) WHERE sale_id IS NOT NULL`: sin venta no hay clave
 * que la base pueda deduplicar, así que se mira el reloj. Dos minutos cubren
 * de sobra los 8 s de «Gracias» sin tapar la calificación del cliente
 * siguiente en una caja con cola.
 *
 * Vive aquí, en el módulo PURO que comparten la caja y el servidor, y no en
 * `server/displayFeedback.ts` (que la re-exporta): las dos puntas deciden
 * «repetida» con el MISMO número o no deciden lo mismo (CLAUDE.md §7).
 */
export const FEEDBACK_ANONYMOUS_WINDOW_MS = 2 * 60 * 1000;

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

/**
 * Ventas ya calificadas desde esta ventana de caja, con el instante en que
 * se mandaron. Con venta la clave es la venta y no caduca (una venta se
 * califica una vez y ya está); SIN venta la clave es la terminal y solo vale
 * durante `FEEDBACK_ANONYMOUS_WINDOW_MS`, porque «sin venta» no identifica a
 * nadie: pasado ese rato quien pulsa es otro cliente.
 */
const sent = new Map<string, number>();

function key(input: SendDisplayRatingInput): string {
  return `${input.terminalId}|${input.saleId ?? 'sin-venta'}`;
}

/** Solo para pruebas: olvida lo ya enviado. */
export function _resetDisplayRatingMemory(): void {
  sent.clear();
}

/**
 * ¿Esta ventana ya mandó ESTA calificación? Con venta, siempre que conste.
 * Sin venta, solo si fue hace menos de `FEEDBACK_ANONYMOUS_WINDOW_MS`; fuera
 * de la ventana la entrada se olvida y la decisión vuelve a ser del servidor,
 * que sabe deduplicar por su cuenta (y que es el único que ve las demás
 * pestañas y equipos de la misma caja).
 */
function alreadySentNow(memoryKey: string, saleId: string | null, now: number): boolean {
  const at = sent.get(memoryKey);
  if (at === undefined) return false;
  if (saleId !== null) return true;
  if (now - at < FEEDBACK_ANONYMOUS_WINDOW_MS) return true;
  sent.delete(memoryKey);
  return false;
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
    if (alreadySentNow(memoryKey, input.saleId ?? null, Date.now())) return { ok: true, alreadySent: true };
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
    sent.set(memoryKey, Date.now());
    return { ok: true, alreadySent: false };
  } catch (err) {
    console.warn('[pos-display] no se pudo registrar la calificación:', err instanceof Error ? err.message : err);
    return { ok: false, alreadySent: false };
  }
}
