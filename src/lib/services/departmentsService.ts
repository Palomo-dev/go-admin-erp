import { supabase } from '@/lib/supabase/config';

export interface Department {
  id: string;
  organization_id: number;
  parent_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  manager_employment_id: string | null;
  cost_center: string | null;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Campos computados para UI
  manager_name?: string;
  parent_name?: string;
  children_count?: number;
}

export interface DepartmentWithHierarchy extends Department {
  children: DepartmentWithHierarchy[];
  level: number;
}

export interface DepartmentFilters {
  search?: string;
  isActive?: boolean | 'all';
  managerId?: string;
  parentId?: string | 'root';
}

export interface EmploymentOption {
  id: string;
  employee_code: string | null;
  full_name: string;
  position_name: string | null;
  department_name: string | null;
}

export interface CreateDepartmentDTO {
  organization_id: number;
  parent_id?: string | null;
  code?: string;
  name: string;
  description?: string;
  manager_employment_id?: string | null;
  cost_center?: string;
  is_active?: boolean;
  metadata?: Record<string, any>;
}

export interface UpdateDepartmentDTO {
  parent_id?: string | null;
  code?: string;
  name?: string;
  description?: string;
  manager_employment_id?: string | null;
  cost_center?: string;
  is_active?: boolean;
  metadata?: Record<string, any>;
}

class DepartmentsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters?: DepartmentFilters): Promise<Department[]> {
    // Consulta simplificada sin relaciones FK explícitas
    let query = supabase
      .from('departments')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
    }

    if (filters?.isActive !== undefined && filters.isActive !== 'all') {
      query = query.eq('is_active', filters.isActive);
    }

    if (filters?.managerId) {
      query = query.eq('manager_employment_id', filters.managerId);
    }

    if (filters?.parentId === 'root') {
      query = query.is('parent_id', null);
    } else if (filters?.parentId) {
      query = query.eq('parent_id', filters.parentId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching departments:', error);
      throw error;
    }

    // Procesar datos adicionales
    const departments = await Promise.all(
      (data || []).map(async (dept: any) => {
        let managerName: string | null = null;
        let parentName: string | null = null;

        // Obtener nombre del manager
        if (dept.manager_employment_id) {
          const { data: empData } = await supabase
            .from('employments')
            .select('organization_member_id')
            .eq('id', dept.manager_employment_id)
            .single();

          if (empData?.organization_member_id) {
            const { data: memberData } = await supabase
              .from('organization_members')
              .select('user_id')
              .eq('id', empData.organization_member_id)
              .single();

            if (memberData?.user_id) {
              const { data: profileData } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', memberData.user_id)
                .single();

              if (profileData) {
                managerName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || null;
              }
            }
          }
        }

        // Obtener nombre del padre
        if (dept.parent_id) {
          const { data: parentData } = await supabase
            .from('departments')
            .select('name')
            .eq('id', dept.parent_id)
            .single();

          parentName = parentData?.name || null;
        }

        // Contar hijos
        const { count } = await supabase
          .from('departments')
          .select('id', { count: 'exact', head: true })
          .eq('parent_id', dept.id);

        return {
          ...dept,
          manager_name: managerName,
          parent_name: parentName,
          children_count: count || 0,
        };
      })
    );

    return departments;
  }

  async getById(id: string): Promise<Department | null> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching department:', error);
      return null;
    }

    return data;
  }

  buildHierarchy(departments: Department[]): DepartmentWithHierarchy[] {
    const deptMap = new Map<string, DepartmentWithHierarchy>();
    const roots: DepartmentWithHierarchy[] = [];

    // Crear mapa con todos los departamentos
    departments.forEach((dept) => {
      deptMap.set(dept.id, { ...dept, children: [], level: 0 });
    });

    // Construir jerarquía
    departments.forEach((dept) => {
      const node = deptMap.get(dept.id)!;
      if (dept.parent_id && deptMap.has(dept.parent_id)) {
        const parent = deptMap.get(dept.parent_id)!;
        node.level = parent.level + 1;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // Ordenar hijos por nombre
    const sortChildren = (nodes: DepartmentWithHierarchy[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name));
      nodes.forEach((node) => sortChildren(node.children));
    };
    sortChildren(roots);

    return roots;
  }

  async create(dto: CreateDepartmentDTO): Promise<Department> {
    const { data, error } = await supabase
      .from('departments')
      .insert({
        organization_id: this.organizationId,
        parent_id: dto.parent_id || null,
        code: dto.code || null,
        name: dto.name,
        description: dto.description || null,
        manager_employment_id: dto.manager_employment_id || null,
        cost_center: dto.cost_center || null,
        is_active: dto.is_active ?? true,
        metadata: dto.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating department:', error);
      throw error;
    }

    return data;
  }

  async update(id: string, dto: UpdateDepartmentDTO): Promise<Department> {
    const updateData: any = { updated_at: new Date().toISOString() };

    if (dto.parent_id !== undefined) updateData.parent_id = dto.parent_id;
    if (dto.code !== undefined) updateData.code = dto.code;
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.manager_employment_id !== undefined) updateData.manager_employment_id = dto.manager_employment_id;
    if (dto.cost_center !== undefined) updateData.cost_center = dto.cost_center;
    if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
    if (dto.metadata !== undefined) updateData.metadata = dto.metadata;

    const { data, error } = await supabase
      .from('departments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating department:', error);
      throw error;
    }

    return data;
  }

  async duplicate(id: string, newName?: string): Promise<Department> {
    const original = await this.getById(id);
    if (!original) throw new Error('Department not found');

    return this.create({
      organization_id: this.organizationId,
      parent_id: original.parent_id,
      code: original.code ? `${original.code}-COPY` : undefined,
      name: newName || `${original.name} (copia)`,
      description: original.description || undefined,
      manager_employment_id: original.manager_employment_id,
      cost_center: original.cost_center || undefined,
      is_active: original.is_active,
      metadata: original.metadata,
    });
  }

  async toggleActive(id: string): Promise<Department> {
    const dept = await this.getById(id);
    if (!dept) throw new Error('Department not found');

    return this.update(id, { is_active: !dept.is_active });
  }

  async delete(id: string): Promise<void> {
    // Verificar si tiene hijos
    const { count } = await supabase
      .from('departments')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id);

    if (count && count > 0) {
      throw new Error('No se puede eliminar un departamento con sub-departamentos');
    }

    // Verificar si tiene empleados asignados
    const { count: empCount } = await supabase
      .from('employments')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', id);

    if (empCount && empCount > 0) {
      throw new Error('No se puede eliminar un departamento con empleados asignados');
    }

    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting department:', error);
      throw error;
    }
  }

  async getEmploymentsForSelect(): Promise<EmploymentOption[]> {
    // Consulta simplificada sin relaciones FK
    const { data, error } = await supabase
      .from('employments')
      .select('id, employee_code, organization_member_id, position_id, department_id')
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching employments:', error);
      return [];
    }

    const options: EmploymentOption[] = [];

    for (const emp of data || []) {
      let fullName = 'Sin nombre';
      let positionName: string | null = null;
      let departmentName: string | null = null;

      // Obtener nombre del empleado
      if (emp.organization_member_id) {
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('id', emp.organization_member_id)
          .single();

        if (memberData?.user_id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', memberData.user_id)
            .single();

          if (profileData) {
            fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Sin nombre';
          }
        }
      }

      // Obtener nombre del cargo
      if (emp.position_id) {
        const { data: posData } = await supabase
          .from('job_positions')
          .select('name')
          .eq('id', emp.position_id)
          .single();

        positionName = posData?.name || null;
      }

      // Obtener nombre del departamento
      if (emp.department_id) {
        const { data: deptData } = await supabase
          .from('departments')
          .select('name')
          .eq('id', emp.department_id)
          .single();

        departmentName = deptData?.name || null;
      }

      options.push({
        id: emp.id,
        employee_code: emp.employee_code,
        full_name: fullName,
        position_name: positionName,
        department_name: departmentName,
      });
    }

    return options.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  async importFromCSV(rows: CreateDepartmentDTO[]): Promise<{ success: number; errors: string[] }> {
    const errors: string[] = [];
    let success = 0;

    for (let i = 0; i < rows.length; i++) {
      try {
        await this.create({
          ...rows[i],
          organization_id: this.organizationId,
        });
        success++;
      } catch (err: any) {
        errors.push(`Fila ${i + 1}: ${err.message}`);
      }
    }

    return { success, errors };
  }
}

export default DepartmentsService;
