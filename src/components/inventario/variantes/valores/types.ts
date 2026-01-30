export interface VariantValue {
  id: number;
  variant_type_id: number;
  value: string;
  display_order: number;
  created_at: string;
  variant_type?: {
    id: number;
    name: string;
  };
  products_count?: number;
}

export interface VariantValueFormData {
  variant_type_id: number;
  value: string;
  display_order: number;
}

export interface VariantValuesStats {
  total: number;
  byType: { type_id: number; type_name: string; count: number }[];
  inUse: number;
}
