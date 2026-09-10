/**
 * Motor de reglas conectado al outbox (FASE-08 §2.1): un `crm_event` encola un
 * job `automation` por regla coincidente, con dedupe por regla+evento.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SupabaseClient } from '@supabase/supabase-js';

// `emailService` arrastra svix (ESM) por el módulo de webhooks de F7.
jest.mock('@/lib/services/crm/emailService', () => ({ sendEmail: jest.fn() }));

import { evaluateRulesForEvent, triggerTypeForEvent } from '@/lib/services/crm/automation/automationEngine';
import type { CrmEvent } from '@/lib/jobs/types';

const ORG = 125;

function makeClient(rules: any[], opportunities: any[] = [], customers: any[] = []) {
  const tables: Record<string, any[]> = { automation_rules: rules, opportunities, customers, stages: [], pipelines: [], contact_consents: [] };
  const from = (table: string) => {
    const preds: Array<(r: any) => boolean> = [];
    let single = false;
    const b: any = {
      select: () => b,
      eq: (c: string, v: unknown) => { preds.push((r) => r[c] === v); return b; },
      order: () => b,
      limit: () => b,
      maybeSingle: () => { single = true; return b; },
      then: (res: (v: any) => void) => {
        const rows = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
        res({ data: single ? rows[0] ?? null : rows, error: null });
      },
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const event: CrmEvent = {
  id: 'evt-1',
  organization_id: ORG,
  event_type: 'opportunity.stage_changed',
  entity_type: 'opportunity',
  entity_id: 'opp-1',
  payload: { to_stage_id: 'stg-2', pipeline_id: 'pip-1', customer_id: 'cus-1' },
  status: 'pending',
  created_at: new Date().toISOString(),
  processed_at: null,
};

describe('automationEngine.evaluateRulesForEvent', () => {
  const opportunities = [{ id: 'opp-1', organization_id: ORG, customer_id: 'cus-1', stage_id: 'stg-2', pipeline_id: 'pip-1', amount: 9_000_000, status: 'open' }];
  const customers = [{ id: 'cus-1', organization_id: ORG, email: 'cliente@ejemplo.com', full_name: 'Cliente Uno' }];

  it('mapea el tipo de evento al trigger_type de las reglas', () => {
    expect(triggerTypeForEvent('opportunity.stage_changed')).toBe('stage_change');
    expect(triggerTypeForEvent('opportunity.won')).toBe('stage_change');
    expect(triggerTypeForEvent('whatsapp.inbound')).toBe('event');
  });

  it('encola un job `automation` por regla coincidente con dedupe regla+evento', async () => {
    const client = makeClient([
      { id: 'rule-1', organization_id: ORG, trigger_type: 'stage_change', is_active: true, stage_id: 'stg-2', pipeline_id: null, conditions: [], actions: [], event: 'opportunity.stage_changed', trigger_config: {} },
    ], opportunities, customers);
    const enqueue = jest.fn(async (_input: any) => 'job-1');

    const result = await evaluateRulesForEvent(event, client, enqueue as any);

    expect(result.matched).toBe(1);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      kind: 'automation',
      organizationId: ORG,
      dedupeKey: 'rule:rule-1:event:evt-1',
    }));
  });

  it('no encola reglas de otra etapa, inactivas o con condiciones falsas', async () => {
    const client = makeClient([
      { id: 'otra-etapa', organization_id: ORG, trigger_type: 'stage_change', is_active: true, stage_id: 'stg-9', pipeline_id: null, conditions: [], actions: [], trigger_config: {} },
      { id: 'inactiva', organization_id: ORG, trigger_type: 'stage_change', is_active: false, stage_id: 'stg-2', pipeline_id: null, conditions: [], actions: [], trigger_config: {} },
      { id: 'condicion-falsa', organization_id: ORG, trigger_type: 'stage_change', is_active: true, stage_id: 'stg-2', pipeline_id: null, trigger_config: {}, actions: [], conditions: { op: 'and', rules: [{ field: 'opportunity.amount', operator: 'gte', value: 999_999_999 }] } },
    ], opportunities, customers);
    const enqueue = jest.fn(async (_input: any) => 'job-x');

    const result = await evaluateRulesForEvent(event, client, enqueue as any);

    expect(result.matched).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
