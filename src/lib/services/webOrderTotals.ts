import type { WebOrder, WebOrderItem } from './webOrdersService';

/**
 * Reparto de los totales de un pedido web en líneas de venta/factura.
 *
 * Por qué existe: el trigger `fn_recalc_invoice_totals` (sobre `invoice_items`)
 * pisa `invoice_sales.total` con `SUM(total_line)` de las líneas. Todo lo que
 * no esté representado en una línea desaparece de la factura. El sitio web
 * aplica cupones y promociones **a nivel de pedido** (`web_orders.discount_total`)
 * con `web_order_items.discount_amount = 0`, así que la factura salía por el
 * bruto, el pago de la pasarela quedaba "parcial" y nacía una cuenta por
 * cobrar fantasma por el importe del descuento (FACT-0207: 102.200 facturados,
 * 86.200 pagados, 16.000 "pendientes" que nadie debía).
 *
 * En el POS todo descuento vive en la línea (`sale.discount_total =
 * SUM(item.discount_amount)`), así que aquí se hace lo mismo: el descuento de
 * pedido que no esté ya en los ítems se prorratea entre ellos en proporción a
 * su neto, con el redondeo en la última línea para que la suma cuadre al
 * centavo. Envío y propina van como líneas propias, igual que ya hacía el
 * envío. Todo el cálculo es puro para poder testearlo sin base de datos.
 */

export interface ItemPedidoRepartido {
  item: WebOrderItem;
  /** qty * unit_price, antes de descuentos. */
  bruto: number;
  /** Descuento del ítem + su parte del descuento de pedido. */
  descuento: number;
  /** bruto - descuento. Es la base que el trigger usa como subtotal. */
  neto: number;
  /** Impuesto que se suma sobre el neto. 0 si el impuesto va incluido en el precio. */
  impuesto: number;
  /** Porcentaje informativo para `invoice_items.tax_rate`. */
  tasaImpuesto: number;
  /** Lo que la línea aporta al total: neto + impuesto. */
  total: number;
}

export interface RepartoPedidoWeb {
  items: ItemPedidoRepartido[];
  envio: number;
  propina: number;
  /** true cuando `web_orders.total` suma el impuesto por encima del subtotal. */
  impuestoSobreBase: boolean;
  /** Suma de todas las líneas (ítems + envío + propina). */
  totalLineas: number;
  /** `order.total - totalLineas`. Debe ser 0; si no, el pedido trae un componente desconocido. */
  diferencia: number;
}

const redondear2 = (n: number): number => Math.round(n * 100) / 100;
const centavos = (n: number): number => Math.round(n * 100);
const numero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Prorratea `montoCentavos` entre `pesos` (en centavos) en proporción, sin
 * superar cada peso y dejando el residuo del redondeo en la última posición
 * con capacidad. Devuelve las partes en centavos.
 */
function prorratearCentavos(montoCentavos: number, pesos: number[]): number[] {
  const partes = pesos.map(() => 0);
  const totalPesos = pesos.reduce((s, p) => s + Math.max(p, 0), 0);
  if (montoCentavos <= 0 || totalPesos <= 0) return partes;

  let restante = montoCentavos;
  for (let i = 0; i < pesos.length; i++) {
    const peso = Math.max(pesos[i], 0);
    const parte = Math.min(Math.floor((montoCentavos * peso) / totalPesos), peso);
    partes[i] = parte;
    restante -= parte;
  }
  // El residuo del redondeo se reparte de atrás hacia delante sin pasar el peso.
  for (let i = pesos.length - 1; i >= 0 && restante > 0; i--) {
    const capacidad = Math.max(pesos[i], 0) - partes[i];
    const extra = Math.min(capacidad, restante);
    partes[i] += extra;
    restante -= extra;
  }
  return partes;
}

/**
 * Detecta si el total del pedido lleva el impuesto sumado por encima del
 * subtotal (impuesto NO incluido en el precio). `web_orders` no guarda esa
 * bandera; se infiere comparando qué fórmula reproduce mejor `order.total`.
 */
function impuestoVaSobreBase(order: Pick<WebOrder, 'subtotal' | 'tax_total' | 'discount_total' | 'delivery_fee' | 'tip_amount' | 'total'>): boolean {
  const impuesto = numero(order.tax_total);
  if (impuesto <= 0) return false;
  const base = numero(order.subtotal) - numero(order.discount_total) + numero(order.delivery_fee) + numero(order.tip_amount);
  const total = numero(order.total);
  return Math.abs(base + impuesto - total) < Math.abs(base - total);
}

export function repartirTotalesPedidoWeb(order: WebOrder): RepartoPedidoWeb {
  const items = order.items || [];
  const impuestoSobreBase = impuestoVaSobreBase(order);

  const brutos = items.map((it) => redondear2(numero(it.quantity) * numero(it.unit_price)));
  const descuentosItem = items.map((it, i) => Math.min(Math.max(numero(it.discount_amount), 0), brutos[i]));
  const netosPrevios = items.map((_, i) => redondear2(brutos[i] - descuentosItem[i]));

  // Descuento de pedido (cupón/promoción) que no está ya en los ítems.
  const descuentoEnItems = descuentosItem.reduce((s, d) => s + d, 0);
  const residuo = Math.max(redondear2(numero(order.discount_total) - descuentoEnItems), 0);
  const partes = prorratearCentavos(centavos(residuo), netosPrevios.map(centavos));

  const repartidos: ItemPedidoRepartido[] = items.map((item, i) => {
    const descuento = redondear2(descuentosItem[i] + partes[i] / 100);
    const neto = redondear2(brutos[i] - descuento);
    const impuesto = impuestoSobreBase ? redondear2(numero(item.tax_amount)) : 0;
    const tasaImpuesto = impuestoSobreBase && brutos[i] > 0
      ? redondear2((numero(item.tax_amount) / brutos[i]) * 100)
      : 0;
    return {
      item,
      bruto: brutos[i],
      descuento,
      neto,
      impuesto,
      tasaImpuesto,
      total: redondear2(neto + impuesto),
    };
  });

  const envio = Math.max(numero(order.delivery_fee), 0);
  const propina = Math.max(numero(order.tip_amount), 0);
  const totalLineas = redondear2(repartidos.reduce((s, r) => s + r.total, 0) + envio + propina);

  return {
    items: repartidos,
    envio,
    propina,
    impuestoSobreBase,
    totalLineas,
    diferencia: redondear2(numero(order.total) - totalLineas),
  };
}

export interface InvoiceItemWebInsert {
  invoice_id: string;
  invoice_sales_id: string;
  invoice_type: 'sale';
  product_id: number | null;
  description: string;
  qty: number;
  unit_price: number;
  total_line: number;
  tax_rate: number;
  discount_amount: number;
  tax_included: false;
}

/** Líneas de `invoice_items` cuya suma reproduce `order.total` (salvo `diferencia`). */
export function lineasFacturaDesdePedidoWeb(
  order: WebOrder,
  invoiceId: string,
  reparto: RepartoPedidoWeb = repartirTotalesPedidoWeb(order),
): InvoiceItemWebInsert[] {
  const base = { invoice_id: invoiceId, invoice_sales_id: invoiceId, invoice_type: 'sale' as const, tax_included: false as const };

  const lineas: InvoiceItemWebInsert[] = reparto.items.map((r) => ({
    ...base,
    product_id: r.item.product_id,
    description: (r.item.product_name || 'Producto web').substring(0, 255),
    qty: numero(r.item.quantity),
    unit_price: numero(r.item.unit_price),
    total_line: r.total,
    tax_rate: r.tasaImpuesto,
    discount_amount: r.descuento,
  }));

  if (reparto.envio > 0) {
    lineas.push({
      ...base,
      product_id: null,
      description: 'Envío (Delivery)',
      qty: 1,
      unit_price: reparto.envio,
      total_line: reparto.envio,
      tax_rate: 0,
      discount_amount: 0,
    });
  }

  if (reparto.propina > 0) {
    lineas.push({
      ...base,
      product_id: null,
      description: 'Propina',
      qty: 1,
      unit_price: reparto.propina,
      total_line: reparto.propina,
      tax_rate: 0,
      discount_amount: 0,
    });
  }

  return lineas;
}

/**
 * Aviso único para los dos servicios de confirmación: si las líneas no
 * reproducen el total del pedido, la factura va a quedar con saldo (o con
 * sobrepago) aunque la pasarela haya cobrado todo. Se registra, no se bloquea.
 */
export function avisarSiNoCuadra(reparto: RepartoPedidoWeb, order: Pick<WebOrder, 'order_number' | 'total'>): void {
  if (reparto.diferencia === 0) return;
  console.error(
    `[webOrder] Las líneas del pedido ${order.order_number} suman ${reparto.totalLineas} pero el pedido vale ${numero(order.total)} (diferencia ${reparto.diferencia}). La factura quedará descuadrada.`,
  );
}
