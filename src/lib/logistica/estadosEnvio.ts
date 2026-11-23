/**
 * Estados del envío (logística Fase 1, docs/logistica/FASE1-CIMIENTOS.md).
 *
 * Puro: lo comparten las pantallas, los servicios y las pruebas. La tabla de transiciones es
 * COPIA de `fn_logistica_transicion_valida` (migración 20261123150003); la base es la que
 * decide, esto solo evita ofrecer en pantalla un botón que la base va a rechazar.
 * __tests__/estadosEnvio.test.ts fija que las dos digan lo mismo.
 */

/** `shipments.status` (CHECK shipments_status_check, migración 20261123145040). */
export const ESTADOS_ENVIO = [
  'draft',
  'pending',
  'assigned',
  'ready',
  'ready_for_pickup',
  'picked',
  'dispatched',
  'in_transit',
  'out_for_delivery',
  'failed_attempt',
  'delivered',
  'failed',
  'returned',
  'cancelled',
] as const;
export type EstadoEnvio = (typeof ESTADOS_ENVIO)[number];

/** `transport_events.canonical_status`: un solo idioma para propio y terceros. */
export const ESTADOS_CANONICOS = [
  'created',
  'ready_for_pickup',
  'assigned',
  'picked',
  'in_transit',
  'out_for_delivery',
  'failed_attempt',
  'delivered',
  'exception',
  'returned',
  'cancelled',
] as const;
export type EstadoCanonico = (typeof ESTADOS_CANONICOS)[number];

/** Motivo de una novedad (`shipments.exception_reason`, `transport_events.reason_code`). */
export const MOTIVOS_NOVEDAD = [
  'not_home',
  'wrong_address',
  'incomplete_address',
  'rejected',
  'damaged',
  'lost',
  'access_denied',
  'business_closed',
  'weather',
  'vehicle_issue',
  'customer_request',
  'other',
] as const;
export type MotivoNovedad = (typeof MOTIVOS_NOVEDAD)[number];

/** Modo de despacho (`shipments.fulfillment_mode`). */
export const MODOS_DESPACHO = ['own', 'last_mile', 'national_carrier', 'marketplace'] as const;
export type ModoDespacho = (typeof MODOS_DESPACHO)[number];

/** Estados a los que se llega con `logistica_cambiar_estado` (los demás tienen RPC propia). */
export const ESTADOS_CAMBIO_SIMPLE = [
  'ready_for_pickup',
  'picked',
  'in_transit',
  'out_for_delivery',
  'returned',
  'cancelled',
] as const;
export type EstadoCambioSimple = (typeof ESTADOS_CAMBIO_SIMPLE)[number];

/**
 * Transiciones permitidas. `assigned` se alcanza con logistica_asignar_domiciliario,
 * `delivered` con logistica_marcar_entregado y `failed_attempt` con logistica_registrar_novedad;
 * aquí figuran para que la pantalla sepa qué acciones mostrar.
 */
const TRANSICIONES: Readonly<Partial<Record<EstadoEnvio, readonly EstadoEnvio[]>>> = {
  draft: ['ready_for_pickup', 'assigned', 'cancelled'],
  pending: ['ready_for_pickup', 'assigned', 'cancelled'],
  ready: ['ready_for_pickup', 'assigned', 'picked', 'out_for_delivery', 'cancelled'],
  ready_for_pickup: ['assigned', 'picked', 'out_for_delivery', 'cancelled'],
  assigned: ['ready_for_pickup', 'picked', 'out_for_delivery', 'cancelled'],
  picked: ['in_transit', 'out_for_delivery', 'returned'],
  dispatched: ['in_transit', 'out_for_delivery', 'returned'],
  in_transit: ['out_for_delivery', 'returned'],
  out_for_delivery: ['returned'],
  failed_attempt: ['assigned', 'out_for_delivery', 'returned', 'cancelled'],
};

/** Estados desde los que se puede asignar (o reasignar) domiciliario. */
export const ESTADOS_ASIGNABLES: readonly EstadoEnvio[] = [
  'draft', 'pending', 'ready', 'ready_for_pickup', 'assigned', 'failed_attempt',
];

/** Estados desde los que se puede marcar entregado. */
export const ESTADOS_ENTREGABLES: readonly EstadoEnvio[] = [
  'assigned', 'ready', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt',
];

/** Estados desde los que se puede registrar una novedad (intento fallido). */
export const ESTADOS_CON_NOVEDAD: readonly EstadoEnvio[] = [
  'assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt',
];

/** Estados «en curso»: el envío ocupa al domiciliario o al vehículo. */
export const ESTADOS_EN_CURSO: readonly EstadoEnvio[] = [
  'assigned', 'ready_for_pickup', 'picked', 'dispatched', 'in_transit', 'out_for_delivery', 'failed_attempt',
];

export function esEstadoEnvio(valor: unknown): valor is EstadoEnvio {
  return typeof valor === 'string' && (ESTADOS_ENVIO as readonly string[]).includes(valor);
}

export function esMotivoNovedad(valor: unknown): valor is MotivoNovedad {
  return typeof valor === 'string' && (MOTIVOS_NOVEDAD as readonly string[]).includes(valor);
}

/** ¿La base acepta pasar de `desde` a `hacia` con logistica_cambiar_estado? */
export function transicionValida(desde: string | null | undefined, hacia: string): boolean {
  if (!esEstadoEnvio(desde)) return false;
  return (TRANSICIONES[desde] ?? []).includes(hacia as EstadoEnvio);
}

/** Siguientes estados posibles (para pintar las acciones de la pantalla). */
export function siguientesEstados(desde: string | null | undefined): readonly EstadoEnvio[] {
  return esEstadoEnvio(desde) ? (TRANSICIONES[desde] ?? []) : [];
}

export function puedeAsignarse(estado: string | null | undefined): boolean {
  return esEstadoEnvio(estado) && ESTADOS_ASIGNABLES.includes(estado);
}

export function puedeEntregarse(estado: string | null | undefined): boolean {
  return esEstadoEnvio(estado) && ESTADOS_ENTREGABLES.includes(estado);
}

export function admiteNovedad(estado: string | null | undefined): boolean {
  return esEstadoEnvio(estado) && ESTADOS_CON_NOVEDAD.includes(estado);
}

/**
 * Estado canónico de un estado interno del envío. Los heredados se traducen: `pending`/`draft`
 * → created, `ready` → ready_for_pickup, `dispatched` → in_transit, `failed` → exception.
 */
export function canonicoDeEstado(estado: string | null | undefined): EstadoCanonico | null {
  switch (estado) {
    case 'draft':
    case 'pending':
      return 'created';
    case 'ready':
    case 'ready_for_pickup':
      return 'ready_for_pickup';
    case 'dispatched':
      return 'in_transit';
    case 'failed':
      return 'exception';
    case 'assigned':
    case 'picked':
    case 'in_transit':
    case 'out_for_delivery':
    case 'failed_attempt':
    case 'delivered':
    case 'returned':
    case 'cancelled':
      return estado;
    default:
      return null;
  }
}

/**
 * Momento del aviso al cliente (web_order_notices.moment) que dispara cada estado.
 * `novedad` existe en la base desde 20261123150641; su plantilla y su interruptor en la
 * pantalla de avisos están pendientes (Figma primero).
 */
export function momentoAvisoDeEstado(estado: string | null | undefined): 'en_camino' | 'entregado' | 'novedad' | null {
  switch (estado) {
    case 'out_for_delivery':
      return 'en_camino';
    case 'delivered':
      return 'entregado';
    case 'failed_attempt':
      return 'novedad';
    default:
      return null;
  }
}
