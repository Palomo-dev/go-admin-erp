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

// Interfaz para el stock por sucursal
export interface StockPorSucursal {
  branch_id: number | null;
  qty_on_hand: number;
  avg_cost: number;
}

export interface VariantCombination {
  id?: number;
  sku: string;
  price: number;
  cost: number;
  stock_quantity: number;
  image?: string;
  attributes: VariantAttribute[];
  stock_por_sucursal?: StockPorSucursal[];
}

// Interfaz para exponer métodos al componente padre
export interface VariantesRef {
  getVariantes: () => Array<VariantCombination>
}

// Props para el componente Variantes
export interface VariantesProps {
  defaultCost?: number;
  defaultPrice?: number;
  defaultSku?: string;
  stockInicial?: Array<{
    branch_id: number;
    qty_on_hand: number;
    avg_cost: number;
  }>;
  productoId?: number; // ID del producto para modo de edición
}
