// ============================================================
// Reportes de Ventas (POS)
// Llama a las RPCs: fn_reporte_cierre_caja, fn_reporte_ventas_resumen, fn_reporte_ventas_por_hora
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
  return {
    id,
    titulo,
    modulo,
    kpis,
    columnas,
    filas,
    totales,
    generadoEn: new Date().toISOString(),
    periodo,
  };
}

export const ventasReports: ReportDefinition[] = [
  {
    id: 'cierre-caja',
    modulo: 'pos',
    titulo: 'Cierre de Caja (Zeta)',
    descripcion: 'Totales por método de pago, sesiones, descuentos y propinas del día',
    categoria: 'operativo',
    periodosSugeridos: ['diario'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_cierre_caja', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porMetodo = d.por_metodo ?? [];
      const sesiones = d.sesiones ?? [];

      return buildReportData(
        'cierre-caja', 'Cierre de Caja (Zeta)', 'pos', periodo,
        [
          { titulo: 'Total Ventas', valor: d.total_ventas ?? 0, formato: 'moneda' },
          { titulo: 'Descuentos', valor: d.descuentos ?? 0, formato: 'moneda' },
          { titulo: 'Devoluciones', valor: d.devoluciones ?? 0, formato: 'moneda' },
          { titulo: 'Propinas', valor: d.propinas ?? 0, formato: 'moneda' },
          { titulo: 'Diferencia', valor: d.esperado_vs_real?.diferencia ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'metodo', titulo: 'Método de Pago', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Transacciones', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        porMetodo,
        { cantidad: porMetodo.reduce((s: number, m: Record<string, unknown>) => s + Number(m.cantidad ?? 0), 0),
          total: porMetodo.reduce((s: number, m: Record<string, unknown>) => s + Number(m.total ?? 0), 0) },
      );
    },
  },
  {
    id: 'ventas-periodo',
    modulo: 'pos',
    titulo: 'Ventas del Período',
    descripcion: 'Ventas por día, sucursal y vendedor',
    categoria: 'operativo',
    periodosSugeridos: ['diario', 'semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_ventas_resumen', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porDia = d.por_dia ?? [];

      return buildReportData(
        'ventas-periodo', 'Ventas del Período', 'pos', periodo,
        [
          { titulo: 'Total Ventas', valor: d.total_ventas ?? 0, formato: 'moneda' },
          { titulo: 'N° Ventas', valor: d.num_ventas ?? 0, formato: 'numero' },
          { titulo: 'Ticket Promedio', valor: d.num_ventas > 0 ? (d.total_ventas / d.num_ventas) : 0, formato: 'moneda' },
        ],
        [
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
          { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
        ],
        porDia,
        { total: porDia.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total ?? 0), 0),
          num_ventas: porDia.reduce((s: number, r: Record<string, unknown>) => s + Number(r.num_ventas ?? 0), 0) },
      );
    },
  },
  {
    id: 'ventas-hora',
    modulo: 'pos',
    titulo: 'Ventas por Hora',
    descripcion: 'Heatmap de volumen de ventas por hora del día',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_ventas_por_hora', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porHora = d.por_hora ?? [];

      return buildReportData(
        'ventas-hora', 'Ventas por Hora', 'pos', periodo,
        [
          { titulo: 'Hora Pico', valor: porHora.length > 0 ? porHora.reduce((max: Record<string, unknown>, h: Record<string, unknown>) => Number(h.total) > Number(max.total) ? h : max, porHora[0])?.hora ?? '—' : '—' },
          { titulo: 'Total Ventas', valor: porHora.reduce((s: number, h: Record<string, unknown>) => s + Number(h.total ?? 0), 0), formato: 'moneda' },
        ],
        [
          { key: 'hora', titulo: 'Hora', tipo: 'numero', alinear: 'center' },
          { key: 'total', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
          { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
        ],
        porHora,
      );
    },
  },
  {
    id: 'ventas-vendedor',
    modulo: 'pos',
    titulo: 'Ventas por Vendedor',
    descripcion: 'Ranking de vendedores por monto y número de ventas',
    categoria: 'comercial',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_ventas_resumen', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const porVendedor = d.por_vendedor ?? [];

      return buildReportData(
        'ventas-vendedor', 'Ventas por Vendedor', 'pos', periodo,
        [
          { titulo: 'Total Ventas', valor: d.total_ventas ?? 0, formato: 'moneda' },
          { titulo: 'Vendedores Activos', valor: porVendedor.length, formato: 'numero' },
        ],
        [
          { key: 'vendedor_id', titulo: 'Vendedor', tipo: 'texto' },
          { key: 'total', titulo: 'Total Vendido', tipo: 'moneda', alinear: 'right' },
          { key: 'num_ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
        ],
        porVendedor,
        { total: porVendedor.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total ?? 0), 0),
          num_ventas: porVendedor.reduce((s: number, r: Record<string, unknown>) => s + Number(r.num_ventas ?? 0), 0) },
      );
    },
  },
  {
    id: 'devoluciones-descuentos',
    modulo: 'pos',
    titulo: 'Devoluciones y Descuentos',
    descripcion: 'Resumen de devoluciones y descuentos aplicados',
    categoria: 'operativo',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_cierre_caja', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'devoluciones-descuentos', 'Devoluciones y Descuentos', 'pos', periodo,
        [
          { titulo: 'Descuentos', valor: d.descuentos ?? 0, formato: 'moneda' },
          { titulo: 'Devoluciones', valor: d.devoluciones ?? 0, formato: 'moneda' },
          { titulo: 'Propinas', valor: d.propinas ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'concepto', titulo: 'Concepto', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
        ],
        [
          { concepto: 'Descuentos', monto: d.descuentos ?? 0 },
          { concepto: 'Devoluciones', monto: d.devoluciones ?? 0 },
          { concepto: 'Propinas', monto: d.propinas ?? 0 },
        ],
        { monto: (Number(d.descuentos ?? 0)) + (Number(d.devoluciones ?? 0)) + (Number(d.propinas ?? 0)) },
      );
    },
  },
  {
    id: 'pedidos-online',
    modulo: 'pos',
    titulo: 'Pedidos Online',
    descripcion: 'Pedidos web: estado, tiempo de entrega, conversión',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('web_orders')
        .select('id, status, total, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pedidos = data ?? [];
      const porEstado: Record<string, number> = {};
      pedidos.forEach((p: Record<string, unknown>) => {
        const st = String(p.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'pedidos-online', 'Pedidos Online', 'pos', periodo,
        [
          { titulo: 'Total Pedidos', valor: pedidos.length, formato: 'numero' },
          { titulo: 'Total Valor', valor: pedidos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total ?? 0), 0), formato: 'moneda' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: pedidos.length },
      );
    },
  },
];
