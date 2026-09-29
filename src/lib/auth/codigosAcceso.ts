/**
 * Códigos de error del inicio de sesión (acceso v3). Isomórfico: lo usan la
 * ruta `POST /api/auth/acceso` y la pantalla, que los traduce (namespace
 * `acceso.login`). Un único código para credenciales malas: no se distingue
 * «el usuario no existe» de «la contraseña no es» (enumeración, §4.2).
 */

export type CodigoErrorLogin = 'credenciales' | 'sin_confirmar' | 'bloqueado' | 'demasiadas' | 'inesperado';

/** Traduce el error de Auth a un código. Nunca se muestra el texto crudo de Supabase. */
export function codigoDeErrorAuth(error: { message?: string; status?: number; code?: string } | null | undefined): CodigoErrorLogin {
  if (!error) return 'inesperado';
  const m = (error.message || '').toLowerCase();
  if (error.code === 'email_not_confirmed' || m.includes('email not confirmed')) return 'sin_confirmar';
  if (error.code === 'invalid_credentials' || m.includes('invalid login credentials') || m.includes('user not found')) {
    return 'credenciales';
  }
  if (error.status === 429 || m.includes('too many requests') || m.includes('rate limit')) return 'demasiadas';
  return 'inesperado';
}
