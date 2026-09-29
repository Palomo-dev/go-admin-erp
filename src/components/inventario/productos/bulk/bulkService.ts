/**
 * Acciones masivas del catálogo de productos. Todo corre en el servidor:
 *
 * - Precio, comparación y costo: `fn_productos_masivo_alcance` expande la
 *   selección una sola vez (padre ↔ variantes) y `fn_productos_precio_masivo`
 *   fija cada producto por lotes con la misma regla de vigencia del detalle
 *   (`fn_producto_int_fijar_precio/costo`). Ya no se cierra ni se inserta
 *   `product_prices`/`product_costs` desde el navegador (así nacieron las
 *   vigencias duplicadas de D19/D20) ni se pisa `stock_levels.avg_cost`.
 * - Estado (incluido eliminar) y categoría: `fn_productos_estado_masivo` y
 *   `fn_productos_categoria_masiva`, que arrastran las variantes de los padres.
 * - Stock: `fn_productos_ajuste_masivo_stock` por el kardex.
 *
 * Migración 20260929160100_inv_b7_2_acciones_masivas. Permisos en el servidor.
 */
import { supabase } from '@/lib/supabase/config';
import {
  partirEnLotes,
  RESUMEN_VACIO,
  sumarResumen,
  validarAjusteMasivo,
  type ModoStock,
  type ResumenAjusteStock,
} from './ajusteMasivoStock';
import {
  errorDeRpc,
  errorMasivo,
  LOTE_CATALOGO,
  LOTE_PRECIOS,
  resultadoVacio,
  sumarResumenCatalogo,
  sumarResumenPrecios,
  type ResultadoMasivo,
  type ResumenCatalogoMasivo,
  type ResumenPrecioMasivo,
} from './resumenMasivo';

export type { ModoStock } from './ajusteMasivoStock';
export type { CodigoErrorMasivo, ErrorMasivo, ResultadoMasivo } from './resumenMasivo';
export type TipoPrecio = 'venta' | 'compra' | 'comparacion';
export type ModoAjuste = 'fijo' | 'valor' | 'porcentaje';
export type ModoRedondeo = 'multiplo' | 'digitos';

type OperacionPrecio = 'ajustar' | 'redondear' | 'copiar_a_comparacion';

interface ConteoMasivo {
  exitosos: number;
  fallidos: number;
}

/** Ids enteros positivos sin repetir. */
const idsValidos = (ids: readonly number[]): number[] =>
  Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));

/**
 * Precio/costo masivo: una expansión para toda la selección y lotes sin
 * repetir un producto (un porcentaje nunca se aplica dos veces a la misma
 * variante). Cada lote es una transacción.
 */
async function precioMasivo(
  organizationId: number,
  productIds: number[],
  tipo: TipoPrecio,
  operacion: OperacionPrecio,
  opciones: Record<string, unknown>,
): Promise<ResultadoMasivo> {
  let resultado = resultadoVacio();
  const seleccion = idsValidos(productIds);
  if (seleccion.length === 0) {
    resultado.errores.push(errorMasivo('sinProductos'));
    return resultado;
  }
  const { data: alcance, error: errorAlcance } = await supabase.rpc('fn_productos_masivo_alcance', {
    p_organization_id: organizationId,
    p_product_ids: seleccion,
  });
  if (errorAlcance) {
    resultado.fallidos = seleccion.length;
    resultado.errores.push(errorAlcance.code === '42501' ? errorMasivo('sinPermiso') : errorMasivo('expandir'));
    return resultado;
  }
  const ids = ((alcance as number[] | null) ?? []).map(Number);
  if (ids.length === 0) {
    resultado.fallidos = seleccion.length;
    resultado.errores.push(errorMasivo('sinProductos'));
    return resultado;
  }
  let desde = 0;
  for (const lote of partirEnLotes(ids, LOTE_PRECIOS)) {
    const { data, error } = await supabase.rpc('fn_productos_precio_masivo', {
      p_organization_id: organizationId,
      p_product_ids: lote,
      p_tipo: tipo,
      p_operacion: operacion,
      p_opciones: opciones,
    });
    if (error) {
      resultado.fallidos += lote.length;
      resultado.errores.push(errorDeRpc(error, desde, desde + lote.length));
    } else {
      resultado = sumarResumenPrecios(resultado, data as ResumenPrecioMasivo);
    }
    desde += lote.length;
  }
  return resultado;
}

/** Actualización masiva de precio de venta, de comparación o de costo. */
export function bulkUpdatePrices(
  organizationId: number,
  productIds: number[],
  tipo: TipoPrecio,
  modo: ModoAjuste,
  cantidad: number,
): Promise<ResultadoMasivo> {
  return precioMasivo(organizationId, productIds, tipo, 'ajustar', { modo, cantidad });
}

/**
 * Copia el precio de venta al de comparación (los que ya tienen uno se dejan,
 * salvo `sobrescribir`).
 */
export function bulkCopyPriceToCompare(
  organizationId: number,
  productIds: number[],
  sobrescribir: boolean = false,
): Promise<ResultadoMasivo> {
  return precioMasivo(organizationId, productIds, 'venta', 'copiar_a_comparacion', { sobrescribir });
}

/**
 * Redondeo masivo: `multiplo` (al múltiplo más cercano) o `digitos` (reemplaza
 * los últimos N dígitos por `digitosValor`). Mismo cálculo que antes, ahora en
 * `fn_productos_int_redondear`.
 */
export function bulkRoundPrices(
  organizationId: number,
  productIds: number[],
  tipo: TipoPrecio,
  modo: ModoRedondeo,
  multiplo: number,
  digitosCount: number,
  digitosValor: string,
): Promise<ResultadoMasivo> {
  return precioMasivo(organizationId, productIds, tipo, 'redondear', {
    modo,
    multiplo,
    digitos: digitosCount,
    valor: digitosValor,
  });
}

export interface ResultadoAjusteStock extends ConteoMasivo {
  /** Códigos de validación (`sucursal`, `sin_permiso`…) o el mensaje de la base. */
  errores: string[];
  /** Suma de los resúmenes de la RPC (entradas, salidas, sin costo…). */
  resumen: ResumenAjusteStock;
}

/**
 * Ajuste masivo de stock en una sucursal, por el kardex.
 *
 * Todo ocurre en el servidor: `fn_productos_stock_masivo_alcance` expande la
 * selección (padre ↔ variantes) y devuelve solo los que rastrean inventario;
 * después, por lotes, `fn_productos_ajuste_masivo_stock` inserta por cada
 * producto un stock_movement de ajuste (entrada o salida por la diferencia,
 * al costo vigente, nota «Ajuste masivo · usuario · motivo») y el trigger
 * contable crea su asiento. Cada lote es una transacción. El resultado nunca
 * baja de 0. Permiso (inventory.adjust / inventory_management) resuelto en el
 * servidor.
 */
export async function bulkUpdateStock(
  organizationId: number,
  productIds: number[],
  branchId: number,
  cantidad: number,
  modo: ModoStock,
  motivo?: string | null
): Promise<ResultadoAjusteStock> {
  const resultado: ResultadoAjusteStock = { exitosos: 0, fallidos: 0, errores: [], resumen: { ...RESUMEN_VACIO } };
  const entrada = validarAjusteMasivo({ productIds, branchId, cantidad, modo, motivo });
  if (!entrada.ok) {
    resultado.fallidos = productIds.length;
    resultado.errores.push(entrada.error);
    return resultado;
  }

  // 1. Alcance: una sola expansión para toda la selección, así un padre y su
  //    variante nunca caen en lotes distintos (en «sumar» se sumaría dos veces).
  const { data: alcance, error: errorAlcance } = await supabase.rpc('fn_productos_stock_masivo_alcance', {
    p_organization_id: organizationId,
    p_product_ids: entrada.productIds,
  });
  if (errorAlcance) {
    resultado.fallidos = entrada.productIds.length;
    resultado.errores.push(errorAlcance.message);
    return resultado;
  }
  const ids = ((alcance as number[] | null) ?? []).map(Number);

  // 2. Ajuste por lotes (cada uno atómico).
  for (const lote of partirEnLotes(ids)) {
    const { data, error } = await supabase.rpc('fn_productos_ajuste_masivo_stock', {
      p_organization_id: organizationId,
      p_product_ids: lote,
      p_branch_id: entrada.branchId,
      p_modo: entrada.modo,
      p_cantidad: entrada.cantidad,
      p_motivo: entrada.motivo,
      p_expandir: false,
    });
    if (error) {
      resultado.fallidos += lote.length;
      resultado.errores.push(error.message);
      continue;
    }
    resultado.resumen = sumarResumen(resultado.resumen, (data ?? {}) as Partial<Record<keyof ResumenAjusteStock, unknown>>);
  }
  resultado.exitosos = resultado.resumen.ajustados + resultado.resumen.sin_cambio;
  return resultado;
}

/** Estado y categoría: lotes de la selección; el servidor suma las variantes. */
async function catalogoMasivo(
  productIds: number[],
  llamar: (lote: number[]) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>,
): Promise<ResultadoMasivo> {
  let resultado = resultadoVacio();
  const seleccion = idsValidos(productIds);
  if (seleccion.length === 0) {
    resultado.errores.push(errorMasivo('sinProductos'));
    return resultado;
  }
  let desde = 0;
  for (const lote of partirEnLotes(seleccion, LOTE_CATALOGO)) {
    const { data, error } = await llamar(lote);
    if (error) {
      resultado.fallidos += lote.length;
      resultado.errores.push(errorDeRpc(error, desde, desde + lote.length));
    } else {
      resultado = sumarResumenCatalogo(resultado, data as ResumenCatalogoMasivo);
    }
    desde += lote.length;
  }
  return resultado;
}

/** Cambio masivo de estado (activar, desactivar, descontinuar); incluye variantes. */
export function bulkUpdateStatus(
  organizationId: number,
  productIds: number[],
  status: 'active' | 'inactive' | 'discontinued',
): Promise<ResultadoMasivo> {
  return catalogoMasivo(productIds, (lote) =>
    supabase.rpc('fn_productos_estado_masivo', { p_organization_id: organizationId, p_product_ids: lote, p_status: status }),
  );
}

/** Eliminación masiva (estado `deleted`, con el permiso de eliminar); incluye variantes. */
export function bulkDelete(organizationId: number, productIds: number[]): Promise<ResultadoMasivo> {
  return catalogoMasivo(productIds, (lote) =>
    supabase.rpc('fn_productos_estado_masivo', { p_organization_id: organizationId, p_product_ids: lote, p_status: 'deleted' }),
  );
}

/** Asignación masiva de categoría; incluye variantes. */
export function bulkAssignCategory(organizationId: number, productIds: number[], categoryId: number): Promise<ResultadoMasivo> {
  return catalogoMasivo(productIds, (lote) =>
    supabase.rpc('fn_productos_categoria_masiva', { p_organization_id: organizationId, p_product_ids: lote, p_category_id: categoryId }),
  );
}
