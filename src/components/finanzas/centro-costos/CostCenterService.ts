import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

export interface CostCenter {
  id: string;
  organization_id: number;
  code: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostCenterInput {
  code: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
}

export class CostCenterService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async getAll(): Promise<CostCenter[]> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('cost_centers')
      .select('*')
      .eq('organization_id', orgId)
      .order('code');
    if (error) throw error;
    return data || [];
  }

  static async create(input: CostCenterInput): Promise<CostCenter> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('cost_centers')
      .insert({ ...input, organization_id: orgId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async update(id: string, input: Partial<CostCenterInput>): Promise<CostCenter> {
    const { data, error } = await supabase
      .from('cost_centers')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await supabase.from('cost_centers').delete().eq('id', id);
    if (error) throw error;
  }
}
