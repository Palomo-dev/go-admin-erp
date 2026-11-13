/**
 * Reglas puras del detalle de un canal (sin React).
 */
import type { FormaConexion } from '../canalesLogica';

/** «EAAG••••••••7Qx»: los primeros 4 y los últimos 3; si es corto, todo con puntos. */
export function enmascarar(valor: string | null | undefined): string {
  if (!valor) return '';
  if (valor.length <= 8) return '•'.repeat(valor.length);
  return `${valor.slice(0, 4)}${'•'.repeat(Math.min(20, valor.length - 7))}${valor.slice(-3)}`;
}

/** Pestaña de conexión de WhatsApp a partir de `?conexion=` o de lo guardado. */
export function pestanaConexionInicial(param: string | null, guardada: FormaConexion | null | undefined): FormaConexion {
  if (param === 'cloud_api' || param === 'coexistence' || param === 'qr_scan') return param;
  return guardada ?? 'cloud_api';
}
