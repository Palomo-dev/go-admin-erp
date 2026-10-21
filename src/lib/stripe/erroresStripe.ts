/** Código de un error de Stripe, sin volcar el objeto (puede traer la petición). */
export function codigoDeErrorStripe(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const propio = (error as { code?: unknown }).code;
  if (typeof propio === 'string' && propio) return propio;
  const crudo = (error as { raw?: { code?: unknown } }).raw?.code;
  return typeof crudo === 'string' && crudo ? crudo : undefined;
}

export function esSuscripcionAusente(error: unknown): boolean {
  return codigoDeErrorStripe(error) === 'resource_missing';
}

export type RespuestaErrorCancelar =
  | { success: true; missingInStripe: true }
  | { success: false; code?: string; error: string };

/** El id no está en esta cuenta: no es un fallo del usuario, es otra cuenta. */
export function respuestaDeErrorAlCancelar(error: unknown): RespuestaErrorCancelar {
  if (esSuscripcionAusente(error)) return { success: true, missingInStripe: true };
  const code = codigoDeErrorStripe(error);
  const message = error instanceof Error && error.message ? error.message : 'Error cancelando suscripción';
  return { success: false, code, error: message };
}
