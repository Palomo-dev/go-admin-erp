// ============================================================
// Reportes PMS Hotelería
// Consultas directas a Supabase para ocupación, ingresos y housekeeping
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

export const pmsReports: ReportDefinition[] = [
  {
    id: 'pms-ocupacion',
    modulo: 'pms_hotel',
    titulo: 'Ocupación Hotelera',
    descripcion: 'Tasa de ocupación, ADR y RevPAR del período',
    categoria: 'operativo',
    periodosSugeridos: ['semanal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data: spaces } = await supabase
        .from('spaces')
        .select('id, status')
        .eq('organization_id', orgId)
        .eq('space_type', 'room');

      const { data: reservations } = await supabase
        .from('reservations')
        .select('id, checkin, checkout, status, total_estimated')
        .eq('organization_id', orgId)
        .gte('checkin', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('checkin', `${periodo.fechaFin}T23:59:59Z`);

      const totalRooms = spaces?.length ?? 0;
      const activeReservations = (reservations ?? []).filter((r: Record<string, unknown>) => r.status !== 'cancelled');
      const ocupadas = activeReservations.length;
      const tasaOcupacion = totalRooms > 0 ? Math.round((ocupadas / totalRooms) * 100) : 0;
      const totalIngresos = activeReservations.reduce((s: number, r: Record<string, unknown>) => s + Number(r.total_estimated ?? 0), 0);
      const adr = ocupadas > 0 ? totalIngresos / ocupadas : 0;
      const revpar = totalRooms > 0 ? totalIngresos / totalRooms : 0;

      return buildReportData(
        'pms-ocupacion', 'Ocupación Hotelera', 'pms_hotel', periodo,
        [
          { titulo: 'Habitaciones', valor: totalRooms, formato: 'numero' },
          { titulo: 'Ocupadas', valor: ocupadas, formato: 'numero' },
          { titulo: 'Tasa Ocupación', valor: tasaOcupacion, formato: 'porcentaje' },
          { titulo: 'ADR', valor: adr, formato: 'moneda' },
          { titulo: 'RevPAR', valor: revpar, formato: 'moneda' },
        ],
        [
          { key: 'id', titulo: 'Reserva', tipo: 'texto' },
          { key: 'checkin', titulo: 'Check-in', tipo: 'fecha' },
          { key: 'checkout', titulo: 'Check-out', tipo: 'fecha' },
          { key: 'status', titulo: 'Estado', tipo: 'texto' },
          { key: 'total_estimated', titulo: 'Total', tipo: 'moneda', alinear: 'right' },
        ],
        activeReservations,
      );
    },
  },
  {
    id: 'pms-ingresos',
    modulo: 'pms_hotel',
    titulo: 'Ingresos Hoteleros',
    descripcion: 'Ingresos por habitaciones, servicios y folios',
    categoria: 'financiero',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('folios')
        .select('id, folio_type, total_amount, created_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const folios = data ?? [];
      const porTipo: Record<string, number> = {};
      folios.forEach((f: Record<string, unknown>) => {
        const t = String(f.folio_type ?? 'unknown');
        porTipo[t] = (porTipo[t] ?? 0) + Number(f.total_amount ?? 0);
      });

      const filas = Object.entries(porTipo).map(([tipo, monto]) => ({ tipo, monto }));

      return buildReportData(
        'pms-ingresos', 'Ingresos Hoteleros', 'pms_hotel', periodo,
        [
          { titulo: 'Total Ingresos', valor: folios.reduce((s: number, f: Record<string, unknown>) => s + Number(f.total_amount ?? 0), 0), formato: 'moneda' },
        ],
        [
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'monto', titulo: 'Monto', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { monto: folios.reduce((s: number, f: Record<string, unknown>) => s + Number(f.total_amount ?? 0), 0) },
      );
    },
  },
  {
    id: 'pms-housekeeping',
    modulo: 'pms_hotel',
    titulo: 'Housekeeping',
    descripcion: 'Tareas de limpieza: pendientes, completadas y tiempos',
    categoria: 'operativo',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('housekeeping_tasks')
        .select('id, status, assigned_to, created_at, completed_at')
        .eq('organization_id', orgId)
        .gte('created_at', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('created_at', `${periodo.fechaFin}T23:59:59Z`);

      if (error) throw error;

      const tasks = data ?? [];
      const porEstado: Record<string, number> = {};
      tasks.forEach((t: Record<string, unknown>) => {
        const st = String(t.status ?? 'unknown');
        porEstado[st] = (porEstado[st] ?? 0) + 1;
      });

      const filas = Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad }));

      return buildReportData(
        'pms-housekeeping', 'Housekeeping', 'pms_hotel', periodo,
        [
          { titulo: 'Total Tareas', valor: tasks.length, formato: 'numero' },
          { titulo: 'Completadas', valor: porEstado['completed'] ?? 0, formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Cantidad', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: tasks.length },
      );
    },
  },
];
