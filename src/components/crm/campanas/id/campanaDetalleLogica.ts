import type { CampaignStatsResult } from '@/components/crm/whatsapp/api';

/** Los contadores de envío son acumulativos; no se suman entrega, lectura y respuesta. */
export function resumenCampana(stats: CampaignStatsResult) {
  const counts = stats.counts;
  const processed = counts.sent + counts.failed + counts.skipped;
  return {
    counts, processed, total: counts.total,
    percentage: counts.total > 0 ? Math.min(100, Math.max(0, Math.round(processed / counts.total * 100))) : 0,
    remaining: counts.pending + counts.queued,
    actualCost: stats.actual_cost_complete ? stats.actual_cost : null,
    knownCost: stats.known_actual_cost,
    unpriced: stats.unpriced_contacts,
    estimatedCost: stats.estimated_cost,
  };
}

export function campaignPauseKey(reason: unknown): string {
  return ['no_credits', 'rne_required', 'data_policy_required', 'template_paused', 'template_not_verified', 'provider_error', 'provider_event_conflict']
    .includes(String(reason)) ? String(reason) : 'other';
}
