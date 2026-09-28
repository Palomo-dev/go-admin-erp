'use client';

import { supabase } from '@/lib/supabase/config';
import { resolveOrgCurrency } from '@/lib/services/monedaOrganizacion';

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  branchId?: number;
  departmentId?: string;
  positionId?: string;
  employmentId?: string;
}

export interface AttendanceReportRow {
  employee_name: string;
  employee_code: string | null;
  department: string | null;
  position: string | null;
  branch: string | null;
  work_date: string;
  scheduled_minutes: number;
  worked_minutes: number;
  net_worked_minutes: number;
  overtime_minutes: number;
  late_minutes: number;
  first_check_in: string | null;
  last_check_out: string | null;
}

export interface AbsenceReportRow {
  employee_name: string;
  employee_code: string | null;
  department: string | null;
  leave_type: string;
  start_date: string;
  end_date: string;
  days: number;
  status: string;
  reason: string | null;
}

export interface PayrollReportRow {
  employee_name: string;
  employee_code: string | null;
  department: string | null;
  period_name: string;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: string;
  currency_code: string;
}

export interface LoanReportRow {
  employee_name: string;
  employee_code: string | null;
  loan_number: string | null;
  loan_type: string | null;
  principal: number;
  total_amount: number;
  balance: number;
  installments_paid: number;
  installments_total: number;
  status: string | null;
  currency_code: string;
}

export interface ReportSummary {
  totalRecords: number;
  // Attendance
  totalWorkedHours?: number;
  totalOvertimeHours?: number;
  avgAttendanceRate?: number;
  // Absences
  totalAbsenceDays?: number;
  pendingRequests?: number;
  // Payroll
  totalGross?: number;
  totalNet?: number;
  totalDeductions?: number;
  // Loans
  totalDisbursed?: number;
  totalBalance?: number;
  activeLoans?: number;
}

/** Empleo embebido en las filas de los reportes (nombre, código, área, cargo). */
interface EmpleoEmbebido {
  employee_code?: string | null;
  organization_members?: { profiles?: { first_name?: string | null; last_name?: string | null } | null } | null;
  departments?: { name?: string | null } | null;
  job_positions?: { name?: string | null } | null;
}

function nombreEmpleado(empleo?: EmpleoEmbebido | null): string {
  const profile = empleo?.organization_members?.profiles;
  return profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : '-';
}

interface FilaTimesheet {
  employments?: EmpleoEmbebido | null;
  branches?: { name?: string | null } | null;
  work_date: string;
  scheduled_minutes?: number | null;
  worked_minutes?: number | null;
  net_worked_minutes?: number | null;
  overtime_minutes?: number | null;
  late_minutes?: number | null;
  first_check_in: string | null;
  last_check_out: string | null;
}

interface FilaAusencia {
  employments?: EmpleoEmbebido | null;
  leave_types?: { name?: string | null } | null;
  leave_type?: string | null;
  start_date: string;
  end_date: string;
  status?: string | null;
  reason: string | null;
}

interface FilaColilla {
  employments?: EmpleoEmbebido | null;
  payroll_runs?: {
    payroll_periods?: { name?: string | null; period_start?: string | null; organization_id?: number | null } | null;
  } | null;
  gross_pay?: number | null;
  total_deductions?: number | null;
  net_pay?: number | null;
  status?: string | null;
  currency_code?: string | null;
}

interface FilaPrestamo {
  employments?: EmpleoEmbebido | null;
  loan_number: string | null;
  loan_type: string | null;
  principal?: number | null;
  total_amount?: number | null;
  balance?: number | null;
  installments_paid?: number | null;
  installments_total?: number | null;
  status: string | null;
  currency_code?: string | null;
}

class HRMReportsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  // Attendance Report
  async getAttendanceReport(filters: ReportFilters): Promise<{
    data: AttendanceReportRow[];
    summary: ReportSummary;
  }> {
    let query = supabase
      .from('timesheets')
      .select(`
        *,
        employments!timesheets_employment_id_fkey(
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          ),
          departments!employments_department_id_fkey(name),
          job_positions(name)
        ),
        branches!timesheets_branch_id_fkey(name)
      `)
      .eq('organization_id', this.organizationId)
      .gte('work_date', filters.dateFrom)
      .lte('work_date', filters.dateTo)
      .order('work_date', { ascending: false });

    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }
    if (filters.employmentId) {
      query = query.eq('employment_id', filters.employmentId);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows: AttendanceReportRow[] = ((data || []) as FilaTimesheet[]).map((row) => {
      return {
        employee_name: nombreEmpleado(row.employments),
        employee_code: row.employments?.employee_code ?? null,
        department: row.employments?.departments?.name || null,
        position: row.employments?.job_positions?.name || null,
        branch: row.branches?.name || null,
        work_date: row.work_date,
        scheduled_minutes: row.scheduled_minutes || 0,
        worked_minutes: row.worked_minutes || 0,
        net_worked_minutes: row.net_worked_minutes || 0,
        overtime_minutes: row.overtime_minutes || 0,
        late_minutes: row.late_minutes || 0,
        first_check_in: row.first_check_in,
        last_check_out: row.last_check_out,
      };
    });

    const totalWorkedMinutes = rows.reduce((sum, r) => sum + r.worked_minutes, 0);
    const totalOvertimeMinutes = rows.reduce((sum, r) => sum + r.overtime_minutes, 0);
    const totalScheduledMinutes = rows.reduce((sum, r) => sum + r.scheduled_minutes, 0);

    return {
      data: rows,
      summary: {
        totalRecords: rows.length,
        totalWorkedHours: Math.round(totalWorkedMinutes / 60 * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeMinutes / 60 * 100) / 100,
        avgAttendanceRate: totalScheduledMinutes > 0 
          ? Math.round((totalWorkedMinutes / totalScheduledMinutes) * 100) 
          : 0,
      },
    };
  }

  // Absence Report
  async getAbsenceReport(filters: ReportFilters): Promise<{
    data: AbsenceReportRow[];
    summary: ReportSummary;
  }> {
    const query = supabase
      .from('leave_requests')
      .select(`
        *,
        employments!leave_requests_employment_id_fkey(
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          ),
          departments!employments_department_id_fkey(name)
        ),
        leave_types(name)
      `)
      .eq('organization_id', this.organizationId)
      .or(`start_date.gte.${filters.dateFrom},end_date.lte.${filters.dateTo}`)
      .order('start_date', { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const rows: AbsenceReportRow[] = ((data || []) as FilaAusencia[]).map((row) => {
      const startDate = new Date(row.start_date);
      const endDate = new Date(row.end_date);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      return {
        employee_name: nombreEmpleado(row.employments),
        employee_code: row.employments?.employee_code ?? null,
        department: row.employments?.departments?.name || null,
        leave_type: row.leave_types?.name || row.leave_type || '-',
        start_date: row.start_date,
        end_date: row.end_date,
        days,
        status: row.status || 'pending',
        reason: row.reason,
      };
    });

    const totalDays = rows.reduce((sum, r) => sum + r.days, 0);
    const pending = rows.filter(r => r.status === 'pending').length;

    return {
      data: rows,
      summary: {
        totalRecords: rows.length,
        totalAbsenceDays: totalDays,
        pendingRequests: pending,
      },
    };
  }

  // Payroll Report
  async getPayrollReport(filters: ReportFilters): Promise<{
    data: PayrollReportRow[];
    summary: ReportSummary;
  }> {
    const { data, error } = await supabase
      .from('payroll_slips')
      .select(`
        *,
        payroll_runs!payroll_slips_payroll_run_id_fkey(
          payroll_periods!payroll_runs_payroll_period_id_fkey(
            name,
            period_start,
            period_end,
            organization_id
          )
        ),
        employments!payroll_slips_employment_id_fkey(
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          ),
          departments!employments_department_id_fkey(name)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Filter by organization and date range
    // Una colilla sin moneda (no debería haberla: la columna es NOT NULL) se
    // muestra en la moneda base de la organización, no en pesos supuestos.
    const monedaBase = (await resolveOrgCurrency(supabase, this.organizationId)).code;
    const filtered = ((data || []) as FilaColilla[]).filter((row) => {
      const orgId = row.payroll_runs?.payroll_periods?.organization_id;
      if (orgId !== this.organizationId) return false;
      
      const periodStart = row.payroll_runs?.payroll_periods?.period_start;
      if (!periodStart) return false;
      
      return periodStart >= filters.dateFrom && periodStart <= filters.dateTo;
    });

    const rows: PayrollReportRow[] = filtered.map((row) => {
      return {
        employee_name: nombreEmpleado(row.employments),
        employee_code: row.employments?.employee_code ?? null,
        department: row.employments?.departments?.name || null,
        period_name: row.payroll_runs?.payroll_periods?.name || '-',
        gross_pay: row.gross_pay || 0,
        total_deductions: row.total_deductions || 0,
        net_pay: row.net_pay || 0,
        status: row.status || 'draft',
        currency_code: row.currency_code || monedaBase,
      };
    });

    return {
      data: rows,
      summary: {
        totalRecords: rows.length,
        totalGross: rows.reduce((sum, r) => sum + r.gross_pay, 0),
        totalNet: rows.reduce((sum, r) => sum + r.net_pay, 0),
        totalDeductions: rows.reduce((sum, r) => sum + r.total_deductions, 0),
      },
    };
  }

  // Loans Report
  async getLoansReport(filters: ReportFilters): Promise<{
    data: LoanReportRow[];
    summary: ReportSummary;
  }> {
    // El reporte de préstamos lista la cartera completa: el rango de fechas
    // no aplica. Se conserva el parámetro por la firma común de los reportes.
    void filters;
    const { data, error } = await supabase
      .from('employee_loans')
      .select(`
        *,
        employments!employee_loans_employment_id_fkey(
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          )
        )
      `)
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const monedaBase = (await resolveOrgCurrency(supabase, this.organizationId)).code;
    const rows: LoanReportRow[] = ((data || []) as FilaPrestamo[]).map((row) => {
      return {
        employee_name: nombreEmpleado(row.employments),
        employee_code: row.employments?.employee_code ?? null,
        loan_number: row.loan_number,
        loan_type: row.loan_type,
        principal: row.principal || 0,
        total_amount: row.total_amount || 0,
        balance: row.balance || 0,
        installments_paid: row.installments_paid || 0,
        installments_total: row.installments_total || 0,
        status: row.status,
        currency_code: row.currency_code || monedaBase,
      };
    });

    const activeLoans = rows.filter(r => r.status === 'active');

    return {
      data: rows,
      summary: {
        totalRecords: rows.length,
        totalDisbursed: rows.reduce((sum, r) => sum + r.principal, 0),
        totalBalance: activeLoans.reduce((sum, r) => sum + r.balance, 0),
        activeLoans: activeLoans.length,
      },
    };
  }

  // Helpers
  async getBranches(): Promise<{ id: number; name: string }[]> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getDepartments(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getPositions(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabase
      .from('job_positions')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  getReportTypes(): { value: string; label: string; icon: string }[] {
    return [
      { value: 'attendance', label: 'Asistencia', icon: 'Clock' },
      { value: 'absences', label: 'Ausencias', icon: 'Calendar' },
      { value: 'payroll', label: 'Nómina', icon: 'DollarSign' },
      { value: 'loans', label: 'Préstamos', icon: 'Banknote' },
    ];
  }

  // Export helpers
  exportToCSV(data: ReadonlyArray<object>, filename: string): void {
    if (data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(h => {
          const val = (row as Record<string, unknown>)[h];
          if (val === null || val === undefined) return '';
          if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
          return val;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  }
}

export default HRMReportsService;
