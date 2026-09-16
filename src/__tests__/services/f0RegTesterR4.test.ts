/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tester F0-REG — ronda 4 (2026-09-16). Sondas sobre los cambios r4 (QA r3
 * puntos 1, 3 y 4) que las suites r3 no cubren:
 *   - POST /api/crm/config/providers/test con `next/server` real: org ajena
 *     en CADA clave (`organization_id`, `organizationId`, `orgId`, `org_id`),
 *     en texto, con espacios, no numérica, `0`, `true`, y mezclada con la
 *     propia → 403 `{ ok:false, detail }` sin `checkRateLimit` ni
 *     `getProviderCredentials`; misma org en cualquier forma → 200; body
 *     inválido (JSON roto, array, texto, null) → 400 sin consumir cupo; sin
 *     sesión → 401; no admin → 403 antes de mirar el body; 429 después de
 *     validar y antes de leer credenciales. HUECO documentado (bajo): la
 *     sobrecarga síncrona `readOrgBody(ctx, body)` NO mira la query string
 *     (`?organization_id=999` pasa); la org efectiva sigue siendo la de
 *     sesión, así que no es un salto de tenant.
 *   - `isSupportedTimeZone`: enlaces IANA que ICU canoniza (verificados uno a
 *     uno en `pg_timezone_names` por MCP el 2026-09-16), los 417 canónicos de
 *     ICU (todos en `pg_timezone_names`), y lo que sigue rechazado
 *     (abreviaturas, `Etc/*`, offsets, minúsculas, espacios, 3+ niveles
 *     inventados). `Etc/UTC` → false queda documentado (observación).
 *   - `chargeAiCredits` con `credits` explícito 0,49 / 0,5 / NaN / -1 / '3' /
 *     Infinity / -0 y con `credits` ausente o `null` (default).
 *   - `useCalendarSettings.saveSettings` (QA r3 punto 5) sin DOM: se inyecta
 *     un despachador mínimo de hooks en React 19 y se llama al hook como
 *     función. `organizations.timezone` se escribe ANTES que
 *     `organization_settings`; si la BD la rechaza (22023 del trigger 44) no
 *     se toca `organization_settings` y el error llega a la UI; una zona que
 *     Node rechaza no llega a la BD.
 * Sin datos reales: ids 7/999 y valores inventados.
 * Informe: docs/crm-revenue-os/rondas/F0-REG-tester-r4.md
 */

import { NextRequest } from 'next/server';
import { OrgContextError } from '@/lib/utils/orgContextError';

const estado = {
  ctx: { organizationId: 7, userId: 'u-1', roleId: 2, roleName: 'Vendedor', isSuperAdmin: false, supabase: {} as any },
  ctxError: null as null | OrgContextError,
  rateLimited: false,
  rateLimitCalls: 0,
  credentialCalls: 0,
};

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: async () => {
    if (estado.ctxError) throw estado.ctxError;
    return estado.ctx;
  },
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
}));
jest.mock('@/lib/security/rateLimit', () => ({
  checkRateLimit: async () => {
    estado.rateLimitCalls += 1;
    return { allowed: !estado.rateLimited, remaining: 4, resetAt: new Date(), count: 1 };
  },
}));
jest.mock('@/lib/services/providerCredentials.server', () => ({
  getProviderCredentials: async () => {
    estado.credentialCalls += 1;
    return { provider: 'internal', source: 'org', isActive: true, credentials: {}, settings: {}, priority: 10 };
  },
}));

/** Cliente de navegador doblado para el hook: registra el orden de las tablas tocadas. */
const hookDb = {
  order: [] as string[],
  tzError: null as null | { code: string; message: string },
  existing: true,
};
jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        single: async () => ({ data: hookDb.existing ? { id: 1 } : null, error: hookDb.existing ? null : { code: 'PGRST116' } }),
        update: (patch: any) => {
          hookDb.order.push(`${table}.update:${JSON.stringify(patch)}`);
          if (table === 'organizations') {
            return { eq: async () => ({ error: hookDb.tzError }) };
          }
          return { eq: () => ({ eq: async () => ({ error: null }) }) };
        },
        insert: async (row: any) => {
          hookDb.order.push(`${table}.insert:${JSON.stringify(row)}`);
          return { error: null };
        },
      };
      return q;
    },
  },
}));
const invalidated: number[] = [];
jest.mock('@/lib/services/organizationTimezoneService', () => ({
  invalidateTimezoneCache: (id: number) => { invalidated.push(id); },
}));

import { POST as postTest } from '@/app/api/crm/config/providers/test/route';
import * as React from 'react';
import { useCalendarSettings } from '@/components/calendario/configuracion/useCalendarSettings';
import { DEFAULT_CALENDAR_SETTINGS } from '@/components/calendario/configuracion/types';
import { isSupportedTimeZone } from '@/lib/utils/timezone';
import { chargeAiCredits, __setAiCostClientFactory } from '@/lib/services/crm/aiCostService';
import { __setPricingClientFactory, clearPricingCache } from '@/lib/services/crm/pricingService';

const PATH = 'http://localhost/api/crm/config/providers/test';
const jsonReq = (body: unknown, url: string = PATH) =>
  new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const rawReq = (raw: string) =>
  new NextRequest(PATH, { method: 'POST', body: raw, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
  estado.ctx = { organizationId: 7, userId: 'u-1', roleId: 2, roleName: 'Vendedor', isSuperAdmin: false, supabase: {} };
  estado.ctxError = null;
  estado.rateLimited = false;
  estado.rateLimitCalls = 0;
  estado.credentialCalls = 0;
  clearPricingCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  __setAiCostClientFactory(null);
  __setPricingClientFactory(null);
  jest.restoreAllMocks();
});

// ───────────── 1. POST /providers/test — regla dura 5 cerrada en r4 ─────────────

describe('POST /api/crm/config/providers/test — organización ajena en el body (QA r3 punto 1)', () => {
  const FOREIGN = { ok: false, detail: 'Organización no permitida' };

  it('cada clave (organization_id / organizationId / orgId / org_id) con 999 → 403 JSON, 0 rate limit, 0 credenciales y warn con la clave', async () => {
    for (const key of ['organization_id', 'organizationId', 'orgId', 'org_id']) {
      const res = await postTest(jsonReq({ category: 'calendar', [key]: 999 }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(FOREIGN);
      expect(console.warn).toHaveBeenLastCalledWith(expect.stringContaining('ajeno'), expect.objectContaining({ session: 7, body: 999, key, where: 'body' }));
    }
    expect(estado.rateLimitCalls).toBe(0);
    expect(estado.credentialCalls).toBe(0);
    expect(console.warn).toHaveBeenCalledTimes(4);
  });

  it('formas no numéricas o distintas de la sesión: "999", " 999 ", "7abc", 0, true, -7 → 403; la org efectiva nunca sale del body', async () => {
    for (const foreign of ['999', ' 999 ', '7abc', 0, true, -7]) {
      const res = await postTest(jsonReq({ category: 'calendar', organization_id: foreign }));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(FOREIGN);
    }
    expect(estado.rateLimitCalls).toBe(0);
    expect(estado.credentialCalls).toBe(0);
  });

  it('la propia org en una clave y otra ajena en la segunda → 403 (se miran TODAS las claves)', async () => {
    const res = await postTest(jsonReq({ category: 'calendar', organization_id: 7, orgId: 999 }));
    expect(res.status).toBe(403);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ajeno'), expect.objectContaining({ key: 'orgId', body: 999 }));
    expect(estado.rateLimitCalls).toBe(0);
  });

  it('misma org en cualquier forma (7, "7", " 7 ", y vacía "" o null) → 200 con la prueba ejecutada una vez por petición', async () => {
    const formas: unknown[] = [7, '7', ' 7 ', '', null];
    for (const same of formas) {
      const res = await postTest(jsonReq({ category: 'calendar', organization_id: same }));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, provider: 'internal' });
    }
    expect(estado.rateLimitCalls).toBe(formas.length);
    expect(estado.credentialCalls).toBe(formas.length);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('body inválido (JSON roto, array con org ajena, texto, null) → 400 «Body inválido», sin cupo ni credenciales ni excepción', async () => {
    expect((await postTest(rawReq('{no json'))).status).toBe(400);
    expect((await postTest(rawReq('[{"organization_id": 999, "category": "calendar"}]'))).status).toBe(400);
    expect((await postTest(rawReq('"calendar"'))).status).toBe(400);
    expect((await postTest(rawReq('null'))).status).toBe(400);
    expect((await postTest(rawReq(''))).status).toBe(400);
    const res = await postTest(rawReq('{no json'));
    expect(await res.json()).toEqual({ ok: false, detail: 'Body inválido' });
    expect(estado.rateLimitCalls).toBe(0);
    expect(estado.credentialCalls).toBe(0);
  });

  it('sin sesión (getServerOrgContext lanza 401) → 401 JSON { ok:false, detail } antes de leer el body', async () => {
    estado.ctxError = new OrgContextError('No autenticado', 401);
    const res = await postTest(jsonReq({ category: 'calendar', organization_id: 999 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, detail: 'No autenticado' });
    expect(estado.rateLimitCalls).toBe(0);
    expect(estado.credentialCalls).toBe(0);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('sin organización en sesión (400 del contexto) → 400 del contexto, no 403 de readOrgBody', async () => {
    estado.ctxError = new OrgContextError('Sin organización activa', 400);
    const res = await postTest(jsonReq({ category: 'calendar', organization_id: 999 }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, detail: 'Sin organización activa' });
  });

  it('miembro no admin (rol 4) con org ajena → 403 «Solo administradores» ANTES de readOrgBody (sin warn de org ajena)', async () => {
    estado.ctx = { ...estado.ctx, roleId: 4 };
    const res = await postTest(jsonReq({ category: 'calendar', organization_id: 999 }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ ok: false, detail: 'Solo administradores' });
    expect(console.warn).not.toHaveBeenCalled();
    expect(estado.rateLimitCalls).toBe(0);
  });

  it('cupo agotado → 429 tras validar el body y ANTES de resolver credenciales; con org ajena sigue siendo 403 y no cuenta', async () => {
    estado.rateLimited = true;
    const res = await postTest(jsonReq({ category: 'calendar' }));
    expect(res.status).toBe(429);
    expect(estado.rateLimitCalls).toBe(1);
    expect(estado.credentialCalls).toBe(0);
    expect((await postTest(jsonReq({ category: 'calendar', org_id: 999 }))).status).toBe(403);
    expect(estado.rateLimitCalls).toBe(1);
  });

  it('un error que NO es OrgContextError dentro de readOrgBody se propaga (no se disfraza de 403)', async () => {
    // `readOrgBody` no puede lanzar otra cosa hoy; se prueba con el contexto,
    // que comparte el mismo `catch` y el mismo `throw err`.
    estado.ctxError = new TypeError('fallo interno') as unknown as OrgContextError;
    await expect(postTest(jsonReq({ category: 'calendar' }))).rejects.toBeInstanceOf(TypeError);
  });

  // HUECO (bajo, documentado): la ruta usa la sobrecarga síncrona
  // `readOrgBody(ctx, body)` sobre el JSON ya leído, que solo mira el body;
  // la query string solo se comprueba en la sobrecarga con `Request`. Como la
  // ruta no lee nada de la query, la org efectiva sigue siendo la de sesión.
  // Mismo patrón en el PUT de providers/route.ts y en ~35 rutas más (F0-SEC).
  it.failing('HUECO (bajo): ?organization_id=999 en la query con body limpio → hoy 200 (se esperaría 403)', async () => {
    const res = await postTest(jsonReq({ category: 'calendar' }, `${PATH}?organization_id=999`));
    expect(res.status).toBe(403);
  });

  it('evidencia del hueco anterior: la query ajena no cambia la org (200, prueba ejecutada con la org de sesión, sin warn)', async () => {
    const res = await postTest(jsonReq({ category: 'calendar' }, `${PATH}?organization_id=999`));
    expect(res.status).toBe(200);
    expect(console.warn).not.toHaveBeenCalled();
  });
});

// ───────────── 2. isSupportedTimeZone — enlaces IANA (QA r3 punto 3) ─────────────

describe('isSupportedTimeZone — enlaces IANA que ICU canoniza a otro nombre', () => {
  // Cada uno existe en pg_timezone_names (MCP, 2026-09-16), así que el trigger
  // de la 44 los admite: no hay zona que la app acepte y la BD rechace.
  const enlaces = [
    'Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'Europe/Kyiv', 'Asia/Ho_Chi_Minh', 'Africa/Asmara',
    'America/Argentina/ComodRivadavia', 'America/Kentucky/Louisville', 'America/Indiana/Indianapolis',
    'US/Eastern', 'US/Pacific', 'US/East-Indiana', 'Brazil/East', 'Canada/Eastern', 'Mexico/General',
    'Australia/ACT', 'Europe/Nicosia', 'Antarctica/Troll', 'Pacific/Kiritimati',
  ];
  it(`acepta ${enlaces.length} enlaces/canónicos IANA (todos en pg_timezone_names)`, () => {
    for (const tz of enlaces) expect([tz, isSupportedTimeZone(tz)]).toEqual([tz, true]);
  });

  it('acepta los 417 canónicos de ICU tal cual (todos presentes en pg_timezone_names, verificado por MCP)', () => {
    const set = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
    expect(set.length).toBeGreaterThan(300);
    const rechazados = set.filter((tz) => !isSupportedTimeZone(tz));
    expect(rechazados).toEqual([]);
  });

  it('sigue rechazando abreviaturas, Etc/*, offsets, alias de un solo nivel, minúsculas, espacios y niveles inventados', () => {
    const malos = ['EST', 'CET', 'EST5EDT', 'GMT', 'Zulu', 'Universal', 'Japan', 'W-SU', 'PRC', 'NZ', 'Cuba',
      'Etc/GMT+5', 'Etc/GMT-14', 'Etc/GMT', '+05:30', 'UTC+5', 'utc', ' UTC ', 'america/bogota', 'America/bogota',
      'America/Bogota\n', 'Europe/Madrid/X', 'America/Bogota/Norte', 'X/Y', 'Ab/Cd', 'SystemV/EST5', 'Factory', 'Nada/Inventado'];
    for (const tz of malos) expect([tz, isSupportedTimeZone(tz)]).toEqual([tz, false]);
  });

  // Observación (no fallo): `UTC` se acepta por caso especial, pero `Etc/UTC`
  // (canónico IANA, en pg_timezone_names) cae en la rama Region/City y su
  // resolución (`UTC`) no está en el set de ICU. Dirección segura.
  it('DOCUMENTADO: Etc/UTC → false aunque Postgres lo conozca (UTC sí → true)', () => {
    expect(isSupportedTimeZone('UTC')).toBe(true);
    expect(isSupportedTimeZone('Etc/UTC')).toBe(false);
  });

  it('un enlace aceptado siempre resuelve a un canónico del set (la rama nueva no acepta nada que ICU no conozca)', () => {
    const set = new Set((Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone'));
    for (const tz of enlaces) {
      const resolved = new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
      expect(set.has(resolved)).toBe(true);
    }
  });
});

// ───────────── 3. chargeAiCredits — credits explícito (QA r3 punto 4) ─────────────

function fakeDb() {
  const calls: Array<{ type: string; name: string; args?: any }> = [];
  const row = { organization_id: 7, credits_remaining: 90, credits_reset_at: '2026-09-01T05:00:00Z' };
  const sb: any = {
    rpc: async (name: string, args: any) => {
      calls.push({ type: 'rpc', name, args });
      if (name === 'decrement_ai_credits') {
        if (row.credits_remaining < args.p_cost) return { data: false, error: null };
        row.credits_remaining -= args.p_cost;
        return { data: true, error: null };
      }
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    },
    from: (table: string) => {
      const q: any = {
        select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => q, is: () => q,
        insert: (r: any) => {
          calls.push({ type: 'insert', name: table, args: r });
          return { select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }), then: (res: any) => res({ data: null, error: null }) };
        },
        update: () => q,
        maybeSingle: async () => (table === 'ai_settings' ? { data: { ...row }, error: null } : { data: null, error: null }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return q;
    },
  };
  return { sb, calls, row };
}

describe('chargeAiCredits — `credits` explícito', () => {
  const charge = (credits: unknown) =>
    chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 1, credits: credits as number });

  it('0.49 → RangeError «mínimo 1» con el valor recibido; 0.5 → cobra 1; sin RPC ni log en el rechazo', async () => {
    const { sb, calls, row } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(charge(0.49)).rejects.toThrow(/mínimo 1.*0\.49/);
    expect(calls).toHaveLength(0);
    expect(row.credits_remaining).toBe(90);
    const out = await charge(0.5);
    expect(out.credits).toBe(1);
    expect(row.credits_remaining).toBe(89);
    expect(calls.filter((c) => c.type === 'rpc' && c.name === 'decrement_ai_credits')).toEqual([expect.objectContaining({ args: { p_org_id: 7, p_cost: 1 } })]);
  });

  it('NaN, -1, "3" (texto), Infinity, -0 y 0 → RangeError; ninguno toca la BD', async () => {
    const { sb, calls, row } = fakeDb();
    __setAiCostClientFactory(() => sb);
    for (const bad of [NaN, -1, '3', Infinity, -0, 0]) {
      await expect(charge(bad)).rejects.toBeInstanceOf(RangeError);
    }
    await expect(charge(NaN)).rejects.toThrow(/importe inválido/);
    await expect(charge('3')).rejects.toThrow(/importe inválido/);
    await expect(charge(-0)).rejects.toThrow(/mínimo 1/);
    expect(calls).toHaveLength(0);
    expect(row.credits_remaining).toBe(90);
  });

  it('credits ausente o null → default (max(1, ceil(units/1000))), no RangeError: units 0 → 1, 2500 → 3', async () => {
    const { sb, row } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 0 })).resolves.toMatchObject({ credits: 1 });
    await expect(chargeAiCredits({ orgId: 7, actionType: 'x', model: 'm', units: 2500, credits: null as unknown as number })).resolves.toMatchObject({ credits: 3 });
    expect(row.credits_remaining).toBe(86);
  });

  it('1.5 → Math.round → 2 (se cobra 2, no 1); 2.4 → 2', async () => {
    const { sb, row } = fakeDb();
    __setAiCostClientFactory(() => sb);
    await expect(charge(1.5)).resolves.toMatchObject({ credits: 2 });
    await expect(charge(2.4)).resolves.toMatchObject({ credits: 2 });
    expect(row.credits_remaining).toBe(86);
  });
});

// ───────────── 4. useCalendarSettings.saveSettings — orden de escritura (QA r3 punto 5) ─────────────

/**
 * Ejecuta el hook como función con un despachador mínimo (React 19 expone
 * `__CLIENT_INTERNALS…H`). `useState` devuelve el inicial (el primero, el de
 * `settings`, con la zona que pide el test), `useCallback` devuelve la función
 * y `useEffect` no se ejecuta (no se carga nada de la BD).
 */
function renderHook(timezone: string) {
  const internals = (React as unknown as { __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown } })
    .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const prev = internals.H;
  let stateIndex = 0;
  const setters: Array<{ name: string; values: unknown[] }> = [];
  internals.H = {
    useState: (init: unknown) => {
      const i = stateIndex++;
      const value = i === 0 ? { ...(init as object), timezone } : typeof init === 'function' ? (init as () => unknown)() : init;
      const rec = { name: `state${i}`, values: [] as unknown[] };
      setters.push(rec);
      return [value, (v: unknown) => { rec.values.push(v); }];
    },
    useCallback: (fn: unknown) => fn,
    useEffect: () => undefined,
  };
  try {
    // Se llama fuera de un componente a propósito: el despachador de arriba
    // sustituye al de React (sin DOM ni renderer en el repo).
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const hook = useCalendarSettings({ organizationId: 7 });
    return { hook, setters };
  } finally {
    internals.H = prev;
  }
}

describe('useCalendarSettings.saveSettings — organizations.timezone se escribe ANTES que organization_settings', () => {
  beforeEach(() => {
    hookDb.order = [];
    hookDb.tzError = null;
    hookDb.existing = true;
    invalidated.length = 0;
  });

  it('zona válida: primero organizations.update, luego organization_settings.update; caché invalidada; success', async () => {
    const { hook } = renderHook('America/Lima');
    await expect(hook.saveSettings()).resolves.toEqual({ success: true, error: null });
    expect(hookDb.order.map((s) => s.split(':')[0])).toEqual(['organizations.update', 'organization_settings.update']);
    expect(hookDb.order[0]).toContain('"timezone":"America/Lima"');
    expect(invalidated).toEqual([7]);
  });

  it('la BD rechaza la zona (22023 del trigger 44): organization_settings NO se toca, el error llega a la UI y la caché no se invalida', async () => {
    hookDb.tzError = { code: '22023', message: 'Zona horaria no reconocida por Postgres: America/Lima' };
    const { hook, setters } = renderHook('America/Lima');
    const out = await hook.saveSettings();
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/Zona horaria rechazada: .*no reconocida/);
    expect(hookDb.order).toEqual(['organizations.update:{"timezone":"America/Lima"}']);
    expect(invalidated).toEqual([]);
    // setError (state4) recibe el mensaje; setOriginalSettings (state1) no se llama.
    expect(setters[4].values).toContain(out.error);
    expect(setters[1].values).toEqual([]);
  });

  it('zona que Node rechaza (EST) → error local sin tocar la BD ni la caché', async () => {
    const { hook } = renderHook('EST');
    await expect(hook.saveSettings()).resolves.toEqual({ success: false, error: 'Zona horaria no reconocida: EST' });
    expect(hookDb.order).toEqual([]);
    expect(invalidated).toEqual([]);
  });

  it('sin fila previa de calendar_settings: organizations.update y después organization_settings.insert', async () => {
    hookDb.existing = false;
    const { hook } = renderHook('America/Bogota');
    await expect(hook.saveSettings()).resolves.toEqual({ success: true, error: null });
    expect(hookDb.order.map((s) => s.split(':')[0])).toEqual(['organizations.update', 'organization_settings.insert']);
    expect(hookDb.order[1]).toContain('"key":"calendar"');
  });

  it('los defaults del calendario llevan una zona que la app y la BD aceptan', () => {
    expect(isSupportedTimeZone(DEFAULT_CALENDAR_SETTINGS.timezone)).toBe(true);
  });
});
