import type { SupabaseClient } from '@supabase/supabase-js';
import { matchesTriggerConfig, previewAutomationRule, type AutomationRule } from '../automationService';
import { loadRuleContext, type RuleContext } from './ruleContext';
import { triggerTypeForEvent } from './triggerTypeForEvent';

interface HistoricalEvent {
  id: string; event_type: string; entity_type: string; entity_id: string;
  payload: Record<string, unknown> | null; created_at: string;
}
export interface BulkAutomationPreview {
  from: string; until: string; data_basis: 'current_records'; total: number; matched: number; skipped: number;
  unavailable: number; sample: { event_id: string; occurred_at: string; opportunity_id: string | null;
    customer_id: string | null; name: string; matched: boolean; skip_reason: string | null; trace: unknown[]; actions_plan: unknown[] }[];
}

/** Replays captured triggers with current record data; never runs actions or writes a run. */
export async function previewAutomationHistory(id: string, org: number, db: SupabaseClient, now = new Date()): Promise<BulkAutomationPreview> {
  const { data, error } = await db.from('automation_rules').select('*').eq('organization_id', org).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Regla de automatización no encontrada');
  const rule = data as AutomationRule;
  const until = now.toISOString();
  const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const result: BulkAutomationPreview = { from, until, data_basis: 'current_records', total: 0, matched: 0, skipped: 0, unavailable: 0, sample: [] };
  const contexts = new Map<string, RuleContext>();
  const simulatedRuns = new Map<string, string>();
  for (let offset = 0; ; offset += 250) {
    let query = db.from('crm_events').select('id,event_type,entity_type,entity_id,payload,created_at')
      .eq('organization_id', org).gte('created_at', from).lte('created_at', until);
    if (rule.event) query = query.eq('event_type', rule.event);
    const { data: events, error: readError } = await query.order('created_at', { ascending: true })
      .order('id', { ascending: true }).range(offset, offset + 249);
    if (readError) throw readError;
    if (!Array.isArray(events)) throw new Error('automation_history_response_invalid');
    for (const event of events as HistoricalEvent[]) {
      if (triggerTypeForEvent(event.event_type) !== rule.trigger_type) continue;
      const payload = { ...event.payload, event_type: event.event_type };
      if (!matchesTriggerConfig(rule, rule.trigger_type, payload)) continue;
      const opportunityId = event.entity_type === 'opportunity' ? event.entity_id
        : typeof event.payload?.opportunity_id === 'string' ? event.payload.opportunity_id : null;
      const customerId = event.entity_type === 'customer' ? event.entity_id
        : typeof event.payload?.customer_id === 'string' ? event.payload.customer_id : null;
      if (!opportunityId && !customerId) continue;
      const key = opportunityId ? `opportunity:${opportunityId}` : `customer:${customerId}`;
      let base = contexts.get(key);
      if (!base) {
        base = await loadRuleContext({ orgId: org, opportunityId, customerId, now, conditions: rule.conditions }, db);
        contexts.set(key, base);
      }
      result.total++;
      const unavailable = opportunityId ? !base.opportunity : !base.customer;
      const hasRun = async (since?: string) => {
        const simulated = opportunityId && simulatedRuns.get(opportunityId);
        if (simulated && (!since || simulated >= since)) return true;
        let prior = db.from('automation_runs').select('id').eq('organization_id', org)
          .eq('automation_rule_id', id).eq('opportunity_id', opportunityId!)
          .in('status', ['running', 'completed']).lt('created_at', from).limit(1);
        if (since) prior = prior.gte('created_at', since);
        const { data: runs, error: historyError } = await prior;
        if (historyError) throw historyError;
        if (!Array.isArray(runs)) throw new Error('automation_history_response_invalid');
        return runs.length > 0;
      };
      const preview = unavailable ? { matched: false, skip_reason: 'record_unavailable', trace: [], actions_plan: [] }
        : await previewAutomationRule(rule, { ...base, event: { event_type: event.event_type, payload } }, db, hasRun, new Date(event.created_at));
      if (preview.matched) {
        result.matched++;
        if (opportunityId) simulatedRuns.set(opportunityId, event.created_at);
      } else result.skipped++;
      if (unavailable) result.unavailable++;
      if (result.sample.length < 50) result.sample.push({ event_id: event.id, occurred_at: event.created_at,
        opportunity_id: opportunityId, customer_id: customerId,
        name: String(base.opportunity?.name ?? base.customer?.full_name ?? ''), ...preview });
    }
    if (events.length < 250) return result;
  }
}
