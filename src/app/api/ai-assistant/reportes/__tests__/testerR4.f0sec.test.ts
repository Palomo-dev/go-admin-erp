/// <reference types="jest" />
/**
 * F0-SEC r4 · tester · `POST /api/ai-assistant/reportes`.
 *
 * Sondas sobre los cambios r4 (lista blanca en servidor, `context` por
 * `readOrgBody`, rol de sesión):
 *
 *  - Sesión de OTRA organización (8) con un body «de la 7»: 403 por el
 *    `context.organizationId`; y sin él, los módulos se leen de la 8 (sesión),
 *    nunca de la 7.
 *  - `context` con `orgId` / `organization_id` / `org_id`, con `'8 '`, `8.0`,
 *    `'7abc'`; `context` como array (ANOTADO: `readOrgBody` no mira dentro de
 *    arrays; efecto seguro porque la organización se sobrescribe con la de
 *    sesión).
 *  - `modulosActivos` fuera del plan mezclado con uno del plan, con mayúsculas,
 *    duplicados, con `__proto__`, con 10 000 elementos; `getActiveModules`
 *    lanza → 500 sin OpenAI (fail-closed); devuelve `[]` → nada disponible.
 *  - Orden: sin sesión → 401 antes de leer módulos; 403 antes de módulos; los
 *    módulos se leen ANTES de OpenAI y de los créditos.
 *  - `userRole` del body no llega al prompt aunque `ctx.roleName` falte.
 *
 * Organizaciones ficticias (7, 8); sin credenciales reales.
 */
import { NextRequest } from 'next/server';

type RpcResult = { data: unknown; error: { code: string; message: string } | null };
const sessionRpc = jest.fn(async (): Promise<RpcResult> => ({ data: { total_pipeline: 10, forecast: 5, por_etapa: [] }, error: null }));
const fromCalls: string[] = [];
function chain() {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'in', 'neq', 'is', 'limit']) b[m] = () => b;
  b.then = (res: (x: unknown) => void) => res({ data: [], error: null });
  return b;
}
const SESSION_CLIENT = { rpc: sessionRpc, from: (t: string) => { fromCalls.push(t); return chain(); } };

let sessionOrg: number | null = 7;
let roleName: string | null = 'employee';
jest.mock('@/lib/utils/orgContext', () => {
  const { OrgContextError } = jest.requireActual('@/lib/utils/orgContextError');
  return {
    getServerOrgContext: async () => {
      if (sessionOrg === null) throw new OrgContextError('No autenticado', 401, 'UNAUTHENTICATED');
      return { organizationId: sessionOrg, userId: 'user-1', roleName, supabase: SESSION_CLIENT };
    },
    OrgContextError,
  };
});
jest.mock('@/lib/supabase/config', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
const modulesByOrg: Record<number, string[]> = { 7: ['crm'], 8: ['crm', 'hrm'] };
const getActiveModules = jest.fn<Promise<Array<{ code: string }>>, [number, unknown]>(async (orgId) => (modulesByOrg[orgId] ?? []).map((code) => ({ code })));
jest.mock('@/lib/services/moduleManagementService', () => ({
  moduleManagementService: { getActiveModules: (orgId: number, client: unknown) => getActiveModules(orgId, client) },
}));
const callOrder: string[] = [];
const checkCredits = jest.fn<Promise<{ allowed: boolean; error?: string }>, [unknown]>(async () => { callOrder.push('credits'); return { allowed: true }; });
jest.mock('@/lib/services/aiCreditsService', () => ({
  checkAICredits: (orgId: unknown) => checkCredits(orgId),
  estimateCredits: () => 1,
  consumeAICredits: async () => true,
}));
let aiReply = 'Nómina.\n```report\n{"reportId":"hrm-nomina"}\n```';
const chatCreate = jest.fn(async () => { callOrder.push('openai'); return { choices: [{ message: { content: aiReply } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }; });
jest.mock('openai', () => ({ __esModule: true, default: class { chat = { completions: { create: chatCreate } }; } }));

import { POST } from '../route';
import type { PeriodoCierre } from '@/lib/services/reportes/types';

const periodo: PeriodoCierre = { tipo: 'mensual', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', etiqueta: 'Septiembre 2026' } as PeriodoCierre;
const originalKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  sessionRpc.mockClear(); chatCreate.mockClear(); checkCredits.mockClear(); getActiveModules.mockClear();
  getActiveModules.mockImplementation(async (orgId) => { callOrder.push('modules'); return (modulesByOrg[orgId] ?? []).map((code) => ({ code })); });
  fromCalls.length = 0; callOrder.length = 0;
  sessionOrg = 7; roleName = 'employee';
  aiReply = 'Nómina.\n```report\n{"reportId":"hrm-nomina"}\n```';
  process.env.OPENAI_API_KEY = 'sk-test-clave-de-prueba-no-real';
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey; });

function postRaw(raw: string) {
  return POST(new NextRequest('http://localhost/api/ai-assistant/reportes', { method: 'post', headers: { 'content-type': 'application/json' }, body: raw }));
}
const post = (body: unknown) => postRaw(JSON.stringify(body));
const base = { message: 'muéstrame la nómina', conversationHistory: [], context: { organizationId: 7, userName: 'u', userRole: 'employee', branchId: null }, periodoActual: periodo };
const contentOf = async (res: Response) => String((await res.json()).content);
const systemPrompt = () => ((chatCreate.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content: string }> }])[0].messages.find((m) => m.role === 'system')?.content ?? '');

describe('sesión de otra organización', () => {
  test('sesión de la org 8 con context.organizationId = 7 → 403 FOREIGN_ORGANIZATION; ni módulos, ni créditos, ni OpenAI', async () => {
    sessionOrg = 8;
    const res = await post({ ...base, modulosActivos: ['hrm'] });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(getActiveModules).not.toHaveBeenCalled();
    expect(checkCredits).not.toHaveBeenCalled();
    expect(chatCreate).not.toHaveBeenCalled();
  });

  test('sesión de la org 8 sin organizationId en el context → los módulos se leen de la 8 (sesión) y hrm se ejecuta porque la 8 SÍ lo tiene; la RPC y créditos van a la 8', async () => {
    sessionOrg = 8;
    const { organizationId: _o, ...ctx } = base.context;
    void _o;
    const res = await post({ ...base, context: ctx, modulosActivos: ['hrm'] });
    expect(res.status).toBe(200);
    expect(getActiveModules).toHaveBeenCalledWith(8, SESSION_CLIENT);
    expect(getActiveModules).not.toHaveBeenCalledWith(7, expect.anything());
    expect(checkCredits).toHaveBeenCalledWith(8);
    expect(fromCalls).toEqual(['payroll_periods']);
  });

  test('sin sesión → 401 sin leer módulos', async () => {
    sessionOrg = null;
    expect((await post({ ...base, modulosActivos: ['hrm'] })).status).toBe(401);
    expect(getActiveModules).not.toHaveBeenCalled();
  });

  test('sin sesión y body no JSON → 401 (la sesión va antes que el body)', async () => {
    sessionOrg = null;
    expect((await postRaw('{no json')).status).toBe(401);
  });
});

describe('context: claves alternativas y tipos', () => {
  test.each<[string, Record<string, unknown>]>([
    ['orgId: 8', { orgId: 8 }],
    ['organization_id: 8', { organization_id: 8 }],
    ['org_id: "8"', { org_id: '8' }],
    ['organizationId: "8 "', { organizationId: '8 ' }],
    ['organizationId: "7abc" (NaN ≠ 7)', { organizationId: '7abc' }],
    ['organizationId: 8 y organization_id: 7 (una ajena basta)', { organizationId: 8, organization_id: 7 }],
    ['organizationId: 7 y orgId: 8', { organizationId: 7, orgId: 8 }],
  ])('context con %s → 403 FOREIGN_ORGANIZATION y registro', async (_l, extra) => {
    const res = await post({ ...base, context: { ...base.context, organizationId: undefined, ...extra } });
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('FOREIGN_ORGANIZATION');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ajeno'), expect.objectContaining({ session: 7 }));
    expect(getActiveModules).not.toHaveBeenCalled();
  });

  test.each<[string, unknown]>([
    ['"7" (string)', '7'],
    ['7.0', 7.0],
    ['" 7 "', ' 7 '],
    ['null', null],
    ['""', ''],
  ])('context.organizationId = %s → 200 y la organización efectiva es la de la sesión (7)', async (_l, v) => {
    const res = await post({ ...base, context: { ...base.context, organizationId: v } });
    expect(res.status).toBe(200);
    expect(checkCredits).toHaveBeenCalledWith(7);
    expect(getActiveModules).toHaveBeenCalledWith(7, SESSION_CLIENT);
  });

  test('ANOTADO (bajo): context como ARRAY [{organizationId: 8}] esquiva el 403 (readOrgBody no mira dentro de arrays); efecto seguro: créditos y RPC van a la 7', async () => {
    const res = await post({ ...base, context: [{ organizationId: 8 }] });
    expect(res.status).toBe(200);
    expect(checkCredits).toHaveBeenCalledWith(7);
    expect(getActiveModules).toHaveBeenCalledWith(7, SESSION_CLIENT);
    expect(fromCalls).toEqual([]); // la 7 no tiene hrm
  });

  test('ANOTADO (bajo): context como string / número / true NO da 400: se acepta (200) y la organización efectiva sigue siendo la de sesión; nunca 500', async () => {
    for (const ctx of ['8', 8, true]) {
      checkCredits.mockClear();
      const res = await post({ ...base, context: ctx });
      expect(res.status).toBe(200);
      expect(checkCredits).toHaveBeenCalledWith(7);
    }
  });

  test('context con __proto__ (JSON) no rompe ni cambia la organización', async () => {
    const res = await postRaw(JSON.stringify(base).replace('"context":{', '"context":{"__proto__":{"organizationId":8},'));
    expect(res.status).toBe(200);
    expect(checkCredits).toHaveBeenCalledWith(7);
  });

  test('organizationId ajeno en la raíz Y context correcto → 403 (la raíz se comprueba primero)', async () => {
    const res = await post({ ...base, organizationId: 8 });
    expect(res.status).toBe(403);
    expect(getActiveModules).not.toHaveBeenCalled();
  });
});

describe('modulosActivos · bordes de la intersección', () => {
  test('["crm","hrm"] con plan ["crm"] → crm se conserva, hrm se ignora con aviso que lista solo el ajeno', async () => {
    aiReply = 'Funnel.\n```report\n{"reportId":"crm-funnel"}\n```';
    const res = await post({ ...base, modulosActivos: ['crm', 'hrm'] });
    expect(res.status).toBe(200);
    expect(sessionRpc).toHaveBeenCalledWith('fn_reporte_crm_funnel', expect.objectContaining({ p_organization_id: 7 }));
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('fuera del plan'), expect.objectContaining({ fueraDelPlan: ['hrm'] }));
  });

  test('mayúsculas ["HRM"], duplicados, espacios: no amplían (hrm-nomina no disponible) y payroll_periods no se consulta', async () => {
    for (const raw of [['HRM'], ['hrm', 'hrm', 'hrm'], [' hrm '], ['hrm\u0000']]) {
      const res = await post({ ...base, modulosActivos: raw });
      expect(res.status).toBe(200);
      expect(await contentOf(res)).toContain('no está disponible');
    }
    expect(fromCalls).toEqual([]);
  });

  test('10 000 elementos → 200 sin ampliar (coste lineal, sin explosión)', async () => {
    const res = await post({ ...base, modulosActivos: Array.from({ length: 10_000 }, (_, i) => `m-${i}`).concat(['hrm']) });
    expect(res.status).toBe(200);
    expect(fromCalls).toEqual([]);
  });

  test('["__proto__", "constructor"] no rompe ni amplía', async () => {
    const res = await post({ ...base, modulosActivos: ['__proto__', 'constructor', 'hrm'] });
    expect(res.status).toBe(200);
    expect(fromCalls).toEqual([]);
  });

  test('getActiveModules lanza → 500 sin OpenAI ni créditos (fail-closed: sin plan no hay lista blanca)', async () => {
    getActiveModules.mockImplementationOnce(async () => { throw new Error('permission denied for table organization_modules'); });
    const res = await post({ ...base, modulosActivos: ['crm'] });
    expect(res.status).toBe(500);
    expect(chatCreate).not.toHaveBeenCalled();
    expect(checkCredits).not.toHaveBeenCalled();
    expect(sessionRpc).not.toHaveBeenCalled();
  });

  test('getActiveModules devuelve [] → ningún reporte disponible, ni siquiera crm', async () => {
    getActiveModules.mockImplementationOnce(async () => []);
    aiReply = 'Funnel.\n```report\n{"reportId":"crm-funnel"}\n```';
    const res = await post({ ...base, modulosActivos: ['crm'] });
    expect(res.status).toBe(200);
    expect(await contentOf(res)).toContain('no está disponible');
    expect(sessionRpc).not.toHaveBeenCalled();
  });

  test('orden: los módulos se leen ANTES de los créditos y de OpenAI', async () => {
    await post({ ...base, modulosActivos: ['crm'] });
    expect(callOrder.indexOf('modules')).toBeLessThan(callOrder.indexOf('credits'));
    expect(callOrder.indexOf('modules')).toBeLessThan(callOrder.indexOf('openai'));
  });

  test('modulosActivos: null → se usan todos los del plan (como ausente)', async () => {
    sessionOrg = 8;
    const { organizationId: _o, ...ctx } = base.context;
    void _o;
    const res = await post({ ...base, context: ctx, modulosActivos: null });
    expect(res.status).toBe(200);
    expect(fromCalls).toEqual(['payroll_periods']);
  });
});

describe('rol en el prompt', () => {
  test('ctx.roleName ausente → "Rol: miembro"; el userRole del body ("owner") nunca aparece', async () => {
    roleName = null;
    await post({ ...base, context: { ...base.context, userRole: 'owner' } });
    expect(systemPrompt()).toContain('Rol: miembro');
    expect(systemPrompt()).not.toContain('owner');
  });

  test('ctx.roleName = "gerente" → "Rol: gerente" aunque el body diga otra cosa', async () => {
    roleName = 'gerente';
    await post({ ...base, context: { ...base.context, userRole: 'super-admin' } });
    expect(systemPrompt()).toContain('Rol: gerente');
    expect(systemPrompt()).not.toContain('super-admin');
  });
});
