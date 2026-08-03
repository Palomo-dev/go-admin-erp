// ============================================================
// Reportes de Inventario
// Llama a las RPCs: fn_reporte_stock_critico, fn_reporte_movimientos_inventario, fn_reporte_rotacion_inventario
// ============================================================

import { supabase } from '@/lib/supabase/config';
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

export const inventarioReports: ReportDefinition[] = [
  {
    id: 'stock-critico',
    modulo: 'inventory',
    titulo: 'Stock Crítico',
    descripcion: 'Productos bajo el mínimo de stock',
    categoria: 'operativo',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_stock_critico', {
        p_organization_id: orgId,
      });
      if (error) throw error;

      const d = data ?? {};
      const items = d.items ?? [];

      return buildReportData(
        'stock-critico', 'Stock Crítico', 'inventory', periodo,
        [
          { titulo: 'Productos Críticos', valor: d.total_criticos ?? 0, formato: 'numero' },
        ],
        [
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
          { key: 'stock_actual', titulo: 'Stock Actual', tipo: 'numero', alinear: 'right' },
          { key: 'stock_minimo', titulo: 'Mínimo', tipo: 'numero', alinear: 'right' },
          { key: 'faltante', titulo: 'Faltante', tipo: 'numero', alinear: 'right' },
        ],
        items,
      );
    },
  },
  {
    id: 'movimientos-inventario',
    modulo: 'inventory',
    titulo: 'Movimientos de Inventario',
    descripcion: 'Entradas, salidas y ajustes del período',
    categoria: 'operativo',
    periodosSugeridos: ['diario', 'semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_movimientos_inventario', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'movimientos-inventario', 'Movimientos de Inventario', 'inventory', periodo,
        [
          { titulo: 'Total Entradas', valor: d.total_entradas ?? 0, formato: 'numero' },
          { titulo: 'Total Salidas', valor: d.total_salidas ?? 0, formato: 'numero' },
        ],
        [
          { key: 'direccion', titulo: 'Dirección', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
          { key: 'valor', titulo: 'Valor', tipo: 'moneda', alinear: 'right' },
          { key: 'num', titulo: 'N° Movimientos', tipo: 'numero', alinear: 'right' },
        ],
        d.por_tipo ?? [],
      );
    },
  },
  {
    id: 'rotacion-inventario',
    modulo: 'inventory',
    titulo: 'Rotación de Inventario',
    descripcion: 'Top vendidos, dead stock y días promedio de inventario',
    categoria: 'operativo',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_rotacion_inventario', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'rotacion-inventario', 'Rotación de Inventario', 'inventory', periodo,
        [
          { titulo: 'Total Vendido', valor: d.total_vendido ?? 0, formato: 'moneda' },
          { titulo: 'Productos Vendidos', valor: d.num_productos_vendidos ?? 0, formato: 'numero' },
        ],
        [
          { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'cantidad_vendida', titulo: 'Cant. Vendida', tipo: 'numero', alinear: 'right' },
          { key: 'total_ventas', titulo: 'Total Ventas', tipo: 'moneda', alinear: 'right' },
        ],
        d.top_vendidos ?? [],
      );
    },
  },
  {
    id: 'rentabilidad-producto-inv',
    modulo: 'inventory',
    titulo: 'Rentabilidad por Producto',
    descripcion: 'Margen de ganancia por producto',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('sale_items')
        .select('product_id, quantity, unit_price, total, discount_amount, products(name, sku)')
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`)
        .order('total', { ascending: false })
        .limit(50);

      if (error) throw error;

      const items = (data ?? []).map((item: Record<string, unknown>) => {
        const products = item.products as Record<string, unknown> | null;
        return {
          nombre: products?.name ?? '—',
          sku: products?.sku ?? '—',
          cantidad: item.quantity,
          precio_unitario: item.unit_price,
          total: item.total,
          descuento: item.discount_amount ?? 0,
        };
      });

      return buildReportData(
        'rentabilidad-producto-inv', 'Rentabilidad por Producto', 'inventory', periodo,
        [
          { titulo: 'Total Ingresos', valor: items.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total ?? 0), 0), formato: 'moneda' },
          { titulo: 'Productos', valor: items.length, formato: 'numero' },
        ],
        [
          { key: 'nombre', titulo: 'Producto', tipo: 'texto' },
          { key: 'sku', titulo: 'SKU', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        items,
        { total: items.reduce((s: number, i: Record<string, unknown>) => s + Number(i.total ?? 0), 0) },
      );
    },
  },
];
