/** El límite cubre la petición y la lectura completa de su respuesta. */
export class RequestDeadlineError extends Error {
  readonly status: number;
  constructor(readonly code: 'REQUEST_TIMEOUT' | 'REQUEST_ABORTED') {
    super(code === 'REQUEST_TIMEOUT' ? 'Se agotó el tiempo de espera' : 'Petición cancelada');
    this.name = 'RequestDeadlineError';
    this.status = code === 'REQUEST_TIMEOUT' ? 504 : 499;
  }
}

export async function withRequestDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: { timeoutMs: number; signal?: AbortSignal },
): Promise<T> {
  const controller = new AbortController();
  let rejectAbort!: (error: RequestDeadlineError) => void;
  const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
  const stop = (code: RequestDeadlineError['code']) => {
    if (controller.signal.aborted) return;
    const error = new RequestDeadlineError(code);
    // Rechazar primero: un SDK que traduce abortos a errores HTTP no debe
    // convertir un timeout en falta de sesión o membresía.
    rejectAbort(error);
    controller.abort(error);
  };
  const onAbort = () => stop('REQUEST_ABORTED');
  const timer = setTimeout(() => stop('REQUEST_TIMEOUT'), options.timeoutMs);
  options.signal?.addEventListener('abort', onAbort, { once: true });
  if (options.signal?.aborted) onAbort();
  try {
    return await Promise.race([
      aborted,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw controller.signal.reason;
        return operation(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onAbort);
  }
}
