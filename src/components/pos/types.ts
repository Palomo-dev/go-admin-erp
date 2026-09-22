// Tipos para el sistema POS
export interface Category {
  id: number;
  organization_id: number;
  name: string;
  slug: string;
  rank: number;
  parent_id?: number;
  icon?: string | null;
  color?: string | null;
  image_url?: string | null;
  display_order?: number;
  /** Favorita de la organización (category_favorites). Lo rellena el POS. */
  is_favorite?: boolean;
  /** Unidades vendidas en 90 días (pos_category_ranking). Lo rellena el POS. */
  sales_count_90d?: number;
  requires_preparation?: boolean;
  station?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  organization_id: number;
  sku: string;
  name: string;
  description?: string;
  category_id?: number;
  category?: Category;
  unit_code: string;
  barcode?: string;
  status: 'active' | 'inactive' | 'deleted';
  image?: string;
  // tax_id legacy removido: los impuestos se gestionan via product_tax_relations
  price?: number; // Added for POS pricing
  cost?: number;
  stock_quantity?: number;
  min_stock_level?: number;
  track_stock?: boolean;
  is_out_of_stock?: boolean;
  qty_reserved?: number;
  created_at: string;
  updated_at: string;
  tag_id?: number;
  parent_product_id?: number;
  track_serial?: boolean;
  // Campos extendidos para POS (favoritos, ranking de ventas y receta vinculada)
  is_favorite?: boolean;
  sales_count_90d?: number;
  has_recipe?: boolean;
  recipe_id?: number | null;
  recipe_name?: string | null;
}

export interface Customer {
  id: string;
  organization_id: number;
  full_name: string;
  email?: string;
  phone?: string;
  doc_type?: string;
  doc_number?: string;
  address?: string;
  fiscal_municipality_id?: string;
  country?: string;
  avatar_url?: string | null;
  roles: string[];
  tags: string[];
  preferences: any;
  created_at: string;
  updated_at: string;
  customer_type?: string;
  first_name?: string;
  last_name?: string;
  /** Fase 4D (Desktop): creado sin red y aún no sincronizado con Supabase. */
  pending_sync?: boolean;
}

export interface CartItemModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: number;
  product: Product;
  quantity: number;
  unit_price: number;
  total: number;
  discount_amount?: number;
  tax_amount?: number;
  tax_rate?: number;
  tax_excluded?: boolean;
  tax_included?: boolean;
  notes?: string;
  modifiers?: CartItemModifier[];
  created_at: string;
  updated_at: string;
}

export interface Cart {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  customer?: Customer;
  status: 'active' | 'hold' | 'hold_with_debt' | 'completed' | 'cancelled';
  items: CartItem[];
  subtotal: number;
  tax_amount: number; // Alias for compatibility
  tax_total: number;
  discount_amount: number; // Alias for compatibility
  discount_total: number;
  total: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  hold_reason?: string;
  tax_included?: boolean;
  applied_tax_ids?: string[];
  kitchen_ticket_id?: number | null;
  sale_id?: string;
  invoice_id?: string;
}

export interface Sale {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  user_id: string;
  total: number;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  balance: number;
  /** `pending_sync`: venta provisional guardada en el outbox del Desktop (fase 4B), aún no está en Supabase. */
  status: 'pending' | 'completed' | 'cancelled' | 'expired' | 'pending_sync';
  payment_status: 'pending' | 'paid' | 'partial' | 'refunded';
  sale_date: string;
  invoice_number?: string;
  sale_number?: string;
  /** true si la venta salió del outbox offline y todavía no se reprodujo en Supabase. */
  pending_sync?: boolean;
  /** Número local `OFF-<sucursal>-<n>` impreso en el ticket mientras la venta está pendiente. */
  receipt_number_local?: string;
  /** true si `pos_checkout_v1` encontró la venta ya creada (reproducción repetida de un sobre). Solo lo rellena la RPC (fase 4E). */
  replayed?: boolean;
  payment_method?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  delivery_fee?: number;
  tip_amount?: number;
  tax_included?: boolean;
  tax_breakdown?: { name: string; amount: number }[];
  salesperson_id?: string;
  commission_rate?: number;
  commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
  commission_method?: 'percentage' | 'fixed_amount';
  commission_amount?: number;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id?: number;
  quantity: number;
  unit_price: number;
  total: number;
  tax_amount?: number;
  tax_rate?: number;
  discount_amount?: number;
  notes?: any;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  organization_id: number;
  reference_type: 'sale' | 'invoice' | 'account_receivable';
  reference_id: string;
  customer_id?: string;
  amount: number;
  method: 'cash' | 'card' | 'transfer' | 'check' | 'other';
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  payment_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  code: string;
  type: 'cash' | 'card' | 'transfer' | 'check' | 'digital' | 'other';
  is_active: boolean;
  settings?: any;
  icon?: string;
  color?: string;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  is_active: boolean;
  is_base?: boolean;
}

// Estados y filtros
export interface ProductFilter {
  search?: string;
  category_id?: number;
  status: 'active' | 'inactive' | 'all';
  limit?: number;
}

export interface CustomerFilter {
  search?: string;
  status: 'active' | 'inactive' | 'all';
}

// Respuesta paginada genérica
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Para la interface POS
export interface POSState {
  activeCartId: string;
  carts: Cart[];
  selectedCustomer?: Customer;
  paymentMethods: PaymentMethod[];
  currency: Currency;
}

export interface CheckoutData {
  cart: Cart;
  payments: {
    method: string;
    amount: number;
  }[];
  change: number;
  total_paid: number;
  tax_included?: boolean;
  tip_amount?: number;
  tip_server_id?: string;
  tax_breakdown?: { name: string; amount: number }[];
  salesperson_id?: string;
  commission_rate?: number;
  commission_type?: 'salesperson' | 'intermediation_sale' | 'none';
  commission_method?: 'percentage' | 'fixed_amount';
  commission_amount?: number;
  delivery_type?: 'pickup' | 'delivery_own' | 'delivery_third_party';
  delivery_info?: {
    address?: string;
    city?: string;
    contact_name?: string;
    contact_phone?: string;
    instructions?: string;
  };
  driver_id?: string;
  shipping_fee?: number;
  serial_selections?: Record<number, number[]>;
  /**
   * Id de la venta generado en el cliente (`crypto.randomUUID()`), Desktop
   * fase 4B. Si ya existe una venta con ese id en la organización, `checkout`
   * devuelve la existente y completa solo lo que falte (idempotencia).
   */
  saleId?: string;
  /** Instante real de la venta (ISO). Al reproducir un sobre offline conserva la fecha original. */
  createdAt?: string;
  /** Usuario que hizo la venta. Al reproducir un sobre offline evita atribuirla a quien sincroniza. */
  userId?: string;
  /** true cuando `salesSync` reproduce un sobre: nunca vuelve a encolarse en el outbox. */
  replayFromOutbox?: boolean;
}

// Para impuestos
export interface OrganizationTax {
  id: string;
  organization_id: number;
  template_id: number;
  name: string;
  rate: string;
  description?: string;
  is_default: boolean;
  is_active: boolean;
  tax_included?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductTaxRelation {
  product_id: number;
  tax_id: string;
  organization_taxes: OrganizationTax;
}

export interface PrintTicket {
  sale: Sale;
  sale_items: SaleItem[];
  customer?: Customer;
  payments: Payment[];
  organization_name: string;
  branch_address?: string;
  print_date: string;
}

// Interfaces para Hold with Debt
export interface HoldWithDebtData {
  cartId: string;
  reason: string;
  paymentTerms?: number; // días para vencimiento
  notes?: string;
}

export interface HoldWithDebtResult {
  cart: Cart;
  invoice: {
    id: string;
    number: string;
    total: number;
    due_date: string;
    status: string;
  };
  accountReceivable: {
    id: string;
    amount: number;
    balance: number;
    due_date: string;
    status: string;
  };
}
