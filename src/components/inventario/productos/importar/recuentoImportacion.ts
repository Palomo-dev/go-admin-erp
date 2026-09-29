/**
 * Recuento del resultado de la importación (PARIDAD-ORGANIZACION-COMPRAS-IMPORT
 * D5): Importados · Omitidos (ya existían) · Fallidos · Sin intentar, y la
 * línea que demuestra que suma el total seleccionado.
 *
 * - Omitidos = lo que el servidor saltó por el modo elegido (`accion:
 *   'omitido'`); no es un fallo.
 * - Sin intentar = filas de lotes que no llegaron a enviarse (se detuvo).
 * - Si el servidor devolviera menos resultados de los enviados, la diferencia
 *   se cuenta como fallida: el recuento nunca pierde filas.
 */
export interface EjecucionContable {
  total: number;
  procesadas: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
}

export interface RecuentoImportacion {
  seleccionados: number;
  importados: number;
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
  sinIntentar: number;
}

const n = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function recuentoImportacion(e: EjecucionContable): RecuentoImportacion {
  const seleccionados = n(e.total);
  const procesadas = Math.min(n(e.procesadas), seleccionados);
  const creados = n(e.creados);
  const actualizados = n(e.actualizados);
  const omitidos = n(e.omitidos);
  const contados = creados + actualizados + omitidos + n(e.fallidos);
  const fallidos = n(e.fallidos) + Math.max(0, procesadas - contados);
  return {
    seleccionados,
    importados: creados + actualizados,
    creados,
    actualizados,
    omitidos,
    fallidos,
    sinIntentar: seleccionados - procesadas,
  };
}
