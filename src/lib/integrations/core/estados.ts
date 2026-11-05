/**
 * Estados canónicos de un envío con proveedor, y cómo se reflejan en `shipments.status`
 * (CHECK: draft | pending | assigned | ready | picked | dispatched | in_transit |
 * out_for_delivery | delivered | failed | returned | cancelled) y en el pedido web.
 *
 * Cada adaptador traduce el estado del proveedor a uno canónico; el núcleo nunca adivina: un
 * estado del proveedor sin traducción queda como evento con `canonical_status = null` y no mueve
 * el envío.
 */

export const ESTADOS_CANONICOS = [
  'created',
  'assigned',
  'picked',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'returned',
  'cancelled',
] as const;

export type EstadoCanonico = (typeof ESTADOS_CANONICOS)[number];

export function esEstadoCanonico(v: unknown): v is EstadoCanonico {
  return typeof v === 'string' && (ESTADOS_CANONICOS as readonly string[]).includes(v);
}

/** `shipments.status` para cada estado canónico. `exception` (novedad) no cambia el estado. */
export const ESTADO_ENVIO_POR_CANONICO: Record<EstadoCanonico, string | null> = {
  created: 'pending',
  assigned: 'assigned',
  picked: 'picked',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  exception: null,
  returned: 'returned',
  cancelled: 'cancelled',
};

/**
 * Estado del pedido web que ya propaga el domiciliario propio (deliveryIntegrationService):
 * `out_for_delivery` → `in_delivery` y `delivered` → `delivered`. Los demás no lo cambian.
 */
export const ESTADO_PEDIDO_WEB_POR_CANONICO: Partial<Record<EstadoCanonico, string>> = {
  out_for_delivery: 'in_delivery',
  delivered: 'delivered',
};

/** ¿Merece aviso al cliente? (salida a reparto, entrega, novedad o devolución). */
export const ESTADOS_CON_AVISO: ReadonlySet<EstadoCanonico> = new Set(['out_for_delivery', 'delivered', 'exception', 'returned']);

const ORDEN: Record<EstadoCanonico, number> = {
  created: 0,
  assigned: 1,
  picked: 2,
  in_transit: 3,
  out_for_delivery: 4,
  exception: 4,
  delivered: 5,
  returned: 5,
  cancelled: 5,
};

/** Un evento atrasado (el proveedor reenvía estados viejos) no hace retroceder el envío. */
export function avanza(actual: EstadoCanonico | null, nuevo: EstadoCanonico): boolean {
  if (actual === null) return true;
  if (actual === 'delivered' || actual === 'returned' || actual === 'cancelled') return false;
  return ORDEN[nuevo] >= ORDEN[actual];
}
