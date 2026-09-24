import { supabase } from '@/lib/supabase/config';
import { getOrganizationId, getBranchFilter } from '@/lib/hooks/useOrganization';
import { getDateRange, getToday } from '@/lib/utils/timezone';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { DailySummary, CashSession } from './types';
import { anularVentaEnServidor, type ResultadoAnulacion } from '@/lib/pos/anularVenta';

/**
 * Lo que queda del servicio de ventas del navegador (2026-09-24, pasos 15–18
 * de docs/implementacion/CAJAS-VENTAS-PLAN.md):
 * - El listado y el detalle se leen en el servidor (`GET /api/pos/ventas`,
 *   `GET /api/pos/ventas/[id]`, cliente en `src/lib/pos/ventas/clienteVentas.ts`).
 * - Nueva venta y duplicar usan el carrito del POS (`duplicarEnPos.ts`).
 * - Abrir y cerrar caja van por `CajasService` y `pos_caja_cerrar`: se quitaron
 *   `openCashSession`/`closeCashSession`, que escribían `cash_sessions` desde
 *   el navegador con una diferencia calculada aquí.
 * Aquí quedan el resumen del día del POS, la caja abierta y la anulación.
 */
export class VentasService {
  /** Resumen del día de la organización (en su zona y horas de operación) para el inicio del POS. */
  static async getDailySummary(date?: string): Promise<DailySummary> {
    const organizationId = getOrganizationId();
    const branchId = getBranchFilter();
    const { getOperatingHours } = await import('@/lib/services/organizationOperatingHoursService');
    const [tz, operatingHours] = await Promise.all([getOrganizationTimezone(organizationId), getOperatingHours(organizationId)]);
    const targetDate = date || getToday(tz);

    const { start: startOfDay, end: endOfDay } = getDateRange(targetDate, targetDate, tz, operatingHours);

    let query = supabase
      .from('sales')
      .select('id, total, tax_total, discount_total, status, payment_status')
      .eq('organization_id', organizationId)
      .gte('sale_date', startOfDay)
      .lte('sale_date', endOfDay);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    }

    const { data: sales, error } = await query;

    if (error) {
      console.error('Error fetching daily summary:', error);
      throw error;
    }

    const summary: DailySummary = {
      total_sales: sales?.length || 0,
      total_amount: 0,
      total_tax: 0,
      total_discount: 0,
      payment_methods: [],
      pending_count: 0,
      completed_count: 0,
      cancelled_count: 0,
    };

    // Estados reales de `sales_status_check`: draft · paid · partial · pending · void
    // (antes se contaban «completed» y «cancelled», que no existen: siempre 0).
    (sales || []).forEach((sale) => {
      summary.total_amount += Number(sale.total) || 0;
      summary.total_tax += Number(sale.tax_total) || 0;
      summary.total_discount += Number(sale.discount_total) || 0;

      if (sale.status === 'pending' || sale.status === 'partial') summary.pending_count++;
      if (sale.status === 'paid') summary.completed_count++;
      if (sale.status === 'void') summary.cancelled_count++;
    });

    return summary;
  }

  /** Sesión de caja abierta de la sucursal; si no hay, la global (branch_id null). */
  static async getCurrentCashSession(branchId: number | null): Promise<CashSession | null> {
    const organizationId = getOrganizationId();

    if (branchId !== null) {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('branch_id', branchId)
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching cash session:', error);
        return null;
      }

      if (data) return data;
    }

    const { data: globalSession, error: globalError } = await supabase
      .from('cash_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .is('branch_id', null)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (globalError) {
      console.error('Error fetching global cash session:', globalError);
      return null;
    }

    return globalSession;
  }

  // Anular venta
  //
  // `sales_status_check` solo admite draft|paid|partial|pending|void: escribir
  // 'cancelled' violaba la restricción, así que anular una venta **nunca**
  // llegó a funcionar (auditoría de ventas, 2026-09-22). El estado de anulada
  // es `void`, el mismo que usa el camino de la nota crédito en posService.
  //
  // Desde 2026-09-24 anular pasa por la RPC `pos_anular_venta_v1` (una
  // transacción): permiso pos.void en el servidor, motivo obligatorio, pagos
  // anulados solo si su caja sigue abierta (si no: devolución), stock,
  // seriales, propinas, comisiones, nota crédito y factura anulada, con
  // auditoría en ops_audit_log.
  static async anularVenta(saleId: string, motivo: string): Promise<ResultadoAnulacion> {
    return anularVentaEnServidor(saleId, motivo);
  }

  /** Compatibilidad: true si quedó anulada (o ya lo estaba). El error se registra en consola. */
  static async cancelSale(saleId: string, reason?: string): Promise<boolean> {
    try {
      await anularVentaEnServidor(saleId, reason ?? '');
      return true;
    } catch (error) {
      console.error('Error anulando la venta:', error);
      return false;
    }
  }
}
