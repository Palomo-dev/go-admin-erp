/**
 * Rutas de acceso que dejaron de ser pantalla y redirigen (tabla R1-R15 de
 * docs/design/AUTH-ACCESO-V2.md §6). Ningún enlace existente se rompe: correos
 * ya enviados, marcadores y código viejo llegan al sitio nuevo con sus datos.
 *
 * Funciones puras (las usan los route handlers y las pruebas).
 */
import { destinoInternoSeguro } from '@/lib/auth/recuperacionSesion';

/** R2 · `/auth/session-expired` → login con el aviso de sesión vencida (y el regreso validado). */
export function destinoSesionVencida(params: URLSearchParams): string {
  const destino = new URLSearchParams({ reason: 'expired' });
  const regreso = params.get('redirectTo');
  if (regreso) destino.set('redirectTo', destinoInternoSeguro(regreso));
  return `/auth/login?${destino.toString()}`;
}

/** R9 · `/auth/verify/resent?email=…` → la pantalla única en estado «reenviado». */
export function destinoVerificacionReenviada(params: URLSearchParams): string {
  const destino = new URLSearchParams({ estado: 'reenviado' });
  const tipo = params.get('type');
  if (tipo && /^[a-z_]{3,20}$/.test(tipo)) destino.set('type', tipo);
  const correo = params.get('email');
  if (correo && correo.length <= 254) destino.set('email', correo);
  return `/auth/verify/failed?${destino.toString()}`;
}
