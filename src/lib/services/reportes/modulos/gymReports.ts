// ============================================================
// Reportes de Gimnasio (Gym)
// Consultas directas a Supabase para membresías, asistencia y retención
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

export const gymReports: ReportDefinition[] = [
  {
    id: 'gym-membresias',
    modulo: 'gym',
    titulo: 'Membresías',
    descripcion: 'Membresías activas, nuevas, churn y MRR',
    categoria: 'comercial',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, status, start_date, end_date, membership_plans(name, price)')
        .eq('organization_id', orgId);

      if (error) throw error;

      const membresias = (data ?? []).map((m: Record<string, unknown>) => {
        const plan = m.membership_plans as Record<string, unknown> | null;
        return {
          ...m,
          plan_name: plan?.name ?? 'Sin plan',
          monthly_fee: Number(plan?.price ?? 0),
        };
      });
      const activas = membresias.filter((m: Record<string, unknown>) => m.status === 'active');
      const nuevas = membresias.filter((m: Record<string, unknown>) => {
        const start = String(m.start_date ?? '').split('T')[0];
        return start >= periodo.fechaInicio && start <= periodo.fechaFin;
      });
      const mrr = activas.reduce((s: number, m: Record<string, unknown>) => s + Number(m.monthly_fee ?? 0), 0);

      return buildReportData(
        'gym-membresias', 'Membresías', 'gym', periodo,
        [
          { titulo: 'Activas', valor: activas.length, formato: 'numero' },
          { titulo: 'Nuevas', valor: nuevas.length, formato: 'numero' },
          { titulo: 'MRR', valor: mrr, formato: 'moneda' },
        ],
        [
          { key: 'plan_name', titulo: 'Plan', tipo: 'texto' },
          { key: 'status', titulo: 'Estado', tipo: 'texto' },
          { key: 'monthly_fee', titulo: 'Cuota', tipo: 'moneda', alinear: 'right' },
          { key: 'start_date', titulo: 'Inicio', tipo: 'fecha' },
        ],
        membresias,
      );
    },
  },
  {
    id: 'gym-asistencia',
    modulo: 'gym',
    titulo: 'Actividad de Membresías',
    descripcion: 'Eventos de membresías por día (altas, renovaciones, cancelaciones)',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('membership_events')
        .select('id, membership_id, event_type, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const eventos = data ?? [];
      const porDia: Record<string, number> = {};
      eventos.forEach((c: Record<string, unknown>) => {
        const dia = String(c.created_at ?? '').split('T')[0];
        porDia[dia] = (porDia[dia] ?? 0) + 1;
      });

      const filas = Object.entries(porDia).map(([dia, cantidad]) => ({ dia, cantidad }));

      return buildReportData(
        'gym-asistencia', 'Actividad de Membresías', 'gym', periodo,
        [
          { titulo: 'Total Eventos', valor: eventos.length, formato: 'numero' },
        ],
        [
          { key: 'dia', titulo: 'Día', tipo: 'fecha' },
          { key: 'cantidad', titulo: 'Eventos', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: eventos.length },
      );
    },
  },
  {
    id: 'gym-retencion',
    modulo: 'gym',
    titulo: 'Retención',
    descripcion: 'Tasa de retención y churn por cohorte',
    categoria: 'comercial',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('memberships')
        .select('id, status, start_date, end_date')
        .eq('organization_id', orgId);

      if (error) throw error;

      const membresias = data ?? [];
      const activas = membresias.filter((m: Record<string, unknown>) => m.status === 'active').length;
      const canceladas = membresias.filter((m: Record<string, unknown>) => {
        const end = String(m.end_date ?? '');
        return m.status !== 'active' && end >= periodo.fechaInicio && end <= periodo.fechaFin;
      }).length;
      const total = activas + canceladas;
      const retencion = total > 0 ? Math.round((activas / total) * 100) : 0;
      const churn = total > 0 ? Math.round((canceladas / total) * 100) : 0;

      return buildReportData(
        'gym-retencion', 'Retención', 'gym', periodo,
        [
          { titulo: 'Activas', valor: activas, formato: 'numero' },
          { titulo: 'Canceladas', valor: canceladas, formato: 'numero' },
          { titulo: 'Tasa Retención', valor: retencion, formato: 'porcentaje' },
          { titulo: 'Churn', valor: churn, formato: 'porcentaje' },
        ],
        [
          { key: 'metrica', titulo: 'Métrica', tipo: 'texto' },
          { key: 'valor', titulo: 'Valor', tipo: 'numero', alinear: 'right' },
        ],
        [
          { metrica: 'Membresías Activas', valor: activas },
          { metrica: 'Canceladas en Período', valor: canceladas },
          { metrica: 'Tasa de Retención %', valor: retencion },
          { metrica: 'Churn Rate %', valor: churn },
        ],
      );
    },
  },
];
