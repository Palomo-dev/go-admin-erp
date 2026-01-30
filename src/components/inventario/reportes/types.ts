export interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'stock' | 'movimientos' | 'compras' | 'valoracion';
}

export interface StockReport {
  product_id: number;
  product_name: string;
  sku: string;
  category_name: string;
  branch_name: string;
  quantity: number;
  min_stock: number;
  max_stock: number;
  unit_cost: number;
  total_value: number;
  status: 'normal' | 'low' | 'out' | 'excess';
}

export interface KardexEntry {
  id: number;
  date: string;
  movement_type: string;
  document_reference: string;
  quantity_in: number;
  quantity_out: number;
  balance: number;
  unit_cost: number;
  total_cost: number;
  notes: string;
}

export interface RotationReport {
  product_id: number;
  product_name: string;
  sku: string;
  category_name: string;
  total_sold: number;
  total_purchased: number;
  rotation_index: number;
  average_days_in_stock: number;
}

export interface SupplierPurchaseReport {
  supplier_id: number;
  supplier_name: string;
  total_orders: number;
  total_amount: number;
  average_order: number;
  last_purchase_date: string;
  top_products: { name: string; quantity: number }[];
}

export interface ReportFilter {
  dateFrom?: string;
  dateTo?: string;
  branchId?: number;
  categoryId?: number;
  supplierId?: number;
  productId?: number;
}
