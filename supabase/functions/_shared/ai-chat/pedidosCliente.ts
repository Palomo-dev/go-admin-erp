/**
 * Pedidos del cliente final: extraccion de datos del chat y redaccion del
 * contexto que se le pasa al modelo. Modulo puro, sin acceso a base de datos,
 * para poder probarlo con Jest desde `src/__tests__`.
 *
 * Contexto (auditoria 2026-09-14): 88 de 88 preguntas por un pedido con correo
 * escrito en el chat se respondieron sin datos. Dos causas: el correo escrito
 * se ignoraba frente al `visitor_*@widget.local` de la conversacion, y solo se
 * miraba `invoice_sales` cuando el 88% de los pedidos viven en `web_orders`.
 */

export type MensajeChat = { content: string; role: string };

export type PedidoWeb = {
  order_number: string;
  status: string | null;
  payment_status: string | null;
  total: number | string | null;
  delivery_type?: string | null;
  delivery_partner?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  ready_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  estimated_delivery_at?: string | null;
};

export type Factura = {
  number: string | number;
  total: number | string | null;
  status: string | null;
  created_at: string;
};

const ZONA_POR_DEFECTO = 'America/Bogota';
// "4 de septiembre de 2026": un modelo puede leer "4/9/2026" como 9 de abril.
const FORMATO_FECHA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

/** Un correo ficticio que el widget asigna a cada visitante anonimo. */
export function esCorreoDelWidget(correo: string | null | undefined): boolean {
  return !!correo && correo.toLowerCase().includes('@widget.local');
}

/**
 * Numero de pedido escrito por el cliente. Los pedidos web tienen la forma
 * WO-<org>-<codigo>; se acepta en cualquier mayuscula/minuscula. Se toma el
 * mas reciente que haya dicho el cliente.
 */
export function extraerNumeroDePedido(mensajes: MensajeChat[]): string | null {
  const re = /\bWO-\d+-[A-Z0-9-]{4,}\b/gi;
  const delCliente = mensajes.filter((m) => m.role === 'customer').reverse();
  for (const msg of delCliente) {
    const coincidencias = (msg.content || '').match(re);
    if (coincidencias && coincidencias.length > 0) {
      return coincidencias[coincidencias.length - 1].toUpperCase().replace(/-+$/, '');
    }
  }
  return null;
}

/**
 * Correo real escrito por el cliente en el chat (el mas reciente). Los del
 * widget no cuentan: no identifican a nadie.
 */
export function extraerCorreoDelChat(mensajes: MensajeChat[]): string | null {
  return correosDelChat(mensajes)[0] ?? null;
}

/**
 * Todos los correos reales distintos que ha escrito el cliente, del mas
 * reciente al mas antiguo.
 */
export function correosDelChat(mensajes: MensajeChat[]): string[] {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const vistos = new Set<string>();
  const delCliente = mensajes.filter((m) => m.role === 'customer').reverse();
  for (const msg of delCliente) {
    for (const e of (msg.content || '').match(re) || []) {
      if (!esCorreoDelWidget(e)) vistos.add(e.toLowerCase());
    }
  }
  return [...vistos];
}

export const MAXIMO_CORREOS_POR_CONVERSACION = 2;

/**
 * Correo del chat por el que se permite buscar. Si el cliente ha ido probando
 * correos distintos (mas de `maximo` en la misma conversacion), se deja de
 * buscar por correo y se le pide el numero de pedido: el chat no es un oraculo
 * para enumerar quien compra en la tienda.
 */
export function decidirCorreoDelChat(
  mensajes: MensajeChat[],
  maximo = MAXIMO_CORREOS_POR_CONVERSACION,
): { correo: string | null; sondeo: boolean } {
  const correos = correosDelChat(mensajes);
  if (correos.length > maximo) return { correo: null, sondeo: true };
  return { correo: correos[0] ?? null, sondeo: false };
}

/**
 * Escapa los comodines de LIKE/ILIKE. Sin esto, `ana_perez@x.com` casa con
 * `ana.perez@x.com` (otra persona) y `%@gmail.com` devolveria los pedidos de
 * cualquier cliente de Gmail. 69 correos reales de `web_orders` llevan `_`.
 */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => '\\' + c);
}

/**
 * Correo por el que buscar pedidos: lo que el cliente escribio manda sobre el
 * registro de la conversacion, y el ficticio del widget nunca sirve.
 */
export function correoParaBuscar(
  correoDelChat: string | null,
  correoDeLaConversacion: string | null,
): string | null {
  if (correoDelChat && !esCorreoDelWidget(correoDelChat)) return correoDelChat;
  if (correoDeLaConversacion && !esCorreoDelWidget(correoDeLaConversacion)) return correoDeLaConversacion;
  return null;
}

/**
 * Estado del pedido web en palabras que el cliente entiende.
 * Valores reales verificados en `web_orders` (2026-09-14): status = expired |
 * cancelled | confirmed | pending; payment_status = failed | paid | pending;
 * delivery_type = delivery_own | pickup. Los demas (shipped, delivered, ready)
 * existen como columnas `*_at` y se contemplan por si el flujo los usa.
 */
export function describirEstadoPedido(p: PedidoWeb): string {
  if (p.cancelled_at || p.status === 'cancelled') return 'CANCELADO';
  if (p.status === 'expired') return 'EXPIRADO (el pago no se completó; el pedido no quedó registrado como compra)';
  if (p.delivered_at || p.status === 'delivered') return 'ENTREGADO';
  if (p.status === 'shipped' || p.status === 'in_transit') return 'EN CAMINO';
  if (p.ready_at || p.status === 'ready') return 'LISTO PARA ENTREGA/RECOGIDA';
  if (p.confirmed_at || p.status === 'confirmed') return 'CONFIRMADO, EN PREPARACIÓN';
  if (p.status === 'pending' && p.payment_status === 'paid') return 'PAGADO, PENDIENTE DE CONFIRMACIÓN';
  if (p.status === 'pending') return 'PENDIENTE DE PAGO';
  return String(p.status || 'desconocido').toUpperCase();
}

/**
 * Fecha calendario, en palabras, en la zona de la organizacion. Un timestamptz
 * de las 23:30 en Bogota es "mañana" en UTC; el cliente quiere el dia en que
 * compro.
 */
export function fechaEnZona(valor: string | null | undefined, zona: string | null | undefined): string {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  try {
    return fecha.toLocaleDateString('es-CO', { ...FORMATO_FECHA, timeZone: zona || ZONA_POR_DEFECTO });
  } catch {
    return fecha.toLocaleDateString('es-CO', { ...FORMATO_FECHA, timeZone: ZONA_POR_DEFECTO });
  }
}

function pesos(valor: number | string | null | undefined): string {
  return `$${Number(valor || 0).toLocaleString('es-CO')}`;
}

export const MAXIMO_PEDIDOS_MOSTRADOS = 3;

/**
 * Se muestran hasta `MAXIMO_PEDIDOS_MOSTRADOS`. Si llegan mas, se avisa: un
 * cliente con cinco pedidos que pregunta por el cuarto no debe oir "no
 * encuentro pedidos".
 */
export function formatearPedidosWeb(pedidos: PedidoWeb[], titulo: string, zona?: string | null): string {
  const hayMas = pedidos.length > MAXIMO_PEDIDOS_MOSTRADOS;
  const mostrados = hayMas ? pedidos.slice(0, MAXIMO_PEDIDOS_MOSTRADOS) : pedidos;
  const entregaLabel: Record<string, string> = {
    pickup: 'recoger en tienda',
    delivery_own: 'domicilio',
    delivery_third_party: 'transportadora',
  };
  let t = `${titulo}:\n`;
  for (const p of mostrados) {
    const pago = p.payment_status === 'paid' ? 'pagado' : p.payment_status === 'failed' ? 'pago fallido' : 'pago pendiente';
    const entrega = (p.delivery_type && entregaLabel[p.delivery_type]) || p.delivery_type || '';
    const transportadora = p.delivery_partner ? ` vía ${p.delivery_partner}` : '';
    const estimada = p.estimated_delivery_at ? ` | Entrega estimada: ${fechaEnZona(p.estimated_delivery_at, zona)}` : '';
    t += `- Pedido ${p.order_number} | ${pesos(p.total)} | ${describirEstadoPedido(p)} | ${pago} | ${entrega}${transportadora} | Fecha: ${fechaEnZona(p.created_at, zona)}${estimada}\n`;
  }
  if (hayMas) {
    t += `(Hay más pedidos con este correo; se muestran los ${MAXIMO_PEDIDOS_MOSTRADOS} más recientes. Si el cliente pregunta por otro, pídele el número de pedido WO-...)\n`;
  }
  t += `\n`;
  return t;
}

export function formatearFacturas(facturas: Factura[], zona?: string | null): string {
  let t = `FACTURAS DEL CLIENTE:\n`;
  for (const f of facturas) {
    t += `- Factura #${f.number} | ${pesos(f.total)} | Estado: ${f.status} | Fecha: ${fechaEnZona(f.created_at, zona)}\n`;
  }
  return t;
}
