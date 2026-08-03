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
        .from('gym_memberships')
        .select('id, status, plan_name, monthly_fee, start_date, end_date')
        .eq('organization_id', orgId);

      if (error) throw error;

      const membresias = data ?? [];
      const activas = membresias.filter((m: Record<string, unknown>) => m.status === 'active');
      const nuevas = membresias.filter((m: Record<string, unknown>) => {
        const start = String(m.start_date ?? '');
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
          { key: 'monthly_fee', titulo: 'Cuota Mensual', tipo: 'moneda', alinear: 'right' },
          { key: 'start_date', titulo: 'Inicio', tipo: 'fecha' },
        ],
        membresias,
      );
    },
  },
  {
    id: 'gym-asistencia',
    modulo: 'gym',
    titulo: 'Asistencia',
    descripcion: 'Check-ins por día, hora y plan',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('gym_check_ins')
        .select('id, member_id, check_in_time')
        .eq('organization_id', orgId)
        .gte('check_in_time', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('check_in_time', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const checkins = data ?? [];
      const porDia: Record<string, number> = {};
      checkins.forEach((c: Record<string, unknown>) => {
        const dia = String(c.check_in_time ?? '').split('T')[0];
        porDia[dia] = (porDia[dia] ?? 0) + 1;
      });

      const filas = Object.entries(porDia).map(([dia, cantidad]) => ({ dia, cantidad }));

      return buildReportData(
        'gym-asistencia', 'Asistencia', 'gym', periodo,
        [
          { titulo: 'Total Check-ins', valor: checkins.length, formato: 'numero' },
        ],
        [
          { key: 'dia', titulo: 'Día', tipo: 'fecha' },
          { key: 'cantidad', titulo: 'Check-ins', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: checkins.length },
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
        .from('gym_memberships')
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
