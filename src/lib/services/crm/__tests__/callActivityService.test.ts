/**
 * Actividad automática de la llamada (FASE-04 §9.1, D4): UNA `activities` por
 * `call_id` (idempotente), enums reales, actualización de la oportunidad y
 * notificación al vendedor. Supabase mockeado (builder encadenable FIFO por tabla).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FakeMutationBuilder } from './fixtures/fakeSupabase';
import { buildActivityMetadata, callChannel, mapCallStatusToOutcome, notifyCallAnalyzed, upsertCallActivity, type CallRowForActivity } from '../callActivityService';

interface Resp { data?: unknown; error?: { message: string } | null }
interface Op { method: string; args: unknown[] }
interface Query { table: string; ops: Op[] }

// Estas sondas FIFO/UNIQUE caracterizan el escape REST histórico. Las sondas
// positivas de RPC en esta misma batería activan explícitamente el modo real.
const originalCallRpcFlag = process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
beforeEach(() => { process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false'; });
afterAll(() => {
  if (originalCallRpcFlag === undefined) delete process.env.CRM_CALL_ATOMIC_RPC_ENABLED;
  else process.env.CRM_CALL_ATOMIC_RPC_ENABLED = originalCallRpcFlag;
});

function makeSupabase(responses: Record<string, Resp[]>, rpcImpl?: (fn: string, args: Record<string, unknown>) => Resp) {
  const queries: Query[] = [];
  const rpc = jest.fn(async (fn: string, args: Record<string, unknown>) => rpcImpl?.(fn, args) ?? { data: null, error: null });
  const from = jest.fn((table: string) => {
    const q: Query = { table, ops: [] };
    if (table !== 'calls' || responses.calls) queries.push(q);
    const builder: Record<string, unknown> = {};
    const chain = (method: string) => jest.fn((...args: unknown[]) => { q.ops.push({ method, args }); return builder; });
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'order', 'limit', 'maybeSingle', 'single']) builder[m] = chain(m);
    builder.then = (resolve: (v: Resp) => void, reject?: (e: unknown) => void) => {
      const next = table === 'calls' && !responses.calls ? { data: call } : responses[table]?.shift();
      if (!next) {
        const err = new Error(`sin respuesta mock para ${table} (${q.ops.map((o) => o.method).join('.')})`);
        return reject ? reject(err) : Promise.reject(err);
      }
      return resolve({ data: null, error: null, ...next });
    };
    return builder;
  });
  return { sb: { rpc, from } as unknown as SupabaseClient, queries, rpc };
}

const hasEq = (q: Query, col: string, val?: unknown) => q.ops.some((o) => o.method === 'eq' && o.args[0] === col && (val === undefined || o.args[1] === val));
const opArg = (q: Query, method: string) => q.ops.find((o) => o.method === method)?.args[0] as Record<string, unknown>;

const call: CallRowForActivity = {
  id: 'call-1', organization_id: 7, direction: 'outbound', mode: 'browser', status: 'completed', answered_by: 'human',
  started_at: '2026-09-08T10:00:00.000Z', ended_at: '2026-09-08T10:05:00.000Z', duration_seconds: 300,
  customer_id: 'cus-1', opportunity_id: 'opp-1', user_id: 'user-1',
};

describe('mapCallStatusToOutcome / callChannel', () => {
  it('mapea los CHECK reales de calls.status', () => {
    expect(mapCallStatusToOutcome('completed', 'human')).toBe('answered');
    expect(mapCallStatusToOutcome('completed', 'machine')).toBe('voicemail');
    expect(mapCallStatusToOutcome('no_answer')).toBe('no_answer');
    expect(mapCallStatusToOutcome('busy')).toBe('busy');
    expect(mapCallStatusToOutcome('ringing')).toBe('in_progress');
    expect(mapCallStatusToOutcome('otro')).toBe('unknown');
    expect(callChannel('ai_agent')).toBe('voice_ai');
    expect(callChannel('manual')).toBe('phone');
  });
});

describe('upsertCallActivity (idempotente por call_id)', () => {
  it('sin actividad previa → INSERT activities con activity_type call, call_id, channel phone, outcome y related a la oportunidad', async () => {
    const { sb, queries } = makeSupabase({ activities: [{ data: null }, { data: { id: 'act-1' } }] });
    const res = await upsertCallActivity(7, 'call-1', { supabase: sb, call, enrich: { summary: 'Resumen IA', analysisId: 'an-1', transcriptId: 'tr-1', sentiment: 'mixed', qualityScore: 72, temperature: 'warm', tags: ['Tibio'] } });
    expect(res).toEqual({ activityId: 'act-1', created: true });
    // 1ª query: SELECT por organization_id + call_id
    expect(queries[0].table).toBe('activities');
    expect(hasEq(queries[0], 'organization_id', 7)).toBe(true);
    expect(hasEq(queries[0], 'call_id', 'call-1')).toBe(true);
    // 2ª: INSERT
    const ins = opArg(queries[1], 'insert');
    expect(ins).toMatchObject({
      organization_id: 7, activity_type: 'call', call_id: 'call-1', channel: 'phone', outcome: 'answered', duration_seconds: 300,
      user_id: 'user-1', occurred_at: call.started_at, related_type: 'opportunity', related_id: 'opp-1', notes: 'Resumen IA',
    });
    expect(ins.metadata).toMatchObject({ analysis_id: 'an-1', transcript_id: 'tr-1', sentiment: 'mixed', quality_score: 72, temperature: 'warm', tags: ['Tibio'], call_id: 'call-1', source: 'call_ai' });
  });

  it('con actividad previa (F3/manual) → UPDATE de la misma fila; conserva metadata previa y notas si no hay resumen', async () => {
    const { sb, queries } = makeSupabase({ activities: [{ data: { id: 'act-9', notes: 'Nota del vendedor', metadata: { source: 'voice', from: '+57', disposition: 'x' } } }, { data: { id: 'act-9' } }] });
    const res = await upsertCallActivity(7, 'call-1', { supabase: sb, call, enrich: { analysisId: 'an-2', sentiment: 'positive' } });
    expect(res).toEqual({ activityId: 'act-9', created: false });
    expect(queries).toHaveLength(2);
    expect(queries[1].ops.some((o) => o.method === 'insert')).toBe(false);
    const upd = opArg(queries[1], 'update');
    expect(upd.notes).toBe('Nota del vendedor');
    expect(upd.metadata).toMatchObject({ from: '+57', disposition: 'x', analysis_id: 'an-2', sentiment: 'positive', source: 'call_ai' });
    expect(hasEq(queries[1], 'id', 'act-9')).toBe(true);
    expect(hasEq(queries[1], 'organization_id', 7)).toBe(true);
  });

  it('dos llamadas seguidas no duplican: la segunda encuentra la fila y actualiza', async () => {
    const { sb, queries } = makeSupabase({ activities: [{ data: null }, { data: { id: 'act-1' } }, { data: { id: 'act-1', notes: 'Resumen', metadata: {} } }, { data: { id: 'act-1' } }] });
    const a = await upsertCallActivity(7, 'call-1', { supabase: sb, call, enrich: { summary: 'Resumen' } });
    const b = await upsertCallActivity(7, 'call-1', { supabase: sb, call, enrich: { summary: 'Resumen v2' } });
    expect(a?.created).toBe(true);
    expect(b).toEqual({ activityId: 'act-1', created: false });
    expect(queries.filter((q) => q.ops.some((o) => o.method === 'insert'))).toHaveLength(1);
  });

  it('carga la llamada filtrando por organization_id; llamada de otra org → null sin escribir', async () => {
    const { sb, queries } = makeSupabase({ calls: [{ data: null }] });
    expect(await upsertCallActivity(7, 'call-x', { supabase: sb })).toBeNull();
    expect(queries[0].table).toBe('calls');
    expect(hasEq(queries[0], 'organization_id', 7)).toBe(true);
    expect(queries).toHaveLength(1);
  });

  it('llamada sin oportunidad ni cliente → related_* null; ai_agent → channel voice_ai; buzón → outcome voicemail', async () => {
    const { sb, queries } = makeSupabase({ calls: [{ data: { ...call, id: 'call-2', mode: 'ai_agent', answered_by: 'machine', customer_id: null, opportunity_id: null } }], activities: [{ data: null }, { data: { id: 'act-2' } }] });
    await upsertCallActivity(7, 'call-2', { supabase: sb, call: { ...call, id: 'call-2', mode: 'ai_agent', answered_by: 'machine', customer_id: null, opportunity_id: null } });
    expect(opArg(queries[2], 'insert')).toMatchObject({ channel: 'voice_ai', outcome: 'voicemail', related_type: null, related_id: null });
  });

  it('buildActivityMetadata no escribe claves null/undefined', () => {
    const m = buildActivityMetadata({ a: 1 }, call, { summary: null, analysisId: undefined, sentiment: 'neutral' });
    expect(m).toEqual({ a: 1, call_id: 'call-1', direction: 'outbound', mode: 'browser', call_status: 'completed', source: 'call_ai', sentiment: 'neutral' });
  });
});

describe('notifyCallAnalyzed', () => {
  it('llama fn_create_org_notification con el vendedor de la oportunidad y metadata de la llamada', async () => {
    const { sb, rpc } = makeSupabase({}, () => ({ data: 'notif-1' }));
    const id = await notifyCallAnalyzed(7, call, { analysisId: 'an-1', summary: 'Resumen', suggestions: 2, policy: 'suggest', customerName: 'Juan', salespersonId: 'user-sales' }, sb);
    expect(id).toBe('notif-1');
    expect(rpc).toHaveBeenCalledWith('fn_create_org_notification', expect.objectContaining({
      p_organization_id: 7, p_recipient_user_id: 'user-sales', p_type: 'call_analyzed', p_title: '2 sugerencias de la llamada con Juan',
      p_metadata: expect.objectContaining({ call_id: 'call-1', analysis_id: 'an-1', opportunity_id: 'opp-1' }),
    }));
  });
  it('sin destinatario → null sin RPC', async () => {
    const { sb, rpc } = makeSupabase({});
    expect(await notifyCallAnalyzed(7, { ...call, user_id: null }, { analysisId: 'an-1', summary: null, suggestions: 0, policy: 'auto' }, sb)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});

it('el análisis concurrente relee la disposición y conserva su resultado, nota y metadata', async () => {
  const { FakeDb } = await import('./fixtures/fakeSupabase');
  const initial = { ...call, metadata: {} };
  const db = new FakeDb({ tables: {
    calls: [initial],
    activities: [{ id: 'act-1', organization_id: 7, call_id: call.id, notes: 'Anterior', metadata: {}, outcome: 'answered', updated_at: '2026-09-08T10:05:00Z' }],
    opportunities: [{ id: 'opp-1', organization_id: 7, last_contact_at: '2026-09-09T00:00:00Z', contact_result: 'visit' }],
  } });
  const client = db.client();
  const from = client.from.bind(client);
  let competing = false;
  client.from = ((table: string) => {
    const builder = from(table) as unknown as FakeMutationBuilder;
    const maybeSingle = builder.maybeSingle.bind(builder);
    builder.maybeSingle = (async () => structuredClone(await maybeSingle())) as typeof builder.maybeSingle;
    const update = builder.update.bind(builder);
    builder.update = ((patch: object) => {
      if (table === 'activities' && !competing) {
        competing = true;
        const manual = { disposition_outcome: 'wrong_number', disposition_at: '2026-09-08T10:06:00Z', disposition_note: 'Corregir el teléfono' };
        db.rows('calls')[0].metadata = manual;
        Object.assign(db.rows('activities')[0], { outcome: 'wrong_number', metadata: manual, notes: 'Corregir el teléfono' });
      }
      return update(patch);
    }) as typeof builder.update;
    return builder;
  }) as unknown as typeof client.from;
  const result = await upsertCallActivity(7, call.id, { supabase: client, call: initial, enrich: { summary: 'Resumen IA', outcome: 'answered', analysisId: 'analysis-new' } });
  expect(result).toEqual({ activityId: 'act-1', created: false });
  expect(db.rows('activities')).toHaveLength(1);
  expect(db.rows('activities')[0]).toMatchObject({ outcome: 'wrong_number', notes: 'Corregir el teléfono', metadata: { disposition_outcome: 'wrong_number', analysis_id: 'analysis-new' } });
  expect(db.rows('opportunities')[0]).toMatchObject({ last_contact_at: '2026-09-09T00:00:00Z', contact_result: 'visit' });
  expect(db.calls.some((q) => q.table === 'opportunities' && q.op === 'update')).toBe(false);
});

it('con la RPC activada el enriquecimiento completo devuelve el recibo y no escribe actividades por URL', async () => {
  process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'true';
  try {
    const { sb, queries, rpc } = makeSupabase({}, () => ({ data: { activity_id: 'act-atomic', created: false } }));
    const enrich = { summary: 'é'.repeat(20000), analysisId: 'analysis-new', temperature: 'hot', tags: ['Nuevo'] };
    await expect(upsertCallActivity(7, call.id, { supabase: sb, enrich })).resolves.toEqual({ activityId: 'act-atomic', created: false });
    expect(rpc).toHaveBeenCalledWith('fn_crm_sync_llamada_servicio', { p_org: 7, p_call: call.id, p_enrich: enrich });
    expect(queries).toHaveLength(0);
  } finally { process.env.CRM_CALL_ATOMIC_RPC_ENABLED = 'false'; }
});

it('el sync ignora outcome/nota del snapshot y acredita el cierre persistido más reciente', async () => {
  const { FakeDb } = await import('./fixtures/fakeSupabase');
  const { upsertCallActivity: sync } = await import('../callActivitySync');
  const fresh = { ...call, direction: 'outbound' as const, mode: 'browser', from_number: 'origen', to_number: 'destino', metadata: { live_note: 'Nota actual' } };
  const db = new FakeDb({ tables: { calls: [fresh], activities: [] } });
  await sync({ ...fresh, status: 'failed', duration_seconds: 0, metadata: { live_note: 'Nota vieja' } }, db.client());
  expect(db.rows('activities')[0]).toMatchObject({ outcome: 'answered', notes: 'Nota actual', duration_seconds: 300, metadata: { call_status: 'completed' } });
});
