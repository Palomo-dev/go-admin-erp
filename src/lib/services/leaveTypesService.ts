'use client';

import { supabase } from '@/lib/supabase/config';

export interface LeaveType {
  id: string;
  organization_id: number;
  code: string;
  name: string;
  description: string | null;
  paid: boolean;
  affects_attendance: boolean;
  requires_document: boolean;
  requires_approval: boolean;
  max_days_per_year: number | null;
  max_consecutive_days: number | null;
  min_notice_days: number;
  accrues_monthly: boolean;
  accrual_rate: number | null;
  can_carry_over: boolean;
  max_carry_over_days: number | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeaveTypeFilters {
  isActive?: boolean | 'all';
  paid?: boolean | 'all';
  search?: string;
}

export interface CreateLeaveTypeDTO {
  code: string;
  name: string;
  description?: string;
  paid?: boolean;
  affects_attendance?: boolean;
  requires_document?: boolean;
  requires_approval?: boolean;
  max_days_per_year?: number;
  max_consecutive_days?: number;
  min_notice_days?: number;
  accrues_monthly?: boolean;
  accrual_rate?: number;
  can_carry_over?: boolean;
  max_carry_over_days?: number;
  color?: string;
}

export interface UpdateLeaveTypeDTO extends Partial<CreateLeaveTypeDTO> {
  is_active?: boolean;
}

export class LeaveTypesService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters: LeaveTypeFilters = {}): Promise<LeaveType[]> {
    
    let query = supabase
      .from('leave_types')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (filters.isActive !== undefined && filters.isActive !== 'all') {
      query = query.eq('is_active', filters.isActive);
    }

    if (filters.paid !== undefined && filters.paid !== 'all') {
      query = query.eq('paid', filters.paid);
    }

    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  async getById(id: string): Promise<LeaveType | null> {
    
    const { data, error } = await supabase
      .from('leave_types')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async create(dto: CreateLeaveTypeDTO): Promise<LeaveType> {
    
    const { data, error } = await supabase
      .from('leave_types')
      .insert({
        organization_id: this.organizationId,
        ...dto,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, dto: UpdateLeaveTypeDTO): Promise<LeaveType> {
    
    const { data, error } = await supabase
      .from('leave_types')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string): Promise<void> {
    
    const { error } = await supabase
      .from('leave_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async toggleActive(id: string, isActive: boolean): Promise<void> {
    
    const { error } = await supabase
      .from('leave_types')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  async duplicate(id: string): Promise<LeaveType> {
    const original = await this.getById(id);
    if (!original) throw new Error('Tipo de ausencia no encontrado');

    const { id: _, created_at, updated_at, ...rest } = original;

    return this.create({
      ...rest,
      code: `${rest.code}_COPY`,
      name: `${rest.name} (Copia)`,
    });
  }

  async getStats(): Promise<{ total: number; active: number; inactive: number; paid: number; unpaid: number }> {
    
    const { data, error } = await supabase
      .from('leave_types')
      .select('is_active, paid')
      .eq('organization_id', this.organizationId);

    if (error) throw error;

    const stats = {
      total: 0,
      active: 0,
      inactive: 0,
      paid: 0,
      unpaid: 0,
    };

    (data || []).forEach((item: any) => {
      stats.total++;
      if (item.is_active) stats.active++;
      else stats.inactive++;
      if (item.paid) stats.paid++;
      else stats.unpaid++;
    });

    return stats;
  }
}

export default LeaveTypesService;
