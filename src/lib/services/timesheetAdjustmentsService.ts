'use client';

import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export type AdjustmentStatus = 'pending' | 'approved' | 'rejected';
export type AdjustmentType = 'add_time' | 'remove_time' | 'change_check_in' | 'change_check_out' | 'add_break' | 'other';

export interface TimesheetAdjustment {
  id: string;
  timesheet_id: string;
  adjustment_type: AdjustmentType;
  minutes_delta: number | null;
  previous_value: string | null;
  new_value: string | null;
  reason: string;
  supporting_document_path: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  status: AdjustmentStatus;
  created_at: string;
  // Relaciones
  creator_name?: string;
  approver_name?: string;
  timesheet?: {
    work_date: string;
    employee_name: string;
    branch_name: string;
  };
}

export interface CreateAdjustmentDTO {
  timesheet_id: string;
  adjustment_type: AdjustmentType;
  minutes_delta?: number;
  previous_value?: string;
  new_value?: string;
  reason: string;
  supporting_document_path?: string;
}

export interface AdjustmentFilters {
  timesheetId?: string;
  status?: AdjustmentStatus | 'all';
  dateFrom?: string;
  dateTo?: string;
}

export class TimesheetAdjustmentsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters: AdjustmentFilters = {}): Promise<TimesheetAdjustment[]> {
    const supabase = createClient();

    // Primero obtenemos los IDs de timesheets de la organización
    const { data: orgTimesheets, error: tsError } = await supabase
      .from('timesheets')
      .select('id')
      .eq('organization_id', this.organizationId);

    if (tsError) throw tsError;

    // Si no hay timesheets, retornar vacío
    if (!orgTimesheets || orgTimesheets.length === 0) {
      return [];
    }

    const timesheetIds = orgTimesheets.map((t) => t.id);

    let query = supabase
      .from('timesheet_adjustments')
      .select(`
        *,
        timesheets(
          id,
          work_date,
          organization_id,
          employments(
            employee_code,
            organization_members(
              profiles(first_name, last_name)
            )
          ),
          branches(name)
        )
      `)
      .in('timesheet_id', timesheetIds)
      .order('created_at', { ascending: false });

    if (filters.timesheetId) {
      query = query.eq('timesheet_id', filters.timesheetId);
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.dateFrom) {
      query = query.gte('timesheets.work_date', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('timesheets.work_date', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map((item: any) => {
      const empProfile = item.timesheets?.employments?.organization_members?.profiles;
      return {
        ...item,
        creator_name: 'Usuario',
        approver_name: item.approved_by ? 'Aprobador' : null,
        timesheet: {
          work_date: item.timesheets?.work_date,
          employee_name: empProfile 
            ? `${empProfile.first_name || ''} ${empProfile.last_name || ''}`.trim() 
            : 'Sin asignar',
          branch_name: item.timesheets?.branches?.name || null,
        },
      };
    });
  }

  async getById(id: string): Promise<TimesheetAdjustment | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheet_adjustments')
      .select(`
        *,
        timesheets(
          id,
          work_date,
          organization_id,
          employments(
            employee_code,
            organization_members(
              profiles(first_name, last_name)
            )
          ),
          branches(name)
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!data) return null;

    const empProfile = data.timesheets?.employments?.organization_members?.profiles;
    return {
      ...data,
      creator_name: 'Usuario',
      approver_name: data.approved_by ? 'Aprobador' : null,
      timesheet: {
        work_date: data.timesheets?.work_date,
        employee_name: empProfile 
          ? `${empProfile.first_name || ''} ${empProfile.last_name || ''}`.trim() 
          : 'Sin asignar',
        branch_name: data.timesheets?.branches?.name || null,
      },
    };
  }

  async create(dto: CreateAdjustmentDTO, createdBy: string): Promise<TimesheetAdjustment> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheet_adjustments')
      .insert({
        timesheet_id: dto.timesheet_id,
        adjustment_type: dto.adjustment_type,
        minutes_delta: dto.minutes_delta || null,
        previous_value: dto.previous_value || null,
        new_value: dto.new_value || null,
        reason: dto.reason,
        supporting_document_path: dto.supporting_document_path || null,
        created_by: createdBy,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async approve(id: string, approverId: string): Promise<TimesheetAdjustment> {
    const supabase = createClient();

    // Obtener el ajuste para aplicar los cambios al timesheet
    const adjustment = await this.getById(id);
    if (!adjustment) throw new Error('Ajuste no encontrado');

    // Aprobar el ajuste
    const { data, error } = await supabase
      .from('timesheet_adjustments')
      .update({
        status: 'approved',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Aplicar el ajuste al timesheet si hay delta de minutos
    if (adjustment.minutes_delta && adjustment.minutes_delta !== 0) {
      const { data: timesheet } = await supabase
        .from('timesheets')
        .select('worked_minutes, net_worked_minutes')
        .eq('id', adjustment.timesheet_id)
        .single();

      if (timesheet) {
        await supabase
          .from('timesheets')
          .update({
            worked_minutes: (timesheet.worked_minutes || 0) + adjustment.minutes_delta,
            net_worked_minutes: (timesheet.net_worked_minutes || 0) + adjustment.minutes_delta,
            updated_at: new Date().toISOString(),
          })
          .eq('id', adjustment.timesheet_id);
      }
    }

    return data;
  }

  async reject(id: string, approverId: string): Promise<TimesheetAdjustment> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheet_adjustments')
      .update({
        status: 'rejected',
        approved_by: approverId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async uploadDocument(file: File, adjustmentId: string): Promise<string> {
    const supabase = createClient();

    const fileName = `${this.organizationId}/${adjustmentId}/${Date.now()}_${file.name}`;

    const { data, error } = await supabase.storage
      .from('timesheet-documents')
      .upload(fileName, file);

    if (error) throw error;

    // Actualizar el ajuste con la ruta del documento
    await supabase
      .from('timesheet_adjustments')
      .update({ supporting_document_path: data.path })
      .eq('id', adjustmentId);

    return data.path;
  }

  async getStats(filters: AdjustmentFilters = {}): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
  }> {
    const all = await this.getAll(filters);

    return {
      total: all.length,
      pending: all.filter((a) => a.status === 'pending').length,
      approved: all.filter((a) => a.status === 'approved').length,
      rejected: all.filter((a) => a.status === 'rejected').length,
    };
  }

  async getTimesheets(): Promise<{ id: string; label: string }[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('timesheets')
      .select(`
        id,
        work_date,
        employments(
          employee_code,
          organization_members(
            profiles(first_name, last_name)
          )
        )
      `)
      .eq('organization_id', this.organizationId)
      .in('status', ['open', 'submitted'])
      .order('work_date', { ascending: false })
      .limit(100);

    if (error) throw error;

    return (data || []).map((item: any) => {
      const profile = item.employments?.organization_members?.profiles;
      const empName = profile 
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
        : 'Sin asignar';
      return {
        id: item.id,
        label: `${item.work_date} - ${empName}`,
      };
    });
  }
}

export default TimesheetAdjustmentsService;
