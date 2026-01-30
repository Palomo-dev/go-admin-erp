export interface VariantType {
  id: number;
  organization_id: number;
  name: string;
  created_at: string;
  values_count?: number;
  products_count?: number;
}

export interface VariantTypeFormData {
  name: string;
}

export interface VariantTypesStats {
  total: number;
  withValues: number;
  inUse: number;
}
