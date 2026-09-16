/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tester F0-REG — ronda 3 (2026-09-15): rutas de configuración con
 * `next/server` real. Regla dura 5 (la organización sale de la sesión, nunca
 * del body) y punto 2 del QA r2 en la ruta de créditos.
 *   - PUT /api/crm/config/providers: body con OTRA organización → 403
 *     `FOREIGN_ORGANIZATION` y no se escribe; misma org (número o texto) →
 *     sigue funcionando; `organization_id` ajeno en el body NUNCA sustituye a
 *     la de sesión en el upsert.
 *   - POST /api/crm/config/providers/test: misma org en el body → funciona;
 *     org ajena → 403 FOREIGN_ORGANIZATION sin rate limit ni credenciales
 *     (hueco de r3 cerrado en r4: `readOrgBody` envuelto como en el PUT).
 *   - GET /api/crm/config/credits: la RPC falla con 22023 también con UTC →
 *     500 controlado (2 llamadas, mensaje genérico, sin filtrar el de Postgres).
 * `OrgContextError` es la clase REAL (módulo hoja) para que el `instanceof`
 * de las rutas y el `throw` de `readOrgBody` sean la misma clase.
 * Informe: docs/crm-revenue-os/rondas/F0-REG-tester-r3.md
 */

import { NextRequest } from 'next/server';

const estado = {
  ctx: { organizationId: 7, userId: 'u-1', roleId: 2, roleName: 'Vendedor', isSuperAdmin: false, supabase: {} as any },
  timezone: 'America/Bogota',
  usageError: null as null | { code: string; message: string },
  upserts: [] as Array<{ orgId: number; input: any }>,
  rateLimited: false,
  rateLimitCalls: 0,
  credentialCalls: 0,
};
const rpcCalls: Array<{ name: string; args: any }> = [];

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => estado.ctx,
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
}));
jest.mock('@/lib/services/crm/revenueOsService', () => ({ getOrgTimezoneServer: async () => estado.timezone }));
jest.mock('@/lib/services/crm/pricingService', () => ({ listPricing: async () => [], round6: (n: number) => Math.round(n * 1e6) / 1e6 }));
jest.mock('@/lib/security/rateLimit', () => ({
  checkRateLimit: async () => { estado.rateLimitCalls += 1; return { allowed: !estado.rateLimited, remaining: 4, resetAt: new Date(), count: 1 }; },
}));
jest.mock('@/lib/services/providerCredentials.server', () => ({
  getProviderCredentials: async () => { estado.credentialCalls += 1; return { provider: 'internal', source: 'org', isActive: true, credentials: {}, settings: {}, priority: 10 }; },
  listProviderConfigsSafe: async () => [],
  upsertProviderConfig: async (orgId: number, input: any) => { estado.upserts.push({ orgId, input }); return { id: 'x', ...input, configured: false }; },
  ProviderValidationError: class ProviderValidationError extends Error { status = 422; },
}));

function fakeService() {
  return {
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === 'fn_ai_usage_month') {
        if (estado.usageError) return { data: null, error: estado.usageError };
        return { data: { spent_usd: 0, spent_credits: 0, rows: 0, by_model: [], by_day: [] }, error: null };
      }
      if (name === 'fn_comm_usage_month') return { data: { spent_usd: 0, rows: 0, by_channel: [] }, error: null };
      return { data: null, error: null };
    },
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: table === 'ai_settings' ? { credits_remaining: 5, purchased_credits: 0, credits_reset_at: '2026-09-01T05:00:00Z' } : null, error: null }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return q;
    },
  };
}
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => fakeService(), assertServerOnly: () => undefined }));

import { GET as getCredits } from '@/app/api/crm/config/credits/route';
import { PUT as putProviders } from '@/app/api/crm/config/providers/route';
import { POST as postTest } from '@/app/api/crm/config/providers/test/route';

const req = (path: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  rpcCalls.length = 0;
  estado.ctx = { organizationId: 7, userId: 'u-1', roleId: 2, roleName: 'Vendedor', isSuperAdmin: false, supabase: {} };
  estado.timezone = 'America/Bogota';
  estado.usageError = null;
  estado.upserts = [];
  estado.rateLimited = false;
  estado.rateLimitCalls = 0;
  estado.credentialCalls = 0;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('PUT /api/crm/config/providers — la organización sale de la sesión', () => {
  const valid = { category: 'llm', provider: 'openai', settings: {}, is_active: true };

  it('body con otra organización (organization_id / organizationId / orgId / org_id) → 403 FOREIGN_ORGANIZATION y no se escribe', async () => {
    for (const key of ['organization_id', 'organizationId', 'orgId', 'org_id']) {
      const res = await putProviders(req('/api/crm/config/providers', 'PUT', { ...valid, [key]: 999 }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ success: false, error: 'Organización no permitida' });
    }
    expect(estado.upserts).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ajeno'), expect.objectContaining({ session: 7, body: 999 }));
  });

  it('misma organización en el body (número o texto) → 200 y el upsert usa la org de SESIÓN', async () => {
    for (const same of [7, '7']) {
      const res = await putProviders(req('/api/crm/config/providers', 'PUT', { ...valid, organization_id: same }));
      expect(res.status).toBe(200);
    }
    expect(estado.upserts.map((u) => u.orgId)).toEqual([7, 7]);
  });

  it('miembro no admin (rol 4) → 403 antes de mirar el body; JSON inválido → 400', async () => {
    estado.ctx = { ...estado.ctx, roleId: 4 };
    expect((await putProviders(req('/api/crm/config/providers', 'PUT', { ...valid, organization_id: 999 }))).status).toBe(403);
    estado.ctx = { ...estado.ctx, roleId: 2 };
    const bad = new NextRequest('http://localhost/api/crm/config/providers', { method: 'PUT', body: '{no json', headers: { 'content-type': 'application/json' } });
    expect((await putProviders(bad)).status).toBe(400);
    expect(estado.upserts).toHaveLength(0);
  });
});

describe('POST /api/crm/config/providers/test — organización en el body', () => {
  it('misma organización en el body → la prueba se ejecuta (200 con provider internal)', async () => {
    const res = await postTest(req('/api/crm/config/providers/test', 'POST', { category: 'calendar', organization_id: 7 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, provider: 'internal' });
  });

  // Cerrado en r4 (QA r3 punto 1): `readOrgBody(ctx, body)` va dentro de un
  // try/catch que convierte `OrgContextError(403)` en respuesta, como en el
  // PUT de providers/route.ts. Antes escapaba como excepción sin manejar (500).
  it('body con otra organización → 403 FOREIGN_ORGANIZATION (cerrado en r4)', async () => {
    const res = await postTest(req('/api/crm/config/providers/test', 'POST', { category: 'calendar', organization_id: 999 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, detail: 'Organización no permitida' });
  });

  // QA r2 punto 5, probado CONTANDO llamadas: el test de r2 («400 sin consumir
  // cupo») no distingue el orden porque su doble de `checkRateLimit` no cuenta
  // (mutante M13 —rate limit antes de validar— sobrevivía a toda la suite r2).
  it('body inválido → 400 y checkRateLimit NO se llama; body válido → se llama exactamente una vez', async () => {
    expect((await postTest(req('/api/crm/config/providers/test', 'POST', { category: 'no-existe' }))).status).toBe(400);
    expect((await postTest(req('/api/crm/config/providers/test', 'POST', { provider: 'openai' }))).status).toBe(400);
    expect(estado.rateLimitCalls).toBe(0);
    expect((await postTest(req('/api/crm/config/providers/test', 'POST', { category: 'calendar' }))).status).toBe(200);
    expect(estado.rateLimitCalls).toBe(1);
  });

  it('org ajena (orgId): ya no escapa ninguna excepción; 0 rate limit, 0 credenciales y console.warn registrado', async () => {
    const res = await postTest(req('/api/crm/config/providers/test', 'POST', { category: 'calendar', orgId: 999 }));
    expect(res.status).toBe(403);
    expect(estado.rateLimitCalls).toBe(0);
    expect(estado.credentialCalls).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ajeno'), expect.objectContaining({ session: 7, body: 999, key: 'orgId' }));
  });
});

describe('GET /api/crm/config/credits — 22023 persistente', () => {
  it('la RPC rechaza la zona (válida para Intl) y también UTC → 500 controlado tras 2 llamadas, sin filtrar el mensaje de Postgres', async () => {
    // `getOrgTimezoneServer` ya garantiza una zona válida para Intl; el caso
    // real es una zona que ICU acepta y Postgres no. Se simula con una zona
    // válida para Node y una RPC que la rechaza siempre.
    estado.timezone = 'America/Lima';
    estado.usageError = { code: '22023', message: 'time zone "America/Lima" not recognized' };
    const res = await getCredits();
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json).toEqual({ success: false, error: 'No se pudo obtener el estado de créditos' });
    expect(JSON.stringify(json)).not.toContain('not recognized');
    expect(rpcCalls.filter((c) => c.name === 'fn_ai_usage_month').map((c) => c.args.p_tz)).toEqual(['America/Lima', 'UTC']);
  });

  it('una zona que Intl no acepta ni llega a la RPC: monthStartInTz lanza y la ruta responde 500 controlado (getOrgTimezoneServer la filtra antes en producción)', async () => {
    estado.timezone = 'Marte/Fobos';
    const res = await getCredits();
    expect(res.status).toBe(500);
    expect(rpcCalls).toHaveLength(0);
  });

  it('zona ya en UTC y 22023 → una sola llamada y 500 controlado (no reintenta consigo misma)', async () => {
    estado.timezone = 'UTC';
    estado.usageError = { code: '22023', message: 'time zone "UTC" not recognized' };
    expect((await getCredits()).status).toBe(500);
    expect(rpcCalls.filter((c) => c.name === 'fn_ai_usage_month')).toHaveLength(1);
  });
});
