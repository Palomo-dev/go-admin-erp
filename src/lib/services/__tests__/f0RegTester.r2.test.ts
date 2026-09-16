/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tester F0-REG — ronda 2 (2026-09-15). Huecos que las suites del builder
 * (aiCostService, aiUsageStats, providerConfigContract, f0RegTester.r1) no
 * cubrían tras la ronda 2:
 *   - `withAICreditsCheck` probado por COMPORTAMIENTO (no por texto como el
 *     guardarraíl 19): sin saldo no llama al proveedor; proveedor falla →
 *     reembolso; NaN → RangeError sin RPC.
 *   - `consumeAICredits` (deprecated) rechaza NaN/negativo antes de crear el
 *     cliente; 0 créditos no cobra.
 *   - `refundAiCredits`: dedupe por fila `:refund` en BD (memoria vacía),
 *     dedupe que falla → se reembolsa igual, `p_previous` solo cuando se conoce.
 *   - Presupuesto: borde exacto (gasto + estimado == presupuesto pasa),
 *     valores basura en `monthly_budget_usd` se ignoran, error leyendo el
 *     presupuesto no bloquea el cobro.
 *   - `isOrgAdmin` por id y nunca por nombre.
 *   - `validateProviderSettings`: tamaño, tipos, null borra, select fuera de
 *     opciones.
 *   - `chargeCommCredits`: importes inválidos antes del RPC.
 *   - `aiUsageStatsService`: `metadata.cost_amount` en texto se ignora (igual
 *     que `jsonb_typeof = 'number'` en la RPC), borde de mes en `monthStartInTz`.
 * Informe: docs/crm-revenue-os/rondas/F0-REG-tester-r2.md
 */

import {
  chargeAiCredits,
  refundAiCredits,
  chargeCommCredits,
  getMonthlyBudgetUsd,
  InsufficientCreditsError,
  BudgetExceededError,
  __setAiCostClientFactory,
} from '@/lib/services/crm/aiCostService';
import { withAICreditsCheck, consumeAICredits } from '@/lib/services/aiCreditsService';
import { __setPricingClientFactory, clearPricingCache, getUnitCost, listPricing } from '@/lib/services/crm/pricingService';
import { isOrgAdmin } from '@/lib/utils/rbac';
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { validateProviderSettings, ProviderValidationError, MAX_SETTINGS_BYTES } from '@/lib/services/providerCredentials.server';
import { getAiUsageMonth, monthStartInTz, rowCostUsd } from '@/lib/services/crm/aiUsageStatsService';
import { todayInTz } from '@/lib/utils/dateDisplay';

// ───────────────────────────── fakes ─────────────────────────────

interface Call { type: 'rpc' | 'insert' | 'select'; name: string; args?: any }

/**
 * Cliente falso mínimo para aiCostService: `rpc` configurable, `from(...)`
 * con cadena fluida. `settingsRow` es lo que devuelve `ai_settings`;
 * `refundRow` lo que devuelve la consulta de dedupe sobre `ai_usage_logs`.
 */
function fakeDb(opts: {
  rpc?: (name: string, args: any) => { data: any; error: any };
  settingsRow?: Record<string, unknown> | null;
  refundRow?: Record<string, unknown> | null | (() => never);
  providerConfigs?: Array<{ settings: Record<string, unknown> | null; priority: number }> | (() => never);
} = {}) {
  const calls: Call[] = [];
  const sb: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ type: 'rpc', name, args });
      return opts.rpc ? opts.rpc(name, args) : { data: true, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: any = {
        insert: (row: any) => {
          calls.push({ type: 'insert', name: table, args: row });
          return {
            select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }),
            then: (r: any) => r({ data: null, error: null }),
          };
        },
        select: () => { calls.push({ type: 'select', name: table }); return q; },
        eq: (c: string, v: unknown) => { filters[c] = v; return q; },
        lte: () => q, gte: () => q, or: () => q, order: () => q, limit: () => q,
        // `await q` (listas): provider_configs devuelve el presupuesto configurado.
        then: (resolve: any, reject?: any) => {
          try {
            if (table === 'provider_configs') {
              if (typeof opts.providerConfigs === 'function') opts.providerConfigs();
              return resolve({ data: opts.providerConfigs ?? [], error: null });
            }
            return resolve({ data: [], error: null });
          } catch (e) {
            return reject ? reject(e) : Promise.reject(e);
          }
        },
        maybeSingle: async () => {
          if (table === 'ai_settings') return { data: opts.settingsRow === undefined ? { organization_id: 7, credits_remaining: 90, credits_reset_at: '2026-09-01T05:00:00Z' } : opts.settingsRow, error: null };
          if (table === 'ai_usage_logs') {
            if (typeof opts.refundRow === 'function') opts.refundRow();
            return { data: opts.refundRow ?? null, error: null };
          }
          if (table === 'organizations') return { data: { timezone: 'America/Bogota' }, error: null };
          if (table === 'provider_pricing') return { data: { unit_cost_usd: 1, valid_from: '2026-01-01' }, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
  };
  return { sb, calls };
}

const ctx = (over: Partial<ServerOrgContext>): ServerOrgContext =>
  ({ organizationId: 7, userId: 'u', roleId: 4, roleName: 'Vendedor', isSuperAdmin: false, supabase: {} as any, ...over }) as ServerOrgContext;

beforeEach(() => clearPricingCache());
afterEach(() => {
  __setAiCostClientFactory(null);
  __setPricingClientFactory(null);
  jest.useRealTimers();
});

// ───────────── 1. withAICreditsCheck (deprecated) delega de verdad ─────────────

describe('withAICreditsCheck delega en withAiCharge (comportamiento, no texto)', () => {
  it('sin saldo: InsufficientCreditsError (402) y el proveedor NO se ejecuta', async () => {
    const { sb, calls } = fakeDb({ rpc: (n) => ({ data: n === 'decrement_ai_credits' ? false : true, error: null }) });
    __setAiCostClientFactory(() => sb);
    const fn = jest.fn(async () => 'resultado');
    await expect(withAICreditsCheck(7, 3, fn, { actionType: 'chat', model: 'm' })).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(fn).not.toHaveBeenCalled();
    const dec = calls.find((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')!;
    expect(dec.args).toEqual({ p_org_id: 7, p_cost: 3 });
    expect(calls.some((c) => c.name === 'refund_ai_credits')).toBe(false);
  });

  it('el proveedor falla → se reembolsa con refund_ai_credits y el error original se propaga', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    const boom = new Error('proveedor caído');
    await expect(withAICreditsCheck(7, 2, async () => { throw boom; }, { actionType: 'chat', model: 'm' })).rejects.toBe(boom);
    const order = calls.filter((c) => c.type === 'rpc').map((c) => c.name);
    expect(order).toEqual(['decrement_ai_credits', 'refund_ai_credits']);
    const refund = calls.find((c) => c.name === 'refund_ai_credits')!;
    expect(refund.args).toMatchObject({ p_org_id: 7, p_amount: 2, p_previous: 92 });
  });

  it('estimatedCredits NaN → RangeError antes de cualquier RPC', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    const fn = jest.fn(async () => 1);
    await expect(withAICreditsCheck(7, Number('abc'), fn)).rejects.toBeInstanceOf(RangeError);
    expect(fn).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(0);
  });

  it('estimatedCredits negativo → RangeError (no es un abono disfrazado)', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(withAICreditsCheck(7, -5, async () => 1)).rejects.toBeInstanceOf(RangeError);
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(0);
  });
});

describe('consumeAICredits (deprecated) — guardas de importe', () => {
  it('NaN y negativo lanzan RangeError sin crear el cliente (no requiere env)', async () => {
    await expect(consumeAICredits(7, Number.NaN)).rejects.toBeInstanceOf(RangeError);
    await expect(consumeAICredits(7, -1)).rejects.toBeInstanceOf(RangeError);
    await expect(consumeAICredits(7, Number.POSITIVE_INFINITY)).rejects.toBeInstanceOf(RangeError);
  });
  it('0 créditos devuelve true sin tocar la BD', async () => {
    await expect(consumeAICredits(7, 0)).resolves.toBe(true);
    await expect(consumeAICredits(7, 0.4)).resolves.toBe(true); // redondea a 0
  });
});

// ───────────── 2. refundAiCredits: dedupe en BD y p_previous ─────────────

describe('refundAiCredits — dedupe en BD y p_previous', () => {
  it('con memoria vacía, una fila :refund ya existente en BD evita el segundo abono', async () => {
    const { sb, calls } = fakeDb({ refundRow: { id: 99 } });
    __setAiCostClientFactory(() => sb);
    const ok = await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x', logId: 42 });
    expect(ok).toBe(true);
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(0);
    expect(calls.filter((c) => c.type === 'insert')).toHaveLength(0);
  });

  it('si la consulta de dedupe falla, se reembolsa igualmente (la deuda con la org pesa más)', async () => {
    const { sb, calls } = fakeDb({ refundRow: () => { throw new Error('timeout'); } });
    __setAiCostClientFactory(() => sb);
    const ok = await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x', logId: 42 });
    expect(ok).toBe(true);
    expect(calls.filter((c) => c.name === 'refund_ai_credits')).toHaveLength(1);
  });

  it('sin logId no hay dedupe: dos llamadas → dos RPC (documenta el límite)', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x' });
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x' });
    expect(calls.filter((c) => c.name === 'refund_ai_credits')).toHaveLength(2);
    expect(calls.filter((c) => c.type === 'select')).toHaveLength(0);
  });

  it('p_previous solo viaja cuando es un número finito', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x', previousBalance: null });
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x', previousBalance: Number.NaN });
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x', previousBalance: 503 });
    const args = calls.filter((c) => c.name === 'refund_ai_credits').map((c) => c.args);
    expect(args[0]).toEqual({ p_org_id: 7, p_amount: 5 });
    expect(args[1]).toEqual({ p_org_id: 7, p_amount: 5 });
    expect(args[2]).toEqual({ p_org_id: 7, p_amount: 5, p_previous: 503 });
  });

  it('credits NaN → RangeError sin RPC (r3, simetría con el cobro); la fila :refund lleva cost_amount 0 y refunded_log_id', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(refundAiCredits({ orgId: 7, credits: Number.NaN, actionType: 'x' })).rejects.toBeInstanceOf(RangeError);
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(0);
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'draft', logId: 42, model: 'm' });
    const log = calls.find((c) => c.type === 'insert' && c.name === 'ai_usage_logs')!;
    expect(log.args).toMatchObject({ action_type: 'draft:refund', credits_consumed: -5, cost_amount: 0, metadata: { refunded_log_id: 42, cost_amount: 0 } });
  });
});

// ───────────── 3. Presupuesto mensual: bordes ─────────────

describe('presupuesto mensual — bordes', () => {
  function withBudget(spent: number, budget: unknown, extra: Partial<Parameters<typeof fakeDb>[0]> = {}) {
    const { sb, calls } = fakeDb({
      providerConfigs: [{ settings: { monthly_budget_usd: budget }, priority: 10 }],
      rpc: (n) => (n === 'fn_ai_usage_month' ? { data: { spent_usd: spent, spent_credits: 1, rows: 1, by_model: [], by_day: [] }, error: null } : { data: true, error: null }),
      ...extra,
    });
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);
    return { sb, calls };
  }

  it('gasto + estimado == presupuesto → pasa (el bloqueo es estricto >)', async () => {
    const { calls } = withBudget(8, 10);
    // unitSku con precio 1 USD/unidad (fake) → 2 unidades = 2 USD → 8 + 2 = 10, no > 10
    const r = await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 2, unitSku: 'sku', credits: 1 });
    expect(r.cost_amount).toBe(2);
    expect(calls.some((c) => c.name === 'decrement_ai_credits')).toBe(true);
  });

  it('un centavo por encima → BudgetExceededError con spentUsd/budgetUsd', async () => {
    withBudget(8.01, 10);
    let caught: unknown;
    try { await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 2, unitSku: 'sku', credits: 1 }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(BudgetExceededError);
    expect((caught as BudgetExceededError).spentUsd).toBe(8.01);
    expect((caught as BudgetExceededError).budgetUsd).toBe(10);
    expect((caught as BudgetExceededError).status).toBe(402);
  });

  it('sin unitSku el estimado es 0: solo bloquea si el gasto YA supera el presupuesto', async () => {
    const a = withBudget(10, 10);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 2, credits: 1 })).resolves.toBeTruthy();
    expect(a.calls.some((c) => c.name === 'decrement_ai_credits')).toBe(true);
    __setAiCostClientFactory(null);
    withBudget(10.5, 10);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 2, credits: 1 })).rejects.toBeInstanceOf(BudgetExceededError);
  });

  it('getMonthlyBudgetUsd ignora basura ("mucho", 0, negativo) y toma el primer valor válido por prioridad', async () => {
    const { sb } = fakeDb({
      providerConfigs: [
        { settings: { monthly_budget_usd: 'mucho' }, priority: 5 },
        { settings: { monthly_budget_usd: 0 }, priority: 10 },
        { settings: { monthly_budget_usd: -3 }, priority: 15 },
        { settings: null, priority: 20 },
        { settings: { monthly_budget_usd: '25' }, priority: 30 },
        { settings: { monthly_budget_usd: 99 }, priority: 40 },
      ],
    });
    expect(await getMonthlyBudgetUsd(sb, 7)).toBe(25);
  });

  it('si la lectura del presupuesto falla, no se bloquea el cobro (null) y no se consulta el consumo', async () => {
    const { sb, calls } = fakeDb({ providerConfigs: () => { throw new Error('provider_configs caída'); } });
    __setAiCostClientFactory(() => sb);
    expect(await getMonthlyBudgetUsd(sb, 7)).toBeNull();
    await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 2, credits: 1 });
    expect(calls.some((c) => c.name === 'fn_ai_usage_month')).toBe(false);
    expect(calls.some((c) => c.name === 'decrement_ai_credits')).toBe(true);
  });
});

// ───────────── 4. isOrgAdmin nunca por nombre ─────────────

describe('isOrgAdmin — por id y is_super_admin, nunca por nombre', () => {
  it('rol con nombre "Admin de organización" pero id 7 NO es admin', () => {
    expect(isOrgAdmin(ctx({ roleId: 7, roleName: 'Admin de organización' }))).toBe(false);
    expect(isOrgAdmin(ctx({ roleId: 7, roleName: 'Super Admin' }))).toBe(false);
  });
  it('id 1 y 2 son admin aunque el nombre no lo diga; is_super_admin también', () => {
    expect(isOrgAdmin(ctx({ roleId: 1, roleName: 'x' }))).toBe(true);
    expect(isOrgAdmin(ctx({ roleId: 2, roleName: 'Vendedor' }))).toBe(true);
    expect(isOrgAdmin(ctx({ roleId: 9, isSuperAdmin: true }))).toBe(true);
  });
  it('roleId ausente/NaN no es admin', () => {
    expect(isOrgAdmin(ctx({ roleId: Number.NaN }))).toBe(false);
    expect(isOrgAdmin(ctx({ roleId: undefined as unknown as number }))).toBe(false);
  });
});

// ───────────── 5. validateProviderSettings ─────────────

describe('validateProviderSettings — bordes', () => {
  it('JSON mayor que MAX_SETTINGS_BYTES → 422', () => {
    const big = { conversation_model: 'gpt-5.6-luna', cheap_model: 'x'.repeat(MAX_SETTINGS_BYTES) };
    expect(() => validateProviderSettings('llm', 'openai', big)).toThrow(ProviderValidationError);
  });
  it('number: acepta string numérico, rechaza booleano, string vacío y fuera de rango', () => {
    expect(validateProviderSettings('llm', 'openai', { monthly_budget_usd: '12' })).toEqual({ monthly_budget_usd: 12 });
    expect(() => validateProviderSettings('llm', 'openai', { monthly_budget_usd: true })).toThrow(/numérico/);
    expect(() => validateProviderSettings('llm', 'openai', { monthly_budget_usd: '  ' })).toThrow(/numérico/);
    expect(() => validateProviderSettings('llm', 'openai', { monthly_budget_usd: -1 })).toThrow(/fuera de rango/);
    expect(() => validateProviderSettings('llm', 'openai', { monthly_budget_usd: 100001 })).toThrow(/fuera de rango/);
  });
  it('select fuera de opciones → 422; null borra cualquier clave conocida; clave desconocida → 422', () => {
    expect(() => validateProviderSettings('llm', 'openai', { conversation_model: 'gpt-99-inventado' })).toThrow(ProviderValidationError);
    expect(validateProviderSettings('llm', 'openai', { conversation_model: null })).toEqual({ conversation_model: null });
    expect(() => validateProviderSettings('llm', 'openai', { model: 'gpt-5.6-luna' })).toThrow(/no válido/);
  });
  it('undefined → {} sin lanzar; proveedor sin SETTING_FIELDS rechaza cualquier clave', () => {
    expect(validateProviderSettings('llm', 'openai', undefined)).toEqual({});
    expect(() => validateProviderSettings('calendar', 'internal', { foo: 1 })).toThrow(ProviderValidationError);
  });
});

// ───────────── 6. chargeCommCredits: importes ─────────────

describe('chargeCommCredits — importes inválidos antes del RPC', () => {
  it('amount NaN / negativo / units NaN → RangeError sin RPC', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    const base = { orgId: 7, channel: 'sms' as const, recipient: '+57' };
    await expect(chargeCommCredits({ ...base, amount: Number.NaN })).rejects.toBeInstanceOf(RangeError);
    await expect(chargeCommCredits({ ...base, amount: -2 })).rejects.toBeInstanceOf(RangeError);
    await expect(chargeCommCredits({ ...base, units: Number.NaN })).rejects.toBeInstanceOf(RangeError);
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(0);
  });
  it('amount 0 se eleva a 1 (mínimo facturable)', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    const r = await chargeCommCredits({ orgId: 7, channel: 'sms', recipient: '+57', amount: 0 });
    expect(r.amount).toBe(1);
    expect(calls.find((c) => c.name === 'deduct_comm_credits')!.args).toEqual({ p_org_id: 7, p_channel: 'sms', p_amount: 1 });
  });
});

// ───────────── 7. aiUsageStatsService ─────────────

describe('aiUsageStatsService — coherencia con la RPC y borde de mes', () => {
  it('metadata.cost_amount en texto se ignora (la RPC exige jsonb_typeof = number); columna en texto (numeric de PostgREST) sí cuenta', () => {
    expect(rowCostUsd({ cost_amount: null, metadata: { cost_amount: '9.99' } })).toBe(0);
    expect(rowCostUsd({ cost_amount: '1.5', metadata: { cost_amount: 9 } })).toBe(1.5);
    expect(rowCostUsd({ cost_amount: 'abc', metadata: { cost_amount: 2 } })).toBe(2);
  });

  it('monthStartInTz en el borde: 30/09 22:00 Bogotá (= 01/10 03:00Z) sigue siendo septiembre en Bogotá y ya es octubre en UTC', () => {
    const now = new Date('2026-10-01T03:00:00.000Z');
    expect(monthStartInTz('America/Bogota', now)).toBe('2026-09-01T00:00:00.000-05:00');
    // Nota: `offsetMinutesToISO(0)` (timezone.ts, preexistente) escribe '-00:00'; Postgres y Date lo aceptan como UTC.
    expect(monthStartInTz('UTC', now)).toMatch(/^2026-10-01T00:00:00\.000[+-]00:00$/);
    expect(new Date(monthStartInTz('UTC', now)).toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('respaldo en Node: una fila a las 04:30Z del 1/10 cae en el 30/09 para Bogotá y en 1/10 para UTC (misma regla que la RPC)', async () => {
    const rows = [
      { model: 'm', credits_consumed: 7, total_tokens: 0, cost_amount: 0.5, metadata: {}, created_at: '2026-10-01T04:30:00+00:00' },
      { model: 'm', credits_consumed: -7, total_tokens: 0, cost_amount: 0, metadata: { cost_amount: 0 }, created_at: '2026-10-01T04:31:00+00:00' },
    ];
    const mk = () => {
      const q: any = { select: () => q, eq: () => q, gte: () => q, order: () => q, limit: async () => ({ data: rows, error: null }) };
      return { rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }), from: () => q } as any;
    };
    const bog = await getAiUsageMonth(mk(), 7, '2026-10-01T04:00:00Z', 'America/Bogota');
    const utc = await getAiUsageMonth(mk(), 7, '2026-10-01T04:00:00Z', 'UTC');
    expect(bog.source).toBe('fallback');
    expect(bog.by_day).toEqual([{ day: '2026-09-30', credits: 0, cost_usd: 0.5 }]);
    expect(utc.by_day).toEqual([{ day: '2026-10-01', credits: 0, cost_usd: 0.5 }]);
    // el reembolso (<0) no cuenta como llamada, igual que `count(*) filter (where credits > 0)`
    expect(bog.by_model[0].calls).toBe(1);
    expect(bog.spent_credits).toBe(0);
  });

  it('la RPC devolviendo un jsonb parcial no rompe: campos ausentes → 0 / []', async () => {
    const sb: any = { rpc: async () => ({ data: { spent_usd: '1.25' }, error: null }), from: () => { throw new Error('no debe usar el respaldo'); } };
    const r = await getAiUsageMonth(sb, 7, '2026-10-01T00:00:00Z', 'UTC');
    expect(r).toMatchObject({ spent_usd: 1.25, spent_credits: 0, rows: 0, by_model: [], by_day: [], truncated: false, source: 'rpc' });
  });
});

// ───────────── 8. Mutantes supervivientes de la ronda (se matan aquí) ─────────────

describe('mutantes supervivientes r2', () => {
  it('M1: -1 crédito / -1 unidad también es RangeError (el borde justo por debajo de 0)', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 10, credits: -1 })).rejects.toBeInstanceOf(RangeError);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: -1 })).rejects.toBeInstanceOf(RangeError);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 10, credits: -0.4 })).rejects.toBeInstanceOf(RangeError);
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(0);
  });

  it('M15: getUnitCost y listPricing filtran valid_to con `or(valid_to.is.null,valid_to.gte.<hoy UTC>)` (no basta con seleccionar la columna)', async () => {
    const chain: string[] = [];
    const sb: any = {
      from: () => {
        const q: any = new Proxy({}, {
          get: (_t, prop: string) => {
            if (prop === 'maybeSingle') return async () => ({ data: { unit_cost_usd: 9, valid_from: '2025-01-01', valid_to: null }, error: null });
            if (prop === 'then') return (r: any) => r({ data: [], error: null });
            return (...args: unknown[]) => { chain.push(`${prop}(${args.map(String).join(',')})`); return q; };
          },
        });
        return q;
      },
    };
    __setPricingClientFactory(() => sb);
    const hoy = todayInTz('UTC');
    await getUnitCost('openai', 'sku_x');
    expect(chain).toContain(`or(valid_to.is.null,valid_to.gte.${hoy})`);
    expect(chain).toContain(`lte(valid_from,${hoy})`);
    chain.length = 0;
    await listPricing();
    expect(chain).toContain(`or(valid_to.is.null,valid_to.gte.${hoy})`);
  });
});

// ───────────── 9. Hueco de r2, cerrado en r3 ─────────────

describe('ensureAiSettings — fila creada desde el navegador sin cupo', () => {
  // Una org sin fila puede recibirla desde /app/chat/ia/configuracion
  // (`AISettingsService.createSettings`, sesión): nace con credits_remaining = 0
  // (default de columna) y credits_reset_at NULL. En r2 `ensureAiSettings` la
  // veía «existente» y devolvía 0 → 402 hasta el cron del día 1. En r3 la fila
  // con credits_reset_at NULL cuenta como no provisionada: se le asigna el cupo
  // del plan con `update … is('credits_reset_at', null)` (idempotente) y se
  // reintenta el cobro una vez. El fake es con estado: el RPC de cobro mira el
  // saldo real de la fila y la migración 43 se simula ausente (PGRST202).
  it('fila existente con saldo 0 y credits_reset_at NULL → provisiona el cupo del plan y cobra (era it.failing en r2)', async () => {
    const row: Record<string, unknown> = { organization_id: 7, credits_remaining: 0, credits_reset_at: null, model: 'm', max_tokens: 500 };
    const { sb, calls } = fakeDb({
      rpc: (n, args) => {
        if (n === 'fn_provision_ai_settings' || n === 'fn_ai_plan_quota') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
        if (n !== 'decrement_ai_credits') return { data: true, error: null };
        const remaining = Number(row.credits_remaining);
        if (remaining < args.p_cost) return { data: false, error: null };
        row.credits_remaining = remaining - args.p_cost;
        return { data: true, error: null };
      },
    });
    const origFrom = sb.from;
    const updates: Array<{ patch: Record<string, unknown>; col: string; v: unknown }> = [];
    sb.from = (table: string) => {
      if (table === 'ai_settings') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
          insert: () => { throw new Error('no debe insertar: la fila existe'); },
          update: (patch: Record<string, unknown>) => ({
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
      if (table === 'subscriptions') {
        const sub = { plan_id: 1, status: 'active', metadata: {}, created_at: '2026-01-01T00:00:00Z', plans: { ai_credits_monthly: 500, ai_credits_max_rollover: 1000, ai_model: 'm', ai_max_tokens: 4000 } };
        const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (r: any) => r({ data: [sub], error: null }) };
        return q;
      }
      return origFrom(table);
    };
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1, credits: 1 })).resolves.toMatchObject({ credits: 1, previousBalance: 500 });
    expect(updates).toEqual([expect.objectContaining({ col: 'credits_reset_at', v: null, patch: expect.objectContaining({ credits_remaining: 500 }) })]);
    expect(row.credits_remaining).toBe(499);
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')).toHaveLength(2);
    // Segundo cobro: la fila ya está provisionada → ni update ni RPC de provisión.
    await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1, credits: 1 });
    expect(updates).toHaveLength(1);
    expect(row.credits_remaining).toBe(498);
  });

  it('dos peticiones concurrentes sobre la fila sin provisionar: una provisiona, la otra relee (update de 0 filas) y ninguna duplica el cupo', async () => {
    const row: Record<string, unknown> = { organization_id: 7, credits_remaining: 0, credits_reset_at: null, model: 'm', max_tokens: 500 };
    let applied = 0;
    const sb: any = {
      rpc: async (n: string) => (n === 'fn_provision_ai_settings' || n === 'fn_ai_plan_quota' ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : { data: true, error: null }),
      from: (table: string) => {
        if (table === 'ai_settings') {
          return {
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...row }, error: null }) }) }),
            update: (patch: Record<string, unknown>) => ({
              eq: () => ({
                is: () => {
                  const applies = row.credits_reset_at == null;
                  if (applies) { Object.assign(row, patch); applied += 1; }
                  return { select: () => ({ maybeSingle: async () => ({ data: applies ? { ...row } : null, error: null }) }) };
                },
              }),
            }),
          };
        }
        const sub = { plan_id: 1, status: 'trialing', metadata: {}, created_at: '2026-01-01T00:00:00Z', plans: { ai_credits_monthly: 500, ai_credits_max_rollover: 1000, ai_model: 'm', ai_max_tokens: 4000 } };
        const q: any = { select: () => q, eq: () => q, order: () => q, limit: () => q, then: (r: any) => r({ data: [sub], error: null }) };
        return q;
      },
    };
    const { ensureAiSettings } = await import('@/lib/services/aiCreditsService');
    const [a, b] = await Promise.all([ensureAiSettings(7, sb), ensureAiSettings(7, sb)]);
    expect(applied).toBe(1);
    expect([a.provisioned, b.provisioned].filter(Boolean)).toHaveLength(1);
    expect(a.credits_remaining).toBe(500);
    expect(b.credits_remaining).toBe(500);
    expect(row.credits_remaining).toBe(500);
  });
});
