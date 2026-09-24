// Tipos específicos para el módulo de Apertura & Cierre de Caja
export interface CashSession {
  id: number;
  uuid: string;
  organization_id: number;
  branch_id: number | null; // null = caja global (todas las sucursales)
  opened_by: string;
  opened_at: string;
  initial_amount: number;
  closed_at?: string;
  closed_by?: string;
  final_amount?: number;
  difference?: number;
  status: 'open' | 'closed';
  notes?: string;
  created_at: string;
  updated_at: string;
  // Campos adicionales para UI
  opened_by_name?: string;
  closed_by_name?: string;
  branch_name?: string;
  /** Desktop fase 4F: apertura/cierre hechos sin red, aún no en Supabase. `id` negativo mientras no se sincroniza la apertura. */
  pending_sync?: boolean;
}

export interface CashMovement {
  id: number;
  organization_id: number;
  cash_session_id: number;
  type: 'in' | 'out';
  concept: string;
  amount: number;
  user_id: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Campos adicionales para UI
  user_name?: string;
  /** Desktop fase 4F: movimiento registrado sin red, aún no en Supabase (`id` negativo). */
  pending_sync?: boolean;
  /** `cash_movements.uuid`, generado en el cliente cuando nace sin red. */
  uuid?: string;
}

// Arqueo de caja
export interface CashCount {
  id: number;
  organization_id: number;
  cash_session_id: number;
  count_type: 'opening' | 'partial' | 'closing';
  counted_amount: number;
  expected_amount?: number;
  difference?: number;
  denominations?: CashDenominations;
  counted_by: string;
  verified_by?: string;
  notes?: string;
  created_at: string;
  /**
   * Arqueo por método calculado en el servidor (`pos_caja_registrar_arqueo`).
   * `counted_amount`, `expected_amount` y `difference` son solo del efectivo.
   */
  method_breakdown?: Record<string, CashCountMethodLine> | null;
  // Campos adicionales para UI
  counted_by_name?: string;
  verified_by_name?: string;
}

// Desglose de denominaciones para arqueo
export interface CashDenominations {
  bills?: Record<string, number>; // { "100000": 2, "50000": 5, ... }
  coins?: Record<string, number>; // { "1000": 10, "500": 20, ... }
}

// Datos para crear arqueo
/** Una línea del arqueo por método: cada medio contra su propio esperado. */
export interface CashCountMethodLine {
  esperado: number;
  contado: number | null;
  diferencia: number | null;
}

/**
 * Lo que manda el navegador al guardar un arqueo. El esperado NO viaja: lo
 * calcula el servidor (`pos_caja_registrar_arqueo` → `pos_caja_esperado`).
 */
export interface CreateCashCountData {
  count_type: 'opening' | 'partial' | 'closing';
  /** Solo el efectivo contado (billetes + monedas). */
  counted_amount: number;
  /** Lo contado de cada otro método (tarjeta, transferencia…), por código. */
  counted_by_method?: Record<string, number>;
  denominations?: CashDenominations;
  notes?: string;
}

// Datos para crear movimiento
export interface CreateCashMovementData {
  type: 'in' | 'out';
  concept: string;
  amount: number;
  notes?: string;
}

export interface CashSummary {
  initial_amount: number;
  sales_cash: number;
  cash_in: number;
  cash_out: number;
  expected_amount: number;
  counted_amount?: number;
  difference?: number;
  /** Vuelto/cambio total entregado en efectivo durante la sesión */
  change_total: number;
  /** Total de devoluciones procesadas durante la sesión */
  returns_total: number;
  /** Total de consumos de habitaciones (folios PMS) durante la sesión */
  folio_consumptions_total: number;
  /** Total de recibos de caja (abonos a cuentas por cobrar / facturas pendientes) */
  cash_receipts_total: number;
  /** Recibos de caja desglosados por método de pago */
  cash_receipts_by_method?: Record<string, number>;
  /** Total de pagos a proveedores (facturas de compra + cuentas por pagar) */
  purchases_total: number;
  /** Pagos a proveedores desglosados por método de pago */
  purchases_by_method?: Record<string, number>;
  /** @deprecated usar income_by_method / expense_by_method */
  payments_by_method?: Record<string, number>;
  income_by_method?: Record<string, number>;
  expense_by_method?: Record<string, number>;
  /** Total de ventas (todos los métodos de pago, sin abonos ni compras) */
  sales_total?: number;
  /** Ventas desglosadas por método de pago (solo ventas, sin abonos ni compras) */
  sales_by_method?: Record<string, number>;
  /** Pagos de venta en efectivo que componen `sales_cash` (sin abonos ni compras). */
  sales_cash_count?: number;
  /** Movimientos manuales de entrada y de salida de la sesión. */
  cash_in_count?: number;
  cash_out_count?: number;
}

// Detalle de un movimiento pagado durante la sesion de caja
// (venta POS, venta de mesa, factura de venta, factura de compra, etc)
export type SessionMovementType =
  | 'venta_pos'
  | 'venta_mesa'
  | 'venta_factura'
  | 'compra_factura'
  | 'cuenta_por_cobrar'
  | 'cuenta_por_pagar'
  | 'otro';

export interface SessionPaymentDetail {
  id: number;
  type: SessionMovementType;
  direction: 'in' | 'out';
  label: string;
  reference?: string;
  counterparty?: string;
  method: string;
  amount: number;
  created_at: string;
}

export interface OpenCashSessionData {
  initial_amount: number;
  notes?: string;
  scope?: 'branch' | 'global'; // 'branch' = esta sucursal, 'global' = todas las sucursales
}

export interface CloseCashSessionData {
  final_amount: number;
  notes?: string;
}

export interface CashMovementData {
  type: 'in' | 'out';
  concept: string;
  amount: number;
  notes?: string;
}

export interface CashSessionReport {
  session: CashSession;
  movements: CashMovement[];
  summary: CashSummary;
  sales_summary: {
    total_sales: number;
    cash_sales: number;
    card_sales: number;
    other_sales: number;
  };
}

/** Resultado del cierre según la diferencia entre lo contado y lo esperado. */
export type ResultadoCierre = 'faltante' | 'sobrante' | 'cuadrada';

export type CampoOrdenHistorial = 'opened_at' | 'closed_at' | 'difference';

/**
 * Filtros del historial de sesiones (pestaña «Historial» de /app/pos/cajas).
 * `desde`/`hasta` son instantes ISO ya calculados con la zona horaria de la
 * organización: `desde` inclusivo, `hasta` exclusivo, sobre `opened_at`.
 */
export interface CashHistoryFilters {
  status?: 'open' | 'closed' | 'all';
  branchId?: number;
  desde?: string;
  hasta?: string;
  /** Número de caja o nombre del cajero que la abrió. */
  busqueda?: string;
  resultado?: ResultadoCierre;
  orden?: { campo: CampoOrdenHistorial; direccion: 'asc' | 'desc' };
}

// Estados y filtros
export interface CashSessionFilter {
  status?: 'open' | 'closed' | 'all';
  date_from?: string;
  date_to?: string;
  branch_id?: number;
}

// Para la generación de PDFs
export interface CashReportData {
  session: CashSession;
  movements: CashMovement[];
  summary: CashSummary;
  organization_name: string;
  branch_name: string;
  user_name: string;
}
