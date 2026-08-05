// ============================================================
// Reportes de Clientes (core)
// Llama a la RPC: fn_reporte_clientes_crecimiento + consultas directas
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { ReportDefinition, ReportData, PeriodoCierre } from '../types';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const clientesReports: ReportDefinition[] = [
  {
    id: 'clientes-crecimiento',
    modulo: 'clientes',
    titulo: 'Crecimiento de Clientes',
    descripcion: 'Nuevos clientes, total acumulado y crecimiento',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_clientes_crecimiento', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'clientes-crecimiento', 'Crecimiento de Clientes', 'clientes', periodo,
        [
          { titulo: 'Total Clientes', valor: d.total_acumulado ?? 0, formato: 'numero' },
          { titulo: 'Nuevos', valor: d.nuevos_en_periodo ?? 0, formato: 'numero' },
        ],
        [
          { key: 'mes', titulo: 'Mes', tipo: 'fecha' },
          { key: 'nuevos', titulo: 'Nuevos', tipo: 'numero', alinear: 'right' },
        ],
        d.por_mes ?? [],
      );
    },
  },
  {
    id: 'clientes-tipo',
    modulo: 'clientes',
    titulo: 'Clientes por Tipo',
    descripcion: 'Distribución por tipo (persona/empresa), ciudad, segmento',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('customers')
        .select('id, customer_type, city')
        .eq('organization_id', orgId);

      if (error) throw error;

      const clientes = data ?? [];
      const porTipo: Record<string, number> = {};
      clientes.forEach((c: Record<string, unknown>) => {
        const t = String(c.customer_type ?? 'unknown');
        porTipo[t] = (porTipo[t] ?? 0) + 1;
      });

      const filas = Object.entries(porTipo).map(([tipo, cantidad]) => ({ tipo, cantidad }));

      return buildReportData(
        'clientes-tipo', 'Clientes por Tipo', 'clientes', periodo,
        [
          { titulo: 'Total Clientes', valor: clientes.length, formato: 'numero' },
        ],
        [
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: clientes.length },
      );
    },
  },
  {
    id: 'clientes-top',
    modulo: 'clientes',
    titulo: 'Top Clientes',
    descripcion: 'Clientes por volumen de compras y valor',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('sales')
        .select('customer_id, total')
        .eq('organization_id', orgId)
        .gte('sale_date', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('sale_date', `${periodo.fechaFin}T23:59:59Z`)
        .not('status', 'in', '("cancelled","void")')
        .not('customer_id', 'is', null);

      if (error) throw error;

      const ventas = data ?? [];
      const porCliente: Record<string, { total: number; num: number }> = {};
      ventas.forEach((v: Record<string, unknown>) => {
        const id = String(v.customer_id ?? '');
        if (!porCliente[id]) porCliente[id] = { total: 0, num: 0 };
        porCliente[id].total += Number(v.total ?? 0);
        porCliente[id].num++;
      });

      const filas = Object.entries(porCliente)
        .map(([cliente_id, v]) => ({ cliente_id, total: v.total, num_ventas: v.num }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 20);

      return buildReportData(
        'clientes-top', 'Top Clientes', 'clientes', periodo,
        [
          { titulo: 'Clientes Activos', valor: filas.length, formato: 'numero' },
          { titulo: 'Total Ventas', valor: filas.reduce((s, f) => s + f.total, 0), formato: 'moneda' },
        ],
        [
          { key: 'cliente_id', titulo: 'Cliente', tipo: 'texto' },
          { key: 'total', titulo: 'Total Compras', tipo: 'moneda', alinear: 'right' },
          { key: 'num_ventas', titulo: 'N° Compras', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { total: filas.reduce((s, f) => s + f.total, 0) },
      );
    },
  },
];
