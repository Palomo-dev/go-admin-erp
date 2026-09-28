/**
 * Traduce los errores de las RPC de monedas de la organización a una clave del
 * namespace `monedasSeguridad` (es/en/fr/pt).
 *
 * Las RPC (migración 20260928145431_gosec_monedas_rpc_permiso_y_base_unica)
 * resuelven el permiso en la base: `fn_finanzas_exigir_permiso` lanza
 * `sin_permiso` (42501), `set_organization_base_currency` lanza
 * `moneda_no_asignada` y `remove_organization_currency`
 * `moneda_base_no_se_elimina`. Sin esta traducción el usuario vería el código
 * crudo.
 */
export type ClaveErrorMoneda = 'sinPermiso' | 'monedaNoAsignada' | 'monedaBaseNoSeElimina';

export function claveErrorMoneda(error: unknown): ClaveErrorMoneda | null {
  const e = (error ?? {}) as { message?: unknown; code?: unknown };
  const mensaje = typeof e.message === 'string' ? e.message : '';
  const codigo = typeof e.code === 'string' ? e.code : '';
  if (mensaje.includes('sin_permiso') || codigo === '42501') return 'sinPermiso';
  if (mensaje.includes('moneda_no_asignada')) return 'monedaNoAsignada';
  if (mensaje.includes('moneda_base_no_se_elimina')) return 'monedaBaseNoSeElimina';
  return null;
}

/** Mensaje para mostrar: la traducción si el error es conocido, si no el del servidor. */
export function mensajeErrorMoneda(error: unknown, t: (clave: ClaveErrorMoneda) => string): string {
  const clave = claveErrorMoneda(error);
  if (clave) return t(clave);
  const e = (error ?? {}) as { message?: unknown };
  return typeof e.message === 'string' ? e.message : String(error);
}
