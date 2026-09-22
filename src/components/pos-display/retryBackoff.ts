/**
 * Retroceso del remontaje automático de /pos-display (error boundary,
 * `src/app/pos-display/error.tsx`). Ronda 3 de F2-C.
 *
 * Si el `state` que tumbó la vista es determinista y la caja lo reenvía al
 * `need_snapshot` del remontaje, un reintento fijo entraría en un bucle de
 * 8 s (display_bye → need_snapshot → mismo state → error) con la presencia
 * parpadeando en la caja. Por eso el reintento crece por error: 8 s, 16 s,
 * 32 s y tope 60 s mientras siga fallando LO MISMO; un error distinto vuelve
 * a empezar en 8 s. El contador vive en el módulo porque el boundary se
 * desmonta en cada `reset`. Sin React ni DOM: se prueba en Node.
 *
 * Ronda 4 (C4):
 * - `retryDelayFor(error)` cuenta UNA vez por objeto de error. React
 *   StrictMode (desarrollo, `reactStrictMode: true`) ejecuta el efecto del
 *   boundary dos veces por montaje con el MISMO `error`; sin esta guarda el
 *   contador avanzaba dos pasos (16 s → 60 s). Un error nuevo (otro objeto:
 *   el remontaje volvió a lanzar) sí avanza.
 * - `markRenderHealthy()` reinicia el contador cuando la pantalla vuelve a
 *   pintar bien (CustomerDisplay confirma un `state` sin error). Sin esto,
 *   el mismo digest horas después ya no esperaba 8 s sino 32 s.
 */

/** Primer reintento; cada fallo consecutivo del mismo error lo duplica. */
export const RETRY_BASE_MS = 8_000;
/** Tope del retroceso: la pantalla nunca tarda más de esto en volver a intentarlo. */
export const RETRY_MAX_MS = 60_000;

let lastErrorKey: string | null = null;
let consecutiveFailures = 0;

/** Clave estable del error: el digest de Next o, en su defecto, nombre + mensaje. */
export function errorKey(error: { digest?: string; name?: string; message?: string } | null | undefined): string {
  if (!error) return 'msg::';
  return typeof error.digest === 'string' && error.digest.length > 0
    ? `digest:${error.digest}`
    : `msg:${error.name ?? ''}:${error.message ?? ''}`;
}

/**
 * Espera (ms) antes del siguiente `reset`, y avanza el contador del error.
 * Mismo error seguido: 8 000, 16 000, 32 000, 60 000, 60 000… Otro error:
 * vuelve a 8 000.
 */
export function nextRetryDelay(key: string): number {
  if (key !== lastErrorKey) {
    lastErrorKey = key;
    consecutiveFailures = 0;
  }
  const delay = Math.min(RETRY_BASE_MS * 2 ** consecutiveFailures, RETRY_MAX_MS);
  consecutiveFailures += 1;
  return delay;
}

/**
 * Espera por objeto de error: la primera llamada con un `error` avanza el
 * contador (`nextRetryDelay`); las siguientes con el MISMO objeto devuelven
 * la misma espera sin avanzar. Es la guarda de «ya contado» que necesita el
 * error boundary bajo StrictMode. Un valor que no sea objeto no se puede
 * recordar y cuenta cada vez.
 */
const countedDelays = new WeakMap<object, number>();

export function retryDelayFor(error: { digest?: string; name?: string; message?: string } | null | undefined): number {
  if (error === null || error === undefined || typeof error !== 'object') return nextRetryDelay(errorKey(error));
  const counted = countedDelays.get(error);
  if (counted !== undefined) return counted;
  const delay = nextRetryDelay(errorKey(error));
  countedDelays.set(error, delay);
  return delay;
}

/**
 * La pantalla volvió a pintar bien: olvida el error anterior y su contador,
 * para que un fallo futuro (aunque sea el mismo digest) vuelva a esperar
 * 8 s. La llama CustomerDisplay al confirmar un `state` renderizado sin
 * error (un efecto solo corre si el render no lanzó).
 */
export function markRenderHealthy(): void {
  lastErrorKey = null;
  consecutiveFailures = 0;
}

/** Solo para pruebas: olvida el error anterior y su contador. */
export function resetRetryBackoffForTests(): void {
  markRenderHealthy();
}
