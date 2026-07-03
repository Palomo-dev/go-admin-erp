import { supabase } from '@/lib/supabase/config';
import { obtenerOrganizacionActiva } from '@/lib/hooks/useOrganization';

export interface FixedAsset {
  id: string;
  organization_id: number;
  code: string;
  name: string;
  description: string | null;
  asset_type: string;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  depreciation_method: string;
  accumulated_depreciation: number;
  current_value: number;
  status: string;
  account_asset_code: string | null;
  account_depreciation_code: string | null;
  account_expense_code: string | null;
  cost_center_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FixedAssetInput {
  code: string;
  name: string;
  description?: string | null;
  asset_type: string;
  acquisition_date: string;
  acquisition_cost: number;
  salvage_value: number;
  useful_life_months: number;
  depreciation_method: string;
  account_asset_code?: string | null;
  account_depreciation_code?: string | null;
  account_expense_code?: string | null;
  cost_center_id?: string | null;
}

export const ASSET_TYPES = [
  { value: 'building', label: 'Edificio' },
  { value: 'vehicle', label: 'Vehiculo' },
  { value: 'equipment', label: 'Equipo' },
  { value: 'furniture', label: 'Mobiliario' },
  { value: 'computer', label: 'Computo' },
  { value: 'software', label: 'Software' },
  { value: 'land', label: 'Terreno' },
  { value: 'other', label: 'Otro' },
];

export const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: 'Linea Recta' },
  { value: 'declining_balance', label: 'Saldo Decreciente' },
  { value: 'units_of_production', label: 'Unidades de Produccion' },
];

export class FixedAssetService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async getAll(): Promise<FixedAsset[]> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('fixed_assets')
      .select('*')
      .eq('organization_id', orgId)
      .order('code');
    if (error) throw error;
    return data || [];
  }

  static async create(input: FixedAssetInput): Promise<FixedAsset> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('fixed_assets')
      .insert({
        ...input,
        organization_id: orgId,
        current_value: input.acquisition_cost,
        accumulated_depreciation: 0,
        status: 'active',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async update(id: string, input: Partial<FixedAssetInput>): Promise<FixedAsset> {
    const { data, error } = await supabase
      .from('fixed_assets')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await supabase.from('fixed_assets').delete().eq('id', id);
    if (error) throw error;
  }

  static calculateMonthlyDepreciation(asset: FixedAsset): number {
    if (asset.depreciation_method !== 'straight_line') return 0;
    const depreciableAmount = asset.acquisition_cost - asset.salvage_value;
    if (asset.useful_life_months <= 0) return 0;
    return depreciableAmount / asset.useful_life_months;
  }
}
