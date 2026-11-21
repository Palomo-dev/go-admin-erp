/**
 * Textos del horario de una promoción para el listado, el detalle y la
 * confirmación de la edición masiva. Lo que dice sale de las mismas
 * columnas que evalúa el motor (`vigencia.tramosSemanalesDe`).
 */
import { getOffsetMinutesForTimezone } from '@/lib/utils/dateCore';
import { franjasSemanalesDe, type HorarioPromocion } from '@/lib/promotions/vigencia';
import type { DiaPromocion } from '../diasPromocion';
import type { WeekDay } from '../types';

export type Traductor = (clave: string, valores?: Record<string, string | number>) => string;

function horaCorta(valor: unknown): string {
  if (valor == null) return '';
  const m = String(valor).match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

/** «22 h», «6 h 30 min», «45 min». */
export function textoDuracion(minutos: number, t: Traductor): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return t('horario.minutos', { m });
  if (m === 0) return t('horario.horas', { h });
  return t('horario.horasMinutos', { h, m });
}

/** «UTC−5», «UTC+5:45». */
export function textoDesfase(zona: string, ahora: Date = new Date()): string {
  let minutos = 0;
  try {
    minutos = getOffsetMinutesForTimezone(zona, ahora);
  } catch {
    minutos = 0;
  }
  if (minutos === 0) return 'UTC';
  const signo = minutos < 0 ? '−' : '+';
  const abs = Math.abs(minutos);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${signo}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

function nombreDia(dia: WeekDay, dias: readonly DiaPromocion[], forma: 'corto' | 'largo'): string {
  return dias.find((d) => d.value === dia)?.[forma] ?? dia;
}

/**
 * Líneas cortas del horario: «Sáb 16:00 → Dom 14:00» por franja; o los días
 * («Vie, Sáb») y la franja diaria («20:00–02:00 (día siguiente)»); o «Todo
 * el día».
 */
export function lineasHorario(p: HorarioPromocion, t: Traductor, dias: readonly DiaPromocion[]): string[] {
  const franjas = franjasSemanalesDe(p.schedule_windows);
  if (franjas) {
    return franjas.map((f) => `${nombreDia(f.desde_dia, dias, 'corto')} ${f.desde_hora} → ${nombreDia(f.hasta_dia, dias, 'corto')} ${f.hasta_hora}`);
  }
  const lineas: string[] = [];
  const elegidos = Array.isArray(p.applicable_days) ? (p.applicable_days as WeekDay[]) : [];
  if (elegidos.length > 0) {
    const cortos = dias.filter((d) => elegidos.includes(d.value)).map((d) => d.corto);
    if (cortos.length > 0) lineas.push(cortos.join(', '));
  }
  const ini = horaCorta(p.start_time);
  const fin = horaCorta(p.end_time);
  if (!ini && !fin) lineas.push(t('lista.todoElDia'));
  else if (ini && !fin) lineas.push(t('lista.desde', { hora: ini }));
  else if (!ini && fin) lineas.push(t('lista.hasta', { hora: fin }));
  else lineas.push(fin < ini ? `${ini}–${fin} (${t('lista.diaSiguiente')})` : `${ini}–${fin}`);
  return lineas;
}
