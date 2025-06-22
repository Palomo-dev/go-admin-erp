// Tipos e interfaces para el sistema de variantes

export interface VariantValue {
  id: number;
  value: string;
  display_order: number;
}

export interface VariantType {
  id: number;
  name: string;
  organization_id: number;
  variant_values: VariantValue[];
  values?: VariantValue[]; // Versión procesada para la UI
  selectedValues?: number[]; // IDs de valores seleccionados
}

export interface EditingValueState {
  index: number;
  id: number;
  value: string;
}

export interface VariantAttribute {
  type_id: number;
  type_name: string;
  value_id: number;
  value: string;
}

export interface VariantCombination {
  id?: number;
  sku: string;
  price: number;
  cost: number;
  stock_quantity: number;
  image?: string;
  attributes: VariantAttribute[];
}

// Interfaz para exponer métodos al componente padre
export interface VariantesRef {
  getVariantes: () => Array<VariantCombination>
}
