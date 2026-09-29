/**
 * Recuperación de una sesión VENCIDA en el cliente (GO-sec, 2026-09-24).
 *
 * Desde que el middleware verifica la firma del JWT, un access token vencido
 * ya no da sesión (antes se aceptaba hasta 7 días después de vencer). El
 * middleware no refresca —refrescar a la vez en servidor y navegador quema el
 * refresh token rotado—, así que manda a `/auth/login?reason=expired&redirectTo=…`
 * y es el cliente quien restaura la sesión con el refresh token del dispositivo
 * y vuelve a donde iba. Esto evita pedir contraseña a quien solo dejó la
 * pestaña, el escritorio o la app móvil quietos más de una hora.
 */

/** Ventana anti-bucle: un intento de recuperación por pestaña cada 30 s. */
export const VENTANA_RECUPERACION_MS = 30_000;
export const CLAVE_RECUPERACION = 'go-auth-recuperacion-sesion';

/**
 * Destino interno seguro para volver tras recuperar la sesión: solo rutas
 * relativas del propio sitio. Nada de `//otro.dominio`, `/\otro`, esquemas ni
 * rutas de /auth (volvería al login). Ante la duda, `/app/inicio`.
 */
export function destinoInternoSeguro(raw: string | null | undefined): string {
  const porDefecto = '/app/inicio';
  if (!raw || typeof raw !== 'string') return porDefecto;
  const destino = raw.trim();
  if (!destino.startsWith('/') || destino.startsWith('//') || destino.startsWith('/\\')) return porDefecto;
  if (/[\u0000-\u001f]/.test(destino)) return porDefecto;
  if (destino === '/auth' || destino.startsWith('/auth/')) return porDefecto;
  return destino;
}

/**
 * Destino tras iniciar sesión (R15, docs/design/AUTH-ACCESO-V2.md §6): el mismo
 * filtro que `destinoInternoSeguro` (antes `redirectTo` de sessionStorage se
 * usaba sin validar), con UNA excepción: la vuelta al asistente de invitación
 * (`/auth/invite?invite_code=…`), que manda al login a quien ya tiene cuenta y
 * debe volver a aceptar.
 */
export function destinoTrasLogin(raw: string | null | undefined): string {
  const destino = typeof raw === 'string' ? raw.trim() : '';
  if (/^\/auth\/invite(\?|$)/.test(destino) && !/[\u0000-\u001f]/.test(destino)) return destino;
  return destinoInternoSeguro(destino);
}

/**
 * ¿Toca intentar la recuperación ahora? Registra el intento en `storage`
 * (sessionStorage de la pestaña) para no entrar en bucle si el refresco no
 * llega a la cookie que lee el middleware.
 */
export function registrarIntentoRecuperacion(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined,
  ahora: number = Date.now()
): boolean {
  if (!storage) return false;
  try {
    const previo = storage.getItem(CLAVE_RECUPERACION);
    const ultimo = previo === null ? NaN : Number(previo);
    if (Number.isFinite(ultimo) && ahora - ultimo < VENTANA_RECUPERACION_MS) return false;
    storage.setItem(CLAVE_RECUPERACION, String(ahora));
    return true;
  } catch {
    return false;
  }
}
