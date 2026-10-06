/**
 * POS › Reservas de mesas — lógica PURA de las pantallas del Figma
 * («Reservas de mesas» 445:194862, «Configuración (propuesta)» 1699:864094 y
 * «flujo de punta a punta por sede (propuesta)» 1801:169066).
 *
 * Sin React ni Supabase: cifras de los KPI, texto del estado de cada fila,
 * turnos con nombre, hora «7:30 p. m.» y nombre corto «Marcela O.». Lo usan la
 * Agenda, la Lista y la hoja móvil, y lo prueban `reservasVista.test.ts`.
 */
import type { RestaurantReservation, ReservationSource, ReservationStatus } from './reservasMesasService';

// ── Formatos ─────────────────────────────────────────────────────────────

/**
 * «19:30» o «19:30:00» → «7:30 p. m.»; mediodía «12:00 m.» (como el Figma y el
 * uso en Colombia). Es una hora de pared de la sede: no pasa por ninguna zona.
 */
export function horaCorta(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const h = Number(m[1]);
  const min = m[2];
  if (h === 12 && min === '00') return '12:00 m.';
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** «Marcela Ospina» → «Marcela O.»; un solo nombre queda igual. */
export function nombreCorto(nombre: string): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return partes[0] ?? '';
  return `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
}

export type NombreTurno = 'desayuno' | 'almuerzo' | 'cena';

/** Nombre del turno por su hora de inicio: antes de 11 desayuno, antes de 16 almuerzo, si no cena. */
export function nombreTurno(desde: string): NombreTurno {
  const h = Number((desde ?? '').slice(0, 2));
  if (h < 11) return 'desayuno';
  if (h < 16) return 'almuerzo';
  return 'cena';
}

/** Minutos de una hora «HH:MM». */
export function minutos(hhmm: string): number {
  const [h, m] = (hhmm ?? '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// ── Origen ───────────────────────────────────────────────────────────────

export type ClaveOrigen = 'web' | 'telefono' | 'equipo' | 'whatsapp';

/** `admin` se muestra como «Equipo» (Figma 1701:865814). */
export function claveOrigen(source: ReservationSource): ClaveOrigen {
  switch (source) {
    case 'website':
      return 'web';
    case 'phone':
      return 'telefono';
    case 'whatsapp':
      return 'whatsapp';
    default:
      return 'equipo';
  }
}

/** «Solicitud» no es un estado nuevo: pendiente + origen web (Decisión de UX 4). */
export function esSolicitudWeb(r: Pick<RestaurantReservation, 'status' | 'source'>): boolean {
  return r.status === 'pending' && r.source === 'website';
}

// ── KPI ──────────────────────────────────────────────────────────────────

const VIVAS: readonly ReservationStatus[] = ['pending', 'confirmed', 'seated', 'completed'];

export interface KpisAgenda {
  porConfirmar: number;
  /** Minutos desde la solicitud web más reciente por confirmar (null si no hay). */
  ultimaWebHaceMin: number | null;
  confirmadas: number;
  personasConfirmadas: number;
  sentadas: number;
  personasSentadas: number;
  noShow: number;
  reservas: number;
  personas: number;
}

export function kpisAgenda(reservas: readonly RestaurantReservation[], ahora: Date): KpisAgenda {
  const k: KpisAgenda = {
    porConfirmar: 0,
    ultimaWebHaceMin: null,
    confirmadas: 0,
    personasConfirmadas: 0,
    sentadas: 0,
    personasSentadas: 0,
    noShow: 0,
    reservas: 0,
    personas: 0,
  };
  let masReciente = -Infinity;
  for (const r of reservas) {
    if (VIVAS.includes(r.status)) {
      k.reservas++;
      k.personas += r.party_size;
    }
    if (r.status === 'pending') {
      k.porConfirmar++;
      if (r.source === 'website') masReciente = Math.max(masReciente, Date.parse(r.created_at));
    } else if (r.status === 'confirmed') {
      k.confirmadas++;
      k.personasConfirmadas += r.party_size;
    } else if (r.status === 'seated') {
      k.sentadas++;
      k.personasSentadas += r.party_size;
    } else if (r.status === 'no_show') {
      k.noShow++;
    }
  }
  if (Number.isFinite(masReciente)) k.ultimaWebHaceMin = Math.max(0, Math.floor((ahora.getTime() - masReciente) / 60_000));
  return k;
}

export interface KpisLista {
  total: number;
  comensales: number;
  solicitudesWeb: number;
  confirmadas: number;
  sentadas: number;
  noShow: number;
  /** % de inasistencias sobre el total del rango, con un decimal. */
  pctNoShow: number;
  canceladas: number;
}

/** Cifras de la Lista sobre TODAS las reservas del rango (no solo la página). */
export function kpisLista(
  filas: ReadonlyArray<Pick<RestaurantReservation, 'status' | 'source' | 'party_size'>>,
): KpisLista {
  const k: KpisLista = { total: filas.length, comensales: 0, solicitudesWeb: 0, confirmadas: 0, sentadas: 0, noShow: 0, pctNoShow: 0, canceladas: 0 };
  for (const r of filas) {
    if (r.status !== 'cancelled') k.comensales += r.party_size;
    if (esSolicitudWeb(r)) k.solicitudesWeb++;
    if (r.status === 'confirmed') k.confirmadas++;
    else if (r.status === 'seated') k.sentadas++;
    else if (r.status === 'no_show') k.noShow++;
    else if (r.status === 'cancelled') k.canceladas++;
  }
  k.pctNoShow = k.total > 0 ? Math.round((k.noShow / k.total) * 1000) / 10 : 0;
  return k;
}

// ── Estado de la fila (Lista) ─────────────────────────────────────────────

export type ClaveEstadoFila =
  | 'solicitud'
  | 'pendiente'
  | 'confirmada'
  | 'confirmadaTarde'
  | 'sentada'
  | 'completada'
  | 'completadaVenta'
  | 'noShow'
  | 'noShowReincidente'
  | 'cancelada';

export type TonoEstado = 'aviso' | 'info' | 'exito' | 'neutro' | 'peligro';

export interface EstadoFila {
  clave: ClaveEstadoFila;
  tono: TonoEstado;
  /** Valores para el texto («15 min tarde», «V-1042», «2.ª vez»). */
  valores: { minutos?: number; venta?: string; vez?: number };
}

export function estadoFila(
  r: Pick<RestaurantReservation, 'status' | 'source'>,
  extra: { retrasoMin?: number | null; venta?: string | null; inasistencias?: number } = {},
): EstadoFila {
  switch (r.status) {
    case 'pending':
      return esSolicitudWeb(r)
        ? { clave: 'solicitud', tono: 'aviso', valores: {} }
        : { clave: 'pendiente', tono: 'aviso', valores: {} };
    case 'confirmed':
      return extra.retrasoMin && extra.retrasoMin > 0
        ? { clave: 'confirmadaTarde', tono: 'aviso', valores: { minutos: extra.retrasoMin } }
        : { clave: 'confirmada', tono: 'info', valores: {} };
    case 'seated':
      return { clave: 'sentada', tono: 'exito', valores: {} };
    case 'completed':
      return extra.venta
        ? { clave: 'completadaVenta', tono: 'neutro', valores: { venta: extra.venta } }
        : { clave: 'completada', tono: 'neutro', valores: {} };
    case 'no_show':
      return (extra.inasistencias ?? 0) > 1
        ? { clave: 'noShowReincidente', tono: 'peligro', valores: { vez: extra.inasistencias } }
        : { clave: 'noShow', tono: 'peligro', valores: {} };
    default:
      return { clave: 'cancelada', tono: 'neutro', valores: {} };
  }
}

// ── Agenda ───────────────────────────────────────────────────────────────

/** Etiqueta de la insignia de la tarjeta de la agenda. */
export function claveInsignia(r: Pick<RestaurantReservation, 'status'>): ReservationStatus {
  return r.status;
}

/** Ordena por hora y luego por nombre (la agenda y la lista muestran el día en ese orden). */
export function ordenarPorHora<T extends Pick<RestaurantReservation, 'reservation_date' | 'reservation_time' | 'customer_name'>>(
  filas: readonly T[],
): T[] {
  return [...filas].sort(
    (a, b) =>
      a.reservation_date.localeCompare(b.reservation_date) ||
      a.reservation_time.localeCompare(b.reservation_time) ||
      a.customer_name.localeCompare(b.customer_name, 'es'),
  );
}

/** Página de la Lista (la paginación es del kit: 1-based). */
export function pagina<T>(filas: readonly T[], numero: number, tamano: number): T[] {
  const inicio = Math.max(0, (numero - 1) * tamano);
  return filas.slice(inicio, inicio + tamano);
}

// ── Configuración en el celular (Figma 1703:867084) ───────────────────────

/**
 * Resumen del horario de servicio para la fila del celular: «6 días ·
 * 12:00 – 23:30» (días con alguna franja, primera apertura y último cierre).
 * Un día sin clave usa `porDefecto` (las franjas que la sede ofrece sin
 * configurar); un día con `[]` está cerrado.
 */
export function rangoHorario(
  horario: Partial<Record<string, ReadonlyArray<{ from: string; to: string }>>>,
  dias: readonly string[],
  porDefecto: ReadonlyArray<{ from: string; to: string }>,
): { dias: number; desde: string | null; hasta: string | null } {
  let abiertos = 0;
  let desde: string | null = null;
  let hasta: string | null = null;
  for (const dia of dias) {
    const franjas = horario[dia] ?? porDefecto;
    if (franjas.length === 0) continue;
    abiertos++;
    for (const f of franjas) {
      if (desde === null || f.from < desde) desde = f.from;
      if (hasta === null || f.to > hasta) hasta = f.to;
    }
  }
  return { dias: abiertos, desde, hasta };
}

// ── Orden de la Lista (encabezados ordenables, Figma 1982:948175) ─────────

export type CampoOrdenReserva = 'hora' | 'cliente' | 'personas' | 'mesa' | 'origen' | 'estado';

const RANGO_ESTADO: Record<ReservationStatus, number> = { pending: 0, confirmed: 1, seated: 2, completed: 3, no_show: 4, cancelled: 5 };

/**
 * Ordena las reservas por una columna; sin orden (o con `hora`) queda el orden
 * del día (fecha, hora, nombre). Empates: orden del día.
 */
export function ordenarReservas<
  T extends Pick<RestaurantReservation, 'reservation_date' | 'reservation_time' | 'customer_name' | 'party_size' | 'source' | 'status'> & {
    restaurant_table?: { name: string } | null;
  },
>(filas: readonly T[], orden: { campo: string; direccion: 'asc' | 'desc' } | null): T[] {
  const base = ordenarPorHora(filas);
  if (!orden) return base;
  const signo = orden.direccion === 'desc' ? -1 : 1;
  const indice = new Map(base.map((f, i) => [f, i]));
  const valor = (f: T): string | number => {
    switch (orden.campo as CampoOrdenReserva) {
      case 'cliente':
        return f.customer_name;
      case 'personas':
        return f.party_size;
      case 'mesa':
        return f.restaurant_table?.name ?? '￿';
      case 'origen':
        return claveOrigen(f.source);
      case 'estado':
        return RANGO_ESTADO[f.status] ?? 9;
      default:
        return indice.get(f) ?? 0;
    }
  };
  return [...base].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es', { numeric: true });
    return c !== 0 ? c * signo : (indice.get(a) ?? 0) - (indice.get(b) ?? 0);
  });
}
