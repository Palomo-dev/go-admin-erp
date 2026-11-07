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
  /**
   * Meses contabilizados en `asset_depreciations`. Con uno solo, la base no deja cambiar
   * fecha, costo, residual, vida útil ni método (`fn_trg_activo_con_depreciacion`).
   */
  depreciaciones?: number;
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

export const TIPOS_ACTIVO = ['building', 'vehicle', 'equipment', 'furniture', 'computer', 'software', 'land', 'other'] as const;

/** Único método con cálculo verificado. Los demás no se ofrecen: el servidor los rechaza. */
export const METODO_DEPRECIACION = 'straight_line';

/** Por qué un activo no se deprecia (`fn_depreciacion_bloqueo`) o por qué falló su asiento. */
export type MotivoPendiente =
  | 'metodo_no_disponible'
  | 'faltan_cuentas'
  | 'cuenta_no_es_de_movimiento'
  | 'acumulada_sin_detalle'
  | 'period_closed'
  | string;

export interface PendienteDepreciacion {
  activo_id: string;
  codigo?: string;
  mes?: string;
  motivo: MotivoPendiente;
}

export interface ResultadoDepreciacion {
  mes: string;
  asientos: number;
  total: number;
  ya_depreciados: number;
  terminados: number;
  pendientes: PendienteDepreciacion[];
}

export interface EstadoDepreciacion {
  hoy: string;
  ultimo_mes: string | null;
  bloqueos: { activo_id: string; motivo: MotivoPendiente }[];
}

export class FixedAssetService {
  private static getOrganizationId(): number {
    const org = obtenerOrganizacionActiva();
    return org?.id || 0;
  }

  static async getAll(): Promise<FixedAsset[]> {
    const orgId = this.getOrganizationId();
    const { data, error } = await supabase
      .from('fixed_assets')
      .select('*, depreciaciones:asset_depreciations(count)')
      .eq('organization_id', orgId)
      .order('code');
    if (error) throw error;
    return ((data ?? []) as (Omit<FixedAsset, 'depreciaciones'> & { depreciaciones?: { count: number }[] | null })[]).map((fila) => ({
      ...fila,
      depreciaciones: Number(fila.depreciaciones?.[0]?.count ?? 0),
    }));
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

  static async estado(): Promise<EstadoDepreciacion> {
    const { data, error } = await supabase.rpc('fn_depreciacion_estado', {
      p_organization_id: this.getOrganizationId(),
    });
    if (error) throw error;
    return data as EstadoDepreciacion;
  }

  /** Contabiliza el mes y los meses atrasados. Repetirlo no duplica. `mes`: `YYYY-MM-DD`. */
  static async depreciarMes(mes: string): Promise<ResultadoDepreciacion> {
    const { data, error } = await supabase.rpc('fn_depreciar_mes', {
      p_organization_id: this.getOrganizationId(),
      p_mes: mes,
    });
    if (error) throw error;
    return data as ResultadoDepreciacion;
  }

  /**
   * Cuota mensual en línea recta. `null` si el método no tiene cálculo: nunca un 0, que se
   * leería como «no se deprecia».
   */
  static calculateMonthlyDepreciation(asset: Pick<FixedAsset, 'depreciation_method' | 'acquisition_cost' | 'salvage_value' | 'useful_life_months'>): number | null {
    if (asset.depreciation_method !== METODO_DEPRECIACION || asset.useful_life_months <= 0) return null;
    return (asset.acquisition_cost - asset.salvage_value) / asset.useful_life_months;
  }
}
