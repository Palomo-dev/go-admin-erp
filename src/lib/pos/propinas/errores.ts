/**
 * Códigos de error de Propinas. Las funciones de la base levantan
 * `CODIGO: detalle` (migraciones 20260925110000 y 20261120200000); la RLS
 * responde 42501. La pantalla traduce cada código con
 * `posPropinas.errores.<CODIGO>`. Módulo hoja, sin dependencias: lo usan el
 * servidor (route handlers) y el navegador.
 */

export const CODIGOS_ERROR_PROPINA = [
  'SIN_PERMISO',
  'PROPINA_DISTRIBUIDA',
  'PROPINA_ANULADA',
  'PROPINA_CON_ASIENTO',
  'PROPINA_INEXISTENTE',
  'PERIODO_CERRADO',
  'SIN_SUCURSAL',
  'MOTIVO_REQUERIDO',
  'MOTIVO_AJUSTE_REQUERIDO',
  'SIN_PROPINAS',
  'PROPINAS_NO_DISPONIBLES',
  'VENTA_ABIERTA',
  'REPARTO_INVALIDO',
  'PORCENTAJES_INVALIDOS',
  'PERSONA_INVALIDA',
  'AJUSTES_NO_SUMAN_CERO',
  'AJUSTE_NEGATIVO',
  'MEDIO_INVALIDO',
  'REFERENCIA_REQUERIDA',
  'CAJA_CERRADA',
  'LIQUIDACION_INEXISTENTE',
  'SOLICITUD_REQUERIDA',
  'DATOS_INVALIDOS',
  'DESCONOCIDO',
] as const;
export type CodigoErrorPropina = (typeof CODIGOS_ERROR_PROPINA)[number];

export class PropinaError extends Error {
  constructor(
    public readonly codigo: CodigoErrorPropina,
    detalle?: string,
  ) {
    super(detalle || codigo);
    this.name = 'PropinaError';
  }
}

export function esCodigoErrorPropina(valor: unknown): valor is CodigoErrorPropina {
  return typeof valor === 'string' && (CODIGOS_ERROR_PROPINA as readonly string[]).includes(valor);
}

/** Traduce un error de Supabase/Postgres (o de la API) al código de la pantalla. */
export function codigoErrorPropina(error: unknown): CodigoErrorPropina {
  if (error instanceof PropinaError) return error.codigo;
  const e = (error ?? {}) as { code?: string; message?: string; codigo?: string };
  if (esCodigoErrorPropina(e.codigo)) return e.codigo;
  const mensaje = e.message || '';
  for (const codigo of CODIGOS_ERROR_PROPINA) {
    if (mensaje.startsWith(codigo) || mensaje.includes(`${codigo}:`)) return codigo;
  }
  if (e.code === '42501' || /row-level security|permission denied|SESION_REQUERIDA/i.test(mensaje)) return 'SIN_PERMISO';
  if (e.code === 'P0002') return 'PROPINA_INEXISTENTE';
  if (/FILTROS_INVALIDOS|SUCURSAL_INVALIDA/.test(mensaje)) return 'DATOS_INVALIDOS';
  return 'DESCONOCIDO';
}

/** Error listo para lanzar desde un servicio. */
export function errorPropina(error: unknown): PropinaError {
  if (error instanceof PropinaError) return error;
  const mensaje = (error as { message?: string } | null)?.message;
  return new PropinaError(codigoErrorPropina(error), mensaje);
}

/** Estado HTTP con que la API responde cada código. */
export function estadoHttpDe(codigo: CodigoErrorPropina): number {
  if (codigo === 'SIN_PERMISO') return 403;
  if (codigo === 'PROPINA_INEXISTENTE' || codigo === 'LIQUIDACION_INEXISTENTE') return 404;
  if (codigo === 'DESCONOCIDO') return 500;
  if (codigo === 'CAJA_CERRADA' || codigo === 'PROPINAS_NO_DISPONIBLES' || codigo === 'PROPINA_DISTRIBUIDA' || codigo === 'PROPINA_ANULADA')
    return 409;
  return 400;
}
