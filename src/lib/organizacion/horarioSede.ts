/**
 * Horario de una sede (`branches.opening_hours`): horario por defecto, turnos partidos y
 * validación. Puro: lo usan el formulario de Sucursales, la ficha de la sede y branchService.
 *
 * Formato (jsonb, sin migración):
 *   { monday: { open: 'HH:MM', close: 'HH:MM', closed: boolean, tramos?: [{ open, close }] }, … }
 * Con turnos partidos se guarda `tramos` (2 o más, ordenados y sin solapes) y, además,
 * `open` = apertura del primer turno y `close` = cierre del último, para los lectores que no
 * conocen `tramos` (el sitio web los lee: goadmin-websites/lib/restaurant/horario.ts).
 *
 * Horario por defecto: lo que el formulario guardaba sin que nadie lo tocara (L-V 09:00-18:00,
 * sábado 10:00-15:00, domingo cerrado). 76 de 80 sedes lo tienen (2026-10-06). El sitio no
 * calcula «Abierto ahora» con él; aquí se marca «Horario sin revisar». La regla es la misma
 * que `esHorarioPorDefecto` del sitio (comparación canónica: ignora `closed:false` y las horas
 * de un día cerrado).
 */
import type { DayHours, OpeningHours, TurnoHorario } from '@/types/branch';

export const DIAS_SEMANA = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number];

/** Valor que el formulario y el alta proponen (ya NO se guarda si el usuario no lo toca). */
export const HORARIO_POR_DEFECTO: Required<Pick<OpeningHours, DiaSemana>> = {
  monday: { open: '09:00', close: '18:00', closed: false },
  tuesday: { open: '09:00', close: '18:00', closed: false },
  wednesday: { open: '09:00', close: '18:00', closed: false },
  thursday: { open: '09:00', close: '18:00', closed: false },
  friday: { open: '09:00', close: '18:00', closed: false },
  saturday: { open: '10:00', close: '15:00', closed: false },
  sunday: { open: '09:00', close: '18:00', closed: true },
};

const HORA = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

function horaValida(valor: unknown): string | null {
  const m = HORA.exec(String(valor ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Turnos del día: los `tramos` válidos, o el único `open`–`close`. Cerrado o inválido → []. */
export function turnosDelDia(dia: unknown): TurnoHorario[] {
  if (!esObjeto(dia) || dia.closed === true) return [];
  if (Array.isArray(dia.tramos)) {
    const turnos = dia.tramos
      .filter(esObjeto)
      .map((t) => ({ open: horaValida(t.open), close: horaValida(t.close) }))
      .filter((t): t is TurnoHorario => !!t.open && !!t.close && t.open !== t.close);
    if (turnos.length > 0) return turnos;
  }
  const open = horaValida(dia.open);
  const close = horaValida(dia.close);
  return open && close && open !== close ? [{ open, close }] : [];
}

/**
 * Error de los turnos de un día (o null): vacío, apertura igual al cierre, solape, o un turno
 * que cruza la medianoche que no es el último.
 */
export function errorTurnos(turnos: readonly TurnoHorario[]): 'vacio' | 'igual' | 'solape' | 'medianoche' | null {
  if (turnos.length === 0) return 'vacio';
  const ordenados = [...turnos].sort((a, b) => aMinutos(a.open) - aMinutos(b.open));
  for (let i = 0; i < ordenados.length; i++) {
    const t = ordenados[i];
    if (t.open === t.close) return 'igual';
    const cruza = aMinutos(t.close) < aMinutos(t.open);
    if (cruza && i < ordenados.length - 1) return 'medianoche';
    const siguiente = ordenados[i + 1];
    if (siguiente && aMinutos(siguiente.open) < aMinutos(t.close)) return 'solape';
  }
  return null;
}

/**
 * Un día listo para guardar: con 2 o más turnos lleva `tramos` ordenados y `open`/`close` como
 * envolvente; con uno, el formato de siempre (sin `tramos`).
 */
export function normalizarDia(dia: Partial<DayHours> | null | undefined): DayHours {
  const cerrado = dia?.closed === true;
  const turnos = turnosDelDia({ ...dia, closed: false }).sort((a, b) => aMinutos(a.open) - aMinutos(b.open));
  if (turnos.length === 0) {
    return { open: horaValida(dia?.open) ?? '09:00', close: horaValida(dia?.close) ?? '18:00', closed: cerrado || !dia?.open || !dia?.close };
  }
  const base: DayHours = { open: turnos[0].open, close: turnos[turnos.length - 1].close, closed: cerrado };
  return turnos.length >= 2 ? { ...base, tramos: turnos } : base;
}

/** El horario completo listo para guardar (los días ausentes se omiten, como antes). */
export function normalizarHorario(entrada: unknown): OpeningHours | null {
  if (!esObjeto(entrada)) return null;
  const salida: OpeningHours = {};
  for (const dia of DIAS_SEMANA) {
    const v = entrada[dia];
    if (esObjeto(v)) salida[dia] = normalizarDia(v as Partial<DayHours>);
  }
  return salida;
}

/** true si es el horario por defecto del formulario (sin revisar). */
export function esHorarioPorDefecto(horario: unknown): boolean {
  if (!esObjeto(horario)) return false;
  return DIAS_SEMANA.every((dia) => {
    const turnos = turnosDelDia(horario[dia]);
    const def = HORARIO_POR_DEFECTO[dia];
    if (def.closed) return turnos.length === 0;
    return turnos.length === 1 && turnos[0].open === def.open && turnos[0].close === def.close;
  });
}
