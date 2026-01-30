// Tipos para el módulo de cargos de servicio

export type ChargeType = 'percentage' | 'fixed';
export type AppliesTo = 'all' | 'dine_in' | 'delivery' | 'takeout';

export interface ServiceCharge {
  id: number;
  organization_id: number;
  branch_id?: number;
  name: string;
  charge_type: ChargeType;
  charge_value: number;
  min_amount?: number;
  min_guests?: number;
  applies_to: AppliesTo;
  is_taxable: boolean;
  is_optional: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: {
    id: number;
    name: string;
  };
}

export interface CreateServiceChargeData {
  name: string;
  charge_type: ChargeType;
  charge_value: number;
  min_amount?: number;
  min_guests?: number;
  applies_to: AppliesTo;
  is_taxable: boolean;
  is_optional: boolean;
  branch_id?: number;
}

export interface UpdateServiceChargeData extends Partial<CreateServiceChargeData> {
  is_active?: boolean;
}

export interface ServiceChargeFilters {
  is_active?: boolean;
  branch_id?: number;
  applies_to?: AppliesTo;
}

export const CHARGE_TYPE_LABELS: Record<ChargeType, string> = {
  percentage: 'Porcentaje',
  fixed: 'Monto Fijo'
};

export const APPLIES_TO_LABELS: Record<AppliesTo, string> = {
  all: 'Todos',
  dine_in: 'En sitio',
  delivery: 'Domicilio',
  takeout: 'Para llevar'
};
