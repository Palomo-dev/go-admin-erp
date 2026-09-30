// ============================================================
// Reportes de Integraciones
// Llama a la RPC: fn_reporte_integraciones_estado + consultas directas
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import type { DefinicionModulo, ReportData, PeriodoCierre } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export const integracionesReports: DefinicionModulo[] = [
  {
    id: 'integraciones-estado',
    modulo: 'integrations',
    titulo: 'Estado de conexiones',
    descripcion: 'Conexiones activas, pausadas y con error',
    categoria: 'sistema',
    alcance: 'organizacion',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db.rpc('fn_reporte_integraciones_estado', {
        p_organization_id: orgId,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'integraciones-estado', 'Estado de conexiones', 'integrations', periodo,
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
    titulo: 'Eventos y tareas programadas',
    descripcion: 'Volumen de eventos, tareas ejecutadas y tasa de error',
    categoria: 'sistema',
    alcance: 'organizacion',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db
        .from('integration_events')
        .select('id, event_type, status, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end);

      if (error) throw error;

      const eventos = data ?? [];
      const porEstado: Record<string, number> = {};
      eventos.forEach((e: Record<string, unknown>) => {
        const st = String(e.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'integraciones-eventos', 'Eventos y tareas programadas', 'integrations', periodo,
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
