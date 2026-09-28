// Tipos para el módulo de cargos de servicio

/**
 * Los dos valores de `service_charges_charge_type_check`. El monto fijo es
 * 'fixed_amount' (con 'fixed' el insert chocaba con el CHECK).
 */
export const CHARGE_TYPES = ['percentage', 'fixed_amount'] as const;
export type ChargeType = (typeof CHARGE_TYPES)[number];

export const APPLIES_TO_VALUES = ['all', 'dine_in', 'delivery', 'takeout'] as const;
export type AppliesTo = (typeof APPLIES_TO_VALUES)[number];

export interface ServiceCharge {
  id: number;
  organization_id: number;
  branch_id?: number | null;
  name: string;
  charge_type: ChargeType;
  charge_value: number;
  min_amount?: number | null;
  min_guests?: number | null;
  applies_to: AppliesTo;
  is_taxable: boolean;
  is_optional: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  branch?: {
    id: number;
    name: string;
  } | null;
}

/**
 * `min_amount`, `min_guests` y `branch_id` admiten null: null es «sin mínimo»
 * y «global». Al editar se envía null explícito para poder quitarlos.
 */
export interface CreateServiceChargeData {
  name: string;
  charge_type: ChargeType;
  charge_value: number;
  min_amount?: number | null;
  min_guests?: number | null;
  applies_to: AppliesTo;
  is_taxable: boolean;
  is_optional: boolean;
  branch_id?: number | null;
}

export interface UpdateServiceChargeData extends Partial<CreateServiceChargeData> {
  is_active?: boolean;
}

export interface ServiceChargeFilters {
  is_active?: boolean;
  /** Muestra los cargos de esa sucursal y los globales. */
  branch_id?: number;
  applies_to?: AppliesTo;
}

/**
 * Clave de `posCargosServicio` con la etiqueta de cada tipo de cargo. El texto
 * lo pone el componente con `t()`: aquí no hay español fijo.
 */
export const CHARGE_TYPE_LABELS: Record<ChargeType, `tiposCargo.${ChargeType}`> = {
  percentage: 'tiposCargo.percentage',
  fixed_amount: 'tiposCargo.fixed_amount'
};

/** Clave de `posCargosServicio` con la etiqueta de cada «aplica a». */
export const APPLIES_TO_LABELS: Record<AppliesTo, `aplicaA.${AppliesTo}`> = {
  all: 'aplicaA.all',
  dine_in: 'aplicaA.dine_in',
  delivery: 'aplicaA.delivery',
  takeout: 'aplicaA.takeout'
};
