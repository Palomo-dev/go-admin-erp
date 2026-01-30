export interface Lot {
  id: number;
  product_id: number;
  lot_code: string;
  expiry_date: string | null;
  supplier_id: number | null;
  created_at: string;
  updated_at: string;
  product?: {
    id: number;
    name: string;
    sku: string;
  };
  supplier?: {
    id: number;
    name: string;
  };
  stock_quantity?: number;
  is_expired?: boolean;
  days_to_expiry?: number | null;
}

export interface LotFormData {
  product_id: number;
  lot_code: string;
  expiry_date: string | null;
  supplier_id: number | null;
}

export interface LotsStats {
  total: number;
  expired: number;
  expiringSoon: number; // próximos 30 días
  withStock: number;
}

export interface LotFilter {
  productId?: number;
  supplierId?: number;
  status?: 'all' | 'expired' | 'expiring' | 'active';
  search?: string;
}
