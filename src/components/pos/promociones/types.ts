// Tipos para el módulo de promociones

export type PromotionType = 'percentage' | 'fixed' | 'buy_x_get_y' | 'bundle';
export type AppliesTo = 'all' | 'products' | 'categories';
export type RuleType = 'include' | 'exclude';

export interface Promotion {
  id: string;
  organization_id: number;
  name: string;
  description?: string;
  promotion_type: PromotionType;
  discount_value?: number;
  buy_quantity?: number;
  get_quantity?: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  applies_to: AppliesTo;
  start_date: string;
  end_date?: string;
  is_active: boolean;
  usage_limit?: number;
  usage_count: number;
  is_combinable: boolean;
  priority: number;
  branches?: number[];
  created_by?: string;
  created_at: string;
  updated_at: string;
  rules?: PromotionRule[];
}

export interface PromotionRule {
  id: string;
  promotion_id: string;
  rule_type: RuleType;
  product_id?: number;
  category_id?: number;
  created_at: string;
  product?: {
    id: number;
    name: string;
    sku: string;
  };
  category?: {
    id: number;
    name: string;
  };
}

export interface CreatePromotionData {
  name: string;
  description?: string;
  promotion_type: PromotionType;
  discount_value?: number;
  buy_quantity?: number;
  get_quantity?: number;
  min_purchase_amount?: number;
  max_discount_amount?: number;
  applies_to: AppliesTo;
  start_date: string;
  end_date?: string;
  is_active?: boolean;
  usage_limit?: number;
  is_combinable?: boolean;
  priority?: number;
  branches?: number[];
  rules?: CreatePromotionRuleData[];
}

export interface CreatePromotionRuleData {
  rule_type: RuleType;
  product_id?: number;
  category_id?: number;
}

export interface UpdatePromotionData extends Partial<CreatePromotionData> {}

export interface PromotionFilters {
  search?: string;
  is_active?: boolean;
  promotion_type?: PromotionType;
  dateFrom?: string;
  dateTo?: string;
}

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  percentage: 'Porcentaje',
  fixed: 'Monto Fijo',
  buy_x_get_y: 'Compra X Lleva Y',
  bundle: 'Bundle'
};

export const APPLIES_TO_LABELS: Record<AppliesTo, string> = {
  all: 'Todos los productos',
  products: 'Productos específicos',
  categories: 'Categorías específicas'
};
