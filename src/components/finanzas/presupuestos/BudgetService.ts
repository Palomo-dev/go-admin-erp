import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

export interface Budget {
  id: string;
  organization_id: number;
  name: string;
  fiscal_year: number;
  status: string;
  total_amount: number;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetLine {
  id: string;
  budget_id: string;
  organization_id: number;
  account_code: string;
  period: number;
  planned_amount: number;
  actual_amount: number;
  variance: number;
  cost_center_id: string | null;
}

export interface BudgetInput {
  name: string;
  fiscal_year: number;
}

export interface BudgetLineInput {
  account_code: string;
  period: number;
  planned_amount: number;
  cost_center_id?: string | null;
}

export class BudgetService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async getAll(): Promise<Budget[]> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('organization_id', orgId)
      .order('fiscal_year', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  static async create(input: BudgetInput): Promise<Budget> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('budgets')
      .insert({ ...input, organization_id: orgId, status: 'draft' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async update(id: string, input: Partial<BudgetInput>): Promise<Budget> {
    const { data, error } = await supabase
      .from('budgets')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await supabase.from('budgets').delete().eq('id', id);
    if (error) throw error;
  }

  static async getLines(budgetId: string): Promise<BudgetLine[]> {
    const { data, error } = await supabase
      .from('budget_lines')
      .select('*')
      .eq('budget_id', budgetId)
      .order('account_code')
      .order('period');
    if (error) throw error;
    return data || [];
  }

  static async upsertLine(budgetId: string, input: BudgetLineInput): Promise<BudgetLine> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('budget_lines')
      .upsert({
        budget_id: budgetId,
        organization_id: orgId,
        account_code: input.account_code,
        period: input.period,
        planned_amount: input.planned_amount,
        cost_center_id: input.cost_center_id || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async deleteLine(id: string): Promise<void> {
    const { error } = await supabase.from('budget_lines').delete().eq('id', id);
    if (error) throw error;
  }
}
