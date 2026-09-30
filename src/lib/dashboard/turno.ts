/**
 * «Tu turno» en el inicio (Figma «Inicio — Marcar turno», sección 631:21816,
 * nota 631:385119; aprobada por el dueño el 2026-09-30).
 *
 * Regla pura: del turno asignado hoy y las marcaciones de la persona al estado
 * de la tarjeta y del botón del encabezado. NO marca nada: marcar entrada o
 * salida sigue siendo el flujo existente de HRM (`/marcar`, escáner QR →
 * `QRAttendanceService.validateAndRecord`), que decide si el evento es entrada
 * o salida con la misma regla que se lee aquí (último evento del empleado).
 *
 * Estados (nota de comportamiento del Figma):
 *  - `antes`: aún no llega la hora de entrada → «Marcar entrada».
 *  - `sinMarcar`: pasó la hora de entrada sin marcar → badge «N min tarde».
 *  - `enTurno`: entrada marcada sin salida → «Marcar salida · 3 h 12 min».
 *  - `cerrado`: entrada y salida → «Ver mis marcaciones».
 *  - `sinTurno`: tiene contrato activo pero ningún turno hoy → acceso simple
 *    «Marcar turno» (la marcación por QR no exige turno asignado).
 * Todas las horas se formatean en la zona de la organización al pintar.
 */
import { addPlainDays, wallTimeToInstant } from '@/lib/utils/dateCore';

export type EstadoTurno = 'antes' | 'sinMarcar' | 'enTurno' | 'cerrado' | 'sinTurno';

export interface TurnoAsignado {
  /** `HH:mm[:ss]` de la plantilla o del turno real. */
  inicio: string;
  fin: string;
}

export interface Marcacion {
  tipo: 'check_in' | 'check_out' | 'break_start' | 'break_end' | string;
  en: string;
}

export interface EntradaTurno {
  hoy: string;
  zona: string;
  ahora: Date;
  turno: TurnoAsignado | null;
  /** Marcaciones recientes del empleado (cualquier orden). */
  marcaciones: Marcacion[];
}

export interface TurnoCalculado {
  estado: EstadoTurno;
  /** Instantes ISO (se formatean con la zona de la organización). */
  entradaProgramada: string | null;
  salidaProgramada: string | null;
  entradaMarcada: string | null;
  salidaMarcada: string | null;
  /** Minutos de retraso (`sinMarcar`) o transcurridos (`enTurno`/`cerrado`). */
  minutos: number;
}

/** Margen antes de la hora de entrada en que una marcación ya cuenta para el turno. */
const MARGEN_PREVIO_MS = 4 * 3_600_000;
const MIN_MS = 60_000;

function hhmm(h: string): string {
  return h.slice(0, 5);
}

/** Minutos enteros entre dos instantes (≥ 0). */
export function minutosEntre(desde: Date | string, hasta: Date | string): number {
  const d = typeof desde === 'string' ? Date.parse(desde) : desde.getTime();
  const h = typeof hasta === 'string' ? Date.parse(hasta) : hasta.getTime();
  if (!Number.isFinite(d) || !Number.isFinite(h)) return 0;
  return Math.max(0, Math.floor((h - d) / MIN_MS));
}

/** «3 h 12 min» / «45 min» a partir de minutos (texto neutro, sin idioma). */
export function partesDuracion(minutos: number): { horas: number; minutos: number } {
  const m = Math.max(0, Math.floor(minutos));
  return { horas: Math.floor(m / 60), minutos: m % 60 };
}

export function calcularTurno(e: EntradaTurno): TurnoCalculado {
  const ordenadas = [...e.marcaciones]
    .filter((m) => Number.isFinite(Date.parse(m.en)))
    .sort((a, b) => Date.parse(a.en) - Date.parse(b.en));

  // Sin turno: el estado sale solo de las marcaciones de hoy (la persona puede
  // marcar por QR aunque nadie le haya asignado un turno).
  if (!e.turno) {
    return { estado: 'sinTurno', entradaProgramada: null, salidaProgramada: null, entradaMarcada: null, salidaMarcada: null, minutos: 0 };
  }

  const entrada = wallTimeToInstant(e.hoy, hhmm(e.turno.inicio), e.zona);
  // Turno nocturno: la salida es al día siguiente.
  const diaSalida = hhmm(e.turno.fin) <= hhmm(e.turno.inicio) ? addPlainDays(e.hoy, 1) : e.hoy;
  const salida = wallTimeToInstant(diaSalida, hhmm(e.turno.fin), e.zona);
  const base = {
    entradaProgramada: entrada.toISOString(),
    salidaProgramada: salida.toISOString(),
  };

  const delTurno = ordenadas.filter((m) => Date.parse(m.en) >= entrada.getTime() - MARGEN_PREVIO_MS);
  const entradaMarcada = delTurno.find((m) => m.tipo === 'check_in') ?? null;
  const salidaMarcada = entradaMarcada
    ? [...delTurno].reverse().find((m) => m.tipo === 'check_out' && Date.parse(m.en) >= Date.parse(entradaMarcada.en)) ?? null
    : null;

  if (entradaMarcada && salidaMarcada) {
    return {
      ...base,
      estado: 'cerrado',
      entradaMarcada: entradaMarcada.en,
      salidaMarcada: salidaMarcada.en,
      minutos: minutosEntre(entradaMarcada.en, salidaMarcada.en),
    };
  }
  if (entradaMarcada) {
    return { ...base, estado: 'enTurno', entradaMarcada: entradaMarcada.en, salidaMarcada: null, minutos: minutosEntre(entradaMarcada.en, e.ahora) };
  }
  if (e.ahora.getTime() < entrada.getTime()) {
    return { ...base, estado: 'antes', entradaMarcada: null, salidaMarcada: null, minutos: 0 };
  }
  return { ...base, estado: 'sinMarcar', entradaMarcada: null, salidaMarcada: null, minutos: minutosEntre(entrada, e.ahora) };
}
