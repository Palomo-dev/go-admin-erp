/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tester F0-REG — ronda 3 (2026-09-15). Verifica los puntos 1–5 del QA r2
 * contra el código r3 y añade bordes que ninguna suite (builder, r1, r2)
 * cubría:
 *   - Punto 1 (auto-provisión de la fila «vacía»): camino por RPC 43
 *     (`fn_provision_ai_settings`) sin respaldo en Node; RPC presente pero
 *     rota (42501) → 402 y NUNCA se cae al respaldo; RPC que devuelve basura
 *     → sí se cae al respaldo; org inexistente → 402 con un solo RPC de
 *     cobro; `credits_remaining` en texto desde la RPC.
 *   - Punto 2 (zona horaria): `22023` sin «time zone» en el mensaje no se
 *     reintenta; `22023` con mensaje vacío sí; segundo `22023` también con
 *     UTC → error controlado (2 llamadas); zona en minúsculas (`utc`) sí
 *     reintenta; `isSupportedTimeZone` bordes (alias, abreviaturas, vacío,
 *     longitud, no-string) y el hueco ICU vs IANA (`it.failing`).
 *   - Punto 4 (simetría del reembolso): `-0`, `-Infinity`, 0 → sin RPC;
 *     RPC que devuelve `false` → `false` sin fila `:refund` y sin dedupe.
 *   - Punto 6 (una sola regla del cupo): el respaldo en Node aplica la
 *     regla de `fn_ai_plan_quota` (custom_config 0 gana al plan; camelCase;
 *     suscripción cancelada más reciente NO gana a la activa; sin
 *     suscripción → 0) y documenta la única divergencia conocida (decimal
 *     `10000.0`).
 *   - Bordes del cobro: `credits` fraccionario < 0,5 se redondea a 0 y el
 *     RPC recibe `p_cost: 0` (llamada gratis, documentado); `units`
 *     negativas → RangeError antes de leer precio.
 *   - `rowCostUsd` con columna basura / vacía.
 * Sin datos reales: ids 7/9/999 y valores inventados.
 * Informe: docs/crm-revenue-os/rondas/F0-REG-tester-r3.md
 */

import {
  chargeAiCredits,
  refundAiCredits,
  InsufficientCreditsError,
  __setAiCostClientFactory,
} from '@/lib/services/crm/aiCostService';
import { ensureAiSettings } from '@/lib/services/aiCreditsService';
import { __setPricingClientFactory, clearPricingCache } from '@/lib/services/crm/pricingService';
import { getAiUsageMonth, isUnknownTimeZoneError, rowCostUsd } from '@/lib/services/crm/aiUsageStatsService';
import { isSupportedTimeZone } from '@/lib/utils/timezone';

// ───────────────────────────── fakes ─────────────────────────────

interface Call { type: 'rpc' | 'insert' | 'update' | 'select'; name: string; args?: any }

/**
 * Cliente falso con ESTADO para `ai_settings` (una fila o ninguna) y con
 * `rpc` configurable. `decrement_ai_credits` mira el saldo real de la fila;
 * `fn_provision_ai_settings` / `fn_ai_plan_quota` se resuelven con
 * `opts.provisionRpc` / `opts.quotaRpc` (por defecto: «no existe», PGRST202).
 */
function fakeDb(opts: {
  row?: Record<string, unknown> | null;
  provisionRpc?: (args: any) => { data: any; error: any };
  quotaRpc?: (args: any) => { data: any; error: any };
  subscriptions?: Array<Record<string, unknown>>;
  refundRpc?: (args: any) => { data: any; error: any };
} = {}) {
  const calls: Call[] = [];
  const state = { row: opts.row === undefined ? { organization_id: 7, credits_remaining: 90, credits_reset_at: '2026-09-01T05:00:00Z', model: 'm', max_tokens: 500 } : opts.row };
  const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
  const sb: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ type: 'rpc', name, args });
      if (name === 'fn_provision_ai_settings') return opts.provisionRpc ? opts.provisionRpc(args) : missing;
      if (name === 'fn_ai_plan_quota') return opts.quotaRpc ? opts.quotaRpc(args) : missing;
      if (name === 'refund_ai_credits') return opts.refundRpc ? opts.refundRpc(args) : { data: true, error: null };
      if (name === 'decrement_ai_credits') {
        if (!state.row) return { data: false, error: null };
        const remaining = Number(state.row.credits_remaining ?? 0);
        if (remaining < args.p_cost) return { data: false, error: null };
        state.row.credits_remaining = remaining - args.p_cost;
        return { data: true, error: null };
      }
      return { data: true, error: null };
    },
    from: (table: string) => {
      const q: any = {
        select: () => { calls.push({ type: 'select', name: table }); return q; },
        eq: () => q, lte: () => q, gte: () => q, or: () => q, order: () => q, limit: () => q,
        is: (col: string, v: unknown) => { q._is = { col, v }; return q; },
        insert: (row: any) => {
          calls.push({ type: 'insert', name: table, args: row });
          if (table === 'ai_settings') {
            if (state.row) return { then: (r: any) => r({ data: null, error: { code: '23505', message: 'duplicate key' } }) };
            state.row = { ...row };
          }
          return {
            select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }),
            then: (r: any) => r({ data: null, error: null }),
          };
        },
        update: (patch: any) => {
          calls.push({ type: 'update', name: table, args: patch });
          q._patch = patch;
          return q;
        },
        then: (resolve: any) => {
          if (table === 'subscriptions') return resolve({ data: opts.subscriptions ?? [], error: null });
          return resolve({ data: [], error: null });
        },
        maybeSingle: async () => {
          if (table === 'ai_settings') {
            if (q._patch) {
              const applies = !q._is || (q._is.col === 'credits_reset_at' && q._is.v === null && state.row && state.row.credits_reset_at == null);
              if (applies && state.row) Object.assign(state.row, q._patch);
              const out = applies && state.row ? { ...state.row } : null;
              q._patch = undefined;
              return { data: out, error: null };
            }
            return { data: state.row ? { ...state.row } : null, error: null };
          }
          if (table === 'organizations') return { data: { timezone: 'America/Bogota' }, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
  };
  return { sb, calls, state };
}

const charge = (over: Partial<Parameters<typeof chargeAiCredits>[0]> = {}) =>
  chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1, credits: 1, ...over });

beforeEach(() => clearPricingCache());
afterEach(() => {
  __setAiCostClientFactory(null);
  __setPricingClientFactory(null);
  jest.restoreAllMocks();
});

// ───────────── 1. QA r2 punto 1: auto-provisión por RPC 43 ─────────────

describe('QA r2 punto 1 — fila «vacía» provisionada por la RPC fn_provision_ai_settings (mig. 43)', () => {
  it('con la RPC presente: provisiona por RPC, NO usa el respaldo (ni insert ni update en Node) y cobra en el reintento', async () => {
    const { sb, calls, state } = fakeDb({
      row: { organization_id: 7, credits_remaining: 0, credits_reset_at: null, model: 'm', max_tokens: 500 },
      provisionRpc: () => {
        // La RPC hace en SQL lo que el respaldo hacía en Node.
        state.row!.credits_remaining = 500;
        state.row!.credits_reset_at = '2026-09-15T00:00:00Z';
        return { data: { created: false, provisioned: true, credits_remaining: 500, model: 'm', max_tokens: 500, monthly: 500, source: 'plan' }, error: null };
      },
    });
    __setAiCostClientFactory(() => sb);
    await expect(charge()).resolves.toMatchObject({ credits: 1, previousBalance: 500 });
    expect(calls.filter((c) => c.type === 'rpc').map((c) => c.name)).toEqual(['decrement_ai_credits', 'fn_provision_ai_settings', 'decrement_ai_credits']);
    expect(calls.filter((c) => c.type === 'update' && c.name === 'ai_settings')).toHaveLength(0);
    expect(calls.filter((c) => c.type === 'insert' && c.name === 'ai_settings')).toHaveLength(0);
    expect(calls.filter((c) => c.type === 'select' && c.name === 'subscriptions')).toHaveLength(0);
    expect(state.row!.credits_remaining).toBe(499);
  });

  it('RPC presente pero rota (42501 permission denied) → 402, un solo cobro, y NUNCA se cae al respaldo en Node', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sb, calls } = fakeDb({
      row: { organization_id: 7, credits_remaining: 0, credits_reset_at: null },
      provisionRpc: () => ({ data: null, error: { code: '42501', message: 'permission denied for function fn_provision_ai_settings' } }),
    });
    __setAiCostClientFactory(() => sb);
    await expect(charge()).rejects.toMatchObject({ name: 'InsufficientCreditsError', status: 402 });
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')).toHaveLength(1);
    expect(calls.filter((c) => c.type === 'update' || c.type === 'insert')).toHaveLength(0);
    expect(calls.filter((c) => c.type === 'select' && c.name === 'subscriptions')).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('auto-provisionar'), expect.stringContaining('permission denied'));
  });

  it('RPC presente que devuelve basura (null / sin credits_remaining) → respaldo en Node con la regla del cupo', async () => {
    const { sb, calls, state } = fakeDb({
      row: { organization_id: 7, credits_remaining: 0, credits_reset_at: null, model: 'm', max_tokens: 500 },
      provisionRpc: () => ({ data: { created: 'sí' }, error: null }),
      subscriptions: [{ plan_id: 1, status: 'active', metadata: {}, created_at: '2026-01-01T00:00:00Z', plans: { ai_credits_monthly: 300, ai_credits_max_rollover: 0, ai_model: 'm', ai_max_tokens: 1000 } }],
    });
    __setAiCostClientFactory(() => sb);
    await expect(charge()).resolves.toMatchObject({ credits: 1 });
    expect(calls.filter((c) => c.type === 'update' && c.name === 'ai_settings')).toHaveLength(1);
    expect(state.row!.credits_remaining).toBe(299);
  });

  it('org inexistente según la RPC (created=false, provisioned=false, credits_remaining 0) → 402 y un solo RPC de cobro', async () => {
    const { sb, calls } = fakeDb({
      row: null,
      provisionRpc: () => ({ data: { created: false, provisioned: false, credits_remaining: 0, model: null, max_tokens: null, monthly: 0, source: 'none' }, error: null }),
    });
    __setAiCostClientFactory(() => sb);
    await expect(charge()).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')).toHaveLength(1);
  });

  it('la RPC devuelve credits_remaining como texto ("500") → se acepta como 500 (PostgREST puede serializar numéricos como string)', async () => {
    const { sb } = fakeDb({
      row: null,
      provisionRpc: () => ({ data: { created: true, provisioned: true, credits_remaining: '500', model: 'm', max_tokens: '800' }, error: null }),
    });
    const ensured = await ensureAiSettings(7, sb);
    expect(ensured).toEqual({ created: true, provisioned: true, credits_remaining: 500, aiModel: 'm', aiMaxTokens: 800 });
  });

  it('fila provisionada (credits_reset_at con fecha) y saldo 0 → 402 SIN consultar el plan ni provisionar (una org legítimamente en 0)', async () => {
    const { sb, calls } = fakeDb({ row: { organization_id: 7, credits_remaining: 0, credits_reset_at: '2026-09-01T05:00:00Z' } });
    __setAiCostClientFactory(() => sb);
    await expect(charge()).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(calls.filter((c) => c.type === 'rpc').map((c) => c.name)).toEqual(['decrement_ai_credits']);
  });
});

// ───────────── 2. QA r2 punto 6: una sola regla del cupo (respaldo Node = fn_ai_plan_quota) ─────────────

describe('QA r2 punto 6 — el respaldo en Node aplica la MISMA regla que fn_ai_plan_quota', () => {
  const plan = { ai_credits_monthly: 500, ai_credits_max_rollover: 1000, ai_model: 'm', ai_max_tokens: 4000 };
  const provision = async (subscriptions: Array<Record<string, unknown>>) => {
    const { sb, state } = fakeDb({ row: null, subscriptions });
    const ensured = await ensureAiSettings(7, sb);
    return { ensured, state };
  };

  it('custom_config.ai_credits = 0 (entero, incluido 0) gana al plan → cupo 0', async () => {
    const { ensured } = await provision([{ plan_id: 1, status: 'active', metadata: { custom_config: { ai_credits: 0 } }, created_at: '2026-01-01', plans: plan }]);
    expect(ensured.credits_remaining).toBe(0);
  });

  it('custom_config.aiCredits (camelCase) también cuenta; como texto " 100 " se recorta', async () => {
    const a = await provision([{ plan_id: 1, status: 'active', metadata: { custom_config: { aiCredits: 250 } }, created_at: '2026-01-01', plans: plan }]);
    expect(a.ensured.credits_remaining).toBe(250);
    const b = await provision([{ plan_id: 1, status: 'active', metadata: { custom_config: { ai_credits: ' 100 ' } }, created_at: '2026-01-01', plans: plan }]);
    expect(b.ensured.credits_remaining).toBe(100);
  });

  it('valores que no son entero (negativo, booleano, "1e4", 10 dígitos) se ignoran → plan', async () => {
    for (const bad of [-5, true, '1e4', '1234567890', 'mucho']) {
      const { ensured } = await provision([{ plan_id: 1, status: 'active', metadata: { custom_config: { ai_credits: bad } }, created_at: '2026-01-01', plans: plan }]);
      expect(ensured.credits_remaining).toBe(500);
    }
  });

  it('suscripción cancelada más reciente NO gana a la activa más antigua (orden: activa/en prueba primero)', async () => {
    const { ensured } = await provision([
      { plan_id: 2, status: 'canceled', metadata: {}, created_at: '2026-09-01', plans: { ...plan, ai_credits_monthly: 9999 } },
      { plan_id: 1, status: 'active', metadata: {}, created_at: '2026-01-01', plans: plan },
    ]);
    expect(ensured.credits_remaining).toBe(500);
  });

  it('sin suscripción → 0 (ya no 10 000); sin ninguna activa → la más reciente', async () => {
    const none = await provision([]);
    expect(none.ensured.credits_remaining).toBe(0);
    const canceled = await provision([{ plan_id: 2, status: 'canceled', metadata: {}, created_at: '2026-09-01', plans: { ...plan, ai_credits_monthly: 40 } }]);
    expect(canceled.ensured.credits_remaining).toBe(40);
  });

  it('DIVERGENCIA documentada: un decimal `10000.0` en custom_config es "10000" para Node (String) y "10000.0" para jsonb ->> (no cumple ^[0-9]{1,9}$ → plan). Hoy 0 filas así en BD.', async () => {
    const { ensured } = await provision([{ plan_id: 1, status: 'active', metadata: { custom_config: { ai_credits: 10000.0 } }, created_at: '2026-01-01', plans: plan }]);
    // Node: 10000 (custom). SQL: 500 (plan). Se deja constancia; cuando la 43 esté aplicada solo manda SQL.
    expect(ensured.credits_remaining).toBe(10000);
  });
});

// ───────────── 3. QA r2 punto 2: zona horaria a prueba de catálogo (capa Node) ─────────────

describe('QA r2 punto 2 — getAiUsageMonth y 22023', () => {
  const rpcSeq = (responses: Array<{ data: any; error: any }>) => {
    const calls: any[] = [];
    const sb: any = {
      rpc: async (name: string, args: any) => { calls.push({ name, args }); return responses[Math.min(calls.length - 1, responses.length - 1)]; },
      from: () => { throw new Error('no debe consultar tablas'); },
    };
    return { sb, calls };
  };
  const okData = { spent_usd: 1, spent_credits: 2, rows: 1, by_model: [], by_day: [] };

  it('22023 cuyo mensaje NO habla de zona horaria (otro parámetro inválido) → no se reintenta y se propaga como error controlado', async () => {
    const { sb, calls } = rpcSeq([{ data: null, error: { code: '22023', message: 'invalid parameter value for p_since' } }]);
    await expect(getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000-05:00', 'America/Bogota')).rejects.toThrow(/fn_ai_usage_month falló/);
    expect(calls).toHaveLength(1);
  });

  it('22023 con mensaje vacío → se trata como zona desconocida y se reintenta con UTC (mismo p_since)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sb, calls } = rpcSeq([{ data: null, error: { code: '22023', message: '' } }, { data: okData, error: null }]);
    const out = await getAiUsageMonth(sb, 7, '2026-09-01T00:00:00.000-05:00', 'America/Bogota');
    expect(out.source).toBe('rpc');
    expect(calls.map((c) => c.args.p_tz)).toEqual(['America/Bogota', 'UTC']);
    expect(calls[1].args.p_since).toBe('2026-09-01T00:00:00.000-05:00');
  });

  it('el reintento con UTC también falla con 22023 → error controlado tras exactamente 2 llamadas (nunca bucle)', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sb, calls } = rpcSeq([{ data: null, error: { code: '22023', message: 'time zone "X" not recognized' } }]);
    await expect(getAiUsageMonth(sb, 7, 's', 'Marte/Fobos')).rejects.toThrow(/fn_ai_usage_month falló/);
    expect(calls).toHaveLength(2);
  });

  it('zona "utc" en minúsculas no es "UTC": si Postgres la rechaza se reintenta con "UTC"; "" también', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const tz of ['utc', '']) {
      const { sb, calls } = rpcSeq([{ data: null, error: { code: '22023', message: 'time zone not recognized' } }, { data: okData, error: null }]);
      await getAiUsageMonth(sb, 7, 's', tz);
      expect(calls.map((c) => c.args.p_tz)).toEqual([tz, 'UTC']);
    }
  });

  it('isUnknownTimeZoneError: sin código pero con el mensaje de Postgres → true; PGRST202 → false; null → false', () => {
    expect(isUnknownTimeZoneError({ message: 'time zone "Marte/Fobos" not recognized' })).toBe(true);
    expect(isUnknownTimeZoneError({ code: 'PGRST202', message: 'Could not find the function' })).toBe(false);
    expect(isUnknownTimeZoneError(null)).toBe(false);
    expect(isUnknownTimeZoneError({ code: '22023', message: 'invalid value' })).toBe(false);
  });
});

describe('isSupportedTimeZone — lo que se puede ESCRIBIR en organizations.timezone', () => {
  it('acepta las 7 opciones del selector, UTC y un nombre canónico; rechaza alias, abreviaturas, minúsculas, vacío, >64 chars y no-string', () => {
    for (const ok of ['America/Bogota', 'America/Mexico_City', 'America/Lima', 'America/Buenos_Aires', 'America/Santiago', 'America/New_York', 'Europe/Madrid', 'UTC']) {
      expect(isSupportedTimeZone(ok)).toBe(true);
    }
    for (const bad of ['US/Eastern', 'EST', 'america/bogota', 'Marte/Fobos', '', ' America/Bogota', 'A'.repeat(65), 5, null, undefined, {}]) {
      expect(isSupportedTimeZone(bad)).toBe(false);
    }
  });

  // HUECO (bajo): `Intl.supportedValuesOf('timeZone')` devuelve los nombres
  // canónicos de ICU, no los de IANA. En Node 22 (ICU 76) lista
  // `America/Buenos_Aires` y `Asia/Calcutta`, y NO `America/Argentina/Buenos_Aires`
  // ni `Asia/Kolkata`, que son los canónicos de IANA y los que Postgres
  // prefiere. El selector actual (7 opciones) no lo pisa; un selector más
  // amplio o un valor tecleado sí. Pasa a verde cuando el helper acepte
  // también los canónicos de IANA (p. ej. resolviendo con
  // `Intl.DateTimeFormat(...).resolvedOptions().timeZone`).
  it.failing('HUECO: el nombre canónico IANA America/Argentina/Buenos_Aires se rechaza aunque Postgres lo reconozca', () => {
    expect(isSupportedTimeZone('America/Argentina/Buenos_Aires')).toBe(true);
  });
});

// ───────────── 4. QA r2 punto 4: simetría del reembolso ─────────────

describe('QA r2 punto 4 — refundAiCredits', () => {
  it('-0 y 0 → true sin RPC (nada que devolver); -Infinity y -0.4 → RangeError sin RPC', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(refundAiCredits({ orgId: 7, credits: 0, actionType: 'x' })).resolves.toBe(true);
    await expect(refundAiCredits({ orgId: 7, credits: -0, actionType: 'x' })).resolves.toBe(true);
    await expect(refundAiCredits({ orgId: 7, credits: -Infinity, actionType: 'x' })).rejects.toBeInstanceOf(RangeError);
    await expect(refundAiCredits({ orgId: 7, credits: -0.4, actionType: 'x' })).rejects.toBeInstanceOf(RangeError);
    expect(calls.filter((c) => c.type === 'rpc')).toHaveLength(0);
  });

  it('la RPC devuelve false (p. ej. sin fila) → false, sin fila :refund y sin marcar el logId como reembolsado (un reintento vuelve a intentarlo)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { sb, calls } = fakeDb({ refundRpc: () => ({ data: false, error: null }) });
    __setAiCostClientFactory(() => sb);
    await expect(refundAiCredits({ orgId: 7, credits: 3, actionType: 'x', logId: 77 })).resolves.toBe(false);
    await expect(refundAiCredits({ orgId: 7, credits: 3, actionType: 'x', logId: 77 })).resolves.toBe(false);
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'refund_ai_credits')).toHaveLength(2);
    expect(calls.filter((c) => c.type === 'insert' && c.name === 'ai_usage_logs')).toHaveLength(0);
  });

  it('con logId, el segundo reembolso del mismo cobro no llama a la RPC (memoria) aunque previousBalance cambie', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await refundAiCredits({ orgId: 7, credits: 3, actionType: 'x', logId: 78, previousBalance: 100 });
    await refundAiCredits({ orgId: 7, credits: 3, actionType: 'x', logId: 78, previousBalance: 999 });
    const rpcs = calls.filter((c) => c.type === 'rpc' && c.name === 'refund_ai_credits');
    expect(rpcs).toHaveLength(1);
    expect(rpcs[0].args).toEqual({ p_org_id: 7, p_amount: 3, p_previous: 100 });
  });
});

// ───────────── 5. Bordes del cobro ─────────────

describe('chargeAiCredits — bordes de importe', () => {
  it('units negativas → RangeError antes de leer precio y sin RPC', async () => {
    const { sb, calls } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(charge({ units: -1, credits: undefined, unitSku: 'sku' })).rejects.toBeInstanceOf(RangeError);
    expect(calls).toHaveLength(0);
  });

  it('DOCUMENTADO (bajo): credits 0.4 se redondea a 0 → el RPC recibe p_cost 0 (true, no-op) y la llamada sale gratis con log de 0 créditos', async () => {
    const { sb, calls, state } = fakeDb();
    __setAiCostClientFactory(() => sb);
    const out = await charge({ credits: 0.4 });
    expect(out.credits).toBe(0);
    expect(calls.find((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')!.args.p_cost).toBe(0);
    expect(state.row!.credits_remaining).toBe(90);
    expect(calls.find((c) => c.type === 'insert' && c.name === 'ai_usage_logs')!.args.credits_consumed).toBe(0);
  });

  it('el RPC de cobro falla con un error que no es «sin fila» → Error (500 controlado por la ruta), nunca 402 disfrazado', async () => {
    const { sb } = fakeDb();
    sb.rpc = async () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    __setAiCostClientFactory(() => sb);
    await expect(charge()).rejects.toThrow(/decrement_ai_credits falló: canceling statement/);
  });
});

describe('rowCostUsd — columna basura', () => {
  it('columna "abc" (no numérica) → cae a metadata.cost_amount numérico; columna "0.25" → 0.25; ambas ausentes → 0', () => {
    expect(rowCostUsd({ cost_amount: 'abc', metadata: { cost_amount: 1.5 } })).toBe(1.5);
    expect(rowCostUsd({ cost_amount: '0.25', metadata: { cost_amount: 9 } })).toBe(0.25);
    expect(rowCostUsd({ cost_amount: null, metadata: null })).toBe(0);
    expect(rowCostUsd({ metadata: { cost_amount: '9.99' } })).toBe(0);
  });
});
