// Tipos para el módulo de promociones

/**
 * Los valores DEBEN coincidir con el CHECK `promotions_promotion_type_check`
 * de la base: ('percentage','fixed_amount','buy_x_get_y','bundle','free_shipping').
 * Antes aquí decía 'fixed', que Postgres rechaza: por eso crear una promoción
 * de monto fijo fallaba siempre con violación de constraint.
 */
export type PromotionType =
  | 'percentage'
  | 'fixed_amount'
  | 'buy_x_get_y'
  | 'bundle'
  | 'free_shipping';
export type AppliesTo = 'all' | 'products' | 'categories';
/** `eligible`: subtotal de las líneas de la promo. `cart`: toda la cuenta. */
export type MinPurchaseScope = 'eligible' | 'cart';
export type RuleType = 'include' | 'exclude';

// Valores de rule_type aceptados por el CHECK constraint de la BD
// (promotion_rules_rule_type_check). El UI usa RuleType ('include'/'exclude')
// y se mapea a RuleTypeDB según applies_to antes de insertar.
export type RuleTypeDB =
  | 'include_product'
  | 'exclude_product'
  | 'include_category'
  | 'exclude_category'
  | 'include_brand'
  | 'exclude_brand';

export type WeekDay = 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday';

export interface Promotion {
  id: string;
  organization_id: number;
  name: string;
  description?: string;
  promotion_type: PromotionType;
  discount_value?: number;
  buy_quantity?: number | null;
  get_quantity?: number | null;
  min_purchase_amount?: number | null;
  min_purchase_scope?: MinPurchaseScope | null;
  min_quantity?: number | null;
  repeat_every_quantity?: number | null;
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
  /** Métodos de pago con los que aplica (20261028180000). NULL/vacío = cualquiera. */
  payment_method_codes?: string[] | null;
  // --- Canales de aplicación ---
  applies_to_web?: boolean;
  applies_to_pos?: boolean;
  applies_to_finances?: boolean;
  // --- Días recurrentes (null = todos los días) ---
  applicable_days?: WeekDay[] | null;
  /** Franja `HH:mm` o `HH:mm:ss` en la zona de la organización. Nulo = todo el día. */
  start_time?: string | null;
  end_time?: string | null;
  /** Precio del paquete. Si está puesto, manda sobre el porcentaje. */
  bundle_price?: number | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
  rules?: PromotionRule[];
}

export interface PromotionRule {
  id: string;
  promotion_id: string;
  rule_type: RuleTypeDB;
  product_id?: number;
  category_id?: number;
  /** Unidades de este producto en un paquete. Nulo = 1. */
  quantity?: number | null;
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
  buy_quantity?: number | null;
  get_quantity?: number | null;
  min_purchase_amount?: number | null;
  min_purchase_scope?: MinPurchaseScope | null;
  min_quantity?: number | null;
  repeat_every_quantity?: number | null;
  max_discount_amount?: number;
  applies_to: AppliesTo;
  start_date: string;
  end_date?: string;
  is_active?: boolean;
  usage_limit?: number;
  is_combinable?: boolean;
  priority?: number;
  branches?: number[];
  /** Métodos de pago con los que aplica (20261028180000). NULL/vacío = cualquiera. */
  payment_method_codes?: string[] | null;
  // --- Canales de aplicación ---
  applies_to_web?: boolean;
  applies_to_pos?: boolean;
  applies_to_finances?: boolean;
  // --- Días recurrentes (null/vacío = todos los días) ---
  applicable_days?: WeekDay[] | null;
  start_time?: string | null;
  end_time?: string | null;
  bundle_price?: number | null;
  rules?: CreatePromotionRuleData[];
}

export interface CreatePromotionRuleData {
  rule_type: RuleTypeDB;
  product_id?: number;
  category_id?: number;
  /** Unidades en el paquete. Solo se guarda en un producto incluido. */
  quantity?: number | null;
}

export interface UpdatePromotionData extends Partial<CreatePromotionData> {}

export interface PromotionFilters {
  search?: string;
  is_active?: boolean;
  promotion_type?: PromotionType;
  dateFrom?: string;
  dateTo?: string;
  branchId?: number | null;
}

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  percentage: 'Porcentaje',
  fixed_amount: 'Monto Fijo',
  buy_x_get_y: 'Compra X Lleva Y',
  bundle: 'Bundle',
  free_shipping: 'Envío Gratis'
};

export const APPLIES_TO_LABELS: Record<AppliesTo, string> = {
  all: 'Todos los productos',
  products: 'Productos específicos',
  categories: 'Categorías específicas'
};

// Días de la semana para applicable_days
export const WEEK_DAYS: { value: WeekDay; label: string; short: string }[] = [
  { value: 'monday', label: 'Lunes', short: 'Lun' },
  { value: 'tuesday', label: 'Martes', short: 'Mar' },
  { value: 'wednesday', label: 'Miércoles', short: 'Mié' },
  { value: 'thursday', label: 'Jueves', short: 'Jue' },
  { value: 'friday', label: 'Viernes', short: 'Vie' },
  { value: 'saturday', label: 'Sábado', short: 'Sáb' },
  { value: 'sunday', label: 'Domingo', short: 'Dom' },
];

// Mapeo de getDay() de JS (0=domingo) a nombre de día
export const JS_DAY_TO_WEEKDAY: Record<number, WeekDay> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};
