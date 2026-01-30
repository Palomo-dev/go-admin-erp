// Tipos para Etiquetas de Productos

export interface ProductTag {
  id: number;
  organization_id: number;
  name: string;
  color: string;
  created_at?: string;
  product_count?: number;
}

export interface ProductTagRelation {
  product_id: number;
  tag_id: number;
  created_at?: string;
}

export interface FiltrosEtiquetas {
  busqueda: string;
}
