// Tipos para el módulo de devoluciones y cambios

export interface Return {
  id: number;
  organization_id: number;
  branch_id: number;
  sale_id: string;
  user_id: string;
  total_refund: number; // Subtotal del reembolso
  refund_tax_amount: number; // Impuestos del reembolso
  refund_total_with_tax: number; // Total con impuestos
  reason: string;
  return_date: string;
  status: 'processed' | 'pending' | 'cancelled';
  return_items: ReturnItem[];
  created_at: string;
  updated_at: string;
  sale?: {
    id: string;
    total: number;
    subtotal: number;
    tax_total: number;
    customer?: {
      full_name: string;
      phone?: string;
      email?: string;
    } | null;
  } | null;
}

export interface ReturnItem {
  id: string;
  product_id: number;
  product_name: string;
  original_quantity: number;
  return_quantity: number;
  original_price: number;
  refund_amount: number;
  reason: string;
}

export interface SaleForReturn {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id?: string;
  customer?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  };
  user_id: string;
  total: number;
  subtotal: number;
  tax_total: number;
  status: string;
  payment_status: string;
  payment_method?: string;
  invoice_number?: string;
  sale_date: string;
  items: SaleItemForReturn[];
  payments: PaymentForReturn[];
}

export interface SaleItemForReturn {
  id: string;
  sale_id: string;
  product_id: number;
  product: {
    id: number;
    name: string;
    sku: string;
    image?: string | null;
  };
  quantity: number;
  unit_price: number;
  total: number;
  tax_amount?: number;
  discount_amount?: number;
  returned_quantity?: number; // Para tracking de devoluciones previas
}

export interface PaymentForReturn {
  id: string;
  method: string;
  amount: number;
  status: string;
  reference?: string;
}

export interface RefundData {
  type: 'full' | 'partial';
  items: {
    sale_item_id: string;
    product_id: number;
    return_quantity: number;
    refund_amount: number;
    reason: string;
  }[];
  refund_method: 'cash' | 'credit_note' | 'original_method';
  total_refund: number;
  reason: string;
  notes?: string;
}

export interface CreditNote {
  id: string;
  organization_id: number;
  customer_id: string;
  amount: number;
  balance: number;
  expiry_date?: string;
  status: 'active' | 'used' | 'expired';
  notes?: string;
  created_at: string;
}

export interface ReturnSearchFilters {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  refundMethod?: string;
}

export interface SaleSearchFilters {
  search?: string; // Buscar por número de venta, cliente, etc.
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  customerId?: string;
  limit?: number;
  page?: number;
}

export interface PaginatedReturnResponse {
  data: Return[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedSaleResponse {
  data: SaleForReturn[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Tipos para motivos de devolución
export interface ReturnReason {
  id: number;
  organization_id: number;
  code: string;
  name: string;
  description?: string;
  requires_photo: boolean;
  affects_inventory: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface CreateReturnReasonData {
  code: string;
  name: string;
  description?: string;
  requires_photo?: boolean;
  affects_inventory?: boolean;
  is_active?: boolean;
  display_order?: number;
}

export interface UpdateReturnReasonData {
  code?: string;
  name?: string;
  description?: string;
  requires_photo?: boolean;
  affects_inventory?: boolean;
  is_active?: boolean;
  display_order?: number;
}

export interface ReturnReasonFilters {
  search?: string;
  is_active?: boolean;
}
