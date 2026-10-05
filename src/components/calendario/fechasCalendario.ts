import { format } from 'date-fns';
import { aFechaHoraLocal, horaEnZona } from '@/components/crm/kit/fechasCrm';
import { addPlainDays, plainDateToInstant, toPlainDate } from '@/lib/utils/dateDisplay';

/** Cursor del datepicker: representa un día plano, nunca un instante de negocio. */
export function cursorDelDia(dia: string): Date {
  const [year, month, day] = dia.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
export function diaDelCursor(cursor: Date): string { return format(cursor, 'yyyy-MM-dd'); }
export function instanteDelSlot(cursor: Date, hour: number, timezone: string): Date {
  const dia = hour === 24 ? addPlainDays(diaDelCursor(cursor), 1) : diaDelCursor(cursor);
  return new Date(plainDateToInstant(dia, timezone, `${String(hour % 24).padStart(2, '0')}:00`));
}
export function minutosEnZona(value: string, timezone: string): number {
  const [hour, minute] = horaEnZona(value, timezone).split(':').map(Number);
  return hour * 60 + minute;
}
export function limitesDelDia(cursor: Date, timezone: string): { start: number; end: number } {
  const dia = diaDelCursor(cursor);
  return { start: Date.parse(plainDateToInstant(dia, timezone)), end: Date.parse(plainDateToInstant(addPlainDays(dia, 1), timezone)) };
}
export function ocupaDia(start: string, end: string | null, cursor: Date, timezone: string): boolean {
  const bounds = limitesDelDia(cursor, timezone);
  const startMs = Date.parse(start);
  const endMs = end ? Date.parse(end) : startMs + 3600000;
  return startMs < bounds.end && endMs > bounds.start;
}
export function ocupaSlot(start: string, end: string | null, cursor: Date, hour: number, timezone: string): boolean {
  const startMs = Date.parse(start);
  const endMs = end ? Date.parse(end) : startMs + 3600000;
  return startMs < instanteDelSlot(cursor, hour + 1, timezone).getTime() && endMs > instanteDelSlot(cursor, hour, timezone).getTime();
}
export function moverFechasEvento(start: string, end: string | null, targetDay: Date, hour: number, timezone: string): { start_at: string; end_at: string } {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Hora inválida');
  const duration = end ? Date.parse(end) - Date.parse(start) : 3600000;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duración inválida');
  const moved = new Date(plainDateToInstant(toPlainDate(targetDay, timezone), timezone, `${String(hour).padStart(2, '0')}:00`));
  return { start_at: moved.toISOString(), end_at: new Date(moved.getTime() + duration).toISOString() };
}
export { aFechaHoraLocal };
