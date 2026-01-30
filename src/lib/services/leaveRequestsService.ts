'use client';

import { supabase } from '@/lib/supabase/config';

export type LeaveRequestStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  organization_id: number;
  employment_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  start_half_day: boolean;
  end_half_day: boolean;
  half_day_period: string | null;
  total_days: number;
  business_days: number | null;
  reason: string | null;
  document_path: string | null;
  status: LeaveRequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Computed fields
  employee_name?: string;
  leave_type_name?: string;
  leave_type_code?: string;
  leave_type_color?: string;
  branch_name?: string;
}

export interface LeaveRequestFilters {
  status?: LeaveRequestStatus | 'all';
  leaveTypeId?: string;
  employmentId?: string;
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
}

export interface CreateLeaveRequestDTO {
  employment_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  start_half_day?: boolean;
  end_half_day?: boolean;
  half_day_period?: string;
  total_days: number;
  business_days?: number;
  reason?: string;
  document_path?: string;
}

export interface LeaveRequestStats {
  total: number;
  requested: number;
  approved: number;
  rejected: number;
  cancelled: number;
}

export class LeaveRequestsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters: LeaveRequestFilters = {}): Promise<LeaveRequest[]> {
    
    let query = supabase
      .from('leave_requests')
      .select(`
        *,
        leave_types(id, code, name, color),
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
      .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.leaveTypeId) {
      query = query.eq('leave_type_id', filters.leaveTypeId);
    }

    if (filters.employmentId) {
      query = query.eq('employment_id', filters.employmentId);
    }

    if (filters.dateFrom) {
      query = query.gte('start_date', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('end_date', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map((item: any) => this.mapLeaveRequest(item));
  }

  async getById(id: string): Promise<LeaveRequest | null> {
    
    const { data, error } = await supabase
      .from('leave_requests')
      .select(`
        *,
        leave_types(id, code, name, color),
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
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return null;

    return this.mapLeaveRequest(data);
  }

  async create(dto: CreateLeaveRequestDTO): Promise<LeaveRequest> {
    
    const { data, error } = await supabase
      .from('leave_requests')
      .insert({
        organization_id: this.organizationId,
        ...dto,
        status: 'requested',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async approve(id: string, userId: string, notes?: string): Promise<void> {
    
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'approved',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes || null,
      })
      .eq('id', id);

    if (error) throw error;
  }

  async reject(id: string, userId: string, notes: string): Promise<void> {
    
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: notes,
      })
      .eq('id', id);

    if (error) throw error;
  }

  async cancel(id: string, userId: string, reason: string): Promise<void> {
    
    const { error } = await supabase
      .from('leave_requests')
      .update({
        status: 'cancelled',
        cancelled_by: userId,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason,
      })
      .eq('id', id);

    if (error) throw error;
  }

  async getStats(filters: LeaveRequestFilters = {}): Promise<LeaveRequestStats> {
    
    let query = supabase
      .from('leave_requests')
      .select('status')
      .eq('organization_id', this.organizationId);

    if (filters.dateFrom) {
      query = query.gte('start_date', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('end_date', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) throw error;

    const stats: LeaveRequestStats = {
      total: 0,
      requested: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };

    (data || []).forEach((item: any) => {
      stats.total++;
      if (item.status in stats) {
        stats[item.status as keyof Omit<LeaveRequestStats, 'total'>]++;
      }
    });

    return stats;
  }

  async getLeaveTypes(): Promise<{ id: string; code: string; name: string; color: string | null }[]> {
    
    const { data, error } = await supabase
      .from('leave_types')
      .select('id, code, name, color')
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

    // Filter by organization after fetch (since org_id is in organization_members)
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

  async getOverlappingRequests(
    employmentId: string,
    startDate: string,
    endDate: string,
    excludeId?: string
  ): Promise<LeaveRequest[]> {
    
    let query = supabase
      .from('leave_requests')
      .select('*')
      .eq('employment_id', employmentId)
      .in('status', ['requested', 'approved'])
      .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  private mapLeaveRequest(item: any): LeaveRequest {
    const profile = item.employments?.organization_members?.profiles;
    return {
      ...item,
      employee_name: profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Sin asignar',
      leave_type_name: item.leave_types?.name || 'Desconocido',
      leave_type_code: item.leave_types?.code || '',
      leave_type_color: item.leave_types?.color || null,
      branch_name: item.employments?.branches?.name || null,
    };
  }
}

export default LeaveRequestsService;
