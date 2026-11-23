/**
 * Canal de una venta (Figma 24 Ventas, componente InsigniaCanal 2896:12337,
 * aprobado por el dueño el 2026-11-23): «Ventas tiene ventas por todos los
 * canales; el POS es solo uno». Columna, filtro y chips de «Todas las ventas».
 * Módulo hoja: lo usan el servidor, el navegador y la réplica del Desktop.
 *
 * Misma regla que la columna `canal` de `pos_ventas_filtradas`
 * (migración 20261123200752_ventas_canal_listado_y_cifras):
 *  - pos        · venta del POS, con o sin mesa del restaurante;
 *  - tienda_web · pedido de la tienda web o `sales.source = 'web'`;
 *  - menu_qr    · pedido «Comer aquí» del menú QR (`delivery_type = 'dine_in'`
 *                 o la marca «[Comer aquí]», `tipoEntrega.esComerAqui`);
 *  - manual     · pedido manual (WhatsApp, teléfono) o factura de Finanzas;
 *  - marketplace· no existe hoy: su chip y su insignia solo salen cuando haya
 *                 ventas de una conexión (decisión 9 de la lámina «Qué cambia»).
 */
import { esComerAqui } from '@/lib/pos/pedidosWeb/tipoEntrega';

export type CanalVenta = 'pos' | 'tienda_web' | 'menu_qr' | 'marketplace' | 'manual';

/** Orden de los chips y del filtro (Figma: Todos · POS · Tienda web · Menú QR · Manual). */
export const CANALES_VENTA: readonly CanalVenta[] = ['pos', 'tienda_web', 'menu_qr', 'marketplace', 'manual'];

export function esCanalVenta(valor: unknown): valor is CanalVenta {
  return typeof valor === 'string' && (CANALES_VENTA as readonly string[]).includes(valor);
}

/** Canales que se ofrecen aunque no tengan ventas en el periodo (Marketplace, solo si las tiene). */
export function canalSiempreVisible(canal: CanalVenta): boolean {
  return canal !== 'marketplace';
}

/** Canales manuales del pedido web (`web_orders.source` de un pedido creado a mano). */
const ORIGENES_MANUALES = new Set(['whatsapp', 'phone']);

export interface VentaParaCanal {
  source?: string | null;
  web_order_id?: string | null;
  /** El pedido web enlazado, si se conoce. */
  pedido?: { source?: string | null; delivery_type?: string | null; internal_notes?: string | null } | null;
}

export function canalVenta(v: VentaParaCanal): CanalVenta {
  const p = v.pedido;
  if (p && esComerAqui(p)) return 'menu_qr';
  if (p && ORIGENES_MANUALES.has(p.source ?? '')) return 'manual';
  if (v.web_order_id || v.source === 'web') return 'tienda_web';
  if (v.source === 'invoice') return 'manual';
  return 'pos';
}
