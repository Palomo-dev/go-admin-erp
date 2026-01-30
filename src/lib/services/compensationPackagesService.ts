'use client';

import { supabase } from '@/lib/supabase/config';

export interface CompensationPackage {
  id: string;
  organization_id: number;
  code: string | null;
  name: string;
  description: string | null;
  currency_code: string;
  base_salary: number | null;
  salary_period: string | null;
  applicable_levels: string[] | null;
  applicable_positions: string[] | null;
  is_active: boolean;
  valid_from: string | null;
  valid_to: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
  updated_at: string;
  // Computed fields
  components_count?: number;
  assignments_count?: number;
}

export interface CompensationComponent {
  id: string;
  package_id: string;
  component_type: string;
  code: string;
  name: string;
  description: string | null;
  amount: number | null;
  amount_type: string | null;
  percentage_of: string | null;
  formula: string | null;
  frequency: string | null;
  is_taxable: boolean;
  affects_social_security: boolean;
  conditions: Record<string, any> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePackageDTO {
  code?: string;
  name: string;
  description?: string;
  currency_code: string;
  base_salary?: number;
  salary_period?: string;
  applicable_levels?: string[];
  applicable_positions?: string[];
  valid_from?: string;
  valid_to?: string;
  is_active?: boolean;
}

export interface UpdatePackageDTO extends Partial<CreatePackageDTO> {}

export interface CreateComponentDTO {
  package_id: string;
  component_type: string;
  code: string;
  name: string;
  description?: string;
  amount?: number;
  amount_type?: string;
  percentage_of?: string;
  formula?: string;
  frequency?: string;
  is_taxable?: boolean;
  affects_social_security?: boolean;
  conditions?: Record<string, any>;
  is_active?: boolean;
}

export interface UpdateComponentDTO extends Partial<Omit<CreateComponentDTO, 'package_id'>> {}

export interface PackageFilters {
  search?: string;
  is_active?: boolean;
  currency_code?: string;
}

class CompensationPackagesService {
  private organizationId: number;

  constructor(organizationId: number) {
    this.organizationId = organizationId;
  }

  async getAll(filters?: PackageFilters): Promise<CompensationPackage[]> {
    let query = supabase
      .from('compensation_packages')
      .select('*')
      .eq('organization_id', this.organizationId)
      .order('name');

    if (filters?.search) {
      query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%`);
    }

    if (filters?.is_active !== undefined) {
      query = query.eq('is_active', filters.is_active);
    }

    if (filters?.currency_code) {
      query = query.eq('currency_code', filters.currency_code);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  }

  async getById(id: string): Promise<CompensationPackage | null> {
    const { data, error } = await supabase
      .from('compensation_packages')
      .select('*')
      .eq('id', id)
      .eq('organization_id', this.organizationId)
      .single();

    if (error) throw error;
    return data;
  }

  async create(dto: CreatePackageDTO): Promise<CompensationPackage> {
    const { data, error } = await supabase
      .from('compensation_packages')
      .insert({
        ...dto,
        organization_id: this.organizationId,
        is_active: dto.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, dto: UpdatePackageDTO): Promise<CompensationPackage> {
    const { data, error } = await supabase
      .from('compensation_packages')
      .update({
        ...dto,
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
    const { error } = await supabase
      .from('compensation_packages')
      .delete()
      .eq('id', id)
      .eq('organization_id', this.organizationId);

    if (error) throw error;
  }

  async toggleActive(id: string, is_active: boolean): Promise<CompensationPackage> {
    return this.update(id, { is_active });
  }

  async duplicate(id: string, newName: string): Promise<CompensationPackage> {
    const original = await this.getById(id);
    if (!original) throw new Error('Paquete no encontrado');

    const newPackage = await this.create({
      code: original.code ? `${original.code}_COPY` : undefined,
      name: newName,
      description: original.description || undefined,
      currency_code: original.currency_code,
      base_salary: original.base_salary || undefined,
      salary_period: original.salary_period || undefined,
      applicable_levels: original.applicable_levels || undefined,
      applicable_positions: original.applicable_positions || undefined,
      valid_from: original.valid_from || undefined,
      valid_to: original.valid_to || undefined,
      is_active: false,
    });

    // Also duplicate components
    const components = await this.getComponents(id);
    for (const comp of components) {
      await this.createComponent({
        package_id: newPackage.id,
        component_type: comp.component_type,
        code: comp.code,
        name: comp.name,
        description: comp.description || undefined,
        amount: comp.amount || undefined,
        amount_type: comp.amount_type || undefined,
        percentage_of: comp.percentage_of || undefined,
        formula: comp.formula || undefined,
        frequency: comp.frequency || undefined,
        is_taxable: comp.is_taxable,
        affects_social_security: comp.affects_social_security,
        conditions: comp.conditions || undefined,
        is_active: comp.is_active,
      });
    }

    return newPackage;
  }

  // Components methods
  async getComponents(packageId: string): Promise<CompensationComponent[]> {
    const { data, error } = await supabase
      .from('compensation_components')
      .select('*')
      .eq('package_id', packageId)
      .order('component_type')
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getComponentById(componentId: string): Promise<CompensationComponent | null> {
    const { data, error } = await supabase
      .from('compensation_components')
      .select('*')
      .eq('id', componentId)
      .single();

    if (error) throw error;
    return data;
  }

  async createComponent(dto: CreateComponentDTO): Promise<CompensationComponent> {
    const { data, error } = await supabase
      .from('compensation_components')
      .insert({
        ...dto,
        is_taxable: dto.is_taxable ?? true,
        affects_social_security: dto.affects_social_security ?? true,
        is_active: dto.is_active ?? true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateComponent(componentId: string, dto: UpdateComponentDTO): Promise<CompensationComponent> {
    const { data, error } = await supabase
      .from('compensation_components')
      .update({
        ...dto,
        updated_at: new Date().toISOString(),
      })
      .eq('id', componentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteComponent(componentId: string): Promise<void> {
    const { error } = await supabase
      .from('compensation_components')
      .delete()
      .eq('id', componentId);

    if (error) throw error;
  }

  async toggleComponentActive(componentId: string, is_active: boolean): Promise<CompensationComponent> {
    return this.updateComponent(componentId, { is_active });
  }

  // Stats
  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    avgSalary: number;
  }> {
    const packages = await this.getAll();
    const active = packages.filter(p => p.is_active).length;
    const salaries = packages.filter(p => p.base_salary).map(p => p.base_salary!);
    const avgSalary = salaries.length > 0 ? salaries.reduce((a, b) => a + b, 0) / salaries.length : 0;

    return {
      total: packages.length,
      active,
      inactive: packages.length - active,
      avgSalary,
    };
  }

  // Helper methods
  async getJobPositions(): Promise<{ id: string; name: string; level: string | null }[]> {
    const { data, error } = await supabase
      .from('job_positions')
      .select('id, name, level')
      .eq('organization_id', this.organizationId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  }

  async getCurrencies(): Promise<string[]> {
    return ['COP', 'USD', 'EUR', 'MXN'];
  }

  async getSalaryPeriods(): Promise<{ value: string; label: string }[]> {
    return [
      { value: 'hourly', label: 'Por hora' },
      { value: 'daily', label: 'Diario' },
      { value: 'weekly', label: 'Semanal' },
      { value: 'biweekly', label: 'Quincenal' },
      { value: 'monthly', label: 'Mensual' },
      { value: 'yearly', label: 'Anual' },
    ];
  }

  getComponentTypes(): { value: string; label: string }[] {
    return [
      { value: 'salary', label: 'Salario Base' },
      { value: 'bonus', label: 'Bonificación' },
      { value: 'commission', label: 'Comisión' },
      { value: 'allowance', label: 'Subsidio' },
      { value: 'deduction', label: 'Deducción' },
      { value: 'benefit', label: 'Beneficio' },
      { value: 'other', label: 'Otro' },
    ];
  }

  getAmountTypes(): { value: string; label: string }[] {
    return [
      { value: 'fixed', label: 'Monto fijo' },
      { value: 'percentage', label: 'Porcentaje' },
      { value: 'formula', label: 'Fórmula' },
    ];
  }

  getFrequencies(): { value: string; label: string }[] {
    return [
      { value: 'monthly', label: 'Mensual' },
      { value: 'biweekly', label: 'Quincenal' },
      { value: 'weekly', label: 'Semanal' },
      { value: 'quarterly', label: 'Trimestral' },
      { value: 'yearly', label: 'Anual' },
      { value: 'one_time', label: 'Único' },
    ];
  }
}

export default CompensationPackagesService;
