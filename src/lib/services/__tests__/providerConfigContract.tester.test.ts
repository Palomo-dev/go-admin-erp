/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tester F0 (REG r1) — contrato del registry de proveedores y del cobro de créditos.
 *
 * Los casos `test.failing` documentan huecos detectados en la ronda 1: pasan
 * mientras el hueco exista y FALLAN cuando alguien lo corrija (entonces hay que
 * convertirlos en `it` normales). Ver scratchpad/reports/TEST-REG-0-r1.md.
 */

import { isPlaceholderCredential, hasRequiredCredentials, CREDENTIAL_FIELDS } from '@/lib/crm/providerCatalog';
import {
  upsertProviderConfig,
  getProviderCredentials,
  listProviderConfigsSafe,
  ProviderValidationError,
  __setProviderCredentialsClient,
} from '@/lib/services/providerCredentials.server';
import { chargeAiCredits, refundAiCredits, __setAiCostClientFactory } from '@/lib/services/crm/aiCostService';
import { __setPricingClientFactory, clearPricingCache } from '@/lib/services/crm/pricingService';

// ───────────────────────────── fakes ─────────────────────────────

interface Op { kind: string; table?: string; args?: any }

/** Cliente mínimo para provider_configs (select/maybeSingle/upsert/rpc). */
function fakeProviderDb(rows: any[], opts: { selectError?: string } = {}) {
  const ops: Op[] = [];
  const state = { rows: [...rows] };
  const sb: any = {
    rpc: async (name: string, args: any) => {
      ops.push({ kind: 'rpc', table: name, args });
      return { data: 0, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const matching = () =>
        state.rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filters[c] = v;
          return q;
        },
        order: () => q,
        then: (res: any) =>
          res(opts.selectError ? { data: null, error: { message: opts.selectError } } : { data: matching(), error: null }),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        upsert: (payload: any, o: any) => {
          ops.push({ kind: 'upsert', table, args: { payload, onConflict: o?.onConflict } });
          const idx = state.rows.findIndex(
            (r) => r.organization_id === payload.organization_id && r.category === payload.category && r.provider === payload.provider,
          );
          const row = { id: idx >= 0 ? state.rows[idx].id : 'new-id', ...payload };
          if (idx >= 0) state.rows[idx] = row;
          else state.rows.push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
      };
      return q;
    },
  };
  return { sb, ops, state };
}

function fakeCostDb(prices: Record<string, number>, rpcResult = true) {
  const ops: Op[] = [];
  const sb: any = {
    rpc: async (name: string, args: any) => {
      ops.push({ kind: 'rpc', table: name, args });
      return { data: rpcResult, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: any = {
        insert: (row: any) => {
          ops.push({ kind: 'insert', table, args: row });
          return {
            select: () => ({ single: async () => ({ data: { id: 1 }, error: null }) }),
            then: (r: any) => r({ data: null, error: null }),
          };
        },
        select: () => q,
        eq: (c: string, v: unknown) => {
          filters[c] = v;
          return q;
        },
        lte: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () => {
          const p = prices[`${filters.provider}:${filters.sku}`];
          return { data: p != null ? { unit_cost_usd: p, valid_from: '2026-01-01' } : null, error: null };
        },
      };
      return q;
    },
  };
  return { sb, ops };
}

const ENV_KEYS = ['OPENAI_API_KEY', 'GOOGLE_AI_API_KEY', 'GEMINI_API_KEY', 'ELEVENLABS_API_KEY', 'DEEPGRAM_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MASTER_ACCOUNT_SID', 'TWILIO_MASTER_AUTH_TOKEN', 'RESEND_API_KEY'];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  clearPricingCache();
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __setProviderCredentialsClient(null);
  __setAiCostClientFactory(null);
  __setPricingClientFactory(null);
});

// ───────────────────────── placeholders ─────────────────────────

describe('isPlaceholderCredential — bordes', () => {
  it.each([
    ['your-', true],
    ['sk-your', true],
    ['sk-your-openai-key', true],
    ['ACyour-account-sid', true],
    ['SKyour-api-key', true],
    ['re_your-resend-key', true],
    ['whsec_your-webhook-secret', true],
    ['MGyour-messaging-service-sid', true],
    ['', true],
    ['   ', true],
    ['YOUR-KEY', true],
    [undefined, true],
    [null, true],
    [12345, true],
    ['sk-proj-Abc123XYZ_realkey_0000000000000000000000', false],
    ['AC0123456789abcdef0123456789abcdef', false],
    ['re_AbCdEf123456789', false],
    ['+573001234567', false],
  ])('%p → %p', (value, expected) => {
    expect(isPlaceholderCredential(value)).toBe(expected);
  });

  it('una clave real corta que contiene "your-" se marca como placeholder (falso positivo documentado)', () => {
    // < 48 caracteres y contiene "your-": la heurística la descarta aunque sea real.
    expect(isPlaceholderCredential('tok-myour-secret-123')).toBe(true);
  });

  it('hasRequiredCredentials: twilio exige SID+token; meta exige token+phone_number_id', () => {
    expect(hasRequiredCredentials('twilio', { TWILIO_ACCOUNT_SID: 'AC0123456789abcdef0123456789abcdef' })).toBe(false);
    expect(hasRequiredCredentials('twilio', { TWILIO_ACCOUNT_SID: 'AC0123456789abcdef0123456789abcdef', TWILIO_AUTH_TOKEN: 'tok_real_0123456789' })).toBe(true);
    expect(hasRequiredCredentials('meta', { META_ACCESS_TOKEN: 'EAAB_real' })).toBe(false);
    expect(hasRequiredCredentials('meta', { META_ACCESS_TOKEN: 'EAAB_real', META_PHONE_NUMBER_ID: '1234567890' })).toBe(true);
  });
});

// ───────────────────────── upsert / validación ─────────────────────────

describe('upsertProviderConfig — validación contra catálogo', () => {
  it('422 si el proveedor no está soportado en la categoría', async () => {
    const { sb } = fakeProviderDb([]);
    __setProviderCredentialsClient(sb);
    await expect(upsertProviderConfig(7, { category: 'llm', provider: 'anthropic' })).rejects.toBeInstanceOf(ProviderValidationError);
    await expect(upsertProviderConfig(7, { category: 'voice', provider: 'meta' })).rejects.toBeInstanceOf(ProviderValidationError);
  });

  it('422 si una clave de credencial no pertenece al proveedor', async () => {
    const { sb, ops } = fakeProviderDb([]);
    __setProviderCredentialsClient(sb);
    await expect(
      upsertProviderConfig(7, { category: 'llm', provider: 'openai', credentials: { RESEND_API_KEY: 're_AbCdEf123456789' } }),
    ).rejects.toThrow(/no válida/);
    expect(ops.filter((o) => o.kind === 'upsert')).toHaveLength(0);
  });

  it('null / vacío / placeholder borran la clave; los valores reales se recortan', async () => {
    const { sb, ops } = fakeProviderDb([
      { id: 'r1', organization_id: 7, category: 'voice', provider: 'twilio', credentials: { TWILIO_ACCOUNT_SID: 'AC0123456789abcdef0123456789abcdef', TWILIO_AUTH_TOKEN: 'tok_real_0123456789', TWILIO_API_KEY: 'SK0123456789abcdef0123456789abcdef' }, settings: { recording_channels: 'dual' }, is_active: true, priority: 10 },
    ]);
    __setProviderCredentialsClient(sb);
    const item = await upsertProviderConfig(7, {
      category: 'voice',
      provider: 'twilio',
      credentials: { TWILIO_AUTH_TOKEN: null, TWILIO_API_KEY: '', TWILIO_API_SECRET: '  secret_real_0123456789  ', TWILIO_PHONE_NUMBER: 'your-phone' },
    });
    const payload = ops.find((o) => o.kind === 'upsert')!.args.payload;
    expect(payload.credentials).toEqual({ TWILIO_ACCOUNT_SID: 'AC0123456789abcdef0123456789abcdef', TWILIO_API_SECRET: 'secret_real_0123456789' });
    expect(ops.find((o) => o.kind === 'upsert')!.args.onConflict).toBe('organization_id,category,provider');
    // Shape seguro: sin valores
    expect(JSON.stringify(item)).not.toContain('secret_real');
    expect(item.credential_keys.sort()).toEqual(['TWILIO_ACCOUNT_SID', 'TWILIO_API_SECRET']);
    expect(item.configured).toBe(false); // falta TWILIO_AUTH_TOKEN (required)
  });

  it('settings se fusionan con los existentes (no se pierden claves previas)', async () => {
    const { sb, ops } = fakeProviderDb([
      { id: 'r1', organization_id: 7, category: 'llm', provider: 'openai', credentials: {}, settings: { model: 'gpt-5.6-luna', monthly_budget_usd: 50 }, is_active: true, priority: 10 },
    ]);
    __setProviderCredentialsClient(sb);
    await upsertProviderConfig(7, { category: 'llm', provider: 'openai', settings: { monthly_budget_usd: 120 } });
    expect(ops.find((o) => o.kind === 'upsert')!.args.payload.settings).toEqual({ model: 'gpt-5.6-luna', monthly_budget_usd: 120 });
  });

  // HUECO #1: settings no se validan contra SETTING_FIELDS (tipo/opciones/claves).
  test.failing('HUECO: settings con tipo inválido o clave desconocida deberían rechazarse (422)', async () => {
    const { sb } = fakeProviderDb([]);
    __setProviderCredentialsClient(sb);
    await expect(
      upsertProviderConfig(7, { category: 'llm', provider: 'openai', settings: { monthly_budget_usd: 'abc', conversation_model: 'gpt-3', foo: { bar: 1 } } }),
    ).rejects.toBeInstanceOf(ProviderValidationError);
  });

  // HUECO #2: mobileBridgeService/voiceAgentService leen TWILIO_SUBACCOUNT_SID/AUTH_TOKEN
  // de provider.credentials, pero el catálogo no permite guardarlas (422).
  test.failing('HUECO: las claves TWILIO_SUBACCOUNT_* que leen los consumidores no existen en el catálogo', async () => {
    expect(CREDENTIAL_FIELDS.twilio.map((f) => f.key)).toEqual(expect.arrayContaining(['TWILIO_SUBACCOUNT_SID', 'TWILIO_SUBACCOUNT_AUTH_TOKEN']));
  });
});

// ───────────────────────── resolución de credenciales ─────────────────────────

describe('getProviderCredentials — resolución org → env → none', () => {
  it('fila seed (credenciales vacías) + env real → source env con settings de la fila', async () => {
    process.env.OPENAI_API_KEY = 'sk-proj-Abc123XYZ_realkey_0000000000000000000000';
    const { sb } = fakeProviderDb([
      { id: 'r1', organization_id: 7, category: 'llm', provider: 'openai', credentials: {}, settings: { monthly_budget_usd: 50, model: 'gpt-5.6-luna' }, is_active: true, priority: 10 },
    ]);
    __setProviderCredentialsClient(sb);
    const cfg = await getProviderCredentials(7, 'llm');
    expect(cfg.source).toBe('env');
    expect(cfg.provider).toBe('openai');
    expect(cfg.credentials.OPENAI_API_KEY).toBe(process.env.OPENAI_API_KEY);
    expect(cfg.settings.monthly_budget_usd).toBe(50);
    expect(cfg.settings.conversation_model).toBe('gpt-5.6-terra'); // default fusionado
  });

  it('fila con placeholder guardado en BD NO cuenta como clave propia', async () => {
    process.env.OPENAI_API_KEY = 'sk-proj-Abc123XYZ_realkey_0000000000000000000000';
    const { sb } = fakeProviderDb([
      { id: 'r1', organization_id: 7, category: 'llm', provider: 'openai', credentials: { OPENAI_API_KEY: 'sk-your-openai-key' }, settings: {}, is_active: true, priority: 10 },
    ]);
    __setProviderCredentialsClient(sb);
    const cfg = await getProviderCredentials(7, 'llm');
    expect(cfg.source).toBe('env');
    expect(cfg.credentials.OPENAI_API_KEY).not.toBe('sk-your-openai-key');
  });

  it('filas inactivas se ignoran; sin env → none/inactivo', async () => {
    const { sb } = fakeProviderDb([
      { id: 'r1', organization_id: 7, category: 'llm', provider: 'openai', credentials: { OPENAI_API_KEY: 'sk-proj-Abc123XYZ_realkey_0000000000000000000000' }, settings: {}, is_active: false, priority: 10 },
    ]);
    __setProviderCredentialsClient(sb);
    const cfg = await getProviderCredentials(7, 'llm');
    expect(cfg.isActive).toBe(false);
    expect(cfg.provider).toBe('none');
    expect(cfg.credentials).toEqual({});
  });

  it('fila propia elevenlabs sin clave + env solo con GOOGLE → stt cae a google (env)', async () => {
    process.env.GOOGLE_AI_API_KEY = 'AIzaSy_real_key_0123456789';
    const { sb } = fakeProviderDb([
      { id: 'r1', organization_id: 7, category: 'stt', provider: 'elevenlabs', credentials: {}, settings: { model_id: 'scribe_v2' }, is_active: true, priority: 10 },
    ]);
    __setProviderCredentialsClient(sb);
    const cfg = await getProviderCredentials(7, 'stt');
    expect(cfg.provider).toBe('google');
    expect(cfg.source).toBe('env');
  });

  it('error de lectura en BD → fallback env sin lanzar', async () => {
    process.env.RESEND_API_KEY = 're_AbCdEf123456789';
    const { sb } = fakeProviderDb([], { selectError: 'permission denied' });
    __setProviderCredentialsClient(sb);
    const cfg = await getProviderCredentials(7, 'email');
    expect(cfg.provider).toBe('resend');
    expect(cfg.source).toBe('env');
  });

  it('listProviderConfigsSafe nunca expone valores y siembra si no hay filas', async () => {
    const { sb, ops } = fakeProviderDb([]);
    __setProviderCredentialsClient(sb);
    const items = await listProviderConfigsSafe(7);
    expect(ops.some((o) => o.kind === 'rpc' && o.table === 'fn_seed_provider_configs')).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(12);
    expect(JSON.stringify(items)).not.toMatch(/"credentials"/);
  });
});

// ───────────────────────── costos ─────────────────────────

describe('aiCostService — contrato de unidades y reembolso', () => {
  it('cobra ANTES de registrar el log y persiste metadata.cost_amount', async () => {
    const { sb, ops } = fakeCostDb({ 'openai:gpt_5_6_luna_in': 0.2 });
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);
    const r = await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'gpt-5.6-luna', units: 0.003, unitSku: 'gpt_5_6_luna_in', provider: 'openai' });
    expect(ops[0]).toMatchObject({ kind: 'rpc', table: 'decrement_ai_credits', args: { p_org_id: 7, p_cost: 1 } });
    const log = ops.find((o) => o.kind === 'insert' && o.table === 'ai_usage_logs')!;
    expect(log.args.metadata.cost_amount).toBeCloseTo(0.0006, 6);
    expect(r.cost_amount).toBeCloseTo(0.0006, 6);
  });

  // HUECO #3: `units` se multiplica directo por unit_cost_usd (unidad token_1m_in).
  // Un llamador que pase tokens crudos (aiDraftService: units 3000) registra $600.
  test.failing('HUECO: units en tokens crudos con sku por 1M tokens debería costar centavos, no $600', async () => {
    const { sb } = fakeCostDb({ 'openai:gpt_5_6_luna_in': 0.2 });
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);
    const r = await chargeAiCredits({ orgId: 7, actionType: 'email_draft', model: 'gpt-5.6-luna', units: 3000, unitSku: 'gpt_5_6_luna_in', provider: 'openai', credits: 1 });
    expect(r.cost_amount!).toBeLessThan(1);
  });

  // HUECO #4: total_tokens se calcula como round(units); con units en millones queda 0.
  test.failing('HUECO: total_tokens del log debería reflejar tokens reales cuando units va en millones', async () => {
    const { sb, ops } = fakeCostDb({ 'openai:gpt_5_6_luna_in': 0.2 });
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);
    await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'gpt-5.6-luna', units: 0.003, unitSku: 'gpt_5_6_luna_in', provider: 'openai' });
    const log = ops.find((o) => o.kind === 'insert' && o.table === 'ai_usage_logs')!;
    expect(log.args.total_tokens).toBe(3000);
  });

  // HUECO #5: el reembolso no está acotado al cargo original (RPC acepta negativos sin tope).
  test.failing('HUECO: refundAiCredits no debería permitir reembolsar más de lo cargado', async () => {
    const { sb } = fakeCostDb({});
    __setAiCostClientFactory(() => sb);
    const ok = await refundAiCredits({ orgId: 7, credits: 1_000_000, actionType: 'x', logId: 1 });
    expect(ok).toBe(false);
  });

  // Actualizado 2026-09-09: el reembolso dejó de apoyarse en el importe negativo
  // de `decrement_ai_credits` (efecto lateral no declarado) y usa la RPC dedicada
  // `refund_ai_credits(p_org_id, p_amount)` creada en DB r3, que bloquea la fila
  // con FOR UPDATE y acota la suma al cupo del plan.
  it('refundAiCredits usa la RPC dedicada refund_ai_credits con importe positivo', async () => {
    const { sb, ops } = fakeCostDb({});
    __setAiCostClientFactory(() => sb);
    await refundAiCredits({ orgId: 7, credits: 3, actionType: 'x' });
    expect(ops[0]).toMatchObject({ kind: 'rpc', table: 'refund_ai_credits', args: { p_org_id: 7, p_amount: 3 } });
  });
});
