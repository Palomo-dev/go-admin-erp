// ============================================================
// Reportes de CRM
// Llama a las RPCs: fn_reporte_crm_funnel, fn_reporte_crm_ranking_vendedores
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

export const crmReports: ReportDefinition[] = [
  {
    id: 'crm-funnel',
    modulo: 'crm',
    titulo: 'Funnel de Ventas',
    descripcion: 'Oportunidades por etapa, conversión entre etapas y forecast',
    categoria: 'comercial',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_crm_funnel', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'crm-funnel', 'Funnel de Ventas', 'crm', periodo,
        [
          { titulo: 'Total Pipeline', valor: d.total_pipeline ?? 0, formato: 'moneda' },
          { titulo: 'Forecast', valor: d.forecast ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'etapa_nombre', titulo: 'Etapa', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Oportunidades', tipo: 'numero', alinear: 'right' },
          { key: 'monto_total', titulo: 'Monto Total', tipo: 'moneda', alinear: 'right' },
          { key: 'probabilidad', titulo: 'Probabilidad %', tipo: 'porcentaje', alinear: 'right' },
        ],
        d.por_etapa ?? [],
      );
    },
  },
  {
    id: 'crm-forecast',
    modulo: 'crm',
    titulo: 'Pipeline Forecast',
    descripcion: 'Proyección de ingresos por probabilidad de cierre',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_crm_funnel', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};
      const etapas = d.por_etapa ?? [];

      const filas = etapas.map((e: Record<string, unknown>) => ({
        etapa_nombre: e.etapa_nombre,
        monto_total: e.monto_total,
        probabilidad: e.probabilidad,
        forecast: Number(e.monto_total ?? 0) * Number(e.probabilidad ?? 0) / 100,
      }));

      return buildReportData(
        'crm-forecast', 'Pipeline Forecast', 'crm', periodo,
        [
          { titulo: 'Total Pipeline', valor: d.total_pipeline ?? 0, formato: 'moneda' },
          { titulo: 'Forecast Ponderado', valor: d.forecast ?? 0, formato: 'moneda' },
        ],
        [
          { key: 'etapa_nombre', titulo: 'Etapa', tipo: 'texto' },
          { key: 'monto_total', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          { key: 'probabilidad', titulo: 'Prob. %', tipo: 'porcentaje', alinear: 'right' },
          { key: 'forecast', titulo: 'Forecast', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { forecast: d.forecast ?? 0 },
      );
    },
  },
  {
    id: 'crm-ranking-vendedores',
    modulo: 'crm',
    titulo: 'Ranking de Vendedores',
    descripcion: 'Performance de vendedores por oportunidades y monto cerrado',
    categoria: 'comercial',
    periodosSugeridos: ['quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_crm_ranking_vendedores', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'crm-ranking-vendedores', 'Ranking de Vendedores', 'crm', periodo,
        [
          { titulo: 'Vendedores', valor: (d.ranking ?? []).length, formato: 'numero' },
        ],
        [
          { key: 'vendedor_id', titulo: 'Vendedor', tipo: 'texto' },
          { key: 'abiertas', titulo: 'Abiertas', tipo: 'numero', alinear: 'right' },
          { key: 'ganadas', titulo: 'Ganadas', tipo: 'numero', alinear: 'right' },
          { key: 'monto_ganado', titulo: 'Monto Ganado', tipo: 'moneda', alinear: 'right' },
          { key: 'tasa_cierre', titulo: 'Tasa Cierre %', tipo: 'porcentaje', alinear: 'right' },
        ],
        d.ranking ?? [],
      );
    },
  },
  {
    id: 'crm-actividades',
    modulo: 'crm',
    titulo: 'Actividades',
    descripcion: 'Llamadas, reuniones, emails y visitas del período',
    categoria: 'comercial',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('activities')
        .select('activity_type, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const acts = data ?? [];
      const porTipo: Record<string, number> = {};
      acts.forEach((a: Record<string, unknown>) => {
        const t = String(a.activity_type ?? 'unknown');
        porTipo[t] = (porTipo[t] ?? 0) + 1;
      });

      const filas = Object.entries(porTipo).map(([tipo, cantidad]) => ({ tipo, cantidad }));

      return buildReportData(
        'crm-actividades', 'Actividades', 'crm', periodo,
        [
          { titulo: 'Total Actividades', valor: acts.length, formato: 'numero' },
        ],
        [
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: acts.length },
      );
    },
  },
  {
    id: 'crm-campanas',
    modulo: 'crm',
    titulo: 'Campañas',
    descripcion: 'Performance de campañas: contactos, conversión, ROI',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, status, channel, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const camps = data ?? [];

      return buildReportData(
        'crm-campanas', 'Campañas', 'crm', periodo,
        [
          { titulo: 'Total Campañas', valor: camps.length, formato: 'numero' },
        ],
        [
          { key: 'name', titulo: 'Campaña', tipo: 'texto' },
          { key: 'status', titulo: 'Estado', tipo: 'texto' },
          { key: 'channel', titulo: 'Canal', tipo: 'texto' },
        ],
        camps,
      );
    },
  },
  {
    id: 'crm-clientes',
    modulo: 'crm',
    titulo: 'Clientes',
    descripcion: 'Crecimiento, segmentación y valor por cliente',
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
        'crm-clientes', 'Clientes', 'crm', periodo,
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
];
