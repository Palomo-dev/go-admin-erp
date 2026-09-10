import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyDestinationSku, billableMinutes, computeSettlement, reserveVoiceMinutes, settleVoiceCall } from '../callCreditsService';

function fakeClient(opts: { deduct?: boolean; costs?: Record<string, number> }) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];
  const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => {
    if (fn === 'deduct_comm_credits') return { data: opts.deduct ?? true, error: null };
    if (fn === 'fn_unit_cost') return { data: opts.costs?.[String(args.p_sku)] ?? null, error: null };
    return { data: null, error: { message: 'unknown rpc' } };
  });
  const client = {
    rpc,
    from: (table: string) => ({
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, ...row });
        return { error: null };
      },
      update: (row: Record<string, unknown>) => ({
        eq: () => ({
          eq: async () => {
            updates.push({ table, ...row });
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, rpc, inserts, updates };
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
