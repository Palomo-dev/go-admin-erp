import { makeSupabase, has, type Resp } from './mockSupabase';
import type { SendWhatsAppInput } from '../types';

export const CAMP = '44444444-4444-4444-8444-444444444444';
export const NOW = Date.parse('2026-09-14T15:00:00Z');
export const campaign = { id: CAMP, organization_id: 7, name: 'Fixture', channel: 'whatsapp', status: 'sending', scheduled_at: null as string | null,
  template_id: 'tpl-1', segment_id: null, content: null, statistics: { channel_id: 'chan-1', throttle_mps: 20, default_variables: { nombre: 'Fixture' } }, created_by: null, created_at: '', updated_at: '' };
export const contact = (id = 'cc-1') => ({ id, customer_id: `cust-${id}`, state: 'queued', metadata: { recipient: `57310000000${id.endsWith('2') ? 2 : 1}`, attempts: 1, claim_token: `token-${id}` } });
export const prepared = async (input: SendWhatsAppInput) => ({ message_id: `msg-${input.customerId}`, conversation_id: 'conv-1', activity_id: null, customer_id: input.customerId!, channel_id: 'chan-1', scheduled: false });

/** Solo dobla contratos RPC. Reclamación, backoff, ledger y resultados se prueban por MCP con rollback. */
export function harness(options: {
  campaign?: typeof campaign | null;
  rows?: ReturnType<typeof contact>[];
  progress?: Record<string, unknown>;
  rpc?: (fn: string, args: Record<string, unknown>) => Resp | undefined;
  settings?: Record<string, unknown>;
  recent?: Array<{ id: string; created_at: string; metadata: { to: string } }>;
} = {}) {
  const c = options.campaign === undefined ? campaign : options.campaign;
  return makeSupabase({
    campaigns: () => ({ data: c }),
    provider_configs: () => ({ data: { settings: options.settings ?? {} } }),
    messages: () => ({ data: options.recent ?? [] }),
  }, (fn, args) => options.rpc?.(fn, args) ?? ({ data:
    fn === 'crm_claim_campaign_batch' ? { campaign: c, rows: options.rows ?? [contact()] } :
    fn === 'crm_finish_campaign_contact' ? { applied: args.p_action !== 'prepared', state: args.p_action === 'prepared' ? 'queued' : 'pending' } :
    fn === 'crm_campaign_batch_progress' ? options.progress ?? { finished: false, next_batch_no: 2 } : null,
  }));
}
export const writes = (r: ReturnType<typeof harness>) => r.calls.filter((c) => ['insert', 'update', 'delete', 'upsert'].some((op) => has(c.ops, op)));
