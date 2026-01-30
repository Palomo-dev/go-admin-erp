'use client';

import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export type TimesheetStatus = 'open' | 'submitted' | 'approved' | 'rejected' | 'locked';

export interface Timesheet {
  id: string;
  organization_id: number;
  branch_id: number | null;
  employment_id: string;
  work_date: string;
  scheduled_minutes: number | null;
  worked_minutes: number;
  break_minutes: number;
  net_worked_minutes: number;
  overtime_minutes: number;
  night_minutes: number;
  holiday_minutes: number;
  late_minutes: number;
  early_departure_minutes: number;
  first_check_in: string | null;
  last_check_out: string | null;
  status: TimesheetStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Relaciones
  employee_name?: string;
  employee_code?: string;
  branch_name?: string;
  approver_name?: string;
}

export interface TimesheetFilters {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  employmentId?: string;
  status?: TimesheetStatus | 'all';
}

export interface TimesheetStats {
  total: number;
  open: number;
  submitted: number;
  approved: number;
  rejected: number;
  locked: number;
  totalWorkedMinutes: number;
  totalOvertimeMinutes: number;
  totalNightMinutes: number;
  totalLateMinutes: number;
}

export class TimesheetsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters: TimesheetFilters = {}): Promise<Timesheet[]> {
    const supabase = createClient();

    let query = supabase
      .from('timesheets')
      .select(`
        *,
        employments(
          id,
          employee_code,
          organization_members(
            profiles(first_name, last_name)
          )
        ),
        branches(id, name)
      `)
      .eq('organization_id', this.organizationId)
      .order('work_date', { ascending: false });

    if (filters.dateFrom) {
      query = query.gte('work_date', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('work_date', filters.dateTo);
    }

    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }

    if (filters.employmentId) {
      query = query.eq('employment_id', filters.employmentId);
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map((item: any) => {
      const profile = item.employments?.organization_members?.profiles;
      return {
        ...item,
        employee_name: profile 
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
          : 'Sin asignar',
        employee_code: item.employments?.employee_code || null,
        branch_name: item.branches?.name || null,
      };
    });
  }

  async getById(id: string): Promise<Timesheet | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheets')
      .select(`
        *,
        employments(
          id,
          employee_code,
          organization_members(
            profiles(first_name, last_name)
          )
        ),
        branches(id, name)
      `)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) throw error;

    if (!data) return null;

    const profile = data.employments?.organization_members?.profiles;
    return {
      ...data,
      employee_name: profile 
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
        : 'Sin asignar',
      employee_code: data.employments?.employee_code || null,
      branch_name: data.branches?.name || null,
    };
  }

  async approve(id: string, approverId: string): Promise<Timesheet> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheets')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async reject(id: string, approverId: string, reason: string): Promise<Timesheet> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheets')
      .update({
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async lock(id: string): Promise<Timesheet> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheets')
      .update({
        status: 'locked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async submit(id: string): Promise<Timesheet> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheets')
      .update({
        status: 'submitted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateNotes(id: string, notes: string): Promise<Timesheet> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheets')
      .update({
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getStats(filters: TimesheetFilters = {}): Promise<TimesheetStats> {
    const all = await this.getAll(filters);

    return {
      total: all.length,
      open: all.filter((t) => t.status === 'open').length,
      submitted: all.filter((t) => t.status === 'submitted').length,
      approved: all.filter((t) => t.status === 'approved').length,
      rejected: all.filter((t) => t.status === 'rejected').length,
      locked: all.filter((t) => t.status === 'locked').length,
      totalWorkedMinutes: all.reduce((sum, t) => sum + (t.worked_minutes || 0), 0),
      totalOvertimeMinutes: all.reduce((sum, t) => sum + (t.overtime_minutes || 0), 0),
      totalNightMinutes: all.reduce((sum, t) => sum + (t.night_minutes || 0), 0),
      totalLateMinutes: all.reduce((sum, t) => sum + (t.late_minutes || 0), 0),
    };
  }

  async getBranches(): Promise<{ id: number; name: string }[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getEmployees(): Promise<{ id: string; name: string; code: string | null }[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        organization_members(
          organization_id,
          profiles(first_name, last_name)
        )
      `)
      .eq('status', 'active');

    if (error) throw error;

    const filtered = (data || []).filter((item: any) =>
      item.organization_members?.organization_id === this.organizationId
    );

    return filtered.map((item: any) => {
      const profile = item.organization_members?.profiles;
      return {
        id: item.id,
        name: profile 
          ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
          : 'Sin nombre',
        code: item.employee_code,
      };
    });
  }
}

export default TimesheetsService;
