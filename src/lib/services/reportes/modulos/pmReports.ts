// ============================================================
// Reportes de Gestión de Proyectos (PM)
// Consultas directas a Supabase para tareas y performance
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

export const pmReports: ReportDefinition[] = [
  {
    id: 'pm-tareas',
    modulo: 'pm',
    titulo: 'Tareas por Estado',
    descripcion: 'Distribución de tareas por estado y proyecto',
    categoria: 'sistema',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, status, project_id, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const tareas = data ?? [];
      const porEstado: Record<string, number> = {};
      tareas.forEach((t: Record<string, unknown>) => {
        const st = String(t.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'pm-tareas', 'Tareas por Estado', 'pm', periodo,
        [
          { titulo: 'Total Tareas', valor: tareas.length, formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: tareas.length },
      );
    },
  },
  {
    id: 'pm-performance',
    modulo: 'pm',
    titulo: 'Performance por Proyecto',
    descripcion: 'Horas estimadas vs reales, hitos completados',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, start_date, end_date')
        .eq('organization_id', orgId);

      if (error) throw error;

      const proyectos = data ?? [];

      return buildReportData(
        'pm-performance', 'Performance por Proyecto', 'pm', periodo,
        [
          { titulo: 'Total Proyectos', valor: proyectos.length, formato: 'numero' },
        ],
        [
          { key: 'name', titulo: 'Proyecto', tipo: 'texto' },
          { key: 'status', titulo: 'Estado', tipo: 'texto' },
          { key: 'start_date', titulo: 'Inicio', tipo: 'fecha' },
          { key: 'end_date', titulo: 'Fin', tipo: 'fecha' },
        ],
        proyectos,
      );
    },
  },
];
