/** Código de un error de Stripe, sin volcar el objeto (puede traer la petición). */
export function codigoDeErrorStripe(error: unknown): string | undefined {
  const valor = campoDeErrorStripe(error, 'code');
  return typeof valor === 'string' && valor ? valor : undefined;
}

function campoDeErrorStripe(error: unknown, nombre: string): unknown {
  if (!error || typeof error !== 'object') return undefined;
  const directo = (error as Record<string, unknown>)[nombre];
  if (directo !== undefined && directo !== null) return directo;
  const crudo = (error as { raw?: unknown }).raw;
  if (!crudo || typeof crudo !== 'object') return undefined;
  return (crudo as Record<string, unknown>)[nombre];
}

/**
 * Solo la suscripción que esta cuenta no tiene (HTTP 404).
 * Un `resource_missing` de cupón, precio o customer es otro fallo:
 * la suscripción puede seguir cobrando y no se le olvida el id.
 */
export function esSuscripcionAusente(error: unknown): boolean {
  if (codigoDeErrorStripe(error) !== 'resource_missing') return false;
  const status = campoDeErrorStripe(error, 'statusCode');
  if (status !== 404) return false;
  const param = campoDeErrorStripe(error, 'param');
  if (typeof param !== 'string' || param === '') return true;
  return param === 'id' || param === 'subscription';
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
