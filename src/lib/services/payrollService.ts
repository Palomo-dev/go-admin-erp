'use client';

import { supabase } from '@/lib/supabase/config';

// Interfaces
export interface PayrollPeriod {
  id: string;
  organization_id: number;
  name: string | null;
  period_start: string;
  period_end: string;
  payment_date: string | null;
  frequency: string;
  status: string | null;
  total_employees: number | null;
  total_gross: number | null;
  total_deductions: number | null;
  total_net: number | null;
  total_employer_cost: number | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  runs_count?: number;
}

export interface PayrollRun {
  id: string;
  payroll_period_id: string;
  run_number: number;
  executed_by: string;
  executed_at: string | null;
  status: string | null;
  summary: Record<string, any> | null;
  error_log: string | null;
  superseded_by: string | null;
  is_final: boolean;
  created_at: string;
  updated_at: string;
  slips_count?: number;
  period_name?: string;
}

export interface PayrollSlip {
  id: string;
  payroll_run_id: string;
  employment_id: string;
  currency_code: string;
  base_salary: number;
  salary_period: string;
  basic_salary: number | null;
  transport_allowance: number | null;
  overtime_pay: number | null;
  night_premium: number | null;
  holiday_premium: number | null;
  commissions: number | null;
  bonuses: number | null;
  other_earnings: number | null;
  gross_pay: number;
  health_deduction: number | null;
  pension_deduction: number | null;
  solidarity_fund: number | null;
  tax_withholding: number | null;
  loan_deductions: number | null;
  advance_deductions: number | null;
  other_deductions: number | null;
  total_deductions: number;
  net_pay: number;
  employer_health: number | null;
  employer_pension: number | null;
  employer_arl: number | null;
  employer_parafiscales: number | null;
  employer_severance: number | null;
  employer_severance_interest: number | null;
  employer_vacation_provision: number | null;
  employer_bonus_provision: number | null;
  total_employer_cost: number | null;
  regular_hours: number | null;
  overtime_day_hours: number | null;
  overtime_night_hours: number | null;
  holiday_hours: number | null;
  status: string | null;
  payment_id: string | null;
  paid_at: string | null;
  notes: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee_name?: string;
  employee_code?: string;
  run_number?: number;
  period_name?: string;
}

export interface PayrollItem {
  id: string;
  payroll_slip_id: string;
  item_type: string;
  code: string;
  name: string;
  amount: number;
  quantity: number | null;
  rate: number | null;
  base_amount: number | null;
  percentage: number | null;
  is_taxable: boolean;
  affects_social_security: boolean;
  source_type: string | null;
  source_id: string | null;
  notes: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

export interface CountryPayrollRules {
  id: string;
  country_code: string;
  name: string;
  year: number;
  minimum_wage: number | null;
  minimum_wage_currency: string | null;
  health_employee_pct: number | null;
  pension_employee_pct: number | null;
  health_employer_pct: number | null;
  pension_employer_pct: number | null;
  arl_base_pct: number | null;
  parafiscales_pct: number | null;
  transport_allowance: number | null;
  transport_allowance_threshold: number | null;
  overtime_day_multiplier: number | null;
  overtime_night_multiplier: number | null;
  is_active: boolean;
  valid_from: string;
  valid_to: string | null;
}

// DTOs
export interface CreatePeriodDTO {
  name?: string;
  period_start: string;
  period_end: string;
  payment_date?: string;
  frequency: string;
  notes?: string;
}

export interface UpdatePeriodDTO extends Partial<CreatePeriodDTO> {
  status?: string;
}

export interface CreateItemDTO {
  payroll_slip_id: string;
  item_type: string;
  code: string;
  name: string;
  amount: number;
  quantity?: number;
  rate?: number;
  base_amount?: number;
  percentage?: number;
  is_taxable?: boolean;
  affects_social_security?: boolean;
  notes?: string;
}

export interface PeriodFilters {
  status?: string;
  frequency?: string;
  year?: number;
}

export interface SlipFilters {
  status?: string;
  run_id?: string;
  employment_id?: string;
}

class PayrollService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  // Periods
  async getPeriods(filters?: PeriodFilters): Promise<PayrollPeriod[]> {
    let query = supabase
      .from('payroll_periods')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('period_start', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.frequency) {
      query = query.eq('frequency', filters.frequency);
    }
    if (filters?.year) {
      const yearStart = `${filters.year}-01-01`;
      const yearEnd = `${filters.year}-12-31`;
      query = query.gte('period_start', yearStart).lte('period_start', yearEnd);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getPeriodById(id: string): Promise<PayrollPeriod | null> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) throw error;
    return data;
  }

  async createPeriod(dto: CreatePeriodDTO): Promise<PayrollPeriod> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .insert({
        organization_id: this.organizationId,
        name: dto.name || this.generatePeriodName(dto.period_start, dto.period_end, dto.frequency),
        period_start: dto.period_start,
        period_end: dto.period_end,
        payment_date: dto.payment_date,
        frequency: dto.frequency,
        status: 'draft',
        notes: dto.notes,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updatePeriod(id: string, dto: UpdatePeriodDTO): Promise<PayrollPeriod> {
    const { data, error } = await supabase
      .from('payroll_periods')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deletePeriod(id: string): Promise<void> {
    const { error } = await supabase
      .from('payroll_periods')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .eq('status', 'draft');

    if (error) throw error;
  }

  async changePeriodStatus(id: string, status: string): Promise<PayrollPeriod> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'approved') {
      updateData.approved_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('payroll_periods')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  // Runs
  async getRuns(periodId: string): Promise<PayrollRun[]> {
    const { data, error } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('payroll_period_id', periodId)
      .order('run_number', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getRunById(id: string): Promise<PayrollRun | null> {
    const { data, error } = await supabase
      .from('payroll_runs')
      .select(`
        *,
        payroll_periods!payroll_runs_payroll_period_id_fkey(name)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? {
      ...data,
      period_name: data.payroll_periods?.name,
    } : null;
  }

  async createRun(periodId: string, executedBy: string): Promise<PayrollRun> {
    // Get next run number
    const runs = await this.getRuns(periodId);
    const nextRunNumber = (runs.length > 0 ? Math.max(...runs.map(r => r.run_number)) : 0) + 1;

    const { data, error } = await supabase
      .from('payroll_runs')
      .insert({
        payroll_period_id: periodId,
        run_number: nextRunNumber,
        executed_by: executedBy,
        executed_at: new Date().toISOString(),
        status: 'calculating',
        is_final: false,
      })
      .select()
      .single();

    if (error) throw error;

    // Update period status
    await this.updatePeriod(periodId, { status: 'calculating' });

    return data;
  }

  async updateRunStatus(id: string, status: string): Promise<PayrollRun> {
    const { data, error } = await supabase
      .from('payroll_runs')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async markRunAsFinal(id: string): Promise<PayrollRun> {
    const { data, error } = await supabase
      .from('payroll_runs')
      .update({
        is_final: true,
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Update period status
    if (data) {
      await this.changePeriodStatus(data.payroll_period_id, 'reviewing');
    }

    return data;
  }

  // Slips
  async getSlips(filters?: SlipFilters): Promise<PayrollSlip[]> {
    let query = supabase
      .from('payroll_slips')
      .select(`
        *,
        payroll_runs!payroll_slips_payroll_run_id_fkey(
          run_number,
          payroll_periods!payroll_runs_payroll_period_id_fkey(name, organization_id)
        ),
        employments!payroll_slips_employment_id_fkey(
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          )
        )
      `)
      .order('created_at', { ascending: false });

    if (filters?.run_id) {
      query = query.eq('payroll_run_id', filters.run_id);
    }
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.employment_id) {
      query = query.eq('employment_id', filters.employment_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Filter by organization
    const filtered = (data || []).filter((slip: any) => 
      slip.payroll_runs?.payroll_periods?.organization_id === this.organizationId
    );

    return filtered.map((slip: any) => this.mapSlip(slip));
  }

  async getSlipById(id: string): Promise<PayrollSlip | null> {
    const { data, error } = await supabase
      .from('payroll_slips')
      .select(`
        *,
        payroll_runs!payroll_slips_payroll_run_id_fkey(
          run_number,
          payroll_periods!payroll_runs_payroll_period_id_fkey(name)
        ),
        employments!payroll_slips_employment_id_fkey(
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          )
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? this.mapSlip(data) : null;
  }

  async updateSlipStatus(id: string, status: string): Promise<PayrollSlip> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'paid') {
      updateData.paid_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('payroll_slips')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.getSlipById(data.id) as Promise<PayrollSlip>;
  }

  async approveSlips(slipIds: string[]): Promise<void> {
    const { error } = await supabase
      .from('payroll_slips')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .in('id', slipIds);

    if (error) throw error;
  }

  // Items
  async getItems(slipId: string): Promise<PayrollItem[]> {
    const { data, error } = await supabase
      .from('payroll_items')
      .select('*')
      .eq('payroll_slip_id', slipId)
      .order('item_type')
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async createItem(dto: CreateItemDTO): Promise<PayrollItem> {
    const { data, error } = await supabase
      .from('payroll_items')
      .insert({
        ...dto,
        is_taxable: dto.is_taxable ?? true,
        affects_social_security: dto.affects_social_security ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteItem(id: string): Promise<void> {
    const { error } = await supabase
      .from('payroll_items')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // Stats
  async getStats(): Promise<{
    totalPeriods: number;
    pendingPeriods: number;
    totalGross: number;
    totalNet: number;
    totalEmployerCost: number;
    totalEmployees: number;
  }> {
    const periods = await this.getPeriods();
    
    const pending = periods.filter(p => 
      p.status === 'draft' || p.status === 'calculating' || p.status === 'reviewing'
    ).length;

    const approved = periods.filter(p => p.status === 'approved' || p.status === 'paid');

    return {
      totalPeriods: periods.length,
      pendingPeriods: pending,
      totalGross: approved.reduce((sum, p) => sum + (p.total_gross || 0), 0),
      totalNet: approved.reduce((sum, p) => sum + (p.total_net || 0), 0),
      totalEmployerCost: approved.reduce((sum, p) => sum + (p.total_employer_cost || 0), 0),
      totalEmployees: Math.max(...periods.map(p => p.total_employees || 0), 0),
    };
  }

  // Country Rules
  async getCountryRules(countryCode: string = 'CO'): Promise<CountryPayrollRules | null> {
    const currentYear = new Date().getFullYear();
    const { data, error } = await supabase
      .from('country_payroll_rules')
      .select('*')
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .lte('valid_from', new Date().toISOString().split('T')[0])
      .order('year', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Employees
  async getEmployees(): Promise<{ id: string; name: string; code: string | null }[]> {
    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        organization_members!employments_organization_member_id_fkey(
          organization_id,
          profiles(first_name, last_name)
        )
      `)
      .eq('status', 'active');

    if (error) throw error;

    const filtered = (data || []).filter((emp: any) => 
      emp.organization_members?.organization_id === this.organizationId
    );

    return filtered.map((emp: any) => {
      const profile = emp.organization_members?.profiles;
      return {
        id: emp.id,
        name: profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : 'Sin nombre',
        code: emp.employee_code,
      };
    });
  }

  // Helper methods
  private generatePeriodName(start: string, end: string, frequency: string): string {
    const startDate = new Date(start);
    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    
    if (frequency === 'monthly') {
      return `${months[startDate.getMonth()]} ${startDate.getFullYear()}`;
    } else if (frequency === 'biweekly') {
      const half = startDate.getDate() <= 15 ? '1ra' : '2da';
      return `${half} Quincena ${months[startDate.getMonth()]} ${startDate.getFullYear()}`;
    } else if (frequency === 'weekly') {
      const weekNum = Math.ceil(startDate.getDate() / 7);
      return `Semana ${weekNum} ${months[startDate.getMonth()]} ${startDate.getFullYear()}`;
    } else if (frequency === 'daily') {
      return `${startDate.getDate()} ${months[startDate.getMonth()]} ${startDate.getFullYear()}`;
    }
    return `Periodo ${start} - ${end}`;
  }

  private mapSlip(slip: any): PayrollSlip {
    const profile = slip.employments?.organization_members?.profiles;
    return {
      ...slip,
      employee_name: profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Sin asignar',
      employee_code: slip.employments?.employee_code || null,
      run_number: slip.payroll_runs?.run_number,
      period_name: slip.payroll_runs?.payroll_periods?.name,
    };
  }

  getFrequencies(): { value: string; label: string }[] {
    return [
      { value: 'daily', label: 'Diario' },
      { value: 'weekly', label: 'Semanal' },
      { value: 'biweekly', label: 'Quincenal' },
      { value: 'monthly', label: 'Mensual' },
    ];
  }

  getPeriodStatuses(): { value: string; label: string; color: string }[] {
    return [
      { value: 'draft', label: 'Borrador', color: 'gray' },
      { value: 'calculating', label: 'Calculando', color: 'amber' },
      { value: 'reviewing', label: 'En Revisión', color: 'blue' },
      { value: 'approved', label: 'Aprobado', color: 'green' },
      { value: 'paid', label: 'Pagado', color: 'purple' },
      { value: 'cancelled', label: 'Cancelado', color: 'red' },
    ];
  }

  getRunStatuses(): { value: string; label: string; color: string }[] {
    return [
      { value: 'calculating', label: 'Calculando', color: 'amber' },
      { value: 'completed', label: 'Completado', color: 'green' },
      { value: 'error', label: 'Error', color: 'red' },
      { value: 'superseded', label: 'Reemplazado', color: 'gray' },
    ];
  }

  getSlipStatuses(): { value: string; label: string; color: string }[] {
    return [
      { value: 'draft', label: 'Borrador', color: 'gray' },
      { value: 'approved', label: 'Aprobado', color: 'green' },
      { value: 'paid', label: 'Pagado', color: 'purple' },
    ];
  }

  getItemTypes(): { value: string; label: string; isEarning: boolean }[] {
    return [
      { value: 'earning', label: 'Devengado', isEarning: true },
      { value: 'deduction', label: 'Deducción', isEarning: false },
      { value: 'employer_contribution', label: 'Aporte Empleador', isEarning: false },
    ];
  }
}

export default PayrollService;
