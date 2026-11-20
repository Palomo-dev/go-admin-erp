/**
 * Estado que muestran el listado y el detalle, con el MISMO criterio del
 * motor (`vigencia.vigenteEnHorario`): una promoción del fin de semana un
 * martes está «Pendiente» (vigente pero fuera de su horario), no «Activa».
 * Los valores son claves de `StatusBadge` (kit/estadoTono).
 */
import { vigenteEnHorario } from '@/lib/promotions/vigencia';
import type { Promotion } from './types';

export type EstadoPromo = 'inactiva' | 'programada' | 'expirada' | 'activa' | 'pendiente';

export function estadoDePromocion(
  promo: Pick<Promotion, 'is_active' | 'start_date' | 'end_date' | 'applicable_days' | 'start_time' | 'end_time' | 'schedule_windows'>,
  ahora: Date,
  zona: string,
): EstadoPromo {
  if (!promo.is_active) return 'inactiva';
  const inicio = new Date(promo.start_date).getTime();
  if (Number.isFinite(inicio) && inicio > ahora.getTime()) return 'programada';
  if (vigenteEnHorario(promo, ahora, zona)) return 'activa';
  // Fuera de horario: vencida si ya pasó la fecha fin; si no, a la espera de su próxima franja.
  if (promo.end_date) {
    const fin = new Date(promo.end_date).getTime();
    if (!Number.isFinite(fin) || fin < ahora.getTime()) return 'expirada';
  }
  return 'pendiente';
}
