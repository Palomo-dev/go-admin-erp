// ============================================================
// Reportes de HRM (Recursos Humanos)
// Consultas directas a Supabase para nómina, productividad y comisiones
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

export const hrmReports: ReportDefinition[] = [
  {
    id: 'hrm-nomina',
    modulo: 'hrm',
    titulo: 'Nómina Quincenal',
    descripcion: 'Pagos, deducciones y costos employer del período',
    categoria: 'personas',
    periodosSugeridos: ['quincenal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('payroll_periods')
        .select('id, start_date, end_date, status, total_gross, total_net, total_deductions')
        .eq('organization_id', orgId)
        .gte('start_date', periodo.fechaInicio)
        .lte('end_date', periodo.fechaFin)
        .order('start_date', { ascending: false });

      if (error) throw error;

      const periodos = data ?? [];

      return buildReportData(
        'hrm-nomina', 'Nómina Quincenal', 'hrm', periodo,
        [
          { titulo: 'Total Bruto', valor: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_gross ?? 0), 0), formato: 'moneda' },
          { titulo: 'Total Neto', valor: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_net ?? 0), 0), formato: 'moneda' },
          { titulo: 'Deducciones', valor: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_deductions ?? 0), 0), formato: 'moneda' },
        ],
        [
          { key: 'start_date', titulo: 'Inicio', tipo: 'fecha' },
          { key: 'end_date', titulo: 'Fin', tipo: 'fecha' },
          { key: 'status', titulo: 'Estado', tipo: 'texto' },
          { key: 'total_gross', titulo: 'Bruto', tipo: 'moneda', alinear: 'right' },
          { key: 'total_net', titulo: 'Neto', tipo: 'moneda', alinear: 'right' },
        ],
        periodos,
        { total_gross: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_gross ?? 0), 0),
          total_net: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_net ?? 0), 0) },
      );
    },
  },
  {
    id: 'hrm-productividad',
    modulo: 'hrm',
    titulo: 'Productividad de Personal',
    descripcion: 'Horas trabajadas, ausencias y productividad por departamento',
    categoria: 'personas',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('shift_assignments')
        .select('id, employee_id, shift_date, status, hours_worked')
        .eq('organization_id', orgId)
        .gte('shift_date', periodo.fechaInicio)
        .lte('shift_date', periodo.fechaFin);

      if (error) throw error;

      const shifts = data ?? [];
      const porEstado: Record<string, { cantidad: number; horas: number }> = {};
      shifts.forEach((s: Record<string, unknown>) => {
        const st = String(s.status ?? 'unknown');
        if (!porEstado[st]) porEstado[st] = { cantidad: 0, horas: 0 };
        porEstado[st].cantidad++;
        porEstado[st].horas += Number(s.hours_worked ?? 0);
      });

      const filas = Object.entries(porEstado).map(([estado, v]) => ({ estado, cantidad: v.cantidad, horas: v.horas }));

      return buildReportData(
        'hrm-productividad', 'Productividad de Personal', 'hrm', periodo,
        [
          { titulo: 'Total Turnos', valor: shifts.length, formato: 'numero' },
          { titulo: 'Horas Trabajadas', valor: shifts.reduce((s: number, r: Record<string, unknown>) => s + Number(r.hours_worked ?? 0), 0), formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Turnos', tipo: 'numero', alinear: 'right' },
          { key: 'horas', titulo: 'Horas', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: shifts.length, horas: shifts.reduce((s: number, r: Record<string, unknown>) => s + Number(r.hours_worked ?? 0), 0) },
      );
    },
  },
  {
    id: 'hrm-comisiones',
    modulo: 'hrm',
    titulo: 'Comisiones',
    descripcion: 'Comisiones calculadas por vendedor y producto',
    categoria: 'personas',
    periodosSugeridos: ['quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre): Promise<ReportData> {
      const { data, error } = await supabase
        .from('sales')
        .select('salesperson_id, commission_rate, commission_type, total, sale_date')
        .eq('organization_id', orgId)
        .gte('sale_date', `${periodo.fechaInicio}T00:00:00Z`)
        .lte('sale_date', `${periodo.fechaFin}T23:59:59Z`)
        .not('salesperson_id', 'is', null)
        .not('status', 'in', '("cancelled","void")');

      if (error) throw error;

      const ventas = data ?? [];
      const porVendedor: Record<string, { ventas: number; total: number; comision: number }> = {};
      ventas.forEach((v: Record<string, unknown>) => {
        const id = String(v.salesperson_id ?? '');
        if (!porVendedor[id]) porVendedor[id] = { ventas: 0, total: 0, comision: 0 };
        porVendedor[id].ventas++;
        porVendedor[id].total += Number(v.total ?? 0);
        const rate = Number(v.commission_rate ?? 0);
        const tipo = String(v.commission_type ?? 'percentage');
        porVendedor[id].comision += tipo === 'fixed' ? rate : (Number(v.total ?? 0) * rate / 100);
      });

      const filas = Object.entries(porVendedor).map(([vendedor_id, v]) => ({
        vendedor_id, ventas: v.ventas, total: v.total, comision: v.comision,
      }));

      return buildReportData(
        'hrm-comisiones', 'Comisiones', 'hrm', periodo,
        [
          { titulo: 'Total Comisiones', valor: filas.reduce((s, f) => s + f.comision, 0), formato: 'moneda' },
          { titulo: 'Vendedores', valor: filas.length, formato: 'numero' },
        ],
        [
          { key: 'vendedor_id', titulo: 'Vendedor', tipo: 'texto' },
          { key: 'ventas', titulo: 'N° Ventas', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Total Ventas', tipo: 'moneda', alinear: 'right' },
          { key: 'comision', titulo: 'Comisión', tipo: 'moneda', alinear: 'right' },
        ],
        filas,
        { comision: filas.reduce((s, f) => s + f.comision, 0) },
      );
    },
  },
];
