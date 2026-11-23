/**
 * Detalle del envío (Figma «21 Logística» 2798:2849, acciones por estado 2799:7510, prueba de
 * entrega 2799:7669; «22 Logística» línea de tiempo 2802:8747). Puro: sin Supabase ni React.
 *
 * Las acciones salen de la tabla de transiciones de la base (copiada en estadosEnvio.ts): aquí no
 * se inventa ninguna. La línea de tiempo usa los estados canónicos de `transport_events`.
 */
import {
  admiteNovedad,
  canonicoDeEstado,
  momentoAvisoDeEstado,
  puedeAsignarse,
  puedeEntregarse,
  transicionValida,
  type EstadoCanonico,
} from './estadosEnvio';
import { CAMINO_NORMAL, esEstadoCanonico } from './estadoEnvioUi';

export interface AccionesDetalle {
  asignar: boolean;
  listoParaSalir: boolean;
  recogido: boolean;
  enCamino: boolean;
  /** Reintentar tras un intento fallido (vuelve a «en reparto»). */
  reintentar: boolean;
  entregar: boolean;
  novedad: boolean;
  devolver: boolean;
  cancelar: boolean;
  /** Reenviar el aviso del estado actual (solo pedidos de la tienda en camino o entregados). */
  avisar: boolean;
}

export function accionesDetalle(e: { status: string; modo: string; pedidoWebId: string | null }): AccionesDetalle {
  const propio = e.modo === 'own';
  const s = e.status;
  return {
    asignar: propio && puedeAsignarse(s),
    listoParaSalir: transicionValida(s, 'ready_for_pickup'),
    recogido: transicionValida(s, 'picked'),
    enCamino: s !== 'failed_attempt' && transicionValida(s, 'out_for_delivery'),
    reintentar: s === 'failed_attempt' && transicionValida(s, 'out_for_delivery'),
    entregar: puedeEntregarse(s),
    novedad: admiteNovedad(s),
    devolver: transicionValida(s, 'returned'),
    cancelar: transicionValida(s, 'cancelled'),
    avisar: !!e.pedidoWebId && momentoAvisoDeEstado(s) !== null,
  };
}

export interface EventoLinea {
  id: string;
  event_time: string;
  canonical_status: string | null;
  event_type: string;
  reason_code: string | null;
  description: string | null;
  provider_status: string | null;
}

export type EstadoPaso = 'hecho' | 'fallo' | 'actual' | 'pendiente';

export interface PasoLinea {
  clave: string;
  canonico: EstadoCanonico;
  estado: EstadoPaso;
  hora: string | null;
  descripcion: string | null;
  motivo: string | null;
  /** Número del intento cuando el paso es «en reparto» repetido (2.º intento…). */
  intento: number | null;
}

/** Canónico de un evento: el guardado o, en eventos viejos sin él, el de su `event_type`. */
export function canonicoDeEvento(ev: Pick<EventoLinea, 'canonical_status' | 'event_type'>): EstadoCanonico | null {
  if (esEstadoCanonico(ev.canonical_status)) return ev.canonical_status;
  if (ev.event_type === 'created') return 'created';
  return canonicoDeEstado(ev.event_type);
}

/**
 * Línea de tiempo: los eventos ocurridos (en orden) y, si el envío sigue vivo, los pasos del
 * camino normal que faltan, en gris. Un intento fallido se marca como «fallo»; el siguiente
 * «en reparto» lleva su número de intento.
 */
export function lineaDeTiempo(eventos: readonly EventoLinea[], statusActual: string): PasoLinea[] {
  const pasos: PasoLinea[] = [];
  let repartos = 0;
  const ordenados = [...eventos].sort((a, b) => a.event_time.localeCompare(b.event_time));
  for (const ev of ordenados) {
    const c = canonicoDeEvento(ev);
    if (!c) continue;
    if (c === 'out_for_delivery') repartos += 1;
    pasos.push({
      clave: ev.id,
      canonico: c,
      estado: c === 'failed_attempt' || c === 'exception' || c === 'cancelled' || c === 'returned' ? 'fallo' : 'hecho',
      hora: ev.event_time,
      descripcion: ev.provider_status ?? ev.description,
      motivo: ev.reason_code,
      intento: c === 'out_for_delivery' && repartos > 1 ? repartos : null,
    });
  }
  const actual = canonicoDeEstado(statusActual);
  if (pasos.length > 0 && actual && pasos[pasos.length - 1].canonico === actual && pasos[pasos.length - 1].estado === 'hecho') {
    pasos[pasos.length - 1] = { ...pasos[pasos.length - 1], estado: 'actual' };
  }
  if (!actual || actual === 'delivered' || actual === 'returned' || actual === 'cancelled') return pasos;
  // Pasos que faltan del camino normal, después del estado actual. Tras un intento fallido falta
  // volver a salir y entregar; «en tránsito» cuenta como «recogido».
  const ancla: EstadoCanonico = actual === 'failed_attempt' || actual === 'exception' || actual === 'in_transit' ? 'picked' : actual;
  const desde = Math.max(0, CAMINO_NORMAL.indexOf(ancla));
  for (const c of CAMINO_NORMAL.slice(desde + 1)) {
    pasos.push({ clave: `pendiente-${c}`, canonico: c, estado: 'pendiente', hora: null, descripcion: null, motivo: null, intento: null });
  }
  return pasos;
}

/** Estado del recaudo: pendiente → cobrado (al entregar) → girado a caja (en el cuadre). */
export type PasoCobro = 'pendiente' | 'cobrado' | 'girado';

export function pasoCobro(codStatus: string | null | undefined): PasoCobro {
  if (codStatus === 'remitted') return 'girado';
  if (codStatus === 'collected') return 'cobrado';
  return 'pendiente';
}

/** «CC terminada en 4410»: nunca el documento completo en pantalla. */
export function documentoOculto(numero: string | null | undefined): string | null {
  const limpio = (numero ?? '').replace(/\s/g, '');
  if (!limpio) return null;
  return limpio.length <= 4 ? limpio : limpio.slice(-4);
}

/** Validación del formulario «Marcar entregado» (lo demás lo valida la RPC). */
export type FaltanteEntregaAdmin = 'receptor' | 'codigo' | 'metodo' | 'monto' | null;

export function faltanteEntregaAdmin(f: {
  receptor: string;
  requiereCodigo: boolean;
  codigo: string;
  contraentrega: number;
  metodo: string | null;
  monto: number | null;
}): FaltanteEntregaAdmin {
  if (f.receptor.trim().length < 2) return 'receptor';
  if (f.requiereCodigo && !/^[0-9]{4}$/.test(f.codigo.trim())) return 'codigo';
  if (f.contraentrega > 0) {
    if (!f.metodo) return 'metodo';
    if (f.monto === null || !(f.monto > 0)) return 'monto';
  }
  return null;
}
