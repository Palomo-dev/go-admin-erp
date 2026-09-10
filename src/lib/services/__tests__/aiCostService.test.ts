/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * aiCostService — F0 (REG r1):
 *  - el RPC decrement_ai_credits se ejecuta ANTES del proveedor;
 *  - si el RPC devuelve false → InsufficientCreditsError y NO se llama al proveedor;
 *  - si el proveedor falla → reembolso (RPC con costo negativo);
 *  - cost_amount real desde provider_pricing en metadata del log;
 *  - chargeCommCredits usa deduct_comm_credits + comm_usage_logs.
 */

import {
  chargeAiCredits,
  refundAiCredits,
  withAiCharge,
  chargeCommCredits,
  InsufficientCreditsError,
  defaultCreditsForUnits,
  __setAiCostClientFactory,
} from '@/lib/services/crm/aiCostService';
import { __setPricingClientFactory, clearPricingCache } from '@/lib/services/crm/pricingService';

interface Call { type: 'rpc' | 'insert'; name: string; args: any }

function fakeDb(opts: { rpcResult?: boolean | ((name: string, args: any) => boolean); rpcError?: { message: string } | null; prices?: Record<string, number> }) {
  const calls: Call[] = [];
  const sb: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ type: 'rpc', name, args });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      const r = typeof opts.rpcResult === 'function' ? opts.rpcResult(name, args) : (opts.rpcResult ?? true);
      return { data: r, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: any = {
        insert: (row: any) => {
          calls.push({ type: 'insert', name: table, args: row });
          return { select: () => ({ single: async () => ({ data: { id: table === 'ai_usage_logs' ? 42 : 'uuid-1' }, error: null }) }), then: (r: any) => r({ data: null, error: null }) };
        },
        select: () => q,
        eq: (c: string, v: unknown) => { filters[c] = v; return q; },
        lte: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => {
          const key = `${filters.provider}:${filters.sku}`;
          const price = opts.prices?.[key];
          return { data: price != null ? { unit_cost_usd: price, valid_from: '2026-01-01' } : null, error: null };
        },
      };
      return q;
    },
  };
  return { sb, calls };
}

beforeEach(() => clearPricingCache());
afterEach(() => {
  __setAiCostClientFactory(null);
  __setPricingClientFactory(null);
});

describe('chargeAiCredits', () => {
  it('llama decrement_ai_credits con p_org_id/p_cost y registra ai_usage_logs con cost_amount', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true, prices: { 'openai:gpt_5_6_luna_in': 0.2 } });
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);

    const res = await chargeAiCredits({ orgId: 7, actionType: 'call_analysis', model: 'gpt-5.6-luna', units: 1, unitSku: 'gpt_5_6_luna_in', credits: 3, metadata: { tokens: 1_000_000 } });

    expect(calls[0]).toMatchObject({ type: 'rpc', name: 'decrement_ai_credits', args: { p_org_id: 7, p_cost: 3 } });
    const log = calls.find((c) => c.type === 'insert' && c.name === 'ai_usage_logs')!;
    expect(log.args).toMatchObject({ organization_id: 7, action_type: 'call_analysis', model: 'gpt-5.6-luna', credits_consumed: 3 });
    expect(log.args.metadata.cost_amount).toBeCloseTo(0.2, 6);
    expect(log.args.metadata.provider).toBe('openai');
    expect(res).toMatchObject({ credits: 3, cost_amount: 0.2, unit_cost_usd: 0.2, logId: 42 });
  });

  it('créditos por defecto: 1 por cada 1000 unidades, mínimo 1', () => {
    expect(defaultCreditsForUnits(0)).toBe(1);
    expect(defaultCreditsForUnits(999)).toBe(1);
    expect(defaultCreditsForUnits(1001)).toBe(2);
  });

  it('lanza InsufficientCreditsError (402) si el RPC devuelve false y no registra log', async () => {
    const { sb, calls } = fakeDb({ rpcResult: false });
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'gpt-5.6-luna', units: 10 })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(calls.filter((c) => c.type === 'insert')).toHaveLength(0);
  });

  it('propaga error del RPC', async () => {
    const { sb } = fakeDb({ rpcError: { message: 'ai_settings no encontrada' } });
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1 })).rejects.toThrow(/decrement_ai_credits/);
  });

  it('infiere provider google para modelos gemini', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true, prices: { 'google:gemini_2_5_flash_audio_in': 1 } });
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);
    const r = await chargeAiCredits({ orgId: 1, actionType: 'stt', model: 'gemini-2.5-flash', units: 0.5, unitSku: 'gemini_2_5_flash_audio_in' });
    expect(r.cost_amount).toBeCloseTo(0.5, 6);
    expect(calls.find((c) => c.name === 'ai_usage_logs')!.args.metadata.provider).toBe('google');
  });
});

describe('withAiCharge (orden y reembolso)', () => {
  it('cobra ANTES de llamar al proveedor', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    __setAiCostClientFactory(() => sb);
    const order: string[] = [];
    const origRpc = sb.rpc;
    sb.rpc = async (n: string, a: any) => { order.push(`rpc:${n}:${a.p_cost}`); return origRpc(n, a); };

    const out = await withAiCharge({ orgId: 7, actionType: 'draft', model: 'gpt-5.6-luna', units: 2000 }, async () => { order.push('provider'); return 'ok'; });

    expect(out).toBe('ok');
    expect(order).toEqual(['rpc:decrement_ai_credits:2', 'provider']);
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(1);
  });

  it('reembolsa con la RPC dedicada refund_ai_credits cuando el proveedor falla', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    __setAiCostClientFactory(() => sb);

    await expect(
      withAiCharge({ orgId: 7, actionType: 'draft', model: 'gpt-5.6-luna', units: 100, credits: 5 }, async () => { throw new Error('provider down'); }),
    ).rejects.toThrow('provider down');

    const rpcs = calls.filter((c) => c.type === 'rpc');
    expect(rpcs).toHaveLength(2);
    expect(rpcs[0].args).toEqual({ p_org_id: 7, p_cost: 5 });
    // DB r4: reembolso por RPC dedicada, ya no por decrement con importe negativo.
    expect(rpcs[1].name).toBe('refund_ai_credits');
    expect(rpcs[1].args).toEqual({ p_org_id: 7, p_amount: 5 });
    const refundLog = calls.find((c) => c.type === 'insert' && c.name === 'ai_usage_logs' && c.args.credits_consumed === -5)!;
    expect(refundLog.args.action_type).toBe('draft:refund');
    expect(refundLog.args.metadata.reason).toContain('provider down');
  });

  // F4 r3, fallo N1 (camino gemelo): `refundAiCredits` devuelve false en vez de
  // lanzar, y aquí se ignoraba. La organización pagaba, el proveedor fallaba y el
  // reembolso podía rechazarse sin dejar rastro. El error original debe seguir
  // llegando intacto al llamador: hacer que el reembolso lance lo enmascararía.
  it('si el reembolso se rechaza, deja rastro visible y NO enmascara el error del proveedor', async () => {
    const { sb, calls } = fakeDb({ rpcResult: (name) => name !== 'refund_ai_credits' });
    __setAiCostClientFactory(() => sb);

    await expect(
      withAiCharge({ orgId: 7, actionType: 'draft', model: 'gpt-5.6-luna', units: 100, credits: 5 }, async () => { throw new Error('provider down'); }),
    ).rejects.toThrow('provider down');

    const failed = calls.find((c) => c.type === 'insert' && c.name === 'ai_usage_logs' && c.args.action_type === 'draft:refund_failed');
    expect(failed).toBeDefined();
    // Sin movimiento de saldo: la deuda viva va aparte, no como consumo negativo.
    expect(failed!.args.credits_consumed).toBe(0);
    expect(failed!.args.metadata.pending_refund_credits).toBe(5);
    expect(failed!.args.metadata.stage).toBe('with_ai_charge');
    // Y no se escribe la fila de reembolso aplicado, porque no se aplicó.
    expect(calls.some((c) => c.type === 'insert' && c.args?.action_type === 'draft:refund')).toBe(false);
  });

  it('no reembolsa si no se llegó a cobrar', async () => {
    const { sb, calls } = fakeDb({ rpcResult: false });
    __setAiCostClientFactory(() => sb);
    const fn = jest.fn();
    await expect(withAiCharge({ orgId: 7, actionType: 'x', model: 'm', units: 1 }, fn)).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(fn).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(1);
  });
});

describe('refundAiCredits', () => {
  it('con 0 créditos no llama al RPC', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    __setAiCostClientFactory(() => sb);
    expect(await refundAiCredits({ orgId: 1, credits: 0, actionType: 'x' })).toBe(true);
    expect(calls).toHaveLength(0);
  });
  it('devuelve false si el RPC falla', async () => {
    const { sb } = fakeDb({ rpcError: { message: 'boom' } });
    __setAiCostClientFactory(() => sb);
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(await refundAiCredits({ orgId: 1, credits: 2, actionType: 'x' })).toBe(false);
    err.mockRestore();
  });
});

describe('chargeCommCredits', () => {
  it('usa deduct_comm_credits(p_org_id, p_channel, p_amount) y registra comm_usage_logs con cost_amount', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true, prices: { 'twilio:sms_out_co': 0.0592 } });
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);

    const r = await chargeCommCredits({ orgId: 7, channel: 'sms', recipient: '+573001234567', unitSku: 'sms_out_co', units: 2, amount: 2, module: 'sequences' });

    expect(calls[0]).toMatchObject({ type: 'rpc', name: 'deduct_comm_credits', args: { p_org_id: 7, p_channel: 'sms', p_amount: 2 } });
    const log = calls.find((c) => c.type === 'insert' && c.name === 'comm_usage_logs')!;
    expect(log.args).toMatchObject({ organization_id: 7, channel: 'sms', credits_used: 2, recipient: '+573001234567', module: 'sequences', direction: 'outbound' });
    expect(log.args.metadata.cost_amount).toBeCloseTo(0.1184, 6);
    expect(r.cost_amount).toBeCloseTo(0.1184, 6);
    expect(r.logId).toBe('uuid-1');
  });

  it('lanza InsufficientCreditsError si el RPC devuelve false', async () => {
    const { sb, calls } = fakeDb({ rpcResult: false });
    __setAiCostClientFactory(() => sb);
    await expect(chargeCommCredits({ orgId: 7, channel: 'whatsapp', recipient: 'x' })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(calls.filter((c) => c.type === 'insert')).toHaveLength(0);
  });
});
