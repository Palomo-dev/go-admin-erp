import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyDestinationSku, billableMinutes, computeSettlement, reserveVoiceMinutes, settleVoiceCall } from '../callCreditsService';
import { FakeDb, type FakeMutationBuilder } from './fixtures/fakeSupabase';

// Estas sondas FIFO/UNIQUE caracterizan el escape REST histórico. Las sondas
// positivas de RPC en esta misma batería activan explícitamente el modo real.
const originalCallRpcFlag = process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
beforeEach(() => { process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false'; });
afterAll(() => {
  if (originalCallRpcFlag === undefined) delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  else process.env.CRM_CALL_ATOMIC_RPC_ENABLED = originalCallRpcFlag;
});

function fakeClient(opts: { deduct?: boolean; costs?: Record<string, number> }) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const db = new FakeDb({ tables: { calls: ['c1', 'c2', 'c3', 'c4'].map((id) => ({ id, organization_id: id === 'c2' ? 1 : 120, status: 'completed', metadata: {} })) }, rpc: {
    deduct_comm_credits: () => opts.deduct ?? true,
    fn_unit_cost: (args) => opts.costs?.[String(args.p_sku)] ?? null,
  } });
  const client = db.client();
  const rpc = jest.spyOn(client, 'rpc');
  const from = client.from.bind(client);
  client.from = ((table: string) => {
    const builder = from(table) as unknown as FakeMutationBuilder;
    const insert = builder.insert.bind(builder);
    const update = builder.update.bind(builder);
    builder.insert = (row: object) => { inserts.push({ table, ...row }); return insert(row); };
    builder.update = (row: object) => { updates.push({ table, ...row }); return update(row); };
    return builder;
  }) as unknown as SupabaseClient['from'];
  return { client, rpc, inserts, updates };
}

describe('callCreditsService (FASE-03 §8, D6)', () => {
  test('classifyDestinationSku: móvil +573, fijo +571/+5760, entrantes', () => {
    expect(classifyDestinationSku('+573001234567')).toBe('voice_out_co_mobile');
    expect(classifyDestinationSku('+5716012345')).toBe('voice_out_co_landline');
    expect(classifyDestinationSku('+57601234567')).toBe('voice_out_co_landline');
    expect(classifyDestinationSku('+14155551234')).toBe('voice_out_co_mobile');
    expect(classifyDestinationSku('+573001234567', 'inbound')).toBe('voice_in_local_co');
  });

  test('billableMinutes redondea hacia arriba', () => {
    expect(billableMinutes(0)).toBe(0);
    expect(billableMinutes(1)).toBe(1);
    expect(billableMinutes(60)).toBe(1);
    expect(billableMinutes(61)).toBe(2);
    expect(billableMinutes(155)).toBe(3);
    expect(billableMinutes(null)).toBe(0);
  });

  test('computeSettlement: minutos, diferencia con reserva y desglose', () => {
    const s = computeSettlement({ durationSeconds: 155, reservedMinutes: 1, mode: 'browser', recordingEnabled: true, unitCosts: { pstn: 0.0377, sdk: 0.004, recording: 0.0025 } });
    expect(s.minutes).toBe(3);
    expect(s.extraMinutes).toBe(2);
    expect(s.breakdown).toEqual({ pstn: 0.1131, sdk: 0.012, recording: 0.0075 });
    expect(s.costUsd).toBeCloseTo(0.1326, 6);
    // F5 §8: un bridge móvil son DOS llamadas PSTN (vendedor + cliente), así que
    // el minuto se paga dos veces (antes se liquidaba la mitad del coste real).
    const bridge = computeSettlement({ durationSeconds: 30, reservedMinutes: 1, mode: 'bridge', recordingEnabled: false, unitCosts: { pstn: 0.07, sdk: 0.004, recording: 0.0025 } });
    expect(bridge).toMatchObject({ minutes: 1, extraMinutes: 0, breakdown: { pstn: 0.14, sdk: 0, recording: 0 } });
  });

  test('reserveVoiceMinutes llama deduct_comm_credits(p_org_id, voice, amount)', async () => {
    const { client, rpc } = fakeClient({ deduct: false });
    expect(await reserveVoiceMinutes(120, 1, client)).toBe(false);
    expect(rpc).toHaveBeenCalledWith('deduct_comm_credits', { p_org_id: 120, p_channel: 'voice', p_amount: 1 });
  });

  test('settleVoiceCall: debita extra, inserta comm_usage_logs y actualiza calls; idempotente', async () => {
    const { client, rpc, inserts, updates } = fakeClient({ deduct: true, costs: { voice_out_co_mobile: 0.0377, voice_sdk_client: 0.004, recording: 0.0025 } });
    const call = {
      id: 'c1', organization_id: 120, direction: 'outbound' as const, mode: 'browser' as const, to_number: '+573001234567', from_number: '+571',
      duration_seconds: 155, recording_enabled: true, metadata: { credits_reserved_min: 1 },
    };
    const s = await settleVoiceCall(call, client);
    expect(s?.minutes).toBe(3);
    expect(rpc).toHaveBeenCalledWith('deduct_comm_credits', { p_org_id: 120, p_channel: 'voice', p_amount: 2 });
    const log = inserts.find((i) => i.table === 'comm_usage_logs')!;
    expect(log).toMatchObject({ organization_id: 120, channel: 'voice', credits_used: 3, module: 'crm_voice', recipient: '+573001234567', direction: 'outbound' });
    expect((log.metadata as Record<string, unknown>).call_id).toBe('c1');
    expect((log.metadata as Record<string, unknown>).sku).toBe('voice_out_co_mobile');
    const upd = updates.find((u) => u.table === 'calls')!;
    expect(upd.cost_amount).toBeCloseTo(0.1326, 6);
    expect((upd.metadata as Record<string, unknown>).settled_at).toBeDefined();
    // Segunda liquidación no hace nada
    expect(await settleVoiceCall({ ...call, metadata: { settled_at: 'x' } }, client)).toBeNull();
  });

  // Ronda 2 (A3/A1): conciliación cuando el desenlace final cambia la duración.
  test('settleVoiceCall({reconcile}) cobra solo la diferencia sobre lo ya liquidado', async () => {
    const { client, rpc, inserts, updates } = fakeClient({ deduct: true, costs: { voice_out_co_mobile: 0.0377, voice_sdk_client: 0.004, recording: 0.0025 } });
    // Buzón liquidado con 0 minutos y, al cerrar, 95 s reales (2 minutos).
    const call = {
      id: 'c3', organization_id: 120, direction: 'outbound' as const, mode: 'browser' as const, to_number: '+573001234567', from_number: '+571',
      duration_seconds: 95, recording_enabled: true, metadata: { settled_at: '2026-09-09T00:00:00.000Z', credits_final_min: 0, credits_reserved_min: 1 },
    };
    const s = await settleVoiceCall(call, client, { reconcile: true });
    expect(s?.minutes).toBe(2);
    expect(rpc).toHaveBeenCalledWith('deduct_comm_credits', { p_org_id: 120, p_channel: 'voice', p_amount: 2 });
    const log = inserts.find((i) => i.table === 'comm_usage_logs')!;
    expect(log.credits_used).toBe(2); // 2 nuevos - 0 ya cobrados
    expect((log.metadata as Record<string, unknown>).reason).toBe('settlement_reconcile');
    const upd = updates.find((u) => u.table === 'calls')!;
    expect((upd.metadata as Record<string, unknown>).settlement_previous_min).toBe(0);
    expect((upd.metadata as Record<string, unknown>).credits_final_min).toBe(2);
  });

  test('settleVoiceCall({reconcile}) no hace nada si los minutos no cambian', async () => {
    const { client, inserts } = fakeClient({ deduct: true, costs: {} });
    const call = {
      id: 'c4', organization_id: 120, direction: 'outbound' as const, mode: 'browser' as const, to_number: '+573001234567', from_number: '+571',
      duration_seconds: 61, recording_enabled: false, metadata: { settled_at: 'x', credits_final_min: 2 },
    };
    expect(await settleVoiceCall(call, client, { reconcile: true })).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  test('settleVoiceCall marca credits_overrun cuando no hay saldo para los minutos extra', async () => {
    const { client, inserts, updates } = fakeClient({ deduct: false, costs: {} });
    await settleVoiceCall({ id: 'c2', organization_id: 1, direction: 'outbound', mode: 'browser', to_number: '+573001', from_number: '+571', duration_seconds: 200, recording_enabled: false, metadata: {} }, client);
    expect((inserts[0].metadata as Record<string, unknown>).credits_overrun).toBe(true);
    expect((updates[0].metadata as Record<string, unknown>).credits_overrun).toBe(true);
  });
});

it('la liquidación final usa BODY RPC compatible con la propuesta y conserva metadata manual fresca', async () => {
  process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'true';
  try {
    const call = { id: '11111111-1111-4111-8111-111111111111', organization_id: 7, direction: 'outbound' as const, mode: 'browser' as const, to_number: '+573001234567', from_number: 'manual', duration_seconds: 60, recording_enabled: false, metadata: { credits_reserved_min: 1 } };
    const stored = { ...call, status: 'completed', metadata: { ...call.metadata, disposition_outcome: 'callback_requested', live_note: 'Nota conservada', last_seq: { child: 3 } } };
    const db = new FakeDb({ tables: { calls: [stored] }, rpc: {
      fn_unit_cost: () => 0.04,
      fn_crm_callback_llamada: (args) => ({ stale: false, call: { ...stored, ...args.p_patch } }),
    } });
    await settleVoiceCall(call, db.client());
    const request = db.rpcCalls.find((entry) => entry.name === 'fn_crm_callback_llamada');
    expect(request?.args.p_patch).toMatchObject({ cost_amount: expect.any(Number), cost_currency: 'USD', metadata: { disposition_outcome: 'callback_requested', live_note: 'Nota conservada', last_seq: { child: 3 }, credits_final_min: 1, settled_at: expect.any(String) } });
    expect(db.calls.filter((entry) => entry.table === 'calls' && entry.op === 'update')).toHaveLength(0);
    const proposal = readFileSync(join(process.cwd(), 'docs/crm/propuestas/llamadas_atomicas.sql'), 'utf8');
    const callback = proposal.slice(proposal.indexOf('CREATE OR REPLACE FUNCTION public.fn_crm_callback_llamada'));
    const whitelist = callback.match(/k NOT IN\s*\(([^)]+)\)/)?.[1] ?? '';
    for (const field of Object.keys(request?.args.p_patch ?? {})) expect(whitelist).toContain(`'${field}'`);
    expect(callback).toContain('cost_amount=v_new.cost_amount,cost_currency=v_new.cost_currency');
  } finally { process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false'; }
});
