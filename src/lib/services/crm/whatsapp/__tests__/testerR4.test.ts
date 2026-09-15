/**
 * FASE-16 · tester ronda 4 — escenarios de PUNTA A PUNTA, con reloj simulado,
 * que el constructor describió pero no encadenó:
 *
 *  - N-1: un error transitorio (retry_after 60 s) NO pausa la campaña aunque
 *    el contador de lotes sin progreso ya esté en el tope; el lote siguiente
 *    se programa al vencer el backoff y ENTONCES envía.
 *  - N-2: un lote muerto deja filas `queued`; la re-ejecución del job (lock
 *    caducado) las respeta hasta los 15 min y programa el rescate para ese
 *    instante; el rescate envía sin que nadie reanude a mano.
 *  - N-5: el proceso muere ENTRE la respuesta del proveedor (INSERT en
 *    `messages`) y `fn_campaign_mark_sent`; el rescate a los 15 min NO inserta
 *    un segundo mensaje ni descuenta créditos otra vez.
 *  - F-4: la tabla de medidas del constructor, reproducida con la función real.
 */
import { runCampaignBatch, STALE_CLAIM_MS, MAX_STALLED_BATCHES } from '../campaignBatch';
import { sendWhatsApp } from '../outboundService';
import { normalizePhoneDigits, countryFromPhone, resolveDefaultCountry, phoneSuffixPattern } from '@/lib/services/crm/phoneNormalize';
import { makeSupabase, has, opArg, type TableResolver } from './mockSupabase';
import { fakeTable, type Row } from './fakeTable';

jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: () => { throw new Error('no service client en tests'); } }));
const mockEnqueueJob = jest.fn(async (args: unknown) => (void args, 'job-1'));
jest.mock('@/lib/jobs/enqueue', () => ({ enqueueJob: (args: unknown) => mockEnqueueJob(args) }));
jest.mock('@/lib/services/crm/pricingService', () => ({ getUnitCost: jest.fn(async () => 0.0125) }));
jest.mock('@/lib/services/crm/email/variables', () => {
  const actual = jest.requireActual('@/lib/services/crm/email/variables');
  return { ...actual, buildContext: jest.fn(async () => ({ ...actual.emptyContext(), contact: { first_name: 'Laura' }, custom: {} })) };
});

beforeEach(() => { mockEnqueueJob.mockClear(); delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE; });

const UUID_C = '44444444-4444-4444-8444-444444444444';
const T0 = Date.parse('2026-09-14T15:00:00.000Z');
const runAtOf = (call: number): number => {
  const a = mockEnqueueJob.mock.calls[call][0] as { runAt: Date | string; payload: { batch_no: number } };
  return typeof a.runAt === 'string' ? Date.parse(a.runAt) : a.runAt.getTime();
};
const batchNoOf = (call: number): number => (mockEnqueueJob.mock.calls[call][0] as { payload: { batch_no: number } }).payload.batch_no;

/** Campaña con `statistics` PERSISTENTES entre lotes (los update se aplican). */
function statefulCampaign(stats: Record<string, unknown>) {
  const row: Row = {
    id: UUID_C, organization_id: 7, name: 'F16R4T', channel: 'whatsapp', status: 'sending', scheduled_at: null,
    template_id: null, segment_id: null, content: 'hola',
    statistics: { throttle_mps: 10, respect_allowed_hours: false, next_batch_no: 2, ...stats },
    created_by: null, created_at: '', updated_at: '',
  };
  const pausas: Record<string, unknown>[] = [];
  const resolver: TableResolver = (ops) => {
    if (has(ops, 'update')) {
      const patch = opArg<Record<string, unknown>>(ops, 'update') ?? {};
      if (patch.statistics) row.statistics = patch.statistics;
      if (patch.status) row.status = patch.status;
      const st = (row.statistics ?? {}) as Record<string, unknown>;
      if (st.state === 'paused') pausas.push(st);
      return { data: row };
    }
    return { data: row };
  };
  return { row, pausas, resolver };
}

function pendingRow(id: string): Row {
  return { id, campaign_id: UUID_C, customer_id: `cust-${id}`, state: null, replied_at: null, created_at: '2026-09-14T14:00:00.000Z', metadata: { state: 'pending', recipient: '573100000001', attempts: 0 } };
}

const ok = (i: { customerId: string }) => ({ message_id: `m-${i.customerId}`, conversation_id: 'c', activity_id: null, customer_id: i.customerId, channel_id: 'ch', scheduled: false });

describe('F16 r4 · tester · N-1 de punta a punta: un fallo transitorio a 60 s NO pausa, y el reintento sale al vencer', () => {
  it('lote con fallo → lote 1 s después sin reclamar (contador al tope) → lote al vencer envía', async () => {
    const contacts = fakeTable([pendingRow('cc-1')]);
    const camp = statefulCampaign({ stalled_batches: MAX_STALLED_BATCHES - 1 });
    const tables: Record<string, TableResolver> = {
      campaigns: camp.resolver, campaign_contacts: contacts.resolver,
      messages: () => ({ data: [], count: 0 }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }),
    };
    const { sb } = makeSupabase(tables, () => ({ data: true }));
    let clock = T0;
    let fallar = true;
    const send = jest.fn(async (i: { customerId: string }) => { if (fallar) throw new Error('ECONNRESET proveedor'); return ok(i); });
    const deps = { send: send as never, now: () => clock, sleep: async () => undefined };

    // Lote 2: el envío falla de forma transitoria → requeued con backoff de 60 s.
    const r2 = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, deps);
    expect(r2.requeued).toBe(1);
    expect(r2.reason).toBeUndefined();
    const meta2 = contacts.rows[0].metadata as Record<string, unknown>;
    expect(meta2.state).toBe('pending');
    expect(Date.parse(String(meta2.retry_after))).toBe(T0 + 60_000);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    expect(batchNoOf(0)).toBe(3);
    const t3 = runAtOf(0);
    expect(t3).toBeLessThan(T0 + 60_000);

    // Lote 3 (llega antes del backoff): no reclama nada, NO pausa, programa al vencer.
    clock = t3;
    const r3 = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, deps);
    expect(r3.claimed).toBe(0);
    expect(r3.reason).not.toBe('stalled_no_progress');
    expect(camp.pausas).toHaveLength(0);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(2);
    expect(batchNoOf(1)).toBe(4);
    expect(runAtOf(1)).toBe(T0 + 60_000);
    // El lote 2 tuvo progreso (requeued) y puso el contador a 0; esperar no lo sube.
    expect((camp.row.statistics as Record<string, unknown>).stalled_batches).toBe(0);

    // Lote 4 (al vencer): reclama, envía, termina.
    clock = runAtOf(1);
    fallar = false;
    const r4 = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 4 }, sb, deps);
    expect(r4.claimed).toBe(1);
    expect(r4.sent).toBe(1);
    expect(r4.finished).toBe(true);
    expect(r4.reason).toBe('completed');
    expect(camp.pausas).toHaveLength(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('con el contador YA en el tope (campaña reanudada a mano) tampoco se re-pausa mientras espera', async () => {
    const fila = pendingRow('cc-1');
    (fila.metadata as Record<string, unknown>).retry_after = new Date(T0 + 60_000).toISOString();
    const contacts = fakeTable([fila]);
    const camp = statefulCampaign({ stalled_batches: MAX_STALLED_BATCHES + 3 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 9 }, sb, { send: jest.fn(async (i: { customerId: string }) => ok(i)) as never, now: () => T0, sleep: async () => undefined });
    expect(r.reason).not.toBe('stalled_no_progress');
    expect(camp.pausas).toHaveLength(0);
    expect(runAtOf(0)).toBe(T0 + 60_000);
  });
});

describe('F16 r4 · tester · N-2 de punta a punta: lote muerto → rescate a los 15 min sin intervención', () => {
  it('la re-ejecución del job respeta el testigo vivo, programa el rescate al caducar y el rescate envía', async () => {
    const claimedAt = T0;
    const fila: Row = { id: 'cc-1', campaign_id: UUID_C, customer_id: 'cust-cc-1', state: null, replied_at: null, created_at: '2026-09-14T14:00:00.000Z',
      metadata: { state: 'queued', recipient: '573100000001', attempts: 1, batch_no: 2, claim_token: 'b2:muerto', claimed_at: new Date(claimedAt).toISOString() } };
    const contacts = fakeTable([fila]);
    const camp = statefulCampaign({ stalled_batches: MAX_STALLED_BATCHES - 1 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    let clock = T0 + 10 * 60_000; // fn_claim_jobs re-encola el job muerto a los 10 min
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const deps = { send: send as never, now: () => clock, sleep: async () => undefined };

    const rerun = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, deps);
    expect(rerun.claimed).toBe(0);
    expect(rerun.reason).not.toBe('stalled_no_progress');
    expect(camp.pausas).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    expect(runAtOf(0)).toBe(claimedAt + STALE_CLAIM_MS);
    expect(batchNoOf(0)).toBe(3);

    clock = runAtOf(0);
    const rescate = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, deps);
    expect(rescate.claimed).toBe(1);
    expect(rescate.sent).toBe(1);
    expect(rescate.finished).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect((contacts.rows[0].metadata as Record<string, unknown>).state).toBe('sent');
    expect(camp.pausas).toHaveLength(0);
  });

  it('un segundo antes de caducar el testigo, el rescate todavía NO roba la fila', async () => {
    const fila: Row = { id: 'cc-1', campaign_id: UUID_C, customer_id: 'cust-cc-1', state: null, replied_at: null, created_at: '',
      metadata: { state: 'queued', recipient: '573100000001', attempts: 1, batch_no: 2, claim_token: 'b2:vivo', claimed_at: new Date(T0).toISOString() } };
    const contacts = fakeTable([fila]);
    const camp = statefulCampaign({});
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, { send: send as never, now: () => T0 + STALE_CLAIM_MS - 1000, sleep: async () => undefined });
    expect(r.claimed).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(runAtOf(0)).toBe(T0 + STALE_CLAIM_MS);
  });
});

// ─── N-5: muerte entre la respuesta del proveedor y la marca de enviado ──────

function sendTables(mensajes: ReturnType<typeof fakeTable>): Record<string, TableResolver> {
  return {
    customers: () => ({ data: { id: 'cust-cc-1', full_name: 'Laura', first_name: 'Laura', phone: '+57 310 987 6543' } }),
    channels: () => ({ data: { id: 'chan-1', name: 'Ventas', status: 'active', type: 'whatsapp' } }),
    channel_credentials: () => ({ data: { channel_id: 'chan-1', provider: 'meta' } }),
    customer_channel_identities: () => ({ data: null }),
    conversations: (ops) => (has(ops, 'insert') ? { data: { id: 'conv-new' } } : { data: { id: 'conv-1', channel_id: 'chan-1', last_inbound_at: new Date(T0 - 3600_000).toISOString() } }),
    provider_configs: () => ({ data: { settings: { default_country_code: '57' } } }),
    messages: mensajes.resolver,
    activities: (ops) => (has(ops, 'insert') ? { data: { id: 'act-1' } } : { data: null }),
    comm_usage_logs: () => ({ data: null }),
    message_events: () => ({ data: [] }),
  };
}

describe('F16 r4 · tester · N-5: el proceso muere entre el INSERT del mensaje y fn_campaign_mark_sent', () => {
  it('el rescate a los 15 min no inserta un segundo mensaje ni descuenta créditos otra vez', async () => {
    let clock = T0;
    let n = 0;
    const mensajes = fakeTable([], { onInsert: (row) => { row.id = `msg-${++n}`; row.created_at = new Date(clock).toISOString(); return row; } });
    const contacts = fakeTable([pendingRow('cc-1')]);
    const camp = statefulCampaign({ channel_id: 'chan-1' });
    const tables = { ...sendTables(mensajes), campaigns: camp.resolver, campaign_contacts: contacts.resolver };
    const rpcCalls: string[] = [];
    let morir = true;
    const { sb } = makeSupabase(tables, (fn) => {
      rpcCalls.push(fn);
      if (fn === 'fn_campaign_mark_sent' && morir) return new Promise(() => undefined); // el proceso muere aquí: nunca vuelve
      return { data: true };
    });
    const deps = { send: (i: never, s: never) => sendWhatsApp(i, s, s, new Date(clock)), now: () => clock, sleep: async () => undefined };

    // Lote 2: envía (INSERT en messages dispara el despacho) y muere antes de marcar.
    const muerto = runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, deps as never);
    await new Promise((r) => setTimeout(r, 20));
    expect(mensajes.rows).toHaveLength(1);
    expect((contacts.rows[0].metadata as Record<string, unknown>).state).toBe('queued');
    expect(rpcCalls.filter((f) => f === 'deduct_comm_credits')).toHaveLength(1);
    void muerto; // queda colgado para siempre, como un proceso muerto

    // Rescate: 15 min después, con el testigo caducado.
    clock = T0 + STALE_CLAIM_MS + 1000;
    morir = false;
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 3 }, sb, deps as never);
    expect(r.claimed).toBe(1);
    expect(r.sent).toBe(1);
    expect(mensajes.rows).toHaveLength(1); // ← sin duplicado
    expect(rpcCalls.filter((f) => f === 'deduct_comm_credits')).toHaveLength(1); // ← sin doble cobro
    expect((contacts.rows[0].metadata as Record<string, unknown>).state).toBe('sent');
    expect((contacts.rows[0].metadata as Record<string, unknown>).message_id).toBe('msg-1');
  });

  it('pero la clave solo protege 7 días: un rescate más tarde SÍ reenviaría (documentado, no defecto)', async () => {
    const clock = T0;
    const mensajes = fakeTable([{ id: 'msg-old', organization_id: 7, direction: 'outbound', conversation_id: 'conv-1', created_at: new Date(T0 - 8 * 24 * 3600_000).toISOString(), metadata: { client_request_id: `campaign:${UUID_C}:cust-cc-1` } }]);
    const { sb } = makeSupabase(sendTables(mensajes), () => ({ data: true }));
    const r = await sendWhatsApp({ orgId: 7, customerId: 'cust-cc-1', channelId: 'chan-1', text: 'hola', clientRequestId: `campaign:${UUID_C}:cust-cc-1` }, sb, sb, new Date(clock));
    expect(r.duplicate).toBeUndefined();
    expect(mensajes.rows).toHaveLength(2);
  });
});

// ─── F-4: medición con la función real ───────────────────────────────────────

describe('F16 r4 · tester · F-4 medido con la función real', () => {
  it.each([
    ['415 555 0100', '57', null],
    ['415 555 0100', '1', '14155550100'],
    ['415 555 0100', null, null],
    ['4155550100', '57', null],
    ['(415) 555-0100', '57', null],
    ['+1 (415) 555-0100', '57', '14155550100'],
    ['+1 (415) 555-0100', null, '14155550100'],
    ['001 415 555 0100', '57', '14155550100'],
    ['310 987 6543', '57', '573109876543'],
    ['310 987 6543', null, null],
    ['310-987-6543', '1', '13109876543'],
    ['+57 310 987 65 43', null, '573109876543'],
    ['0057 310 987 6543', null, '573109876543'],
    ['573109876543@s.whatsapp.net', null, '573109876543'],
    ['3109876543@s.whatsapp.net', null, null],
    ['3109876543', '57', '573109876543'],
    ['3109876543', '999', null],
    ['601 234 5678', '57', '576012345678'],
    ['6012345678', '57', '576012345678'],
    ['1234567', '57', null],
    ['1020304050', '57', null], // cédula de 10 dígitos
    ['55 1234 5678', '52', '525512345678'],
    ['5512345678', '57', null],
    ['+52 55 1234 5678', '57', '525512345678'],
    ['', '57', null],
    ['abc', '57', null],
    ['+', '57', null],
  ])('normalizePhoneDigits(%p, %p) → %p', (phone, cc, esperado) => {
    expect(normalizePhoneDigits(phone, cc)).toBe(esperado);
  });

  it('país: 415 nacional con 57 no llega a ningún país; con 1 llega a «us»', () => {
    expect(normalizePhoneDigits('415 555 0100', '57')).toBeNull();
    expect(countryFromPhone(normalizePhoneDigits('415 555 0100', '1')!)).toBe('us');
    expect(countryFromPhone(normalizePhoneDigits('310 987 6543', '57')!)).toBe('co');
  });

  it('cascada: org → env → 57', () => {
    expect(resolveDefaultCountry('52')).toBe('52');
    expect(resolveDefaultCountry('+52')).toBe('52');
    process.env.WHATSAPP_DEFAULT_COUNTRY_CODE = '1';
    expect(resolveDefaultCountry(null)).toBe('1');
    expect(resolveDefaultCountry('')).toBe('1');
    delete process.env.WHATSAPP_DEFAULT_COUNTRY_CODE;
    expect(resolveDefaultCountry(undefined)).toBe('57');
  });

  it('patrón de sufijo: ancla al final, ignora separadores, no acepta dígitos intercalados', () => {
    const re = new RegExp(phoneSuffixPattern('573109876543'), 'i');
    expect(re.test('+57 310 987 65 43')).toBe(true);
    expect(re.test('310 9876543<|')).toBe(true);
    expect(re.test('+57 310 987 6543,')).toBe(true);
    expect(re.test('+57 310 987 6543 ext 9')).toBe(false);
    expect(re.test('+57 310 987 65 4 3 ')).toBe(true);
    expect(re.test('6 5 4 3')).toBe(true);
  });
});

// ─── Hallazgo nuevo del tester r4: la ventana de 200 se llena de filas que nunca serán reclamables ───

describe('F16 r4 · tester · T-1: 200 filas skipped/failed delante de las pendientes dejan la campaña «atascada»', () => {
  function skippedRow(i: number): Row {
    return { id: `sk-${String(i).padStart(4, '0')}`, campaign_id: UUID_C, customer_id: `cust-sk-${i}`, state: null, replied_at: null, created_at: '2026-09-14T14:00:00.000Z',
      metadata: { state: 'skipped', skipped_reason: 'window_required', recipient: null, attempts: 0 } };
  }
  // Ronda 5 (constructor): test INVERTIDO. En la ronda 4 documentaba el defecto
  // (0 envíos y pausa «stalled_no_progress» con 10 pendientes); ahora exige el
  // comportamiento correcto: `claimContacts` deja fuera EN LA CONSULTA las
  // filas saltadas/fallidas (`metadata->>state in (pending, queued)` o NULL) y
  // desempata por `id`, así que las 200 saltadas ya no ocupan la ventana y las
  // 10 pendientes salen en el primer lote.
  it('con 200 saltadas (mismo created_at, importación por lotes) y 10 pendientes: envía las 10 y acaba «completed»', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 200; i += 1) filas.push(skippedRow(i));
    for (let i = 0; i < 10; i += 1) filas.push(pendingRow(`zz-${i}`));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    let clock = T0;
    let r;
    for (let b = 2; b <= 7; b += 1) {
      r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: b }, sb, { send: send as never, now: () => clock, sleep: async () => undefined });
      clock += 5000;
      if (r.reason === 'stalled_no_progress' || r.finished) break;
    }
    expect(send).toHaveBeenCalledTimes(10);
    expect(r!.batch_no).toBe(2); // en el PRIMER lote, no tras cinco intentos
    expect(r!.claimed).toBe(10);
    expect(r!.sent).toBe(10);
    expect(r!.finished).toBe(true);
    expect(r!.reason).toBe('completed');
    expect(camp.pausas).toHaveLength(0);
    expect(camp.row.status).toBe('sent');
    expect(contacts.rows.filter((x) => (x.metadata as Record<string, unknown>).state === 'pending')).toHaveLength(0);
    expect(contacts.rows.filter((x) => (x.metadata as Record<string, unknown>).state === 'sent')).toHaveLength(10);
    expect(contacts.rows.filter((x) => (x.metadata as Record<string, unknown>).state === 'skipped')).toHaveLength(200);
  });

  it('con 200 FALLIDAS delante (mismo created_at) pasa lo mismo: las pendientes salen en el primer lote', async () => {
    const filas: Row[] = [];
    for (let i = 0; i < 200; i += 1) {
      const f = skippedRow(i);
      f.metadata = { state: 'failed', error_code: 'INTERNAL', recipient: '573100000009', attempts: 3 };
      filas.push(f);
    }
    for (let i = 0; i < 3; i += 1) filas.push(pendingRow(`zz-${i}`));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const send = jest.fn(async (i: { customerId: string }) => ok(i));
    const r = await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, { send: send as never, now: () => T0, sleep: async () => undefined });
    expect(r.claimed).toBe(3);
    expect(r.sent).toBe(3);
    expect(r.reason).toBe('completed');
    expect(camp.pausas).toHaveLength(0);
  });

  it('el desempate por `id` es determinista: con el mismo created_at, el orden de reclamación es el de `id`', async () => {
    // Filas insertadas en orden inverso a su id, todas con el mismo created_at.
    const filas: Row[] = [];
    for (let i = 9; i >= 0; i -= 1) filas.push(pendingRow(`zz-${i}`));
    const contacts = fakeTable(filas);
    const camp = statefulCampaign({ stalled_batches: 0 });
    const { sb } = makeSupabase({ campaigns: camp.resolver, campaign_contacts: contacts.resolver, messages: () => ({ data: [] }), provider_configs: () => ({ data: null }), message_events: () => ({ data: [] }) }, () => ({ data: true }));
    const orden: string[] = [];
    const send = jest.fn(async (i: { customerId: string }) => { orden.push(i.customerId); return ok(i); });
    await runCampaignBatch({ campaign_id: UUID_C, batch_no: 2 }, sb, { send: send as never, now: () => T0, sleep: async () => undefined });
    expect(orden).toEqual(Array.from({ length: 10 }, (_, i) => `cust-zz-${i}`));
    // La consulta de reclamación lleva `order(created_at)` Y `order(id)` como desempate.
    const claimSelect = contacts.selects.find((ops) => ops.some((o) => o.method === 'or'));
    expect(claimSelect).toBeDefined();
    const ords = claimSelect!.filter((o) => o.method === 'order').map((o) => String(o.args[0]));
    expect(ords).toEqual(['created_at', 'id']);
    // Y el filtro de estado va EN la consulta (no solo en memoria).
    expect(String(claimSelect!.find((o) => o.method === 'or')!.args[0])).toContain('metadata->>state.in.(pending,queued)');
  });
});
