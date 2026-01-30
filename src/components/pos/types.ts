// Tipos para el sistema POS
export interface Category {
  id: number;
  organization_id: number;
  name: string;
  slug: string;
  rank: number;
  parent_id?: number;
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
  tax_id?: number;
  price?: number; // Added for POS pricing
  cost?: number;
  stock_quantity?: number;
  min_stock_level?: number;
  created_at: string;
  updated_at: string;
  tag_id?: number;
  parent_product_id?: number;
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
  city?: string;
  country?: string;
  avatar_url?: string | null;
  roles: string[];
  tags: string[];
  preferences: any;
  created_at: string;
  updated_at: string;
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
  notes?: string;
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
  status: 'pending' | 'completed' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'partial' | 'refunded';
  sale_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
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
