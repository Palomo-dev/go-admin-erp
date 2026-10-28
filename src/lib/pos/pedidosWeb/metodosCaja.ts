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
 * Códigos de pasarela de pago en línea. Incluye los de `payment_methods` en
 * prod (wompi, stripe, paypal, mp, payu, bold_*, pse…) y los que llegan en
 * `web_orders.payment_method` (wompi_co, bancolombia_bnpl/collect, su_plus…).
 * Mantener en sync con `fn_metodo_es_pasarela` (migración 20261027241500).
 */
export const PASARELAS_DE_PAGO: ReadonlySet<string> = new Set([
  'wompi', 'wompi_co', 'epayco', 'mercadopago', 'mercado_pago', 'mp', 'payu', 'stripe', 'paypal',
  'bold', 'bold_link', 'bold_qr', 'bold_card', 'addi', 'pse', 'bancolombia_bnpl', 'bancolombia_collect',
  'bancolombia_transfer', 'su_plus', 'nequi', 'daviplata', 'card', 'sistecredito', 'conekta', 'oxxo', 'openpay', 'kushki', 'dlocal',
]);

const normalizar = (m: string | null | undefined) => (m ?? '').trim().toLowerCase();

/** ¿El método es de una pasarela en línea (no un cobro de mostrador)? */
export function esMetodoDePasarela(metodo: string | null | undefined): boolean {
  const m = normalizar(metodo);
  return PASARELAS_DE_PAGO.has(m) || m.startsWith('wompi') || m.startsWith('bold_');
}

/**
 * Método de caja para cobrar un pedido según su `payment_method`. `null` =
 * pedido de pasarela: NO se cobra en caja (ni en efectivo); se marca pagado
 * con `fn_marcar_pedido_web_pagado_pasarela`. Sin método o desconocido
 * (efectivo/contraentrega de la tienda): efectivo.
 */
export function metodoDeCobroEnCaja(metodoPedido: string | null | undefined): MetodoCobroEnCaja | null {
  const m = normalizar(metodoPedido);
  if (esMetodoDePasarela(m)) return null;
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
}): boolean {
  return order.payment_status === 'paid' && esMetodoDePasarela(order.payment_method);
}

/**
 * ¿«Marcar como pagado» al confirmar debe cobrar en la caja? No si ya está
 * pagado ni si el método es de pasarela (se marca pagado por la pasarela, sin
 * caja, con factura y pago del método en línea).
 */
export function debeCobrarseEnCaja(order: {
  payment_status?: string | null;
  payment_method?: string | null;
}): boolean {
  return order.payment_status !== 'paid' && !esMetodoDePasarela(order.payment_method);
}

/**
 * ¿El detalle ofrece «Marcar como pagado» de un clic (pasarela, sin caja) en
 * vez de «Cobrar»? Pedido de pasarela sin pagar, no de mesa ni anulado. Un
 * pendiente o vencido se confirma primero y luego se marca pagado.
 */
export function marcaPagadoPorPasarela(order: {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  table_session_id?: string | null;
}): boolean {
  return (
    order.payment_status !== 'paid' &&
    esMetodoDePasarela(order.payment_method) &&
    !order.table_session_id &&
    !['cancelled', 'rejected', 'refunded'].includes(order.status ?? '')
  );
}
