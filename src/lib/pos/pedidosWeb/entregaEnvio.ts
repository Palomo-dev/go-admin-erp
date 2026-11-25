/**
 * Pedido online — tarjeta «Entrega» con el envío real (Figma «05 POS y ventas», sección
 * 3236-223013: computador 3236-223044, celular 3236-223322, «Ver guía» 3238-228068, nueve estados
 * 3239-226714, historial sincronizado 3239-355997, lámina 3239-356273). Aprobado por el dueño el
 * 2026-11-25. Puro: sin React ni Supabase; lo prueba __tests__/entregaEnvio.test.ts.
 *
 * Decisiones aprobadas:
 * 1. El número que se muestra es SIEMPRE la guía (`shipments.shipment_number`, DEL-WO-…), la misma
 *    impresa en la caja. El `tracking_number` interno (TRK…) nunca se pinta; en envíos por
 *    transportadora ese campo guarda la guía del tercero y solo así se muestra (como en el rótulo).
 * 2. UNA sola línea de historial: los hitos del envío (`transport_events` y los timestamps de
 *    `shipments`) entran en el historial del pedido con su hora real y su fuente.
 * 3. Cambiar domiciliario solo antes de «En camino»; después, desde Logística con motivo.
 * 4. «Marcar entregado» con envío activo abre el registro de entrega de Logística: el pedido y el
 *    envío nunca divergen (la regla de sincronización vive en la base).
 */
import { canonicoDeEstado, ESTADOS_ASIGNABLES, puedeEntregarse, type EstadoCanonico } from '@/lib/logistica/estadosEnvio';
import { lineaDeTiempo, type EventoLinea } from '@/lib/logistica/detalleEnvio';
import { contraentregaPendiente } from '@/lib/logistica/rotuloEnvio';
import { cobrarAlEntregar, esPedidoContraentrega, estadoAnticipo, type PedidoContraentrega } from './contraentregaPedido';

/** Los nueve estados de la tarjeta (Figma 3239-226714, 04a–04i). */
export type EstadoTarjetaEntrega =
  | 'sin_envio'
  | 'por_despachar'
  | 'asignado'
  | 'en_camino'
  | 'entregado'
  | 'novedad'
  | 'devuelto'
  | 'cancelado'
  | 'recoger';

/** Estado de la tarjeta según `shipments.status` (tabla «Estado del envío → lo que dice la tarjeta»). */
export function estadoTarjetaEntrega(statusEnvio: string | null | undefined, recoger: boolean): EstadoTarjetaEntrega {
  if (!statusEnvio) return recoger ? 'recoger' : 'sin_envio';
  switch (statusEnvio) {
    case 'draft':
    case 'pending':
    case 'ready':
    case 'ready_for_pickup':
      return 'por_despachar';
    case 'assigned':
    case 'picked':
      return 'asignado';
    case 'dispatched':
    case 'in_transit':
    case 'out_for_delivery':
      return 'en_camino';
    case 'delivered':
      return 'entregado';
    case 'failed_attempt':
    case 'failed':
      return 'novedad';
    case 'returned':
      return 'devuelto';
    case 'cancelled':
      return 'cancelado';
    default:
      return 'por_despachar';
  }
}

const FINALES = new Set(['delivered', 'returned', 'cancelled']);

/** Envío que sigue vivo: la tarjeta va bajo «Acciones» y «Marcar entregado» abre Logística. */
export function envioActivo(statusEnvio: string | null | undefined): boolean {
  return !!statusEnvio && !FINALES.has(statusEnvio);
}

/** Estados en que el envío aún no salió: el domiciliario se cambia desde el pedido (decisión 3). */
const ANTES_DE_SALIR = new Set(['draft', 'pending', 'ready', 'ready_for_pickup', 'assigned']);

/** ¿Se puede asignar o cambiar el domiciliario desde el pedido? Solo domicilio propio y antes de «En camino». */
export function puedeCambiarDomiciliario(e: { status: string | null | undefined; modo: string | null | undefined }): boolean {
  const s = String(e.status ?? '');
  return e.modo === 'own' && ANTES_DE_SALIR.has(s) && (ESTADOS_ASIGNABLES as readonly string[]).includes(s);
}

/**
 * Qué hace «Marcar entregado» del pedido (decisión 4):
 * - `pedido`: sin envío activo, como siempre (solo el pedido).
 * - `logistica`: abre el registro de entrega del envío (prueba, código, cobro).
 * - `bloqueado`: el envío existe pero aún no puede entregarse (sin listo para salir); no se marca
 *   solo el pedido para que no diverjan.
 */
export function accionMarcarEntregado(statusEnvio: string | null | undefined): 'pedido' | 'logistica' | 'bloqueado' {
  if (!envioActivo(statusEnvio)) return 'pedido';
  return puedeEntregarse(statusEnvio) ? 'logistica' : 'bloqueado';
}

const MODOS_TRANSPORTADORA = new Set(['national_carrier', 'last_mile', 'marketplace']);

/** ¿El envío va con una transportadora? (mismo criterio del rótulo). */
export function esTransportadora(e: { modo?: string | null; deliveryType?: string | null }): boolean {
  return e.deliveryType === 'delivery_third_party' || MODOS_TRANSPORTADORA.has(String(e.modo ?? ''));
}

const esHttp = (v: string): boolean => /^https?:\/\//i.test(v);

/**
 * Enlace para rastrear en la transportadora: el del envío si lo trae; si no, la plantilla de la
 * transportadora con su guía (`{tracking_number}`, `{tracking}` o `{guia}`). Solo http(s).
 */
export function enlaceRastreoTransportadora(
  externa: string | null | undefined,
  plantilla: string | null | undefined,
  guia: string | null | undefined,
): string | null {
  const url = (externa ?? '').trim();
  if (url && esHttp(url)) return url;
  const p = (plantilla ?? '').trim();
  const g = (guia ?? '').trim();
  if (!p || !g || !esHttp(p) || !/\{(tracking_number|tracking|guia)\}/.test(p)) return null;
  return p.replace(/\{(tracking_number|tracking|guia)\}/g, encodeURIComponent(g));
}

/** Lo que dice la caja de cobro de la tarjeta. */
export type CobroEntrega =
  | { tipo: 'cobrar'; monto: number; total: number; anticipo: number }
  | { tipo: 'cobrado'; monto: number; metodo: string | null }
  | { tipo: 'pagado' };

export interface EnvioParaCobro {
  cod_amount?: number | string | null;
  cod_status?: string | null;
  cod_collected_amount?: number | string | null;
  cod_collected_method?: string | null;
}

/**
 * «Cobrar al entregar $ saldo» (ya restado el anticipo pagado), «Cobrado» o «Pagado · no cobrar».
 * Manda el envío (su contraentrega es lo que cobra el domiciliario); sin contraentrega en el envío,
 * el pedido contraentrega sin pagar (o el de recoger sin pagar) dice su saldo.
 */
export function cobroDeEntrega(order: PedidoContraentrega, envio: EnvioParaCobro | null, recoger = false): CobroEntrega {
  const total = Number(order.total) || 0;
  const anticipo = estadoAnticipo(order) === 'pagado' ? Number(order.advance_amount) || 0 : 0;
  if (envio && (envio.cod_status === 'collected' || envio.cod_status === 'remitted')) {
    const monto = Number(envio.cod_collected_amount) || Number(envio.cod_amount) || 0;
    if (monto > 0) return { tipo: 'cobrado', monto, metodo: envio.cod_collected_method ?? null };
  }
  const pendiente = envio ? contraentregaPendiente(envio) : 0;
  if (pendiente > 0) return { tipo: 'cobrar', monto: pendiente, total, anticipo };
  if (order.payment_status === 'paid') return { tipo: 'pagado' };
  const vencido = estadoAnticipo(order) === 'vencido';
  if (!vencido && (esPedidoContraentrega(order) || (recoger && !envio))) {
    const monto = cobrarAlEntregar(order);
    if (monto > 0) return { tipo: 'cobrar', monto, total, anticipo };
  }
  return { tipo: 'pagado' };
}

// ── Historial sincronizado (Figma 3239-355997) ────────────────────────────────────

export interface EnvioParaHistorial {
  status: string;
  modo: string | null;
  assigned_at?: string | null;
  picked_at?: string | null;
  dispatched_at?: string | null;
  delivered_at?: string | null;
}

export interface HitoEnvio {
  clave: string;
  canonico: EstadoCanonico;
  /** `hecho`/`fallo` ya pasaron; `actual` es el último; `pendiente` sale gris. */
  estado: 'hecho' | 'fallo' | 'actual' | 'pendiente';
  hora: string | null;
  motivo: string | null;
  /** Número del intento cuando «en camino» se repite (2.º intento…). */
  intento: number | null;
  /** Fuente del hito: `logistica` o la transportadora (eventos que reporta el tercero). */
  fuente: 'logistica' | 'transportadora';
}

/** Hitos que el envío reporta al historial del pedido. «Creado» no: el pedido ya tiene «Recibido». */
const HITOS_DEL_PEDIDO: ReadonlySet<EstadoCanonico> = new Set([
  'ready_for_pickup', 'assigned', 'picked', 'in_transit', 'out_for_delivery', 'failed_attempt', 'delivered', 'exception', 'returned', 'cancelled',
]);
/** Pasos por venir que se muestran en gris (los intermedios no: el historial no es una lista de tareas). */
const PENDIENTES_VISIBLES: ReadonlySet<EstadoCanonico> = new Set(['out_for_delivery', 'delivered']);
/** Lo que reporta la transportadora; lo anterior (listo, asignado, recogido) es de Logística. */
const DE_LA_TRANSPORTADORA: ReadonlySet<EstadoCanonico> = new Set(['in_transit', 'out_for_delivery', 'failed_attempt', 'delivered', 'exception', 'returned']);

/**
 * Hitos del envío para el historial del pedido: los `transport_events` con su hora real y, si un
 * hito no tiene evento (envíos anteriores a los eventos), el timestamp de `shipments`
 * (`assigned_at`, `picked_at`, `dispatched_at`, `delivered_at`). Usa la línea de tiempo de
 * Logística (`lineaDeTiempo`), así el pedido y el envío cuentan lo mismo.
 */
export function hitosDelEnvio(eventos: readonly EventoLinea[], envio: EnvioParaHistorial, deliveryType?: string | null): HitoEnvio[] {
  const tercero = esTransportadora({ modo: envio.modo, deliveryType });
  const conEvento = new Set(eventos.map((e) => canonicoDeEstado(e.canonical_status) ?? canonicoDeEstado(e.event_type)).filter(Boolean));
  const sinteticos: EventoLinea[] = [];
  const agregar = (canonico: EstadoCanonico, hora: string | null | undefined) => {
    if (!hora || conEvento.has(canonico)) return;
    conEvento.add(canonico);
    sinteticos.push({ id: `envio-${canonico}`, event_time: hora, canonical_status: canonico, event_type: canonico, reason_code: null, description: null, provider_status: null });
  };
  agregar('assigned', envio.assigned_at);
  agregar('picked', envio.picked_at);
  // Domicilio propio: «despachado» es salir a entregar; con transportadora, quedar en tránsito.
  if (!(tercero ? conEvento.has('out_for_delivery') : conEvento.has('in_transit'))) agregar(tercero ? 'in_transit' : 'out_for_delivery', envio.dispatched_at);
  agregar('delivered', envio.delivered_at);

  return lineaDeTiempo([...eventos, ...sinteticos], envio.status)
    .filter((p) => HITOS_DEL_PEDIDO.has(p.canonico) && (p.estado !== 'pendiente' || PENDIENTES_VISIBLES.has(p.canonico)))
    .map((p) => ({
      clave: p.clave,
      canonico: p.canonico,
      estado: p.estado,
      hora: p.hora,
      motivo: p.motivo,
      intento: p.intento,
      fuente: tercero && DE_LA_TRANSPORTADORA.has(p.canonico) ? 'transportadora' : 'logistica',
    }));
}

/** Momento del aviso al cliente que dispara cada hito (para poner sus chips debajo). */
export function momentoAvisoDeHito(canonico: EstadoCanonico): 'listo' | 'en_camino' | 'entregado' | null {
  if (canonico === 'ready_for_pickup') return 'listo';
  if (canonico === 'out_for_delivery') return 'en_camino';
  if (canonico === 'delivered') return 'entregado';
  return null;
}
