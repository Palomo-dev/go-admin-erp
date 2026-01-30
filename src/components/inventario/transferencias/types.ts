// Tipos para Transferencias de Inventario

export interface Branch {
  id: number;
  name: string;
  address?: string;
  is_main?: boolean;
}

export interface Product {
  id: number;
  name: string;
  sku?: string;
  barcode?: string;
  unit_code?: string;
}

export interface Lot {
  id: number;
  lot_number: string;
  expiry_date?: string;
  product_id: number;
}

export interface TransferItem {
  id?: number;
  inventory_transfer_id?: number;
  product_id: number;
  quantity: number;
  lot_id?: number | null;
  received_qty?: number;
  status?: 'pending' | 'partial' | 'complete';
  created_at?: string;
  updated_at?: string;
  // Relaciones
  product?: Product;
  lot?: Lot;
}

export interface InventoryTransfer {
  id: number;
  organization_id: number;
  origin_branch_id: number;
  dest_branch_id: number;
  status: 'draft' | 'pending' | 'in_transit' | 'partial' | 'complete' | 'cancelled';
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  notes?: string;
  // Relaciones
  origin_branch?: Branch;
  dest_branch?: Branch;
  items?: TransferItem[];
  creator?: {
    email: string;
  };
}

export interface CreateTransferData {
  origin_branch_id: number;
  dest_branch_id: number;
  notes?: string;
  items: {
    product_id: number;
    quantity: number;
    lot_id?: number | null;
  }[];
}

export interface UpdateTransferData {
  status?: InventoryTransfer['status'];
  notes?: string;
}

export interface ReceiveItemData {
  transfer_item_id: number;
  received_qty: number;
}

export interface FiltrosTransferencias {
  busqueda: string;
  estado: 'todos' | InventoryTransfer['status'];
  origen: string | 'todos';
  destino: string | 'todos';
  fechaDesde: string;
  fechaHasta: string;
}

export interface StockLevel {
  id: number;
  organization_id: number;
  branch_id: number;
  product_id: number;
  lot_id?: number;
  qty_available: number;
  qty_reserved?: number;
  min_stock?: number;
  max_stock?: number;
}
