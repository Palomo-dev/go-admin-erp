/**
 * Deducciones de nómina que no se calculan solas.
 *
 * `null` no es cero: es «sin calcular». La retención en la fuente no tiene regla verificada y la
 * escribe una persona; un 0 escrito a mano significa «no aplica». Con `null`, ni la colilla se
 * aprueba ni el periodo se cierra: lo exigen los disparadores de `payroll_slips` y
 * `payroll_periods`, no esta pantalla.
 */

export interface ColillaDeducciones {
  tax_withholding: number | null;
  loan_deductions: number | null;
}

export type EstadoRetencion = 'sin_calcular' | 'no_aplica' | 'con_valor';

export function estadoRetencion(valor: number | null | undefined): EstadoRetencion {
  if (valor === null || valor === undefined) return 'sin_calcular';
  return Number(valor) === 0 ? 'no_aplica' : 'con_valor';
}

export function colillaCompleta(c: ColillaDeducciones): boolean {
  return c.tax_withholding !== null && c.tax_withholding !== undefined
    && c.loan_deductions !== null && c.loan_deductions !== undefined;
}

export function colillasPendientes<T extends ColillaDeducciones>(colillas: readonly T[]): T[] {
  return colillas.filter((c) => !colillaCompleta(c));
}

/** Las colillas que manda en un periodo: la ejecución final y, si no hay, la última. */
export function ejecucionVigente<T extends { is_final: boolean | null; run_number: number }>(
  ejecuciones: readonly T[],
): T | null {
  return ejecuciones.reduce<T | null>((mejor, r) => {
    if (!mejor) return r;
    if (Boolean(r.is_final) !== Boolean(mejor.is_final)) return r.is_final ? r : mejor;
    return r.run_number > mejor.run_number ? r : mejor;
  }, null);
}

/** Error de la base que significa «hay deducciones sin calcular». */
export function esBloqueoDeduccion(e: unknown): boolean {
  const mensaje = (e as { message?: string } | null)?.message ?? '';
  return mensaje.includes('NOMINA_CIERRE_BLOQUEADO') || mensaje.includes('NOMINA_DEDUCCION_SIN_CALCULAR');
}
