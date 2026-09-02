// Tipos para el detalle de mesa y pedidos

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: number;
  quantity: number;
  unit_price: number;
  total: number;
  tax_amount: number;
  discount_amount: number;
  notes: string | { product_name?: string; extra?: string; guest_number?: number; modifiers?: SelectedProductModifier[] } | null;
  created_at: string;
  updated_at: string;
  // Relaciones
  product?: Product;
  kitchen_ticket_items?: Pick<KitchenTicketItem, 'id' | 'status'>[];
}

export interface ProductImage {
  id: number;
  storage_path: string;
  is_primary: boolean;
  display_order: number;
}

export interface Product {
  id: number;
  organization_id: number;
  sku: string;
  name: string;
  description: string | null;
  category_id: number | null;
  status: string;
  is_parent: boolean;
  parent_product_id?: number | null;
  variant_data: Record<string, string> | null;
  product_images?: ProductImage[];
  parent_product?: {
    product_images?: ProductImage[];
  } | null;
  // Campos adicionales retornados por POSService.getProductsPaginated
  // (no están en la tabla products pero se hidratan en el servicio).
  price?: number | null;
  compare_price?: number | null;
  category?: { id: number; name: string; slug: string; station: string | null; requires_preparation: boolean } | null;
  has_variants?: boolean;
  variant_count?: number;
  has_modifiers?: boolean;
  track_stock?: boolean;
  stock_quantity?: number;
  qty_reserved?: number;
  is_out_of_stock?: boolean;
  is_favorite?: boolean;
  sales_count_90d?: number;
  has_recipe?: boolean;
  recipe_id?: number | null;
  recipe_name?: string | null;
  image?: string | null;
}

export interface Sale {
  id: string;
  organization_id: number;
  branch_id: number;
  customer_id: string | null;
  user_id: string;
  total: number;
  balance: number;
  status: string;
  payment_status: string;
  sale_date: string;
  notes: string | null;
  tax_total: number;
  subtotal: number;
  discount_total: number;
  created_at: string;
  updated_at: string;
  reservation_id?: string | null; // Vinculación con PMS
}

export interface TableSessionWithDetails {
  id: string; // UUID
  organization_id: number;
  restaurant_table_id: string; // UUID
  sale_id: string | null;
  opened_at: string;
  closed_at: string | null;
  server_id: string;
  customers: number;
  status: 'active' | 'bill_requested' | 'completed';
  notes: string | null;
  // Relaciones
  restaurant_tables?: {
    id: string; // UUID
    name: string;
    zone: string | null;
    capacity: number;
    state: string;
  };
  sales?: Sale;
  sale_items?: SaleItem[];
}

export interface KitchenTicket {
  id: number;
  organization_id: number;
  branch_id: number;
  table_session_id: string; // UUID
  sale_id: string | null;
  status: 'new' | 'preparing' | 'ready' | 'delivered';
  priority: number;
  estimated_time: number | null;
  printed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KitchenTicketItem {
  id: number;
  organization_id: number;
  kitchen_ticket_id: number;
  sale_item_id: string;
  station: string | null;
  notes: string | null;
  status: 'pending' | 'in_progress' | 'ready' | 'delivered';
  preparation_time: number | null;
  created_at: string;
  updated_at: string;
}

export interface SelectedProductModifier {
  groupId: number;
  groupName: string;
  modifierId: number;
  name: string;
  extraPrice: number;
}

export interface ProductToAdd {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes: string;
  station?: string;
  requires_preparation?: boolean;
  guest_number?: number;
  variant_data?: Record<string, string> | null;
  modifiers?: SelectedProductModifier[];
}

export interface TransferItemData {
  sale_item_id: string;
  from_table_id: string; // UUID
  to_table_id: string; // UUID
  quantity: number;
}

export interface PreCuenta {
  items: SaleItem[];
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
}
