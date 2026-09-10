/**
 * `fetchJson` — fetch de cliente con límite de tiempo y errores legibles.
 *
 * Motivo: cuando la base de datos está intermitente, la ruta de API se queda
 * esperando y el `fetch` del navegador NUNCA se resuelve. El `finally` que
 * apaga el spinner no llega a ejecutarse y la pantalla gira para siempre sin
 * decir nada. Con un AbortController la petición se corta y el componente
 * puede mostrar un estado de error con botón de reintentar.
 */

import { describeError } from './errorMessage';

/** Tiempo máximo por defecto para una petición de lectura de pantalla. */
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

export interface FetchJsonOptions extends RequestInit {
  /** Milisegundos antes de abortar. Por defecto {@link DEFAULT_FETCH_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * Hace una petición y devuelve el JSON.
 *
 * Lanza un Error con mensaje legible si:
 * - se agota el tiempo de espera,
 * - la respuesta no es 2xx (usando `error`/`message` del cuerpo si existe),
 * - el cuerpo no es JSON (p. ej. el HTML de la página de login tras un redirect).
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, signal, ...init } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Respetar también un signal externo (desmontaje del componente).
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `La petición a ${url} superó los ${Math.round(timeoutMs / 1000)} s. ` +
          'El servidor o la base de datos no respondieron.'
      );
    }
    throw new Error(`No se pudo contactar con ${url}: ${describeError(err)}`);
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }

  const raw = await response.text();

  let parsed: unknown = null;
  let parseFailed = false;
  if (raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parseFailed = true;
    }
  }

  if (!response.ok) {
    const fromBody =
      parsed && typeof parsed === 'object'
        ? (parsed as { error?: unknown; message?: unknown })
        : null;
    const detail =
      (typeof fromBody?.error === 'string' && fromBody.error) ||
      (typeof fromBody?.message === 'string' && fromBody.message) ||
      null;
    throw new Error(detail || `Error ${response.status} al consultar ${url}`);
  }

  if (parseFailed) {
    // Caso típico: el middleware redirigió al login y llegó HTML.
    throw new Error(
      `La respuesta de ${url} no es JSON. Puede que la sesión haya caducado; recarga la página.`
    );
  }

  return parsed as T;
}
