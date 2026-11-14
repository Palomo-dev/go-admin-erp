/**
 * Orden del hilo de una conversación (Figma 91-chat-01): mensajes y notas
 * internas intercalados por fecha, con un separador por día calendario en la
 * zona de la organización. Puro, sin React.
 */
import { toPlainDate } from '@/lib/utils/dateDisplay';

export interface MensajeHilo {
  id: string;
  created_at: string;
}

export interface NotaHilo {
  id: string;
  created_at: string;
  note: string;
  member_id: number | null;
}

/** Evento del sistema en el hilo («Laura R. bloqueó el contacto · 10:45»). */
export interface EventoHilo {
  id: string;
  created_at: string;
}

export type ElementoHilo<M extends MensajeHilo, N extends NotaHilo, E extends EventoHilo = EventoHilo> =
  | { tipo: 'dia'; clave: string; dia: string }
  | { tipo: 'mensaje'; clave: string; mensaje: M }
  | { tipo: 'nota'; clave: string; nota: N }
  | { tipo: 'evento'; clave: string; evento: E };

/**
 * Intercala mensajes, notas y eventos por `created_at` y agrega un separador
 * al empezar cada día (`YYYY-MM-DD` en `tz`). Las notas y eventos anteriores
 * al mensaje más viejo cargado no se muestran mientras haya más historia por
 * cargar: si no, quedarían fuera de lugar.
 */
export function elementosHilo<M extends MensajeHilo, N extends NotaHilo, E extends EventoHilo = EventoHilo>(
  mensajes: readonly M[],
  notas: readonly N[],
  tz: string | undefined,
  hayMasHistoria: boolean,
  eventos: readonly E[] = [],
): ElementoHilo<M, N, E>[] {
  const desde = hayMasHistoria && mensajes.length > 0 ? mensajes.reduce((min, m) => (m.created_at < min ? m.created_at : min), mensajes[0].created_at) : null;
  const items: Array<{ t: number; e: ElementoHilo<M, N, E> }> = [
    ...mensajes.map((m) => ({ t: Date.parse(m.created_at), e: { tipo: 'mensaje' as const, clave: `m-${m.id}`, mensaje: m } })),
    ...notas
      .filter((n) => !desde || n.created_at >= desde)
      .map((n) => ({ t: Date.parse(n.created_at), e: { tipo: 'nota' as const, clave: `n-${n.id}`, nota: n } })),
    ...eventos
      .filter((ev) => !desde || ev.created_at >= desde)
      .map((ev) => ({ t: Date.parse(ev.created_at), e: { tipo: 'evento' as const, clave: `e-${ev.id}`, evento: ev } })),
  ].sort((a, b) => a.t - b.t);

  const out: ElementoHilo<M, N, E>[] = [];
  let diaActual: string | null = null;
  for (const { t, e } of items) {
    const dia = toPlainDate(new Date(t), tz);
    if (dia !== diaActual) {
      out.push({ tipo: 'dia', clave: `d-${dia}`, dia });
      diaActual = dia;
    }
    out.push(e);
  }
  return out;
}

/** Relación del día con hoy: para «Hoy» / «Ayer» antes de la fecha. */
export function relacionDia(dia: string, hoy: string): 'hoy' | 'ayer' | 'otro' {
  if (dia === hoy) return 'hoy';
  const h = Date.parse(`${hoy}T12:00:00Z`);
  const d = Date.parse(`${dia}T12:00:00Z`);
  return Math.round((h - d) / 86_400_000) === 1 ? 'ayer' : 'otro';
}

/** «viernes, 13 de noviembre» de un día calendario `YYYY-MM-DD`, en el idioma de la interfaz. */
export function fechaLargaDia(dia: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia);
  if (!m) return dia;
  const fecha = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(fecha);
}

/** Estado de entrega de un mensaje del equipo (`message_events` + `messages.is_read`). */
export type EstadoEntrega = 'enviado' | 'entregado' | 'leido' | 'fallido';

const PESO_EVENTO: Record<string, number> = { sent: 1, delivered: 2, read: 3, failed: 4 };

/**
 * El estado más avanzado de los eventos del proveedor. Fallido manda (el
 * mensaje no llegó); si no hay eventos, `is_read` decide entre leído y enviado.
 */
export function estadoEntrega(eventos: ReadonlyArray<{ event_type: string }>, leido: boolean | null | undefined): EstadoEntrega {
  let peso = 0;
  for (const e of eventos) peso = Math.max(peso, PESO_EVENTO[e.event_type] ?? 0);
  if (peso === 4) return 'fallido';
  if (peso === 3 || leido) return 'leido';
  if (peso === 2) return 'entregado';
  return 'enviado';
}

/**
 * ¿Cambia quien habla respecto al mensaje anterior? (para mostrar nombre y
 * avatar del remitente, como el Chat anterior). Agentes distintos cuentan
 * como cambio; la IA y el cliente se agrupan por rol.
 */
export function cambiaAutor(
  anterior: { role?: string | null; sender_member_id?: number | null } | null | undefined,
  actual: { role?: string | null; sender_member_id?: number | null },
): boolean {
  if (!anterior) return true;
  if (anterior.role !== actual.role) return true;
  return actual.role === 'agent' && (anterior.sender_member_id ?? null) !== (actual.sender_member_id ?? null);
}

/** Enlace de Google Maps de una ubicación (`messages.payload` de WhatsApp), o `null`. */
export function enlaceMapa(payload: { latitude?: unknown; longitude?: unknown } | null | undefined): string | null {
  const lat = Number(payload?.latitude);
  const lng = Number(payload?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || payload?.latitude == null || payload?.longitude == null) return null;
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
