/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * aiCostService — F0 (REG r1, ampliado en r2):
 *  - el RPC decrement_ai_credits se ejecuta ANTES del proveedor;
 *  - si el RPC devuelve false → InsufficientCreditsError y NO se llama al proveedor;
 *  - si el proveedor falla → reembolso (RPC dedicada, idempotente por logId);
 *  - cost_amount real desde provider_pricing en columna y metadata del log;
 *  - org sin fila ai_settings → auto-provisión con el cupo del plan + reintento;
 *  - presupuesto mensual (§8) → BudgetExceededError (402, budget_exceeded);
 *  - chargeCommCredits usa deduct_comm_credits + comm_usage_logs.
 */

import {
  chargeAiCredits,
  refundAiCredits,
  withAiCharge,
  chargeCommCredits,
  InsufficientCreditsError,
  BudgetExceededError,
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
        lte: () => q, or: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => {
          // Fila provisionada (credits_reset_at no nulo): el caso base es «sin saldo», no «sin fila».
          if (table === 'ai_settings') return { data: { organization_id: 7, credits_remaining: 90, credits_reset_at: '2026-09-01T05:00:00Z' }, error: null };
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

/**
 * `subscriptions` con el plan embebido, como lo consulta `planQuotaFallback`
 * (una sola consulta: select → eq → order → limit → await).
 */
function subscriptionsTable(plan: { code: string; ai_credits_monthly: number; ai_credits_max_rollover: number; ai_model: string; ai_max_tokens: number }, custom?: Record<string, unknown>) {
  const row = { plan_id: 1, status: 'active', metadata: { custom_config: custom ?? null }, created_at: '2026-01-01T00:00:00Z', plans: plan };
  const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (r: any) => r({ data: [row], error: null }) };
  return q;
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

  it('propaga un error genérico del RPC (no es 402)', async () => {
    const { sb } = fakeDb({ rpcError: { message: 'connection reset' } });
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1 })).rejects.toThrow(/decrement_ai_credits/);
  });

  // QA r1 alto 4: 27 orgs con CRM no tenían fila en ai_settings y recibían 500.
  // Con la fila ausente se auto-provisiona con el cupo del plan y se reintenta
  // UNA vez; si el plan no da cupo, 402.
  it('org sin fila: auto-provisiona con el cupo del plan y reintenta el RPC una sola vez', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    let hasRow = false;
    let rpcCalls = 0;
    sb.rpc = async (name: string, args: any) => {
      calls.push({ type: 'rpc', name, args });
      if (name !== 'decrement_ai_credits') return { data: true, error: null };
      rpcCalls += 1;
      return hasRow ? { data: true, error: null } : { data: false, error: null };
    };
    const origFrom = sb.from;
    sb.from = (table: string) => {
      if (table === 'ai_settings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: hasRow ? { organization_id: 7, credits_remaining: 500, credits_reset_at: '2026-09-15T00:00:00Z' } : null, error: null }) }) }),
          insert: (row: any) => { calls.push({ type: 'insert', name: table, args: row }); hasRow = true; return { then: (r: any) => r({ data: null, error: null }) }; },
        };
      }
      if (table === 'subscriptions') return subscriptionsTable({ code: 'pro', ai_credits_monthly: 500, ai_credits_max_rollover: 1000, ai_model: 'gpt-5.6-luna', ai_max_tokens: 4000 });
      return origFrom(table);
    };
    __setAiCostClientFactory(() => sb);

    const r = await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1, credits: 2 });
    expect(r.credits).toBe(2);
    expect(rpcCalls).toBe(2);
    const provisioned = calls.find((c) => c.type === 'insert' && c.name === 'ai_settings')!;
    expect(provisioned.args).toMatchObject({ organization_id: 7, credits_remaining: 500, is_active: true });
    // Saldo previo = saldo tras el cobro + créditos: alimenta credits_before/after y p_previous.
    expect(r.previousBalance).toBe(502);
  });

  it('org sin fila y plan sin cupo → InsufficientCreditsError (402), sin segundo RPC', async () => {
    const { sb, calls } = fakeDb({ rpcResult: false });
    const origFrom = sb.from;
    sb.from = (table: string) => {
      if (table === 'ai_settings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
          insert: (row: any) => { calls.push({ type: 'insert', name: table, args: row }); return { then: (r: any) => r({ data: null, error: null }) }; },
        };
      }
      if (table === 'subscriptions') return subscriptionsTable({ code: 'free', ai_credits_monthly: 0, ai_credits_max_rollover: 0, ai_model: 'gpt-5.6-luna', ai_max_tokens: 500 });
      return origFrom(table);
    };
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1 })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')).toHaveLength(1);
  });

  // QA r2 medio 1: la fila creada desde el navegador (`/app/chat/ia/configuracion`
  // solo escribe columnas de comportamiento) nace con 0 créditos y
  // credits_reset_at NULL. Antes `ensureAiSettings` la daba por provisionada y
  // el cobro respondía 402 hasta el cron del día 1.
  function unprovisionedRowDb(plan: { ai_credits_monthly: number; ai_credits_max_rollover: number }) {
    const { sb, calls } = fakeDb({ rpcResult: true });
    const row: Record<string, unknown> = { organization_id: 7, credits_remaining: 0, credits_reset_at: null, model: 'gpt-5.6-luna', max_tokens: 500 };
    let decrements = 0;
    sb.rpc = async (name: string, args: any) => {
      calls.push({ type: 'rpc', name, args });
      if (name === 'fn_provision_ai_settings' || name === 'fn_ai_plan_quota') {
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }; // mig. 43 sin aplicar
      }
      if (name !== 'decrement_ai_credits') return { data: true, error: null };
      decrements += 1;
      const remaining = Number(row.credits_remaining);
      if (remaining < args.p_cost) return { data: false, error: null };
      row.credits_remaining = remaining - args.p_cost;
      return { data: true, error: null };
    };
    const updates: any[] = [];
    const origFrom = sb.from;
    sb.from = (table: string) => {
      if (table === 'ai_settings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
          insert: () => { throw new Error('no debe insertar: la fila existe'); },
          update: (patch: any) => ({
            eq: () => ({
              is: (col: string, v: unknown) => {
                updates.push({ patch, col, v });
                const applies = col === 'credits_reset_at' && v === null && row.credits_reset_at == null;
                if (applies) Object.assign(row, patch);
                return { select: () => ({ maybeSingle: async () => ({ data: applies ? { ...row } : null, error: null }) }) };
              },
            }),
          }),
        };
      }
      if (table === 'subscriptions') return subscriptionsTable({ code: 'pro', ai_model: 'gpt-5.6-luna', ai_max_tokens: 4000, ...plan });
      return origFrom(table);
    };
    __setAiCostClientFactory(() => sb);
    return { sb, calls, row, updates, decrements: () => decrements };
  }

  it('fila con credits_reset_at NULL y plan con cupo → provisiona (update … is(credits_reset_at, null)) y cobra', async () => {
    const db = unprovisionedRowDb({ ai_credits_monthly: 500, ai_credits_max_rollover: 1000 });
    const r = await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1, credits: 2 });
    expect(r.credits).toBe(2);
    expect(db.decrements()).toBe(2); // false → provisión → un único reintento
    expect(db.updates).toHaveLength(1);
    expect(db.updates[0]).toMatchObject({ col: 'credits_reset_at', v: null, patch: { credits_remaining: 500 } });
    expect(typeof db.updates[0].patch.credits_reset_at).toBe('string');
    expect(db.row.credits_remaining).toBe(498);
    expect(r.previousBalance).toBe(500);
  });

  it('fila con credits_reset_at NULL y plan sin cupo → 402, un solo RPC de cobro, y la fila queda provisionada con 0', async () => {
    const db = unprovisionedRowDb({ ai_credits_monthly: 0, ai_credits_max_rollover: 0 });
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1 })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(db.decrements()).toBe(1);
    expect(db.row.credits_remaining).toBe(0);
    expect(db.row.credits_reset_at).not.toBeNull(); // no se vuelve a intentar en cada cobro
  });

  it('con la migración 43 aplicada usa fn_provision_ai_settings y no toca subscriptions', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    let provisioned = false;
    sb.rpc = async (name: string, args: any) => {
      calls.push({ type: 'rpc', name, args });
      if (name === 'fn_provision_ai_settings') { provisioned = true; return { data: { created: false, provisioned: true, credits_remaining: 500, model: 'gpt-5.6-luna', max_tokens: 4000, monthly: 500, source: 'plan' }, error: null }; }
      if (name === 'decrement_ai_credits') return { data: provisioned, error: null };
      return { data: true, error: null };
    };
    const origFrom = sb.from;
    sb.from = (table: string) => {
      if (table === 'subscriptions' || table === 'plans') throw new Error(`no debe consultar ${table}: la RPC es la fuente`);
      if (table === 'ai_settings') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: 7, credits_remaining: provisioned ? 498 : 0, credits_reset_at: null }, error: null }) }) }) };
      return origFrom(table);
    };
    __setAiCostClientFactory(() => sb);
    const r = await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1, credits: 2 });
    expect(r.credits).toBe(2);
    expect(calls.filter((c) => c.type === 'rpc').map((c) => c.name)).toEqual(['decrement_ai_credits', 'fn_provision_ai_settings', 'decrement_ai_credits']);
  });

  // §8 / QA r1 medio 13: el presupuesto mensual bloquea, no solo avisa.
  it('presupuesto mensual agotado → BudgetExceededError (402, budget_exceeded) sin tocar el RPC', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true, prices: { 'openai:gpt_5_6_luna_in': 2 } });
    const origFrom = sb.from;
    sb.from = (table: string) => {
      if (table === 'provider_configs') {
        const q: any = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [{ settings: { monthly_budget_usd: 10 }, priority: 10 }], error: null }) };
        return q;
      }
      if (table === 'organizations') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: 'America/Bogota' }, error: null }) }) }) };
      }
      return origFrom(table);
    };
    const origRpc = sb.rpc;
    sb.rpc = async (name: string, args: any) => {
      if (name === 'fn_ai_usage_month') {
        expect(args.p_tz).toBe('America/Bogota');
        expect(args.p_since).toMatch(/^\d{4}-\d{2}-01T00:00:00\.000-05:00$/);
        return { data: { spent_usd: 9.5, spent_credits: 100, rows: 3, by_model: [], by_day: [] }, error: null };
      }
      return origRpc(name, args);
    };
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);

    let caught: unknown;
    try {
      await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'gpt-5.6-luna', units: 1, unitSku: 'gpt_5_6_luna_in' }); // estimado 2 USD → 11.5 > 10
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect(caught).toBeInstanceOf(InsufficientCreditsError); // los handlers de jobs ya lo mapean a JobFatalError
    expect((caught as BudgetExceededError).code).toBe('budget_exceeded');
    expect((caught as Error).message).toContain('budget_exceeded');
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')).toHaveLength(0);
  });

  it('con presupuesto y gasto por debajo, cobra con normalidad', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true, prices: { 'openai:gpt_5_6_luna_in': 2 } });
    const origFrom = sb.from;
    sb.from = (table: string) => {
      if (table === 'provider_configs') {
        const q: any = { select: () => q, eq: () => q, order: () => q, limit: async () => ({ data: [{ settings: { monthly_budget_usd: 10 }, priority: 10 }], error: null }) };
        return q;
      }
      if (table === 'organizations') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: 'America/Bogota' }, error: null }) }) }) };
      }
      return origFrom(table);
    };
    const origRpc = sb.rpc;
    sb.rpc = async (name: string, args: any) => (name === 'fn_ai_usage_month' ? { data: { spent_usd: 5, spent_credits: 1, rows: 1, by_model: [], by_day: [] }, error: null } : origRpc(name, args));
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);
    const r = await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'gpt-5.6-luna', units: 1, unitSku: 'gpt_5_6_luna_in' });
    expect(r.cost_amount).toBe(2);
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')).toHaveLength(1);
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
    // p_previous = saldo tras el cobro (90 en el fake) + créditos cobrados.
    expect(rpcs[1].args).toEqual({ p_org_id: 7, p_amount: 5, p_previous: 95 });
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
  // QA r1 medio 10: p_previous (saldo antes del cobro) viaja a refund_ai_credits
  // cuando se conoce, y solo entonces (los tests anteriores fijan args exactos sin él).
  it('pasa p_previous a refund_ai_credits cuando el cobro lo conoce', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    const origFrom = sb.from;
    sb.from = (table: string) => {
      if (table === 'ai_settings') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { credits_remaining: 493 }, error: null }) }) }) };
      return origFrom(table);
    };
    __setAiCostClientFactory(() => sb);
    await expect(
      withAiCharge({ orgId: 7, actionType: 'draft', model: 'm', units: 1, credits: 10 }, async () => { throw new Error('provider down'); }),
    ).rejects.toThrow('provider down');
    const refund = calls.find((c) => c.type === 'rpc' && c.name === 'refund_ai_credits')!;
    expect(refund.args).toEqual({ p_org_id: 7, p_amount: 10, p_previous: 503 });
  });

  it('con 0 créditos no llama al RPC', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    __setAiCostClientFactory(() => sb);
    expect(await refundAiCredits({ orgId: 1, credits: 0, actionType: 'x' })).toBe(true);
    expect(calls).toHaveLength(0);
  });
  // QA r2 bajo 4: simetría con el cobro. Antes negativo → `true` silencioso.
  it('créditos negativos o NaN → RangeError sin RPC (como el cobro)', async () => {
    const { sb, calls } = fakeDb({ rpcResult: true });
    __setAiCostClientFactory(() => sb);
    await expect(refundAiCredits({ orgId: 1, credits: -5, actionType: 'x' })).rejects.toBeInstanceOf(RangeError);
    await expect(refundAiCredits({ orgId: 1, credits: Number.NaN, actionType: 'x' })).rejects.toBeInstanceOf(RangeError);
    await expect(refundAiCredits({ orgId: 1, credits: Number.POSITIVE_INFINITY, actionType: 'x' })).rejects.toBeInstanceOf(RangeError);
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
