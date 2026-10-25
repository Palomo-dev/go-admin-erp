import type { SupabaseClient } from '@supabase/supabase-js';
import { getDayRange, toPlainDate } from '@/lib/utils/timezone';
import type { MovimientoStockInforme } from '@/lib/finanzas/informes/libros';

export interface FiltrosStockInformes {
  hasta: string;
  branchId?: number;
  costCenterId?: string;
  productId?: number;
}

export interface FuenteStockInformes {
  movimientos: MovimientoStockInforme[];
  advertencias: string[];
  /** Un historial incompleto nunca se interpreta como inventario de valor cero. */
  stockCompleto: boolean;
  motivoStockIncompleto: 'centro_costo' | 'datos_no_verificables' | null;
}

/**
 * Lectura histórica completa y paginada. El caller valida organización y permisos
 * antes de llamar; se reutiliza el cliente RLS de esa sesión, sin service role.
 * Esquema comprobado por MCP, incluidos direction, unit_cost y avg_cost_after.
 */
export async function cargarStockInformes(
  db: SupabaseClient,
  organizationId: number,
  filtros: FiltrosStockInformes,
  timezone: string,
): Promise<FuenteStockInformes> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new Error('Organización inválida para el kárdex.');
  if (filtros.branchId !== undefined && (!Number.isSafeInteger(filtros.branchId) || filtros.branchId <= 0)) throw new Error('Sucursal inválida para el kárdex.');
  if (filtros.costCenterId) return {
    movimientos: [], stockCompleto: false, motivoStockIncompleto: 'centro_costo',
    advertencias: ['El inventario no tiene centro de costo asignado por movimiento. El kárdex, la conciliación con 1435 y la contribución por producto no se presentan para este filtro; seleccione una sucursal sin centro de costo.'],
  };
  const { end } = getDayRange(filtros.hasta, timezone);
  const movimientos: MovimientoStockInforme[] = [];
  const noVerificables: string[] = [];
  const limite = 1000;
  for (let offset = 0; ; offset += limite) {
    let query = db.from('stock_movements')
      .select('id, organization_id, branch_id, product_id, direction, qty, unit_cost, source, source_id, created_at, avg_cost_after')
      .eq('organization_id', organizationId)
      .lte('created_at', end)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (filtros.branchId !== undefined) query = query.eq('branch_id', filtros.branchId);
    if (filtros.productId !== undefined) query = query.eq('product_id', filtros.productId);
    const { data, error } = await query.range(offset, offset + limite - 1);
    if (error) throw error;
    for (const raw of data ?? []) {
      const fila = raw as Record<string, unknown>;
      if (Number(fila.organization_id) !== organizationId || filtros.branchId !== undefined && Number(fila.branch_id) !== filtros.branchId) throw new Error('El inventario devolvió un movimiento fuera de la organización o sucursal solicitada.');
      const qty = Number(fila.qty);
      const unitCost = Number(fila.unit_cost);
      const promedio = fila.avg_cost_after == null ? null : Number(fila.avg_cost_after);
      if (fila.qty == null || fila.qty === '' || fila.unit_cost == null || fila.unit_cost === '' || !Number.isFinite(qty) || qty < 0 || !Number.isFinite(unitCost) || unitCost < 0
        || promedio !== null && (!Number.isFinite(promedio) || promedio < 0)
        || !['in', 'out', 'entrada', 'salida'].includes(String(fila.direction)) || !Number.isFinite(new Date(String(fila.created_at)).getTime())) {
        noVerificables.push(String(fila.id));
        continue;
      }
      movimientos.push({
        id: Number(fila.id), organization_id: Number(fila.organization_id), branch_id: Number(fila.branch_id), product_id: Number(fila.product_id),
        direction: String(fila.direction), qty, unit_cost: unitCost, source: String(fila.source), source_id: fila.source_id === null ? null : String(fila.source_id),
        created_at: String(fila.created_at), avg_cost_after: promedio,
        fecha: toPlainDate(new Date(String(fila.created_at)), timezone),
      });
    }
    if ((data?.length ?? 0) < limite) break;
  }
  if (noVerificables.length) return {
    movimientos: [], stockCompleto: false, motivoStockIncompleto: 'datos_no_verificables',
    advertencias: [`Hay ${noVerificables.length} movimientos de inventario sin cantidad, costo o secuencia verificables (referencias: ${noVerificables.slice(0, 10).join(', ')}${noVerificables.length > 10 ? '…' : ''}). Se conservan los informes contables; se omiten el kárdex, la conciliación con 1435 y la contribución por producto hasta corregir el historial. No se sustituyeron importes faltantes por cero.`],
  };
  return {
    movimientos,
    stockCompleto: true, motivoStockIncompleto: null,
    advertencias: [],
  };
}
