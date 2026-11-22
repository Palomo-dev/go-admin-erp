// Tipos del módulo de cupones (tabla `coupons`, migración 20261120181551).

/**
 * Los dos valores de `coupons_discount_type_check`. El monto fijo es
 * 'fixed_amount' (con 'fixed' el insert chocaba con el CHECK).
 */
export const DISCOUNT_TYPES = ['percentage', 'fixed_amount'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Estado del código, calculado en la base (`fn_cupon_estado`). */
export const ESTADOS_CUPON = ['activo', 'programado', 'agotado', 'vencido', 'inactivo', 'archivado'] as const;
export type EstadoCupon = (typeof ESTADOS_CUPON)[number];

/** Filtro de estado de la lista: «todos» no incluye los archivados. */
export type FiltroEstadoCupon = 'todos' | 'archivados' | Exclude<EstadoCupon, 'archivado'>;

export interface Coupon {
  id: string;
  organization_id?: number;
  code: string;
  name?: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number | null;
  max_discount_amount?: number | null;
  usage_limit?: number | null;
  usage_limit_per_customer?: number | null;
  usage_count: number;
  start_date?: string | null;
  end_date?: string | null;
  is_active: boolean;
  archived_at?: string | null;
  applies_to_first_purchase: boolean;
  customer_id?: string | null;
  promotion_id?: string | null;
  batch_id?: string | null;
  created_at: string;
  updated_at?: string;
  customer?: { id: string; full_name: string; email?: string | null } | null;
  promotion?: { id: string; name: string | null } | null;
  /** Columna calculada `estado_codigo` (fn_cupon_estado), cuando se pide. */
  estado_codigo?: EstadoCupon | null;
}

/** Fila de `pos_cupones_listar`. */
export interface CuponFila extends Coupon {
  estado: EstadoCupon;
  cliente_nombre?: string | null;
  promocion_nombre?: string | null;
  /** Cupones del mismo lote (null si no es de un lote). */
  lote_total?: number | null;
}

export interface ListadoCupones {
  total: number;
  filas: CuponFila[];
}

/** `pos_cupones_resumen`: KPI de la lista. */
export interface ResumenCupones {
  total: number;
  activos: number;
  agotados_o_vencidos: number;
  con_canje: number;
  canjes: number;
  descuento: number;
}

export interface CanjeCupon {
  id: string;
  created_at: string;
  discount_applied: number;
  sale_id: string;
  factura: string | null;
  pedido: string | null;
  cliente: string | null;
  sucursal: string | null;
  branch_id: number | null;
  es_web: boolean;
  venta_total: number | null;
}

export interface EstadisticasCupon {
  canjes: number;
  descuento: number;
  ticket_medio: number;
  web: number;
  pos: number;
  ultimo: string | null;
}

/** `pos_cupon_canjes`. */
export interface CanjesCupon {
  estadisticas: EstadisticasCupon;
  total: number;
  filas: CanjeCupon[];
}

/**
 * Datos del formulario. `start_date` y `end_date` son días calendario
 * 'YYYY-MM-DD' en la zona de la organización: el servicio los convierte a
 * instantes (inicio 00:00, fin 23:59:59.999).
 */
export interface CreateCouponData {
  code: string;
  name?: string | null;
  discount_type: DiscountType;
  discount_value: number;
  min_purchase_amount?: number | null;
  max_discount_amount?: number | null;
  usage_limit?: number | null;
  usage_limit_per_customer?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active?: boolean;
  applies_to_first_purchase?: boolean;
  customer_id?: string | null;
  promotion_id?: string | null;
}

export type UpdateCouponData = Partial<CreateCouponData>;

/** Datos de «Crear lote». Vigencia en días de la organización, como el formulario. */
export interface DatosLote {
  prefijo: string;
  cantidad: number;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount?: number | null;
  min_purchase_amount?: number | null;
  usage_limit?: number | null;
  usage_limit_per_customer?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  promotion_id?: string | null;
}

export interface LoteCreado {
  lote: string;
  creados: number;
  codigos: string[];
}
