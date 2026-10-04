import { filasACsv } from "@/lib/utils/csv";
import type { CallListRow } from "@/lib/services/crm/callManagementService";

export interface CallsTableFilters {
  direction: string;
  mode: string;
  outcome: string;
  mine: boolean;
  hasRecording: boolean;
  q: string;
  fromDate: string;
  toDate: string;
}

export const EMPTY_FILTERS: CallsTableFilters = {
  direction: "",
  mode: "",
  outcome: "",
  mine: false,
  hasRecording: false,
  q: "",
  fromDate: "",
  toDate: "",
};

/** Los días se envían sin offset: el servidor usa la zona de la organización. */
export function parametrosLlamadas(
  filters: CallsTableFilters,
  page: number,
  limit: number,
) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String((page - 1) * limit),
  });
  for (const [key, value] of Object.entries({
    direction: filters.direction,
    mode: filters.mode,
    outcome: filters.outcome,
    user_id: filters.mine ? "me" : "",
    has_recording: filters.hasRecording ? "true" : "",
    q: filters.q.trim(),
    from_date: filters.fromDate,
    to_date: filters.toDate,
  }))
    if (value) params.set(key, value);
  return params;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

/** Evita que valores de clientes se ejecuten como fórmulas al abrir el CSV. */
export function csvLlamadas(
  rows: CallListRow[],
  headers: string[],
  date: (value: string) => string,
) {
  return filasACsv(
    headers,
    rows.map((c) => [
      date(c.started_at ?? c.created_at),
      c.customer?.full_name,
      c.direction === "inbound" ? c.from_number : c.to_number,
      c.mode,
      [c.user?.first_name, c.user?.last_name].filter(Boolean).join(" "),
      c.duration_seconds,
      c.disposition_outcome,
      c.status,
      c.analysis?.sentiment,
    ]),
  );
}
