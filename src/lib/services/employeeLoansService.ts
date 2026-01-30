'use client';

import { supabase } from '@/lib/supabase/config';

export interface EmployeeLoan {
  id: string;
  organization_id: number;
  employment_id: string;
  loan_number: string | null;
  loan_type: string | null;
  description: string | null;
  currency_code: string;
  principal: number;
  interest_rate: number | null;
  total_interest: number | null;
  total_amount: number;
  balance: number;
  installments_total: number;
  installment_amount: number;
  installments_paid: number | null;
  disbursement_date: string | null;
  first_payment_date: string | null;
  last_payment_date: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  status: string | null;
  auto_deduct: boolean;
  max_deduction_pct: number | null;
  notes: string | null;
  supporting_documents: Record<string, any> | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee_name?: string;
  employee_code?: string;
}

export interface LoanInstallment {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  principal_portion: number;
  interest_portion: number | null;
  status: string | null;
  amount_paid: number | null;
  paid_at: string | null;
  payroll_item_id: string | null;
  payroll_slip_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateLoanDTO {
  employment_id: string;
  loan_type?: string;
  description?: string;
  currency_code: string;
  principal: number;
  interest_rate?: number;
  installments_total: number;
  first_payment_date: string;
  auto_deduct?: boolean;
  max_deduction_pct?: number;
  notes?: string;
}

export interface UpdateLoanDTO {
  loan_type?: string;
  description?: string;
  interest_rate?: number;
  first_payment_date?: string;
  auto_deduct?: boolean;
  max_deduction_pct?: number;
  notes?: string;
}

export interface LoanFilters {
  status?: string;
  employment_id?: string;
  loan_type?: string;
}

class EmployeeLoansService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters?: LoanFilters): Promise<EmployeeLoan[]> {
    const { data, error } = await supabase
      .from('employee_loans')
      .select(`
        *,
        employments!employee_loans_employment_id_fkey(
          id,
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            organization_id,
            profiles(first_name, last_name)
          )
        )
      `)
      .eq('organization_id', this.organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    let result = (data || []).map((item: any) => this.mapLoan(item));

    if (filters?.status) {
      result = result.filter(l => l.status === filters.status);
    }
    if (filters?.employment_id) {
      result = result.filter(l => l.employment_id === filters.employment_id);
    }
    if (filters?.loan_type) {
      result = result.filter(l => l.loan_type === filters.loan_type);
    }

    return result;
  }

  async getById(id: string): Promise<EmployeeLoan | null> {
    const { data, error } = await supabase
      .from('employee_loans')
      .select(`
        *,
        employments!employee_loans_employment_id_fkey(
          id,
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          )
        )
      `)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) throw error;
    return data ? this.mapLoan(data) : null;
  }

  async create(dto: CreateLoanDTO): Promise<EmployeeLoan> {
    // Calculate loan details
    const interestRate = dto.interest_rate || 0;
    const totalInterest = (dto.principal * interestRate * dto.installments_total) / 100 / 12;
    const totalAmount = dto.principal + totalInterest;
    const installmentAmount = totalAmount / dto.installments_total;

    // Generate loan number
    const loanNumber = await this.generateLoanNumber();

    const { data, error } = await supabase
      .from('employee_loans')
      .insert({
        organization_id: this.organizationId,
        employment_id: dto.employment_id,
        loan_number: loanNumber,
        loan_type: dto.loan_type || 'general',
        description: dto.description,
        currency_code: dto.currency_code,
        principal: dto.principal,
        interest_rate: interestRate,
        total_interest: totalInterest,
        total_amount: totalAmount,
        balance: totalAmount,
        installments_total: dto.installments_total,
        installment_amount: Math.round(installmentAmount * 100) / 100,
        installments_paid: 0,
        first_payment_date: dto.first_payment_date,
        auto_deduct: dto.auto_deduct ?? true,
        max_deduction_pct: dto.max_deduction_pct || 30,
        notes: dto.notes,
        status: 'requested',
        requested_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<EmployeeLoan>;
  }

  async update(id: string, dto: UpdateLoanDTO): Promise<EmployeeLoan> {
    const { data, error } = await supabase
      .from('employee_loans')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .eq('status', 'requested') // Solo editar préstamos solicitados
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<EmployeeLoan>;
  }

  async delete(id: string): Promise<void> {
    // Solo eliminar préstamos solicitados
    const { error } = await supabase
      .from('employee_loans')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .eq('status', 'requested');

    if (error) throw error;
  }

  async approve(id: string, approvedBy: string): Promise<EmployeeLoan> {
    const loan = await this.getById(id);
    if (!loan) throw new Error('Préstamo no encontrado');
    if (loan.status !== 'requested') throw new Error('El préstamo no está en estado solicitado');

    // Update loan status
    const { error: updateError } = await supabase
      .from('employee_loans')
      .update({
        status: 'active',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        disbursement_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Generate installments
    await this.generateInstallments(id, loan);

    return this.getById(id) as Promise<EmployeeLoan>;
  }

  async reject(id: string, rejectedBy: string, reason: string): Promise<EmployeeLoan> {
    const { data, error } = await supabase
      .from('employee_loans')
      .update({
        status: 'cancelled',
        rejected_by: rejectedBy,
        rejected_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .eq('status', 'requested')
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<EmployeeLoan>;
  }

  async cancel(id: string): Promise<EmployeeLoan> {
    const { data, error } = await supabase
      .from('employee_loans')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<EmployeeLoan>;
  }

  // Installments methods
  async getInstallments(loanId: string): Promise<LoanInstallment[]> {
    const { data, error } = await supabase
      .from('loan_installments')
      .select('*')
      .eq('loan_id', loanId)
      .order('installment_number');

    if (error) throw error;
    return data || [];
  }

  async registerPayment(
    installmentId: string,
    amount: number,
    notes?: string
  ): Promise<LoanInstallment> {
    // Get installment
    const { data: installment, error: getError } = await supabase
      .from('loan_installments')
      .select('*, employee_loans!loan_installments_loan_id_fkey(id, balance, installments_paid)')
      .eq('id', installmentId)
      .single();

    if (getError) throw getError;
    if (!installment) throw new Error('Cuota no encontrada');

    const newAmountPaid = (installment.amount_paid || 0) + amount;
    const isPaid = newAmountPaid >= installment.amount;

    // Update installment
    const { data: updatedInstallment, error: updateError } = await supabase
      .from('loan_installments')
      .update({
        amount_paid: newAmountPaid,
        status: isPaid ? 'paid' : 'partial',
        paid_at: isPaid ? new Date().toISOString() : null,
        notes: notes || installment.notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', installmentId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Update loan balance
    const loan = installment.employee_loans;
    const newBalance = loan.balance - amount;
    const newInstallmentsPaid = isPaid ? (loan.installments_paid || 0) + 1 : loan.installments_paid;

    await supabase
      .from('employee_loans')
      .update({
        balance: Math.max(0, newBalance),
        installments_paid: newInstallmentsPaid,
        last_payment_date: new Date().toISOString().split('T')[0],
        status: newBalance <= 0 ? 'paid' : 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', loan.id);

    return updatedInstallment;
  }

  private async generateInstallments(loanId: string, loan: EmployeeLoan): Promise<void> {
    // Verificar si ya existen cuotas para este préstamo
    const { data: existingInstallments } = await supabase
      .from('loan_installments')
      .select('id')
      .eq('loan_id', loanId);

    // Si ya existen cuotas, no crear nuevas
    if (existingInstallments && existingInstallments.length > 0) {
      console.log(`Cuotas ya existen para el préstamo ${loanId}, omitiendo generación`);
      return;
    }

    const installments = [];
    const firstDate = new Date(loan.first_payment_date!);
    
    const principalPortion = loan.principal / loan.installments_total;
    const interestPortion = (loan.total_interest || 0) / loan.installments_total;

    for (let i = 1; i <= loan.installments_total; i++) {
      const dueDate = new Date(firstDate);
      dueDate.setMonth(dueDate.getMonth() + (i - 1));

      installments.push({
        loan_id: loanId,
        installment_number: i,
        due_date: dueDate.toISOString().split('T')[0],
        amount: loan.installment_amount,
        principal_portion: Math.round(principalPortion * 100) / 100,
        interest_portion: Math.round(interestPortion * 100) / 100,
        status: 'pending',
        amount_paid: 0,
      });
    }

    const { error } = await supabase
      .from('loan_installments')
      .insert(installments);

    if (error) throw error;
  }

  private async generateLoanNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const { count } = await supabase
      .from('employee_loans')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', this.organizationId);

    const sequence = ((count || 0) + 1).toString().padStart(5, '0');
    return `LOAN-${year}-${sequence}`;
  }

  // Stats
  async getStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    paid: number;
    totalDisbursed: number;
    totalBalance: number;
    overdueInstallments: number;
  }> {
    const loans = await this.getAll();
    const today = new Date().toISOString().split('T')[0];

    const active = loans.filter(l => l.status === 'active').length;
    const pending = loans.filter(l => l.status === 'requested').length;
    const paid = loans.filter(l => l.status === 'paid').length;
    
    const totalDisbursed = loans
      .filter(l => l.status === 'active' || l.status === 'paid')
      .reduce((sum, l) => sum + l.principal, 0);
    
    const totalBalance = loans
      .filter(l => l.status === 'active')
      .reduce((sum, l) => sum + l.balance, 0);

    // Count overdue installments
    let overdueInstallments = 0;
    for (const loan of loans.filter(l => l.status === 'active')) {
      const installments = await this.getInstallments(loan.id);
      overdueInstallments += installments.filter(
        i => i.status !== 'paid' && i.due_date < today
      ).length;
    }

    return {
      total: loans.length,
      active,
      pending,
      paid,
      totalDisbursed,
      totalBalance,
      overdueInstallments,
    };
  }

  // Helper methods
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

  getLoanTypes(): { value: string; label: string }[] {
    return [
      { value: 'general', label: 'General' },
      { value: 'advance', label: 'Anticipo' },
      { value: 'emergency', label: 'Emergencia' },
      { value: 'education', label: 'Educación' },
      { value: 'housing', label: 'Vivienda' },
      { value: 'vehicle', label: 'Vehículo' },
      { value: 'calamity', label: 'Calamidad' },
    ];
  }

  getLoanStatuses(): { value: string; label: string; color: string }[] {
    return [
      { value: 'requested', label: 'Solicitado', color: 'amber' },
      { value: 'approved', label: 'Aprobado', color: 'blue' },
      { value: 'active', label: 'Activo', color: 'green' },
      { value: 'paid', label: 'Pagado', color: 'cyan' },
      { value: 'cancelled', label: 'Cancelado/Rechazado', color: 'gray' },
      { value: 'defaulted', label: 'En mora', color: 'red' },
      { value: 'written_off', label: 'Castigado', color: 'red' },
    ];
  }

  getInstallmentStatuses(): { value: string; label: string; color: string }[] {
    return [
      { value: 'pending', label: 'Pendiente', color: 'gray' },
      { value: 'partial', label: 'Parcial', color: 'amber' },
      { value: 'paid', label: 'Pagado', color: 'green' },
      { value: 'overdue', label: 'Vencido', color: 'red' },
    ];
  }

  getCurrencies(): string[] {
    return ['COP', 'USD', 'EUR', 'MXN'];
  }

  private mapLoan(item: any): EmployeeLoan {
    const profile = item.employments?.organization_members?.profiles;
    return {
      ...item,
      employee_name: profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Sin asignar',
      employee_code: item.employments?.employee_code || null,
    };
  }
}

export default EmployeeLoansService;
