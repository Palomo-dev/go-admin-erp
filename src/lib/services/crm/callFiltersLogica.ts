import { nextPlainDay, startOfDayInstant } from "@/lib/utils/dateCore";
import type { CallFilters } from "./callManagementService";

/** Los días del filtro pertenecen a la organización; los instantes conservan su offset. */
export function normalizarFechasLlamadas(
  filters: CallFilters,
  timezone: string,
): CallFilters {
  const normalized = { ...filters };
  if (filters.from_date && /^\d{4}-\d{2}-\d{2}$/.test(filters.from_date)) {
    normalized.from_date = startOfDayInstant(
      filters.from_date,
      timezone,
    ).toISOString();
  }
  if (filters.to_date && /^\d{4}-\d{2}-\d{2}$/.test(filters.to_date)) {
    normalized.to_date = startOfDayInstant(
      nextPlainDay(filters.to_date),
      timezone,
    ).toISOString();
    normalized.to_date_exclusive = true;
  }
  return normalized;
}
