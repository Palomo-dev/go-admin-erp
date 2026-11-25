/**
 * Pagos del pedido online: método elegido e intentos (diseño aprobado 2026-11-24,
 * `docs/disenos-pagos-intentos-2026-11-24`). Puro (sin React ni Supabase): lo prueba
 * `__tests__/intentosPago.test.ts`.
 *
 * De dónde sale (verificado por MCP, 2026-11-24):
 * - `web_order_payment_attempts`: un renglón por aviso de la pasarela (o de la tienda al crear el
 *   enlace, o de `expire_pending_web_orders` al vencer). `concept` = 'order' | 'advance' (anticipo
 *   de una contraentrega). Bold no manda motivo ni «pendiente»; Mercado Pago manda `status_detail`
 *   en `reason_code` (se traduce aquí); Wompi manda `status_message` en `reason` (se muestra tal cual).
 * - `fn_web_orders_resumen_pago(uuid[])`: `vence_at` con la misma regla del vencimiento real, el
 *   plazo y el último intento de cada pedido (para el listado).
 *
 * Tras un rechazo el pedido NO se cancela: sigue `pending` con `payment_status = 'failed'` y su
 * reserva hasta vencer; al vencer queda `expired` con `payment_status = 'failed'`.
 */
import { toPlainDate } from '@/lib/utils/dateDisplay';
import { esPedidoContraentrega, estadoAnticipo, minutosParaVencer, tieneAnticipo, type PedidoContraentrega } from './contraentregaPedido';
import { pedidoEsDePasarela } from './metodosCaja';
import {
  NOMBRE_PASARELA,
  marcaDeTarjeta,
  pasarelaDeCodigo,
  submetodoDeCodigo,
  type Pasarela,
  type Submetodo,
} from './pagosDelPedido';

// ── Tipos de la base ──────────────────────────────────────────────────────────────────────────

export const EVENTOS_INTENTO = ['link_created', 'pending', 'approved', 'declined', 'error', 'voided', 'expired'] as const;
export type EventoIntento = (typeof EVENTOS_INTENTO)[number];
export type ConceptoIntento = 'order' | 'advance';

/** Fila de `public.web_order_payment_attempts` (solo sus columnas). */
export interface IntentoPago {
  id: string;
  organization_id: number;
  web_order_id: string;
  concept: ConceptoIntento;
  gateway: string | null;
  event: EventoIntento;
  reason: string | null;
  reason_code: string | null;
  method: string | null;
  card_brand: string | null;
  card_last4: string | null;
  bank: string | null;
  reference: string | null;
  amount: number | string | null;
  currency: string | null;
  created_at: string;
}

/** Columnas que se leen de la tabla (nunca `*`). */
export const COLUMNAS_INTENTO =
  'id, organization_id, web_order_id, concept, gateway, event, reason, reason_code, method, card_brand, card_last4, bank, reference, amount, currency, created_at';

/** Fila de `fn_web_orders_resumen_pago`. */
export interface ResumenPago {
  web_order_id: string;
  vence_at: string | null;
  plazo_minutos: number | null;
  intentos: number;
  ultimo_evento: EventoIntento | null;
  ultima_pasarela: string | null;
  ultimo_motivo: string | null;
  ultimo_codigo_motivo: string | null;
  ultimo_medio: string | null;
}

/** Lo que la tarjeta lee del pedido. */
export interface PedidoPago extends PedidoContraentrega {
  status?: string | null;
  payment_status?: string | null;
  payment_method?: string | null;
  payment_method_detail?: string | null;
  payment_reference?: string | null;
  created_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  stock_released_at?: string | null;
  /** Pasarela del anticipo de una contraentrega. */
  advance_gateway?: string | null;
}

// ── Estados A–G ───────────────────────────────────────────────────────────────────────────────

/**
 * Estado de la tarjeta «Pagos» (diseño, capturas 01 y 02):
 * - A Esperando pago: pendiente, pasarela elegida, sin intento en curso ni rechazo.
 * - B Pago en proceso: el último intento es `pending` (PSE esperando al banco…).
 * - C / C2 Pago rechazado: pendiente con `payment_status = 'failed'`; C con motivo, C2 sin él (Bold).
 * - D Pagado: pagado por pasarela; la tarjeta de hoy más el historial.
 * - E Venció sin pagar: `expired` sin cobro.
 * - F Contraentrega con anticipo: solo los intentos del anticipo.
 * - G Transferencia sin pasarela: «Esperando comprobante» (vence en 24 h).
 * `null`: la tarjeta de hoy, sin cambios (efectivo, confirmados sin pagar, cancelados…).
 */
export type EstadoTarjetaPagos = 'A' | 'B' | 'C' | 'C2' | 'D' | 'E' | 'F' | 'G';

/** Eventos que cuentan como intento del cliente (no el enlace creado ni el vencimiento). */
const EVENTOS_REALES: ReadonlySet<EventoIntento> = new Set(['pending', 'approved', 'declined', 'error', 'voided']);
const RECHAZOS: ReadonlySet<EventoIntento> = new Set(['declined', 'error', 'voided']);

/** Métodos de transferencia que se confirman a mano con el comprobante (estado G). */
const METODOS_TRANSFERENCIA: ReadonlySet<string> = new Set([
  'transfer', 'transferencia', 'transferencia_bancaria', 'bank_transfer', 'consignacion',
]);

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function esEventoReal(e: EventoIntento): boolean {
  return EVENTOS_REALES.has(e);
}

export function esRechazo(e: EventoIntento | null | undefined): boolean {
  return !!e && RECHAZOS.has(e);
}

/** Intentos de un concepto, del más viejo al más nuevo. */
export function intentosDelConcepto(intentos: readonly IntentoPago[], concepto: ConceptoIntento): IntentoPago[] {
  return intentos
    .filter((i) => (i.concept ?? 'order') === concepto)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** Último intento del concepto, sin contar el vencimiento. */
export function ultimoIntento(intentos: readonly IntentoPago[], concepto: ConceptoIntento = 'order'): IntentoPago | null {
  const lista = intentosDelConcepto(intentos, concepto).filter((i) => i.event !== 'expired');
  return lista.length ? lista[lista.length - 1] : null;
}

/** Último rechazo (rechazado, error o anulado) del concepto. */
export function ultimoRechazo(intentos: readonly IntentoPago[], concepto: ConceptoIntento = 'order'): IntentoPago | null {
  const lista = intentosDelConcepto(intentos, concepto).filter((i) => RECHAZOS.has(i.event));
  return lista.length ? lista[lista.length - 1] : null;
}

/** Cuántos intentos reales hubo (pendiente, aprobado, rechazado, error, anulado). */
export function contarIntentos(intentos: readonly IntentoPago[], concepto: ConceptoIntento = 'order'): number {
  return intentosDelConcepto(intentos, concepto).filter((i) => EVENTOS_REALES.has(i.event)).length;
}

/** ¿El intento trae motivo (texto de Wompi o código de Mercado Pago)? */
export function tieneMotivo(i: Pick<IntentoPago, 'reason' | 'reason_code'> | null | undefined): boolean {
  return !!(i && ((i.reason ?? '').trim() || (i.reason_code ?? '').trim()));
}

/** Pedido de pasarela: por su método (la regla del cobro en caja) o porque ya tiene intentos de una. */
export function esPedidoDePasarela(order: PedidoPago, intentos: readonly IntentoPago[] = []): boolean {
  return pedidoEsDePasarela(order) || intentos.some((i) => (i.concept ?? 'order') === 'order' && !!i.gateway);
}

/** Venció sin pagar: `expired`, o cancelado por el vencimiento antes de existir ese estado. */
export function vencioSinPagar(order: PedidoPago): boolean {
  if (order.payment_status === 'paid' || order.payment_status === 'refunded') return false;
  if (order.status === 'expired') return true;
  return (
    order.status === 'cancelled' &&
    order.payment_status === 'failed' &&
    /expirad|sin pagar/i.test(order.cancellation_reason ?? '')
  );
}

export function estadoTarjetaPagos(order: PedidoPago, intentos: readonly IntentoPago[]): EstadoTarjetaPagos | null {
  const pagado = order.payment_status === 'paid';

  // F: contraentrega con anticipo (la tarjeta «Pago contra entrega» tiene montos y botones).
  if (esPedidoContraentrega(order)) {
    const conAnticipo = tieneAnticipo(order) || intentos.some((i) => i.concept === 'advance');
    return conAnticipo && !pagado ? 'F' : null;
  }

  if (!esPedidoDePasarela(order, intentos)) {
    // G: transferencia sin pasarela, aún pendiente. El efectivo queda como hoy.
    const abierta = order.status === 'pending' && (order.payment_status === 'pending' || order.payment_status === 'failed');
    return abierta && METODOS_TRANSFERENCIA.has(norm(order.payment_method)) ? 'G' : null;
  }

  if (pagado) return 'D';
  if (vencioSinPagar(order)) return 'E';
  if (order.status !== 'pending' || (order.payment_status !== 'pending' && order.payment_status !== 'failed')) return null;

  const ultimo = ultimoIntento(intentos, 'order');
  if (ultimo?.event === 'pending') return 'B';
  if (order.payment_status === 'failed' || esRechazo(ultimo?.event)) {
    return tieneMotivo(ultimoRechazo(intentos, 'order')) ? 'C' : 'C2';
  }
  return 'A';
}

/** Concepto cuyos intentos muestra la tarjeta. */
export function conceptoDeEstado(estado: EstadoTarjetaPagos): ConceptoIntento {
  return estado === 'F' ? 'advance' : 'order';
}

/**
 * Renglones del bloque «INTENTOS DE PAGO». Un pedido viejo vencido puede no tener la fila
 * `expired`: se pinta igual con la hora de cancelación (o la del vencimiento).
 */
export function historialIntentos(
  estado: EstadoTarjetaPagos,
  order: PedidoPago & { id?: string; organization_id?: number },
  intentos: readonly IntentoPago[],
  venceAt?: string | null,
): IntentoPago[] {
  const concepto = conceptoDeEstado(estado);
  const lista = intentosDelConcepto(intentos, concepto);
  const vencido = estado === 'E' || (estado === 'F' && estadoAnticipo(order) === 'vencido');
  if (vencido && !lista.some((i) => i.event === 'expired')) {
    const hora = order.cancelled_at ?? venceAt ?? order.advance_due_at ?? null;
    if (hora) {
      lista.push({
        id: `vencido-${order.id ?? ''}`,
        organization_id: order.organization_id ?? 0,
        web_order_id: order.id ?? '',
        concept: concepto,
        gateway: null,
        event: 'expired',
        reason: null,
        reason_code: null,
        method: null,
        card_brand: null,
        card_last4: null,
        bank: null,
        reference: null,
        amount: null,
        currency: null,
        created_at: hora,
      });
    }
  }
  return lista;
}

// ── Motivo ────────────────────────────────────────────────────────────────────────────────────

/**
 * Códigos `status_detail` de Mercado Pago documentados (pagos con tarjeta, PSE, efectivo y
 * cuenta). Cada uno tiene su texto en `pagosIntentos.motivos.<código>`; uno que no esté aquí sale
 * con el texto genérico `motivos.otro` y el código.
 */
export const CODIGOS_MOTIVO_MP = [
  'accredited',
  'partially_refunded',
  'pending_contingency',
  'pending_review_manual',
  'pending_waiting_payment',
  'pending_waiting_transfer',
  'pending_waiting_for_remedy',
  'pending_challenge',
  'pending_capture',
  'offline_process',
  'in_process',
  'cc_rejected_bad_filled_card_number',
  'cc_rejected_bad_filled_date',
  'cc_rejected_bad_filled_other',
  'cc_rejected_bad_filled_security_code',
  'cc_rejected_blacklist',
  'cc_rejected_call_for_authorize',
  'cc_rejected_card_disabled',
  'cc_rejected_card_error',
  'cc_rejected_card_type_not_allowed',
  'cc_rejected_duplicated_payment',
  'cc_rejected_high_risk',
  'cc_rejected_insufficient_amount',
  'cc_rejected_invalid_installments',
  'cc_rejected_max_attempts',
  'cc_rejected_other_reason',
  'cc_rejected_3ds_challenge',
  'cc_rejected_3ds_mandatory',
  'cc_rejected_by_regulations',
  'cc_amount_rate_limit_exceeded',
  'rejected_by_bank',
  'rejected_by_regulations',
  'rejected_insufficient_data',
  'rejected_high_risk',
  'rejected_other_reason',
  'rejected_call_for_authorize',
  'rejected_card_disabled',
  'rejected_duplicated_payment',
  'rejected_max_attempts',
  'insufficient_amount',
  'required_call_for_authorize',
  'bank_error',
  'by_collector',
  'by_payer',
  'by_admin',
  'expired',
  'refunded',
  'settled',
  'reimbursed',
  'payer_unavailable',
] as const;
export type CodigoMotivoMp = (typeof CODIGOS_MOTIVO_MP)[number];
const CODIGOS_MP: ReadonlySet<string> = new Set(CODIGOS_MOTIVO_MP);

export type MotivoIntento =
  /** Texto de la pasarela tal cual (Wompi `status_message`). */
  | { tipo: 'texto'; texto: string }
  /** Código traducido: `clave` bajo `pagosIntentos` (`motivos.cc_rejected_high_risk` o `motivos.otro`). */
  | { tipo: 'codigo'; clave: string; codigo: string }
  /** Rechazo sin motivo: la pasarela no lo informa (Bold). */
  | { tipo: 'noInforma'; pasarela: string | null };

/** Clave i18n de un código de Mercado Pago (desconocido → `motivos.otro`). */
export function claveMotivoMp(codigo: string): string {
  const c = norm(codigo);
  return CODIGOS_MP.has(c) ? `motivos.${c}` : 'motivos.otro';
}

/** Nombre propio de la pasarela de un código (`mercadopago` → «Mercado Pago»); el código si no se conoce. */
export function nombrePasarela(codigo: string | null | undefined): string | null {
  const p = pasarelaDeCodigo(codigo);
  if (p) return NOMBRE_PASARELA[p];
  const c = (codigo ?? '').trim();
  return c ? c.charAt(0).toUpperCase() + c.slice(1) : null;
}

/**
 * Motivo de un intento: Wompi lo manda en texto (`reason`, tal cual); Mercado Pago, como código
 * (`reason_code`, se traduce). Un rechazo sin nada: «{pasarela} no lo informa».
 */
export function motivoDelIntento(i: Pick<IntentoPago, 'event' | 'gateway' | 'reason' | 'reason_code'>): MotivoIntento | null {
  const texto = (i.reason ?? '').trim();
  if (texto) return { tipo: 'texto', texto };
  const codigo = (i.reason_code ?? '').trim();
  if (codigo) return { tipo: 'codigo', clave: claveMotivoMp(codigo), codigo };
  if (RECHAZOS.has(i.event)) return { tipo: 'noInforma', pasarela: nombrePasarela(i.gateway) };
  return null;
}

/**
 * El motivo dentro de una frase: «no pasó: fondos insuficientes». Solo se baja la inicial si la
 * segunda letra es minúscula (no toca siglas como «PSE»).
 */
export function motivoEnFrase(texto: string): string {
  const t = texto.trim().replace(/[.。]+$/, '');
  if (t.length > 1 && t[1] === t[1].toLowerCase() && t[1] !== t[1].toUpperCase()) {
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
  return t;
}

// ── Medio y método ────────────────────────────────────────────────────────────────────────────

export interface MedioPago {
  pasarela: Pasarela | null;
  submetodo: Submetodo | null;
  marcaTarjeta: string | null;
  ultimos4: string | null;
}

/** Medio de un intento: Nequi, PSE, Visa ••4417… (Mercado Pago guarda la marca como método: `visa`). */
export function medioDelIntento(i: Pick<IntentoPago, 'gateway' | 'method' | 'card_brand' | 'card_last4'>): MedioPago {
  const marca = marcaDeTarjeta(i.card_brand) ?? marcaDeTarjeta(i.method) ?? ((i.card_brand ?? '').trim() || null);
  const submetodo = submetodoDeCodigo(i.method) ?? (marca ? 'card' : null);
  const ultimos4 = /^\d{4}$/.test(i.card_last4 ?? '') ? (i.card_last4 as string) : null;
  return {
    pasarela: pasarelaDeCodigo(i.gateway),
    submetodo,
    marcaTarjeta: submetodo === 'card' ? marca : null,
    ultimos4: submetodo === 'card' || marca ? ultimos4 : null,
  };
}

export interface MetodoElegido extends MedioPago {
  /** Sin medio conocido y pagado por enlace («Bold (link)»). */
  enlace: boolean;
}

/**
 * Método elegido por el cliente: la pasarela del último intento con datos (o la del pedido) y el
 * medio más reciente que se conozca.
 */
export function metodoElegido(order: PedidoPago, intentos: readonly IntentoPago[], concepto: ConceptoIntento = 'order'): MetodoElegido {
  const lista = intentosDelConcepto(intentos, concepto).filter((i) => i.event !== 'expired');
  const conPasarela = [...lista].reverse().find((i) => pasarelaDeCodigo(i.gateway));
  const conMedio = [...lista].reverse().find((i) => i.method || i.card_brand);
  const metodoPedido = concepto === 'advance' ? order.advance_gateway : order.payment_method;
  const pasarela = pasarelaDeCodigo(conPasarela?.gateway) ?? pasarelaDeCodigo(metodoPedido);
  if (conMedio) {
    const m = medioDelIntento(conMedio);
    return { ...m, pasarela, enlace: false };
  }
  // Sin intentos con medio: el submétodo que guardó el pedido (el webhook lo pisa con el medio).
  const delPedido = concepto === 'order'
    ? submetodoDeCodigo(order.payment_method_detail) ?? (pasarelaDeCodigo(order.payment_method) ? null : submetodoDeCodigo(order.payment_method))
    : null;
  return {
    pasarela,
    submetodo: delPedido,
    marcaTarjeta: null,
    ultimos4: null,
    enlace: !delPedido && /_link$/.test(norm(metodoPedido)),
  };
}

/** «…40211»: los últimos 5 de una referencia larga (las cortas, completas). */
export function referenciaCorta(ref: string | null | undefined, n = 5): string | null {
  const r = (ref ?? '').trim();
  if (!r) return null;
  return r.length > n + 2 ? `…${r.slice(-n)}` : r;
}

// ── Vencimiento ───────────────────────────────────────────────────────────────────────────────

export interface Vencimiento {
  /** Minutos que faltan (redondeo hacia arriba; 0 si ya pasó). */
  minutos: number;
  /** Ya pasó la hora (el cron lo marca en unos minutos). */
  vencido: boolean;
  /** Vence otro día calendario (en la zona de la organización): se muestra la fecha. */
  otroDia: boolean;
}

export function vencimiento(venceAt: string | null | undefined, ahora: Date, timezone: string): Vencimiento | null {
  const minutos = minutosParaVencer(venceAt, ahora);
  if (minutos === null || !venceAt) return null;
  const vence = new Date(venceAt);
  return {
    minutos,
    vencido: vence.getTime() <= ahora.getTime(),
    otroDia: toPlainDate(vence, timezone) !== toPlainDate(ahora, timezone),
  };
}

/** «faltan 18 min» / «faltan 1 h 20 min» / «faltan 24 h»: horas y minutos de un total. */
export function partesTiempo(minutos: number): { h: number; m: number } {
  const total = Math.max(0, Math.round(minutos));
  return { h: Math.floor(total / 60), m: total % 60 };
}

// ── Mensaje de WhatsApp ───────────────────────────────────────────────────────────────────────

export type ClaveMensaje = 'mensajes.esperando' | 'mensajes.rechazado' | 'mensajes.rechazadoSinMotivo' | 'mensajes.vencido';

/** Mensaje del estado: A esperando, C con motivo, C2 sin motivo, E vencido. Otros, ninguno. */
export function claveMensajeWhatsApp(estado: EstadoTarjetaPagos | null): ClaveMensaje | null {
  switch (estado) {
    case 'A':
      return 'mensajes.esperando';
    case 'C':
      return 'mensajes.rechazado';
    case 'C2':
      return 'mensajes.rechazadoSinMotivo';
    case 'E':
      return 'mensajes.vencido';
    default:
      return null;
  }
}

/** Primer nombre del cliente para el saludo («Ana Gómez» → «Ana»). */
export function primerNombre(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Raíz de la tienda (para «haz un pedido nuevo») a partir del enlace del pedido. */
export function raizTienda(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Valores ICU del mensaje (`tieneNombre` y `tieneUrl` son `si`/`no` para el `select`). */
export function valoresMensaje(datos: {
  nombre: string | null | undefined;
  numero: string;
  motivo?: string | null;
  hora?: string | null;
  url?: string | null;
}): Record<string, string> {
  const nombre = primerNombre(datos.nombre);
  return {
    tieneNombre: nombre ? 'si' : 'no',
    nombre,
    numero: datos.numero,
    motivo: datos.motivo ? motivoEnFrase(datos.motivo) : '',
    hora: datos.hora ?? '',
    tieneUrl: datos.url ? 'si' : 'no',
    url: datos.url ?? '',
  };
}

// ── Listado ───────────────────────────────────────────────────────────────────────────────────

export type ClaveCeldaPasarela = 'rechazado' | 'enProceso' | 'esperando' | 'vencido';

/** ¿La celda «Pago» del listado es la de pasarela? Pendiente sin pagar o vencido sin pagar. */
export function muestraCeldaPasarela(o: PedidoPago): boolean {
  if (esPedidoContraentrega(o) || !pedidoEsDePasarela(o)) return false;
  if (vencioSinPagar(o)) return true;
  return o.status === 'pending' && (o.payment_status === 'pending' || o.payment_status === 'failed');
}

export interface CeldaPasarela {
  clave: ClaveCeldaPasarela;
  /** «Wompi», «Bold»…; null si no se reconoce (la celda usa el método del pedido). */
  pasarela: string | null;
  venceAt: string | null;
  /** Intentos reales (solo con el resumen cargado). */
  intentos: number | null;
}

/** Insignia y línea de la celda; sin resumen (cargando), con lo que dice el pedido. */
export function celdaPasarela(o: PedidoPago, resumen: ResumenPago | null | undefined): CeldaPasarela {
  const pasarela = nombrePasarelaConocida(resumen?.ultima_pasarela) ?? nombrePasarelaConocida(o.payment_method);
  const base = { pasarela, venceAt: resumen?.vence_at ?? null, intentos: resumen ? resumen.intentos ?? 0 : null };
  if (vencioSinPagar(o)) return { clave: 'vencido', ...base };
  if (resumen?.ultimo_evento === 'pending') return { clave: 'enProceso', ...base };
  if (o.payment_status === 'failed' || esRechazo(resumen?.ultimo_evento)) return { clave: 'rechazado', ...base };
  return { clave: 'esperando', ...base };
}

function nombrePasarelaConocida(codigo: string | null | undefined): string | null {
  const p = pasarelaDeCodigo(codigo);
  return p ? NOMBRE_PASARELA[p] : null;
}
