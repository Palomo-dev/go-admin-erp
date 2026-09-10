/**
 * FASE-16 · ronda 2 — regresiones de los fallos del tester r1:
 *  #2 reclamación atómica de contactos (dos lotes ya no envían dos veces)
 *  #3 "Calcular → Enviar": un PATCH que no cambia audiencia/plantilla NO
 *     invalida la materialización
 *  #4 un 131056 sobre una campaña ya cerrada la reabre y encola un lote
 *  #5 el lote rechaza una campaña de otra organización
 *  #10 la razón de pausa no ensucia `statistics` con claves dinámicas
 */

import { runCampaignBatch } from '../campaignBatch';
import { updateCampaign, sameAudience } from '../campaignStore';
import { applyMessageEventToCampaign, reopenCampaignForRetry } from '../campaignEvents';
import { makeSupabase, has, opArg, type Op, type TableResolver } from './mockSupabase';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
const enqueueJob = jest.fn(async (_input: Record<string, unknown>) => 'job-1');
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (input: Record<string, unknown>) => enqueueJob(input) }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: async () => null }));

beforeEach(() => enqueueJob.mockClear());

const CAMP = {
  id: 'camp-1', organization_id: 7, name: 'c', channel: 'whatsapp', status: 'sending', scheduled_at: null,
  template_id: null, segment_id: null, content: 'hola',
  statistics: { throttle_mps: 10, respect_allowed_hours: false, next_batch_no: 3 },
  created_by: null, created_at: '', updated_at: '',
};

function pendingRow(id: string) {
  return { id, customer_id: `cust-${id}`, state: null, metadata: { state: 'pending', recipient: `5731000000${id.slice(-1)}`, attempts: 0 } };
}

describe('#2 · reclamación atómica de contactos', () => {
  test('el claim condiciona por metadata.state y solo procesa lo que gana la carrera', async () => {
    const rows = [pendingRow('cc-1'), pendingRow('cc-2'), pendingRow('cc-3')];
    let claimCall = 0;
    const tables: Record<string, TableResolver> = {
      campaigns: () => ({ data: CAMP }),
      campaign_contacts: (ops) => {
        if (!has(ops, 'update')) return { data: rows };
        if (has(ops, 'select')) {
          claimCall += 1;
          // El segundo candidato lo reclamó OTRO lote: el UPDATE condicional
          // no encuentra la fila y devuelve null.
          return { data: claimCall === 2 ? null : { id: 'x' } };
        }
        return { data: null };
      },
      provider_configs: () => ({ data: null }),
      message_events: () => ({ data: [] }),
      messages: () => ({ data: [] }),
    };
    const { sb, calls } = makeSupabase(tables, () => ({ data: true }));
    const sent: string[] = [];
    const r = await runCampaignBatch({ campaign_id: 'camp-1', batch_no: 1 }, sb, {
      send: async (i) => { sent.push(String(i.customerId)); return { message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: String(i.customerId), channel_id: 'chan', scheduled: false }; },
      sleep: async () => undefined,
      deadlineMs: 5_000,
    });
    // 3 candidatos, 1 perdido → 2 reclamados y 2 envíos (nunca 3)
    expect(r.claimed).toBe(2);
    expect(sent).toEqual(['cust-cc-1', 'cust-cc-3']);

    const claims = calls.filter((c) => c.table === 'campaign_contacts' && has(c.ops, 'update') && has(c.ops, 'select'));
    expect(claims).toHaveLength(3);
    for (const c of claims) {
      expect(c.ops.some((o: Op) => String(o.args[0] ?? '') === 'metadata->>state')).toBe(true);
      const meta = (opArg<Record<string, unknown>>(c.ops, 'update')!.metadata as Record<string, unknown>);
      expect(meta.state).toBe('queued');
      expect(typeof meta.claim_token).toBe('string');
    }
    // tokens distintos por fila
    const tokens = claims.map((c) => ((opArg<Record<string, unknown>>(c.ops, 'update')!.metadata as Record<string, unknown>).claim_token));
    expect(new Set(tokens).size).toBe(3);
  });

  test('las escrituras posteriores exigen el claim_token del lote', async () => {
    const rows = [pendingRow('cc-1')];
    const { sb, calls } = makeSupabase({
      campaigns: () => ({ data: CAMP }),
      campaign_contacts: (ops) => (has(ops, 'update') ? { data: { id: 'cc-1' } } : { data: rows }),
      provider_configs: () => ({ data: null }),
      message_events: () => ({ data: [] }),
      messages: () => ({ data: [] }),
    }, () => ({ data: true }));
    await runCampaignBatch({ campaign_id: 'camp-1', batch_no: 1 }, sb, {
      send: async () => ({ message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: 'cust', channel_id: 'chan', scheduled: false }),
      sleep: async () => undefined,
      deadlineMs: 5_000,
    });
    const post = calls.filter((c) => c.table === 'campaign_contacts' && has(c.ops, 'update') && !has(c.ops, 'select'));
    expect(post.length).toBeGreaterThan(0);
    for (const c of post) expect(c.ops.some((o: Op) => String(o.args[0] ?? '') === 'metadata->>claim_token')).toBe(true);
  });
});

describe('#5 · aislamiento por organización en el lote', () => {
  test('campaña de otra org → org_mismatch y no reclama nada', async () => {
    const { sb, calls } = makeSupabase({ campaigns: () => ({ data: CAMP }) }, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: 'camp-1' }, sb, { expectedOrgId: 999999, deadlineMs: 5_000 });
    expect(r).toMatchObject({ finished: true, reason: 'org_mismatch', claimed: 0, sent: 0 });
    expect(calls.some((c) => c.table === 'campaign_contacts')).toBe(false);
  });

  test('misma org → sigue adelante', async () => {
    const { sb } = makeSupabase({
      campaigns: () => ({ data: CAMP }),
      campaign_contacts: () => ({ data: [] }),
      provider_configs: () => ({ data: null }),
      message_events: () => ({ data: [] }),
      messages: () => ({ data: [] }),
    }, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: 'camp-1' }, sb, { expectedOrgId: 7, deadlineMs: 5_000 });
    expect(r.reason).not.toBe('org_mismatch');
  });
});

describe('#3 · el PATCH del compositor masivo no invalida la materialización', () => {
  const AUDIENCE = { source: 'manual' as const, segment_id: null, pipeline_id: null, stage_ids: [], opportunity_ids: ['b5f1e4e5-1111-4111-8111-111111111111'], customer_ids: [] };
  const base = {
    id: 'camp-1', organization_id: 7, name: 'Masivo', channel: 'whatsapp', status: 'draft', scheduled_at: null,
    template_id: null, segment_id: null, content: 'hola',
    statistics: { audience: AUDIENCE, materialized_at: '2026-09-08T10:00:00Z', pending: 4, purpose: 'utility' },
    created_by: null, created_at: '', updated_at: '',
  };
  const mk = () => makeSupabase({
    campaigns: (ops) => (has(ops, 'update') ? { data: { ...base, statistics: opArg<Record<string, unknown>>(ops, 'update')!.statistics } } : { data: base }),
    templates: () => ({ data: { id: 't', channel: 'whatsapp' } }),
    channels: () => ({ data: { id: 'chan-1' } }),
    segments: () => ({ data: { id: 's' } }),
  });

  test('misma audiencia y misma plantilla → materialized_at intacto', async () => {
    const { sb, calls } = mk();
    await updateCampaign(7, 'camp-1', { name: 'Masivo (2)', audience: { ...AUDIENCE }, template_id: null, content: 'hola' }, sb);
    const upd = calls.find((c) => c.table === 'campaigns' && has(c.ops, 'update'))!;
    const stats = opArg<Record<string, unknown>>(upd.ops, 'update')!.statistics as Record<string, unknown>;
    expect(stats.materialized_at).toBe('2026-09-08T10:00:00Z');
  });

  test('audiencia distinta → materialized_at se anula', async () => {
    const { sb, calls } = mk();
    await updateCampaign(7, 'camp-1', { audience: { ...AUDIENCE, opportunity_ids: ['b5f1e4e5-2222-4222-8222-222222222222'] } }, sb);
    const upd = calls.find((c) => c.table === 'campaigns' && has(c.ops, 'update'))!;
    const stats = opArg<Record<string, unknown>>(upd.ops, 'update')!.statistics as Record<string, unknown>;
    expect(stats.materialized_at).toBeNull();
  });

  test('plantilla distinta o purpose distinto → materialized_at se anula', async () => {
    for (const patch of [{ template_id: 'b5f1e4e5-3333-4333-8333-333333333333' }, { purpose: 'marketing' as const }]) {
      const { sb, calls } = mk();
      await updateCampaign(7, 'camp-1', patch, sb);
      const upd = calls.find((c) => c.table === 'campaigns' && has(c.ops, 'update'))!;
      const stats = opArg<Record<string, unknown>>(upd.ops, 'update')!.statistics as Record<string, unknown>;
      expect(stats.materialized_at).toBeNull();
    }
  });

  test('sameAudience ignora el orden de los ids', () => {
    expect(sameAudience({ source: 'manual', customer_ids: ['a', 'b'] }, { source: 'manual', customer_ids: ['b', 'a'] })).toBe(true);
    expect(sameAudience({ source: 'manual', customer_ids: ['a'] }, { source: 'manual', customer_ids: ['a', 'b'] })).toBe(false);
    expect(sameAudience({ source: 'stage', stage_ids: ['s1'] }, { source: 'segment', segment_id: 's1' })).toBe(false);
  });
});

describe('#4 · un reintento sobre una campaña cerrada la reabre', () => {
  test('131056 con la campaña en sent → encola lote y vuelve a sending', async () => {
    const contact = { id: 'cc-1', campaign_id: 'camp-1', customer_id: 'cust-1', state: 'sent', metadata: { state: 'sent', message_id: 'msg-1', attempts: 1 }, replied_at: null };
    const closed = { id: 'camp-1', organization_id: 7, status: 'sent', statistics: { next_batch_no: 4, finished_at: '2026-09-08T09:00:00Z' } };
    const { sb, calls } = makeSupabase({
      campaign_contacts: (ops) => (has(ops, 'update') ? { data: null } : { data: contact }),
      campaigns: () => ({ data: closed }),
      contact_consents: () => ({ data: null }),
    });
    const r = await applyMessageEventToCampaign({ message_id: 'msg-1', event_type: 'failed', error_code: '131056' }, sb);
    expect(r).toMatchObject({ applied: true, state: 'pending' });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const job = enqueueJob.mock.calls[0][0] as { kind: string; payload: Record<string, unknown>; dedupeKey: string };
    expect(job.kind).toBe('campaign_batch');
    expect(job.payload).toEqual({ campaign_id: 'camp-1', batch_no: 4 });
    const reopened = calls.filter((c) => c.table === 'campaigns' && has(c.ops, 'update')).pop()!;
    expect(opArg<Record<string, unknown>>(reopened.ops, 'update')!.status).toBe('sending');
  });

  test('campaña que sigue enviando → no se reabre ni se encola nada', async () => {
    const { sb } = makeSupabase({ campaigns: () => ({ data: { id: 'camp-1', organization_id: 7, status: 'sending', statistics: {} } }) });
    const r = await reopenCampaignForRetry('camp-1', new Date(), sb);
    expect(r).toEqual({ reopened: false });
    expect(enqueueJob).not.toHaveBeenCalled();
  });

  test('campaña cancelada → no se reabre', async () => {
    const { sb } = makeSupabase({ campaigns: () => ({ data: { id: 'camp-1', organization_id: 7, status: 'sent', statistics: { state: 'canceled' } } }) });
    expect(await reopenCampaignForRetry('camp-1', new Date(), sb)).toEqual({ reopened: false });
    expect(enqueueJob).not.toHaveBeenCalled();
  });
});

describe('#10 · la pausa por error del proveedor no ensucia statistics', () => {
  test('NO_CREDITS → pause_reason, sin clave dinámica `no_credits`', async () => {
    const rows = [pendingRow('cc-1')];
    const { WhatsAppError } = jest.requireActual('../types') as typeof import('../types');
    const { sb, calls } = makeSupabase({
      campaigns: (ops) => (has(ops, 'update') ? { data: CAMP } : { data: CAMP }),
      campaign_contacts: (ops) => (has(ops, 'update') ? { data: { id: 'cc-1' } } : { data: rows }),
      provider_configs: () => ({ data: null }),
      message_events: () => ({ data: [] }),
      messages: () => ({ data: [] }),
    }, () => ({ data: true }));
    await runCampaignBatch({ campaign_id: 'camp-1', batch_no: 1 }, sb, {
      send: async () => { throw new WhatsAppError('NO_CREDITS', 'sin créditos', 402); },
      sleep: async () => undefined,
      deadlineMs: 5_000,
    });
    const upd = calls.filter((c) => c.table === 'campaigns' && has(c.ops, 'update')).map((c) => opArg<Record<string, unknown>>(c.ops, 'update')!.statistics as Record<string, unknown>);
    const paused = upd.find((s) => s?.state === 'paused')!;
    expect(paused.pause_reason).toBe('no_credits');
    expect(paused.no_credits).toBeUndefined();
  });
});
