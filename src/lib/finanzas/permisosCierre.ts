/**
 * Permisos de cierre y reapertura. El mismo código lo exige la función en
 * la base. No se infieren del rol ni del cargo.
 */
export const PERMISO_CERRAR_PERIODO = 'accounting.period.close';
export const PERMISO_REABRIR_PERIODO = 'accounting.period.reopen';
export const PERMISO_CERRAR_EJERCICIO = 'accounting.fiscal_year.close';
export const PERMISO_REABRIR_EJERCICIO = 'accounting.fiscal_year.reopen';

export interface PeriodoParaBoton {
  status: string;
  period_type: string;
}

/** Reabrir un período anual es reabrir el ejercicio: no hay otra función. */
export function permisoReabrir(periodo: PeriodoParaBoton): string {
  return periodo.period_type === 'yearly' ? PERMISO_REABRIR_EJERCICIO : PERMISO_REABRIR_PERIODO;
}

/**
 * El botón solo existe con su permiso y con el estado que la acción admite.
 * Mientras los permisos cargan no se muestra: un instante en false no debe
 * pintar la acción.
 */
export function botonesDePeriodo(
  periodo: PeriodoParaBoton,
  puede: (codigo: string) => boolean,
  cargando: boolean,
): { cerrar: boolean; reabrir: boolean } {
  if (cargando) return { cerrar: false, reabrir: false };
  return {
    cerrar: periodo.status === 'open' && puede(PERMISO_CERRAR_PERIODO),
    reabrir: periodo.status === 'closed' && puede(permisoReabrir(periodo)),
  };
}

export function avisoPeriodo(error: unknown, fallback: string): string {
  const msg = typeof error === 'object' && error && 'message' in error
    ? String((error as { message: unknown }).message)
    : '';
  if (msg.includes('sin_permiso')) return 'No tiene permiso para esta acción.';
  if (msg.includes('faltan_cuentas_cierre')) {
    return 'Falta la cuenta de movimiento 3605, o 3610 para registrar la pérdida.';
  }
  if (msg.includes('periodo_cerrado') || msg.includes('periodo_no_abierto')) return 'Ese periodo no está abierto.';
  if (msg.includes('periodo_no_cerrado')) return 'Ese periodo no está cerrado.';
  if (msg.includes('sin_sucursal')) return 'La organización no tiene sucursal.';
  return fallback;
}
