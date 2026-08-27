// ============================================================
// Reportes de Trazabilidad de Seriales y Garantías
// Reportes: trazabilidad-producto, ventas-serial, garantias-reporte, seriales-proveedor
// ============================================================

import { supabase } from '@/lib/supabase/config';
import { getOrgDateRange } from '@/lib/utils/timezone';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

function buildReportData(
  id: string,
  titulo: string,
  modulo: string,
  periodo: PeriodoCierre,
  kpis: ReportData['kpis'],
  columnas: ReportData['columnas'],
  filas: Record<string, unknown>[],
  totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'En Stock',
  reserved: 'Reservado',
  sold: 'Vendido',
  returned: 'Devuelto',
  in_transit: 'En Tránsito',
  damaged: 'Dañado',
  rma: 'RMA',
  warranty_claim: 'Reclamo Garantía',
};

const RESOLUTION_LABELS: Record<string, string> = {
  repair: 'Reparación',
  replacement: 'Reemplazo',
  refund: 'Reembolso',
  store_credit: 'Crédito Tienda',
  rejected: 'Rechazado',
};

const CLAIM_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  in_process: 'En Proceso',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
};

export const serialTrackingReports: ReportDefinition[] = [
  // ============================================================
  // 10.1: Reporte de Trazabilidad por Producto
  // ============================================================
  {
    id: 'trazabilidad-producto',
    modulo: 'inventory',
    titulo: 'Trazabilidad por Producto',
    descripcion: 'Seriales recibidos, proveedor, costo, estado actual y ubicación por producto',
    categoria: 'operativo',
    periodosSugeridos: ['mensual', 'trimestral'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(`
          id, serial, status, cost_at_purchase, received_date,
          warranty_start, warranty_end,
          products!inner ( id, name, sku, brand ),
          suppliers ( name ),
          branches!serial_numbers_branch_id_fkey ( name ),
          current_branch:branches!serial_numbers_current_branch_id_fkey ( name )
        `)
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const filas = (data ?? []).map((s: any) => ({
        serial: s.serial,
        producto: s.products?.name ?? '—',
        sku: s.products?.sku ?? '—',
        marca: s.products?.brand ?? '—',
        proveedor: s.suppliers?.name ?? '—',
        costo: Number(s.cost_at_purchase ?? 0),
        estado: STATUS_LABELS[s.status] ?? s.status,
        sucursal_actual: s.current_branch?.name ?? '—',
        sucursal_recepcion: s.branches?.name ?? '—',
        fecha_recepcion: s.received_date ? s.received_date.split('T')[0] : '—',
        garantia_fin: s.warranty_end ? s.warranty_end.split('T')[0] : '—',
      }));

      const totalSeriales = filas.length;
      const enStock = filas.filter((f) => f.estado === 'En Stock').length;
      const vendidos = filas.filter((f) => f.estado === 'Vendido').length;
      const costoTotal = filas.reduce((s, f) => s + Number(f.costo ?? 0), 0);

      return buildReportData(
        'trazabilidad-producto', 'Trazabilidad por Producto', 'inventory', periodo,
        [
          { titulo: 'Total Seriales', valor: totalSeriales, formato: 'numero' },
          { titulo: 'En Stock', valor: enStock, formato: 'numero' },
          { titulo: 'Vendidos', valor: vendidos, formato: 'numero' },
          { titulo: 'Costo Total', valor: costoTotal, formato: 'moneda' },
        ],
        [
          { key: 'serial', titulo: 'Serial', tipo: 'texto' },
          { key: 'producto', titulo: 'Producto', tipo: 'texto' },
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'marca', titulo: 'Marca', tipo: 'texto' },
          { key: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'sucursal_actual', titulo: 'Ubicación Actual', tipo: 'texto' },
          { key: 'costo', titulo: 'Costo', tipo: 'moneda', alinear: 'right' },
          { key: 'fecha_recepcion', titulo: 'Fecha Recepción', tipo: 'fecha' },
          { key: 'garantia_fin', titulo: 'Fin Garantía', tipo: 'fecha' },
        ],
        filas,
        { costo: costoTotal },
      );
    },
  },

  // ============================================================
  // 10.2: Reporte de Ventas por Serial
  // ============================================================
  {
    id: 'ventas-serial',
    modulo: 'inventory',
    titulo: 'Ventas por Serial',
    descripcion: 'Seriales vendidos: producto, cliente, vendedor, canal, precio y fecha',
    categoria: 'comercial',
    periodosSugeridos: ['mensual', 'trimestral'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(`
          id, serial, sale_date, sale_channel, price_at_sale,
          products!inner ( id, name, sku ),
          customers ( id, full_name ),
          sold_by_user:profiles!serial_numbers_sold_by_user_id_fkey ( email )
        `)
        .eq('organization_id', orgId)
        .eq('status', 'sold')
        .gte('sale_date', start)
        .lte('sale_date', end)
        .order('sale_date', { ascending: false })
        .limit(500);

      if (error) throw error;

      const CHANNEL_LABELS: Record<string, string> = {
        pos: 'POS',
        web: 'Web',
        invoice: 'Factura',
        manual: 'Manual',
      };

      const filas = (data ?? []).map((s: any) => ({
        serial: s.serial,
        producto: s.products?.name ?? '—',
        sku: s.products?.sku ?? '—',
        cliente: s.customers?.full_name ?? '—',
        vendedor: s.sold_by_user?.email ?? '—',
        canal: CHANNEL_LABELS[s.sale_channel] ?? s.sale_channel ?? '—',
        precio: Number(s.price_at_sale ?? 0),
        fecha_venta: s.sale_date ? s.sale_date.split('T')[0] : '—',
      }));

      const totalVentas = filas.length;
      const ingresosTotal = filas.reduce((s, f) => s + Number(f.precio ?? 0), 0);
      const canalPos = filas.filter((f) => f.canal === 'POS').length;
      const canalWeb = filas.filter((f) => f.canal === 'Web').length;

      return buildReportData(
        'ventas-serial', 'Ventas por Serial', 'inventory', periodo,
        [
          { titulo: 'Seriales Vendidos', valor: totalVentas, formato: 'numero' },
          { titulo: 'Ingresos Total', valor: ingresosTotal, formato: 'moneda' },
          { titulo: 'Ventas POS', valor: canalPos, formato: 'numero' },
          { titulo: 'Ventas Web', valor: canalWeb, formato: 'numero' },
        ],
        [
          { key: 'serial', titulo: 'Serial', tipo: 'texto' },
          { key: 'producto', titulo: 'Producto', tipo: 'texto' },
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'cliente', titulo: 'Cliente', tipo: 'texto' },
          { key: 'vendedor', titulo: 'Vendedor', tipo: 'texto' },
          { key: 'canal', titulo: 'Canal', tipo: 'texto' },
          { key: 'precio', titulo: 'Precio Venta', tipo: 'moneda', alinear: 'right' },
          { key: 'fecha_venta', titulo: 'Fecha Venta', tipo: 'fecha' },
        ],
        filas,
        { precio: ingresosTotal },
      );
    },
  },

  // ============================================================
  // 10.3: Reporte de Garantías
  // ============================================================
  {
    id: 'garantias-reporte',
    modulo: 'inventory',
    titulo: 'Reporte de Garantías',
    descripcion: 'Reclamos de garantía: tipo de resolución, monto y tiempo de resolución',
    categoria: 'operativo',
    periodosSugeridos: ['mensual', 'trimestral'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase
        .from('warranty_claims')
        .select(`
          id, claim_date, claim_reason, status, resolution_type,
          resolution_date, refund_amount, supplier_rma_number,
          serial_numbers!warranty_claims_serial_number_id_fkey (
            serial,
            products!fk_serial_product ( name, sku )
          ),
          customers ( full_name )
        `)
        .eq('organization_id', orgId)
        .gte('claim_date', start)
        .lte('claim_date', end)
        .order('claim_date', { ascending: false })
        .limit(500);

      if (error) throw error;

      const filas = (data ?? []).map((c: any) => {
        const claimDate = new Date(c.claim_date);
        const resolutionDate = c.resolution_date ? new Date(c.resolution_date) : null;
        const diasResolucion = resolutionDate
          ? Math.ceil((resolutionDate.getTime() - claimDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          reclamo: `#${String(c.id).substring(0, 8)}`,
          serial: c.serial_numbers?.serial ?? '—',
          producto: c.serial_numbers?.products?.name ?? '—',
          cliente: c.customers?.full_name ?? '—',
          fecha_reclamo: c.claim_date ? c.claim_date.split('T')[0] : '—',
          estado: CLAIM_STATUS_LABELS[c.status] ?? c.status,
          resolucion: c.resolution_type ? (RESOLUTION_LABELS[c.resolution_type] ?? c.resolution_type) : '—',
          monto: Number(c.refund_amount ?? 0),
          rma: c.supplier_rma_number ?? '—',
          dias_resolucion: diasResolucion ?? '—',
        };
      });

      const totalReclamos = filas.length;
      const pendientes = filas.filter((f) => f.estado === 'Pendiente').length;
      const resueltos = filas.filter((f) => f.estado === 'Resuelto').length;
      const montoTotal = filas.reduce((s, f) => s + Number(f.monto ?? 0), 0);
      const tiemposResolucion = filas
        .filter((f) => typeof f.dias_resolucion === 'number')
        .map((f) => f.dias_resolucion as number);
      const tiempoPromedio = tiemposResolucion.length > 0
        ? Math.round(tiemposResolucion.reduce((a, b) => a + b, 0) / tiemposResolucion.length)
        : 0;

      return buildReportData(
        'garantias-reporte', 'Reporte de Garantías', 'inventory', periodo,
        [
          { titulo: 'Total Reclamos', valor: totalReclamos, formato: 'numero' },
          { titulo: 'Pendientes', valor: pendientes, formato: 'numero' },
          { titulo: 'Resueltos', valor: resueltos, formato: 'numero' },
          { titulo: 'Monto Reembolsos', valor: montoTotal, formato: 'moneda' },
          { titulo: 'Tiempo Prom. (días)', valor: tiempoPromedio, formato: 'numero' },
        ],
        [
          { key: 'reclamo', titulo: 'Reclamo', tipo: 'texto' },
          { key: 'serial', titulo: 'Serial', tipo: 'texto' },
          { key: 'producto', titulo: 'Producto', tipo: 'texto' },
          { key: 'cliente', titulo: 'Cliente', tipo: 'texto' },
          { key: 'fecha_reclamo', titulo: 'Fecha Reclamo', tipo: 'fecha' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'resolucion', titulo: 'Resolución', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          { key: 'rma', titulo: 'RMA Proveedor', tipo: 'texto' },
          { key: 'dias_resolucion', titulo: 'Días Resolución', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { monto: montoTotal },
      );
    },
  },

  // ============================================================
  // 10.4: Reporte de Seriales por Proveedor
  // ============================================================
  {
    id: 'seriales-proveedor',
    modulo: 'inventory',
    titulo: 'Seriales por Proveedor',
    descripcion: 'Seriales comprados, costo total, vendidos y devueltos por proveedor',
    categoria: 'operativo',
    periodosSugeridos: ['mensual', 'trimestral'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const overrideHours = (periodo.horaInicio && periodo.horaFin)
        ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
        : null;
      const { start, end } = await getOrgDateRange(orgId, periodo.fechaInicio, periodo.fechaFin, overrideHours);
      const { data, error } = await supabase
        .from('serial_numbers')
        .select(`
          id, status, cost_at_purchase,
          suppliers!inner ( id, name )
        `)
        .eq('organization_id', orgId)
        .not('supplier_id', 'is', null)
        .gte('created_at', start)
        .lte('created_at', end)
        .limit(1000);

      if (error) throw error;

      const porProveedor = new Map<string, {
        proveedor: string;
        seriales_comprados: number;
        costo_total: number;
        vendidos: number;
        devueltos: number;
        en_stock: number;
        danados: number;
      }>();

      for (const s of data ?? []) {
        const supplier = s.suppliers as any;
        const nombre = supplier?.name ?? 'Sin proveedor';
        const existente = porProveedor.get(nombre);
        const costo = Number(s.cost_at_purchase ?? 0);
        const status = s.status as string;

        if (existente) {
          existente.seriales_comprados++;
          existente.costo_total += costo;
          if (status === 'sold') existente.vendidos++;
          if (status === 'returned') existente.devueltos++;
          if (status === 'in_stock') existente.en_stock++;
          if (status === 'damaged') existente.danados++;
        } else {
          porProveedor.set(nombre, {
            proveedor: nombre,
            seriales_comprados: 1,
            costo_total: costo,
            vendidos: status === 'sold' ? 1 : 0,
            devueltos: status === 'returned' ? 1 : 0,
            en_stock: status === 'in_stock' ? 1 : 0,
            danados: status === 'damaged' ? 1 : 0,
          });
        }
      }

      const filas = Array.from(porProveedor.values())
        .sort((a, b) => b.seriales_comprados - a.seriales_comprados);

      const totalSeriales = filas.reduce((s, f) => s + f.seriales_comprados, 0);
      const costoTotal = filas.reduce((s, f) => s + f.costo_total, 0);
      const totalVendidos = filas.reduce((s, f) => s + f.vendidos, 0);
      const totalDevueltos = filas.reduce((s, f) => s + f.devueltos, 0);

      return buildReportData(
        'seriales-proveedor', 'Seriales por Proveedor', 'inventory', periodo,
        [
          { titulo: 'Proveedores', valor: filas.length, formato: 'numero' },
          { titulo: 'Total Seriales', valor: totalSeriales, formato: 'numero' },
          { titulo: 'Costo Total', valor: costoTotal, formato: 'moneda' },
          { titulo: 'Vendidos', valor: totalVendidos, formato: 'numero' },
          { titulo: 'Devueltos', valor: totalDevueltos, formato: 'numero' },
        ],
        [
          { key: 'proveedor', titulo: 'Proveedor', tipo: 'texto' },
          { key: 'seriales_comprados', titulo: 'Seriales Comprados', tipo: 'numero', alinear: 'right' },
          { key: 'costo_total', titulo: 'Costo Total', tipo: 'moneda', alinear: 'right' },
          { key: 'vendidos', titulo: 'Vendidos', tipo: 'numero', alinear: 'right' },
          { key: 'devueltos', titulo: 'Devueltos', tipo: 'numero', alinear: 'right' },
          { key: 'en_stock', titulo: 'En Stock', tipo: 'numero', alinear: 'right' },
          { key: 'danados', titulo: 'Dañados', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        {
          seriales_comprados: totalSeriales,
          costo_total: costoTotal,
          vendidos: totalVendidos,
          devueltos: totalDevueltos,
        },
      );
    },
  },
];
