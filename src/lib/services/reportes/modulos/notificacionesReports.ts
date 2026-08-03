// ============================================================
// Reportes de Notificaciones
// Llama a la RPC: fn_reporte_notificaciones_enviadas + consultas directas
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

export const notificacionesReports: ReportDefinition[] = [
  {
    id: 'notificaciones-enviadas',
    modulo: 'notifications',
    titulo: 'Enviadas por Canal',
    descripcion: 'Volumen de notificaciones por canal y estado',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase.rpc('fn_reporte_notificaciones_enviadas', {
        p_organization_id: orgId,
        p_from: `${periodo.fechaInicio}T00:00:00Z`,
        p_to: `${periodo.fechaFin}T23:59:59Z`,
      });
      if (error) throw error;

      const d = data ?? {};

      return buildReportData(
        'notificaciones-enviadas', 'Enviadas por Canal', 'notifications', periodo,
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
    titulo: 'Tasa de Lectura',
    descripcion: 'Apertura y CTR por canal y tipo',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, channel, read_at, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

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
        'notificaciones-lectura', 'Tasa de Lectura', 'notifications', periodo,
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
    titulo: 'Por Módulo',
    descripcion: 'Notificaciones agrupadas por módulo origen',
    categoria: 'sistema',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, module, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const notifs = data ?? [];
      const porModulo: Record<string, number> = {};
      notifs.forEach((n: Record<string, unknown>) => {
        const mod = String(n.module ?? 'unknown');
        porModulo[mod] = (porModulo[mod] ?? 0) + 1;
      });

      const filas = Object.entries(porModulo).map(([modulo, cantidad]) => ({ modulo, cantidad }));

      return buildReportData(
        'notificaciones-modulo', 'Por Módulo', 'notifications', periodo,
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
