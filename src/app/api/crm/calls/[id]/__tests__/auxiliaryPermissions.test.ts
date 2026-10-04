import { NextRequest } from 'next/server';
import { FakeDb } from '@/lib/services/crm/__tests__/fixtures/fakeSupabase';

const CALL_ID = '11111111-1111-4111-8111-111111111111';
const TAG_ID = '22222222-2222-4222-8222-222222222222';
let db: FakeDb;
let roleId = 3;
const permissions = new Set<string>();

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: 7, userId: 'usuario', roleId, roleName: 'Administrador', isSuperAdmin: false, supabase: db.client() })),
  hasOrgAdminOrPermission: jest.fn(async (ctx: { roleId: number; isSuperAdmin: boolean }, code: string) =>
    jest.requireActual('@/lib/utils/orgAdmin').isOrgAdminLike(ctx) || permissions.has(code)),
  isOrgAdminContext: (ctx: { roleId: number; isSuperAdmin: boolean }) => jest.requireActual('@/lib/utils/orgAdmin').isOrgAdminLike(ctx),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => db.client()) }));
jest.mock('@/lib/services/crm/callAnalysisService', () => ({
  getAnalysis: jest.fn(async () => ({ id: '33333333-3333-4333-8333-333333333333', summary: 'Resumen', raw_response: {} })),
  applyAnalysis: jest.fn(async () => ({ applied: [], skipped: [], analysis: {} })),
  AnalysisError: class extends Error {},
}));
jest.mock('@/lib/services/crm/transcriptionService', () => ({
  getTranscript: jest.fn(async () => ({ id: 'transcripcion', status: 'completed', provider: 'openai' })),
  expireStuckTranscript: jest.fn(async () => null),
  isLiveAttempt: jest.fn(() => false),
  TranscriptionError: class extends Error {},
}));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({
  enqueueAnalyze: jest.fn(), runAnalysisPipeline: jest.fn(), findLiveCallJob: jest.fn(), forceRetryBucket: jest.fn(),
  enqueueTranscribe: jest.fn(), runTranscribePipeline: jest.fn(),
}));
jest.mock('@/lib/services/crm/aiCostService', () => ({ InsufficientCreditsError: class extends Error {} }));
jest.mock('@/lib/services/crm/stt', () => ({ normalizeSttProvider: () => null }));
jest.mock('@/lib/services/crm/callTagService', () => ({
  getCallTagsForCall: jest.fn(async () => []),
  tagCall: jest.fn(async () => ({ id: 'relacion' })),
}));

import { getServiceClient } from '@/lib/supabase/server-service';
import { getAnalysis, applyAnalysis } from '@/lib/services/crm/callAnalysisService';
import { expireStuckTranscript } from '@/lib/services/crm/transcriptionService';
import { tagCall } from '@/lib/services/crm/callTagService';
import { GET as analyzeGet, POST as analyzePost } from '../analyze/route';
import { GET as analysisGet } from '../analysis/route';
import { POST as applyPost } from '../analysis/apply/route';
import { POST as transcribePost } from '../transcribe/route';
import { GET as transcriptGet } from '../transcript/route';
import { GET as tagsGet, POST as tagsPost } from '../tags/route';
import { POST as linkPost } from '../link/route';

const readers = [
  { name: 'analyze', handler: analyzeGet },
  { name: 'analysis', handler: analysisGet },
  { name: 'transcript', handler: transcriptGet },
  { name: 'tags', handler: tagsGet },
];
const writers = [
  { name: 'analyze', handler: analyzePost, body: {} },
  { name: 'analysis/apply', handler: applyPost, body: {} },
  { name: 'transcribe', handler: transcribePost, body: {} },
  { name: 'tags', handler: tagsPost, body: { tagId: TAG_ID } },
  { name: 'link', handler: linkPost, body: {} },
];
const aliases = ['organization_id', 'organizationId', 'orgId', 'org_id'];
const params = { params: Promise.resolve({ id: CALL_ID }) };

function request(method: 'GET' | 'POST', name: string, body: object = {}, query = '') {
  return new NextRequest(`https://crm.test/api/crm/calls/${CALL_ID}/${name}${query}`, {
    method,
    ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  permissions.clear();
  roleId = 3;
  db = new FakeDb({ tables: {
    calls: [{ id: CALL_ID, organization_id: 7, user_id: 'otro', customer_id: null, opportunity_id: null }],
    call_tags: [{ id: TAG_ID, organization_id: 7 }],
  } });
  db.rpcImpl.fn_crm_vincular_llamada = (args) => {
    const call = db.rows('calls').find((row) => row.id === args.p_call && row.organization_id === args.p_org);
    if (!call) throw new Error('llamada inexistente');
    return { call: structuredClone(call) };
  };
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe.each(readers)('GET $name', ({ name, handler }) => {
  it('exige propietario o view_all y el nombre del rol no concede acceso', async () => {
    expect((await handler(request('GET', name), params)).status).toBe(403);
    expect(getAnalysis).not.toHaveBeenCalled();
    permissions.add('crm.calls.view_all');
    expect((await handler(request('GET', name), params)).status).toBe(200);
  });

  it('permite propietario y administrador; author null no convierte a un miembro en dueño', async () => {
    db.rows('calls')[0].user_id = null;
    expect((await handler(request('GET', name), params)).status).toBe(403);
    db.rows('calls')[0].user_id = 'usuario';
    expect((await handler(request('GET', name), params)).status).toBe(200);
    db.rows('calls')[0].user_id = null;
    roleId = 2;
    expect((await handler(request('GET', name), params)).status).toBe(200);
  });

  it.each(aliases)('rechaza %s ajena en query antes de consultar la llamada', async (key) => {
    permissions.add('crm.calls.view_all');
    const response = await handler(request('GET', name, {}, `?${key}=8`), params);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, code: 'FOREIGN_ORGANIZATION' });
    expect(db.calls).toHaveLength(0);
  });
});

describe.each(writers)('POST $name', ({ name, handler, body }) => {
  it('view_all sigue siendo lectura: deniega gestión antes de datos, servicios y escrituras', async () => {
    permissions.add('crm.calls.view_all');
    const response = await handler(request('POST', name, body), params);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ success: false, code: 'CRM_FORBIDDEN' });
    expect(getServiceClient).not.toHaveBeenCalled();
    expect(getAnalysis).not.toHaveBeenCalled();
    expect(applyAnalysis).not.toHaveBeenCalled();
    expect(tagCall).not.toHaveBeenCalled();
    expect(db.calls.some((call) => call.op !== 'select')).toBe(false);
  });

  it('permite propietario, edit_any y administrador; nullowner exige gestión', async () => {
    db.rows('calls')[0].user_id = null;
    expect((await handler(request('POST', name, body), params)).status).toBe(403);
    permissions.add('crm.activities.edit_any');
    expect((await handler(request('POST', name, body), params)).status).toBeLessThan(400);
    permissions.clear();
    db.rows('calls')[0].user_id = 'usuario';
    expect((await handler(request('POST', name, body), params)).status).toBeLessThan(400);
    db.rows('calls')[0].user_id = 'otro';
    roleId = 2;
    expect((await handler(request('POST', name, body), params)).status).toBeLessThan(400);
  });

  it.each(aliases)('%s ajena en body o query es JSON403 antes de cualquier servicio', async (key) => {
    db.rows('calls')[0].user_id = 'usuario';
    for (const req of [request('POST', name, { ...body, [key]: 8 }), request('POST', name, body, `?${key}=8`)]) {
      const response = await handler(req, params);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ success: false, code: 'FOREIGN_ORGANIZATION' });
    }
    expect(db.calls).toHaveLength(0);
    expect(getServiceClient).not.toHaveBeenCalled();
  });

  it.each(aliases)('conserva el contrato cuando %s coincide con la sesión', async (key) => {
    db.rows('calls')[0].user_id = 'usuario';
    expect((await handler(request('POST', name, { ...body, [key]: 7 }, `?${key}=7`), params)).status).toBeLessThan(400);
  });
});

describe.each([...readers.map((entry) => ({ ...entry, method: 'GET' as const, body: {} })), ...writers.map((entry) => ({ ...entry, method: 'POST' as const }))])('$method $name identidad del recurso', ({ name, handler, body, method }) => {
  it('valida UUID y rechaza llamadas de otro tenant aunque tenga permisos', async () => {
    roleId = 2;
    expect((await handler(request(method, name, body), { params: Promise.resolve({ id: 'invalido' }) })).status).toBe(400);
    expect(db.calls).toHaveLength(0);
    db.rows('calls')[0].organization_id = 8;
    expect((await handler(request(method, name, body), params)).status).toBe(404);
    // edit_any admite una lectura interna de gestión de tags id/org, sin
    // conceder lecturas públicas ni permitir una escritura de otro tenant.
    if (method === 'POST' && name === 'tags') {
      expect(tagCall).not.toHaveBeenCalled();
      expect(db.calls.some(call => call.op !== 'select')).toBe(false);
    } else expect(getServiceClient).not.toHaveBeenCalled();
  });
});

it('el lector view_all de transcript no caduca ni modifica una transcripción', async () => {
  const { getTranscript } = await import('@/lib/services/crm/transcriptionService');
  jest.mocked(getTranscript).mockResolvedValueOnce({ id: 'transcripcion', status: 'processing', provider: 'openai' } as never);
  permissions.add('crm.calls.view_all');
  expect((await transcriptGet(request('GET', 'transcript'), params)).status).toBe(200);
  expect(expireStuckTranscript).not.toHaveBeenCalled();
  jest.mocked(getTranscript).mockResolvedValueOnce({ id: 'transcripcion', status: 'processing', provider: 'openai' } as never);
  permissions.add('crm.activities.edit_any');
  expect((await transcriptGet(request('GET', 'transcript'), params)).status).toBe(200);
  expect(expireStuckTranscript).toHaveBeenCalledTimes(1);
});

it('un fallo de carga de la llamada responde 500 sin filtrar el error interno', async () => {
  db.failOn['calls:select'] = 'detalle interno de infraestructura';
  const response = await analyzePost(request('POST', 'analyze'), params);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: 'Error interno' });
  expect(getServiceClient).not.toHaveBeenCalled();
});

it('link devuelve la denegación atómica si el dueño cambió después de autorizar la primera lectura', async () => {
  db.rows('calls')[0].user_id = 'usuario';
  const client = db.client();
  const rpc = client.rpc.bind(client);
  // Frontera del doble: estas rutas sólo await RPC, no usan su filter builder.
  client.rpc = (async (name: string, args?: Record<string, unknown>) => {
    if (name === 'fn_crm_vincular_llamada') {
      db.rows('calls')[0].user_id = 'otro';
      return { data: null, error: { code: '42501', message: 'no_es_propia' } };
    }
    return rpc(name, args);
  }) as unknown as typeof client.rpc;
  const { getServerOrgContext } = await import('@/lib/utils/orgContext');
  jest.mocked(getServerOrgContext).mockResolvedValueOnce({ organizationId: 7, userId: 'usuario', roleId, roleName: 'Administrador', isSuperAdmin: false, supabase: client } as never);
  const response = await linkPost(request('POST', 'link', { idempotency_key: '11111111-1111-4111-8111-111111111119', create_customer: { first_name: 'Contacto', phone: '3001234567' } }), params);
  expect(response.status).toBe(403);
  expect(getServiceClient).not.toHaveBeenCalled();
  expect(db.calls.some((call) => call.op !== 'select')).toBe(false);
});

it.each(['outbound_jobs', 'call_recordings'])('transcript no convierte un error de %s en datos vacíos exitosos', async (table) => {
  permissions.add('crm.calls.view_all');
  db.failOn[`${table}:select`] = 'detalle interno de infraestructura';
  const response = await transcriptGet(request('GET', 'transcript'), params);
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ success: false, error: 'Error interno' });
});
