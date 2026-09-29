/**
 * Formato admitido para un código de invitación recibido del cliente. Los
 * códigos nuevos son hexadecimales de 64 (256 bits, `generarCodigoInvitacion`);
 * se admiten longitudes menores por los ya emitidos.
 *
 * Módulo sin dependencias de Node: lo usan el servidor (`invitaciones.ts`) y
 * el navegador (el selector de organización, al pegar un enlace).
 */
const CODIGO_RE = /^[A-Za-z0-9_-]{6,128}$/;

export function esFormatoCodigoValido(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && CODIGO_RE.test(codigo);
}
