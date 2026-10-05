import { NextRequest } from 'next/server';
import { FakeDb, type FakeMutationBuilder } from '@/lib/services/crm/__tests__/fixtures/fakeSupabase';

const ORG = 120;
const USER = '10000000-0000-4000-8000-000000000001';
const CALL = '10000000-0000-4000-8000-000000000002';
const CUSTOMER = '10000000-0000-4000-8000-000000000003';
const OPPORTUNITY = '10000000-0000-4000-8000-000000000004';
const OTHER_CUSTOMER = '10000000-0000-4000-8000-000000000005';
const TAG = '10000000-0000-4000-8000-000000000006';
let db: FakeDb;
let sessionHidesOtherCalls = false;
const permissions = new Set<string>();

function sessionClient() {
  const session = db.client();
  const from = session.from.bind(session);
  session.from = ((table: string) => table === 'calls' && sessionHidesOtherCalls
    ? new FakeDb({ tables: { calls: db.rows('calls').filter(call => call.user_id === USER) } }).client().from(table)
    : from(table)) as typeof session.from;
  return session;
}

jest.mock('@/lib/utils/orgContext', () => ({
  OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError,
  getServerOrgContext: jest.fn(async () => ({ organizationId: ORG, userId: USER, roleId: 4, isSuperAdmin: false, supabase: sessionClient() })),
  hasOrgAdminOrPermission: jest.fn(async (_ctx: unknown, code: string) => permissions.has(code)),
}));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => db.client()) }));
jest.mock('@/lib/services/crm/manualCallService', () => ({
  ...jest.requireActual('@/lib/services/crm/manualCallService'),
  resolveManualAudioMaxBytes: jest.fn(async () => ({ maxBytes: 25000000, source: 'chain' })),
  createManualCallWithAudio: jest.fn(async () => ({ callId: CALL, recordingId: 'grabacion', activityId: null, durationSeconds: 10 })),
}));
jest.mock('@/lib/services/crm/callIntelligenceService', () => ({
  enqueueTranscribe: jest.fn(async () => 'trabajo'),
  runTranscribePipeline: jest.fn(),
}));
jest.mock('@/lib/services/crm/transcriptionService', () => ({ TranscriptionError: class extends Error {} }));
jest.mock('@/lib/services/crm/callAnalysisService', () => ({ AnalysisError: class extends Error {} }));

import { GET, PATCH } from '../[id]/route';
import { GET as tagsGet, POST as tagsPost } from '../[id]/tags/route';
import { POST } from '../manual/route';
import { getServiceClient } from '@/lib/supabase/server-service';
import { createManualCallWithAudio, resolveManualAudioMaxBytes } from '@/lib/services/crm/manualCallService';
import { enqueueTranscribe, runTranscribePipeline } from '@/lib/services/crm/callIntelligenceService';

function patchRequest() {
  return new NextRequest(`https://crm.test/api/crm/calls/${CALL}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ live_note: 'Seguimiento' }),
  });
}

function tagsRequest(tagId = TAG) {
  return new NextRequest(`https://crm.test/api/crm/calls/${CALL}/tags`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tagId }),
  });
}

function manualRequest(fields: Record<string, string> = { opportunity_id: OPPORTUNITY, customer_id: CUSTOMER }) {
  const form = new FormData();
  form.set('audio', new Blob([new Uint8Array(64)], { type: 'audio/wav' }), 'audio.wav');
  form.set('recording_declaration', 'true');
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest('https://crm.test/api/crm/calls/manual', { method: 'POST', body: form });
}

const params = { params: Promise.resolve({ id: CALL }) };
const previousFlag = process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
beforeAll(() => { delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; });
afterAll(() => {
  if (previousFlag === undefined) delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  else process.env.CRM_CALL_ATOMIC_RPC_ENABLED = previousFlag;
});

beforeEach(() => {
  jest.clearAllMocks();
  permissions.clear();
  sessionHidesOtherCalls = false;
  db = new FakeDb({ tables: {
    calls: [{ id: CALL, organization_id: ORG, user_id: USER, customer_id: CUSTOMER, opportunity_id: OPPORTUNITY, status: 'completed', metadata: {} }],
    customers: [{ id: CUSTOMER, organization_id: ORG, branch_id: 10 }],
    opportunities: [{ id: OPPORTUNITY, organization_id: ORG, customer_id: CUSTOMER, branch_id: 11 }],
    branches: [{ id: 10, organization_id: ORG }, { id: 11, organization_id: ORG }],
    call_tags: [{ id: TAG, organization_id: ORG }],
  }, rpc: {
    app_branch_access: () => true,
    fn_crm_callback_llamada: (args) => ({ stale: false, call: { ...db.rows('calls')[0], ...args.p_patch } }),
  } });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

function expectNoEffects(serviceReadAllowed = false) {
  if (!serviceReadAllowed) expect(getServiceClient).not.toHaveBeenCalled();
  expect(resolveManualAudioMaxBytes).not.toHaveBeenCalled();
  expect(createManualCallWithAudio).not.toHaveBeenCalled();
  expect(enqueueTranscribe).not.toHaveBeenCalled();
  expect(runTranscribePipeline).not.toHaveBeenCalled();
  expect(db.calls.filter(query => query.op !== 'select')).toHaveLength(0);
  expect(db.rpcCalls.filter(query => query.name !== 'app_branch_access')).toHaveLength(0);
  expect(db.storageCalls).toHaveLength(0);
}

const rejectedScopes: Array<[string, () => void, number]> = [
  ['cliente de otro tenant', () => { db.rows('customers')[0].organization_id = 121; }, 404],
  ['oportunidad de otro tenant', () => { db.rows('opportunities')[0].organization_id = 121; }, 404],
  ['sucursal ajena del cliente', () => { db.rpcImpl.app_branch_access = args => args.p_branch_id !== 10; }, 403],
  ['sucursal ajena de la oportunidad', () => { db.rpcImpl.app_branch_access = args => args.p_branch_id !== 11; }, 403],
  ['sucursal del cliente perteneciente a otro tenant', () => { db.rows('branches')[0].organization_id = 121; }, 403],
  ['sucursal de oportunidad perteneciente a otro tenant', () => { db.rows('branches')[1].organization_id = 121; }, 403],
  ['cliente distinto del cliente de la oportunidad', () => { db.rows('opportunities')[0].customer_id = OTHER_CUSTOMER; }, 400],
  ['error al resolver el cliente', () => { db.failOn['customers:select'] = 'error de lectura'; }, 500],
  ['error al resolver la sucursal', () => { db.failOn['branches:select'] = 'error de lectura'; }, 500],
];

it.each(rejectedScopes)('rechaza %s sin escrituras, audio ni trabajos para dueño y edit_any', async (_label, prepare, status) => {
  prepare();
  for (const manager of [false, true]) {
    if (manager) permissions.add('crm.activities.edit_any');
    expect((await PATCH(patchRequest(), params)).status).toBe(status);
    expect((await POST(manualRequest())).status).toBe(status);
    expect((await tagsPost(tagsRequest(), params)).status).toBe(status);
    expectNoEffects(manager);
  }
});

it('view_all no concede edición y edit_any permite la nota ajena sólo con ambas sucursales autorizadas', async () => {
  db.rows('calls')[0].user_id = 'otro';
  permissions.add('crm.calls.view_all');
  expect((await PATCH(patchRequest(), params)).status).toBe(403);
  expectNoEffects();
  permissions.add('crm.activities.edit_any');
  expect((await PATCH(patchRequest(), params)).status).toBe(200);
  expect(db.rpcCalls.filter(query => query.name === 'fn_crm_callback_llamada')).toHaveLength(1);
});

it('el dueño guarda su nota mediante el CAS nativo sin permiso de ver llamadas ajenas', async () => {
  expect((await PATCH(patchRequest(), params)).status).toBe(200);
  expect(db.rpcCalls.filter(query => query.name === 'fn_crm_callback_llamada')[0].args.p_patch)
    .toEqual({ metadata: { live_note: 'Seguimiento' } });
});

it('un cargo con edit_any y sin view_all gestiona nota y etiquetas sin ampliar GET, listado ni audio', async () => {
  db.rows('calls')[0].user_id = 'otro';
  sessionHidesOtherCalls = true;
  permissions.add('crm.activities.edit_any');
  expect((await PATCH(patchRequest(), params)).status).toBe(200);
  expect((await tagsPost(tagsRequest(), params)).status).toBe(201);
  expect(db.rows('call_tag_relations')).toEqual([expect.objectContaining({ organization_id: ORG, call_id: CALL, tag_id: TAG })]);
  const writes = db.calls.filter(query => query.op !== 'select').length;
  expect((await GET(patchRequest(), params)).status).toBe(404);
  expect((await tagsGet(tagsRequest(), params)).status).toBe(404);
  expect(db.calls.filter(query => query.op !== 'select')).toHaveLength(writes);
});

it('view_all permite consultar pero no escribir etiquetas con el cliente de servicio', async () => {
  db.rows('calls')[0].user_id = 'otro';
  permissions.add('crm.calls.view_all');
  expect((await tagsGet(tagsRequest(), params)).status).toBe(200);
  expect((await tagsPost(tagsRequest(), params)).status).toBe(403);
  expectNoEffects();
});

it('el propietario etiqueta su llamada mediante el writer existente', async () => {
  expect((await tagsPost(tagsRequest(), params)).status).toBe(201);
  expect(db.rows('call_tag_relations')[0]).toMatchObject({ organization_id: ORG, call_id: CALL, tag_id: TAG, source: 'manual' });
});

it('una etiqueta de otro tenant no puede vincularse aunque el gestor tenga edit_any', async () => {
  db.rows('call_tags')[0].organization_id = 121;
  permissions.add('crm.activities.edit_any');
  expect((await tagsPost(tagsRequest(), params)).status).toBe(404);
  expectNoEffects(true);
});

it('si cambian las referencias durante el CAS, revalida la sucursal antes de intentar otra escritura', async () => {
  db.rows('customers').push({ id: OTHER_CUSTOMER, organization_id: ORG, branch_id: 12 });
  db.rows('branches').push({ id: 12, organization_id: ORG });
  db.rpcImpl.app_branch_access = args => args.p_branch_id !== 12;
  db.rpcImpl.fn_crm_callback_llamada = () => ({ stale: true, call: {
    ...db.rows('calls')[0], customer_id: OTHER_CUSTOMER, opportunity_id: null,
  } });
  expect((await PATCH(patchRequest(), params)).status).toBe(403);
  expect(db.rpcCalls.filter(query => query.name === 'fn_crm_callback_llamada')).toHaveLength(1);
  expect(db.rows('calls')[0].metadata).toEqual({});
});

it('la disposición heredada espera la revalidación async y no crea seguimiento tras perder acceso en el reintento', async () => {
  process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false';
  db.rows('customers').push({ id: OTHER_CUSTOMER, organization_id: ORG, branch_id: 12 });
  db.rows('branches').push({ id: 12, organization_id: ORG });
  db.rpcImpl.app_branch_access = args => args.p_branch_id !== 12;
  const service = db.client();
  const from = service.from.bind(service);
  let raced = false;
  // Frontera explícita del doble: sólo intercepta el CAS de una fila de llamadas.
  service.from = ((table: string) => {
    const builder = from(table) as unknown as FakeMutationBuilder;
    const update = builder.update.bind(builder);
    builder.update = (patch: object) => {
      if (table === 'calls' && !raced) {
        raced = true;
        db.rows('calls')[0] = { ...db.rows('calls')[0], customer_id: OTHER_CUSTOMER, opportunity_id: null };
      }
      return update(patch);
    };
    return builder;
  }) as unknown as typeof service.from;
  jest.mocked(getServiceClient).mockReturnValueOnce(service);
  const request = new NextRequest(`https://crm.test/api/crm/calls/${CALL}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ disposition: { outcome: 'answered', next_action: { type: 'task', title: 'Seguimiento' } } }),
  });
  try {
    expect((await PATCH(request, params)).status).toBe(403);
    expect(db.rows('calls')[0].metadata).toEqual({});
    expect(db.rows('tasks')).toHaveLength(0);
    expect(db.rows('activities')).toHaveLength(0);
    expect(db.calls.filter(query => query.op === 'update')).toHaveLength(1);
  } finally {
    delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  }
});

it('la subida con oportunidad sola completa el cliente canónico y usa el writer de audio y cola existentes', async () => {
  expect((await POST(manualRequest({ opportunity_id: OPPORTUNITY }))).status).toBe(201);
  expect(createManualCallWithAudio).toHaveBeenCalledWith(ORG, USER, expect.objectContaining({
    opportunityId: OPPORTUNITY, customerId: CUSTOMER, recordingDeclaration: true,
  }), expect.anything());
  expect(enqueueTranscribe).toHaveBeenCalledWith(ORG, CALL, { recording_id: 'grabacion' }, expect.anything());
});

it('ambas referencias globales sin sucursal conservan el flujo autorizado', async () => {
  db.rows('customers')[0].branch_id = null;
  db.rows('opportunities')[0].branch_id = null;
  expect((await PATCH(patchRequest(), params)).status).toBe(200);
  expect((await POST(manualRequest())).status).toBe(201);
  expect(db.rpcCalls.filter(query => query.name === 'app_branch_access')).toHaveLength(0);
});
