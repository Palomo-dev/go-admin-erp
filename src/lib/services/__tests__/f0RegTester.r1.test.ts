/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tester F0-REG — ronda 1 (2026-09-15). Casos borde que NO cubrían las suites
 * del builder ni el tester parcial de 2026-09-08.
 *
 * Convención: los `it.failing` documentan huecos abiertos (pasan mientras el
 * hueco exista; cuando alguien lo corrija fallarán y hay que pasarlos a `it`).
 * Informe: docs/crm-revenue-os/rondas/F0-REG-tester-r1.md
 *
 * Ronda 2 del builder (2026-09-15): los 9 `it.failing` pasaron a `it` al
 * cerrarse cada hueco; los casos «documenta el comportamiento actual» se
 * invirtieron para consagrar el comportamiento corregido. Los `it` cuyo
 * contrato cambió llevan nota «QA r1».
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { isPlaceholderCredential, SETTING_FIELDS } from '@/lib/crm/providerCatalog';
import { buildEnvFallbacks, resolveEnvFallback, type ProviderCategory } from '@/lib/services/providerRegistry';
import {
  getProviderCredentials,
  upsertProviderConfig,
  ProviderValidationError,
  __setProviderCredentialsClient,
} from '@/lib/services/providerCredentials.server';
import {
  chargeAiCredits,
  refundAiCredits,
  withAiCharge,
  InsufficientCreditsError,
  __setAiCostClientFactory,
} from '@/lib/services/crm/aiCostService';
import { getUnitCost, __setPricingClientFactory, clearPricingCache } from '@/lib/services/crm/pricingService';

// ───────────────────────────── fakes ─────────────────────────────

interface Op { kind: string; table?: string; args?: any }

function fakeCostDb(opts: { rpc?: (name: string, args: any) => { data: any; error: any } } = {}) {
  const ops: Op[] = [];
  const sb: any = {
    rpc: async (name: string, args: any) => {
      ops.push({ kind: 'rpc', table: name, args });
      return opts.rpc ? opts.rpc(name, args) : { data: true, error: null };
    },
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: any = {
        insert: (row: any) => {
          ops.push({ kind: 'insert', table, args: row });
          return {
            select: () => ({ single: async () => ({ data: { id: 11 }, error: null }) }),
            then: (r: any) => r({ data: null, error: null }),
          };
        },
        select: () => q,
        eq: (c: string, v: unknown) => { filters[c] = v; return q; },
        lte: () => q, or: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: { unit_cost_usd: 0.5, valid_from: '2026-01-01' }, error: null }),
      };
      return q;
    },
  };
  return { sb, ops };
}

function fakeProviderDb(rows: any[]) {
  const state = { rows: [...rows] };
  const sb: any = {
    rpc: async () => ({ data: 0, error: null }),
    from: () => {
      const filters: Record<string, unknown> = {};
      const matching = () => state.rows.filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v));
      const q: any = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters[c] = v; return q; },
        order: () => q,
        then: (res: any) => res({ data: matching(), error: null }),
        maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
        upsert: (payload: any) => {
          const row = { id: 'id-1', ...payload };
          state.rows.push(row);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
      };
      return q;
    },
  };
  return { sb, state };
}

const ALL_ENV_KEYS = Array.from(
  new Set(
    Object.values(buildEnvFallbacks()).flatMap((byProv) => Object.values(byProv).flatMap((creds) => Object.keys(creds))),
  ),
).concat(['GEMINI_API_KEY', 'TWILIO_MASTER_ACCOUNT_SID', 'TWILIO_MASTER_AUTH_TOKEN', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_APP_SECRET']);
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ALL_ENV_KEYS) { saved[k] = process.env[k]; delete process.env[k]; }
  clearPricingCache();
});
afterEach(() => {
  for (const k of ALL_ENV_KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  __setProviderCredentialsClient(null);
  __setAiCostClientFactory(null);
  __setPricingClientFactory(null);
});

// ───────────────────── 1. .env.example nunca "configura" nada ─────────────────────

function parseEnvExample(): Record<string, string> {
  const txt = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
  const out: Record<string, string> = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

describe('.env.example → registry', () => {
  it('todo valor de ejemplo de una clave del registry se detecta como placeholder', () => {
    const env = parseEnvExample();
    const present = ALL_ENV_KEYS.filter((k) => k in env);
    expect(present.length).toBeGreaterThan(5);
    const leaks = present.filter((k) => !isPlaceholderCredential(env[k]));
    expect(leaks).toEqual([]);
  });

  it('con .env.example cargado tal cual, ninguna categoría queda activa', () => {
    const env = parseEnvExample();
    for (const k of ALL_ENV_KEYS) if (k in env) process.env[k] = env[k];
    const cats = Object.keys(buildEnvFallbacks()) as ProviderCategory[];
    const active = cats.filter((c) => resolveEnvFallback(c).isActive);
    expect(active).toEqual([]);
  });

  it('las variables del registry que .env.example NO documenta quedan listadas (revisión manual)', () => {
    const env = parseEnvExample();
    const missing = ALL_ENV_KEYS.filter((k) => !(k in env));
    // Se acepta que existan alias (*_MASTER_*, GEMINI_API_KEY, WHATSAPP_*); lo
    // importante es que las claves canónicas del catálogo estén documentadas.
    // Meta/WhatsApp se documenta con los alias WHATSAPP_* (el registry los lee primero).
    const canonical = ['OPENAI_API_KEY', 'GOOGLE_AI_API_KEY', 'ELEVENLABS_API_KEY', 'RESEND_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'];
    expect(canonical.filter((k) => missing.includes(k))).toEqual([]);
  });
});

// ───────────────────── 2. Placeholders: bordes ─────────────────────

describe('isPlaceholderCredential — bordes no cubiertos', () => {
  it('claves reales con rachas largas de un mismo carácter siguen siendo reales', () => {
    expect(isPlaceholderCredential('sk-proj-AbC123xyz0000000000')).toBe(false);
    expect(isPlaceholderCredential(['AC', '0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c'].join(''))).toBe(false);
  });
  it('rellenos con prefijo largo (whsec_, re_) se detectan', () => {
    expect(isPlaceholderCredential('whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    expect(isPlaceholderCredential('re_xxxxxxxxxxxxxxxx')).toBe(true);
    expect(isPlaceholderCredential('0000000000000000')).toBe(true);
  });
  it('un relleno corto ("0000", "xxxx") ya no pasa por credencial real (QA r1 bajo 18)', () => {
    expect(isPlaceholderCredential('0000')).toBe(true);
    expect(isPlaceholderCredential('xxxx')).toBe(true);
  });
});

// ───────────────────── 3. Resolución org → env ─────────────────────

describe('getProviderCredentials — prioridad entre proveedores', () => {
  it('la clave PROPIA de la org (prioridad 20) gana al fallback env de otro proveedor sembrado con prioridad 10 (QA r1 medio 8)', async () => {
    process.env.GOOGLE_AI_API_KEY = 'AIzaRealKeyForPlatform1234567890';
    const { sb } = fakeProviderDb([
      { id: 'a', organization_id: 7, category: 'llm', provider: 'google', credentials: {}, settings: {}, is_active: true, priority: 10 },
      { id: 'b', organization_id: 7, category: 'llm', provider: 'openai', credentials: { OPENAI_API_KEY: 'sk-proj-real-key-of-org-7-abcdef' }, settings: {}, is_active: true, priority: 20 },
    ]);
    __setProviderCredentialsClient(sb);
    const cfg = await getProviderCredentials(7, 'llm');
    // FASE-00 §2.4: "fila propia de la org (credenciales reales) → fallback env".
    expect(cfg.source).toBe('org');
    expect(cfg.provider).toBe('openai');
  });

  it('sin fila propia y sin env → none/inactivo, sin lanzar', async () => {
    const { sb } = fakeProviderDb([]);
    __setProviderCredentialsClient(sb);
    const cfg = await getProviderCredentials(7, 'tts');
    expect(cfg).toMatchObject({ provider: 'none', isActive: false, source: 'none', credentials: {} });
  });
});

describe('upsertProviderConfig — settings', () => {
  it('settings se validan contra SETTING_FIELDS: un modelo inexistente se rechaza con 422 (QA r1 medio 9)', async () => {
    const { sb } = fakeProviderDb([]);
    __setProviderCredentialsClient(sb);
    const opts = SETTING_FIELDS['llm:openai']!.find((f) => f.key === 'conversation_model')!.options!;
    expect(opts).not.toContain('gpt-99-inventado');
    await expect(
      upsertProviderConfig(7, { category: 'llm', provider: 'openai', settings: { conversation_model: 'gpt-99-inventado' } }),
    ).rejects.toBeInstanceOf(ProviderValidationError);
  });

  it('settings inválidas por tipo se rechazan y no se guarda nada (QA r1 medio 9)', async () => {
    const { sb, state } = fakeProviderDb([]);
    __setProviderCredentialsClient(sb);
    await expect(
      upsertProviderConfig(7, { category: 'llm', provider: 'openai', settings: { monthly_budget_usd: 'mucho' } }),
    ).rejects.toBeInstanceOf(ProviderValidationError);
    await expect(
      upsertProviderConfig(7, { category: 'llm', provider: 'openai', settings: { clave_desconocida: 1 } }),
    ).rejects.toBeInstanceOf(ProviderValidationError);
    await expect(
      upsertProviderConfig(7, { category: 'llm', provider: 'openai', settings: { monthly_budget_usd: 999999 } }),
    ).rejects.toBeInstanceOf(ProviderValidationError);
    expect(state.rows).toHaveLength(0);
    // Valores válidos: número (también como string numérico) y null para borrar.
    const item = await upsertProviderConfig(7, { category: 'llm', provider: 'openai', settings: { monthly_budget_usd: '25', conversation_model: 'gpt-5.6-luna' } });
    expect(item.settings.monthly_budget_usd).toBe(25);
    expect(item.settings.conversation_model).toBe('gpt-5.6-luna');
  });
});

// ───────────────────── 4. Créditos IA: bordes del cobro ─────────────────────

describe('chargeAiCredits — entradas inválidas', () => {
  it('units NaN se rechaza con RangeError ANTES del RPC (QA r1 alto 3)', async () => {
    const { sb, ops } = fakeCostDb();
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'gpt-5.6-luna', units: Number.NaN })).rejects.toBeInstanceOf(RangeError);
    expect(ops.filter((o) => o.kind === 'rpc')).toHaveLength(0);
  });

  it('credits NaN explícito también se rechaza antes del RPC (QA r1 alto 3)', async () => {
    const { sb, ops } = fakeCostDb();
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 10, credits: Number.NaN })).rejects.toBeInstanceOf(RangeError);
    expect(ops.filter((o) => o.kind === 'rpc')).toHaveLength(0);
  });

  // QA r1 instrucción 2: un importe negativo ya no se recorta a 0 en silencio;
  // es un error de programación del llamador y se rechaza antes del RPC.
  it('credits negativos se rechazan con RangeError sin tocar el RPC (no se abona por la puerta de atrás)', async () => {
    const { sb, ops } = fakeCostDb();
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 10, credits: -50 })).rejects.toBeInstanceOf(RangeError);
    expect(ops.filter((o) => o.kind === 'rpc')).toHaveLength(0);
  });

  it('org sin fila ai_settings (RPC anterior a la mig. 39: excepción) → InsufficientCreditsError 402, no 500 (QA r1 alto 4)', async () => {
    const { sb } = fakeCostDb({ rpc: () => ({ data: null, error: { message: 'ai_settings no encontrada para organization_id 7' } }) });
    __setAiCostClientFactory(() => sb);
    let caught: unknown;
    try { await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 10 }); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(InsufficientCreditsError);
  });

  it('la columna real ai_usage_logs.cost_amount se rellena además de metadata.cost_amount (QA r1 alto 5)', async () => {
    const { sb, ops } = fakeCostDb();
    __setAiCostClientFactory(() => sb);
    __setPricingClientFactory(() => sb);
    await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'gpt-5.6-luna', units: 2, unitSku: 'gpt_5_6_luna_in' });
    const log = ops.find((o) => o.kind === 'insert' && o.table === 'ai_usage_logs')!;
    expect(log.args.cost_amount).toBeCloseTo(1, 6);
    expect(log.args.metadata.cost_amount).toBeCloseTo(1, 6);
  });

  it('si el insert del log devuelve error (sin lanzar), el cobro se mantiene y logId es null', async () => {
    const { sb, ops } = fakeCostDb();
    sb.from = (table: string) => ({
      insert: (row: any) => {
        ops.push({ kind: 'insert', table, args: row });
        return { select: () => ({ single: async () => ({ data: null, error: { message: 'column x does not exist' } }) }) };
      },
    });
    __setAiCostClientFactory(() => sb);
    const r = await chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 10, credits: 2 });
    expect(r.logId).toBeNull();
    expect(ops.filter((o) => o.kind === 'rpc')).toHaveLength(1);
  });
});

describe('refundAiCredits — idempotencia', () => {
  it('dos reembolsos del mismo logId abonan una sola vez (idempotente por refunded_log_id, QA r1 medio 10)', async () => {
    const { sb, ops } = fakeCostDb();
    __setAiCostClientFactory(() => sb);
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x', logId: 42 });
    await refundAiCredits({ orgId: 7, credits: 5, actionType: 'x', logId: 42 });
    expect(ops.filter((o) => o.kind === 'rpc' && o.table === 'refund_ai_credits')).toHaveLength(1);
  });

  it('reembolso con créditos negativos no llama al RPC (no debita disfrazado)', async () => {
    const { sb, ops } = fakeCostDb();
    __setAiCostClientFactory(() => sb);
    expect(await refundAiCredits({ orgId: 7, credits: -5, actionType: 'x' })).toBe(true);
    expect(ops).toHaveLength(0);
  });

  it('withAiCharge: si el proveedor falla con algo que no es Error, igual reembolsa', async () => {
    const { sb, ops } = fakeCostDb();
    __setAiCostClientFactory(() => sb);
    await expect(withAiCharge({ orgId: 7, actionType: 'x', model: 'm', units: 10, credits: 3 }, async () => { throw 'string-error'; })).rejects.toBe('string-error');
    const refund = ops.find((o) => o.kind === 'rpc' && o.table === 'refund_ai_credits');
    expect(refund?.args).toEqual({ p_org_id: 7, p_amount: 3 });
  });
});

// ───────────────────── 5. Pricing ─────────────────────

describe('pricingService — vigencia', () => {
  it('la consulta de precios aplica valid_to (precio vencido deja de estar vigente, QA r1 medio 16)', async () => {
    const chain: string[] = [];
    const sb: any = {
      from: () => {
        const q: any = new Proxy({}, {
          get: (_t, prop: string) => {
            if (prop === 'maybeSingle') return async () => ({ data: { unit_cost_usd: 9, valid_from: '2025-01-01' }, error: null });
            if (prop === 'then') return undefined;
            return (...args: unknown[]) => { chain.push(`${prop}(${args.map(String).join(',')})`); return q; };
          },
        });
        return q;
      },
    };
    __setPricingClientFactory(() => sb);
    await getUnitCost('openai', 'sku_x');
    expect(chain.some((c) => c.includes('valid_to'))).toBe(true);
  });

  it('un error transitorio de la BD NO se cachea: la siguiente llamada vuelve a preguntar (QA r1 bajo 18)', async () => {
    let calls = 0;
    const sb: any = {
      from: () => {
        const q: any = { select: () => q, eq: () => q, lte: () => q, or: () => q, order: () => q, limit: () => q,
          maybeSingle: async () => { calls += 1; return calls === 1 ? { data: null, error: { message: 'timeout' } } : { data: { unit_cost_usd: 1 }, error: null }; } };
        return q;
      },
    };
    __setPricingClientFactory(() => sb);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getUnitCost('openai', 'sku_y')).toBeNull();
    expect(await getUnitCost('openai', 'sku_y')).toBe(1); // la BD ya responde y el valor se toma
    expect(await getUnitCost('openai', 'sku_y')).toBe(1); // ahora sí cacheado
    expect(calls).toBe(2);
    warn.mockRestore();
  });
});

// ───────────────────── 6. Navegación CRM ─────────────────────

describe('crmNav — cada entrada visible tiene página', () => {
  it('todo href de CRM_NAV_ENABLED existe como src/app/app/crm/<segmento>/page.tsx y no hay claves duplicadas', async () => {
    const { CRM_NAV, CRM_NAV_ENABLED } = await import('@/config/crmNav');
    const { existsSync } = await import('fs');
    const missing = CRM_NAV_ENABLED.filter((i) => !existsSync(join(process.cwd(), 'src/app', i.href.replace(/^\//, ''), 'page.tsx')));
    expect(missing.map((i) => i.href)).toEqual([]);
    expect(new Set(CRM_NAV.map((i) => i.key)).size).toBe(CRM_NAV.length);
    expect(CRM_NAV_ENABLED.every((i) => i.href.startsWith('/app/crm/'))).toBe(true);
  });
});
