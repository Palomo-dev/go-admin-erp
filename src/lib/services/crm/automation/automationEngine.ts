/**
 * Motor de reglas: consumidor del outbox `crm_events` (FASE-08 §2.1, §4.2).
 *
 * Cadena real que conecta el motor:
 *   trigger BD (`trg_opp_stage_change_enqueue` / `trg_opp_created_enqueue`)
 *     → `crm_events` + job `crm_event`
 *     → runner F0 → `crmEventHandler` → `dispatchCrmEvent`
 *     → ESTE listener → `evaluateTrigger` (por fin con caller)
 *     → job `automation` por regla (dedupe por regla+evento)
 *     → `automationJobHandler` → `executeAutomationRule`.
 *
 * El listener NO ejecuta acciones: solo encola. Así un fallo de proveedor
 * reintenta el job de esa regla y no re-dispara las demás.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { onCrmEvent, type CrmEventListener } from '@/lib/jobs/dispatch/eventDispatcher';
import { enqueueJob } from '@/lib/jobs/enqueue';
import type { CrmEvent } from '@/lib/jobs/types';
import { evaluateTrigger, type AutomationTriggerType } from '@/lib/services/crm/automationService';
import { checkExitConditions } from '@/lib/services/crm/sequenceService';
import { loadRuleContext } from './ruleContext';
import type { EnqueueFn } from './actions';

export const AUTOMATION_LISTENER_NAME = 'automation_rules_engine';
export const SEQUENCE_LISTENER_NAME = 'sequence_reactions';

/** Traduce el tipo de evento del outbox al `trigger_type` de las reglas. */
export function triggerTypeForEvent(eventType: string): AutomationTriggerType {
  if (eventType === 'opportunity.stage_changed' || eventType === 'opportunity.won' || eventType === 'opportunity.lost') {
    return 'stage_change';
  }
  if (eventType === 'opportunity.updated' || eventType === 'opportunity.field_changed') return 'field_change';
  return 'event';
}

export interface EvaluateResult {
  event_type: string;
  matched: number;
  enqueued: string[];
}

/**
 * Evalúa las reglas de la organización contra un evento y encola un job
 * `automation` por regla coincidente.
 */
export async function evaluateRulesForEvent(
  event: CrmEvent,
  supabase: SupabaseClient,
  enqueue: EnqueueFn = (input) => enqueueJob(input),
): Promise<EvaluateResult> {
  const orgId = event.organization_id;
  const payload = { ...(event.payload ?? {}), event_type: event.event_type };
  const opportunityId = event.entity_type === 'opportunity'
    ? event.entity_id
    : ((event.payload?.opportunity_id as string | undefined) ?? null);

  const ctx = await loadRuleContext(
    {
      orgId,
      opportunityId,
      customerId: (event.payload?.customer_id as string | undefined) ?? null,
      event: { event_type: event.event_type, payload: payload as Record<string, unknown> },
    },
    supabase,
  );

  const rules = await evaluateTrigger(orgId, triggerTypeForEvent(event.event_type), payload, supabase, {
    eventType: event.event_type,
    context: ctx,
  });

  const enqueued: string[] = [];
  for (const rule of rules) {
    const jobId = await enqueue({
      organizationId: orgId,
      kind: 'automation',
      payload: {
        rule_id: rule.id,
        event_id: event.id,
        opportunity_id: opportunityId,
        trigger_payload: { ...payload, opportunity_id: opportunityId },
      },
      dedupeKey: `rule:${rule.id}:event:${event.id}`,
      maxAttempts: 1,
    });
    if (jobId) enqueued.push(jobId);
  }

  return { event_type: event.event_type, matched: rules.length, enqueued };
}

/** Listener del motor de reglas (comodín: cualquier evento del outbox). */
export const automationRulesListener: CrmEventListener = async (event, { supabase }) => {
  const result = await evaluateRulesForEvent(event as CrmEvent, supabase);
  return { ...result };
};

/**
 * Reacciones de las secuencias a los eventos:
 *  - respuesta del cliente (WhatsApp/email) → pausa las inscripciones vivas
 *    de secuencias con `pause_on_reply`.
 *  - cambio de etapa / cierre → reevalúa las condiciones de salida.
 */
export const sequenceReactionsListener: CrmEventListener = async (event, { supabase }) => {
  const orgId = event.organization_id;
  const opportunityId = event.entity_type === 'opportunity'
    ? event.entity_id
    : ((event.payload?.opportunity_id as string | undefined) ?? null);
  const customerId = (event.payload?.customer_id as string | undefined) ?? null;

  if (event.event_type === 'whatsapp.inbound' || event.event_type === 'email.replied') {
    const channel = event.event_type.startsWith('whatsapp') ? 'whatsapp' : 'email';
    const { data, error } = await supabase.rpc('fn_pause_sequences_on_reply', {
      p_org: orgId,
      p_opportunity_id: opportunityId,
      p_customer_id: customerId,
      p_channel: channel,
    });
    if (error) throw new Error(`fn_pause_sequences_on_reply: ${error.message}`);
    return { paused: typeof data === 'number' ? data : 0 };
  }

  if (!opportunityId) return { skipped: true, reason: 'no_opportunity' };

  const { data: enrollments, error } = await supabase
    .from('sequence_enrollments')
    .select('id')
    .eq('organization_id', orgId)
    .eq('opportunity_id', opportunityId)
    .eq('status', 'active');
  if (error) throw new Error(`sequence_enrollments: ${error.message}`);

  let exited = 0;
  for (const row of ((enrollments ?? []) as { id: string }[])) {
    const r = await checkExitConditions(row.id, orgId, supabase);
    if (r.shouldExit) exited++;
  }
  return { checked: (enrollments ?? []).length, exited };
};

let registered = false;

/**
 * Registra los listeners de F8 en el despachador del outbox. Idempotente:
 * lo llama `src/lib/jobs/handlers/index.ts` (junto al registro de handlers).
 */
export function registerAutomationEngineListeners(): void {
  if (registered) return;
  registered = true;
  onCrmEvent('*', automationRulesListener, AUTOMATION_LISTENER_NAME);
  onCrmEvent('*', sequenceReactionsListener, SEQUENCE_LISTENER_NAME);
}
