/**
 * Lógica de `ActivityDialog` (Figma 760:445129): un diálogo por acción rápida
 * — llamada, correo, WhatsApp, reunión y nota; la tarea usa el `TaskForm` del
 * PM. Sin React.
 *
 * Arma los datos para las rutas del servidor (la escritura es de la ola 3A):
 * - llamada → `activities` (`activity_type='call'`, `outcome`,
 *   `duration_seconds`, `occurred_at`, `metadata.direction`);
 * - reunión → `calendar_events` (`start_at`/`end_at` en la zona de la
 *   organización, `opportunity_id` de M3);
 * - nota → `notes` (`body`, `related_type`/`related_id`, `is_pinned`; D6).
 * Columnas verificadas por MCP el 2026-09-29.
 */
import { plainDateToInstant } from '@/lib/utils/dateDisplay';
import { aInstante, deFechaHoraLocal } from './fechasCrm';

export type TipoActividad = 'llamada' | 'correo' | 'whatsapp' | 'reunion' | 'nota';

/** Resultado de la llamada → `activities.outcome` (`answered` ya existe en la base). */
export const RESULTADOS_LLAMADA = ['answered', 'no_answer', 'voicemail', 'wrong_number', 'callback', 'not_interested'] as const;
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number];

/** Destino de la actividad: el cliente y, si la hay, la oportunidad. */
export interface DestinoActividad {
  clienteId: string;
  clienteNombre: string;
  oportunidadId?: string | null;
  oportunidadNombre?: string | null;
}

// ─── Llamada ───────────────────────────────────────────────────────────────

export interface ValoresLlamada {
  direccion: 'outbound' | 'inbound';
  resultado: ResultadoLlamada | '';
  duracion: string;
  /** `datetime-local` en la hora de la organización. */
  fechaHora: string;
  notas: string;
  crearSeguimiento: boolean;
  /** `date` del seguimiento. */
  fechaSeguimiento: string;
}

/**
 * «4 min 12 s», «4:12», «252 s» o «4» (minutos) → segundos. Vacío → null;
 * ilegible → NaN.
 */
export function parsearDuracion(texto: string | null | undefined): number | null {
  const t = (texto ?? '').trim().toLowerCase();
  if (!t) return null;
  const mmss = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const partes = /^(?:(\d{1,3})\s*(?:min|m)\s*)?(?:(\d{1,4})\s*(?:s|seg|sec)?)?$/.exec(t);
  if (partes && (partes[1] || partes[2])) {
    if (!partes[1] && !/s|seg|sec/.test(t)) return Number(partes[2]) * 60;
    return Number(partes[1] ?? 0) * 60 + Number(partes[2] ?? 0);
  }
  return NaN;
}

export function validarLlamada(v: ValoresLlamada, hoy: string): Partial<Record<keyof ValoresLlamada, string>> {
  const e: Partial<Record<keyof ValoresLlamada, string>> = {};
  if (!v.resultado) e.resultado = 'obligatorio';
  const d = parsearDuracion(v.duracion);
  if (d !== null && Number.isNaN(d)) e.duracion = 'duracionInvalida';
  if (!v.fechaHora) e.fechaHora = 'obligatorio';
  if (v.crearSeguimiento) {
    if (!v.fechaSeguimiento) e.fechaSeguimiento = 'obligatorio';
    else if (v.fechaSeguimiento < hoy) e.fechaSeguimiento = 'fechaPasada';
  }
  return e;
}

export function datosLlamada(v: ValoresLlamada, destino: DestinoActividad, zona: string) {
  const d = parsearDuracion(v.duracion);
  return {
    actividad: {
      activity_type: 'call' as const,
      channel: 'phone',
      outcome: v.resultado || null,
      duration_seconds: d !== null && !Number.isNaN(d) ? d : null,
      occurred_at: deFechaHoraLocal(v.fechaHora, zona),
      notes: v.notas.trim() || null,
      related_type: destino.oportunidadId ? 'opportunity' : 'customer',
      related_id: destino.oportunidadId ?? destino.clienteId,
      metadata: { direction: v.direccion, customer_id: destino.clienteId },
    },
    seguimiento: v.crearSeguimiento && v.fechaSeguimiento ? { due_date: v.fechaSeguimiento } : null,
  };
}

// ─── Correo ────────────────────────────────────────────────────────────────

export interface ValoresCorreo {
  remitenteId: string;
  para: string;
  plantillaId: string;
  asunto: string;
  mensaje: string;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validarCorreo(v: ValoresCorreo): Partial<Record<keyof ValoresCorreo, string>> {
  const e: Partial<Record<keyof ValoresCorreo, string>> = {};
  if (!v.remitenteId) e.remitenteId = 'obligatorio';
  if (!CORREO.test(v.para.trim())) e.para = 'correoInvalido';
  if (!v.asunto.trim()) e.asunto = 'obligatorio';
  if (!v.mensaje.trim()) e.mensaje = 'obligatorio';
  return e;
}

// ─── WhatsApp ──────────────────────────────────────────────────────────────

export interface ValoresWhatsApp {
  canalId: string;
  plantillaId: string;
  /** Texto libre: solo dentro de la ventana de 24 h. */
  texto: string;
  programar: boolean;
  fechaHora: string;
}

/** Ventana de 24 h de Meta: desde el último mensaje del cliente. Sin mensaje → fuera. */
export function dentroDeVentana(ultimaRespuestaCliente: string | Date | null | undefined, ahora: Date): boolean {
  const i = aInstante(ultimaRespuestaCliente);
  return !!i && ahora.getTime() - i.getTime() < 24 * 3_600_000;
}

export function validarWhatsApp(v: ValoresWhatsApp, opciones: { dentroVentana: boolean }): Partial<Record<keyof ValoresWhatsApp, string>> {
  const e: Partial<Record<keyof ValoresWhatsApp, string>> = {};
  if (!v.canalId) e.canalId = 'obligatorio';
  if (!opciones.dentroVentana && !v.plantillaId) e.plantillaId = 'plantillaObligatoria';
  if (opciones.dentroVentana && !v.plantillaId && !v.texto.trim()) e.texto = 'obligatorio';
  if (v.programar && !v.fechaHora) e.fechaHora = 'obligatorio';
  return e;
}

// ─── Reunión ───────────────────────────────────────────────────────────────

export interface ValoresReunion {
  titulo: string;
  /** `date`. */
  dia: string;
  /** «HH:mm», hora de la organización. */
  hora: string;
  duracionMin: number;
  participantes: string[];
  lugar: string;
}

export const DURACIONES_REUNION = [15, 30, 45, 60, 90, 120] as const;

export function validarReunion(v: ValoresReunion, hoy: string): Partial<Record<keyof ValoresReunion, string>> {
  const e: Partial<Record<keyof ValoresReunion, string>> = {};
  if (!v.titulo.trim()) e.titulo = 'obligatorio';
  if (!v.dia) e.dia = 'obligatorio';
  else if (v.dia < hoy) e.dia = 'fechaPasada';
  if (!/^\d{2}:\d{2}$/.test(v.hora)) e.hora = 'obligatorio';
  if (!(v.duracionMin > 0)) e.duracionMin = 'obligatorio';
  return e;
}

/** Hora de fin «HH:mm» (puede pasar de medianoche: se muestra igual). */
export function horaFin(hora: string, duracionMin: number): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hora);
  if (!m) return '';
  const total = (Number(m[1]) * 60 + Number(m[2]) + duracionMin) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function datosReunion(v: ValoresReunion, destino: DestinoActividad, zona: string) {
  const inicio = plainDateToInstant(v.dia, zona, v.hora);
  const fin = new Date(new Date(inicio).getTime() + v.duracionMin * 60_000).toISOString();
  return {
    title: v.titulo.trim(),
    start_at: inicio,
    end_at: fin,
    timezone: zona,
    location: v.lugar.trim() || null,
    customer_id: destino.clienteId,
    opportunity_id: destino.oportunidadId ?? null,
    event_type: 'meeting',
    status: 'confirmed' as const,
    metadata: { participants: v.participantes },
  };
}

// ─── Nota ──────────────────────────────────────────────────────────────────

export interface ValoresNota {
  cuerpo: string;
  fijar: boolean;
}

export function validarNota(v: ValoresNota): Partial<Record<keyof ValoresNota, string>> {
  return v.cuerpo.trim() ? {} : { cuerpo: 'obligatorio' };
}

/** `notes`: se cuelga de la oportunidad si la hay; la línea de tiempo la muestra también en el cliente. */
export function datosNota(v: ValoresNota, destino: DestinoActividad) {
  return {
    body: v.cuerpo.trim(),
    related_type: destino.oportunidadId ? 'opportunity' : 'customer',
    related_id: destino.oportunidadId ?? destino.clienteId,
    is_pinned: v.fijar,
  };
}
