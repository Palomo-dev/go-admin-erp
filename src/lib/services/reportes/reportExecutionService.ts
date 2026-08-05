// ============================================================
// reportExecutionService — Persistencia e historial de cierres
// Fase 7: registra cierres consolidados en report_executions
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { PeriodoCierre, ReportData } from './types';

export interface CierreHistorico {
  id: string;
  report_id: string;
  organization_id: number;
  status: string;
  params: Record<string, unknown>;
  result_snapshot: Record<string, unknown> | null;
  executed_by: string | null;
  created_at: string;
}

/**
 * Registra un cierre consolidado en report_executions.
 * Guarda un snapshot de KPIs globales para consulta histórica.
 */
export async function registrarCierreConsolidado(params: {
  organizationId: number;
  periodo: PeriodoCierre;
  modulos: string[];
  reportes: ReportData[];
  executedBy?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const { organizationId, periodo, modulos, reportes, executedBy } = params;

  const reportId = `cierre-${periodo.tipo}`;
  const status = 'completed';

  // Snapshot: KPIs globales de los reportes ejecutados
  const snapshot: Record<string, unknown> = {
    periodo: {
      tipo: periodo.tipo,
      fechaInicio: periodo.fechaInicio,
      fechaFin: periodo.fechaFin,
      etiqueta: periodo.etiqueta,
    },
    modulos,
    totalReportes: reportes.length,
    kpis: reportes.map((r) => ({
      reporte: r.id,
      titulo: r.titulo,
      kpis: r.kpis,
    })),
  };

  const { data, error } = await supabase
    .from('report_executions')
    .insert({
      organization_id: organizationId,
      report_id: reportId,
      module: 'reportes',
      status,
      params: {
        periodo,
        modulos,
      },
      result_snapshot: snapshot,
      executed_by: executedBy ?? null,
      row_count: reportes.length,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error registrando cierre consolidado:', error);
    return { success: false, error: error.message };
  }

  return { success: true, id: data.id };
}

/**
 * Obtiene el historial de cierres consolidados de una organización.
 */
export async function obtenerHistorialCierres(
  organizationId: number,
  limit = 20,
): Promise<CierreHistorico[]> {
  const { data, error } = await supabase
    .from('report_executions')
    .select('id, report_id, organization_id, status, params, result_snapshot, executed_by, created_at')
    .eq('organization_id', organizationId)
    .like('report_id', 'cierre-%')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error obteniendo historial de cierres:', error);
    return [];
  }

  return (data ?? []) as CierreHistorico[];
}
