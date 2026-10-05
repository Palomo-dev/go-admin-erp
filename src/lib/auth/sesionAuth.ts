/**
 * Id de la sesión de Supabase Auth (`auth.sessions.id`) a partir del access
 * token: es el claim `session_id` del JWT.
 *
 * `registerUserDevice` lo guarda en `user_devices.session_id` para que «Mi
 * perfil › Sesiones y dispositivos» pueda cerrar la sesión de UN dispositivo
 * (migración `20261005235900_perfil_sesiones_auth.sql`, sin aplicar). Antes se
 * guardaba ahí el id de la persona, que no identifica ninguna sesión.
 *
 * Solo lee el payload, no verifica la firma: el valor no autoriza nada en el
 * navegador; la función de la base vuelve a comprobar que el dispositivo es de
 * quien llama.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodificarBase64Url(segmento: string): string {
  const b64 = segmento.replace(/-/g, '+').replace(/_/g, '/');
  const relleno = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binario = atob(b64 + relleno);
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** `null` si el token no trae un `session_id` con forma de uuid. Nunca lanza. */
export function sesionAuthDeToken(accessToken: string | null | undefined): string | null {
  if (!accessToken) return null;
  const partes = accessToken.split('.');
  if (partes.length < 2) return null;
  try {
    const payload = JSON.parse(decodificarBase64Url(partes[1])) as { session_id?: unknown };
    return typeof payload.session_id === 'string' && UUID.test(payload.session_id) ? payload.session_id : null;
  } catch {
    return null;
  }
}
