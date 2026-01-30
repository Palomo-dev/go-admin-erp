'use client';

import { supabase } from '@/lib/supabase/config';

export interface LeaveBalance {
  id: string;
  organization_id: number;
  employment_id: string;
  leave_type_id: string;
  year: number;
  initial_balance: number;
  accrued: number;
  used: number;
  pending: number;
  expired: number;
  carried_over: number;
  available: number;
  last_accrual_date: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields
  employee_name?: string;
  employee_code?: string;
  leave_type_name?: string;
  leave_type_code?: string;
  branch_name?: string;
}

export interface LeaveBalanceFilters {
  year?: number;
  employmentId?: string;
  leaveTypeId?: string;
  branchId?: number;
}

export interface UpdateBalanceDTO {
  initial_balance?: number;
  accrued?: number;
  carried_over?: number;
}

export interface LeaveBalanceStats {
  totalEmployees: number;
  totalAvailable: number;
  totalUsed: number;
  totalPending: number;
  totalExpired: number;
}

export class LeaveBalancesService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters: LeaveBalanceFilters = {}): Promise<LeaveBalance[]> {
    
    let query = supabase
      .from('leave_balances')
      .select(`
        *,
        leave_types(id, code, name),
        employments(
          id,
          employee_code,
          branch_id,
          organization_members(
            profiles(first_name, last_name)
          ),
          branches(id, name)
        )
      `)
      .eq('organization_id', this.organizationId)
      .order('year', { ascending: false });

    if (filters.year) {
      query = query.eq('year', filters.year);
    }

    if (filters.employmentId) {
      query = query.eq('employment_id', filters.employmentId);
    }

    if (filters.leaveTypeId) {
      query = query.eq('leave_type_id', filters.leaveTypeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    let results = (data || []).map((item: any) => this.mapLeaveBalance(item));

    // Filter by branch if needed (post-query filter)
    if (filters.branchId) {
      results = results.filter((b) => b.branch_name !== null);
    }

    return results;
  }

  async getByEmployment(employmentId: string, year?: number): Promise<LeaveBalance[]> {
    
    let query = supabase
      .from('leave_balances')
      .select(`
        *,
        leave_types(id, code, name)
      `)
      .eq('employment_id', employmentId)
      .order('leave_type_id');

    if (year) {
      query = query.eq('year', year);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item,
      leave_type_name: item.leave_types?.name || 'Desconocido',
      leave_type_code: item.leave_types?.code || '',
    }));
  }

  async update(id: string, dto: UpdateBalanceDTO): Promise<LeaveBalance> {
    
    // Recalculate available
    const current = await this.getById(id);
    if (!current) throw new Error('Saldo no encontrado');

    const newInitial = dto.initial_balance ?? current.initial_balance;
    const newAccrued = dto.accrued ?? current.accrued;
    const newCarriedOver = dto.carried_over ?? current.carried_over;
    const available = newInitial + newAccrued + newCarriedOver - current.used - current.pending - current.expired;

    const { data, error } = await supabase
      .from('leave_balances')
      .update({
        ...dto,
        available,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getById(id: string): Promise<LeaveBalance | null> {
    
    const { data, error } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async getStats(filters: LeaveBalanceFilters = {}): Promise<LeaveBalanceStats> {
    
    let query = supabase
      .from('leave_balances')
      .select('employment_id, available, used, pending, expired')
      .eq('organization_id', this.organizationId);

    if (filters.year) {
      query = query.eq('year', filters.year);
    }

    if (filters.leaveTypeId) {
      query = query.eq('leave_type_id', filters.leaveTypeId);
    }

    const { data, error } = await query;

    if (error) throw error;

    const employeeIds = new Set<string>();
    const stats: LeaveBalanceStats = {
      totalEmployees: 0,
      totalAvailable: 0,
      totalUsed: 0,
      totalPending: 0,
      totalExpired: 0,
    };

    (data || []).forEach((item: any) => {
      employeeIds.add(item.employment_id);
      stats.totalAvailable += Number(item.available) || 0;
      stats.totalUsed += Number(item.used) || 0;
      stats.totalPending += Number(item.pending) || 0;
      stats.totalExpired += Number(item.expired) || 0;
    });

    stats.totalEmployees = employeeIds.size;

    return stats;
  }

  async getYears(): Promise<number[]> {
    
    const { data, error } = await supabase
      .from('leave_balances')
      .select('year')
      .eq('organization_id', this.organizationId)
      .order('year', { ascending: false });

    if (error) throw error;

    const yearsSet = new Set<number>((data || []).map((item: any) => item.year));
    return Array.from(yearsSet);
  }

  async getLeaveTypes(): Promise<{ id: string; code: string; name: string }[]> {
    
    const { data, error } = await supabase
      .from('leave_types')
      .select('id, code, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

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

    // Filter by organization after fetch
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

  private mapLeaveBalance(item: any): LeaveBalance {
    const profile = item.employments?.organization_members?.profiles;
    return {
      ...item,
      employee_name: profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Sin asignar',
      employee_code: item.employments?.employee_code || null,
      leave_type_name: item.leave_types?.name || 'Desconocido',
      leave_type_code: item.leave_types?.code || '',
      branch_name: item.employments?.branches?.name || null,
    };
  }
}

export default LeaveBalancesService;
