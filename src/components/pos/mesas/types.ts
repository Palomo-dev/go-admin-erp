// Tipos para el sistema de mesas de restaurante

export type TableState = 'free' | 'occupied' | 'reserved';
export type SessionStatus = 'active' | 'bill_requested' | 'completed';
export type KitchenTicketStatus = 'new' | 'preparing' | 'ready' | 'delivered';

export interface RestaurantTable {
  id: string; // UUID
  organization_id: number;
  branch_id: number;
  name: string;
  zone: string | null;
  capacity: number;
  state: TableState;
  position_x: number | null;
  position_y: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface TableSession {
  id: string; // UUID
  organization_id: number;
  restaurant_table_id: string; // UUID
  sale_id: string | null;
  opened_at: string;
  closed_at: string | null;
  server_id: string;
  customers: number;
  status: SessionStatus;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TableWithSession extends RestaurantTable {
  session?: TableSession;
  totalAmount?: number;
  customerName?: string;
}

export interface Zone {
  name: string;
  tables: RestaurantTable[];
}

export interface MesaFormData {
  name: string;
  zone: string;
  capacity: number;
  position_x?: number;
  position_y?: number;
}

export interface CombinarMesasData {
  mainTableId: string; // UUID
  tablesToCombine: string[]; // UUID[]
}

export interface MoverPedidoData {
  fromTableId: string; // UUID
  toTableId: string; // UUID
  sessionId: string; // UUID
}
