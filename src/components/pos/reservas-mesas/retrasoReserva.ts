/**
 * «No ha llegado»: lógica pura del aviso de la lista de reservas.
 *
 * Misma regla que `fn_reservas_mesa_avisos_retraso` (migración D5): una reserva
 * `confirmed`, sin sentar, 15 minutos después de su hora y con menos de 6 h de
 * retraso. La hora es de PARED de la sede: el instante sale de la zona de la
 * sucursal (`wallTimeToInstant`), nunca de la del navegador.
 */
import { wallTimeToInstant } from '@/lib/utils/dateCore';

export const MINUTOS_TOLERANCIA_LLEGADA = 15;
const MAX_RETRASO_MIN = 6 * 60;

export interface ReservaParaRetraso {
  status: string;
  seated_at?: string | null;
  reservation_date: string;
  reservation_time: string;
}

/** Minutos de retraso (negativo: aún no es la hora). */
export function minutosDeRetraso(r: ReservaParaRetraso, ahora: Date, zona: string): number {
  const inicio = wallTimeToInstant(r.reservation_date, r.reservation_time.slice(0, 8), zona);
  return Math.floor((ahora.getTime() - inicio.getTime()) / 60_000);
}

/**
 * Se avisa si la reserva está confirmada, sin sentar y lleva entre 15 min y
 * 6 h de retraso, salvo que el equipo la haya pospuesto hasta `pospuestaHasta`.
 */
export function debeAvisarRetraso(
  r: ReservaParaRetraso,
  ahora: Date,
  zona: string,
  pospuestaHasta?: number | null,
): boolean {
  if (r.status !== 'confirmed' || r.seated_at) return false;
  if (pospuestaHasta != null && ahora.getTime() < pospuestaHasta) return false;
  const retraso = minutosDeRetraso(r, ahora, zona);
  return retraso >= MINUTOS_TOLERANCIA_LLEGADA && retraso < MAX_RETRASO_MIN;
}

/** `tel:` limpio para «Llamar» (solo dígitos y +). Null si no hay teléfono usable. */
export function enlaceTelefono(telefono: string | null | undefined): string | null {
  const limpio = (telefono ?? '').replace(/[^\d+]/g, '');
  return limpio.replace(/\D/g, '').length >= 7 ? `tel:${limpio}` : null;
}
