// ============================================================
// Reportes de CRM
// Llama a las RPCs: fn_reporte_crm_funnel, fn_reporte_crm_ranking_vendedores
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import { applyBranchFilter } from '@/lib/services/branchFilterHelper';
import type { DefinicionModulo, ReportData, PeriodoCierre } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const crmReports: DefinicionModulo[] = [
  {
    id: 'crm-funnel',
    modulo: 'crm',
    titulo: 'Embudo de ventas',
    descripcion: 'Oportunidades por etapa, conversión entre etapas y proyección',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_crm_funnel', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'crm-funnel', 'Embudo de ventas', 'crm', periodo,
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
    titulo: 'Proyección del embudo',
    descripcion: 'Ingresos esperados según la probabilidad de cierre',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_crm_funnel', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
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
        'crm-forecast', 'Proyección del embudo', 'crm', periodo,
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
    titulo: 'Ranking de vendedores (CRM)',
    descripcion: 'Oportunidades abiertas, ganadas y monto cerrado por vendedor',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_crm_ranking_vendedores', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'crm-ranking-vendedores', 'Ranking de vendedores (CRM)', 'crm', periodo,
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
    descripcion: 'Llamadas, reuniones, correos y visitas del periodo',
    categoria: 'comercial',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await applyBranchFilter(
        db
          .from('activities')
          .select('activity_type, created_at')
          .eq('organization_id', orgId)
          .gte('created_at', start)
          .lte('created_at', end),
        branchId,
      );

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
    descripcion: 'Rendimiento de campañas: contactos, conversión y retorno',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db
        .from('campaigns')
        .select('id, name, status, channel, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end);

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
    titulo: 'Clientes (CRM)',
    descripcion: 'Crecimiento, segmentación y valor por cliente',
    categoria: 'comercial',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_clientes_crecimiento', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'crm-clientes', 'Clientes (CRM)', 'crm', periodo,
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
