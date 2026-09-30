// ============================================================
// Rango de instantes de un periodo de reporte.
//
// Único punto por el que un reporte convierte `PeriodoCierre` en el
// `start`/`end` que se le pide a Supabase. Resuelve la zona horaria y las
// horas de operación de la organización, y aplica la franja manual del
// periodo (`horaInicio`/`horaFin`) cuando viene completa.
//
// Nunca la fecha con medianoche UTC pegada: ese es el día UTC, no el de la organización,
// y en Colombia corre al día siguiente todo lo que pasa después de las 7 p. m.
// Las columnas `date` (p. ej. `reservations.checkin`) no pasan por aquí: se
// comparan con `fechaInicio`/`fechaFin` tal cual.
// ============================================================

import { getOrgDateRange, type OperatingHoursOptions } from '@/lib/utils/timezone';
import type { PeriodoCierre, ReportesClient } from './types';

/** Franja manual del periodo, o null si no viene con las dos puntas. */
export function franjaDelPeriodo(periodo: PeriodoCierre): OperatingHoursOptions | null {
  return periodo.horaInicio && periodo.horaFin
    ? { start_time: periodo.horaInicio, end_time: periodo.horaFin }
    : null;
}

/**
 * @param db Cliente con el que corre el reporte. En el servidor (cierre,
 *   asistente, envíos programados) lleva la sesión: sin él, la zona y las horas
 *   de la organización se leerían como `anon` y caerían al valor por defecto.
 */
export async function rangoDelPeriodo(
  orgId: number,
  periodo: PeriodoCierre,
  db?: ReportesClient,
): Promise<{ start: string; end: string; timezone: string }> {
  const { start, end, timezone } = await getOrgDateRange(
    orgId,
    periodo.fechaInicio,
    periodo.fechaFin,
    franjaDelPeriodo(periodo),
    db,
  );
  return { start, end, timezone };
}
