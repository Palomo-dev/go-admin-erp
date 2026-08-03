// ============================================================
// Reportes de Integraciones
// Llama a la RPC: fn_reporte_integraciones_estado + consultas directas
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

export const integracionesReports: ReportDefinition[] = [
  {
    id: 'integraciones-estado',
    modulo: 'integrations',
    titulo: 'Estado de Conexiones',
    descripcion: 'Conexiones activas, pausadas y errores',
    categoria: 'sistema',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_integraciones_estado', {
        p_organization_id: orgId,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'integraciones-estado', 'Estado de Conexiones', 'integrations', periodo,
        [
          { titulo: 'Activas', valor: d.activas ?? 0, formato: 'numero' },
          { titulo: 'Con Error', valor: d.con_error ?? 0, formato: 'numero' },
          { titulo: 'Pausadas', valor: d.pausadas ?? 0, formato: 'numero' },
        ],
        [
          { key: 'nombre', titulo: 'Conexión', tipo: 'texto' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'errores_24h', titulo: 'Errores 24h', tipo: 'numero', alinear: 'right' },
          { key: 'ultimo_error', titulo: 'Último Error', tipo: 'texto' },
        ],
        d.conexiones ?? [],
      );
    },
  },
  {
    id: 'integraciones-eventos',
    modulo: 'integrations',
    titulo: 'Eventos y Jobs',
    descripcion: 'Volumen de eventos, jobs ejecutados y tasa de error',
    categoria: 'sistema',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('integration_events')
        .select('id, event_type, status, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const eventos = data ?? [];
      const porEstado: Record<string, number> = {};
      eventos.forEach((e: Record<string, unknown>) => {
        const st = String(e.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'integraciones-eventos', 'Eventos y Jobs', 'integrations', periodo,
        [
          { titulo: 'Total Eventos', valor: eventos.length, formato: 'numero' },
          { titulo: 'Errores', valor: porEstado['error'] ?? 0, formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: eventos.length },
      );
    },
  },
];
