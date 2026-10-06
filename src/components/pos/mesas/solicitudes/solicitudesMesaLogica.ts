/**
 * Solicitudes que el comensal hace desde la Carta QR de su mesa («Llamar al
 * mesero» y «Pedir la cuenta»; Figma «Restaurante · Carta QR en la mesa»,
 * láminas 07, 08 y 20). Puro, para Jest.
 *
 * La fila vive en `table_service_requests` (la crea la RPC pública por token de
 * la mesa, con su límite de frecuencia). El POS solo la lee, la ve llegar en
 * tiempo real y la marca: «Voy» (`ack`) y «Atendida» (`done`).
 */

export type TipoSolicitudMesa = 'waiter' | 'bill' | 'help';
export type EstadoSolicitudMesa = 'open' | 'ack' | 'done' | 'cancelled';

/** Fila de `table_service_requests` tal como la lee el POS. */
export interface FilaSolicitudMesa {
  id: string;
  organization_id: number;
  branch_id: number | null;
  restaurant_table_id: string;
  table_session_id: string | null;
  kind: string;
  reason: string | null;
  status: string;
  created_at: string;
  ack_by?: string | null;
  ack_at?: string | null;
}

export interface SolicitudMesa {
  id: string;
  sedeId: number | null;
  mesaId: string;
  sesionId: string | null;
  tipo: TipoSolicitudMesa;
  motivo: string | null;
  estado: EstadoSolicitudMesa;
  creadaEn: string;
  vistaEn: string | null;
}

const TIPOS: readonly TipoSolicitudMesa[] = ['waiter', 'bill', 'help'];
const ESTADOS: readonly EstadoSolicitudMesa[] = ['open', 'ack', 'done', 'cancelled'];

/** Fila → solicitud. Un tipo o estado desconocido no rompe la pantalla: cae a «mesero» / «abierta». */
export function aSolicitudMesa(f: FilaSolicitudMesa): SolicitudMesa {
  const tipo = (TIPOS as readonly string[]).includes(f.kind) ? (f.kind as TipoSolicitudMesa) : 'waiter';
  const estado = (ESTADOS as readonly string[]).includes(f.status) ? (f.status as EstadoSolicitudMesa) : 'open';
  const motivo = typeof f.reason === 'string' && f.reason.trim() ? f.reason.trim().slice(0, 200) : null;
  return {
    id: f.id,
    sedeId: f.branch_id ?? null,
    mesaId: f.restaurant_table_id,
    sesionId: f.table_session_id ?? null,
    tipo,
    motivo,
    estado,
    creadaEn: f.created_at,
    vistaEn: f.ack_at ?? null,
  };
}

/** Pendiente = abierta o «voy en camino»; las atendidas y las que el comensal retiró salen de la pantalla. */
export function estaPendiente(s: SolicitudMesa): boolean {
  return s.estado === 'open' || s.estado === 'ack';
}

/**
 * Aplica un evento de tiempo real a la lista: inserta, reemplaza o quita (si
 * quedó atendida o se borró). Deja la lista ordenada de la más antigua a la
 * más nueva: la que lleva más rato esperando va primero.
 */
export function aplicarEvento(
  lista: readonly SolicitudMesa[],
  evento: { tipo: 'INSERT' | 'UPDATE' | 'DELETE'; solicitud: SolicitudMesa },
): SolicitudMesa[] {
  const sinElla = lista.filter((s) => s.id !== evento.solicitud.id);
  if (evento.tipo === 'DELETE' || !estaPendiente(evento.solicitud)) return sinElla;
  return ordenarSolicitudes([...sinElla, evento.solicitud]);
}

export function ordenarSolicitudes(lista: readonly SolicitudMesa[]): SolicitudMesa[] {
  return [...lista].sort((a, b) => a.creadaEn.localeCompare(b.creadaEn) || a.id.localeCompare(b.id));
}

export interface ResumenSolicitudesMesa {
  /** Llamadas al mesero pendientes (incluye «ayuda»). */
  mesero: number;
  /** Pidió la cuenta. */
  cuenta: boolean;
  /** La más antigua sin atender (para «hace 3 min»). */
  desde: string;
  /** Alguna sigue sin que nadie diga «Voy». */
  sinVer: boolean;
}

/** Resumen por mesa para el aviso sobre la mesa en la cuadrícula y el plano. */
export function resumenPorMesa(lista: readonly SolicitudMesa[]): Map<string, ResumenSolicitudesMesa> {
  const mapa = new Map<string, ResumenSolicitudesMesa>();
  for (const s of lista) {
    if (!estaPendiente(s)) continue;
    const r = mapa.get(s.mesaId) ?? { mesero: 0, cuenta: false, desde: s.creadaEn, sinVer: false };
    if (s.tipo === 'bill') r.cuenta = true;
    else r.mesero += 1;
    if (s.creadaEn < r.desde) r.desde = s.creadaEn;
    if (s.estado === 'open') r.sinVer = true;
    mapa.set(s.mesaId, r);
  }
  return mapa;
}

/** Solo las de la sede elegida (null = todas las sedes del usuario). */
export function deLaSede(lista: readonly SolicitudMesa[], sedeId: number | null): SolicitudMesa[] {
  return sedeId == null ? [...lista] : lista.filter((s) => s.sedeId == null || s.sedeId === sedeId);
}
