import type { SupabaseClient } from '@supabase/supabase-js';

export interface AutomationSummary {
  active_rules: number;
  executed_7d: number;
  skipped_7d: number;
  failed_7d: number;
  from: string;
  until: string;
}

/** Counts are exact, independent of the visible page and of lifetime runs_count. */
export async function getAutomationSummary(orgId: number, db: SupabaseClient, now = new Date()): Promise<AutomationSummary> {
  const until = now.toISOString();
  const from = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const runs = (statuses: string[]) => db.from('automation_runs').select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId).gte('created_at', from).lte('created_at', until).in('status', statuses);
  const results = await Promise.all([
    db.from('automation_rules').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
    runs(['completed', 'failed']), runs(['skipped']), runs(['failed']),
  ]);
  const counts = results.map(result => {
    if (result.error) throw result.error;
    if (typeof result.count !== 'number') throw new Error('automation_summary_count_missing');
    return result.count;
  });
  return { active_rules: counts[0], executed_7d: counts[1], skipped_7d: counts[2], failed_7d: counts[3], from, until };
}
