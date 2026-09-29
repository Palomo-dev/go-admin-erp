/**
 * Resultado de las acciones masivas del catálogo que corren en el servidor
 * (migración 20260929160100_inv_b7_2_acciones_masivas):
 *
 * - `fn_productos_precio_masivo` → { cambiados, sin_cambio, no_encontrados, omitidos, ejemplos }
 * - `fn_productos_estado_masivo` / `fn_productos_categoria_masiva`
 *   → { actualizados, seleccionados, variantes, no_encontrados }
 *
 * Este módulo es puro: convierte esos resúmenes en el `ResultadoMasivo` que
 * pinta `AccionesMasivas` (conteos y códigos de `productos.masivas.errores`).
 */

export type CodigoErrorMasivo =
  | 'expandir'
  | 'sinProductos'
  | 'sinCostoPrevio'
  | 'sinPrecio'
  | 'sinCosto'
  | 'sinPermiso'
  | 'noEncontrados'
  | 'lote'
  | 'detalle';

export interface ErrorMasivo {
  codigo: CodigoErrorMasivo;
  valores?: Record<string, string | number>;
}

export interface ResultadoMasivo {
  exitosos: number;
  fallidos: number;
  errores: ErrorMasivo[];
}

export const errorMasivo = (codigo: CodigoErrorMasivo, valores?: Record<string, string | number>): ErrorMasivo =>
  valores ? { codigo, valores } : { codigo };

export const resultadoVacio = (): ResultadoMasivo => ({ exitosos: 0, fallidos: 0, errores: [] });

/** Productos por llamada a `fn_productos_precio_masivo` (acepta hasta 1.000). */
export const LOTE_PRECIOS = 250;
/** Productos por llamada a estado y categoría masivos (aceptan hasta 5.000). */
export const LOTE_CATALOGO = 1000;

export interface ResumenPrecioMasivo {
  cambiados?: number;
  sin_cambio?: number;
  no_encontrados?: number;
  omitidos?: Record<string, number>;
  ejemplos?: Record<string, number[]>;
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Motivos de omisión de la RPC. Los que no son fallo (ya tenía precio de
 * comparación, no tenía comparación que redondear) cuentan como hechos o se
 * ignoran, igual que antes en el navegador.
 */
export function sumarResumenPrecios(acum: ResultadoMasivo, r: ResumenPrecioMasivo | null | undefined): ResultadoMasivo {
  if (!r) return acum;
  const omitidos = r.omitidos ?? {};
  const ejemplos = r.ejemplos ?? {};
  const out: ResultadoMasivo = {
    exitosos: acum.exitosos + num(r.cambiados) + num(r.sin_cambio) + num(omitidos.ya_tiene_comparacion),
    fallidos: acum.fallidos,
    errores: [...acum.errores],
  };
  const primer = (clave: string) => (Array.isArray(ejemplos[clave]) && ejemplos[clave].length > 0 ? ejemplos[clave][0] : '—');
  const sinCostoPrevio = num(omitidos.sin_costo_previo);
  if (sinCostoPrevio > 0) {
    out.fallidos += sinCostoPrevio;
    out.errores.push(errorMasivo('sinCostoPrevio', { count: sinCostoPrevio, n: sinCostoPrevio }));
  }
  const sinPrecio = num(omitidos.sin_precio);
  if (sinPrecio > 0) {
    out.fallidos += sinPrecio;
    out.errores.push(errorMasivo('sinPrecio', { producto: primer('sin_precio') }));
  }
  const sinCosto = num(omitidos.sin_costo);
  if (sinCosto > 0) {
    out.fallidos += sinCosto;
    out.errores.push(errorMasivo('sinCosto', { producto: primer('sin_costo') }));
  }
  const noEncontrados = num(r.no_encontrados);
  if (noEncontrados > 0) {
    out.fallidos += noEncontrados;
    out.errores.push(errorMasivo('noEncontrados', { count: noEncontrados, n: noEncontrados }));
  }
  return out;
}

export interface ResumenCatalogoMasivo {
  actualizados?: number;
  seleccionados?: number;
  variantes?: number;
  no_encontrados?: number;
}

/**
 * Estado y categoría: cuentan los seleccionados que quedaron con el valor (los
 * que ya lo tenían también), más las variantes que arrastró cada padre.
 */
export function sumarResumenCatalogo(acum: ResultadoMasivo, r: ResumenCatalogoMasivo | null | undefined): ResultadoMasivo {
  if (!r) return acum;
  const out: ResultadoMasivo = {
    exitosos: acum.exitosos + num(r.seleccionados) + num(r.variantes),
    fallidos: acum.fallidos,
    errores: [...acum.errores],
  };
  const noEncontrados = num(r.no_encontrados);
  if (noEncontrados > 0) {
    out.fallidos += noEncontrados;
    out.errores.push(errorMasivo('noEncontrados', { count: noEncontrados, n: noEncontrados }));
  }
  return out;
}

/** Error de la RPC → código legible (`sin_permiso` / 42501 → sinPermiso). */
export function errorDeRpc(error: { code?: string | null; message?: string | null } | null | undefined, desde: number, hasta: number): ErrorMasivo {
  if (error?.code === '42501' || /sin_permiso/.test(error?.message ?? '')) return errorMasivo('sinPermiso');
  return errorMasivo('lote', { desde, hasta, detalle: error?.message ?? 'error' });
}
