import type { CallListRow } from '@/lib/services/crm/callManagementService';
export interface MobileHistoryScope { organizationId: number; userId: string; branch: string }
export interface MobileHistoryRow { id: string; name: string | null; number: string; startedAt: string; direction: string; mode: string; status: string; outcome: string | null; duration: number | null }
export const MOBILE_HISTORY_TTL = 15 * 60 * 1000;
export function mobileHistoryKey(scope: MobileHistoryScope) { return `crm.phone.history.v1:${scope.organizationId}:${scope.userId}:${scope.branch}`; }
export function mobileHistoryRow(row: CallListRow): MobileHistoryRow {
  return { id: row.id, name: row.customer?.full_name || [row.customer?.first_name, row.customer?.last_name].filter(Boolean).join(' ') || null,
    number: row.direction === 'inbound' ? row.from_number : row.to_number, startedAt: row.started_at || row.created_at,
    direction: row.direction, mode: row.mode, status: row.status, outcome: row.disposition_outcome, duration: row.duration_seconds };
}
/** Sólo la proyección visible, hasta 20 filas; nunca notas, metadata, tokens ni URLs privadas. */
export function encodeMobileHistory(scope: MobileHistoryScope, rows: MobileHistoryRow[], now = Date.now()) { return JSON.stringify({ scope, savedAt: now, rows: rows.slice(0, 20) }); }
export function decodeMobileHistory(raw: string | null, scope: MobileHistoryScope, sessionExpiresAt: number | undefined, now = Date.now()): MobileHistoryRow[] | null {
  if (!raw || !sessionExpiresAt || sessionExpiresAt * 1000 <= now) return null;
  try {
    const data = JSON.parse(raw);
    if (data?.scope?.organizationId !== scope.organizationId || data?.scope?.userId !== scope.userId || data?.scope?.branch !== scope.branch
      || typeof data.savedAt !== 'number' || data.savedAt > now || now - data.savedAt > MOBILE_HISTORY_TTL || !Array.isArray(data.rows) || data.rows.length > 20) return null;
    if (data.rows.some((row: MobileHistoryRow) => !row || typeof row.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.id)
      || typeof row.startedAt !== 'string' || !Number.isFinite(Date.parse(row.startedAt)) || typeof row.number !== 'string'
      || (row.name !== null && typeof row.name !== 'string') || !['inbound', 'outbound'].includes(row.direction)
      || !['browser', 'bridge', 'ai_agent', 'manual'].includes(row.mode) || typeof row.status !== 'string'
      || (row.outcome !== null && typeof row.outcome !== 'string') || (row.duration !== null && (typeof row.duration !== 'number' || !Number.isFinite(row.duration) || row.duration < 0)))) return null;
    return data.rows;
  } catch { return null; }
}
