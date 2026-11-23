/**
 * Cómo se pinta el estado de un envío (Figma «22 Logística», estados canónicos e insignia
 * 2802:10982). Puro: lo usan `EstadoEnvioBadge`, Por despachar, el detalle y Seguimiento.
 *
 * Un solo idioma de estados para propio y terceros: `transport_events.canonical_status`. El
 * estado interno (`shipments.status`) se traduce con `canonicoDeEstado` (estadosEnvio.ts); aquí
 * solo se decide el tono de la insignia. Las etiquetas viven en `logistica.envio.estados.*`.
 */
import { canonicoDeEstado, ESTADOS_CANONICOS, type EstadoCanonico } from './estadosEnvio';

export type TonoEstadoEnvio = 'marca' | 'exito' | 'advertencia' | 'peligro' | 'informacion' | 'neutro';
export type AparienciaEstadoEnvio = 'suave' | 'solido' | 'contorno';

/**
 * Tono y apariencia de cada estado canónico (Figma 2802:10982): el camino normal va de gris a
 * azul y termina en verde; los desvíos son ámbar (intento fallido, devuelto) o rojo (novedad);
 * «En reparto» es el único sólido porque es el que el cliente está esperando.
 */
export const INSIGNIA_ESTADO: Readonly<Record<EstadoCanonico, { tono: TonoEstadoEnvio; apariencia: AparienciaEstadoEnvio }>> = {
  created: { tono: 'neutro', apariencia: 'suave' },
  ready_for_pickup: { tono: 'informacion', apariencia: 'contorno' },
  assigned: { tono: 'marca', apariencia: 'suave' },
  picked: { tono: 'marca', apariencia: 'suave' },
  in_transit: { tono: 'marca', apariencia: 'contorno' },
  out_for_delivery: { tono: 'marca', apariencia: 'solido' },
  failed_attempt: { tono: 'advertencia', apariencia: 'suave' },
  delivered: { tono: 'exito', apariencia: 'contorno' },
  exception: { tono: 'peligro', apariencia: 'suave' },
  returned: { tono: 'advertencia', apariencia: 'contorno' },
  cancelled: { tono: 'neutro', apariencia: 'contorno' },
};

export function esEstadoCanonico(valor: unknown): valor is EstadoCanonico {
  return typeof valor === 'string' && (ESTADOS_CANONICOS as readonly string[]).includes(valor);
}

/**
 * Estado canónico que se muestra: si llega un canónico se usa tal cual; si llega un estado interno
 * se traduce. Lo desconocido cae en `created` para no pintar una clave cruda.
 */
export function estadoParaInsignia(estado: string | null | undefined): EstadoCanonico {
  if (esEstadoCanonico(estado)) return estado;
  return canonicoDeEstado(estado) ?? 'created';
}

/** Camino normal (el que se dibuja en la línea de tiempo como pasos por venir). */
export const CAMINO_NORMAL: readonly EstadoCanonico[] = [
  'created',
  'ready_for_pickup',
  'assigned',
  'picked',
  'out_for_delivery',
  'delivered',
];

/** Estados finales: el envío ya no se mueve. */
export const ESTADOS_FINALES: readonly EstadoCanonico[] = ['delivered', 'returned', 'cancelled'];

export function esFinal(estado: string | null | undefined): boolean {
  return ESTADOS_FINALES.includes(estadoParaInsignia(estado));
}
