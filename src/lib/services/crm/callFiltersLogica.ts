/**
 * Días del filtro de Llamadas → instantes en la zona de la ORGANIZACIÓN
 * (docs/reglas-fechas-timezone.md §2–§3). El navegador manda `YYYY-MM-DD`; el
 * servidor los convierte con la zona que sale de `getOrganizationTimezone`.
 * «Hasta» es exclusivo al inicio del día siguiente: una llamada a las 23:59:59
 * del último día entra y una de las 00:00 del siguiente no.
 * Un instante con offset (ISO) se respeta tal cual.
 */
import { nextPlainDay, plainDateToInstant } from '@/lib/utils/dateDisplay';
import type { CallFilters } from './callManagementService';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export function normalizarFechasLlamadas(filters: CallFilters, timezone: string): CallFilters {
  const normalized = { ...filters };
  if (filters.from_date && DIA.test(filters.from_date)) {
    normalized.from_date = new Date(plainDateToInstant(filters.from_date, timezone)).toISOString();
  }
  if (filters.to_date && DIA.test(filters.to_date)) {
    normalized.to_date = new Date(plainDateToInstant(nextPlainDay(filters.to_date), timezone)).toISOString();
    normalized.to_date_exclusive = true;
  }
  return normalized;
}
