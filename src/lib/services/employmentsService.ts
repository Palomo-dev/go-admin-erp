import { createSupabaseClient } from '@/lib/supabase/config';

const createClient = () => createSupabaseClient();

export interface Employment {
  id: string;
  organization_member_id: number;
  employee_code: string | null;
  status: string;
  hire_date: string;
  probation_end_date: string | null;
  termination_date: string | null;
  termination_reason: string | null;
  termination_type: string | null;
  employment_type: string;
  contract_type: string | null;
  contract_end_date: string | null;
  position_id: string | null;
  department_id: string | null;
  manager_id: string | null;
  branch_id: number | null;
  base_salary: number | null;
  salary_period: string;
  currency_code: string;
  work_location: string | null;
  work_hours_per_week: number;
  eps_code: string | null;
  afp_code: string | null;
  arl_code: string | null;
  arl_risk_level: number | null;
  severance_fund_code: string | null;
  bank_name: string | null;
  bank_account_type: string | null;
  bank_account_number: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Relaciones expandidas
  position_name?: string;
  department_name?: string;
  branch_name?: string;
  manager_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  avatar_url?: string;
  user_id?: string;
}

export interface EmploymentListItem {
  id: string;
  employee_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  status: string;
  employment_type: string;
  contract_type: string | null;
  hire_date: string;
  position_name: string | null;
  department_name: string | null;
  branch_name: string | null;
  manager_name: string | null;
  base_salary: number | null;
  currency_code: string;
}

export interface EmploymentFilters {
  search?: string;
  status?: string;
  branchId?: number;
  departmentId?: string;
  positionId?: string;
  contractType?: string;
  hireDateFrom?: string;
  hireDateTo?: string;
}

export interface CreateEmploymentDTO {
  organization_member_id: number;
  employee_code?: string;
  status?: string;
  hire_date: string;
  probation_end_date?: string;
  employment_type?: string;
  contract_type?: string;
  contract_end_date?: string;
  position_id?: string;
  department_id?: string;
  manager_id?: string;
  branch_id?: number;
  base_salary?: number;
  salary_period?: string;
  currency_code?: string;
  work_location?: string;
  work_hours_per_week?: number;
  eps_code?: string;
  afp_code?: string;
  arl_code?: string;
  arl_risk_level?: number;
  severance_fund_code?: string;
  bank_name?: string;
  bank_account_type?: string;
  bank_account_number?: string;
  metadata?: Record<string, any>;
}

export interface UpdateEmploymentDTO {
  employee_code?: string;
  status?: string;
  hire_date?: string;
  probation_end_date?: string | null;
  termination_date?: string | null;
  termination_reason?: string | null;
  termination_type?: string | null;
  employment_type?: string;
  contract_type?: string | null;
  contract_end_date?: string | null;
  position_id?: string | null;
  department_id?: string | null;
  manager_id?: string | null;
  branch_id?: number | null;
  base_salary?: number | null;
  salary_period?: string;
  currency_code?: string;
  work_location?: string | null;
  work_hours_per_week?: number;
  eps_code?: string | null;
  afp_code?: string | null;
  arl_code?: string | null;
  arl_risk_level?: number | null;
  severance_fund_code?: string | null;
  bank_name?: string | null;
  bank_account_type?: string | null;
  bank_account_number?: string | null;
  metadata?: Record<string, any>;
}

export interface OrganizationMemberOption {
  id: number;
  user_id: string;
  full_name: string;
  email: string;
  has_employment: boolean;
}

export interface BranchOption {
  id: number;
  name: string;
}

export interface DepartmentOption {
  id: string;
  name: string;
}

export interface PositionOption {
  id: string;
  name: string;
}

export interface ManagerOption {
  id: string;
  full_name: string;
  position_name: string | null;
}

export class EmploymentsService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters?: EmploymentFilters): Promise<EmploymentListItem[]> {
    const supabase = await createClient();

    // Obtener employments con organization_members
    const { data: employments, error } = await supabase
      .from('employments')
      .select(`
        id,
        employee_code,
        status,
        employment_type,
        contract_type,
        hire_date,
        position_id,
        department_id,
        branch_id,
        manager_id,
        base_salary,
        currency_code,
        organization_member_id
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;
    if (!employments || employments.length === 0) return [];

    // Obtener organization_members de esta organización
    const memberIds = employments.map((e) => e.organization_member_id);
    const { data: members, error: membersError } = await supabase
      .from('organization_members')
      .select('id, user_id, organization_id')
      .eq('organization_id', this.organizationId)
      .in('id', memberIds);

    if (membersError) throw membersError;

    // Filtrar employments por organización
    const validMemberIds = new Set((members || []).map((m) => m.id));
    const filteredEmployments = employments.filter((e) =>
      validMemberIds.has(e.organization_member_id)
    );

    if (filteredEmployments.length === 0) return [];

    // Obtener user_ids para profiles
    const memberMap = new Map((members || []).map((m) => [m.id, m.user_id]));
    const userIds = Array.from(new Set(
      filteredEmployments.map((e) => memberMap.get(e.organization_member_id)).filter(Boolean)
    )) as string[];

    // Obtener profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .in('id', userIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [
        p.id,
        {
          full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
          email: p.email,
          phone: p.phone,
          avatar_url: p.avatar_url,
        },
      ])
    );

    // Obtener departments, positions, branches, managers
    const deptIds = Array.from(new Set(filteredEmployments.map((e) => e.department_id).filter(Boolean))) as string[];
    const posIds = Array.from(new Set(filteredEmployments.map((e) => e.position_id).filter(Boolean))) as string[];
    const branchIds = Array.from(new Set(filteredEmployments.map((e) => e.branch_id).filter(Boolean))) as number[];
    const managerIds = Array.from(new Set(filteredEmployments.map((e) => e.manager_id).filter(Boolean))) as string[];

    const [depts, positions, branches, managers] = await Promise.all([
      deptIds.length > 0
        ? supabase.from('departments').select('id, name').in('id', deptIds)
        : { data: [] },
      posIds.length > 0
        ? supabase.from('job_positions').select('id, name').in('id', posIds)
        : { data: [] },
      branchIds.length > 0
        ? supabase.from('branches').select('id, name').in('id', branchIds)
        : { data: [] },
      managerIds.length > 0
        ? this.getManagerNames(managerIds)
        : [],
    ]);

    const deptMap = new Map((depts.data || []).map((d: any) => [d.id, d.name]));
    const posMap = new Map((positions.data || []).map((p: any) => [p.id, p.name]));
    const branchMap = new Map((branches.data || []).map((b: any) => [b.id, b.name]));
    const managerMap = new Map((managers || []).map((m: any) => [m.id, m.full_name]));

    // Combinar datos
    let result: EmploymentListItem[] = filteredEmployments.map((e) => {
      const userId = memberMap.get(e.organization_member_id);
      const profile = userId ? profileMap.get(userId) : null;

      return {
        id: e.id,
        employee_code: e.employee_code,
        full_name: profile?.full_name || 'Sin nombre',
        email: profile?.email || null,
        phone: profile?.phone || null,
        avatar_url: profile?.avatar_url || null,
        status: e.status || 'active',
        employment_type: e.employment_type || 'employee',
        contract_type: e.contract_type,
        hire_date: e.hire_date,
        position_name: e.position_id ? posMap.get(e.position_id) || null : null,
        department_name: e.department_id ? deptMap.get(e.department_id) || null : null,
        branch_name: e.branch_id ? branchMap.get(e.branch_id) || null : null,
        manager_name: e.manager_id ? managerMap.get(e.manager_id) || null : null,
        base_salary: e.base_salary,
        currency_code: e.currency_code || 'COP',
      };
    });

    // Aplicar filtros
    if (filters) {
      if (filters.search) {
        const search = filters.search.toLowerCase();
        result = result.filter(
          (e) =>
            e.full_name.toLowerCase().includes(search) ||
            e.email?.toLowerCase().includes(search) ||
            e.employee_code?.toLowerCase().includes(search)
        );
      }
      if (filters.status && filters.status !== 'all') {
        result = result.filter((e) => e.status === filters.status);
      }
      if (filters.branchId) {
        result = result.filter((e) => {
          const emp = filteredEmployments.find((fe) => fe.id === e.id);
          return emp?.branch_id === filters.branchId;
        });
      }
      if (filters.departmentId) {
        result = result.filter((e) => {
          const emp = filteredEmployments.find((fe) => fe.id === e.id);
          return emp?.department_id === filters.departmentId;
        });
      }
      if (filters.positionId) {
        result = result.filter((e) => {
          const emp = filteredEmployments.find((fe) => fe.id === e.id);
          return emp?.position_id === filters.positionId;
        });
      }
      if (filters.contractType && filters.contractType !== 'all') {
        result = result.filter((e) => e.contract_type === filters.contractType);
      }
      if (filters.hireDateFrom) {
        result = result.filter((e) => e.hire_date >= filters.hireDateFrom!);
      }
      if (filters.hireDateTo) {
        result = result.filter((e) => e.hire_date <= filters.hireDateTo!);
      }
    }

    return result;
  }

  private async getManagerNames(managerIds: string[]): Promise<{ id: string; full_name: string }[]> {
    const supabase = await createClient();

    // Los managers son employments, obtener sus datos
    const { data: managerEmployments } = await supabase
      .from('employments')
      .select('id, organization_member_id')
      .in('id', managerIds);

    if (!managerEmployments || managerEmployments.length === 0) return [];

    const memberIds = managerEmployments.map((m) => m.organization_member_id);
    const { data: members } = await supabase
      .from('organization_members')
      .select('id, user_id')
      .in('id', memberIds);

    if (!members || members.length === 0) return [];

    const userIds = members.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    const memberUserMap = new Map(members.map((m) => [m.id, m.user_id]));
    const profileMap = new Map(
      (profiles || []).map((p) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email])
    );

    return managerEmployments.map((me) => {
      const userId = memberUserMap.get(me.organization_member_id);
      return {
        id: me.id,
        full_name: userId ? profileMap.get(userId) || 'Sin nombre' : 'Sin nombre',
      };
    });
  }

  async getById(id: string): Promise<Employment | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('employments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }

    // Obtener datos relacionados
    const { data: member } = await supabase
      .from('organization_members')
      .select('id, user_id, organization_id')
      .eq('id', data.organization_member_id)
      .single();

    if (!member || member.organization_id !== this.organizationId) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, phone, avatar_url')
      .eq('id', member.user_id)
      .single();

    // Obtener nombres de relaciones
    const [dept, pos, branch, manager] = await Promise.all([
      data.department_id
        ? supabase.from('departments').select('name').eq('id', data.department_id).single()
        : null,
      data.position_id
        ? supabase.from('job_positions').select('name').eq('id', data.position_id).single()
        : null,
      data.branch_id
        ? supabase.from('branches').select('name').eq('id', data.branch_id).single()
        : null,
      data.manager_id
        ? this.getManagerNames([data.manager_id])
        : null,
    ]);

    return {
      ...data,
      full_name: profile
        ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email
        : 'Sin nombre',
      email: profile?.email,
      phone: profile?.phone,
      avatar_url: profile?.avatar_url,
      user_id: member.user_id,
      department_name: dept?.data?.name,
      position_name: pos?.data?.name,
      branch_name: branch?.data?.name,
      manager_name: manager && manager.length > 0 ? manager[0].full_name : null,
    };
  }

  async create(dto: CreateEmploymentDTO): Promise<Employment> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('employments')
      .insert({
        organization_member_id: dto.organization_member_id,
        employee_code: dto.employee_code,
        status: dto.status || 'active',
        hire_date: dto.hire_date,
        probation_end_date: dto.probation_end_date,
        employment_type: dto.employment_type || 'employee',
        contract_type: dto.contract_type,
        contract_end_date: dto.contract_end_date,
        position_id: dto.position_id,
        department_id: dto.department_id,
        manager_id: dto.manager_id,
        branch_id: dto.branch_id,
        base_salary: dto.base_salary,
        salary_period: dto.salary_period || 'monthly',
        currency_code: dto.currency_code || 'COP',
        work_location: dto.work_location,
        work_hours_per_week: dto.work_hours_per_week || 48,
        eps_code: dto.eps_code,
        afp_code: dto.afp_code,
        arl_code: dto.arl_code,
        arl_risk_level: dto.arl_risk_level,
        severance_fund_code: dto.severance_fund_code,
        bank_name: dto.bank_name,
        bank_account_type: dto.bank_account_type,
        bank_account_number: dto.bank_account_number,
        metadata: dto.metadata || {},
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, dto: UpdateEmploymentDTO): Promise<Employment> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('employments')
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

  async updateStatus(id: string, status: string, options?: {
    terminationDate?: string;
    terminationReason?: string;
    terminationType?: string;
  }): Promise<Employment> {
    const supabase = await createClient();

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'terminated' && options) {
      updateData.termination_date = options.terminationDate || new Date().toISOString().split('T')[0];
      updateData.termination_reason = options.terminationReason;
      updateData.termination_type = options.terminationType;
    }

    const { data, error } = await supabase
      .from('employments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async duplicate(id: string, newMemberId: number): Promise<Employment> {
    const supabase = await createClient();

    const { data: original, error: fetchError } = await supabase
      .from('employments')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    const { id: _, organization_member_id: __, employee_code: ___, created_at: ____, updated_at: _____, ...rest } = original;

    const { data, error } = await supabase
      .from('employments')
      .insert({
        ...rest,
        organization_member_id: newMemberId,
        employee_code: null, // Debe asignarse nuevo código
        status: 'active',
        hire_date: new Date().toISOString().split('T')[0],
        termination_date: null,
        termination_reason: null,
        termination_type: null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from('employments')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async validateEmployeeCode(code: string, excludeId?: string): Promise<boolean> {
    const supabase = await createClient();

    let query = supabase
      .from('employments')
      .select('id')
      .eq('employee_code', code);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data } = await query;
    return !data || data.length === 0;
  }

  // Opciones para selectores

  async getOrganizationMembers(): Promise<OrganizationMemberOption[]> {
    const supabase = await createClient();

    const { data: members, error } = await supabase
      .from('organization_members')
      .select('id, user_id')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true);

    if (error) throw error;
    if (!members || members.length === 0) return [];

    // Obtener employments existentes
    const memberIds = members.map((m) => m.id);
    const { data: employments } = await supabase
      .from('employments')
      .select('organization_member_id')
      .in('organization_member_id', memberIds);

    const employedMemberIds = new Set((employments || []).map((e) => e.organization_member_id));

    // Obtener profiles
    const userIds = members.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [
        p.id,
        {
          full_name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
          email: p.email,
        },
      ])
    );

    return members.map((m) => {
      const profile = profileMap.get(m.user_id);
      return {
        id: m.id,
        user_id: m.user_id,
        full_name: profile?.full_name || 'Sin nombre',
        email: profile?.email || '',
        has_employment: employedMemberIds.has(m.id),
      };
    });
  }

  async getBranches(): Promise<BranchOption[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getDepartments(): Promise<DepartmentOption[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getPositions(): Promise<PositionOption[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('job_positions')
      .select('id, name')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getManagers(): Promise<ManagerOption[]> {
    const supabase = await createClient();

    // Obtener employments activos de esta organización que pueden ser managers
    const { data: employments, error } = await supabase
      .from('employments')
      .select('id, organization_member_id, position_id')
      .eq('status', 'active');

    if (error) throw error;
    if (!employments || employments.length === 0) return [];

    // Filtrar por organización
    const memberIds = employments.map((e) => e.organization_member_id);
    const { data: members } = await supabase
      .from('organization_members')
      .select('id, user_id')
      .eq('organization_id', this.organizationId)
      .in('id', memberIds);

    if (!members || members.length === 0) return [];

    const validMemberIds = new Set(members.map((m) => m.id));
    const validEmployments = employments.filter((e) => validMemberIds.has(e.organization_member_id));

    // Obtener profiles
    const userIds = members.map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', userIds);

    const memberUserMap = new Map(members.map((m) => [m.id, m.user_id]));
    const profileMap = new Map(
      (profiles || []).map((p) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email])
    );

    // Obtener positions
    const posIds = Array.from(new Set(validEmployments.map((e) => e.position_id).filter(Boolean))) as string[];
    const { data: positions } = posIds.length > 0
      ? await supabase.from('job_positions').select('id, name').in('id', posIds)
      : { data: [] };

    const posMap = new Map((positions || []).map((p: any) => [p.id, p.name]));

    return validEmployments.map((e) => {
      const userId = memberUserMap.get(e.organization_member_id);
      return {
        id: e.id,
        full_name: userId ? profileMap.get(userId) || 'Sin nombre' : 'Sin nombre',
        position_name: e.position_id ? posMap.get(e.position_id) || null : null,
      };
    });
  }

  // Estadísticas
  async getStats(): Promise<{
    total: number;
    active: number;
    probation: number;
    suspended: number;
    terminated: number;
  }> {
    const all = await this.getAll();

    return {
      total: all.length,
      active: all.filter((e) => e.status === 'active').length,
      probation: all.filter((e) => e.status === 'probation').length,
      suspended: all.filter((e) => e.status === 'suspended').length,
      terminated: all.filter((e) => e.status === 'terminated').length,
    };
  }

  // Importación masiva
  async importEmployments(data: CreateEmploymentDTO[]): Promise<{
    success: number;
    errors: { row: number; message: string }[];
  }> {
    const result = { success: 0, errors: [] as { row: number; message: string }[] };

    for (let i = 0; i < data.length; i++) {
      try {
        await this.create(data[i]);
        result.success++;
      } catch (error: any) {
        result.errors.push({
          row: i + 1,
          message: error.message || 'Error desconocido',
        });
      }
    }

    return result;
  }
}

export default EmploymentsService;
