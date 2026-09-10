/**
 * Origin de confianza para los enlaces que se mandan por correo.
 *
 * Varias rutas de auth reciben un `origin` en el body y lo usan para construir
 * el destino de un magic link / invitación. Un origin arbitrario convierte ese
 * correo en un enlace de phishing enviado con nuestro remitente y nuestra
 * reputación, así que solo se acepta el de la propia petición.
 *
 * Vive aquí (y no en un route.ts) porque lo usan `/api/auth/invite` y
 * `/api/auth/invite/resend`: una sola definición, no dos que diverjan.
 */

/**
 * Origin de la propia petición (header `Origin`, o `x-forwarded-host`/`host`
 * más el protocolo). `null` si no se puede determinar.
 */
export function getSelfOrigin(request: Request): string | null {
  const headerOrigin = request.headers.get('origin');
  if (headerOrigin) return headerOrigin;

  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!forwardedHost) return null;

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  return `${forwardedProto}://${forwardedHost}`;
}

/**
 * Devuelve el origin que se puede usar en un correo. Si el del body no
 * coincide con el de la petición, se ignora y se registra el intento. Si el
 * de la petición no se puede determinar (p. ej. sin headers de proxy), se
 * acepta el del body para no romper el envío.
 */
export function resolveSelfOrigin(request: Request, bodyOrigin: string, contexto: string): string {
  const selfOrigin = getSelfOrigin(request);

  if (!selfOrigin) return bodyOrigin;
  if (bodyOrigin === selfOrigin) return bodyOrigin;

  console.warn(`${contexto}: origin del body no coincide con el de la petición:`, bodyOrigin, '≠', selfOrigin);
  return selfOrigin;
}
