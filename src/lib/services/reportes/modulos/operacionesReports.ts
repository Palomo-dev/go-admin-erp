// ============================================================
// Reportes de Operaciones (Timeline/Auditoría)
// Llama a la RPC: fn_reporte_operaciones_actividad
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

export const operacionesReports: ReportDefinition[] = [
  {
    id: 'operaciones-actividad',
    modulo: 'operations',
    titulo: 'Actividad del Sistema',
    descripcion: 'Eventos de auditoría y timeline del período',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_operaciones_actividad', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'operaciones-actividad', 'Actividad del Sistema', 'operations', periodo,
        [
          { titulo: 'Total Eventos', valor: d.total_eventos ?? 0, formato: 'numero' },
        ],
        [
          { key: 'modulo', titulo: 'Módulo', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Eventos', tipo: 'numero', alinear: 'right' },
        ],
        d.por_modulo ?? [],
      );
    },
  },
  {
    id: 'operaciones-auditoria',
    modulo: 'operations',
    titulo: 'Auditoría General',
    descripcion: 'Logs de auditoría por usuario y módulo',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_operaciones_actividad', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'operaciones-auditoria', 'Auditoría General', 'operations', periodo,
        [
          { titulo: 'Total Eventos', valor: d.total_eventos ?? 0, formato: 'numero' },
        ],
        [
          { key: 'usuario_id', titulo: 'Usuario', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Eventos', tipo: 'numero', alinear: 'right' },
        ],
        d.por_usuario ?? [],
      );
    },
  },
];
