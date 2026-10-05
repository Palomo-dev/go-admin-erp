import { FakeDb, type FakeMutationBuilder } from './fixtures/fakeSupabase';

class MissingVoice extends Error {}
jest.mock('../voiceContextService', () => ({
  VoiceNotConfiguredError: MissingVoice,
  getTwilioClientForOrg: jest.fn(async () => { throw new MissingVoice('Sin configuración'); }),
}));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: jest.fn() }));
jest.mock('../recordingStorageService', () => ({ buildStoragePath: jest.fn() }));

import { createCall, getCall, updateCall, updateCallFromProviderEvent } from '../callManagementService';
import { reconcileConsentsWithoutRecording, RECONCILE_DEFERRALS_KEY } from '../consentReconcileService';
import { prepareLeadCustomerInsert, resolveLeadCustomer } from '../leadCustomer';
import { recordConsent, voidConsentWithoutRecording } from '../consentService';

const CALL = '11111111-1111-4111-8111-111111111111';
const call = () => ({
  id: CALL, organization_id: 7, status: 'dialing', metadata: {},
  started_at: '2026-09-01T10:00:00Z', answered_at: null, ended_at: null,
  duration_seconds: null, answered_by: null, provider_call_sid: 'CAprueba',
  agent_leg_sid: null, customer_leg_sid: null, user_id: 'vendedor',
  customer_id: null, opportunity_id: null,
  recording_enabled: true, consent_given: false, bridge_mode: null,
  ring_seconds: null, duration_source: 'provider', cost_amount: null, cost_currency: 'USD',
});

function raceClient(db: FakeDb, race: (attempt: number) => void) {
  const client = db.client();
  const from = client.from.bind(client);
  let attempts = 0;
  client.from = ((table: string) => {
    const builder = from(table) as unknown as FakeMutationBuilder;
    const single = builder.maybeSingle.bind(builder);
    builder.maybeSingle = (async () => structuredClone(await single())) as typeof builder.maybeSingle;
    const update = builder.update.bind(builder);
    builder.update = ((patch: object) => {
      if (table === 'calls') race(++attempts);
      return update(patch);
    }) as typeof builder.update;
    return builder;
  }) as unknown as typeof client.from;
  return client;
}

beforeEach(() => { process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false'; });
afterEach(() => { delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; });

it('el escritor de grabación recalcula metadata y conserva disposición y liquidación concurrentes', async () => {
  const db = new FakeDb({ tables: { calls: [call()] } });
  const client = raceClient(db, (attempt) => {
    if (attempt === 1) db.rows('calls')[0].metadata = { disposition_outcome: 'callback_requested', settled_at: 'fin' };
  });
  const saved = await updateCall(CALL, 7, (fresh) => ({
    metadata: { ...fresh.metadata, recording_started_at: 'inicio' },
  }), client);
  expect(saved?.metadata).toEqual({ disposition_outcome: 'callback_requested', settled_at: 'fin', recording_started_at: 'inicio' });
});

it.each(['failed', 'canceled', 'no-answer', 'ringing'])('un escritor %s tardío no degrada conversación terminada', async (status) => {
  const db = new FakeDb({ tables: { calls: [call()] } });
  const client = raceClient(db, (attempt) => {
    if (attempt === 1) Object.assign(db.rows('calls')[0], {
      status: 'completed', duration_seconds: 65, ended_at: '2026-09-01T10:02:00Z',
      metadata: { disposition_outcome: 'answered', settled_at: 'fin' },
    });
  });
  const saved = await updateCallFromProviderEvent(CALL, 7, { CallStatus: status }, 'child', client);
  expect(saved).toMatchObject({ status: 'completed', duration_seconds: 65, ended_at: '2026-09-01T10:02:00Z',
    metadata: { disposition_outcome: 'answered', settled_at: 'fin' } });
});

it('un fallo de lectura o escritura no se convierte en llamada ausente ni guardado exitoso', async () => {
  const db = new FakeDb({ tables: { calls: [call()] }, failOn: { 'calls:select': 'read failed' } });
  await expect(getCall(CALL, 7, db.client())).rejects.toMatchObject({ message: 'read failed' });
  delete db.failOn['calls:select'];
  db.failOn['calls:update'] = 'write failed';
  await expect(updateCall(CALL, 7, { consent_given: true }, db.client())).rejects.toMatchObject({ message: 'write failed' });
});

it('la reconciliación incrementa el contador fresco y conserva notas concurrentes', async () => {
  const db = new FakeDb({ tables: { calls: [{ ...call(), status: 'completed',
    ended_at: '2026-09-01T10:01:00Z', recording_enabled: true, consent_given: true }] } });
  const client = raceClient(db, (attempt) => {
    if (attempt === 1) db.rows('calls')[0].metadata = { [RECONCILE_DEFERRALS_KEY]: 4, live_note: 'Nota manual' };
  });
  const result = await reconcileConsentsWithoutRecording(client, { now: new Date('2026-09-02T10:00:00Z') });
  expect(result).toMatchObject({ deferred: 1, errors: 0 });
  expect(db.rows('calls')[0].metadata).toMatchObject({ [RECONCILE_DEFERRALS_KEY]: 5, live_note: 'Nota manual' });
});

it('no acredita una marca de reconciliación cuando no se pudo persistir', async () => {
  const db = new FakeDb({ tables: { calls: [{ ...call(), status: 'completed', ended_at: '2026-09-01T10:01:00Z',
    recording_enabled: true, consent_given: true }] }, failOn: { 'calls:update': 'write failed' } });
  const result = await reconcileConsentsWithoutRecording(db.client(), { now: new Date('2026-09-02T10:00:00Z') });
  expect(result).toMatchObject({ deferred: 0, errors: 1 });
  expect(db.rows('calls')[0].metadata).toEqual({});
});

it('el productor común viaja por RPC y recalcula sobre el snapshot devuelto', async () => {
  delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  let attempts = 0;
  const db = new FakeDb({ tables: { calls: [call()] }, rpc: {
    fn_crm_callback_llamada: (args) => ++attempts === 1
      ? { stale: true, call: { ...call(), metadata: { live_note: 'nota ganadora' } } }
      : { stale: false, call: { ...call(), ...args.p_patch } },
  } });
  const saved = await updateCall(CALL, 7, (fresh) => ({ metadata: { ...fresh.metadata, recording_started_sid: 'REprueba' } }), db.client());
  expect(saved?.metadata).toEqual({ live_note: 'nota ganadora', recording_started_sid: 'REprueba' });
  expect(db.rpcCalls).toHaveLength(2);
  expect(db.calls.filter((entry) => entry.op === 'update')).toHaveLength(0);
});

it('alta de cliente compartida conserva extras del importador y excluye los campos no permitidos', () => {
  const input = prepareLeadCustomerInsert({ full_name: 'Cliente Sintético', phone: ' +573001112233 ' }, 4,
    { tags: ['prueba'], identification_number: '123', metadata: { imported: true }, notes: 'Observación' });
  expect(input).toEqual({ ok: true, payload: { branch_id: 4, first_name: 'Cliente', last_name: 'Sintético',
    email: null, phone: '+573001112233', company_name: null, customer_type: 'person', lifecycle_stage: 'lead',
    tags: ['prueba'], identification_number: '123', metadata: { imported: true }, notes: 'Observación' } });
});

it('lead y vinculación llaman al mismo writer RPC con el payload preparado', async () => {
  delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  const db = new FakeDb({ rpc: { fn_crm_insertar_cliente_preparado: () => ({ id: 'cliente-nuevo', full_name: 'Cliente Sintético' }) } });
  const result = await resolveLeadCustomer({ organizationId: 7, supabase: db.client() },
    { new_customer: { first_name: 'Cliente', last_name: 'Sintético', phone: '+573001112233' } }, null);
  expect(result).toEqual({ ok: true, customerId: 'cliente-nuevo', createdCustomerId: 'cliente-nuevo' });
  expect(db.rpcCalls).toEqual([{ name: 'fn_crm_insertar_cliente_preparado', args: { p_org: 7,
    p_data: { branch_id: null, first_name: 'Cliente', last_name: 'Sintético', email: null, phone: '+573001112233',
      company_name: null, customer_type: 'person', lifecycle_stage: 'lead' } } }]);
  expect(db.calls).toHaveLength(0);
});

it('el alta de llamada autenticada usa RPC con valores preparados y sin organization_id del body', async () => {
  delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  const db = new FakeDb({ rpc: { fn_crm_crear_llamada: (args) => ({ ...args.p_payload, id: CALL, organization_id: args.p_org }) } });
  const saved = await createCall(7, { provider: 'manual', direction: 'outbound', from_number: '+573001112233',
    to_number: '+573002223344', user_id: 'vendedor', started_at: '2026-09-01T10:00:00Z' }, db.client());
  expect(saved).toMatchObject({ id: CALL, organization_id: 7, status: 'dialing', metadata: {} });
  expect(db.rpcCalls[0]).toMatchObject({ name: 'fn_crm_crear_llamada', args: { p_org: 7 } });
  expect(db.rpcCalls[0].args.p_payload).not.toHaveProperty('organization_id');
  expect(db.calls).toHaveLength(0);
});

it('el diferimiento no pisa flags/costos cuando solo esos campos cambiaron durante el CAS', async () => {
  const db = new FakeDb({ tables: { calls: [call()] } });
  const client = raceClient(db, (attempt) => {
    if (attempt === 1) Object.assign(db.rows('calls')[0], { consent_given: true, recording_enabled: false,
      cost_amount: 1.25, cost_currency: 'COP', ring_seconds: 25, bridge_mode: 'agent_leg', duration_source: 'manual' });
  });
  const saved = await updateCall(CALL, 7, (fresh) => ({ metadata: { ...fresh.metadata, consent_reconcile_deferrals: 1 } }), client);
  expect(saved).toMatchObject({ consent_given: true, recording_enabled: false,
    cost_amount: 1.25, cost_currency: 'COP', ring_seconds: 25, bridge_mode: 'agent_leg', duration_source: 'manual' });
  expect(db.calls.filter((entry) => entry.op === 'update')).toHaveLength(2);
});

it('un aviso de consentimiento tardío no vuelve a activar el flag tras void de la grabación', async () => {
  const db = new FakeDb({ tables: { calls: [call()] }, unique: { call_consents: ['organization_id', 'call_id', 'consent_type'] } });
  const client = raceClient(db, (attempt) => {
    if (attempt === 1) Object.assign(db.rows('calls')[0], { status: 'completed', recording_enabled: false,
      consent_given: false, ended_at: '2026-09-01T10:02:00Z', metadata: { recording_absent_at: '2026-09-01T10:02:00Z' } });
  });
  await expect(recordConsent(7, { callId: CALL, consentType: 'recording', consentGiven: true,
    consentMessage: 'Aviso sintético de prueba', method: 'voice_announcement' }, client))
    .rejects.toThrow('grabación dejó de estar habilitada');
  expect(db.rows('calls')[0]).toMatchObject({ status: 'completed', recording_enabled: false, consent_given: false });
});

it('acta y flags se guardan exclusivamente en la RPC, sin un upsert anterior ni UPDATE posterior', async () => {
  delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  const db = new FakeDb({ rpc: { fn_crm_guardar_consentimiento: (args) => ({
    consent: { id: 'acta', call_id: CALL, organization_id: 7, ...args.p_payload }, call: { ...call(), consent_given: true },
  }) } });
  const consent = await recordConsent(7, { callId: CALL, consentType: 'recording', consentGiven: true,
    consentMessage: 'Aviso sintético', announcedAt: '2026-09-01T10:00:00Z' }, db.client());
  expect(consent).toMatchObject({ id: 'acta', call_id: CALL, organization_id: 7 });
  expect(db.rpcCalls).toHaveLength(1);
  expect(db.rpcCalls[0].name).toBe('fn_crm_guardar_consentimiento');
  expect(db.calls).toHaveLength(0);
});

it.each([true, false])('retirar acta devuelve evidencia voided=%s sin writers fuera de la RPC', async (voided) => {
  delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  const db = new FakeDb({ rpc: { fn_crm_retirar_consentimiento: () => ({ voided, call: call() }) } });
  expect(await voidConsentWithoutRecording(CALL, 7, db.client(), 'reconcile_no_recording')).toBe(voided);
  expect(db.rpcCalls[0]).toEqual({ name: 'fn_crm_retirar_consentimiento',
    args: { p_org: 7, p_call: CALL, p_reason: 'reconcile_no_recording' } });
  expect(db.calls).toHaveLength(0);
});

it('un fallo RPC de consentimiento no crea evidencia colateral ni acredita éxito', async () => {
  delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  const db = new FakeDb({ rpc: { fn_crm_guardar_consentimiento: () => { throw new Error('void ganó'); } } });
  await expect(recordConsent(7, { callId: CALL, consentType: 'recording', consentGiven: true }, db.client()))
    .rejects.toMatchObject({ message: 'void ganó' });
  expect(db.calls).toHaveLength(0);
});
