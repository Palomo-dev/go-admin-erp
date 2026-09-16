/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tester F0-REG — ronda 2 (2026-09-15): rutas de configuración.
 *   - GET /api/crm/config/credits: el mes empieza en la zona de la org (borde
 *     30/09 22:00 Bogotá = 01/10 03:00Z), `truncated` viaja en la respuesta,
 *     org sin fila `ai_settings` no da 500, respaldo en Node cuando la RPC
 *     (mig. 39) no existe.
 *   - POST /api/crm/config/providers/test: con `source: 'env'` no revela el
 *     detalle de la cuenta de la plataforma (ni en éxito ni en fallo); con
 *     `source: 'org'` sí; miembro con rol llamado «Admin de organización» pero
 *     id 4 → 403; rate limit → 429.
 * Informe: docs/crm-revenue-os/rondas/F0-REG-tester-r2.md
 */

import { NextRequest } from 'next/server';

// ───────────── estado controlable por cada caso ─────────────
const estado = {
  ctx: { organizationId: 7, userId: 'u-1', roleId: 2, roleName: 'Vendedor', isSuperAdmin: false, supabase: {} as any },
  timezone: 'America/Bogota',
  rpcUsageExists: true,
  aiSettingsRow: { credits_remaining: 120, purchased_credits: 0, credits_reset_at: '2026-09-01T05:00:00Z' } as Record<string, unknown> | null,
  usageRows: [] as Array<Record<string, unknown>>,
  rateLimited: false,
  credentials: { provider: 'twilio', source: 'env', isActive: true, credentials: { TWILIO_ACCOUNT_SID: 'ACxxxxxxxx', TWILIO_AUTH_TOKEN: 'tok-secreto-largo' }, settings: {}, priority: 10 } as any,
  twilioFetch: async (): Promise<any> => ({ friendlyName: 'CUENTA-PLATAFORMA-SECRETA', status: 'active' }),
};
const rpcCalls: Array<{ name: string; args: any }> = [];

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => estado.ctx,
  OrgContextError: class OrgContextError extends Error { statusCode = 401; },
}));
jest.mock('@/lib/services/crm/revenueOsService', () => ({ getOrgTimezoneServer: async () => estado.timezone }));
jest.mock('@/lib/services/crm/pricingService', () => ({ listPricing: async () => [], round6: (n: number) => Math.round(n * 1e6) / 1e6 }));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: !estado.rateLimited, remaining: 4, resetAt: new Date(), count: 1 }) }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ getProviderCredentials: async () => estado.credentials }));
jest.mock('twilio', () => ({
  __esModule: true,
  default: () => ({ api: { v2010: { accounts: () => ({ fetch: () => estado.twilioFetch() }) } } }),
}));

function fakeService() {
  return {
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === 'fn_ai_usage_month') {
        if (!estado.rpcUsageExists) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_ai_usage_month' } };
        return { data: { spent_usd: 3.5, spent_credits: 10, rows: 2, by_model: [{ model: 'm', credits: 10, cost_usd: 3.5, tokens: 100, calls: 2 }], by_day: [{ day: '2026-09-30', credits: 10, cost_usd: 3.5 }] }, error: null };
      }
      if (name === 'fn_comm_usage_month') {
        if (!estado.rpcUsageExists) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.fn_comm_usage_month' } };
        return { data: { spent_usd: 0, rows: 0, by_channel: [] }, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => {
          if (table === 'ai_settings') return { data: estado.aiSettingsRow, error: null };
          if (table === 'comm_settings') return { data: null, error: null };
          return { data: null, error: null };
        },
        then: (resolve: any) => {
          if (table === 'ai_usage_logs') return resolve({ data: estado.usageRows, error: null });
          if (table === 'provider_configs') return resolve({ data: [{ settings: { monthly_budget_usd: 10 }, priority: 10 }], error: null });
          return resolve({ data: [], error: null });
        },
      };
      return q;
    },
  };
}
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeService(), assertServerOnly: () => undefined }));

import { GET as getCredits } from '../credits/route';
import { POST as postTest } from '../providers/test/route';

const post = (body: unknown) => new NextRequest('http://localhost/api/crm/config/providers/test', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  rpcCalls.length = 0;
  estado.ctx = { organizationId: 7, userId: 'u-1', roleId: 2, roleName: 'Vendedor', isSuperAdmin: false, supabase: {} };
  estado.timezone = 'America/Bogota';
  estado.rpcUsageExists = true;
  estado.aiSettingsRow = { credits_remaining: 120, purchased_credits: 0, credits_reset_at: '2026-09-01T05:00:00Z' };
  estado.usageRows = [];
  estado.rateLimited = false;
  estado.credentials = { provider: 'twilio', source: 'env', isActive: true, credentials: { TWILIO_ACCOUNT_SID: 'ACxxxxxxxx', TWILIO_AUTH_TOKEN: 'tok-secreto-largo' }, settings: {}, priority: 10 };
  estado.twilioFetch = async () => ({ friendlyName: 'CUENTA-PLATAFORMA-SECRETA', status: 'active' });
  jest.useFakeTimers({ now: new Date('2026-10-01T03:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
});
afterEach(() => jest.useRealTimers());

describe('GET /api/crm/config/credits — zona horaria y forma de la respuesta', () => {
  it('a las 22:00 del 30/09 en Bogotá el periodo sigue siendo septiembre (en UTC ya sería octubre)', async () => {
    const res = await getCredits();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.period.timezone).toBe('America/Bogota');
    expect(json.period.since).toBe('2026-09-01T00:00:00.000-05:00');
    const rpc = rpcCalls.find((c) => c.name === 'fn_ai_usage_month')!;
    expect(rpc.args).toEqual({ p_org: 7, p_since: '2026-09-01T00:00:00.000-05:00', p_tz: 'America/Bogota' });
    expect(json.ai).toMatchObject({ credits_remaining: 120, spent_month_usd: 3.5, spent_month_credits: 10, monthly_budget_usd: 10, budget_used_pct: 35, truncated: false });
    expect(json.ai.by_day).toEqual([{ day: '2026-09-30', credits: 10, cost_usd: 3.5 }]);
    expect(json.comm.truncated).toBe(false);
  });

  it('org en UTC: el periodo empieza el 1/10 (mismo instante, otro calendario)', async () => {
    estado.timezone = 'UTC';
    const json = await (await getCredits()).json();
    expect(new Date(json.period.since).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(rpcCalls.find((c) => c.name === 'fn_ai_usage_month')!.args.p_tz).toBe('UTC');
  });

  it('sin la RPC (mig. 39 sin aplicar): respaldo en Node, día en la zona de la org y truncated=false con pocas filas', async () => {
    estado.rpcUsageExists = false;
    estado.usageRows = [
      { model: 'm', credits_consumed: 4, total_tokens: 10, cost_amount: '0.25', metadata: null, created_at: '2026-10-01T02:30:00+00:00' }, // 21:30 del 30/09 en Bogotá
    ];
    const json = await (await getCredits()).json();
    expect(json.success).toBe(true);
    expect(json.ai.spent_month_usd).toBe(0.25);
    expect(json.ai.by_day).toEqual([{ day: '2026-09-30', credits: 4, cost_usd: 0.25 }]);
    expect(json.ai.truncated).toBe(false);
  });

  it('org sin fila ai_settings → 200 con credits_remaining null (no 500)', async () => {
    estado.aiSettingsRow = null;
    const res = await getCredits();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ai.credits_remaining).toBeNull();
    expect(json.ai.purchased_credits).toBe(0);
  });

  it('un error de la RPC que no sea «no existe» ni «zona desconocida» → 500 controlado, sin filtrar el mensaje', async () => {
    estado.rpcUsageExists = true;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const mod = jest.requireMock('@/lib/supabase/server-service') as { getServiceClient: () => any };
    const original = mod.getServiceClient;
    mod.getServiceClient = () => {
      const s = original();
      const rpc = s.rpc;
      s.rpc = async (name: string, args: any) => (name === 'fn_ai_usage_month' ? { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout (tabla_secreta)' } } : rpc(name, args));
      return s;
    };
    try {
      const res = await getCredits();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(JSON.stringify(json)).not.toContain('tabla_secreta');
    } finally {
      mod.getServiceClient = original;
      spy.mockRestore();
    }
  });

  // QA r2 medio 2 (r3): zona válida para Intl pero no para Postgres → la RPC
  // responde 22023 y la ruta reintenta con UTC en vez de dar 500.
  it('GET /credits con zona que Postgres no reconoce (22023) → 200 con el consumo agregado en UTC', async () => {
    estado.rpcUsageExists = true;
    estado.timezone = 'America/Bogota';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mod = jest.requireMock('@/lib/supabase/server-service') as { getServiceClient: () => any };
    const original = mod.getServiceClient;
    mod.getServiceClient = () => {
      const s = original();
      const rpc = s.rpc;
      s.rpc = async (name: string, args: any) => {
        if (name === 'fn_ai_usage_month' && args.p_tz !== 'UTC') {
          // El fake original registra la llamada solo cuando pasa por él: aquí
          // se registra a mano para poder afirmar que hubo DOS llamadas.
          rpcCalls.push({ name, args });
          return { data: null, error: { code: '22023', message: 'time zone "America/Bogota" not recognized' } };
        }
        return rpc(name, args);
      };
      return s;
    };
    try {
      const res = await getCredits();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ai.spent_month_usd).toBe(3.5);
      const usage = rpcCalls.filter((c) => c.name === 'fn_ai_usage_month');
      expect(usage).toHaveLength(2);
      expect(usage[0].args.p_tz).toBe('America/Bogota');
      expect(usage[1].args.p_tz).toBe('UTC');
      // El inicio del periodo sigue siendo el de la zona de la org, no el de UTC.
      expect(usage[1].args.p_since).toBe(usage[0].args.p_since);
      expect(json.period.timezone).toBe('America/Bogota');
    } finally {
      mod.getServiceClient = original;
      warn.mockRestore();
    }
  });
});

describe('POST /api/crm/config/providers/test — credenciales de la plataforma sin detalle', () => {
  it('source=env y prueba OK → detail genérico, sin el nombre de la cuenta de la plataforma', async () => {
    const res = await postTest(post({ category: 'voice', provider: 'twilio' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, provider: 'twilio', source: 'env', detail: 'Conexión de la plataforma operativa' });
    expect(JSON.stringify(json)).not.toContain('CUENTA-PLATAFORMA-SECRETA');
    expect(JSON.stringify(json)).not.toContain('active');
  });

  it('source=env y el SDK lanza con el token en el mensaje → 502 con detail genérico, sin el token ni el mensaje', async () => {
    estado.twilioFetch = async () => { throw new Error('401 Unauthorized for tok-secreto-largo (account CUENTA-PLATAFORMA-SECRETA)'); };
    const res = await postTest(post({ category: 'voice', provider: 'twilio' }));
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.detail).toBe('La plataforma no pudo conectar');
    expect(JSON.stringify(json)).not.toContain('tok-secreto-largo');
    expect(JSON.stringify(json)).not.toContain('CUENTA-PLATAFORMA-SECRETA');
  });

  it('source=org → el admin sí ve el detalle de SU cuenta, con los secretos enmascarados', async () => {
    estado.credentials.source = 'org';
    estado.twilioFetch = async () => ({ friendlyName: 'Mi cuenta tok-secreto-largo', status: 'active' });
    const json = await (await postTest(post({ category: 'voice', provider: 'twilio' }))).json();
    expect(json.source).toBe('org');
    expect(json.detail).toContain('Mi cuenta');
    expect(json.detail).not.toContain('tok-secreto-largo');
  });

  it('miembro con rol llamado «Admin de organización» pero id 4 → 403 antes de resolver credenciales', async () => {
    estado.ctx = { ...estado.ctx, roleId: 4, roleName: 'Admin de organización' };
    const res = await postTest(post({ category: 'voice' }));
    expect(res.status).toBe(403);
  });

  it('rate limit agotado → 429', async () => {
    estado.rateLimited = true;
    const res = await postTest(post({ category: 'voice' }));
    expect(res.status).toBe(429);
  });

  // QA r2 bajo 5 (r3): el body se valida antes del rate limit; un body mal
  // formado no consume cupo. Con el cupo agotado, el body inválido sigue
  // siendo 400 (se valida primero) y el válido 429.
  it('body inválido → 400 sin consumir cupo del rate limit', async () => {
    estado.rateLimited = true;
    expect((await postTest(post({ category: 'no-existe' }))).status).toBe(400);
    expect((await postTest(post({ category: 'voice' }))).status).toBe(429);
  });

  it('sin credenciales (provider none) → 200 ok:false sin llamar al SDK', async () => {
    estado.credentials = { provider: 'none', source: 'none', isActive: false, credentials: {}, settings: {}, priority: 999 };
    const called = jest.fn();
    estado.twilioFetch = async () => { called(); return {}; };
    const json = await (await postTest(post({ category: 'voice' }))).json();
    expect(json.ok).toBe(false);
    expect(called).not.toHaveBeenCalled();
  });
});
