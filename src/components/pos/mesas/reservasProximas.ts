// ============================================================
// «¿Qué mesas están reservadas ahora?» — lógica pura (sin Supabase ni React)
//
// Una reserva CONFIRMADA con mesa asignada marca su mesa como «reservada»
// desde 60 minutos antes de su hora hasta que termina su franja
// (`duration_minutes`) o alguien cambia su estado (sentar / no se presentó).
// La franja posterior a la hora de inicio cubre al cliente que llega tarde:
// la mesa sigue apartada y el anfitrión puede marcar «No se presentó».
//
// La hora de la reserva es hora de PARED de la sede (`reservation_date` es
// `date` y `reservation_time` es `time without time zone`). El instante se
// calcula con la zona de la sucursal de la reserva (cascada sucursal →
// organización → fallback, gemela de `fn_timezone_for`), nunca con la del
// navegador ni con `toISOString().split('T')[0]`.
//
// La ocupación manda: una mesa con sesión abierta (o en estado `occupied`)
// se ve ocupada aunque tenga una reserva en la ventana.
// ============================================================

import { addPlainDays, formatTimeInTz, toPlainDate } from '@/lib/utils/dateDisplay';
import { DEFAULT_TIMEZONE, wallTimeToInstant } from '@/lib/utils/dateCore';
import type { TableWithSession } from './types';

/** Minutos antes de la hora de la reserva en que la mesa pasa a «reservada». */
export const VENTANA_RESERVA_MIN = 60;

const MINUTO_MS = 60_000;
/** Duración por defecto de `restaurant_reservations.duration_minutes`. */
const DURACION_POR_DEFECTO_MIN = 90;

/** Columnas de `restaurant_reservations` que usa la pantalla de Mesas. */
export interface ReservaParaMesa {
  id: string;
  branch_id: number;
  restaurant_table_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  party_size: number;
  reservation_date: string; // 'YYYY-MM-DD' (date)
  reservation_time: string; // 'HH:mm:ss' (time sin zona)
  duration_minutes: number | null;
  status: string;
  notes: string | null;
  special_requests: string | null;
  source: string;
}

/** Reserva que hoy aparta una mesa, con su instante ya resuelto. */
export interface ReservaActivaMesa {
  reserva: ReservaParaMesa;
  /** Instante de inicio en la zona de la sucursal. */
  inicio: Date;
  /** Zona con la que se calculó (para pintar la hora en esa misma zona). */
  zona: string;
  /** Minutos que faltan para la hora (negativo: el cliente va tarde). */
  minutosParaInicio: number;
}

export type EstadoVisualMesa = 'free' | 'occupied' | 'reserved' | 'bill_requested';

/** Zona IANA de una sucursal: la cascada del contexto (`resolveFor`). */
export type ZonaDeSucursal = (branchId: number) => string;

/** Instante de inicio de una reserva en la zona de su sucursal. */
export function inicioDeReserva(reserva: Pick<ReservaParaMesa, 'reservation_date' | 'reservation_time'>, zona: string): Date {
  return wallTimeToInstant(reserva.reservation_date, reserva.reservation_time, zona);
}

/**
 * Rango de días calendario (`reservation_date`) que hay que pedir a la base
 * para no perder ninguna reserva que pueda caer en la ventana. Se calcula en
 * TODAS las zonas implicadas (una por sucursal visible) y se abre un día
 * hacia atrás para las franjas que empezaron ayer y siguen vivas (cena que
 * cruza la medianoche).
 */
export function diasAConsultar(
  ahora: Date,
  zonas: readonly string[],
  ventanaMin: number = VENTANA_RESERVA_MIN,
): { desde: string; hasta: string } {
  const lista = zonas.length > 0 ? zonas : [DEFAULT_TIMEZONE];
  const limite = new Date(ahora.getTime() + ventanaMin * MINUTO_MS);
  const hoyes = lista.map((z) => toPlainDate(ahora, z));
  const finales = lista.map((z) => toPlainDate(limite, z));
  // YYYY-MM-DD ordena lexicográficamente igual que cronológicamente.
  const desde = addPlainDays([...hoyes].sort()[0], -1);
  const hasta = [...finales].sort()[finales.length - 1];
  return { desde, hasta };
}

/**
 * Reserva que aparta cada mesa AHORA: confirmada, con mesa, y con
 * `inicio - ventana <= ahora < inicio + duración`. Si una mesa tiene varias,
 * gana la que empieza antes (la que el anfitrión tiene que atender primero).
 */
export function reservasActivasPorMesa(
  reservas: readonly ReservaParaMesa[],
  ahora: Date,
  zonaDe: ZonaDeSucursal,
  ventanaMin: number = VENTANA_RESERVA_MIN,
): Map<string, ReservaActivaMesa> {
  const resultado = new Map<string, ReservaActivaMesa>();
  const ahoraMs = ahora.getTime();

  for (const reserva of reservas) {
    if (reserva.status !== 'confirmed' || !reserva.restaurant_table_id) continue;

    const zona = zonaDe(reserva.branch_id);
    const inicio = inicioDeReserva(reserva, zona);
    const inicioMs = inicio.getTime();
    if (Number.isNaN(inicioMs)) continue;

    const duracionMin = reserva.duration_minutes && reserva.duration_minutes > 0
      ? reserva.duration_minutes
      : DURACION_POR_DEFECTO_MIN;
    const abre = inicioMs - ventanaMin * MINUTO_MS;
    const cierra = inicioMs + duracionMin * MINUTO_MS;
    if (ahoraMs < abre || ahoraMs >= cierra) continue;

    const previa = resultado.get(reserva.restaurant_table_id);
    if (previa && previa.inicio.getTime() <= inicioMs) continue;

    resultado.set(reserva.restaurant_table_id, {
      reserva,
      inicio,
      zona,
      minutosParaInicio: Math.round((inicioMs - ahoraMs) / MINUTO_MS),
    });
  }

  return resultado;
}

/** ¿La mesa está ocupada? (sesión abierta o estado persistido `occupied`). */
export function mesaOcupada(mesa: Pick<TableWithSession, 'session' | 'state'>): boolean {
  return !!mesa.session || mesa.state === 'occupied';
}

/**
 * Estado que se pinta en la grilla y en el plano. Orden de precedencia:
 * cuenta solicitada > ocupada > reservada (por reserva en ventana) > libre.
 *
 * El `state = 'reserved'` persistido en `restaurant_tables` NO cuenta: lo
 * escribía la creación de reservas sin mirar la hora, y una reserva de
 * mañana dejaba la mesa «reservada» hoy. La reserva se deriva de
 * `restaurant_reservations`.
 */
export function estadoVisualMesa(
  mesa: Pick<TableWithSession, 'session' | 'state'>,
  reservaActiva: ReservaActivaMesa | undefined,
): EstadoVisualMesa {
  if (mesa.session?.status === 'bill_requested') return 'bill_requested';
  if (mesaOcupada(mesa)) return 'occupied';
  if (reservaActiva) return 'reserved';
  return 'free';
}

/**
 * Hora de la reserva en la zona de su sucursal, 24 h y sin cero a la izquierda
 * («8:00», «20:30»), como la MesaCard de Figma (868:31742).
 */
export function horaDeReserva(activa: Pick<ReservaActivaMesa, 'inicio' | 'zona'>): string {
  return formatTimeInTz(activa.inicio, activa.zona, { hour: 'numeric', minute: '2-digit', hour12: false });
}
