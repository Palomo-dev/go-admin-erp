import { supabase } from '@/lib/supabase/config';
import { getOrganizationId } from '@/lib/hooks/useOrganization';

export interface TrazabilidadEntry {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  branch_id: number;
  branch_name: string;
  direction: 'in' | 'out';
  qty: number;
  source: string;
  source_id: string | null;
  note: string | null;
  lot_id: number | null;
  lot_code: string | null;
  created_at: string;
  unit_cost: number | null;
}

export interface FiltrosTrazabilidad {
  busqueda: string;
  productId: string;
  branchId: string;
  direction: string;
  source: string;
  fechaDesde: string;
  fechaHasta: string;
}

export class TrazabilidadService {
  static async obtenerTrazabilidad(
    filtros: FiltrosTrazabilidad,
    page: number = 1,
    pageSize: number = 25
  ): Promise<{ data: TrazabilidadEntry[]; total: number; totalPages: number }> {
    const orgId = getOrganizationId();
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('stock_movements')
      .select(
        `
        id,
        product_id,
        branch_id,
        direction,
        qty,
        source,
        source_id,
        note,
        lot_id,
        created_at,
        products (
          id,
          name,
          sku
        ),
        branches (
          id,
          name
        ),
        lots (
          id,
          lot_code
        )
      `,
        { count: 'exact' }
      )
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (filtros.busqueda) {
      query = query.or(`note.ilike.%${filtros.busqueda}%,source_id.ilike.%${filtros.busqueda}%`);
    }
    if (filtros.productId && filtros.productId !== 'todos') {
      query = query.eq('product_id', parseInt(filtros.productId));
    }
    if (filtros.branchId && filtros.branchId !== 'todos') {
      query = query.eq('branch_id', parseInt(filtros.branchId));
    }
    if (filtros.direction && filtros.direction !== 'todos') {
      query = query.eq('direction', filtros.direction);
    }
    if (filtros.source && filtros.source !== 'todos') {
      query = query.eq('source', filtros.source);
    }
    if (filtros.fechaDesde) {
      query = query.gte('created_at', filtros.fechaDesde + 'T00:00:00');
    }
    if (filtros.fechaHasta) {
      query = query.lte('created_at', filtros.fechaHasta + 'T23:59:59');
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Error obteniendo trazabilidad:', error);
      throw new Error(`Error: ${error.message}`);
    }

    const mapped: TrazabilidadEntry[] = (data || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.products?.name || 'N/A',
      sku: item.products?.sku || '',
      branch_id: item.branch_id,
      branch_name: item.branches?.name || 'N/A',
      direction: item.direction,
      qty: item.qty,
      source: item.source,
      source_id: item.source_id,
      note: item.note,
      lot_id: item.lot_id,
      lot_code: item.lots?.lot_code || null,
      created_at: item.created_at,
      unit_cost: null,
    }));

    return {
      data: mapped,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / pageSize),
    };
  }

  static async obtenerProductos(): Promise<{ id: number; name: string; sku: string }[]> {
    const orgId = getOrganizationId();
    const { data, error } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .limit(100);

    if (error) throw new Error(`Error: ${error.message}`);
    return data || [];
  }

  static async obtenerSucursales(): Promise<{ id: number; name: string }[]> {
    const orgId = getOrganizationId();
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true });

    if (error) throw new Error(`Error: ${error.message}`);
    return data || [];
  }

  static async exportarCSV(data: TrazabilidadEntry[]): Promise<string> {
    const headers = ['ID', 'Fecha', 'Producto', 'SKU', 'Sucursal', 'Dirección', 'Cantidad', 'Origen', 'ID Origen', 'Lote', 'Notas'];
    const rows = data.map((d) => [
      d.id,
      new Date(d.created_at).toLocaleString('es-CO'),
      d.product_name,
      d.sku,
      d.branch_name,
      d.direction === 'in' ? 'Entrada' : 'Salida',
      d.qty,
      d.source,
      d.source_id || '',
      d.lot_code || '',
      d.note || '',
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }
}
