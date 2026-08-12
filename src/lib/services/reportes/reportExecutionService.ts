// ============================================================
// reportExecutionService — Persistencia e historial de cierres
// Fase 7: registra cierres consolidados en report_executions
// ============================================================

import { supabase } from '@/lib/supabase/config';
import type { PeriodoCierre, ReportData } from './types';

/** Datos completos de la organización para el PDF */
export interface OrgFullInfo {
  id: number;
  name: string;
  legalName?: string;
  nit?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  state?: string;
  country?: string;
}

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
      user_id: executedBy ?? null,
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

/**
 * Obtiene los datos completos de la organización para el PDF.
 */
export async function obtenerDatosOrganizacion(organizationId: number): Promise<OrgFullInfo | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, legal_name, nit, city, address, phone, email, logo_url, state, country')
    .eq('id', organizationId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    legalName: data.legal_name ?? undefined,
    nit: data.nit ?? undefined,
    city: data.city ?? undefined,
    address: data.address ?? undefined,
    phone: data.phone ?? undefined,
    email: data.email ?? undefined,
    logoUrl: data.logo_url ?? undefined,
    state: data.state ?? undefined,
    country: data.country ?? undefined,
  };
}

/**
 * Genera el número de documento secuencial para un cierre.
 * Formato: CIERRE-{TIPO}-{YYYYMM}-{seq:03d}
 * Ejemplo: CIERRE-MENSUAL-202608-001
 */
export async function generarNumeroDocumento(
  organizationId: number,
  periodo: PeriodoCierre,
): Promise<string> {
  const tipoUpper = periodo.tipo.toUpperCase();
  const year = periodo.fechaInicio.slice(0, 4);
  const month = periodo.fechaInicio.slice(5, 7);
  const prefix = `cierre-${periodo.tipo}`;

  // Contar cierres del mismo tipo en el mismo mes/año
  const { count, error } = await supabase
    .from('report_executions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('report_id', prefix)
    .gte('created_at', `${year}-${month}-01T00:00:00Z`)
    .lt('created_at', `${year}-${String(Number(month) + 1).padStart(2, '0')}-01T00:00:00Z`);

  if (error) {
    console.warn('Error obteniendo correlativo de cierre:', error.message);
  }

  const seq = (count ?? 0) + 1;
  return `CIERRE-${tipoUpper}-${year}${month}-${String(seq).padStart(3, '0')}`;
}
