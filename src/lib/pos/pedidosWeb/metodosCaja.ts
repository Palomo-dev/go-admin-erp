/**
 * Métodos con que se cobra en la caja de la sede un pedido web pagado en el
 * local (`fn_cobrar_pedido_web_en_caja`, migración E4). Una sola lista para el
 * detalle del pedido, el cobro en lote y la casilla «Marcar como pagado» del
 * diálogo de confirmación.
 *
 * `nequi`, `daviplata` y `card` en `web_orders.payment_method` son de PASARELA:
 * el webhook de Wompi de la tienda (goadmin-websites
 * app/api/webhooks/wompi_co/route.ts) escribe `payment_method_type` en
 * minúsculas, y en prod (27-oct-2026) los 996 nequi, 99 daviplata y 62 card
 * tienen referencia de Wompi (salvo 1 nequi). En el diálogo de caja, `card`
 * sigue siendo el datáfono del local (`esMetodoCobroEnCaja`).
 *
 * Las PASARELAS (Wompi, ePayco, Mercado Pago, PayU, Stripe, PayPal, Bold,
 * Addi…) NO son un cobro de mostrador: antes caían en efectivo y un pedido ya
 * pagado en línea se cobraba otra vez en caja como CASH (WO-335-MVRDVAGK-MRHJ,
 * 27-oct). Ahora `metodoDeCobroEnCaja` devuelve `null` para ellas y quien llama
 * no cobra en caja.
 */
export const METODOS_COBRO_EN_CAJA = ['cash', 'card', 'transfer', 'qr'] as const;

export type MetodoCobroEnCaja = (typeof METODOS_COBRO_EN_CAJA)[number];

/** ¿Es un método que ofrece el diálogo de cobro en caja (lo elige el cajero)? */
export function esMetodoCobroEnCaja(metodo: string | null | undefined): metodo is MetodoCobroEnCaja {
  return (METODOS_COBRO_EN_CAJA as readonly string[]).includes(metodo ?? '');
}

/**
 * Códigos de pasarela de pago en línea. Mantener en sync con
 * `fn_metodo_es_pasarela` (migración 20261027241500). Fuentes:
 * - `payment_methods` en prod: wompi, mp, payu, stripe, paypal, bold_*, pse…
 * - goadmin-websites `checkout/init` escribe el código de la pasarela elegida:
 *   wompi, wompi_co, card, mp_checkout, payu_co, stripe_payments,
 *   paypal_checkout, bold_link.
 * - Cada webhook lo pisa con el submétodo: Wompi `payment_method_type`
 *   (card, nequi, pse, daviplata, bancolombia_*, su_plus…), Bold
 *   `payment_method` (card, credit_card, pse, nequi…), Mercado Pago
 *   `payment_method_id`/`payment_type_id` (visa, master, account_money…),
 *   Stripe `payment_method_types[0]` (card, link…), PayPal `payment_source`
 *   (paypal, card, venmo…), PayU `paymentMethod` (visa, pse, efecty…).
 * Como los submétodos no tienen fin, `pedidoEsDePasarela` además reconoce
 * cualquier método con referencia de la pasarela (pasarelas futuras).
 * `nequi`, `daviplata` y `card` siguen siendo métodos de caja del POS
 * (`esMetodoCobroEnCaja`, diálogo de cobro): esto solo clasifica PEDIDOS web.
 */
export const PASARELAS_DE_PAGO: ReadonlySet<string> = new Set([
  'wompi', 'wompi_co', 'epayco', 'mercadopago', 'mercado_pago', 'mp', 'mp_checkout', 'payu', 'payu_co',
  'stripe', 'stripe_payments', 'paypal', 'paypal_checkout', 'bold', 'bold_link', 'bold_qr', 'bold_card',
  'addi', 'pse', 'bancolombia_bnpl', 'bancolombia_collect', 'bancolombia_transfer',
  'boton_bancolombia', 'su_plus', 'nequi', 'daviplata', 'card', 'credit_card', 'debit_card', 'prepaid_card',
  'account_money', 'visa', 'master', 'mastercard', 'amex', 'diners', 'debvisa', 'debmaster', 'efecty',
  'link', 'venmo', 'apple_pay', 'google_pay', 'sistecredito', 'conekta', 'oxxo', 'openpay', 'kushki', 'dlocal',
]);

const PREFIJOS_PASARELA = ['wompi', 'bold_', 'mp_', 'payu_', 'stripe_', 'paypal_', 'mercadopago'];

/** Métodos de caja/mostrador: con referencia NO convierten el pedido en de pasarela. */
const METODOS_NO_PASARELA: ReadonlySet<string> = new Set([
  '', 'cash', 'efectivo', 'transfer', 'transferencia', 'qr', 'mesa', 'cash_on_delivery',
  'contraentrega', 'contra_entrega', 'credit', 'check', 'datafono',
]);

const normalizar = (m: string | null | undefined) => (m ?? '').trim().toLowerCase();

/** ¿El método es de una pasarela en línea (no un cobro de mostrador)? */
export function esMetodoDePasarela(metodo: string | null | undefined): boolean {
  const m = normalizar(metodo);
  return PASARELAS_DE_PAGO.has(m) || PREFIJOS_PASARELA.some((p) => m.startsWith(p));
}

/**
 * ¿El PEDIDO web vino de una pasarela? `web_orders` no tiene columna de
 * proveedor: método de la lista, o cualquier método con referencia de la
 * pasarela (los webhooks la escriben junto al submétodo) que no sea de caja.
 * Igual que `fn_pedido_web_es_pasarela` (migración 20261027241500).
 */
export function pedidoEsDePasarela(order: {
  payment_method?: string | null;
  payment_reference?: string | null;
}): boolean {
  if (esMetodoDePasarela(order.payment_method)) return true;
  const ref = (order.payment_reference ?? '').trim();
  return ref !== '' && ref.toUpperCase() !== 'MANUAL' && !METODOS_NO_PASARELA.has(normalizar(order.payment_method));
}

/**
 * Pedido de pasarela CANCELADO por pago fallido, sin venta ni mesa: Juan lo
 * puede marcar pagado igual que un vencido (fn_confirmar_pedido_web_completo
 * lo reactiva re-reservando el stock todo o nada, migración 20261027245000).
 */
export function canceladoPorPagoFallido(order: {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  sale_id?: string | null;
  table_session_id?: string | null;
}): boolean {
  return (
    order.status === 'cancelled' &&
    order.payment_status === 'failed' &&
    !order.sale_id &&
    !order.table_session_id &&
    pedidoEsDePasarela(order)
  );
}

/**
 * Método de caja para cobrar un pedido según su `payment_method`. `null` =
 * pedido de pasarela: NO se cobra en caja (ni en efectivo); se marca pagado
 * con `fn_marcar_pedido_web_pagado_pasarela`. Sin método o desconocido
 * (efectivo/contraentrega de la tienda): efectivo.
 */
export function metodoDeCobroEnCaja(
  metodoPedido: string | null | undefined,
  referenciaPedido?: string | null,
): MetodoCobroEnCaja | null {
  const m = normalizar(metodoPedido);
  if (pedidoEsDePasarela({ payment_method: m, payment_reference: referenciaPedido })) return null;
  if (esMetodoCobroEnCaja(m)) return m;
  return 'cash';
}

/**
 * Regla única: un pedido pagado por pasarela no se cobra en caja. Confirmarlo
 * es solo confirmarlo (también si estaba vencido).
 */
export function pedidoPagadoPorPasarela(order: {
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
}): boolean {
  return order.payment_status === 'paid' && pedidoEsDePasarela(order);
}

/**
 * ¿«Marcar como pagado» al confirmar debe cobrar en la caja? No si ya está
 * pagado ni si el método es de pasarela (se marca pagado por la pasarela, sin
 * caja, con factura y pago del método en línea).
 */
export function debeCobrarseEnCaja(order: {
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
}): boolean {
  return order.payment_status !== 'paid' && !pedidoEsDePasarela(order);
}

/**
 * ¿El detalle ofrece «Marcar como pagado» de un clic (pasarela, sin caja) en
 * vez de «Cobrar»? Pedido de pasarela (cualquiera) sin pagar, no de mesa ni
 * anulado. Un pendiente, vencido o cancelado por pago fallido se confirma
 * primero (re-reserva el stock) y luego se marca pagado.
 */
export function marcaPagadoPorPasarela(order: {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  sale_id?: string | null;
  table_session_id?: string | null;
}): boolean {
  if (canceladoPorPagoFallido(order)) return true;
  return (
    order.payment_status !== 'paid' &&
    pedidoEsDePasarela(order) &&
    !order.table_session_id &&
    !['cancelled', 'rejected', 'refunded'].includes(order.status ?? '')
  );
}
