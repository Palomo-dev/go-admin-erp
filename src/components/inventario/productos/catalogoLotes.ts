/**
 * Carga del catálogo de productos por lotes (RPC `catalogo_productos_lote`).
 *
 * El servidor devuelve cada producto padre armado: precio y costo vigentes,
 * stock por sucursal (lotes ya sumados), imágenes, modificadores y sus
 * variantes con su propio precio, costo y stock. Aquí solo se traduce la fila
 * al tipo `Producto` que usa la tabla.
 *
 * Antes el navegador traía los productos de a 1.000 y lanzaba seis consultas
 * más por lote, en serie; con el catálogo más grande (2.636 productos y
 * 21.142 variantes) la lista tardaba en completarse y se sentía lenta.
 */
import { supabase } from '@/lib/supabase/config';
import type { Producto, NivelSucursal } from './types';

/** Tamaño del primer lote: lo justo para llenar la primera página y quitar el skeleton. */
export const PRIMER_LOTE = 60;
/** Tamaño de los lotes siguientes (≈ 1 MB y ~110 ms en el catálogo más grande). */
export const LOTE = 200;
/** Lotes que se piden a la vez. */
export const LOTES_EN_PARALELO = 4;

export interface ParametrosCatalogo {
  organizationId: number;
  busqueda: string;
  categoria: number | null;
  /** `null` = todo menos eliminados · `'todos'` = incluye eliminados · o un estado concreto. */
  estado: string | null;
  ordenarPor: string;
}

export interface RespuestaLote {
  productos: Producto[];
  total: number;
}

type NivelCrudo = { branch_id: number; qty_on_hand: number | string; qty_reserved?: number | string | null };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Unidades disponibles (existencia − reservado) de una lista de niveles. */
function disponible(niveles: NivelCrudo[] | undefined): number {
  return (niveles ?? []).reduce((s, sl) => s + num(sl.qty_on_hand) - num(sl.qty_reserved), 0);
}

/**
 * Stock por sucursal del producto COMPLETO: el propio padre más todas sus
 * variantes, sumado por sucursal. Es lo que pintan los badges de la columna
 * Stock; antes solo se veían las filas del padre (que suele tener 0) y no las
 * de las variantes.
 */
export function stockPorSucursalConVariantes(
  propio: NivelCrudo[] | undefined,
  variantes: Array<{ stock_levels?: NivelCrudo[] | null }> | undefined
): NivelSucursal[] {
  const porSucursal = new Map<number, { qty_on_hand: number; qty_reserved: number }>();
  const sumar = (niveles: NivelCrudo[] | null | undefined) => {
    for (const sl of niveles ?? []) {
      const acc = porSucursal.get(sl.branch_id) ?? { qty_on_hand: 0, qty_reserved: 0 };
      acc.qty_on_hand += num(sl.qty_on_hand);
      acc.qty_reserved += num(sl.qty_reserved);
      porSucursal.set(sl.branch_id, acc);
    }
  };
  sumar(propio);
  for (const v of variantes ?? []) sumar(v.stock_levels);
  return [...porSucursal.entries()]
    .sort(([a], [b]) => a - b)
    .map(([branch_id, n]) => ({ branch_id, qty_on_hand: n.qty_on_hand, qty_reserved: n.qty_reserved }));
}

/** Traduce una variante de la RPC (formato ligero) al tipo `Producto`. */
function mapearVariante(v: any, padre: any): Producto {
  const price = v.price != null ? num(v.price) : 0;
  const compare = v.compare_price != null ? num(v.compare_price) : 0;
  const cost = v.cost != null ? num(v.cost) : 0;
  return {
    ...v,
    organization_id: padre.organization_id,
    category_id: padre.category_id,
    category: padre.category ?? undefined,
    brand: v.brand ?? padre.brand,
    reference: v.reference ?? padre.reference,
    unit_code: padre.unit_code,
    price,
    compare_price: compare,
    cost,
    stock: v.track_stock === false ? undefined : disponible(v.stock_levels),
    stock_levels: v.stock_levels ?? [],
    // La exportación CSV lee el precio de comparación de aquí.
    product_prices: v.price != null ? [{ price, compare_price: compare || null }] : [],
    product_costs: v.cost != null ? [{ cost }] : [],
    product_images: [],
  } as Producto;
}

/** Traduce un producto padre de la RPC al tipo `Producto` de la tabla. */
export function mapearFilaCatalogo(item: any): Producto {
  const precio = item.product_prices?.[0];
  const costo = item.product_costs?.[0];
  const hijos: Producto[] = (item.children ?? []).map((v: any) => mapearVariante(v, item));
  const rastrea = item.track_stock !== false;
  const stockSucursales = stockPorSucursalConVariantes(item.stock_levels, item.children);
  const principal = (item.product_images ?? []).find((i: any) => i.is_primary) ?? item.product_images?.[0];

  return {
    ...item,
    category: item.category ?? undefined,
    price: precio ? num(precio.price) : 0,
    compare_price: precio ? num(precio.compare_price) : 0,
    cost: costo ? num(costo.cost) : 0,
    // Total disponible del producto completo (padre + variantes), como antes.
    stock: rastrea ? disponible(stockSucursales) : undefined,
    stock_sucursales: stockSucursales,
    image_url: principal?.storage_path ?? null,
    children: hijos,
    variants: hijos,
    modifier_groups_count: item.modifier_groups_count ?? 0,
  } as Producto;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pide un lote. Reintenta ante el 503/PGRST002 de PostgREST (recargando el
 * caché de esquema) con espera exponencial corta.
 */
export async function pedirLote(
  p: ParametrosCatalogo,
  offset: number,
  limite: number,
  productIds?: number[]
): Promise<RespuestaLote> {
  const REINTENTOS = 3;
  let ultimoError: unknown = null;
  for (let intento = 0; intento <= REINTENTOS; intento++) {
    const { data, error } = await supabase.rpc('catalogo_productos_lote', {
      p_organization_id: p.organizationId,
      p_offset: offset,
      p_limit: limite,
      p_search: p.busqueda || null,
      p_category_id: p.categoria || null,
      p_status: p.estado,
      p_sort_by: p.ordenarPor || 'name',
      p_product_ids: productIds ?? null,
    });
    if (!error) {
      const items: any[] = (data as any)?.items ?? [];
      return { productos: items.map(mapearFilaCatalogo), total: Number((data as any)?.total ?? 0) };
    }
    ultimoError = error;
    if (intento < REINTENTOS) await esperar(500 * 2 ** intento);
  }
  throw ultimoError;
}

/**
 * Carga el catálogo completo: primero un lote pequeño (para pintar ya) y
 * luego el resto en lotes que se piden en paralelo. `alAvanzar` recibe la
 * lista acumulada EN ORDEN (los lotes que llegan antes que uno anterior
 * esperan su turno para no reordenar la tabla bajo el usuario).
 */
export async function cargarCatalogo(
  p: ParametrosCatalogo,
  opciones: {
    cancelado: () => boolean;
    alPrimerLote?: (productos: Producto[], total: number) => void;
    alAvanzar?: (productos: Producto[], total: number) => void;
  }
): Promise<Producto[] | null> {
  const primero = await pedirLote(p, 0, PRIMER_LOTE);
  if (opciones.cancelado()) return null;
  opciones.alPrimerLote?.(primero.productos, primero.total);

  const total = primero.total;
  const offsets: number[] = [];
  for (let o = PRIMER_LOTE; o < total; o += LOTE) offsets.push(o);
  if (offsets.length === 0) return primero.productos;

  const lotes: Array<Producto[] | undefined> = new Array(offsets.length);
  let listos = 0; // lotes contiguos ya publicados
  let acumulado = primero.productos;
  let siguiente = 0;

  const trabajador = async () => {
    while (siguiente < offsets.length && !opciones.cancelado()) {
      const i = siguiente++;
      const { productos } = await pedirLote(p, offsets[i], LOTE);
      if (opciones.cancelado()) return;
      lotes[i] = productos;
      // Publicar solo el tramo contiguo desde el último publicado.
      let avanzo = false;
      while (listos < lotes.length && lotes[listos]) {
        acumulado = acumulado.concat(lotes[listos]!);
        listos++;
        avanzo = true;
      }
      if (avanzo) opciones.alAvanzar?.(acumulado, total);
    }
  };

  await Promise.all(Array.from({ length: Math.min(LOTES_EN_PARALELO, offsets.length) }, trabajador));
  if (opciones.cancelado()) return null;
  return acumulado;
}
