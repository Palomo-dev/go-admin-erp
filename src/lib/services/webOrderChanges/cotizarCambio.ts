import type { WebOrder, WebOrderItem } from '../webOrdersService';
import { impuestoVaSobreBase, prorratearCentavos } from '../webOrderTotals';

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
 *  - Descuento, con el mismo modelo que `repartirTotalesPedidoWeb`:
 *      · el de línea (promoción del producto) se conserva por unidad para las unidades que siguen;
 *        las unidades nuevas y los productos quitados no lo llevan;
 *      · el de pedido (cupón: discount_total menos lo que ya está en las líneas) se escala por la
 *        base elegible (neto de las líneas sin `promo_excluded`): nueva/antes, sin superar 1
 *        (agregar productos no agranda el cupón; quitar el producto con cupón lo reduce), y se
 *        prorratea en centavos entre las líneas elegibles, igual que en la factura.
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
  /** Se hereda del pedido original: una línea con la promoción quitada no recibe el cupón. */
  promo_excluded: boolean;
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
  items?: Array<Pick<WebOrderItem, 'product_id' | 'quantity' | 'unit_price'> & { discount_amount?: number | null; promo_excluded?: boolean | null }>;
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

  // Por producto en el pedido original: cantidad, precio pagado, descuento de línea por unidad
  // y si la promoción estaba quitada.
  const pagados = new Map<number, { qty: number; precio: number; descUnit: number; excluido: boolean }>();
  let descuentoEnItemsAntes = 0;
  let baseElegibleAntes = 0;
  for (const it of order.items ?? []) {
    const qty = num(it.quantity);
    const bruto = qty * num(it.unit_price);
    const desc = Math.min(Math.max(num(it.discount_amount), 0), bruto);
    descuentoEnItemsAntes += desc;
    if (!it.promo_excluded) baseElegibleAntes += bruto - desc;
    if (!it.product_id) continue;
    const prev = pagados.get(it.product_id);
    if (prev) {
      // Varias líneas del mismo producto: precio y descuento promedio ponderados.
      const totalQty = prev.qty + qty;
      prev.precio = totalQty > 0 ? (prev.qty * prev.precio + bruto) / totalQty : prev.precio;
      prev.descUnit = totalQty > 0 ? (prev.qty * prev.descUnit + desc) / totalQty : prev.descUnit;
      prev.qty = totalQty;
      prev.excluido = prev.excluido || Boolean(it.promo_excluded);
    } else {
      pagados.set(it.product_id, { qty, precio: num(it.unit_price), descUnit: qty > 0 ? desc / qty : 0, excluido: Boolean(it.promo_excluded) });
    }
  }
  const cuponAntes = Math.max(r2(num(order.discount_total) - descuentoEnItemsAntes), 0);

  // Agrupar por producto (una línea por producto).
  const agrupadas = new Map<number, LineaPedida>();
  for (const l of lineas) {
    const qty = num(l.quantity);
    if (!l.product_id || qty <= 0) throw new CotizacionError('ITEM_INVALIDO', `Producto ${l.product_id}`);
    if (num(l.precio) < 0) throw new CotizacionError('PRECIO_INVALIDO', `Producto ${l.product_id}`);
    const prev = agrupadas.get(l.product_id);
    agrupadas.set(l.product_id, prev ? { ...prev, quantity: prev.quantity + qty } : { ...l, quantity: qty });
  }

  // 1) Bruto y descuento de línea.
  const base = Array.from(agrupadas.values()).map((l) => {
    const pagado = pagados.get(l.product_id);
    const qtyAlPrecioPagado = pagado ? Math.min(pagado.qty, l.quantity) : 0;
    const qtyNueva = l.quantity - qtyAlPrecioPagado;
    // El subtotal suma el bruto exacto de cada línea (no cantidad × unitario redondeado).
    const bruto = r2(qtyAlPrecioPagado * (pagado?.precio ?? 0) + qtyNueva * num(l.precio));
    const descLinea = Math.min(r2(qtyAlPrecioPagado * (pagado?.descUnit ?? 0)), bruto);
    return { l, bruto, descLinea, excluido: pagado?.excluido ?? false };
  });

  // 2) Cupón escalado por la base elegible y prorrateado como en la factura.
  const baseElegibleNueva = base.reduce((s, b) => s + (b.excluido ? 0 : b.bruto - b.descLinea), 0);
  const factor = baseElegibleAntes > 0 ? Math.min(baseElegibleNueva / baseElegibleAntes, 1) : 0;
  const cuponNuevo = Math.min(r2(cuponAntes * factor), r2(baseElegibleNueva));
  const partes = prorratearCentavos(
    Math.round(cuponNuevo * 100),
    base.map((b) => (b.excluido ? 0 : Math.round((b.bruto - b.descLinea) * 100))),
  );

  const items: ItemCotizado[] = base.map((b, i) => {
    const descuento = r2(b.descLinea + partes[i] / 100);
    const tasa = Math.max(num(b.l.tasa), 0);
    // IVA sobre el bruto, como el pedido original (el descuento no cambia la tarifa).
    const impuesto = sobreBase ? r2(b.bruto * (tasa / 100)) : r2(b.bruto - b.bruto / (1 + tasa / 100));
    const neto = r2(b.bruto - descuento);
    return {
      product_id: b.l.product_id,
      product_name: b.l.nombre,
      product_sku: b.l.sku ?? null,
      quantity: b.l.quantity,
      unit_price: b.l.quantity > 0 ? r2(b.bruto / b.l.quantity) : 0,
      tax_amount: impuesto,
      discount_amount: descuento,
      total: sobreBase ? r2(neto + impuesto) : neto,
      promo_excluded: b.excluido,
    };
  });

  const subtotal = r2(base.reduce((s, b) => s + b.bruto, 0));
  const tax = r2(items.reduce((s, i) => s + i.tax_amount, 0));
  const descuento = r2(items.reduce((s, i) => s + i.discount_amount, 0));
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
