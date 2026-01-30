import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export interface ShiftTemplate {
  id: string;
  organization_id: number;
  code: string | null;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  paid_break: boolean;
  is_night_shift: boolean;
  is_split_shift: boolean;
  color: string | null;
  overtime_multiplier: number;
  night_multiplier: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ShiftRotation {
  id: string;
  organization_id: number;
  name: string;
  description: string | null;
  cycle_days: number;
  pattern: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftAssignment {
  id: string;
  organization_id: number;
  branch_id: number | null;
  employment_id: string;
  shift_template_id: string | null;
  shift_rotation_id: string | null;
  work_date: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  status: string;
  swapped_with_employment_id: string | null;
  swap_approved_by: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee_name?: string;
  employee_code?: string | null;
  template_name?: string | null;
  template_start_time?: string | null;
  template_end_time?: string | null;
  template_color?: string | null;
  branch_name?: string | null;
  swapped_with_name?: string | null;
}

export interface ShiftAssignmentListItem extends ShiftAssignment {
  employee_name: string;
  employee_code: string | null;
  template_name: string | null;
  template_start_time: string | null;
  template_end_time: string | null;
  template_color: string | null;
  branch_name: string | null;
}

export interface CreateShiftAssignmentDTO {
  employment_id: string;
  shift_template_id?: string;
  shift_rotation_id?: string;
  branch_id?: number;
  work_date: string;
  actual_start_time?: string;
  actual_end_time?: string;
  status?: string;
  notes?: string;
}

export interface UpdateShiftAssignmentDTO {
  shift_template_id?: string | null;
  shift_rotation_id?: string | null;
  branch_id?: number | null;
  work_date?: string;
  actual_start_time?: string | null;
  actual_end_time?: string | null;
  status?: string;
  notes?: string | null;
}

export interface ShiftFilters {
  branchId?: number;
  employmentId?: string;
  templateId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class ShiftsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAssignments(filters: ShiftFilters = {}): Promise<ShiftAssignmentListItem[]> {
    const supabase = createClient();

    let query = supabase
      .from('shift_assignments')
      .select(`
        *,
        shift_templates(id, name, start_time, end_time, color),
        branches(id, name)
      `)
      .eq('organization_id', this.organizationId)
      .order('work_date', { ascending: true });

    if (filters.branchId) {
      query = query.eq('branch_id', filters.branchId);
    }

    if (filters.employmentId) {
      query = query.eq('employment_id', filters.employmentId);
    }

    if (filters.templateId) {
      query = query.eq('shift_template_id', filters.templateId);
    }

    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    if (filters.dateFrom) {
      query = query.gte('work_date', filters.dateFrom);
    }

    if (filters.dateTo) {
      query = query.lte('work_date', filters.dateTo);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Obtener datos de empleados por separado para evitar bloqueo RLS
    const employmentIds = Array.from(new Set((data || []).map((item: any) => item.employment_id).filter(Boolean))) as string[];
    
    let employeeData: Record<string, { name: string; code: string | null }> = {};
    if (employmentIds.length > 0) {
      const { data: employments } = await supabase
        .from('employments')
        .select('id, employee_code, organization_member_id')
        .in('id', employmentIds);
      
      if (employments && employments.length > 0) {
        const orgMemberIds = employments.map((e: any) => e.organization_member_id).filter(Boolean);
        
        const { data: members } = await supabase
          .from('organization_members')
          .select('id, profiles:user_id(first_name, last_name)')
          .in('id', orgMemberIds);
        
        const memberNames: Record<number, string> = {};
        if (members) {
          members.forEach((m: any) => {
            const profile = m.profiles as { first_name?: string; last_name?: string } | null;
            memberNames[m.id] = profile 
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre'
              : 'Sin nombre';
          });
        }
        
        employments.forEach((emp: any) => {
          employeeData[emp.id] = {
            name: memberNames[emp.organization_member_id] || 'Sin nombre',
            code: emp.employee_code || null,
          };
        });
      }
    }

    return (data || []).map((item: any) => {
      const empData = employeeData[item.employment_id] || { name: 'Sin nombre', code: null };
      return {
        ...item,
        employee_name: empData.name,
        employee_code: empData.code,
        template_name: item.shift_templates?.name || null,
        template_start_time: item.shift_templates?.start_time || null,
        template_end_time: item.shift_templates?.end_time || null,
        template_color: item.shift_templates?.color || null,
        branch_name: item.branches?.name || null,
      };
    });
  }

  async getAssignmentsByDateRange(
    startDate: string,
    endDate: string,
    branchId?: number
  ): Promise<ShiftAssignmentListItem[]> {
    return this.getAssignments({
      dateFrom: startDate,
      dateTo: endDate,
      branchId,
    });
  }

  async getById(id: string): Promise<ShiftAssignment | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_assignments')
      .select(`
        *,
        shift_templates(id, name, code, start_time, end_time, color, break_minutes, is_night_shift),
        shift_rotations(id, name, description),
        branches(id, name)
      `)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    if (!data) return null;

    // Obtener datos del empleado por separado
    let employeeName = 'Sin nombre';
    let employeeCode: string | null = null;
    
    if (data.employment_id) {
      const { data: employment } = await supabase
        .from('employments')
        .select('employee_code, organization_member_id')
        .eq('id', data.employment_id)
        .single();
      
      if (employment) {
        employeeCode = employment.employee_code;
        
        if (employment.organization_member_id) {
          const { data: member } = await supabase
            .from('organization_members')
            .select('profiles:user_id(first_name, last_name)')
            .eq('id', employment.organization_member_id)
            .single();
          
          const profile = member?.profiles as { first_name?: string; last_name?: string } | null;
          if (profile) {
            employeeName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Sin nombre';
          }
        }
      }
    }

    return {
      ...data,
      employee_name: employeeName,
      employee_code: employeeCode,
      template_name: data.shift_templates?.name || null,
      template_start_time: data.shift_templates?.start_time || null,
      template_end_time: data.shift_templates?.end_time || null,
      template_color: data.shift_templates?.color || null,
      branch_name: data.branches?.name || null,
    };
  }

  async create(dto: CreateShiftAssignmentDTO): Promise<ShiftAssignment> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('shift_assignments')
      .insert({
        organization_id: this.organizationId,
        employment_id: dto.employment_id,
        shift_template_id: dto.shift_template_id || null,
        shift_rotation_id: dto.shift_rotation_id || null,
        branch_id: dto.branch_id || null,
        work_date: dto.work_date,
        actual_start_time: dto.actual_start_time || null,
        actual_end_time: dto.actual_end_time || null,
        status: dto.status || 'scheduled',
        notes: dto.notes || null,
        created_by: userData?.user?.id || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async createBulk(assignments: CreateShiftAssignmentDTO[]): Promise<{ success: number; errors: { index: number; message: string }[] }> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    const errors: { index: number; message: string }[] = [];
    let success = 0;

    for (let i = 0; i < assignments.length; i++) {
      const dto = assignments[i];
      try {
        const { error } = await supabase
          .from('shift_assignments')
          .insert({
            organization_id: this.organizationId,
            employment_id: dto.employment_id,
            shift_template_id: dto.shift_template_id || null,
            shift_rotation_id: dto.shift_rotation_id || null,
            branch_id: dto.branch_id || null,
            work_date: dto.work_date,
            actual_start_time: dto.actual_start_time || null,
            actual_end_time: dto.actual_end_time || null,
            status: dto.status || 'scheduled',
            notes: dto.notes || null,
            created_by: userData?.user?.id || null,
          });

        if (error) {
          errors.push({ index: i, message: error.message });
        } else {
          success++;
        }
      } catch (err: any) {
        errors.push({ index: i, message: err.message || 'Error desconocido' });
      }
    }

    return { success, errors };
  }

  async update(id: string, dto: UpdateShiftAssignmentDTO): Promise<ShiftAssignment> {
    const supabase = createClient();

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (dto.shift_template_id !== undefined) updateData.shift_template_id = dto.shift_template_id;
    if (dto.shift_rotation_id !== undefined) updateData.shift_rotation_id = dto.shift_rotation_id;
    if (dto.branch_id !== undefined) updateData.branch_id = dto.branch_id;
    if (dto.work_date !== undefined) updateData.work_date = dto.work_date;
    if (dto.actual_start_time !== undefined) updateData.actual_start_time = dto.actual_start_time;
    if (dto.actual_end_time !== undefined) updateData.actual_end_time = dto.actual_end_time;
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const { data, error } = await supabase
      .from('shift_assignments')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateStatus(id: string, status: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('shift_assignments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) throw error;
  }

  async reassign(id: string, newEmploymentId: string): Promise<ShiftAssignment> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_assignments')
      .update({
        employment_id: newEmploymentId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async requestSwap(id: string, swapWithEmploymentId: string): Promise<ShiftAssignment> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_assignments')
      .update({
        swapped_with_employment_id: swapWithEmploymentId,
        status: 'swap_pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async approveSwap(id: string): Promise<ShiftAssignment> {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();

    // Get original assignment
    const { data: original, error: fetchError } = await supabase
      .from('shift_assignments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (!original.swapped_with_employment_id) {
      throw new Error('No hay swap pendiente para este turno');
    }

    // Swap the employment_id
    const { data, error } = await supabase
      .from('shift_assignments')
      .update({
        employment_id: original.swapped_with_employment_id,
        swapped_with_employment_id: null,
        swap_approved_by: userData?.user?.id || null,
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async rejectSwap(id: string): Promise<ShiftAssignment> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_assignments')
      .update({
        swapped_with_employment_id: null,
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string): Promise<void> {
    const supabase = createClient();

    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) throw error;
  }

  // Templates
  async getTemplates(activeOnly = true): Promise<ShiftTemplate[]> {
    const supabase = createClient();

    let query = supabase
      .from('shift_templates')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async getTemplateById(id: string): Promise<ShiftTemplate | null> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('shift_templates')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    return data;
  }

  // Rotations
  async getRotations(activeOnly = true): Promise<ShiftRotation[]> {
    const supabase = createClient();

    let query = supabase
      .from('shift_rotations')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  // Employees for selector
  async getEmployees(): Promise<{ id: string; name: string; code: string | null; branch_id: number | null }[]> {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        branch_id,
        organization_members(
          organization_id,
          profiles(first_name, last_name)
        )
      `)
      .eq('status', 'active');

    if (error) throw error;

    // Filter by organization_id in memory since nested filter doesn't work well
    const filtered = (data || []).filter((item: any) => 
      item.organization_members?.organization_id === this.organizationId
    );

    return filtered.map((item: any) => ({
      id: item.id,
      name: item.organization_members?.profiles
        ? `${item.organization_members.profiles.first_name} ${item.organization_members.profiles.last_name}`
        : 'Sin nombre',
      code: item.employee_code,
      branch_id: item.branch_id,
    }));
  }

  // Branches for selector
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

  // Check for conflicts (leave requests)
  async checkConflicts(
    employmentId: string,
    workDate: string
  ): Promise<{ hasConflict: boolean; conflictType?: string; conflictInfo?: string }> {
    const supabase = createClient();

    // Check for leave requests
    const { data: leaves, error: leaveError } = await supabase
      .from('leave_requests')
      .select('id, leave_type, start_date, end_date, status')
      .eq('employment_id', employmentId)
      .lte('start_date', workDate)
      .gte('end_date', workDate)
      .in('status', ['approved', 'pending']);

    if (leaveError) throw leaveError;

    if (leaves && leaves.length > 0) {
      const leave = leaves[0];
      return {
        hasConflict: true,
        conflictType: 'leave',
        conflictInfo: `Solicitud de ${leave.leave_type} (${leave.status === 'approved' ? 'aprobada' : 'pendiente'})`,
      };
    }

    // Check for existing assignments
    const { data: existing, error: existingError } = await supabase
      .from('shift_assignments')
      .select('id, status')
      .eq('employment_id', employmentId)
      .eq('work_date', workDate)
      .neq('status', 'cancelled');

    if (existingError) throw existingError;

    if (existing && existing.length > 0) {
      return {
        hasConflict: true,
        conflictType: 'shift',
        conflictInfo: 'Ya existe un turno asignado para esta fecha',
      };
    }

    return { hasConflict: false };
  }

  // Import assignments
  async importAssignments(
    data: { employee_code: string; template_code: string; branch_id?: number; work_date: string }[]
  ): Promise<{ success: number; errors: { row: number; message: string }[] }> {
    const supabase = createClient();

    // Get employees by code
    const { data: employees } = await supabase
      .from('employments')
      .select('id, employee_code, organization_members!inner(organization_id)')
      .eq('organization_members.organization_id', this.organizationId);

    const employeeMap = new Map((employees || []).map((e: any) => [e.employee_code, e.id]));

    // Get templates by code
    const { data: templates } = await supabase
      .from('shift_templates')
      .select('id, code')
      .eq('organization_id', this.organizationId);

    const templateMap = new Map((templates || []).map((t: any) => [t.code, t.id]));

    const errors: { row: number; message: string }[] = [];
    let success = 0;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const employmentId = employeeMap.get(row.employee_code);
      const templateId = templateMap.get(row.template_code);

      if (!employmentId) {
        errors.push({ row: i + 1, message: `Empleado no encontrado: ${row.employee_code}` });
        continue;
      }

      if (!templateId) {
        errors.push({ row: i + 1, message: `Plantilla no encontrada: ${row.template_code}` });
        continue;
      }

      try {
        await this.create({
          employment_id: employmentId,
          shift_template_id: templateId,
          branch_id: row.branch_id,
          work_date: row.work_date,
        });
        success++;
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message || 'Error al crear asignación' });
      }
    }

    return { success, errors };
  }

  // Stats
  async getStats(dateFrom: string, dateTo: string, branchId?: number): Promise<{
    total: number;
    scheduled: number;
    completed: number;
    cancelled: number;
    swapPending: number;
  }> {
    const assignments = await this.getAssignments({
      dateFrom,
      dateTo,
      branchId,
    });

    return {
      total: assignments.length,
      scheduled: assignments.filter((a) => a.status === 'scheduled').length,
      completed: assignments.filter((a) => a.status === 'completed').length,
      cancelled: assignments.filter((a) => a.status === 'cancelled').length,
      swapPending: assignments.filter((a) => a.status === 'swap_pending').length,
    };
  }
}

export default ShiftsService;
