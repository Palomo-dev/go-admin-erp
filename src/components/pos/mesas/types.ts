// Tipos para el sistema de mesas de restaurante

/** 'cleaning' = «Por limpiar» (migración 20261006200000; antes no existía). */
export type TableState = 'free' | 'occupied' | 'reserved' | 'cleaning';
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
  rotation?: number | null;
  /** Forma y tamaño en el plano (NULL: la decide la capacidad). */
  shape?: 'square' | 'round' | 'long' | 'bar' | null;
  size?: 's' | 'm' | 'l' | null;
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
  // Datos enriquecidos calculados en MesasService.obtenerMesasConSesiones
  serverName?: string;
  pendingKitchenItems?: number;
  /** Marcadores de ítems de la venta (solo el conteo: `obtenerMesasConSesiones`). */
  sale_items?: Array<{ id: string }>;
}

export interface TableWithSession extends RestaurantTable {
  session?: TableSession;
  totalAmount?: number;
  customerName?: string;
  /** Platos listos sin servir (campana del plano). */
  readyKitchenItems?: number;
  /** Último movimiento de la cuenta o de su cocina (mesa abierta sin movimiento). */
  lastActivityAt?: string | null;
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
  branch_id?: number | null;
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
