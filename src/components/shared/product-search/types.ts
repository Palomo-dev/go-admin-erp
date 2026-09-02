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
  // Tracking de seriales
  track_serial?: boolean;
  // Variantes y modificadores
  is_parent?: boolean;
  has_variants?: boolean;
  variant_count?: number;
  has_modifiers?: boolean;
  // Favorito de la organización y ranking de ventas (últimos 90 días)
  is_favorite?: boolean;
  sales_count_90d?: number;
  /**
   * Términos de búsqueda adicionales concatenados (SKUs/nombres de variantes
   * hijas, nombres de grupos y opciones de modificadores). Permite que al
   * buscar un SKU de variante o el nombre de un modificador, el producto padre
   * aparezca en los resultados del filtro client-side.
   */
  search_terms?: string;
  // Receta vinculada (activa) para mostrar badge/botón de "ver receta"
  has_recipe?: boolean;
  recipe_id?: number | null;
  recipe_name?: string | null;
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
