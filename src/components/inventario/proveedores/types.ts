/**
 * Tipos compartidos para el módulo de proveedores
 * 
 * Este archivo centraliza las definiciones de tipos para evitar 
 * inconsistencias entre componentes y permitir una fácil reutilización.
 */

/**
 * Interfaz para los proveedores del catálogo
 * 
 * Se basa en la estructura de la tabla suppliers de Supabase
 */
export interface Proveedor {
  id: number;
  uuid: string;
  organization_id: number;
  name: string;
  nit?: string;  
  contact?: string;
  phone?: string;
  email?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  // Campos adicionales para la UI
  condiciones_pago?: CondicionesPago;
  cumplimiento?: number; // Porcentaje de cumplimiento (0-100)
}

/**
 * Condiciones de pago del proveedor
 */
export interface CondicionesPago {
  dias_credito: number;
  limite_credito?: number;
  metodo_pago_preferido?: string;
  descuento_pronto_pago?: number;
}

/**
 * Interfaz para las compras realizadas al proveedor
 */
export interface CompraProveedor {
  id: number;
  organization_id?: number;
  proveedor_id?: number;
  fecha: string;
  total?: number;
  estado?: 'pendiente' | 'recibida' | 'cancelada';
  numero_factura?: string;
  fecha_recepcion?: string;
  cumplimiento_tiempo?: boolean;
  cumplimiento_calidad?: boolean;
  notas?: string;
  fecha_entrega_esperada?: string;
}

/**
 * Filtros para la búsqueda de proveedores
 */
export interface FiltrosProveedores {
  busqueda: string;
  estado?: string;
  ordenarPor?: string;
}
