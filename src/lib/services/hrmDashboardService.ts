import { supabase } from '@/lib/supabase/config';

export interface HRMKPIs {
  activeEmployees: number;
  absencesToday: number;
  shiftsToday: number;
  pendingTimesheets: number;
  payrollInProcess: number;
  activeLoans: number;
}

export interface HRMAlert {
  id: string;
  type: 'warning' | 'danger' | 'info';
  title: string;
  description: string;
  count: number;
  link: string;
}

export interface PayrollPeriodInfo {
  id: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  status: string;
  totalEmployees: number | null;
  totalNet: number | null;
}

export interface PayrollRunInfo {
  id: string;
  runNumber: number;
  executedAt: string;
  status: string;
  isFinal: boolean;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  employeeCount: number;
}

class HRMDashboardService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  // Obtiene los IDs de organization_members de la organización.
  // employments no tiene organization_id, se vincula vía organization_member_id.
  private async getMemberIds(): Promise<number[]> {
    const { data, error } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching member ids:', error);
      return [];
    }

    return (data || []).map((m) => m.id as number);
  }

  // Obtiene los IDs de employee_loans de la organización.
  // loan_installments no tiene organization_id, se vincula vía loan_id.
  private async getLoanIds(): Promise<string[]> {
    const { data, error } = await supabase
      .from('employee_loans')
      .select('id')
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error fetching loan ids:', error);
      return [];
    }

    return (data || []).map((l) => l.id as string);
  }

  async getKPIs(): Promise<HRMKPIs> {
    const today = new Date().toISOString().split('T')[0];
    const memberIds = await this.getMemberIds();

    // Empleados activos (filtrar por organization_member_id de esta org)
    let activeEmployeesQuery = supabase
      .from('employments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('termination_date', null);

    if (memberIds.length > 0) {
      activeEmployeesQuery = activeEmployeesQuery.in('organization_member_id', memberIds);
    } else {
      activeEmployeesQuery = activeEmployeesQuery.eq('organization_member_id', -1);
    }

    const { count: activeEmployees } = await activeEmployeesQuery;

    // Ausencias hoy (leave_requests activas para hoy)
    const { count: absencesToday } = await supabase
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today);

    // Turnos hoy
    const { count: shiftsToday } = await supabase
      .from('shift_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .eq('work_date', today);

    // Timesheets pendientes de aprobación
    const { count: pendingTimesheets } = await supabase
      .from('timesheets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .eq('status', 'pending');

    // Períodos de nómina en proceso
    const { count: payrollInProcess } = await supabase
      .from('payroll_periods')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .in('status', ['draft', 'processing', 'pending_approval']);

    // Préstamos activos
    const { count: activeLoans } = await supabase
      .from('employee_loans')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .eq('status', 'active');

    return {
      activeEmployees: activeEmployees || 0,
      absencesToday: absencesToday || 0,
      shiftsToday: shiftsToday || 0,
      pendingTimesheets: pendingTimesheets || 0,
      payrollInProcess: payrollInProcess || 0,
      activeLoans: activeLoans || 0,
    };
  }

  async getAlerts(): Promise<HRMAlert[]> {
    const alerts: HRMAlert[] = [];
    const today = new Date().toISOString().split('T')[0];
    const memberIds = await this.getMemberIds();

    // Timesheets por aprobar
    const { count: pendingTimesheets } = await supabase
      .from('timesheets')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .eq('status', 'pending');

    if (pendingTimesheets && pendingTimesheets > 0) {
      alerts.push({
        id: 'pending-timesheets',
        type: 'warning',
        title: 'Timesheets por aprobar',
        description: `Hay ${pendingTimesheets} timesheets pendientes de revisión`,
        count: pendingTimesheets,
        link: '/app/hrm/timesheets',
      });
    }

    // Solicitudes de ausencia pendientes
    const { count: pendingLeaves } = await supabase
      .from('leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .eq('status', 'pending');

    if (pendingLeaves && pendingLeaves > 0) {
      alerts.push({
        id: 'pending-leaves',
        type: 'warning',
        title: 'Solicitudes de ausencia pendientes',
        description: `Hay ${pendingLeaves} solicitudes de ausencia por revisar`,
        count: pendingLeaves,
        link: '/app/hrm/ausencias',
      });
    }

    // Turnos sin asignar (para hoy o mañana)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { count: unassignedShifts } = await supabase
      .from('shift_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId)
      .gte('work_date', today)
      .lte('work_date', tomorrowStr)
      .eq('status', 'unassigned');

    if (unassignedShifts && unassignedShifts > 0) {
      alerts.push({
        id: 'unassigned-shifts',
        type: 'danger',
        title: 'Turnos sin asignar',
        description: `Hay ${unassignedShifts} turnos sin asignar para hoy o mañana`,
        count: unassignedShifts,
        link: '/app/hrm/turnos',
      });
    }

    // Préstamos vencidos (cuotas vencidas) — filtrar por loans de esta org
    const loanIds = await this.getLoanIds();
    let overdueLoansQuery = supabase
      .from('loan_installments')
      .select('id', { count: 'exact', head: true })
      .lt('due_date', today)
      .eq('status', 'pending');

    if (loanIds.length > 0) {
      overdueLoansQuery = overdueLoansQuery.in('loan_id', loanIds);
    } else {
      overdueLoansQuery = overdueLoansQuery.eq('loan_id', '00000000-0000-0000-0000-000000000000');
    }

    const { count: overdueLoans } = await overdueLoansQuery;

    if (overdueLoans && overdueLoans > 0) {
      alerts.push({
        id: 'overdue-loans',
        type: 'danger',
        title: 'Préstamos con cuotas vencidas',
        description: `Hay ${overdueLoans} cuotas de préstamos vencidas`,
        count: overdueLoans,
        link: '/app/hrm/prestamos',
      });
    }

    // Contratos por vencer (próximos 30 días) — filtrar por members de esta org
    const thirtyDaysLater = new Date();
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
    const thirtyDaysStr = thirtyDaysLater.toISOString().split('T')[0];

    let expiringContractsQuery = supabase
      .from('employments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .not('contract_end_date', 'is', null)
      .lte('contract_end_date', thirtyDaysStr)
      .gte('contract_end_date', today);

    if (memberIds.length > 0) {
      expiringContractsQuery = expiringContractsQuery.in('organization_member_id', memberIds);
    } else {
      expiringContractsQuery = expiringContractsQuery.eq('organization_member_id', -1);
    }

    const { count: expiringContracts } = await expiringContractsQuery;

    if (expiringContracts && expiringContracts > 0) {
      alerts.push({
        id: 'expiring-contracts',
        type: 'info',
        title: 'Contratos por vencer',
        description: `${expiringContracts} contratos vencen en los próximos 30 días`,
        count: expiringContracts,
        link: '/app/hrm/empleados',
      });
    }

    return alerts;
  }

  async getCurrentPayrollPeriod(): Promise<PayrollPeriodInfo | null> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .select('id, name, period_start, period_end, payment_date, status, total_employees, total_net')
      .eq('organization_id', this.organizationId)
      .order('period_end', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      name: data.name,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      paymentDate: data.payment_date,
      status: data.status,
      totalEmployees: data.total_employees,
      totalNet: data.total_net,
    };
  }

  async getRecentPayrollRuns(periodId?: string): Promise<PayrollRunInfo[]> {
    let query = supabase
      .from('payroll_runs')
      .select('id, run_number, executed_at, status, is_final')
      .order('executed_at', { ascending: false })
      .limit(5);

    if (periodId) {
      query = query.eq('payroll_period_id', periodId);
    }

    const { data, error } = await query;

    if (error || !data) return [];

    return data.map((run) => ({
      id: run.id,
      runNumber: run.run_number,
      executedAt: run.executed_at,
      status: run.status,
      isFinal: run.is_final || false,
    }));
  }

  async getDepartmentsSummary(): Promise<DepartmentSummary[]> {
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);

    if (deptError || !departments) return [];

    const summaries: DepartmentSummary[] = [];

    for (const dept of departments) {
      const { count } = await supabase
        .from('employments')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', dept.id)
        .eq('status', 'active');

      summaries.push({
        id: dept.id,
        name: dept.name,
        employeeCount: count || 0,
      });
    }

    return summaries.sort((a, b) => b.employeeCount - a.employeeCount);
  }
}

export default HRMDashboardService;
