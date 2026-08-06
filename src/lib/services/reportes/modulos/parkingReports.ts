// ============================================================
// Reportes de Parking
// Consultas directas a Supabase para ocupación, ingresos y rotación
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

export const parkingReports: ReportDefinition[] = [
  {
    id: 'parking-ocupacion',
    modulo: 'parking',
    titulo: 'Ocupación de Parking',
    descripcion: 'Sesiones, tiempo promedio y tasa de ocupación',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data: orgBranches } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', orgId);
      const branchIds = (orgBranches ?? []).map((b: Record<string, unknown>) => b.id);

      const { data, error } = branchIds.length > 0
        ? await supabase
            .from('parking_sessions')
            .select('id, parking_space_id, entry_at, exit_at, status')
            .in('branch_id', branchIds)
            .gte('entry_at', `${periodo.fechaInicio}T00:00:00Z`)
            .lte('entry_at', `${periodo.fechaFin}T23:59:59Z`)
        : { data: [], error: null };

      if (error) throw error;

      const sesiones = data ?? [];
      const porEstado: Record<string, number> = {};
      sesiones.forEach((s: Record<string, unknown>) => {
        const st = String(s.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'parking-ocupacion', 'Ocupación de Parking', 'parking', periodo,
        [
          { titulo: 'Total Sesiones', valor: sesiones.length, formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Sesiones', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: sesiones.length },
      );
    },
  },
  {
    id: 'parking-ingresos',
    modulo: 'parking',
    titulo: 'Ingresos de Parking',
    descripcion: 'Ingresos por tarifas, abonados y pagos',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data: orgBranches } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', orgId);
      const branchIds = (orgBranches ?? []).map((b: Record<string, unknown>) => b.id);

      const { data, error } = branchIds.length > 0
        ? await supabase
            .from('parking_sessions')
            .select('id, amount, status, entry_at')
            .in('branch_id', branchIds)
            .gte('entry_at', `${periodo.fechaInicio}T00:00:00Z`)
            .lte('entry_at', `${periodo.fechaFin}T23:59:59Z`)
        : { data: [], error: null };

      if (error) throw error;

      const sesiones = data ?? [];
      const total = sesiones.reduce((s: number, r: Record<string, unknown>) => s + Number(r.amount ?? 0), 0);

      return buildReportData(
        'parking-ingresos', 'Ingresos de Parking', 'parking', periodo,
        [
          { titulo: 'Total Ingresos', valor: total, formato: 'moneda' },
          { titulo: 'Sesiones', valor: sesiones.length, formato: 'numero' },
        ],
        [
          { key: 'id', titulo: 'Sesión', tipo: 'texto' },
          { key: 'amount', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
          { key: 'status', titulo: 'Estado', tipo: 'texto' },
        ],
        sesiones,
        { amount: total },
      );
    },
  },
  {
    id: 'parking-rotacion',
    modulo: 'parking',
    titulo: 'Rotación de Espacios',
    descripcion: 'Uso por espacio, rotación y tiempo promedio',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data: orgBranches } = await supabase
        .from('branches')
        .select('id')
        .eq('organization_id', orgId);
      const branchIds = (orgBranches ?? []).map((b: Record<string, unknown>) => b.id);

      const { data, error } = branchIds.length > 0
        ? await supabase
            .from('parking_sessions')
            .select('parking_space_id, entry_at, exit_at')
            .in('branch_id', branchIds)
            .gte('entry_at', `${periodo.fechaInicio}T00:00:00Z`)
            .lte('entry_at', `${periodo.fechaFin}T23:59:59Z`)
            .not('exit_at', 'is', null)
        : { data: [], error: null };

      if (error) throw error;

      const sesiones = data ?? [];
      const porEspacio: Record<string, { sesiones: number; tiempoMs: number }> = {};
      sesiones.forEach((s: Record<string, unknown>) => {
        const id = String(s.parking_space_id ?? '');
        if (!porEspacio[id]) porEspacio[id] = { sesiones: 0, tiempoMs: 0 };
        porEspacio[id].sesiones++;
        const ci = new Date(String(s.entry_at)).getTime();
        const co = new Date(String(s.exit_at)).getTime();
        porEspacio[id].tiempoMs += co - ci;
      });

      const filas = Object.entries(porEspacio).map(([parking_space_id, v]) => ({
        espacio: parking_space_id,
        sesiones: v.sesiones,
        tiempo_promedio_horas: Math.round((v.tiempoMs / v.sesiones / 3600000) * 100) / 100,
      }));

      return buildReportData(
        'parking-rotacion', 'Rotación de Espacios', 'parking', periodo,
        [
          { titulo: 'Espacios Usados', valor: filas.length, formato: 'numero' },
          { titulo: 'Total Sesiones', valor: sesiones.length, formato: 'numero' },
        ],
        [
          { key: 'espacio', titulo: 'Espacio', tipo: 'texto' },
          { key: 'sesiones', titulo: 'Sesiones', tipo: 'numero', alinear: 'right' },
          { key: 'tiempo_promedio_horas', titulo: 'Tiempo Prom. (h)', tipo: 'numero', alinear: 'right' },
        ],
        filas,
      );
    },
  },
];
