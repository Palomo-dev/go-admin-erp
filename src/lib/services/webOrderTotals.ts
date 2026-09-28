import type { WebOrder, WebOrderItem } from './webOrdersService';
import type { ResolvedTax, ResolveTaxInput } from './taxResolverCore';

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
  tax_code: string | null;
  discount_amount: number;
  tax_included: boolean;
}

/** Líneas de `invoice_items` cuya suma reproduce `order.total` (salvo `diferencia`). */
export function lineasFacturaDesdePedidoWeb(
  order: WebOrder,
  invoiceId: string,
  reparto: RepartoPedidoWeb = repartirTotalesPedidoWeb(order),
): InvoiceItemWebInsert[] {
  const base = { invoice_id: invoiceId, invoice_sales_id: invoiceId, invoice_type: 'sale' as const, tax_included: false, tax_code: null };

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

/** Resolver único de impuesto por línea (F-42), con el cliente que corresponda al llamador. */
export type ResolverImpuestoLinea = (input: ResolveTaxInput) => Promise<ResolvedTax>;

/**
 * Modo de impuesto de la factura de un pedido web. `fn_recalc_invoice_totals`
 * lee `invoice_sales.tax_included` para derivar la base, así que la cabecera
 * tiene que llevar el mismo modo que sus líneas: si el total del pedido suma el
 * impuesto sobre el subtotal, no incluido; si no, el precio pagado ya lo trae.
 */
export function facturaWebConImpuestoIncluido(reparto: RepartoPedidoWeb): boolean {
  return !reparto.impuestoSobreBase;
}

/**
 * Tarifa que el pedido ya cobró en un ítem, derivada de `web_order_items.tax_amount`
 * (web_order_items no guarda tarifa ni código). null si el ítem no trae impuesto.
 */
function tarifaCobradaEnPedido(r: ItemPedidoRepartido, impuestoSobreBase: boolean): number | null {
  const impuesto = numero(r.item.tax_amount);
  if (impuesto <= 0 || r.bruto <= 0) return null;
  if (impuestoSobreBase) return r.tasaImpuesto;
  // Incluido: el bruto es base + impuesto.
  const base = r.bruto - impuesto;
  return base > 0 ? redondear2((impuesto / base) * 100) : null;
}

/**
 * Líneas de factura de un pedido web con el impuesto resuelto por el resolver
 * único (F-42): tarifa, código, modo y total_line de cada producto.
 *
 * - La tarifa que el pedido ya cobró (`tax_amount` del ítem) manda y es
 *   definitiva: la factura tiene que reproducir lo que la pasarela cobró.
 * - Si el pedido no trae ningún impuesto (`tax_total` = 0), el sitio no lo
 *   calculó: el resolver sigue con los impuestos del producto y los de la
 *   organización por defecto, y como el importe ya se cobró, el impuesto se
 *   extrae del precio (incluido) sin mover el total.
 * - Un ítem sin impuesto dentro de un pedido que sí lo trae es exento: 0 definitivo.
 *
 * El total de la línea es el del resolver. Si no coincide al centavo con lo que
 * se cobró (impuesto sobre la base con descuento de pedido prorrateado), manda
 * lo cobrado y se registra: descuadrar la factura contra el pago crearía una
 * cartera fantasma.
 */
export async function lineasFacturaWebConImpuesto(
  order: WebOrder,
  invoiceId: string,
  resolver: ResolverImpuestoLinea,
  reparto: RepartoPedidoWeb = repartirTotalesPedidoWeb(order),
): Promise<InvoiceItemWebInsert[]> {
  const lineas = lineasFacturaDesdePedidoWeb(order, invoiceId, reparto);
  const taxIncluded = facturaWebConImpuestoIncluido(reparto);
  const pedidoTraeImpuesto = numero(order.tax_total) > 0;

  const productos = await Promise.all(reparto.items.map(async (r, i) => {
    const linea = lineas[i];
    const tarifaCobrada = tarifaCobradaEnPedido(r, reparto.impuestoSobreBase);
    const resuelto = await resolver({
      itemTaxRate: tarifaCobrada ?? 0,
      itemTaxCode: null,
      itemTaxIsFinal: tarifaCobrada != null || pedidoTraeImpuesto,
      productId: r.item.product_id,
      organizationId: order.organization_id,
      taxIncluded,
      qty: linea.qty,
      unitPrice: linea.unit_price,
      discountAmount: linea.discount_amount,
    });

    let totalLine = resuelto.total_line;
    if (Math.abs(totalLine - r.total) > 0.01) {
      console.warn(
        `[webOrder] Pedido ${order.order_number}: la línea "${linea.description}" vale ${totalLine} con la regla de total_line pero se cobró ${r.total}; se factura lo cobrado.`,
      );
      totalLine = r.total;
    }

    return {
      ...linea,
      tax_rate: resuelto.tax_rate,
      tax_code: resuelto.tax_code,
      tax_included: resuelto.tax_included,
      total_line: totalLine,
    };
  }));

  // Envío y propina no son productos: sin impuesto, en el mismo modo que la factura.
  const otras = lineas.slice(reparto.items.length).map((l) => ({ ...l, tax_included: taxIncluded }));
  return [...productos, ...otras];
}

/** Línea de la factura original que copia una nota crédito (columnas de `invoice_items`). */
export interface LineaFacturaOriginal {
  id?: string;
  product_id: number | null;
  description: string | null;
  qty: number | string | null;
  unit_price: number | string | null;
  discount_amount: number | string | null;
  tax_rate: number | string | null;
  tax_code: string | null;
  total_line: number | string | null;
}

export interface NotaCreditoWebInput {
  creditNoteId: string;
  organizationId: number;
  orderNumber: string;
  /** Líneas de la factura del pedido (o, si no existe, las que la habrían formado). */
  lineasOriginales: LineaFacturaOriginal[];
  /** Modo de impuesto de la factura original (el de la cabecera de la nota). */
  taxIncluded: boolean;
  /** Reembolso parcial por ítems: producto y unidades devueltas. */
  itemsParciales?: Array<{ product_id: number; quantity: number }>;
  /** Reembolso parcial por valor, sin ítems: importe del reembolso. */
  montoParcial?: number | null;
}

/**
 * Líneas de la nota crédito de un reembolso web (importes positivos, como la
 * cabecera de esa nota). La nota revierte exactamente lo facturado: cada línea
 * copia la tarifa y el código de la línea original como definitivos (F-42) y
 * pasa por el resolver para el total.
 *
 * - Reembolso total: todas las líneas de la factura (productos, envío,
 *   propina), así la nota suma lo mismo que la factura.
 * - Parcial por ítems: las líneas de esos productos, con las unidades devueltas
 *   y la parte proporcional de su descuento.
 * - Parcial por valor: una línea de concepto por el importe, sin impuesto
 *   (definitivo), para que la nota valga lo reembolsado.
 */
export async function lineasNotaCreditoWeb(
  input: NotaCreditoWebInput,
  resolver: ResolverImpuestoLinea,
): Promise<InvoiceItemWebInsert[]> {
  const { creditNoteId, organizationId, orderNumber, lineasOriginales, taxIncluded, itemsParciales = [], montoParcial } = input;
  const base = { invoice_id: creditNoteId, invoice_sales_id: creditNoteId, invoice_type: 'sale' as const };

  if (montoParcial != null && itemsParciales.length === 0) {
    const monto = redondear2(Math.max(numero(montoParcial), 0));
    const resuelto = await resolver({
      itemTaxRate: 0,
      itemTaxCode: null,
      itemTaxIsFinal: true,
      productId: null,
      organizationId,
      taxIncluded,
      qty: 1,
      unitPrice: monto,
      discountAmount: 0,
    });
    return [{
      ...base,
      product_id: null,
      description: `Reembolso parcial - Pedido ${orderNumber}`.substring(0, 255),
      qty: 1,
      unit_price: monto,
      discount_amount: 0,
      tax_rate: resuelto.tax_rate,
      tax_code: resuelto.tax_code,
      tax_included: resuelto.tax_included,
      total_line: resuelto.total_line,
    }];
  }

  const seleccion = itemsParciales.length > 0
    ? lineasOriginales.flatMap((linea) => {
        const parcial = itemsParciales.find((pi) => linea.product_id != null && pi.product_id === linea.product_id);
        if (!parcial) return [];
        const qtyOriginal = numero(linea.qty);
        const qty = Math.min(numero(parcial.quantity) || qtyOriginal, qtyOriginal);
        return qty > 0 ? [{ linea, qty }] : [];
      })
    : lineasOriginales.map((linea) => ({ linea, qty: numero(linea.qty) }));

  return Promise.all(seleccion.map(async ({ linea, qty }) => {
    const qtyOriginal = numero(linea.qty);
    const completa = qty >= qtyOriginal;
    const descuentoOriginal = numero(linea.discount_amount);
    const descuento = completa || qtyOriginal === 0
      ? descuentoOriginal
      : redondear2((descuentoOriginal * qty) / qtyOriginal);
    const unitPrice = numero(linea.unit_price);

    const resuelto = await resolver({
      itemTaxRate: numero(linea.tax_rate),
      itemTaxCode: linea.tax_code,
      itemTaxIsFinal: true,
      productId: linea.product_id,
      organizationId,
      taxIncluded,
      qty,
      unitPrice,
      discountAmount: descuento,
    });

    // Línea devuelta completa que no seguía la regla de total_line: manda lo
    // facturado, para que la nota lo anule al centavo.
    let totalLine = resuelto.total_line;
    const totalOriginal = numero(linea.total_line);
    if (completa && Math.abs(totalLine - totalOriginal) > 0.01) {
      console.warn(
        `[webOrder] Nota crédito del pedido ${orderNumber}: la línea "${linea.description}" se facturó por ${totalOriginal} y la regla de total_line da ${totalLine}; se revierte lo facturado.`,
      );
      totalLine = totalOriginal;
    }

    return {
      ...base,
      product_id: linea.product_id,
      description: `Devolución: ${linea.description || 'Producto web'}`.substring(0, 255),
      qty,
      unit_price: unitPrice,
      discount_amount: descuento,
      tax_rate: resuelto.tax_rate,
      tax_code: resuelto.tax_code,
      tax_included: resuelto.tax_included,
      total_line: totalLine,
    };
  }));
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
