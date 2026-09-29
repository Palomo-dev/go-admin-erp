/**
 * Check-in desde una reserva de clase (docs/design/MEMBRESIAS-FASE-1-2.md §13) — lógica pura.
 *
 * Quien decide es `fn_membresia_registrar_checkin(..., p_class_reservation_id)`: valida que la
 * reserva sea de la organización y del miembro, aplica las mismas reglas de la entrada (vencida,
 * congelada, gracia con aviso, sede, horario, tope diario), marca la reserva `checked_in` si se
 * permite y es idempotente (un segundo clic devuelve la misma entrada con `repetida: true`).
 * Aquí solo: cuándo ofrecer el botón, cómo se lee la respuesta de la base y qué aviso mostrar.
 */
import type { EstadoMembresia } from './vigencia';
import { ERRORES_MEMBRESIAS, type ErrorMembresias, type ResultadoCheckin } from './tipos';

/**
 * ¿Se ofrece «Registrar entrada» para una reserva? Reservada o marcada «no asistió» (llegó tarde)
 * sí; cancelada no; ya asistió no (la base respondería `repetida`, no hace falta el botón).
 */
export function puedeRegistrarEntradaReserva(estado: string | null | undefined, claseCancelada = false): boolean {
  if (claseCancelada) return false;
  return estado === 'booked' || estado === 'no_show';
}

type Fila = Record<string, unknown>;

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numeroONulo = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

/** Respuesta jsonb de fn_membresia_registrar_checkin → contrato de la interfaz. */
export function mapearResultadoCheckin(data: unknown): ResultadoCheckin {
  const r = (data && typeof data === 'object' ? data : {}) as Fila;
  const m = (r.membresia && typeof r.membresia === 'object' ? r.membresia : null) as Fila | null;
  const res = (r.reserva && typeof r.reserva === 'object' ? r.reserva : null) as Fila | null;
  return {
    permitido: r.permitido === true,
    motivo: texto(r.motivo),
    aviso: texto(r.aviso),
    diasGracia: numeroONulo(r.dias_gracia),
    checkinId: numero(r.checkin_id),
    membresia: m
      ? {
          id: numero(m.id),
          estado: String(m.estado) as EstadoMembresia,
          plan: texto(m.plan),
          desde: String(m.desde),
          hasta: String(m.hasta),
          graceUntil: texto(m.grace_until),
          codigo: texto(m.codigo),
        }
      : null,
    repetida: r.repetida === true,
    reserva: res ? { id: numero(res.id), estado: String(res.estado ?? '') } : null,
  };
}

export type AvisoEntradaReserva = 'repetida' | 'rechazada' | 'permitida_con_aviso' | 'permitida';

/** Qué toast corresponde: rechazo (peligro), ya registrada (información), con aviso (gracia) o éxito. */
export function avisoEntradaReserva(r: Pick<ResultadoCheckin, 'permitido' | 'aviso' | 'repetida'>): AvisoEntradaReserva {
  if (r.repetida) return 'repetida';
  if (!r.permitido) return 'rechazada';
  return r.aviso ? 'permitida_con_aviso' : 'permitida';
}

const CODIGOS = new Set<string>(ERRORES_MEMBRESIAS);
const NO_ENCONTRADO = new Set<string>(['membresia_no_encontrada', 'cliente_no_encontrado', 'reserva_no_encontrada']);

/** Error de una RPC de membresías → código conocido y estado HTTP (403 permiso, 404 no existe, 422 regla). */
export function estadoErrorRpc(err: { message?: string; code?: string } | null): { codigo: ErrorMembresias; estado: number } {
  const msg = err?.message ?? '';
  if (CODIGOS.has(msg)) {
    const estado = msg === 'sin_permiso' ? 403 : NO_ENCONTRADO.has(msg) ? 404 : 422;
    return { codigo: msg as ErrorMembresias, estado };
  }
  if (err?.code === '42501') return { codigo: 'sin_permiso', estado: 403 };
  return { codigo: 'error_interno', estado: 500 };
}
