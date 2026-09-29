/**
 * Catálogo ÚNICO de avisos del login a partir de la URL (R1, docs/design/AUTH-ACCESO-V2.md
 * §2.1 y §6): `?error=`, `?success=`, `?reason=`.
 *
 * Antes solo tres `error` tenían texto, nueve caían en «Error al iniciar
 * sesión», `success=email-changed` no se mostraba nunca y `success=email-confirmed`
 * pintaba el texto que viniera en `?message=` (texto arbitrario desde la URL).
 * Ahora cada código tiene su clave de traducción (`acceso.login…`) y `message`
 * y `details` de la URL se ignoran.
 */
import type { TonoAviso } from '@/components/kit/acceso/piezas';

export interface AvisoUrl {
  tono: TonoAviso;
  /** Clave dentro de `acceso.login`. */
  clave: string;
  /** Clave del título (opcional). */
  titulo?: string;
}

export const ERRORES_CONOCIDOS = [
  'corrupted-session',
  'auth-failed',
  'access_denied',
  'google-session-expired',
  'session-failed',
  'redirect-failed',
  'invalid-verification-link',
  'email-verification-failed',
  'email-verification-error',
  'verification-failed',
  'callback-processing-failed',
  'native-callback-invalid-params',
] as const;

const EXITOS: Record<string, string> = {
  'email-confirmed': 'correoConfirmado',
  'email-changed': 'correoCambiado',
  'password-updated': 'contrasenaCambiada',
};

type Parametros = Pick<URLSearchParams, 'get'> | null | undefined;

export function avisoDesdeParametros(params: Parametros): AvisoUrl | null {
  if (!params) return null;
  const error = params.get('error');
  if (error) {
    const conocido = (ERRORES_CONOCIDOS as readonly string[]).includes(error);
    return { tono: 'error', clave: `errores.${conocido ? error : 'generico'}` };
  }
  const exito = params.get('success');
  if (exito && EXITOS[exito]) return { tono: 'exito', clave: EXITOS[exito] };
  const motivo = params.get('reason');
  if (motivo === 'logout') return { tono: 'info', clave: 'sesionCerrada' };
  if (params.get('message') === 'email-not-confirmed') return { tono: 'advertencia', clave: 'sinConfirmar', titulo: 'sinConfirmarTitulo' };
  return null;
}

/** ¿El login viene de una sesión vencida? (el aviso se muestra solo si no se pudo recuperar). */
export function vieneDeSesionVencida(params: Parametros): boolean {
  return !!params && (params.get('reason') === 'expired' || params.get('reason') === 'session-invalidated');
}

/** `persona@ejemplo.com` → `pe•••@ejemplo.com` (para mostrar un correo que viene de la URL). */
export function enmascararCorreoVisible(correo: string | null | undefined): string | null {
  if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return null;
  const [usuario, dominio] = correo.split('@');
  return `${usuario.slice(0, Math.min(2, Math.max(1, usuario.length - 1)))}•••@${dominio}`;
}
