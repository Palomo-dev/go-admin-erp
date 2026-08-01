/**
 * Tipo unificado de producto para el diálogo de búsqueda compartido
 * entre facturas de venta y compra.
 */
export type UnifiedProduct = {
  id: number;
  name: string;
  sku: string;
  description?: string;
  /** Precio de venta (modo sale) */
  price: number;
  /** Costo de compra (modo purchase) */
  cost: number;
  // Impuestos
  tax_code?: string;
  tax_name?: string;
  tax_rate?: number;
  // Inventario (solo modo sale)
  track_stock?: boolean;
  stock_qty?: number;
  is_out_of_stock?: boolean;
  // Variantes y modificadores
  is_parent?: boolean;
  has_variants?: boolean;
  variant_count?: number;
  has_modifiers?: boolean;
};

/** Modo de uso del diálogo de búsqueda */
export type ProductSearchMode = 'sale' | 'purchase';

/** Modificador seleccionado desde el VariantSelectorDialog */
export interface SelectedModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}
