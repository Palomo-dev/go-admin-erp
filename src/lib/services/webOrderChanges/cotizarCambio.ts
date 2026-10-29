import type { WebOrder, WebOrderItem } from '../webOrdersService';
import { impuestoVaSobreBase } from '../webOrderTotals';

/**
 * Cotización de un cambio de productos en un pedido web pagado (web_order_changes).
 * Pura: sin base de datos, para testearla.
 *
 * Reglas:
 *  - Precios: un producto que YA estaba en el pedido conserva el precio que el cliente pagó
 *    (hasta la cantidad original); lo adicional y los productos nuevos van al precio vigente.
 *  - IVA: el modo del pedido (sobre la base o incluido) se infiere igual que en la factura
 *    (`impuestoVaSobreBase` de webOrderTotals). La tarifa de cada línea nueva la da el resolver
 *    de impuestos del servidor (`tasa`).
 *  - Descuento de pedido (cupón): se conserva el importe original, sin pasar del subtotal nuevo.
 *  - Envío: se recalcula. Recogida/mesa → 0; domicilio → `envio.nuevo` si el servidor/usuario lo
 *    trae, si no el cobrado. Propina: igual.
 */
export interface LineaPedida {
  product_id: number;
  quantity: number;
  /** Precio vigente (product_prices). */
  precio: number;
  /** Tarifa de IVA en % (19, 5, 0). */
  tasa: number;
  nombre: string;
  sku?: string | null;
}

export interface ItemCotizado {
  product_id: number;
  product_name: string;
  product_sku: string | null;
  quantity: number;
  unit_price: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
}

export interface TotalesCotizados {
  subtotal: number;
  tax_total: number;
  discount_total: number;
  delivery_fee: number;
  tip_amount: number;
  total: number;
}

export interface Cotizacion {
  items: ItemCotizado[];
  totales: TotalesCotizados;
  antes: TotalesCotizados;
  delta: { subtotal: number; tax: number; shipping: number; total: number };
  impuestoSobreBase: boolean;
}

export type OrdenCotizable = Pick<WebOrder, 'subtotal' | 'tax_total' | 'discount_total' | 'delivery_fee' | 'tip_amount' | 'total' | 'delivery_type'> & {
  items?: Array<Pick<WebOrderItem, 'product_id' | 'quantity' | 'unit_price'>>;
};

const r2 = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export class CotizacionError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

export function envioRecalculado(order: OrdenCotizable, nuevo?: number | null): number {
  const tipo = String(order.delivery_type ?? '');
  if (tipo === 'pickup' || tipo === 'dine_in') return 0;
  if (nuevo !== undefined && nuevo !== null && Number.isFinite(Number(nuevo)) && Number(nuevo) >= 0) return r2(Number(nuevo));
  return r2(Math.max(num(order.delivery_fee), 0));
}

export function cotizarCambio(order: OrdenCotizable, lineas: LineaPedida[], envio?: { nuevo?: number | null }): Cotizacion {
  if (!Array.isArray(lineas) || lineas.length === 0) throw new CotizacionError('SIN_ITEMS');
  const sobreBase = impuestoVaSobreBase(order as Parameters<typeof impuestoVaSobreBase>[0]);

  // Cantidad y precio pagados por producto en el pedido original.
  const pagados = new Map<number, { qty: number; precio: number }>();
  for (const it of order.items ?? []) {
    if (!it.product_id) continue;
    const prev = pagados.get(it.product_id);
    const qty = num(it.quantity);
    if (prev) {
      // Precio promedio ponderado si el producto venía en varias líneas.
      const total = prev.qty * prev.precio + qty * num(it.unit_price);
      prev.qty += qty;
      prev.precio = prev.qty > 0 ? r2(total / prev.qty) : prev.precio;
    } else {
      pagados.set(it.product_id, { qty, precio: num(it.unit_price) });
    }
  }

  // Agrupar por producto (una línea por producto).
  const agrupadas = new Map<number, LineaPedida>();
  for (const l of lineas) {
    const qty = num(l.quantity);
    if (!l.product_id || qty <= 0) throw new CotizacionError('ITEM_INVALIDO', `Producto ${l.product_id}`);
    if (num(l.precio) < 0) throw new CotizacionError('PRECIO_INVALIDO', `Producto ${l.product_id}`);
    const prev = agrupadas.get(l.product_id);
    agrupadas.set(l.product_id, prev ? { ...prev, quantity: prev.quantity + qty } : { ...l, quantity: qty });
  }

  const items: ItemCotizado[] = [];
  // El subtotal suma el bruto exacto de cada línea (no cantidad × unitario redondeado: 32.000/3 × 3 ≠ 32.000).
  let subtotalBruto = 0;
  for (const l of Array.from(agrupadas.values())) {
    const pagado = pagados.get(l.product_id);
    const qtyAlPrecioPagado = pagado ? Math.min(pagado.qty, l.quantity) : 0;
    const qtyNueva = l.quantity - qtyAlPrecioPagado;
    const bruto = r2(qtyAlPrecioPagado * (pagado?.precio ?? 0) + qtyNueva * num(l.precio));
    const unit = l.quantity > 0 ? r2(bruto / l.quantity) : 0;
    subtotalBruto += bruto;
    const tasa = Math.max(num(l.tasa), 0);
    const impuesto = sobreBase ? r2(bruto * (tasa / 100)) : r2(bruto - bruto / (1 + tasa / 100));
    items.push({
      product_id: l.product_id,
      product_name: l.nombre,
      product_sku: l.sku ?? null,
      quantity: l.quantity,
      unit_price: unit,
      tax_amount: impuesto,
      discount_amount: 0,
      total: sobreBase ? r2(bruto + impuesto) : bruto,
    });
  }

  const subtotal = r2(subtotalBruto);
  const tax = r2(items.reduce((s, i) => s + i.tax_amount, 0));
  const descuento = r2(Math.min(Math.max(num(order.discount_total), 0), subtotal));
  const envioNuevo = envioRecalculado(order, envio?.nuevo);
  const propina = r2(Math.max(num(order.tip_amount), 0));
  const total = r2(subtotal - descuento + (sobreBase ? tax : 0) + envioNuevo + propina);

  const antes: TotalesCotizados = {
    subtotal: r2(num(order.subtotal)),
    tax_total: r2(num(order.tax_total)),
    discount_total: r2(num(order.discount_total)),
    delivery_fee: r2(num(order.delivery_fee)),
    tip_amount: propina,
    total: r2(num(order.total)),
  };
  const totales: TotalesCotizados = { subtotal, tax_total: tax, discount_total: descuento, delivery_fee: envioNuevo, tip_amount: propina, total };

  return {
    items,
    totales,
    antes,
    delta: {
      subtotal: r2(subtotal - antes.subtotal),
      tax: r2(tax - antes.tax_total),
      shipping: r2(envioNuevo - antes.delivery_fee),
      total: r2(total - antes.total),
    },
    impuestoSobreBase: sobreBase,
  };
}

export type SentidoDelta = 'cobrar' | 'devolver' | 'igual';
export function sentidoDelta(delta: number): SentidoDelta {
  if (delta > 0.004) return 'cobrar';
  if (delta < -0.004) return 'devolver';
  return 'igual';
}

/** Bloqueos por estado del pedido (mismo criterio que fn_web_order_change_crear). */
export function bloqueoPorEstado(order: { status: string; payment_status: string; table_session_id?: string | null }): string | null {
  if (order.payment_status !== 'paid') return 'PEDIDO_NO_PAGADO';
  if (['in_delivery', 'delivered'].includes(order.status)) return 'PEDIDO_DESPACHADO';
  if (['cancelled', 'rejected', 'refunded', 'expired'].includes(order.status)) return 'PEDIDO_CERRADO';
  if (order.table_session_id) return 'PEDIDO_DE_MESA';
  return null;
}

/**
 * Cómo se devuelve la diferencia a favor del cliente.
 *  - 'customer_credit': saldo a favor (credit_notes), requiere cliente.
 *  - 'manual': reembolso con nota crédito; el dinero se devuelve desde el panel de la pasarela
 *    (Wompi y Bold no tienen API de reembolso parcial) o a mano si el pago original fue MANUAL.
 *    Queda refund_status 'manual_pending' hasta que alguien lo marque hecho.
 * 'gateway' (reembolso automático por API) queda reservado: ninguna pasarela conectada en prod lo
 * permite en parcial (MercadoPago lo tendría, pero no hay conexiones de MercadoPago).
 */
export function modoReembolso(
  pedido: { payment_method?: string | null; payment_reference?: string | null; customer_id?: string | null },
  elegido?: 'refund' | 'customer_credit' | null,
): 'manual' | 'customer_credit' {
  if (elegido === 'customer_credit') {
    if (!pedido.customer_id) throw new CotizacionError('SALDO_SIN_CLIENTE');
    return 'customer_credit';
  }
  return 'manual';
}

/** ¿El pago original fue MANUAL («Marcar como pagado»)? Se muestra en el reembolso. */
export function pagoOriginalManual(pedido: { payment_reference?: string | null }): boolean {
  return /^MANUAL/i.test(String(pedido.payment_reference ?? ''));
}
