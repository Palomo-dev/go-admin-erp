'use client';

import { supabase } from '@/lib/supabase/config';

export interface EmploymentCompensation {
  id: string;
  employment_id: string;
  package_id: string;
  effective_from: string;
  effective_to: string | null;
  salary_override: number | null;
  custom_components: Record<string, any> | null;
  status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee_name?: string;
  employee_code?: string;
  package_name?: string;
  package_base_salary?: number;
  currency_code?: string;
}

export interface CreateAssignmentDTO {
  employment_id: string;
  package_id: string;
  effective_from: string;
  effective_to?: string;
  salary_override?: number;
  custom_components?: Record<string, any>;
  status?: string;
  notes?: string;
}

export interface UpdateAssignmentDTO extends Partial<CreateAssignmentDTO> {}

export interface AssignmentFilters {
  employment_id?: string;
  package_id?: string;
  status?: string;
  effective_date?: string;
}

class EmploymentCompensationService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters?: AssignmentFilters): Promise<EmploymentCompensation[]> {
    const { data, error } = await supabase
      .from('employment_compensation')
      .select(`
        *,
        employments!employment_compensation_employment_id_fkey(
          id,
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            organization_id,
            profiles(first_name, last_name)
          )
        ),
        compensation_packages!employment_compensation_package_id_fkey(
          id,
          name,
          base_salary,
          currency_code,
          organization_id
        )
      `)
      .order('effective_from', { ascending: false });

    if (error) throw error;

    // Filter by organization
    const filtered = (data || []).filter((item: any) => {
      const empOrgId = item.employments?.organization_members?.organization_id;
      const pkgOrgId = item.compensation_packages?.organization_id;
      return empOrgId === this.organizationId || pkgOrgId === this.organizationId;
    });

    // Apply additional filters
    let result = filtered;
    
    if (filters?.employment_id) {
      result = result.filter((item: any) => item.employment_id === filters.employment_id);
    }
    
    if (filters?.package_id) {
      result = result.filter((item: any) => item.package_id === filters.package_id);
    }
    
    if (filters?.status) {
      result = result.filter((item: any) => item.status === filters.status);
    }
    
    if (filters?.effective_date) {
      const date = filters.effective_date;
      result = result.filter((item: any) => {
        const from = item.effective_from;
        const to = item.effective_to;
        return from <= date && (!to || to >= date);
      });
    }

    return result.map((item: any) => this.mapAssignment(item));
  }

  async getById(id: string): Promise<EmploymentCompensation | null> {
    const { data, error } = await supabase
      .from('employment_compensation')
      .select(`
        *,
        employments!employment_compensation_employment_id_fkey(
          id,
          employee_code,
          organization_members!employments_organization_member_id_fkey(
            profiles(first_name, last_name)
          )
        ),
        compensation_packages!employment_compensation_package_id_fkey(
          id,
          name,
          base_salary,
          currency_code
        )
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data ? this.mapAssignment(data) : null;
  }

  async getByEmployment(employmentId: string): Promise<EmploymentCompensation[]> {
    return this.getAll({ employment_id: employmentId });
  }

  async getCurrentAssignment(employmentId: string): Promise<EmploymentCompensation | null> {
    const today = new Date().toISOString().split('T')[0];
    const assignments = await this.getAll({ 
      employment_id: employmentId,
      effective_date: today
    });
    return assignments[0] || null;
  }

  async create(dto: CreateAssignmentDTO): Promise<EmploymentCompensation> {
    const { data, error } = await supabase
      .from('employment_compensation')
      .insert({
        ...dto,
        status: dto.status ?? 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<EmploymentCompensation>;
  }

  async update(id: string, dto: UpdateAssignmentDTO): Promise<EmploymentCompensation> {
    const { data, error } = await supabase
      .from('employment_compensation')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<EmploymentCompensation>;
  }

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('employment_compensation')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async endAssignment(id: string, effectiveTo: string, notes?: string): Promise<EmploymentCompensation> {
    return this.update(id, {
      effective_to: effectiveTo,
      status: 'ended',
      notes: notes,
    });
  }

  async approve(id: string, approvedBy: string): Promise<EmploymentCompensation> {
    const { data, error } = await supabase
      .from('employment_compensation')
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.getById(data.id) as Promise<EmploymentCompensation>;
  }

  // Stats
  async getStats(): Promise<{
    total: number;
    active: number;
    pending: number;
    ended: number;
  }> {
    const all = await this.getAll();
    const today = new Date().toISOString().split('T')[0];
    
    const active = all.filter(a => {
      const isActive = a.effective_from <= today && (!a.effective_to || a.effective_to >= today);
      return isActive && a.status !== 'ended';
    }).length;
    
    const pending = all.filter(a => a.status === 'pending').length;
    const ended = all.filter(a => a.status === 'ended' || (a.effective_to && a.effective_to < today)).length;

    return {
      total: all.length,
      active,
      pending,
      ended,
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

  async getPackages(): Promise<{ id: string; name: string; base_salary: number | null; currency_code: string }[]> {
    const { data, error } = await supabase
      .from('compensation_packages')
      .select('id, name, base_salary, currency_code')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  getStatuses(): { value: string; label: string }[] {
    return [
      { value: 'pending', label: 'Pendiente' },
      { value: 'active', label: 'Activo' },
      { value: 'approved', label: 'Aprobado' },
      { value: 'ended', label: 'Finalizado' },
    ];
  }

  private mapAssignment(item: any): EmploymentCompensation {
    const profile = item.employments?.organization_members?.profiles;
    return {
      ...item,
      employee_name: profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
        : 'Sin asignar',
      employee_code: item.employments?.employee_code || null,
      package_name: item.compensation_packages?.name || 'Sin paquete',
      package_base_salary: item.compensation_packages?.base_salary || null,
      currency_code: item.compensation_packages?.currency_code || 'COP',
    };
  }
}

export default EmploymentCompensationService;
