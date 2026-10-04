import { assertLegacyFilterBudget, mutateCallFromSnapshot, type CallMutationSnapshot } from '../callMutationService';
import { applyStatusEvent } from '../callStateMachine';
import { FakeDb, type FakeMutationBuilder } from './fixtures/fakeSupabase';

const snapshot = (): CallMutationSnapshot => ({
  id: '11111111-1111-4111-8111-111111111111', organization_id: 7,
  status: 'in_progress', metadata: {}, started_at: '2026-09-01T10:00:00Z',
  answered_at: '2026-09-01T10:00:05Z', ended_at: null, duration_seconds: null,
  answered_by: 'human', user_id: 'vendedor', customer_id: 'cliente', opportunity_id: 'oportunidad',
  provider_call_sid: 'CAprueba', customer_leg_sid: null, agent_leg_sid: null,
});

function racingClient(db: FakeDb, race: (attempt: number) => void) {
  const client = db.client();
  const from = client.from.bind(client);
  let attempts = 0;
  client.from = ((table: string) => {
    const builder = from(table) as unknown as FakeMutationBuilder;
    const maybeSingle = builder.maybeSingle.bind(builder);
    builder.maybeSingle = (async () => structuredClone(await maybeSingle())) as typeof builder.maybeSingle;
    const update = builder.update.bind(builder);
    builder.update = ((patch: object) => {
      if (table === 'calls') race(++attempts);
      return update(patch);
    }) as typeof builder.update;
    return builder;
  }) as unknown as typeof client.from;
  return client;
}

it('un callback concurrente relee la disposición manual y conserva notas, secuencia y liquidación', async () => {
  const initial = snapshot();
  const db = new FakeDb({ tables: { calls: [structuredClone(initial)] } });
  const client = racingClient(db, (attempt) => {
    if (attempt === 1) db.rows('calls')[0].metadata = {
      disposition_outcome: 'callback_requested', disposition_note: 'Llamar el viernes',
      settled_at: '2026-09-01T10:03:00Z', last_seq: { parent: 2 },
    };
  });
  const result = await mutateCallFromSnapshot(client, initial, (fresh) => {
    const event = applyStatusEvent({ ...fresh, status: fresh.status as 'in_progress', answered_at: fresh.answered_at ?? null, started_at: fresh.started_at ?? null, metadata: fresh.metadata ?? {} },
      { CallStatus: 'completed', SequenceNumber: '3', CallDuration: '120' }, 'child', new Date('2026-09-01T10:03:00Z'));
    return event ? { metadata: event.metadata, status: event.status, ended_at: event.ended_at } : null;
  });
  expect(result.metadata).toMatchObject({ disposition_outcome: 'callback_requested', disposition_note: 'Llamar el viernes', settled_at: '2026-09-01T10:03:00Z', last_seq: { parent: 2, child: 3 } });
  expect(result.status).toBe('completed');
});

it('una secuencia vieja releída no vuelve atrás ni borra los datos del callback ganador', async () => {
  const initial = snapshot();
  const db = new FakeDb({ tables: { calls: [structuredClone(initial)] } });
  const client = racingClient(db, (attempt) => {
    if (attempt === 1) Object.assign(db.rows('calls')[0], { status: 'completed', ended_at: '2026-09-01T10:04:00Z', duration_seconds: 180, metadata: { last_seq: { child: 9 }, disposition_outcome: 'wrong_number' } });
  });
  const result = await mutateCallFromSnapshot(client, initial, (fresh) => {
    const event = applyStatusEvent({ status: fresh.status as 'in_progress', answered_at: fresh.answered_at ?? null, started_at: fresh.started_at ?? null, metadata: fresh.metadata ?? {} }, { CallStatus: 'ringing', SequenceNumber: '4' }, 'child');
    return event ? { metadata: event.metadata, status: event.status } : null;
  });
  expect(result).toMatchObject({ status: 'completed', duration_seconds: 180, metadata: { last_seq: { child: 9 }, disposition_outcome: 'wrong_number' } });
});

it('un cambio de dueño se comprueba de nuevo antes de guardar la intención manual', async () => {
  const initial = snapshot();
  const db = new FakeDb({ tables: { calls: [structuredClone(initial)] } });
  const client = racingClient(db, (attempt) => { if (attempt === 1) db.rows('calls')[0].user_id = 'otro'; });
  await expect(mutateCallFromSnapshot(client, initial, (fresh) => {
    if (fresh.user_id !== 'vendedor') throw new Error('sin permiso');
    return { metadata: { ...fresh.metadata, live_note: 'Nota privada' } };
  })).rejects.toThrow('sin permiso');
  expect(db.rows('calls')[0].metadata).toEqual({});
});

it('tres conflictos devuelven 409 y nunca sobreescriben el último estado persistido', async () => {
  const initial = snapshot();
  const db = new FakeDb({ tables: { calls: [structuredClone(initial)] } });
  const client = racingClient(db, (attempt) => { db.rows('calls')[0].metadata = { competing: attempt }; });
  await expect(mutateCallFromSnapshot(client, initial, () => ({ metadata: { live_note: 'No guardada' } }))).rejects.toMatchObject({ status: 409, code: 'llamada_cambiada' });
  expect(db.rows('calls')[0].metadata).toEqual({ competing: 3 });
});

it('metadata20k viaja en BODY de la RPC y rebase no pierde la disposición manual', async () => {
  process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'true';
  try {
    const initial = { ...snapshot(), metadata: { live_note: 'é'.repeat(20000) } };
    let attempt = 0;
    const db = new FakeDb({ rpc: { fn_crm_callback_llamada: (args) => {
      attempt += 1;
      if (attempt === 1) return { stale: true, call: { ...initial, metadata: { ...initial.metadata, disposition_outcome: 'callback_requested' } } };
      return { stale: false, call: { ...initial, metadata: args.p_patch.metadata } };
    } } });
    const result = await mutateCallFromSnapshot(db.client(), initial, (fresh) => ({ metadata: { ...fresh.metadata, last_seq: { child: 3 } } }));
    expect(result.metadata).toMatchObject({ live_note: initial.metadata.live_note, disposition_outcome: 'callback_requested', last_seq: { child: 3 } });
    expect(db.rpcCalls).toHaveLength(2);
    expect(db.calls).toHaveLength(0);
  } finally { delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; }
});

it('sin migración activa una nota extensa se rechaza antes de dejar una fila que no pueda cerrarse', async () => {
  const initial = snapshot();
  const db = new FakeDb({ tables: { calls: [initial] } });
  await expect(mutateCallFromSnapshot(db.client(), initial, () => ({ metadata: { live_note: 'é'.repeat(20000) } }))).rejects.toMatchObject({ status: 503, code: 'crm_call_rpc_required' });
  expect(db.calls).toHaveLength(0);
  expect(db.rows('calls')[0].metadata).toEqual({});
});

it.each(["'", '!', '(', ')'])('el presupuesto usa el escape real del SDK para %s', async (character) => {
  const initial = snapshot();
  const db = new FakeDb({ tables: { calls: [initial] } });
  await expect(mutateCallFromSnapshot(db.client(), initial, () => ({ metadata: { live_note: character.repeat(5900) } }))).rejects.toMatchObject({ status: 503 });
  expect(db.calls).toHaveLength(0);
});

it('el presupuesto de actividad suma metadata y notes, tanto para el estado actual como el candidato', () => {
  const filters = { id: 'actividad', organization_id: 7, metadata: { summary: 'x'.repeat(4900) }, notes: 'y'.repeat(4900) };
  expect(() => assertLegacyFilterBudget(filters, ['id', 'organization_id', 'metadata'], 'id')).not.toThrow();
  expect(() => assertLegacyFilterBudget(filters, ['id', 'organization_id', 'notes'], 'id')).not.toThrow();
  expect(() => assertLegacyFilterBudget(filters, ['id', 'organization_id', 'metadata', 'notes'], 'id')).toThrow('No se pudo guardar');
});

// Fixtures históricas del transporte heredado; los contratos RPC se verifican por separado.
beforeEach(() => { process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false'; });
afterAll(() => { delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED; });
