/**
 * F16 · Consolidación de las rondas (2026-09-21) — el LOTE (`runCampaignBatch`):
 * reclamación atómica por `claim_token` (#2), aislamiento por organización
 * (#5), la pausa no ensucia `statistics` (#10), rescate de testigos caducados
 * (F-2), «esperar no es estar atascada» (N-1/N-2), la clave de idempotencia
 * del lote (N-5) y el desempate entre dos rescates concurrentes (N-7).
 *
 * Casos únicos rescatados de: builder r2 (`round2.test.ts`), tester r1
 * (`testerR1.test.ts`), builder r3 (`round3.test.ts`), builder r4
 * (`round4.test.ts`). Los escenarios encadenados con reloj simulado viven en
 * `f16.loteE2E.stable.test.ts`. `campaignBatch.test.ts` ya cubre el camino
 * feliz, opt-out, NO_CREDITS, deadline y campaña pausada.
 */
import { runCampaignBatch, campaignClientRequestId, STALE_CLAIM_MS } from '../campaignBatch';
import { WhatsAppError } from '../types';
import { makeSupabase, has, opArg, type Op, type TableResolver } from './mockSupabase';
import { fakeTable, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
const mockEnqueueJob = jest.fn(async (args: unknown) => (void args, 'job-1'));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (args: unknown) => mockEnqueueJob(args) }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));
jest.mock('@/lib/services/crm/email/variables', () => {
  const actual = jest.requireActual('@/lib/services/crm/email/variables');
  return { ...actual, buildContext: jest.fn(async () => ({ ...actual.emptyContext(), contact: { first_name: 'Laura' }, custom: {} })) };
});

beforeEach(() => mockEnqueueJob.mockClear());

const UUID_C = '33333333-3333-4333-8333-333333333333';
const NOW_MS = Date.parse('2026-09-10T15:00:00.000Z');
const runAtOf = (call: number): number => {
  const args = mockEnqueueJob.mock.calls[call][0] as { runAt: Date | string };
  return typeof args.runAt === 'string' ? Date.parse(args.runAt) : args.runAt.getTime();
};
const ok = (i: { customerId: string }) => ({ message_id: 'm', conversation_id: 'c', activity_id: null, customer_id: i.customerId, channel_id: 'ch', scheduled: false });
const okSend = () => jest.fn(async (i: { customerId: string }) => ok(i));

function campaignRow(stats: Record<string, unknown> = {}): Row {
  return { id: UUID_C, organization_id: 7, name: 'c', channel: 'whatsapp', status: 'sending', scheduled_at: null, template_id: null, segment_id: null, content: 'hola', statistics: { throttle_mps: 10, respect_allowed_hours: false, next_batch_no: 2, ...stats }, created_by: null, created_at: '', updated_at: '' };
}
function pendingRow(id: string, retryAfterMs: number | null = null): Row {
  return { id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-10T14:00:00.000Z', metadata: { state: 'pending', recipient: '573100000001', attempts: 1, retry_after: retryAfterMs === null ? null : new Date(retryAfterMs).toISOString() } };
}
/** Fila reclamada por un lote que murió: `queued` con su claim_token. */
function queuedRow(id: string, claimedAgoMs: number, token = 'b1:vivo'): Row {
  return { id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-10T14:00:00.000Z', metadata: { state: 'queued', recipient: '573100000002', attempts: 1, batch_no: 1, claim_token: token, claimed_at: new Date(NOW_MS - claimedAgoMs).toISOString() } };
}
/** Tablas del lote con `fakeTable`; `pausas` recoge los `statistics` con los que se pausó. */
function batchTables(contactos: Row[], stats: Record<string, unknown>, pausas: Record<string, unknown>[]) {
  const contacts = fakeTable(contactos);
  const tables: Record<string, TableResolver> = {
    campaigns: (ops) => {
      if (has(ops, 'update')) { const st = (opArg<Record<string, unknown>>(ops, 'update')?.statistics ?? {}) as Record<string, unknown>; if (st.state === 'paused') pausas.push(st); }
      return { data: campaignRow(stats) };
    },
    campaign_contacts: contacts.resolver,
    messages: () => ({ data: [], count: 0 }),
    provider_configs: () => ({ data: null }),
    message_events: () => ({ data: [] }),
  };
  return { tables, contacts };
}
const deps = (send = okSend()) => ({ send: send as never, now: () => NOW_MS, sleep: async () => undefined });

// ─── #2 · reclamación atómica de contactos (r2 · tester r1) ────────────────────

describe('runCampaignBatch · reclamación', () => {
  const CAMP = campaignRow({ next_batch_no: 3 });
  const simple = (id: string): Row => ({ id, customer_id: `cust-${id}`, state: null, metadata: { state: 'pending', recipient: `5731000000${id.slice(-1)}`, attempts: 0 } });

  it('B2.2 · el claim condiciona por metadata.state con claim_token propio del lote y solo procesa lo que gana la carrera', async () => {
    const rows = [simple('cc-1'), simple('cc-2'), simple('cc-3')];
    let claimCall = 0;
    const { sb, calls } = makeSupabase({
      campaigns: () => ({ data: CAMP }),
      campaign_contacts: (ops) => {
        if (!has(ops, 'update')) return { data: rows };
        if (has(ops, 'select')) { claimCall += 1; return { data: claimCall === 2 ? null : { id: 'x' } }; } // el 2.º lo reclamó OTRO lote
        return { data: null };
      },
      provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }), messages: () => ({ data: [] }),
    }, () => ({ data: true }));
    const sent: string[] = [];
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 1 }, sb, { send: async (i) => { sent.push(String(i.customerId)); return ok({ customerId: String(i.customerId) }); }, sleep: async () => undefined, deadlineMs: 5_000 });
    expect(r.claimed).toBe(2);
    expect(sent).toEqual(['cust-cc-1', 'cust-cc-3']);
    const claims = calls.filter((c) => c.table === 'campaign_contacts' && has(c.ops, 'update') && has(c.ops, 'select'));
    expect(claims).toHaveLength(3);
    const tokens = claims.map((c) => {
      expect(c.ops.some((o: Op) => String(o.args[0] ?? '') === 'metadata->>state')).toBe(true);
      expect(has(c.ops, 'is', 'state', null)).toBe(true);
      const meta = opArg<Record<string, unknown>>(c.ops, 'update')!.metadata as Record<string, unknown>;
      expect(meta.state).toBe('queued');
      expect(String(meta.claim_token)).toMatch(/^b1:/);
      return meta.claim_token;
    });
    expect(new Set(tokens).size).toBe(3);
    const post = calls.filter((c) => c.table === 'campaign_contacts' && has(c.ops, 'update') && !has(c.ops, 'select'));
    expect(post.length).toBeGreaterThan(0);
    for (const c of post) expect(c.ops.some((o: Op) => String(o.args[0] ?? '') === 'metadata->>claim_token')).toBe(true);
  });

  it('B2.5 · campaña de otra org → org_mismatch sin reclamar nada; misma org sigue adelante', async () => {
    const ajena = makeSupabase({ campaigns: () => ({ data: CAMP }) }, () => ({ data: true }));
    expect(await runCampaignBatch({ campaign_id: UUID_C }, ajena.sb, { expectedOrgId: 999999, deadlineMs: 5_000 })).toMatchObject({ finished: true, reason: 'org_mismatch', claimed: 0, sent: 0 });
    expect(ajena.calls.some((c) => c.table === 'campaign_contacts')).toBe(false);
    const propia = makeSupabase({ campaigns: () => ({ data: CAMP }), campaign_contacts: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }), messages: () => ({ data: [] }) }, () => ({ data: true }));
    expect((await runCampaignBatch({ campaign_id: UUID_C }, propia.sb, { expectedOrgId: 7, deadlineMs: 5_000 })).reason).not.toBe('org_mismatch');
  });

  it('B2.10 · NO_CREDITS → pause_reason, sin clave dinámica `no_credits` en statistics', async () => {
    const { sb, calls } = makeSupabase({
      campaigns: () => ({ data: CAMP }),
      campaign_contacts: (ops) => (has(ops, 'update') ? { data: { id: 'cc-1' } } : { data: [simple('cc-1')] }),
      provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }), messages: () => ({ data: [] }),
    }, () => ({ data: true }));
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 1 }, sb, { send: async () => { throw new WhatsAppError('NO_CREDITS', 'sin créditos', 402); }, sleep: async () => undefined, deadlineMs: 5_000 });
    const paused = calls.filter((c) => c.table === 'campaigns' && has(c.ops, 'update')).map((c) => opArg<Record<string, unknown>>(c.ops, 'update')!.statistics as Record<string, unknown>).find((s) => s?.state === 'paused')!;
    expect(paused.pause_reason).toBe('no_credits');
    expect(paused.no_credits).toBeUndefined();
  });
});

// ─── F-2 · un lote muerto no encadena trabajos indefinidamente (r3) ─────────────

describe('runCampaignBatch · testigos caducados', () => {
  it('B3.F2 · recupera los claims caducados (1 h) en vez de reclamar 0 para siempre', async () => {
    const { tables } = batchTables([queuedRow('cc-1', 60 * 60_000, 'b1:muerto-1'), queuedRow('cc-2', 60 * 60_000, 'b1:muerto-2')], {}, []);
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, makeSupabase(tables, () => ({ data: true })).sb, deps());
    expect(r).toMatchObject({ claimed: 2, sent: 2 });
  });

  it('B3.F2 · un claim RECIENTE (otro lote vivo) no se roba', async () => {
    const send = okSend();
    const { tables } = batchTables([queuedRow('cc-1', 5_000)], {}, []);
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, makeSupabase(tables, () => ({ data: true })).sb, deps(send));
    expect(r.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('B3.F2 · un lote que SÍ progresa reinicia el contador de lotes sin progreso', async () => {
    // Lectura estática (la fila sigue caducada en cada consulta): la campaña no
    // se cierra y la última escritura es el patch de progreso, con el contador a 0.
    let lastStats: Record<string, unknown> | null = null;
    const rows = [queuedRow('cc-1', 60 * 60_000, 'b1:muerto')];
    const { sb } = makeSupabase({
      campaigns: (ops) => { if (has(ops, 'update')) lastStats = (opArg<Record<string, unknown>>(ops, 'update')?.statistics ?? null) as Record<string, unknown> | null; return { data: campaignRow({ stalled_batches: 3 }) }; },
      campaign_contacts: (ops) => (has(ops, 'update') ? { data: { id: ops.find((o) => o.method === 'eq' && o.args[0] === 'id')?.args[1] } } : { data: rows }),
      messages: () => ({ data: [], count: 0 }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }),
    }, () => ({ data: true }));
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 4 }, sb, deps());
    expect((lastStats as unknown as { stalled_batches?: number } | null)?.stalled_batches).toBe(0);
  });
});

// ─── N-1 / N-2 · esperar no es estar atascada (r4, incluida la campaña reanudada a mano) ──

describe('runCampaignBatch · esperar vs atascada', () => {
  // Reversión que muerde: `if (!esperando && stalled >= MAX_STALLED_BATCHES)` → `if (stalled >= MAX_STALLED_BATCHES)`.
  it('B4.N1 · con el contador en el tope (5), todo en backoff NO re-pausa: encola al VENCER el backoff, no dentro de 1 s', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([pendingRow('cc-1', NOW_MS + 60_000)], { stalled_batches: 5 }, pausas);
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 6 }, makeSupabase(tables, () => ({ data: true })).sb, deps());
    expect(r.claimed).toBe(0);
    expect(r.reason).not.toBe('stalled_no_progress');
    expect(pausas).toHaveLength(0);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(runAtOf(0)).toBe(NOW_MS + 60_000);
  });

  it('B4.N1 · el contador de lotes sin progreso no sube mientras se espera (se queda en 2)', async () => {
    const { tables } = batchTables([pendingRow('cc-1', NOW_MS + 60_000)], { stalled_batches: 2 }, []);
    let guardado: Record<string, unknown> | null = null;
    const base = tables.campaigns;
    tables.campaigns = (ops, call) => { if (has(ops, 'update')) { const st = (opArg<Record<string, unknown>>(ops, 'update')?.statistics ?? {}) as Record<string, unknown>; if (st.stalled_batches !== undefined) guardado = st; } return base(ops, call); };
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, makeSupabase(tables, () => ({ data: true })).sb, deps());
    expect((guardado as unknown as { stalled_batches?: number } | null)?.stalled_batches).toBe(2);
  });

  it('B4.N2 · con un testigo aún vivo (contador en el tope) espera al rescate: el siguiente lote cae justo cuando caduca', async () => {
    const pausas: Record<string, unknown>[] = [];
    const { tables } = batchTables([queuedRow('cc-1', 5_000)], { stalled_batches: 5 }, pausas);
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 6 }, makeSupabase(tables, () => ({ data: true })).sb, deps());
    expect(r.claimed).toBe(0);
    expect(r.reason).not.toBe('stalled_no_progress');
    expect(pausas).toHaveLength(0);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(runAtOf(0)).toBe(NOW_MS - 5_000 + STALE_CLAIM_MS);
  });

  it('B4.N2 · sigue pausando cuando NO hay nada que esperar (candidatos siempre disputados), llegue al tope o esté ya en él', async () => {
    for (const stalled of [4, 5]) {
      const pausas: Record<string, unknown>[] = [];
      const { tables } = batchTables([pendingRow('cc-1')], { stalled_batches: stalled }, pausas);
      const contacts = fakeTable([pendingRow('cc-1')]);
      tables.campaign_contacts = (ops, call) => (has(ops, 'update') ? { data: null } : contacts.resolver(ops, call)); // otro lote se adelanta siempre
      const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: stalled + 1 }, makeSupabase(tables, () => ({ data: true })).sb, deps());
      expect(r.reason).toBe('stalled_no_progress');
      expect(pausas).toHaveLength(1);
    }
  });
});

// ─── N-5 · el lote usa la clave estable tal cual (r4) ───────────────────────────

describe('runCampaignBatch · clientRequestId', () => {
  it('B4.N5 · un rescate (4.º intento) no genera una clave nueva', async () => {
    const fila = queuedRow('cc-1', 60 * 60_000, 'b1:muerto');
    (fila.metadata as Record<string, unknown>).attempts = 4;
    const send = okSend();
    const { tables } = batchTables([fila], {}, []);
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, makeSupabase(tables, () => ({ data: true })).sb, deps(send));
    expect(send).toHaveBeenCalledTimes(1);
    expect((send.mock.calls as unknown as [[{ clientRequestId: string }]])[0][0].clientRequestId).toBe(campaignClientRequestId(UUID_C, 'cust-cc-1'));
  });
});

// ─── N-7 · dos lotes que rescatan el MISMO testigo caducado (r4) ────────────────

describe('runCampaignBatch · rescate concurrente', () => {
  it('B4.N7 · solo uno se lo queda: el testigo viejo es la condición que desempata', async () => {
    const original = queuedRow('cc-1', 60 * 60_000, 'b1:muerto');
    const contacts = fakeTable([original]);
    let instantanea: Row[] | null = null; // el lote B leyó ANTES de que A escribiera
    const tables: Record<string, TableResolver> = {
      campaigns: () => ({ data: campaignRow() }),
      campaign_contacts: (ops, call) => (!has(ops, 'update') && !has(ops, 'insert') && instantanea ? fakeTable(instantanea).resolver(ops, call) : contacts.resolver(ops, call)),
      messages: () => ({ data: [], count: 0 }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }),
    };
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    let liberar!: () => void;
    const puerta = new Promise<void>((r) => { liberar = r; });
    let reclamado!: () => void;
    const yaReclamo = new Promise<void>((r) => { reclamado = r; });
    const enviosA: string[] = [];
    const sendA = jest.fn(async (i: { customerId: string }) => { enviosA.push(i.customerId); reclamado(); await puerta; return ok(i); });
    const pa = runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, deps(sendA));
    await yaReclamo;
    instantanea = [original];
    const enviosB: string[] = [];
    const sendB = jest.fn(async (i: { customerId: string }) => { enviosB.push(i.customerId); return ok(i); });
    const rb = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, deps(sendB));
    liberar();
    await pa;
    expect(rb.claimed).toBe(0);
    expect(enviosB).toHaveLength(0);
    expect([...enviosA, ...enviosB]).toEqual(['cust-cc-1']);
  });
});
