/**
 * Estado visible de una venta del POS: UN badge a partir de `sales.status`,
 * `sales.payment_status`, las devoluciones y la sincronización del Desktop
 * (V-c de docs/implementacion/CAJAS-VENTAS-PLAN.md). Módulo hoja.
 *
 * Antes el listado y el detalle tenían mapas distintos, pintaban «Completada»
 * (estado que no existe en `sales_status_check`) y una venta anulada caía en
 * «Pendiente». Valores reales verificados en la base (2026-09-24):
 * `status` ∈ draft · paid · partial · pending · void y
 * `payment_status` ∈ pending · paid · partial · refunded; hay filas
 * `paid`/`pending` (el estado de la venta dice pagada y el cobro no): manda el
 * cobro, que es lo que refleja la factura.
 */

export type EstadoVenta =
  | 'pendiente_sincronizar'
  | 'anulada'
  | 'borrador'
  | 'devuelta'
  | 'devuelta_parcial'
  | 'pagada'
  | 'pago_parcial'
  | 'pendiente_pago';

export interface VentaParaEstado {
  status?: string | null;
  payment_status?: string | null;
  /** Total de la venta. */
  total?: number | string | null;
  /** Σ `returns.total_refund` procesadas de la venta. */
  devuelto?: number | string | null;
  /** Venta hecha sin red en el Desktop, aún en el outbox. */
  pendiente_sync?: boolean | null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Estado único de la venta, en orden de prioridad. */
export function estadoVenta(v: VentaParaEstado): EstadoVenta {
  if (v.pendiente_sync || v.status === 'pending_sync') return 'pendiente_sincronizar';
  if (v.status === 'void' || v.status === 'cancelled') return 'anulada';
  if (v.status === 'draft') return 'borrador';
  const total = num(v.total);
  const devuelto = num(v.devuelto);
  if (v.payment_status === 'refunded' || (total > 0 && devuelto >= total - 0.005)) return 'devuelta';
  if (devuelto > 0) return 'devuelta_parcial';
  const cobro = v.payment_status || v.status;
  if (cobro === 'paid') return 'pagada';
  if (cobro === 'partial') return 'pago_parcial';
  return 'pendiente_pago';
}

/**
 * Clave que entiende `StatusBadge` (kit/estadoTono.ts, SISTEMA-BADGES §4):
 * un estado = un tono en toda la app.
 */
export const BADGE_ESTADO_VENTA: Record<EstadoVenta, string> = {
  pendiente_sincronizar: 'pendiente de sincronizar',
  anulada: 'void',
  borrador: 'draft',
  devuelta: 'returned',
  devuelta_parcial: 'partially returned',
  pagada: 'paid',
  pago_parcial: 'partial',
  pendiente_pago: 'pendiente de pago',
};

export const ESTADOS_VENTA: readonly EstadoVenta[] = [
  'pagada',
  'pago_parcial',
  'pendiente_pago',
  'devuelta',
  'devuelta_parcial',
  'anulada',
  'borrador',
  'pendiente_sincronizar',
];

export function esEstadoVenta(valor: unknown): valor is EstadoVenta {
  return typeof valor === 'string' && (ESTADOS_VENTA as readonly string[]).includes(valor);
}

/** Origen visible de la venta (columna y filtro «Origen»). */
export type OrigenVenta = 'pos' | 'mesa' | 'web' | 'factura';

export const ORIGENES_VENTA: readonly OrigenVenta[] = ['pos', 'mesa', 'web', 'factura'];

export function origenVenta(v: {
  source?: string | null;
  web_order_id?: string | null;
  table_session_id?: string | null;
}): OrigenVenta {
  if (v.web_order_id || v.source === 'web') return 'web';
  if (v.table_session_id) return 'mesa';
  if (v.source === 'invoice') return 'factura';
  return 'pos';
}
