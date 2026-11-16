// ============================================================
// Reportes de HRM (Recursos Humanos)
// Consultas directas a Supabase para nómina, productividad y comisiones
// ============================================================

import { supabase as browserSupabase } from '@/lib/supabase/config';
import type { ReportesClient } from '../types';
// F0-SEC r3 (tester r2, fallo 3): `fetch` acepta el cliente de Supabase por
// parámetro. En el navegador (app/reportes) cae al cliente browser con la sesión
// del usuario; en el servidor (asistente de reportes) el route handler pasa el
// cliente de sesión de `getServerOrgContext()`, así que las RPC `fn_reporte_*`
// corren como `authenticated` miembro y nunca como `anon`.
import { applyBranchFilter } from '@/lib/services/branchFilterHelper';
import type { DefinicionModulo, ReportData, PeriodoCierre } from '../types';
import { rangoDelPeriodo } from '../rangoPeriodo';

function buildReportData(
  id: string, titulo: string, modulo: string, periodo: PeriodoCierre,
  kpis: ReportData['kpis'], columnas: ReportData['columnas'],
  filas: Record<string, unknown>[], totales?: Record<string, unknown>,
): ReportData {
  return { id, titulo, modulo, kpis, columnas, filas, totales, generadoEn: new Date().toISOString(), periodo };
}

export interface FilaComision {
  payee_id: string | null;
  payee_name: string | null;
  base_amount: number | string | null;
  commission_amount: number | string | null;
  status: string;
  currency: string | null;
}

export interface ResumenComisionVendedor {
  vendedor_id: string;
  vendedor: string;
  moneda: string | null;
  ventas: number;
  total: number;
  comision: number;
  pagado: number;
  pendiente: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Nombre de la persona del vínculo (fase 0: `employments.person_id` → `hr_people`). */
interface ConPersona {
  hr_people?: { first_name?: string | null; second_name?: string | null; last_name?: string | null; second_last_name?: string | null } | null;
}
export function nombrePersona(e: ConPersona | null | undefined): string {
  const p = e?.hr_people;
  return [p?.first_name, p?.second_name, p?.last_name, p?.second_last_name].filter(Boolean).join(' ') || '—';
}

/** Días calendario entre dos fechas planas (ambas incluidas). */
export function diasIncluidos(desde: string, hasta: string): number {
  const [ya, ma, da] = desde.split('-').map(Number);
  const [yb, mb, db] = hasta.split('-').map(Number);
  return Math.max(0, Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000) + 1);
}

const PERSONA = 'hr_people(first_name, second_name, last_name, second_last_name)';

/** Agrupa comisiones vivas (accrued/paid) por vendedor y moneda; nunca suma monedas distintas. */
export function resumirComisionesPorVendedor(rows: readonly FilaComision[]): ResumenComisionVendedor[] {
  const grupos = new Map<string, ResumenComisionVendedor>();
  for (const r of rows) {
    if (r.status !== 'accrued' && r.status !== 'paid') continue;
    const id = r.payee_id ?? 'sin-vendedor';
    const moneda = r.currency?.trim() || null;
    const key = `${id}|${moneda ?? ''}`;
    const g = grupos.get(key) ?? { vendedor_id: id, vendedor: r.payee_name || id, moneda, ventas: 0, total: 0, comision: 0, pagado: 0, pendiente: 0 };
    const monto = Number(r.commission_amount) || 0;
    g.ventas += 1;
    g.total = r2(g.total + (Number(r.base_amount) || 0));
    g.comision = r2(g.comision + monto);
    if (r.status === 'paid') g.pagado = r2(g.pagado + monto);
    else g.pendiente = r2(g.pendiente + monto);
    grupos.set(key, g);
  }
  return Array.from(grupos.values()).sort((a, b) => b.comision - a.comision);
}

export const hrmReports: DefinicionModulo[] = [
  {
    id: 'hrm-nomina',
    modulo: 'hrm',
    titulo: 'Nómina quincenal',
    descripcion: 'Pagos, deducciones y costo del empleador por periodo de nómina',
    categoria: 'personas',
    alcance: 'organizacion',
    periodosSugeridos: ['quincenal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db
        .from('payroll_periods')
        .select('id, period_start, period_end, status, total_gross, total_net, total_deductions')
        .eq('organization_id', orgId)
        .gte('period_start', periodo.fechaInicio)
        .lte('period_end', periodo.fechaFin)
        .order('period_start', { ascending: false });

      if (error) throw error;

      const periodos = data ?? [];

      return buildReportData(
        'hrm-nomina', 'Nómina quincenal', 'hrm', periodo,
        [
          { titulo: 'Total Bruto', valor: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_gross ?? 0), 0), formato: 'moneda' },
          { titulo: 'Total Neto', valor: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_net ?? 0), 0), formato: 'moneda' },
          { titulo: 'Deducciones', valor: periodos.reduce((s: number, p: Record<string, unknown>) => s + Number(p.total_deductions ?? 0), 0), formato: 'moneda' },
        ],
        [
          { key: 'period_start', titulo: 'Inicio', tipo: 'fecha' },
          { key: 'period_end', titulo: 'Fin', tipo: 'fecha' },
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
    titulo: 'Productividad de personal',
    descripcion: 'Turnos, horas trabajadas y ausencias',
    categoria: 'personas',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await applyBranchFilter(
        db
          .from('shift_assignments')
          .select('id, employment_id, work_date, status, actual_start_time, actual_end_time')
          .eq('organization_id', orgId)
          .gte('work_date', periodo.fechaInicio)
          .lte('work_date', periodo.fechaFin),
        branchId,
      );

      if (error) throw error;

      const shifts = data ?? [];
      const calcHoras = (s: Record<string, unknown>): number => {
        if (!s.actual_start_time || !s.actual_end_time) return 0;
        const ms = new Date(String(s.actual_end_time)).getTime() - new Date(String(s.actual_start_time)).getTime();
        return ms > 0 ? Math.round((ms / 3600000) * 100) / 100 : 0;
      };
      const porEstado: Record<string, { cantidad: number; horas: number }> = {};
      shifts.forEach((s: Record<string, unknown>) => {
        const st = String(s.status ?? 'unknown');
        if (!porEstado[st]) porEstado[st] = { cantidad: 0, horas: 0 };
        porEstado[st].cantidad++;
        porEstado[st].horas += calcHoras(s);
      });

      const filas = Object.entries(porEstado).map(([estado, v]) => ({ estado, cantidad: v.cantidad, horas: v.horas }));
      const totalHoras = shifts.reduce((s: number, r: Record<string, unknown>) => s + calcHoras(r), 0);

      return buildReportData(
        'hrm-productividad', 'Productividad de personal', 'hrm', periodo,
        [
          { titulo: 'Total Turnos', valor: shifts.length, formato: 'numero' },
          { titulo: 'Horas Trabajadas', valor: totalHoras, formato: 'numero' },
        ],
        [
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
          { key: 'cantidad', titulo: 'Turnos', tipo: 'numero', alinear: 'right' },
          { key: 'horas', titulo: 'Horas', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { cantidad: shifts.length, horas: totalHoras },
      );
    },
  },
  {
    id: 'hrm-comisiones',
    modulo: 'hrm',
    titulo: 'Comisiones',
    descripcion: 'Comisiones devengadas por vendedor, pagadas y pendientes',
    categoria: 'personas',
    alcance: 'sucursal',
    periodosSugeridos: ['quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { start, end } = await rangoDelPeriodo(orgId, periodo, db);
      // La fuente es la tabla commissions (lo que de verdad se devengó, con su
      // método: monto fijo o porcentaje sobre la base SIN impuestos). Antes se
      // recalculaba desde sales comparando commission_type === 'fixed' (nunca
      // ocurre: el tipo es 'salesperson') y sobre el total CON impuestos.
      let query = db
        .from('commissions')
        .select('payee_id, payee_name, base_amount, commission_amount, status, currency, accrued_at')
        .eq('organization_id', orgId)
        .in('status', ['accrued', 'paid'])
        .gte('accrued_at', start)
        .lte('accrued_at', end);
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;

      if (error) throw error;

      const filas = resumirComisionesPorVendedor((data ?? []) as FilaComision[]);
      const totalComision = filas.reduce((s, f) => s + f.comision, 0);

      return buildReportData(
        'hrm-comisiones', 'Comisiones', 'hrm', periodo,
        [
          { titulo: 'Total Comisiones', valor: totalComision, formato: 'moneda' },
          { titulo: 'Vendedores', valor: new Set(filas.map((f) => f.vendedor_id)).size, formato: 'numero' },
        ],
        [
          { key: 'vendedor', titulo: 'Vendedor', tipo: 'texto' },
          { key: 'ventas', titulo: 'N° Comisiones', tipo: 'numero', alinear: 'right' },
          { key: 'total', titulo: 'Base', tipo: 'moneda', alinear: 'right' },
          { key: 'comision', titulo: 'Comisión', tipo: 'moneda', alinear: 'right' },
          { key: 'pagado', titulo: 'Pagado', tipo: 'moneda', alinear: 'right' },
          { key: 'pendiente', titulo: 'Pendiente', tipo: 'moneda', alinear: 'right' },
        ],
        filas as unknown as Record<string, unknown>[],
        { comision: totalComision, pagado: filas.reduce((s, f) => s + f.pagado, 0), pendiente: filas.reduce((s, f) => s + f.pendiente, 0) },
      );
    },
  },
  // ── Movidos desde /app/hrm/reportes (fase 1 de RR. HH., 2026-11-15): los
  // reportes solo viven en el módulo Reportes. Nombres por la persona
  // (`hr_people`), no por el usuario de la app: un empleado puede no tenerlo.
  {
    id: 'hrm-asistencia',
    modulo: 'hrm',
    titulo: 'Asistencia',
    descripcion: 'Horas programadas, trabajadas, extra y llegadas tarde por persona y día',
    categoria: 'personas',
    alcance: 'sucursal',
    periodosSugeridos: ['semanal', 'quincenal', 'mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      let query = db
        .from('timesheets')
        .select(`work_date, scheduled_minutes, worked_minutes, overtime_minutes, late_minutes, employments!timesheets_employment_id_fkey(${PERSONA}), branches!timesheets_branch_id_fkey(name)`)
        .eq('organization_id', orgId)
        .gte('work_date', periodo.fechaInicio)
        .lte('work_date', periodo.fechaFin)
        .order('work_date', { ascending: false });
      if (branchId) query = query.eq('branch_id', branchId);
      const { data, error } = await query;
      if (error) throw error;
      const horas = (m: unknown) => r2((Number(m) || 0) / 60);
      const filas = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        empleado: nombrePersona(r.employments as ConPersona),
        sede: (r.branches as { name?: string } | null)?.name ?? '—',
        fecha: r.work_date,
        programadas: horas(r.scheduled_minutes),
        trabajadas: horas(r.worked_minutes),
        extra: horas(r.overtime_minutes),
        tarde: Number(r.late_minutes) || 0,
      }));
      const prog = filas.reduce((s, f) => s + f.programadas, 0);
      const trab = filas.reduce((s, f) => s + f.trabajadas, 0);
      return buildReportData(
        'hrm-asistencia', 'Asistencia', 'hrm', periodo,
        [
          { titulo: 'Horas trabajadas', valor: r2(trab), formato: 'numero' },
          { titulo: 'Horas extra', valor: r2(filas.reduce((s, f) => s + f.extra, 0)), formato: 'numero' },
          { titulo: 'Cumplimiento (%)', valor: prog > 0 ? Math.round((trab / prog) * 100) : 0, formato: 'numero' },
        ],
        [
          { key: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
          { key: 'empleado', titulo: 'Empleado', tipo: 'texto' },
          { key: 'sede', titulo: 'Sede', tipo: 'texto' },
          { key: 'programadas', titulo: 'Programadas (h)', tipo: 'numero', alinear: 'right' },
          { key: 'trabajadas', titulo: 'Trabajadas (h)', tipo: 'numero', alinear: 'right' },
          { key: 'extra', titulo: 'Extra (h)', tipo: 'numero', alinear: 'right' },
          { key: 'tarde', titulo: 'Tarde (min)', tipo: 'numero', alinear: 'right' },
        ],
        filas,
        { programadas: r2(prog), trabajadas: r2(trab) },
      );
    },
  },
  {
    id: 'hrm-ausencias',
    modulo: 'hrm',
    titulo: 'Ausencias',
    descripcion: 'Vacaciones, permisos e incapacidades que se cruzan con el periodo, con sus días',
    categoria: 'personas',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db
        .from('leave_requests')
        .select(`start_date, end_date, status, leave_types(name), employments!leave_requests_employment_id_fkey(${PERSONA})`)
        .eq('organization_id', orgId)
        .lte('start_date', periodo.fechaFin)
        .gte('end_date', periodo.fechaInicio)
        .order('start_date', { ascending: false });
      if (error) throw error;
      const filas = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        empleado: nombrePersona(r.employments as ConPersona),
        tipo: (r.leave_types as { name?: string } | null)?.name ?? '—',
        desde: r.start_date,
        hasta: r.end_date,
        dias: diasIncluidos(String(r.start_date), String(r.end_date)),
        estado: r.status ?? 'requested',
      }));
      return buildReportData(
        'hrm-ausencias', 'Ausencias', 'hrm', periodo,
        [
          { titulo: 'Solicitudes', valor: filas.length, formato: 'numero' },
          { titulo: 'Días', valor: filas.reduce((s, f) => s + f.dias, 0), formato: 'numero' },
          { titulo: 'Por aprobar', valor: filas.filter((f) => f.estado === 'requested').length, formato: 'numero' },
        ],
        [
          { key: 'empleado', titulo: 'Empleado', tipo: 'texto' },
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'desde', titulo: 'Desde', tipo: 'fecha' },
          { key: 'hasta', titulo: 'Hasta', tipo: 'fecha' },
          { key: 'dias', titulo: 'Días', tipo: 'numero', alinear: 'right' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
        ],
        filas,
        { dias: filas.reduce((s, f) => s + f.dias, 0) },
      );
    },
  },
  {
    id: 'hrm-prestamos',
    modulo: 'hrm',
    titulo: 'Préstamos a empleados',
    descripcion: 'Cartera de préstamos: desembolsado, saldo y cuotas pagadas',
    categoria: 'personas',
    alcance: 'organizacion',
    periodosSugeridos: ['mensual'],
    async fetch(orgId: number, periodo: PeriodoCierre, branchId?: number | null, client?: ReportesClient): Promise<ReportData> {
      const db = client ?? browserSupabase;
      const { data, error } = await db
        .from('employee_loans')
        .select(`loan_number, loan_type, principal, balance, installments_paid, installments_total, status, employments!employee_loans_employment_id_fkey(${PERSONA})`)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const filas = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        empleado: nombrePersona(r.employments as ConPersona),
        numero: r.loan_number ?? '—',
        tipo: r.loan_type ?? '—',
        principal: Number(r.principal) || 0,
        saldo: Number(r.balance) || 0,
        cuotas: `${Number(r.installments_paid) || 0}/${Number(r.installments_total) || 0}`,
        estado: r.status ?? '—',
      }));
      const activos = filas.filter((f) => f.estado === 'active');
      return buildReportData(
        'hrm-prestamos', 'Préstamos a empleados', 'hrm', periodo,
        [
          { titulo: 'Desembolsado', valor: r2(filas.reduce((s, f) => s + f.principal, 0)), formato: 'moneda' },
          { titulo: 'Saldo activo', valor: r2(activos.reduce((s, f) => s + f.saldo, 0)), formato: 'moneda' },
          { titulo: 'Préstamos activos', valor: activos.length, formato: 'numero' },
        ],
        [
          { key: 'empleado', titulo: 'Empleado', tipo: 'texto' },
          { key: 'numero', titulo: 'Número', tipo: 'texto' },
          { key: 'tipo', titulo: 'Tipo', tipo: 'texto' },
          { key: 'principal', titulo: 'Desembolsado', tipo: 'moneda', alinear: 'right' },
          { key: 'saldo', titulo: 'Saldo', tipo: 'moneda', alinear: 'right' },
          { key: 'cuotas', titulo: 'Cuotas', tipo: 'texto' },
          { key: 'estado', titulo: 'Estado', tipo: 'texto' },
        ],
        filas,
        { principal: r2(filas.reduce((s, f) => s + f.principal, 0)), saldo: r2(activos.reduce((s, f) => s + f.saldo, 0)) },
      );
    },
  },
];
