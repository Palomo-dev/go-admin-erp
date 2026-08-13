import { supabase } from '@/lib/supabase/config';

// Entrada del kardex con balance acumulado
export interface KardexEntry {
  id: number;
  date: string;
  direction: 'in' | 'out';
  source: string;
  source_id?: string;
  qty: number;
  unit_cost: number;
  total_cost: number;
  balance: number;
  branch_name: string;
  note?: string;
}

// Estadísticas del kardex
export interface KardexStats {
  totalIn: number;
  totalOut: number;
  balance: number;
  valueIn: number;
  valueOut: number;
  totalMovements: number;
}

// Filtros del kardex
export interface KardexFilters {
  branchId?: number;
  source?: string;
  direction?: 'in' | 'out';
  dateFrom?: string;
  dateTo?: string;
}

// Info básica del producto
export interface ProductInfo {
  id: number;
  uuid: string;
  name: string;
  sku: string;
  track_stock: boolean;
}

type StockMovementRow = {
  id: number;
  created_at: string;
  direction: 'in' | 'out';
  source: string;
  source_id?: string | null;
  qty: number;
  unit_cost: number;
  note?: string | null;
  branches?: { id: number; name: string } | null;
};

const SOURCE_LABELS: Record<string, string> = {
  sale: 'Venta',
  purchase: 'Compra',
  transfer: 'Transferencia',
  adjustment: 'Ajuste',
  initial: 'Inventario Inicial',
  invoice_sale: 'Venta (Factura)',
  folio_item: 'Folio',
  room_consumption: 'Consumo Habitación',
  mesa_sale: 'Venta Mesa',
};

function getSourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source;
}

class KardexServiceClass {
  async getKardex(
    organizationId: number,
    productId: number,
    filters?: KardexFilters,
    page: number = 1,
    pageSize: number = 50
  ): Promise<{ data: KardexEntry[]; count: number }> {
    try {
      let query = supabase
        .from('stock_movements')
        .select('*, branches(id, name)')
        .eq('organization_id', organizationId)
        .eq('product_id', productId);

      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters?.source) {
        query = query.eq('source', filters.source);
      }
      if (filters?.direction) {
        query = query.eq('direction', filters.direction);
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
      }

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) {
        console.error('Error en getKardex:', error);
        return { data: [], count: 0 };
      }

      const movements = (data || []) as unknown as StockMovementRow[];
      let balance = 0;

      const entries: KardexEntry[] = movements.map((mov) => {
        const absQty = Math.abs(mov.qty);
        const quantityIn = mov.direction === 'in' ? absQty : 0;
        const quantityOut = mov.direction === 'out' ? absQty : 0;
        balance += quantityIn - quantityOut;

        return {
          id: mov.id,
          date: mov.created_at,
          direction: mov.direction,
          source: mov.source,
          source_id: mov.source_id ?? undefined,
          qty: absQty,
          unit_cost: mov.unit_cost,
          total_cost: mov.unit_cost * absQty,
          balance,
          branch_name: mov.branches?.name || '-',
          note: mov.note ?? undefined,
        };
      });

      entries.reverse();

      const total = entries.length;
      const from = (page - 1) * pageSize;
      const to = from + pageSize;
      const paginated = entries.slice(from, to);

      return { data: paginated, count: total };
    } catch (err) {
      console.error('Error en getKardex:', err);
      return { data: [], count: 0 };
    }
  }

  async getKardexStats(
    organizationId: number,
    productId: number,
    filters?: KardexFilters
  ): Promise<KardexStats> {
    try {
      let query = supabase
        .from('stock_movements')
        .select('direction, qty, unit_cost')
        .eq('organization_id', organizationId)
        .eq('product_id', productId);

      if (filters?.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }
      if (filters?.source) {
        query = query.eq('source', filters.source);
      }
      if (filters?.direction) {
        query = query.eq('direction', filters.direction);
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', `${filters.dateTo}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error en getKardexStats:', error);
        return {
          totalIn: 0,
          totalOut: 0,
          balance: 0,
          valueIn: 0,
          valueOut: 0,
          totalMovements: 0,
        };
      }

      const movements = (data || []) as unknown as {
        direction: 'in' | 'out';
        qty: number;
        unit_cost: number;
      }[];

      let totalIn = 0;
      let totalOut = 0;
      let valueIn = 0;
      let valueOut = 0;

      movements.forEach((mov) => {
        const absQty = Math.abs(mov.qty);
        if (mov.direction === 'in') {
          totalIn += absQty;
          valueIn += absQty * mov.unit_cost;
        } else {
          totalOut += absQty;
          valueOut += absQty * mov.unit_cost;
        }
      });

      return {
        totalIn,
        totalOut,
        balance: totalIn - totalOut,
        valueIn,
        valueOut,
        totalMovements: movements.length,
      };
    } catch (err) {
      console.error('Error en getKardexStats:', err);
      return {
        totalIn: 0,
        totalOut: 0,
        balance: 0,
        valueIn: 0,
        valueOut: 0,
        totalMovements: 0,
      };
    }
  }

  async getProductInfo(productId: number): Promise<ProductInfo | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, uuid, name, sku, track_stock')
        .eq('id', productId)
        .single();

      if (error) {
        console.error('Error en getProductInfo:', error);
        return null;
      }

      return data as ProductInfo;
    } catch (err) {
      console.error('Error en getProductInfo:', err);
      return null;
    }
  }

  async getBranches(
    organizationId: number
  ): Promise<{ id: number; name: string }[]> {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('Error en getBranches:', error);
        return [];
      }

      return (data || []) as { id: number; name: string }[];
    } catch (err) {
      console.error('Error en getBranches:', err);
      return [];
    }
  }

  exportKardexToCSV(entries: KardexEntry[], productName: string): string {
    const headers = [
      'Fecha',
      'Dirección',
      'Origen',
      'Documento',
      'Cantidad',
      'Costo Unit.',
      'Valor Total',
      'Saldo',
      'Sucursal',
      'Nota',
    ];

    const rows = entries.map((e) => [
      e.date,
      e.direction === 'in' ? 'Entrada' : 'Salida',
      getSourceLabel(e.source),
      e.source_id || '',
      String(e.qty),
      String(e.unit_cost),
      String(e.total_cost),
      String(e.balance),
      e.branch_name,
      (e.note || '').replace(/[\n\r;]/g, ' '),
    ]);

    const csvLines = [[`Kardex: ${productName}`], headers, ...rows]
      .map((row) => row.join(';'))
      .join('\n');

    return '\uFEFF' + csvLines;
  }
}

export const kardexService = new KardexServiceClass();
export default kardexService;
