// Tipos para Unidades de Medida

export interface Unit {
  code: string;
  name: string;
  conversion_factor: number;
  created_at?: string;
  updated_at?: string;
  product_count?: number;
}

export interface FiltrosUnidades {
  busqueda: string;
}
