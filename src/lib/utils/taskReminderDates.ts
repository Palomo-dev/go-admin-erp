// ============================================================
// Cálculo de fechas de los recordatorios de tareas (campana del header).
//
// `tasks.due_date` es timestamptz: el día de vencimiento es el día
// calendario de ese instante en la zona de la organización, no en la del
// navegador ni en UTC. Todo se hace sobre días YYYY-MM-DD para que el
// resultado no dependa de la TZ del proceso (ver
// docs/reglas-fechas-timezone.md).
// ============================================================

import { plainDateToInstant, toPlainDate } from '@/lib/utils/dateDisplay';

/** Días hacia adelante que cubre la campana (además de las vencidas). */
export const DIAS_VENTANA_RECORDATORIOS = 7;

const MS_DIA = 86_400_000;

function aUtc(dia: string): number {
  const [anio, mes, d] = dia.split('-').map(Number);
  return Date.UTC(anio, mes - 1, d);
}

/** Suma `dias` a un día calendario YYYY-MM-DD, sin pasar por la zona del proceso. */
export function sumarDiasCalendario(dia: string, dias: number): string {
  const f = new Date(aUtc(dia) + dias * MS_DIA);
  const mes = String(f.getUTCMonth() + 1).padStart(2, '0');
  const d = String(f.getUTCDate()).padStart(2, '0');
  return `${f.getUTCFullYear()}-${mes}-${d}`;
}

/** Días calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA);
}

/**
 * Hoy en la zona de la organización y el límite superior (exclusivo) de la
 * consulta: el inicio del día `hoy + DIAS_VENTANA + 1`, como instante con
 * offset. Así entra completo el último día de la ventana.
 */
export function ventanaRecordatorios(timezone: string, ahora: Date = new Date()) {
  const hoy = toPlainDate(ahora, timezone);
  const hastaExclusivo = plainDateToInstant(
    sumarDiasCalendario(hoy, DIAS_VENTANA_RECORDATORIOS + 1),
    timezone,
  );
  return { hoy, hastaExclusivo };
}

/** Días desde `hoy` hasta el día de vencimiento de un timestamptz, en la zona dada. */
export function diasHastaVencimiento(dueDate: string, hoy: string, timezone: string): number {
  return diasEntre(hoy, toPlainDate(new Date(dueDate), timezone));
}
