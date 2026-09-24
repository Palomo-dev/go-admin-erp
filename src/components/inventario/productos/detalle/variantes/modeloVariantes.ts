import { supabase } from '@/lib/supabase/config';
import { productoService } from '@/lib/services/productoService';

/**
 * Variantes del detalle con precio, costo y stock vigentes. Precio, costo y
 * stock sin lote salen de `fn_producto_para_formulario` (una RPC, la misma
 * que usa el formulario: vigencia `effective_from <= now` y sin cierre); el
 * total de stock suma además las filas con lote de `stock_levels`, para que
 * la columna «Stock» coincida con el KPI del producto.
 */
export interface StockVarianteDetalle {
  branch_id: number;
  /** Existencia de la fila sin lote (la que ajusta el diálogo). */
  qty_on_hand: number;
  min_level: number;
}

export interface VarianteDetalle {
  id: number;
  sku: string;
  name: string;
  barcode: string | null;
  attributes: Record<string, string>;
  status: string;
  price: number | null;
  compare_price: number | null;
  cost: number | null;
  stock: StockVarianteDetalle[];
  /** Existencia total por sucursal (todas las filas, con y sin lote). */
  totalPorSucursal: Record<number, number>;
}

const numONull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const num = (v: unknown): number => numONull(v) ?? 0;

export async function cargarVariantes(organizacionId: number, productoId: number): Promise<VarianteDetalle[]> {
  const datos = await productoService.paraFormulario(organizacionId, productoId);
  const variantes = datos.variantes ?? [];
  const totales = new Map<number, Record<number, number>>();
  if (variantes.length > 0) {
    const { data, error } = await supabase
      .from('stock_levels')
      .select('product_id, branch_id, qty_on_hand')
      .in(
        'product_id',
        variantes.map((v) => v.id),
      );
    if (error) throw error;
    for (const fila of (data ?? []) as { product_id: number; branch_id: number; qty_on_hand: number | string | null }[]) {
      const mapa = totales.get(fila.product_id) ?? {};
      mapa[fila.branch_id] = (mapa[fila.branch_id] ?? 0) + num(fila.qty_on_hand);
      totales.set(fila.product_id, mapa);
    }
  }
  return variantes.map((v) => ({
    id: v.id,
    sku: v.sku,
    name: v.name,
    barcode: v.barcode,
    attributes: Object.fromEntries(
      Object.entries(v.attributes ?? {}).map(([k, val]) => [k, val === null || val === undefined ? '' : String(val)]),
    ),
    status: v.status,
    price: numONull(v.price),
    compare_price: numONull(v.compare_price),
    cost: numONull(v.cost),
    stock: (v.stock ?? []).map((s) => ({ branch_id: s.branch_id, qty_on_hand: num(s.qty_on_hand), min_level: num(s.min_level) })),
    totalPorSucursal: totales.get(v.id) ?? {},
  }));
}

/** Stock de la variante en la sucursal activa (o en todas). */
export function stockVariante(v: VarianteDetalle, sucursal: number | null): number {
  if (sucursal !== null) return v.totalPorSucursal[sucursal] ?? 0;
  return Object.values(v.totalPorSucursal).reduce((a, b) => a + b, 0);
}
