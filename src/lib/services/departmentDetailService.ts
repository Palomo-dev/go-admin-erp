import { supabase } from '@/lib/supabase/config';

export interface DepartmentDetail {
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
  // Computed
  manager_name: string | null;
  parent_name: string | null;
  children: DepartmentChild[];
}

export interface DepartmentChild {
  id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  employee_count: number;
}

export interface DepartmentEmployee {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  position_name: string | null;
  status: string;
  hire_date: string;
  avatar_url: string | null;
}

export interface DepartmentPosition {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  level: string | null;
  min_salary: number | null;
  max_salary: number | null;
  is_active: boolean;
  employee_count: number;
}

export interface DepartmentStats {
  totalEmployees: number;
  activeEmployees: number;
  totalPositions: number;
  avgSalary: number | null;
  pendingLeaves: number;
  pendingTimesheets: number;
}

class DepartmentDetailService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getById(id: string): Promise<DepartmentDetail | null> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error || !data) {
      console.error('Error fetching department:', error);
      return null;
    }

    // Obtener nombre del manager
    let managerName: string | null = null;
    if (data.manager_employment_id) {
      const { data: empData } = await supabase
        .from('employments')
        .select('organization_member_id')
        .eq('id', data.manager_employment_id)
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
    let parentName: string | null = null;
    if (data.parent_id) {
      const { data: parentData } = await supabase
        .from('departments')
        .select('name')
        .eq('id', data.parent_id)
        .single();

      parentName = parentData?.name || null;
    }

    // Obtener hijos
    const { data: childrenData } = await supabase
      .from('departments')
      .select('id, name, code, is_active')
      .eq('parent_id', id)
      .order('name');

    const children: DepartmentChild[] = [];
    for (const child of childrenData || []) {
      const { count } = await supabase
        .from('employments')
        .select('id', { count: 'exact', head: true })
        .eq('department_id', child.id)
        .eq('status', 'active');

      children.push({
        ...child,
        employee_count: count || 0,
      });
    }

    return {
      ...data,
      manager_name: managerName,
      parent_name: parentName,
      children,
    };
  }

  async getEmployees(departmentId: string): Promise<DepartmentEmployee[]> {
    const { data, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        status,
        hire_date,
        organization_member_id,
        position:job_positions(name)
      `)
      .eq('department_id', departmentId)
      .order('hire_date', { ascending: false });

    if (error) {
      console.error('Error fetching employees:', error);
      return [];
    }

    const employees: DepartmentEmployee[] = [];

    for (const emp of data || []) {
      let fullName = 'Sin nombre';
      let email: string | null = null;
      let avatarUrl: string | null = null;

      if (emp.organization_member_id) {
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('id', emp.organization_member_id)
          .single();

        if (memberData?.user_id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name, email, avatar_url')
            .eq('id', memberData.user_id)
            .single();

          if (profileData) {
            fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'Sin nombre';
            email = profileData.email;
            avatarUrl = profileData.avatar_url;
          }
        }
      }

      employees.push({
        id: emp.id,
        employee_code: emp.employee_code,
        full_name: fullName,
        email,
        position_name: (emp.position as any)?.name || null,
        status: emp.status,
        hire_date: emp.hire_date,
        avatar_url: avatarUrl,
      });
    }

    return employees;
  }

  async getPositions(departmentId: string): Promise<DepartmentPosition[]> {
    const { data, error } = await supabase
      .from('job_positions')
      .select('*')
      .eq('department_id', departmentId)
      .eq('organization_id', this.organizationId)
      .order('name');

    if (error) {
      console.error('Error fetching positions:', error);
      return [];
    }

    const positions: DepartmentPosition[] = [];

    for (const pos of data || []) {
      const { count } = await supabase
        .from('employments')
        .select('id', { count: 'exact', head: true })
        .eq('position_id', pos.id)
        .eq('status', 'active');

      positions.push({
        id: pos.id,
        code: pos.code,
        name: pos.name,
        description: pos.description,
        level: pos.level,
        min_salary: pos.min_salary,
        max_salary: pos.max_salary,
        is_active: pos.is_active,
        employee_count: count || 0,
      });
    }

    return positions;
  }

  async getStats(departmentId: string): Promise<DepartmentStats> {
    // Total empleados
    const { count: totalEmployees } = await supabase
      .from('employments')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId);

    // Empleados activos
    const { count: activeEmployees } = await supabase
      .from('employments')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .eq('status', 'active');

    // Total posiciones
    const { count: totalPositions } = await supabase
      .from('job_positions')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', departmentId)
      .eq('organization_id', this.organizationId);

    // Salario promedio
    const { data: salaryData } = await supabase
      .from('employments')
      .select('base_salary')
      .eq('department_id', departmentId)
      .eq('status', 'active')
      .not('base_salary', 'is', null);

    let avgSalary: number | null = null;
    if (salaryData && salaryData.length > 0) {
      const total = salaryData.reduce((sum, e) => sum + (e.base_salary || 0), 0);
      avgSalary = Math.round(total / salaryData.length);
    }

    // Obtener IDs de empleados del departamento
    const { data: empIds } = await supabase
      .from('employments')
      .select('id')
      .eq('department_id', departmentId);

    const employmentIds = (empIds || []).map((e) => e.id);

    // Permisos pendientes
    let pendingLeaves = 0;
    if (employmentIds.length > 0) {
      const { count } = await supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.organizationId)
        .eq('status', 'pending')
        .in('employment_id', employmentIds);
      pendingLeaves = count || 0;
    }

    // Timesheets pendientes
    let pendingTimesheets = 0;
    if (employmentIds.length > 0) {
      const { count } = await supabase
        .from('timesheets')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', this.organizationId)
        .eq('status', 'pending')
        .in('employment_id', employmentIds);
      pendingTimesheets = count || 0;
    }

    return {
      totalEmployees: totalEmployees || 0,
      activeEmployees: activeEmployees || 0,
      totalPositions: totalPositions || 0,
      avgSalary,
      pendingLeaves: pendingLeaves || 0,
      pendingTimesheets: pendingTimesheets || 0,
    };
  }
}

export default DepartmentDetailService;
