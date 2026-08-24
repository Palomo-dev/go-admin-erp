/**
 * Helper para mockear global.fetch en tests.
 * Permite responder segun la URL y el metodo, simulando respuestas JSON.
 */

/** Respuesta simulada de fetch. */
export interface FetchMockResponse {
  status: number;
  body: unknown;
}

/** Funcion que dada una URL y un RequestInit retorna una respuesta simulada. */
export type FetchMockHandler = (
  url: string,
  init?: RequestInit,
) => FetchMockResponse | Promise<FetchMockResponse>;

/**
 * Instala un mock de global.fetch que delega al handler.
 * Retorna una funcion para restaurar el fetch original.
 */
export function installFetchMock(handler: FetchMockHandler): () => void {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const urlString =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const result = await handler(urlString, init);
    const bodyStr = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
    return new Response(bodyStr, {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

/** Construye una respuesta exitosa (200) con body JSON. */
export function ok(body: unknown): FetchMockResponse {
  return { status: 200, body };
}

/** Construye una respuesta de error (4xx/5xx) con body. */
export function httpError(status: number, body: unknown): FetchMockResponse {
  return { status, body };
}
