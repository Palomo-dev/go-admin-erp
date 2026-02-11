import { supabase } from '@/lib/supabase/config';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface HRMFilters {
  dateFrom: string;
  dateTo: string;
  branchId: number | null;
  departmentId: string | null;
}

export interface HRMKPI {
  totalEmpleados: number;
  eventosAsistencia: number;
  turnosProgramados: number;
  turnosCumplidos: number;
  ausenciasSolicitadas: number;
  ausenciasAprobadas: number;
  costoNominaBruto: number;
  costoNominaNet: number;
}

export interface AsistenciaPorDia {
  fecha: string;
  clock_in: number;
  clock_out: number;
}

export interface AusenciaPorTipo {
  leave_type_name: string;
  count: number;
  total_days: number;
}

export interface NominaPorPeriodo {
  period_name: string;
  period_start: string;
  total_gross: number;
  total_net: number;
  total_employer_cost: number;
  employees: number;
}

export interface TurnoResumen {
  id: string;
  employee_name: string;
  department_name: string;
  branch_name: string;
  work_date: string;
  status: string;
  actual_start: string | null;
  actual_end: string | null;
}

export interface EmpleadoAsistencia {
  employment_id: string;
  employee_name: string;
  department_name: string;
  total_events: number;
  clock_ins: number;
  clock_outs: number;
  turnos_asignados: number;
  turnos_cumplidos: number;
  ausencias: number;
}

// ─── Servicio ────────────────────────────────────────────────────────────────

export const hrmReportService = {

  async getKPIs(organizationId: number, filters: HRMFilters): Promise<HRMKPI> {
    // Empleados activos
    const { count: totalEmpleados } = await supabase
      .from('employments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('branch_id', filters.branchId || undefined as any)
      .not('branch_id', 'is', filters.branchId ? undefined : null);

    // Mejor: query sin filtro branch si es null
    let empQuery = supabase
      .from('employments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');
    if (filters.branchId) empQuery = empQuery.eq('branch_id', filters.branchId);
    if (filters.departmentId) empQuery = empQuery.eq('department_id', filters.departmentId);
    const { count: empCount } = await empQuery;

    // Eventos de asistencia
    let attQuery = supabase
      .from('attendance_events')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('event_at', filters.dateFrom)
      .lte('event_at', filters.dateTo + 'T23:59:59.999Z');
    if (filters.branchId) attQuery = attQuery.eq('branch_id', filters.branchId);
    const { count: eventosAsistencia } = await attQuery;

    // Turnos
    let shiftQuery = supabase
      .from('shift_assignments')
      .select('status')
      .eq('organization_id', organizationId)
      .gte('work_date', filters.dateFrom)
      .lte('work_date', filters.dateTo);
    if (filters.branchId) shiftQuery = shiftQuery.eq('branch_id', filters.branchId);
    const { data: shifts } = await shiftQuery;

    const turnosProgramados = shifts?.length || 0;
    const turnosCumplidos = (shifts || []).filter((s) => s.status === 'completed' || s.status === 'worked').length;

    // Ausencias
    let leaveQuery = supabase
      .from('leave_requests')
      .select('status')
      .eq('organization_id', organizationId)
      .gte('start_date', filters.dateFrom)
      .lte('start_date', filters.dateTo);
    const { data: leaves } = await leaveQuery;

    const ausenciasSolicitadas = leaves?.length || 0;
    const ausenciasAprobadas = (leaves || []).filter((l) => l.status === 'approved').length;

    // Nómina del período
    let payQuery = supabase
      .from('payroll_periods')
      .select('total_gross, total_net')
      .eq('organization_id', organizationId)
      .gte('period_start', filters.dateFrom)
      .lte('period_end', filters.dateTo);
    const { data: payrolls } = await payQuery;

    let costoNominaBruto = 0;
    let costoNominaNet = 0;
    for (const p of payrolls || []) {
      costoNominaBruto += Number(p.total_gross) || 0;
      costoNominaNet += Number(p.total_net) || 0;
    }

    return {
      totalEmpleados: empCount || 0,
      eventosAsistencia: eventosAsistencia || 0,
      turnosProgramados, turnosCumplidos,
      ausenciasSolicitadas, ausenciasAprobadas,
      costoNominaBruto, costoNominaNet,
    };
  },

  async getAsistenciaPorDia(
    organizationId: number,
    filters: HRMFilters
  ): Promise<AsistenciaPorDia[]> {
    let query = supabase
      .from('attendance_events')
      .select('event_type, event_at')
      .eq('organization_id', organizationId)
      .gte('event_at', filters.dateFrom)
      .lte('event_at', filters.dateTo + 'T23:59:59.999Z')
      .order('event_at', { ascending: true });

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);

    const { data } = await query;
    if (!data) return [];

    const grouped: Record<string, { clock_in: number; clock_out: number }> = {};
    for (const e of data) {
      const fecha = new Date(e.event_at).toISOString().split('T')[0];
      if (!grouped[fecha]) grouped[fecha] = { clock_in: 0, clock_out: 0 };
      if (e.event_type === 'clock_in') grouped[fecha].clock_in++;
      else if (e.event_type === 'clock_out') grouped[fecha].clock_out++;
    }

    return Object.entries(grouped).map(([fecha, v]) => ({
      fecha, clock_in: v.clock_in, clock_out: v.clock_out,
    }));
  },

  async getAusenciasPorTipo(
    organizationId: number,
    filters: HRMFilters
  ): Promise<AusenciaPorTipo[]> {
    let query = supabase
      .from('leave_requests')
      .select('leave_type_id, total_days, status')
      .eq('organization_id', organizationId)
      .gte('start_date', filters.dateFrom)
      .lte('start_date', filters.dateTo)
      .in('status', ['approved', 'pending']);

    const { data } = await query;
    if (!data || data.length === 0) return [];

    const typeIds = Array.from(new Set(data.map((d) => d.leave_type_id).filter(Boolean)));
    const { data: types } = await supabase.from('leave_types').select('id, name').in('id', typeIds);
    const nameMap: Record<string, string> = {};
    for (const t of types || []) nameMap[t.id] = t.name;

    const grouped: Record<string, { count: number; days: number }> = {};
    for (const l of data) {
      const name = nameMap[l.leave_type_id] || 'Otro';
      if (!grouped[name]) grouped[name] = { count: 0, days: 0 };
      grouped[name].count++;
      grouped[name].days += Number(l.total_days) || 0;
    }

    return Object.entries(grouped)
      .map(([leave_type_name, v]) => ({ leave_type_name, count: v.count, total_days: v.days }))
      .sort((a, b) => b.total_days - a.total_days);
  },

  async getNominaPorPeriodo(
    organizationId: number,
    filters: HRMFilters
  ): Promise<NominaPorPeriodo[]> {
    let query = supabase
      .from('payroll_periods')
      .select('name, period_start, total_gross, total_net, total_employer_cost, total_employees, status')
      .eq('organization_id', organizationId)
      .gte('period_start', filters.dateFrom)
      .lte('period_end', filters.dateTo)
      .order('period_start', { ascending: true });

    const { data } = await query;
    if (!data) return [];

    return data.map((p) => ({
      period_name: p.name || `${p.period_start}`,
      period_start: p.period_start,
      total_gross: Number(p.total_gross) || 0,
      total_net: Number(p.total_net) || 0,
      total_employer_cost: Number(p.total_employer_cost) || 0,
      employees: p.total_employees || 0,
    }));
  },

  async getTurnosDetalle(
    organizationId: number,
    filters: HRMFilters,
    limit: number = 30
  ): Promise<TurnoResumen[]> {
    let query = supabase
      .from('shift_assignments')
      .select('id, employment_id, work_date, status, actual_start_time, actual_end_time, branch_id')
      .eq('organization_id', organizationId)
      .gte('work_date', filters.dateFrom)
      .lte('work_date', filters.dateTo)
      .order('work_date', { ascending: false })
      .limit(limit);

    if (filters.branchId) query = query.eq('branch_id', filters.branchId);

    const { data, error } = await query;
    if (error || !data) return [];

    // Resolver nombres
    const empIds = Array.from(new Set(data.map((d) => d.employment_id).filter(Boolean)));
    const branchIds = Array.from(new Set(data.map((d) => d.branch_id).filter(Boolean)));

    const [empRes, branchRes] = await Promise.all([
      empIds.length > 0
        ? supabase.from('employments').select('id, employee_code, department_id, organization_member_id').in('id', empIds)
        : { data: [] },
      branchIds.length > 0
        ? supabase.from('branches').select('id, name').in('id', branchIds)
        : { data: [] },
    ]);

    // Resolver org_members → profiles para nombres
    const memberIds = (empRes.data || []).map((e) => e.organization_member_id).filter(Boolean);
    let profileMap: Record<string, string> = {};
    if (memberIds.length > 0) {
      const { data: members } = await supabase
        .from('organization_members')
        .select('id, user_id')
        .in('id', memberIds);
      const userIds = (members || []).map((m) => m.user_id).filter(Boolean);
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', userIds);
        const userNameMap: Record<string, string> = {};
        for (const p of profiles || []) {
          userNameMap[p.id] = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Sin nombre';
        }
        const memberUserMap: Record<number, string> = {};
        for (const m of members || []) memberUserMap[m.id] = m.user_id;
        for (const e of empRes.data || []) {
          const userId = memberUserMap[e.organization_member_id];
          if (userId) profileMap[e.id] = userNameMap[userId] || e.employee_code || 'Empleado';
        }
      }
    }

    // Dept names
    const deptIds = Array.from(new Set((empRes.data || []).map((e) => e.department_id).filter(Boolean)));
    let deptMap: Record<string, string> = {};
    if (deptIds.length > 0) {
      const { data: depts } = await supabase.from('departments').select('id, name').in('id', deptIds);
      for (const d of depts || []) deptMap[d.id] = d.name;
    }

    const empDeptMap: Record<string, string> = {};
    for (const e of empRes.data || []) {
      empDeptMap[e.id] = deptMap[e.department_id] || '—';
    }

    const branchMap: Record<number, string> = {};
    for (const b of branchRes.data || []) branchMap[b.id] = b.name;

    return data.map((s) => ({
      id: s.id,
      employee_name: profileMap[s.employment_id] || `Emp. ${s.employment_id?.substring(0, 6)}`,
      department_name: empDeptMap[s.employment_id] || '—',
      branch_name: branchMap[s.branch_id] || '',
      work_date: s.work_date,
      status: s.status || '',
      actual_start: s.actual_start_time || null,
      actual_end: s.actual_end_time || null,
    }));
  },

  async getBranches(organizationId: number): Promise<{ id: number; name: string }[]> {
    const { data } = await supabase.from('branches').select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true).order('name');
    return data || [];
  },

  async getDepartments(organizationId: number): Promise<{ id: string; name: string }[]> {
    const { data } = await supabase.from('departments').select('id, name')
      .eq('organization_id', organizationId).eq('is_active', true).order('name');
    return data || [];
  },

  async saveReport(organizationId: number, userId: string, report: { name: string; filters: HRMFilters }) {
    const { data, error } = await supabase.from('saved_reports').insert({
      organization_id: organizationId, user_id: userId,
      name: report.name, module: 'hrm', filters: report.filters as any,
    }).select().single();
    if (error) { console.error('Error saving report:', error); return null; }
    return data;
  },

  async getSavedReports(organizationId: number) {
    const { data } = await supabase.from('saved_reports').select('*')
      .eq('organization_id', organizationId).eq('module', 'hrm')
      .order('created_at', { ascending: false });
    return data || [];
  },
};
