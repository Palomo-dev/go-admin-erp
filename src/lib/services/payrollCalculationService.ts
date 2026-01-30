'use client';

import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

/**
 * Servicio para calcular nómina desde timesheets aprobados
 * Flujo: timesheets (approved) → payroll_slips
 */

export interface PayrollCalculationResult {
  employment_id: string;
  employee_name: string;
  status: 'created' | 'updated' | 'skipped' | 'error';
  message?: string;
  slip_id?: string;
  summary?: {
    regular_hours: number;
    overtime_day_hours: number;
    overtime_night_hours: number;
    holiday_hours: number;
    gross_pay: number;
    total_deductions: number;
    net_pay: number;
  };
}

export interface PayrollCalculationSummary {
  period_id: string;
  run_id: string;
  total_employees: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  totals: {
    gross_pay: number;
    total_deductions: number;
    net_pay: number;
    employer_cost: number;
  };
  results: PayrollCalculationResult[];
}

interface CountryRules {
  minimum_wage: number;
  health_employee_pct: number;
  pension_employee_pct: number;
  health_employer_pct: number;
  pension_employer_pct: number;
  arl_base_pct: number;
  parafiscales_pct: number;
  transport_allowance: number;
  transport_allowance_threshold: number;
  overtime_day_multiplier: number;
  overtime_night_multiplier: number;
  overtime_holiday_day_multiplier: number;
  overtime_holiday_night_multiplier: number;
  night_surcharge_multiplier: number;
  sunday_holiday_multiplier: number;
  severance_rate: number;
  severance_interest_rate: number;
  vacation_rate: number;
  bonus_rate: number;
}

interface EmploymentData {
  id: string;
  employee_code: string | null;
  base_salary: number;
  salary_period: string;
  currency_code: string;
  branch_id: number | null;
  arl_risk_level: number | null;
  employee_name: string;
}

interface TimesheetSummary {
  total_worked_minutes: number;
  total_overtime_minutes: number;
  total_night_minutes: number;
  total_holiday_minutes: number;
  total_late_minutes: number;
  days_worked: number;
}

export class PayrollCalculationService {
  private organizationId: number;
  private countryRules: CountryRules | null = null;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  /**
   * Calcula nómina para un período usando timesheets aprobados
   */
  async calculatePeriod(
    periodId: string,
    executedBy: string
  ): Promise<PayrollCalculationSummary> {
    const supabase = createClient();
    const results: PayrollCalculationResult[] = [];

    // 1. Obtener el período
    const { data: period, error: periodError } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('id', periodId)
      .eq('organization_id', this.organizationId)
      .single();

    if (periodError || !period) {
      throw new Error('Período no encontrado');
    }

    // 2. Crear un nuevo run
    const { data: existingRuns } = await supabase
      .from('payroll_runs')
      .select('run_number')
      .eq('payroll_period_id', periodId)
      .order('run_number', { ascending: false })
      .limit(1);

    const nextRunNumber = (existingRuns?.[0]?.run_number || 0) + 1;

    const { data: run, error: runError } = await supabase
      .from('payroll_runs')
      .insert({
        payroll_period_id: periodId,
        run_number: nextRunNumber,
        executed_by: executedBy,
        executed_at: new Date().toISOString(),
        status: 'running',
        is_final: false,
      })
      .select()
      .single();

    if (runError) throw runError;

    // 3. Obtener reglas del país
    await this.loadCountryRules();

    // 4. Obtener empleados activos con sus datos de empleo
    const employees = await this.getActiveEmployees();

    // 5. Procesar cada empleado
    for (const employee of employees) {
      try {
        const result = await this.calculateEmployeePayroll(
          run.id,
          employee,
          period.period_start,
          period.period_end
        );
        results.push(result);
      } catch (err: any) {
        results.push({
          employment_id: employee.id,
          employee_name: employee.employee_name,
          status: 'error',
          message: err.message,
        });
      }
    }

    // 6. Actualizar totales del período
    const totals = this.calculateTotals(results);

    await supabase
      .from('payroll_periods')
      .update({
        total_employees: results.filter(r => r.status === 'created').length,
        total_gross: totals.gross_pay,
        total_deductions: totals.total_deductions,
        total_net: totals.net_pay,
        total_employer_cost: totals.employer_cost,
        status: 'reviewing',
        updated_at: new Date().toISOString(),
      })
      .eq('id', periodId);

    // 7. Actualizar estado del run
    await supabase
      .from('payroll_runs')
      .update({
        status: 'completed',
        summary: {
          employees: results.filter(r => r.status === 'created').length,
          errors: results.filter(r => r.status === 'error').length,
          totals,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return {
      period_id: periodId,
      run_id: run.id,
      total_employees: employees.length,
      created: results.filter(r => r.status === 'created').length,
      updated: results.filter(r => r.status === 'updated').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      totals,
      results,
    };
  }

  /**
   * Calcula la nómina de un empleado específico
   */
  private async calculateEmployeePayroll(
    runId: string,
    employee: EmploymentData,
    periodStart: string,
    periodEnd: string
  ): Promise<PayrollCalculationResult> {
    const supabase = createClient();

    // Obtener timesheets aprobados del período
    const { data: timesheets, error: tsError } = await supabase
      .from('timesheets')
      .select('*')
      .eq('employment_id', employee.id)
      .gte('work_date', periodStart)
      .lte('work_date', periodEnd)
      .in('status', ['approved', 'submitted', 'open']); // Incluir todos los estados válidos

    if (tsError) throw tsError;

    // Si no hay timesheets, saltar
    if (!timesheets || timesheets.length === 0) {
      return {
        employment_id: employee.id,
        employee_name: employee.employee_name,
        status: 'skipped',
        message: 'Sin timesheets en el período',
      };
    }

    // Sumar datos de timesheets
    const summary = this.summarizeTimesheets(timesheets);

    // Calcular pagos
    const hourlyRate = this.calculateHourlyRate(employee.base_salary, employee.salary_period);
    const rules = this.countryRules!;

    // Horas
    const regularHours = summary.total_worked_minutes / 60;
    const overtimeDayHours = Math.max(0, (summary.total_overtime_minutes - summary.total_night_minutes) / 60);
    const overtimeNightHours = summary.total_night_minutes / 60;
    const holidayHours = summary.total_holiday_minutes / 60;

    // Pagos
    const basicSalary = this.calculateProportionalSalary(
      employee.base_salary,
      employee.salary_period,
      summary.days_worked
    );

    const overtimePay = 
      (overtimeDayHours * hourlyRate * rules.overtime_day_multiplier) +
      (overtimeNightHours * hourlyRate * rules.overtime_night_multiplier);

    const nightPremium = (overtimeNightHours * hourlyRate * (rules.night_surcharge_multiplier - 1));
    const holidayPremium = (holidayHours * hourlyRate * (rules.sunday_holiday_multiplier - 1));

    // Auxilio de transporte (solo si gana menos de 2 SMMLV)
    const transportAllowance = employee.base_salary <= (rules.transport_allowance_threshold || rules.minimum_wage * 2)
      ? this.calculateProportionalTransport(rules.transport_allowance, summary.days_worked)
      : 0;

    const grossPay = basicSalary + overtimePay + nightPremium + holidayPremium + transportAllowance;

    // Deducciones empleado
    const healthDeduction = basicSalary * (rules.health_employee_pct / 100);
    const pensionDeduction = basicSalary * (rules.pension_employee_pct / 100);
    
    // Fondo de solidaridad (solo si gana más de 4 SMMLV)
    let solidarityFund = 0;
    if (employee.base_salary > rules.minimum_wage * 4) {
      solidarityFund = basicSalary * 0.01; // 1%
    }

    const totalDeductions = healthDeduction + pensionDeduction + solidarityFund;
    const netPay = grossPay - totalDeductions;

    // Aportes empleador
    const employerHealth = basicSalary * (rules.health_employer_pct / 100);
    const employerPension = basicSalary * (rules.pension_employer_pct / 100);
    const employerArl = basicSalary * (this.getArlRate(employee.arl_risk_level) / 100);
    const employerParafiscales = basicSalary * (rules.parafiscales_pct / 100);
    
    // Provisiones
    const employerSeverance = (basicSalary + transportAllowance) * rules.severance_rate;
    const employerSeveranceInterest = employerSeverance * rules.severance_interest_rate;
    const employerVacation = basicSalary * rules.vacation_rate;
    const employerBonus = basicSalary * rules.bonus_rate;

    const totalEmployerCost = grossPay + employerHealth + employerPension + employerArl +
      employerParafiscales + employerSeverance + employerSeveranceInterest +
      employerVacation + employerBonus;

    // Crear payroll slip
    const { data: slip, error: slipError } = await supabase
      .from('payroll_slips')
      .insert({
        payroll_run_id: runId,
        employment_id: employee.id,
        currency_code: employee.currency_code || 'COP',
        base_salary: employee.base_salary,
        salary_period: employee.salary_period || 'monthly',
        basic_salary: basicSalary,
        transport_allowance: transportAllowance,
        overtime_pay: overtimePay,
        night_premium: nightPremium,
        holiday_premium: holidayPremium,
        commissions: 0,
        bonuses: 0,
        other_earnings: 0,
        gross_pay: grossPay,
        health_deduction: healthDeduction,
        pension_deduction: pensionDeduction,
        solidarity_fund: solidarityFund,
        tax_withholding: 0, // TODO: Calcular retención en la fuente
        loan_deductions: 0, // TODO: Obtener deducciones de préstamos
        advance_deductions: 0,
        other_deductions: 0,
        total_deductions: totalDeductions,
        net_pay: netPay,
        employer_health: employerHealth,
        employer_pension: employerPension,
        employer_arl: employerArl,
        employer_parafiscales: employerParafiscales,
        employer_severance: employerSeverance,
        employer_severance_interest: employerSeveranceInterest,
        employer_vacation_provision: employerVacation,
        employer_bonus_provision: employerBonus,
        total_employer_cost: totalEmployerCost,
        regular_hours: regularHours,
        overtime_day_hours: overtimeDayHours,
        overtime_night_hours: overtimeNightHours,
        holiday_hours: holidayHours,
        status: 'draft',
        metadata: {
          timesheets_count: timesheets.length,
          days_worked: summary.days_worked,
          period_start: periodStart,
          period_end: periodEnd,
        },
      })
      .select('id')
      .single();

    if (slipError) throw slipError;

    return {
      employment_id: employee.id,
      employee_name: employee.employee_name,
      status: 'created',
      slip_id: slip.id,
      summary: {
        regular_hours: regularHours,
        overtime_day_hours: overtimeDayHours,
        overtime_night_hours: overtimeNightHours,
        holiday_hours: holidayHours,
        gross_pay: grossPay,
        total_deductions: totalDeductions,
        net_pay: netPay,
      },
    };
  }

  /**
   * Carga las reglas del país (Colombia por defecto)
   */
  private async loadCountryRules(): Promise<void> {
    if (this.countryRules) return;

    const supabase = createClient();
    const { data, error } = await supabase
      .from('country_payroll_rules')
      .select('*')
      .eq('country_code', 'CO')
      .eq('is_active', true)
      .order('year', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // Usar valores por defecto Colombia 2024
      this.countryRules = {
        minimum_wage: 1300000,
        health_employee_pct: 4,
        pension_employee_pct: 4,
        health_employer_pct: 8.5,
        pension_employer_pct: 12,
        arl_base_pct: 0.522,
        parafiscales_pct: 9,
        transport_allowance: 162000,
        transport_allowance_threshold: 2600000,
        overtime_day_multiplier: 1.25,
        overtime_night_multiplier: 1.75,
        overtime_holiday_day_multiplier: 2.0,
        overtime_holiday_night_multiplier: 2.5,
        night_surcharge_multiplier: 1.35,
        sunday_holiday_multiplier: 1.75,
        severance_rate: 0.0833,
        severance_interest_rate: 0.12,
        vacation_rate: 0.0417,
        bonus_rate: 0.0833,
      };
    } else {
      this.countryRules = data as CountryRules;
    }
  }

  /**
   * Obtiene empleados activos de la organización
   */
  private async getActiveEmployees(): Promise<EmploymentData[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        base_salary,
        salary_period,
        currency_code,
        branch_id,
        arl_risk_level,
        organization_members!inner(
          organization_id,
          profiles!inner(first_name, last_name)
        )
      `)
      .eq('status', 'active')
      .eq('organization_members.organization_id', this.organizationId);

    if (error) throw error;

    return (data || []).map((emp: any) => ({
      id: emp.id,
      employee_code: emp.employee_code,
      base_salary: emp.base_salary || 0,
      salary_period: emp.salary_period || 'monthly',
      currency_code: emp.currency_code || 'COP',
      branch_id: emp.branch_id,
      arl_risk_level: emp.arl_risk_level,
      employee_name: emp.organization_members?.profiles
        ? `${emp.organization_members.profiles.first_name || ''} ${emp.organization_members.profiles.last_name || ''}`.trim()
        : 'Sin nombre',
    }));
  }

  /**
   * Suma datos de múltiples timesheets
   */
  private summarizeTimesheets(timesheets: any[]): TimesheetSummary {
    return {
      total_worked_minutes: timesheets.reduce((sum, t) => sum + (t.net_worked_minutes || 0), 0),
      total_overtime_minutes: timesheets.reduce((sum, t) => sum + (t.overtime_minutes || 0), 0),
      total_night_minutes: timesheets.reduce((sum, t) => sum + (t.night_minutes || 0), 0),
      total_holiday_minutes: timesheets.reduce((sum, t) => sum + (t.holiday_minutes || 0), 0),
      total_late_minutes: timesheets.reduce((sum, t) => sum + (t.late_minutes || 0), 0),
      days_worked: timesheets.length,
    };
  }

  /**
   * Calcula tarifa por hora basada en salario
   */
  private calculateHourlyRate(baseSalary: number, salaryPeriod: string): number {
    const monthlyHours = 240; // 48 horas/semana * 4 semanas + días extras

    switch (salaryPeriod) {
      case 'hourly':
        return baseSalary;
      case 'daily':
        return baseSalary / 8;
      case 'weekly':
        return baseSalary / 48;
      case 'biweekly':
        return (baseSalary * 2) / monthlyHours;
      case 'monthly':
      default:
        return baseSalary / monthlyHours;
    }
  }

  /**
   * Calcula salario proporcional a días trabajados
   */
  private calculateProportionalSalary(
    baseSalary: number,
    salaryPeriod: string,
    daysWorked: number
  ): number {
    const workDaysPerMonth = 30; // Días calendario para cálculo en Colombia

    switch (salaryPeriod) {
      case 'monthly':
        return (baseSalary / workDaysPerMonth) * daysWorked;
      case 'biweekly':
        return (baseSalary / 15) * daysWorked;
      case 'weekly':
        return (baseSalary / 6) * daysWorked;
      case 'daily':
        return baseSalary * daysWorked;
      default:
        return (baseSalary / workDaysPerMonth) * daysWorked;
    }
  }

  /**
   * Calcula auxilio de transporte proporcional
   */
  private calculateProportionalTransport(
    transportAllowance: number,
    daysWorked: number
  ): number {
    return (transportAllowance / 30) * daysWorked;
  }

  /**
   * Obtiene tasa ARL según nivel de riesgo
   */
  private getArlRate(riskLevel: number | null): number {
    const rates: Record<number, number> = {
      1: 0.522,
      2: 1.044,
      3: 2.436,
      4: 4.350,
      5: 6.960,
    };
    return rates[riskLevel || 1] || 0.522;
  }

  /**
   * Calcula totales del período
   */
  private calculateTotals(results: PayrollCalculationResult[]): {
    gross_pay: number;
    total_deductions: number;
    net_pay: number;
    employer_cost: number;
  } {
    const successResults = results.filter(r => r.status === 'created' && r.summary);

    return {
      gross_pay: successResults.reduce((sum, r) => sum + (r.summary?.gross_pay || 0), 0),
      total_deductions: successResults.reduce((sum, r) => sum + (r.summary?.total_deductions || 0), 0),
      net_pay: successResults.reduce((sum, r) => sum + (r.summary?.net_pay || 0), 0),
      employer_cost: 0, // TODO: Sumar costos empleador
    };
  }

  /**
   * Vista previa del cálculo sin guardar
   */
  async previewCalculation(
    periodStart: string,
    periodEnd: string
  ): Promise<{
    employees: number;
    timesheets: number;
    estimated_gross: number;
    estimated_net: number;
  }> {
    const supabase = createClient();

    await this.loadCountryRules();
    const employees = await this.getActiveEmployees();

    let totalTimesheets = 0;
    let estimatedGross = 0;
    let estimatedNet = 0;

    for (const employee of employees) {
      const { data: timesheets } = await supabase
        .from('timesheets')
        .select('net_worked_minutes, overtime_minutes')
        .eq('employment_id', employee.id)
        .gte('work_date', periodStart)
        .lte('work_date', periodEnd);

      if (timesheets && timesheets.length > 0) {
        totalTimesheets += timesheets.length;
        
        const daysWorked = timesheets.length;
        const basicSalary = this.calculateProportionalSalary(
          employee.base_salary,
          employee.salary_period,
          daysWorked
        );

        const deductions = basicSalary * 0.08; // Aproximado 8%
        estimatedGross += basicSalary;
        estimatedNet += basicSalary - deductions;
      }
    }

    return {
      employees: employees.length,
      timesheets: totalTimesheets,
      estimated_gross: estimatedGross,
      estimated_net: estimatedNet,
    };
  }
}

export default PayrollCalculationService;
