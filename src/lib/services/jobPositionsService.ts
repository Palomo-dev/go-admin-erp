import { supabase } from '@/lib/supabase/config';

export interface JobPosition {
  id: string;
  organization_id: number;
  department_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  level: string | null;
  min_salary: number | null;
  max_salary: number | null;
  requirements: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Campos computados para UI
  department_name?: string;
  employees_count?: number;
}

export interface JobPositionFilters {
  search?: string;
  isActive?: boolean | 'all';
  departmentId?: string;
  level?: string;
  minSalaryFrom?: number;
  minSalaryTo?: number;
}

export interface CreateJobPositionDTO {
  organization_id: number;
  department_id?: string | null;
  code?: string;
  name: string;
  description?: string;
  level?: string;
  min_salary?: number | null;
  max_salary?: number | null;
  requirements?: Record<string, any>;
  is_active?: boolean;
}

export interface UpdateJobPositionDTO {
  department_id?: string | null;
  code?: string;
  name?: string;
  description?: string;
  level?: string;
  min_salary?: number | null;
  max_salary?: number | null;
  requirements?: Record<string, any>;
  is_active?: boolean;
}

export interface JobPositionEmployee {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  hire_date: string | null;
  status: string;
}

class JobPositionsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters?: JobPositionFilters): Promise<JobPosition[]> {
    let query = supabase
      .from('job_positions')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
    }

    if (filters?.isActive !== undefined && filters.isActive !== 'all') {
      query = query.eq('is_active', filters.isActive);
    }

    if (filters?.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }

    if (filters?.level) {
      query = query.eq('level', filters.level);
    }

    if (filters?.minSalaryFrom !== undefined) {
      query = query.gte('min_salary', filters.minSalaryFrom);
    }

    if (filters?.minSalaryTo !== undefined) {
      query = query.lte('min_salary', filters.minSalaryTo);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching job positions:', error);
      throw error;
    }

    // Obtener nombres de departamentos
    const positions = data || [];
    const deptIds = Array.from(new Set(positions.filter(p => p.department_id).map(p => p.department_id)));
    
    let deptMap: Record<string, string> = {};
    if (deptIds.length > 0) {
      const { data: depts } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', deptIds);
      
      if (depts) {
        deptMap = Object.fromEntries(depts.map(d => [d.id, d.name]));
      }
    }

    // Contar empleados por cargo
    const positionIds = positions.map(p => p.id);
    let employeeCounts: Record<string, number> = {};
    
    if (positionIds.length > 0) {
      const { data: empCounts } = await supabase
        .from('employments')
        .select('position_id')
        .in('position_id', positionIds);
      
      if (empCounts) {
        empCounts.forEach(e => {
          if (e.position_id) {
            employeeCounts[e.position_id] = (employeeCounts[e.position_id] || 0) + 1;
          }
        });
      }
    }

    return positions.map(p => ({
      ...p,
      department_name: p.department_id ? deptMap[p.department_id] : undefined,
      employees_count: employeeCounts[p.id] || 0,
    }));
  }

  async getById(id: string): Promise<JobPosition | null> {
    const { data, error } = await supabase
      .from('job_positions')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('Error fetching job position:', error);
      throw error;
    }

    // Obtener nombre del departamento
    if (data.department_id) {
      const { data: dept } = await supabase
        .from('departments')
        .select('name')
        .eq('id', data.department_id)
        .single();
      
      if (dept) {
        data.department_name = dept.name;
      }
    }

    // Contar empleados
    const { count } = await supabase
      .from('employments')
      .select('*', { count: 'exact', head: true })
      .eq('position_id', id);

    return {
      ...data,
      employees_count: count || 0,
    };
  }

  async getEmployees(positionId: string): Promise<JobPositionEmployee[]> {
    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        hire_date,
        status
      `)
      .eq('position_id', positionId);

    if (error) {
      console.error('Error fetching position employees:', error);
      throw error;
    }

    if (!data || data.length === 0) return [];

    // Obtener nombres de profiles
    const employmentIds = data.map(e => e.id);
    const { data: members } = await supabase
      .from('organization_members')
      .select('user_id, profiles:user_id(full_name, email)')
      .eq('organization_id', this.organizationId);

    const profileMap: Record<string, { full_name: string; email: string }> = {};
    if (members) {
      members.forEach((m: any) => {
        if (m.profiles) {
          profileMap[m.user_id] = {
            full_name: m.profiles.full_name || 'Sin nombre',
            email: m.profiles.email || '',
          };
        }
      });
    }

    // Relacionar employments con profiles a través de organization_members
    const { data: empMembers } = await supabase
      .from('employments')
      .select('id, organization_member_id')
      .in('id', employmentIds);

    const { data: orgMembers } = await supabase
      .from('organization_members')
      .select('id, user_id')
      .eq('organization_id', this.organizationId);

    const memberUserMap: Record<string, string> = {};
    if (orgMembers) {
      orgMembers.forEach(m => {
        memberUserMap[m.id] = m.user_id;
      });
    }

    const empMemberMap: Record<string, string> = {};
    if (empMembers) {
      empMembers.forEach(e => {
        if (e.organization_member_id) {
          empMemberMap[e.id] = e.organization_member_id;
        }
      });
    }

    return data.map(e => {
      const memberId = empMemberMap[e.id];
      const userId = memberId ? memberUserMap[memberId] : undefined;
      const profile = userId ? profileMap[userId] : undefined;

      return {
        id: e.id,
        employee_code: e.employee_code,
        full_name: profile?.full_name || 'Sin nombre',
        email: profile?.email || null,
        hire_date: e.hire_date,
        status: e.status,
      };
    });
  }

  async create(data: CreateJobPositionDTO): Promise<JobPosition> {
    const { data: created, error } = await supabase
      .from('job_positions')
      .insert({
        organization_id: this.organizationId,
        department_id: data.department_id || null,
        code: data.code || null,
        name: data.name,
        description: data.description || null,
        level: data.level || null,
        min_salary: data.min_salary ?? null,
        max_salary: data.max_salary ?? null,
        requirements: data.requirements || {},
        is_active: data.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job position:', error);
      throw error;
    }

    return created;
  }

  async update(id: string, data: UpdateJobPositionDTO): Promise<JobPosition> {
    const updateData: any = { updated_at: new Date().toISOString() };

    if (data.department_id !== undefined) updateData.department_id = data.department_id;
    if (data.code !== undefined) updateData.code = data.code;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.level !== undefined) updateData.level = data.level;
    if (data.min_salary !== undefined) updateData.min_salary = data.min_salary;
    if (data.max_salary !== undefined) updateData.max_salary = data.max_salary;
    if (data.requirements !== undefined) updateData.requirements = data.requirements;
    if (data.is_active !== undefined) updateData.is_active = data.is_active;

    const { data: updated, error } = await supabase
      .from('job_positions')
      .update(updateData)
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .select()
      .single();

    if (error) {
      console.error('Error updating job position:', error);
      throw error;
    }

    return updated;
  }

  async delete(id: string): Promise<void> {
    // Verificar si hay empleados asignados
    const { count } = await supabase
      .from('employments')
      .select('*', { count: 'exact', head: true })
      .eq('position_id', id);

    if (count && count > 0) {
      throw new Error(`No se puede eliminar: hay ${count} empleado(s) asignado(s) a este cargo`);
    }

    const { error } = await supabase
      .from('job_positions')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) {
      console.error('Error deleting job position:', error);
      throw error;
    }
  }

  async duplicate(id: string): Promise<JobPosition> {
    const original = await this.getById(id);
    if (!original) {
      throw new Error('Cargo no encontrado');
    }

    const newCode = original.code ? `${original.code}-COPY` : null;
    const newName = `${original.name} (Copia)`;

    return this.create({
      organization_id: this.organizationId,
      department_id: original.department_id,
      code: newCode || undefined,
      name: newName,
      description: original.description || undefined,
      level: original.level || undefined,
      min_salary: original.min_salary,
      max_salary: original.max_salary,
      requirements: original.requirements,
      is_active: true,
    });
  }

  async toggleActive(id: string): Promise<JobPosition> {
    const current = await this.getById(id);
    if (!current) {
      throw new Error('Cargo no encontrado');
    }

    return this.update(id, { is_active: !current.is_active });
  }

  async getLevels(): Promise<string[]> {
    const { data } = await supabase
      .from('job_positions')
      .select('level')
      .eq('organization_id', this.organizationId)
      .not('level', 'is', null);

    if (!data) return [];

    const levels = Array.from(new Set(data.map(d => d.level).filter(Boolean))) as string[];
    return levels.sort();
  }

  async validateCode(code: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('job_positions')
      .select('id')
      .eq('organization_id', this.organizationId)
      .eq('code', code);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data } = await query.limit(1);
    return !data || data.length === 0;
  }
}

export default JobPositionsService;
