import type { CrmSesion } from './crmRouteSupport';

/** La auditoría pública nunca incluye el snapshot ni los ids de filas movidas. */
export const MERGE_HISTORY_SELECT = 'id, primary_customer_id, secondary_customer_id, merged_at, merged_by, undone_at, undone_by, reason:snapshot->>reason, moved_rows, principal:customers!customer_merges_primary_customer_id_fkey(full_name), secundario:customers!customer_merges_secondary_customer_id_fkey(full_name), autor:profiles!customer_merges_merged_by_fkey(first_name,last_name)';

export interface MergeHistoryRow {
  id: string;
  primary_customer_id: string;
  secondary_customer_id: string;
  merged_at: string;
  merged_by: string;
  undone_at: string | null;
  undone_by: string | null;
  principal: { full_name: string | null } | null;
  secundario: { full_name: string | null } | null;
  autor: { first_name: string | null; last_name: string | null } | null;
  moved_counts: { table: string; count: number }[];
  reason?: 'document' | 'email' | 'phone' | 'manual' | 'unknown';
}

interface StoredHistoryRow extends Omit<MergeHistoryRow, 'moved_counts' | 'reason'> {
  moved_rows: unknown;
  reason?: unknown;
}

export function publicMergeHistory(row: StoredHistoryRow): MergeHistoryRow {
  const { moved_rows } = row;
  const moved_counts = Array.isArray(moved_rows) ? moved_rows.flatMap((move: unknown) => {
    if (!move || typeof move !== 'object') return [];
    const value = move as { table?: unknown; ids?: unknown };
    return typeof value.table === 'string' && Array.isArray(value.ids)
      ? [{ table: value.table, count: value.ids.length }] : [];
  }) : [];
  const reason = ['document', 'email', 'phone', 'manual'].includes(String(row.reason))
    ? row.reason as MergeHistoryRow['reason'] : 'unknown';
  return { id: row.id, primary_customer_id: row.primary_customer_id, secondary_customer_id: row.secondary_customer_id,
    merged_at: row.merged_at, merged_by: row.merged_by, undone_at: row.undone_at, undone_by: row.undone_by,
    principal: row.principal, secundario: row.secundario, autor: row.autor, reason, moved_counts };
}

/** Mismo intervalo cerrado para la lista y todas las páginas de la exportación. */
export function mergeHistoryWindow(now = new Date()) {
  return { from: new Date(now.getTime() - 90 * 86400000).toISOString(), to: now.toISOString() };
}

export async function readMergeHistoryPage(ctx: CrmSesion, start: number, size: number, window = mergeHistoryWindow()) {
  const { data, error, count } = await ctx.supabase.from('customer_merges')
    .select(MERGE_HISTORY_SELECT, { count: 'exact' })
    .eq('organization_id', ctx.organizationId)
    .gte('merged_at', window.from).lte('merged_at', window.to)
    .order('merged_at', { ascending: false }).order('id')
    .range(start, start + size - 1);
  if (error) throw error;
  if (count === null) throw new Error('No se pudo contar el historial de fusiones');
  return { data: ((data ?? []) as unknown as StoredHistoryRow[]).map(publicMergeHistory), total: count };
}

/** Pagina el historial completo; no exporta solo las 25 filas visibles. */
export async function readMergeHistoryExport(ctx: CrmSesion) {
  const window = mergeHistoryWindow();
  const rows: MergeHistoryRow[] = [];
  for (let start = 0; ; start += 250) {
    const page = await readMergeHistoryPage(ctx, start, 250, window);
    rows.push(...page.data);
    if (rows.length >= page.total) return rows;
    if (page.data.length < 250) throw new Error('No se pudo completar el historial de fusiones');
  }
}
