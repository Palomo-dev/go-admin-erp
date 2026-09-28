// Tipos para Etiquetas de Productos (tags de clasificación, no etiquetas de papel)

export interface ProductTag {
  id: number;
  organization_id: number;
  name: string;
  color: string;
  created_at?: string;
  /** Productos distintos con la etiqueta (relaciones + products.tag_id). */
  product_count?: number;
  /** Reglas de categoría que la usan. */
  rule_count?: number;
  /** Una de esas categorías (para la columna «En reglas de categoría»). */
  rule_category?: string | null;
}

export interface ProductTagRelation {
  product_id: number;
  tag_id: number;
  created_at?: string;
}

export interface FiltrosEtiquetas {
  busqueda: string;
}
