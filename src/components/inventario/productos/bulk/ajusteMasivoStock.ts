/**
 * Ajuste masivo de stock por el kardex.
 *
 * El ajuste lo hace el servidor: `fn_productos_ajuste_masivo_stock` (migración
 * 20260924190000) inserta un stock_movement de ajuste por producto con el
 * costo vigente y el trigger contable crea su asiento. Este módulo tiene:
 *
 * - Lo que usa el servicio: validación de la entrada, partición en lotes y
 *   suma de los resúmenes de cada lote.
 * - El modelo de referencia de la RPC (`calcularAjuste`,
 *   `expandirPadresVariantes`): fija en tests el contrato que la función SQL
 *   cumple (la misma batería se corrió contra la BD en una transacción que se
 *   deshizo). No se usa para escribir: la única implementación es la RPC.
 */

export type ModoStock = 'set' | 'add';

/** Productos por llamada a la RPC (la RPC acepta hasta 500; ~2 ms por ajuste). */
export const LOTE_AJUSTE_STOCK = 400;
/** Largo máximo del motivo que se guarda en la nota del movimiento. */
export const MAX_MOTIVO = 500;

export interface AjusteCalculado {
  /** Cantidad con la que queda la sucursal (nunca negativa). */
  objetivo: number;
  /** Diferencia con signo: > 0 entrada, < 0 salida, 0 sin movimiento. */
  delta: number;
  direccion: 'in' | 'out' | null;
  /** Cantidad del movimiento (valor absoluto de la diferencia). */
  cantidadMovimiento: number;
}

/**
 * Modelo de referencia: «set» deja la cantidad indicada, «add» la suma (o la
 * resta si es negativa). El resultado nunca baja de 0.
 */
export function calcularAjuste(actual: number, modo: ModoStock, cantidad: number): AjusteCalculado {
  const base = Number.isFinite(actual) ? actual : 0;
  const objetivo = Math.max(0, modo === 'set' ? cantidad : base + cantidad);
  const delta = objetivo - base;
  return {
    objetivo,
    delta,
    direccion: delta > 0 ? 'in' : delta < 0 ? 'out' : null,
    cantidadMovimiento: Math.abs(delta),
  };
}

export interface ProductoJerarquia {
  id: number;
  is_parent: boolean | null;
  parent_product_id: number | null;
  status?: string | null;
}

/**
 * Modelo de referencia de `fn_productos_int_expandir_variantes`: los
 * seleccionados, el padre de cada variante seleccionada y todas las variantes
 * de esos padres (y de los padres seleccionados). Sin eliminados.
 */
export function expandirPadresVariantes(seleccion: number[], productos: ProductoJerarquia[]): number[] {
  const vivos = productos.filter((p) => (p.status ?? 'active') !== 'deleted');
  const porId = new Map(vivos.map((p) => [p.id, p]));
  const elegidos = seleccion.map((id) => porId.get(id)).filter((p): p is ProductoJerarquia => !!p);

  const padres = new Set<number>();
  for (const p of elegidos) {
    if (p.is_parent) padres.add(p.id);
    if (p.parent_product_id !== null) padres.add(p.parent_product_id);
  }

  const resultado = new Set<number>(elegidos.map((p) => p.id));
  for (const id of padres) if (porId.has(id)) resultado.add(id);
  for (const p of vivos) if (p.parent_product_id !== null && padres.has(p.parent_product_id)) resultado.add(p.id);

  return Array.from(resultado).sort((a, b) => a - b);
}

/** Parte la lista en lotes consecutivos sin repetir ni perder elementos. */
export function partirEnLotes<T>(items: T[], tamano: number = LOTE_AJUSTE_STOCK): T[][] {
  if (tamano < 1) throw new Error('tamano_invalido');
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

export interface EntradaAjusteMasivo {
  productIds: number[];
  branchId: number | null;
  cantidad: number;
  modo: ModoStock;
  motivo?: string | null;
}

export type ErrorAjusteMasivo = 'productos' | 'sucursal' | 'cantidad' | 'modo';

export type ValidacionAjusteMasivo =
  | { ok: true; productIds: number[]; branchId: number; cantidad: number; modo: ModoStock; motivo: string | null }
  | { ok: false; error: ErrorAjusteMasivo };

/** Normaliza la entrada del diálogo: ids únicos, motivo recortado, cantidad finita. */
export function validarAjusteMasivo(entrada: EntradaAjusteMasivo): ValidacionAjusteMasivo {
  const ids = Array.from(new Set(entrada.productIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (ids.length === 0) return { ok: false, error: 'productos' };
  if (!entrada.branchId || !Number.isInteger(entrada.branchId) || entrada.branchId <= 0) return { ok: false, error: 'sucursal' };
  if (!Number.isFinite(entrada.cantidad)) return { ok: false, error: 'cantidad' };
  if (entrada.modo !== 'set' && entrada.modo !== 'add') return { ok: false, error: 'modo' };
  const motivo = (entrada.motivo ?? '').trim().slice(0, MAX_MOTIVO);
  return {
    ok: true,
    productIds: ids,
    branchId: entrada.branchId,
    cantidad: entrada.cantidad,
    modo: entrada.modo,
    motivo: motivo || null,
  };
}

/** Resumen que devuelve `fn_productos_ajuste_masivo_stock`. */
export interface ResumenAjusteStock {
  productos: number;
  ajustados: number;
  sin_cambio: number;
  sin_rastreo: number;
  entradas: number;
  salidas: number;
  unidades_entrada: number;
  unidades_salida: number;
  sin_costo: number;
}

export const RESUMEN_VACIO: ResumenAjusteStock = {
  productos: 0,
  ajustados: 0,
  sin_cambio: 0,
  sin_rastreo: 0,
  entradas: 0,
  salidas: 0,
  unidades_entrada: 0,
  unidades_salida: 0,
  sin_costo: 0,
};

/** Suma el resumen de un lote al acumulado (los números llegan como texto a veces). */
export function sumarResumen(acumulado: ResumenAjusteStock, lote: Partial<Record<keyof ResumenAjusteStock, unknown>>): ResumenAjusteStock {
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return {
    productos: acumulado.productos + n(lote.productos),
    ajustados: acumulado.ajustados + n(lote.ajustados),
    sin_cambio: acumulado.sin_cambio + n(lote.sin_cambio),
    sin_rastreo: acumulado.sin_rastreo + n(lote.sin_rastreo),
    entradas: acumulado.entradas + n(lote.entradas),
    salidas: acumulado.salidas + n(lote.salidas),
    unidades_entrada: acumulado.unidades_entrada + n(lote.unidades_entrada),
    unidades_salida: acumulado.unidades_salida + n(lote.unidades_salida),
    sin_costo: acumulado.sin_costo + n(lote.sin_costo),
  };
}
