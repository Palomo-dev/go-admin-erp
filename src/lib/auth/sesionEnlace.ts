/**
 * ¿La sesión se abrió hace poco desde un ENLACE DEL CORREO? (R8,
 * docs/design/AUTH-ACCESO-V2.md §2.4 y §6).
 *
 * Antes, `/auth/reset-password` mostraba el formulario con CUALQUIER sesión
 * abierta y cambiaba la contraseña sin pedir la actual: quien encontrara una
 * pestaña abierta se quedaba con la cuenta. Ahora solo se permite si el `amr`
 * del token (ya verificado) trae un método de enlace de correo —recuperación,
 * invitación, enlace mágico u OTP— de los últimos 60 minutos. Un inicio con
 * contraseña (`password`) o con Google (`oauth`) no sirve.
 */
export const METODOS_ENLACE_CORREO = ['recovery', 'otp', 'magiclink', 'invite', 'email/signup', 'signup'] as const;
export const VENTANA_ENLACE_SEGUNDOS = 60 * 60;

export function esSesionDeEnlaceReciente(
  amr: { method: string; timestamp: number }[] | undefined,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
  ventanaSegundos: number = VENTANA_ENLACE_SEGUNDOS,
): boolean {
  if (!amr || amr.length === 0) return false;
  return amr.some(
    (a) =>
      (METODOS_ENLACE_CORREO as readonly string[]).includes(a.method) &&
      a.timestamp <= ahoraSegundos + 60 &&
      ahoraSegundos - a.timestamp <= ventanaSegundos,
  );
}
