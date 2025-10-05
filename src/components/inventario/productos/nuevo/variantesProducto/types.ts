// Tipos e interfaces para el sistema de variantes

export interface VariantValue {
  id: number;
  value: string;
  display_order: number;
}

export interface VariantType {
  id: number;
  name: string;
  organization_id?: number;
  variant_values?: VariantValue[];
  values: Array<{
    id: number;
    value: string;
    selected: boolean;
  }>; // Versión procesada para la UI
  selectedValues?: number[]; // IDs de valores seleccionados
}

export interface EditingValueState {
  index: number;
  id: number;
  value: string;
}

export interface VariantAttribute {
  typeId: number;
  typeName: string;
  valueId: number;
  value: string;
}

// Interfaz para el stock por sucursal
export interface StockPorSucursal {
  branch_id: number | null;
  qty_on_hand: number;
  avg_cost: number;
}

export interface VariantCombination {
  id?: string;
  sku: string;
  price: number;
  cost: number;
  image?: string;
  attributes: VariantAttribute[];
  stock: Array<{
    branch_id: number;
    qty_on_hand: number;
    avg_cost: number;
  }>;
}

// Interfaz para exponer métodos al componente padre
export interface VariantesRef {
  getVariantes: () => Array<VariantCombination>;
  guardarVariantesEnBD: (parentProductId: number) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
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
