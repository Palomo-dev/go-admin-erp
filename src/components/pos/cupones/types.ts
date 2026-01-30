// Tipos para el módulo de cupones

export type DiscountType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  organization_id: number;
  code: string;
  name?: string;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  usage_limit?: number;
  usage_limit_per_customer?: number;
  usage_count: number;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  applies_to_first_purchase: boolean;
  customer_id?: string;
  promotion_id?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  customer?: {
    id: string;
    full_name: string;
    email?: string;
  };
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  sale_id: string;
  customer_id?: string;
  discount_applied: number;
  created_at: string;
  sale?: {
    id: string;
    total: number;
    sale_date: string;
    branch?: {
      id: number;
      name: string;
    };
  };
  customer?: {
    id: string;
    full_name: string;
    email?: string;
  };
}

export interface CreateCouponData {
  code: string;
  name?: string;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  usage_limit?: number;
  usage_limit_per_customer?: number;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
  applies_to_first_purchase?: boolean;
  customer_id?: string;
  promotion_id?: string;
}

export interface UpdateCouponData extends Partial<CreateCouponData> {}

export interface CouponFilters {
  search?: string;
  is_active?: boolean;
  discount_type?: DiscountType;
  dateFrom?: string;
  dateTo?: string;
}

export const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  percentage: 'Porcentaje',
  fixed: 'Monto Fijo'
};
