// ============================================================
// Reportes de Notificaciones
// Llama a la RPC: fn_reporte_notificaciones_enviadas + consultas directas
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

export const notificacionesReports: DefinicionModulo[] = [
  {
    id: 'notificaciones-enviadas',
    modulo: 'notifications',
    titulo: 'Notificaciones por canal',
    descripcion: 'Volumen de notificaciones por canal y estado',
    categoria: 'sistema',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db.rpc('fn_reporte_notificaciones_enviadas', {
        p_organization_id: orgId,
        p_from: start,
        p_to: end,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'notificaciones-enviadas', 'Notificaciones por canal', 'notifications', periodo,
        [
          { titulo: 'Total Enviadas', valor: d.total ?? 0, formato: 'numero' },
        ],
        [
          { key: 'canal', titulo: 'Canal', tipo: 'texto' },
          { key: 'enviadas', titulo: 'Enviadas', tipo: 'numero', alinear: 'right' },
          { key: 'leidas', titulo: 'Leídas', tipo: 'numero', alinear: 'right' },
        ],
        d.por_canal ?? [],
      );
    },
  },
  {
    id: 'notificaciones-lectura',
    modulo: 'notifications',
    titulo: 'Tasa de lectura',
    descripcion: 'Apertura y clics por canal y tipo',
    categoria: 'sistema',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db
        .from('notifications')
        .select('id, channel, read_at, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end);

      if (error) throw error;

      const notifs = data ?? [];
      const porCanal: Record<string, { enviadas: number; leidas: number }> = {};
      notifs.forEach((n: Record<string, unknown>) => {
        const ch = String(n.channel ?? 'unknown');
        if (!porCanal[ch]) porCanal[ch] = { enviadas: 0, leidas: 0 };
        porCanal[ch].enviadas++;
        if (n.read_at) porCanal[ch].leidas++;
      });

      const filas = Object.entries(porCanal).map(([canal, v]) => ({
        canal,
        enviadas: v.enviadas,
        leidas: v.leidas,
        tasa_lectura: v.enviadas > 0 ? Math.round((v.leidas / v.enviadas) * 100) : 0,
      }));

      return buildReportData(
        'notificaciones-lectura', 'Tasa de lectura', 'notifications', periodo,
        [
          { titulo: 'Total Enviadas', valor: notifs.length, formato: 'numero' },
          { titulo: 'Total Leídas', valor: notifs.filter((n: Record<string, unknown>) => n.read_at).length, formato: 'numero' },
        ],
        [
          { key: 'canal', titulo: 'Canal', tipo: 'texto' },
          { key: 'enviadas', titulo: 'Enviadas', tipo: 'numero', alinear: 'right' },
          { key: 'leidas', titulo: 'Leídas', tipo: 'numero', alinear: 'right' },
          { key: 'tasa_lectura', titulo: 'Tasa %', tipo: 'porcentaje', alinear: 'right' },
        ],
        filas,
      );
    },
  },
  {
    id: 'notificaciones-modulo',
    modulo: 'notifications',
    titulo: 'Notificaciones por módulo',
    descripcion: 'Notificaciones agrupadas por el módulo que las originó',
    categoria: 'sistema',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      const { data, error } = await db
        .from('notifications')
        .select('id, payload, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', start)
        .lte('created_at', end);

      if (error) throw error;

      const notifs = data ?? [];
      const porModulo: Record<string, number> = {};
      notifs.forEach((n: Record<string, unknown>) => {
        const payload = n.payload as Record<string, unknown> | null;
        const mod = String(payload?.module ?? payload?.modulo ?? 'general');
        porModulo[mod] = (porModulo[mod] ?? 0) + 1;
      });

      const filas = Object.entries(porModulo).map(([modulo, cantidad]) => ({ modulo, cantidad }));

      return buildReportData(
        'notificaciones-modulo', 'Notificaciones por módulo', 'notifications', periodo,
        [
          { titulo: 'Total', valor: notifs.length, formato: 'numero' },
        ],
        [
          { key: 'modulo', titulo: 'Módulo', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: notifs.length },
      );
    },
  },
];
