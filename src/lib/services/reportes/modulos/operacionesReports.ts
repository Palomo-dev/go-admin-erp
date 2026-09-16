// ============================================================
// Reportes de Operaciones (Timeline/Auditoría)
// Llama a la RPC: fn_reporte_operaciones_actividad
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
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
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db.rpc('fn_reporte_operaciones_actividad', {
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
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db.rpc('fn_reporte_operaciones_actividad', {
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
