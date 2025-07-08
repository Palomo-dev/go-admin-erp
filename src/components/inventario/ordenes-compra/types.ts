/**
 * Tipos para el módulo de órdenes de compra
 * 
 * Este archivo centraliza las definiciones de tipos para evitar 
 * inconsistencias entre componentes y permitir una fácil reutilización.
 */

/**
 * Estados posibles para una orden de compra
 * Basados en los permitidos por la tabla purchase_orders
 */
export type EstadoOrdenCompra = 'draft' | 'sent' | 'partial' | 'received' | 'closed' | 'cancelled';

/**
 * Estados posibles para un ítem de una orden de compra
 * Basados en los permitidos por la tabla po_items
 */
export type EstadoItemOrdenCompra = 'pending' | 'partial' | 'received';

/**
 * Interfaz para un proveedor
 * Basado en la estructura de la tabla suppliers de Supabase
 * Ajustada para incluir solo los campos reales que usamos
 */
export interface Supplier {
  id: number;
  name: string;
  // Hacemos estos campos opcionales ya que puede que no existan en la tabla
  email?: string | null;
  nit?: string | null;
  phone?: string | null;
}

/**
 * Interfaz para una sucursal
 * Basado en la estructura de la tabla branches de Supabase
 */
export interface Branch {
  id: number;
  name: string;
}

/**
 * Interfaz para un producto
 * Basado en la estructura de la tabla products de Supabase
 */
export interface Product {
  id: number;
  name: string;
  sku: string;
}

/**
 * Interfaz para una orden de compra
 * Basado en la estructura real de la tabla purchase_orders de Supabase
 */
export interface OrdenCompra {
  id: number;
  organization_id: number;
  branch_id: number;
  supplier_id: number;
  status: string;
  expected_date: string | null;
  total: number;
  created_at: string;
  updated_at: string | null;
  created_by: number | null;
  notes: string | null;
  // Campos relacionados que vienen de la consulta join - nombres actualizados según la consulta a Supabase
  supplier?: { id: number; name: string }[];
  branch?: { id: number; name: string }[];
  // Mantenemos los campos anteriores por compatibilidad con código existente
  suppliers?: { id: number; name: string };
  branches?: { id: number; name: string };
  // Campo calculado agregado en código
  po_items_count?: number;
}

/**
 * Interfaz para un ítem de una orden de compra
 * Basado en la estructura real de la tabla po_items de Supabase
 */
export interface ItemOrdenCompra {
  id: number;
  purchase_order_id: number;
  product_id: number;
  quantity: number;
  unit_cost: number;
  status: string;
  // El campo received_quantity no existe en la tabla po_items
  // received_quantity: number | null;
  lot_code: string | null;
  // El campo expiry_date no existe en la tabla po_items
  // expiry_date: string | null;
  products?: Product;
}

/**
 * Interfaz para los datos del formulario de ítem de orden de compra
 */
export interface ItemOrdenCompraFormData {
  product_id: number;
  product_name?: string;
  product_sku?: string;
  quantity: number;
  unit_cost: number;
  subtotal?: number;
}

/**
 * Interfaz para los datos del formulario de orden de compra
 */
export interface OrdenCompraFormData {
  branch_id: number;
  supplier_id: number;
  expected_date: string | null;
  notes: string | null;
  items: ItemOrdenCompraFormData[];
}

/**
 * Interfaz para un rango de fechas
 */
export interface DateRange {
  from: Date | null;
  to?: Date | null;
}

/**
 * Interfaz para filtros de órdenes de compra
 * Esta interfaz es utilizada por el componente OrdenesCompra
 */
export interface FiltrosOrdenCompra {
  status: string[] | null;
  supplier_id: number | null;
  branch_id: number | null;
  dateRange: DateRange | null;
  search: string;
}

/**
 * Interfaz para compatibilidad con componentes existentes
 * @deprecated usar FiltrosOrdenCompra en su lugar
 */
export interface OrdenCompraFiltros {
  status: string[];
  supplier_id: number | null;
  branch_id: number | null;
  dateRange: { from: Date | null; to: Date | null };
  searchTerm: string;
}
