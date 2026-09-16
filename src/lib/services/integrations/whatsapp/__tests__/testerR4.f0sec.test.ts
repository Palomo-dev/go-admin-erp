/// <reference types="jest" />
/**
 * F0-SEC r4 · tester · plan real + `processWebhookPayload` real +
 * `applyTemplateStatusUpdate` real sobre tablas dobles que evalúan `eq/in/->>`.
 *
 *  - H4 extremo a extremo: la plantilla de B no cambia con ninguna variante del
 *    payload que solo puede firmar A (número de A, de B, numérico, entrada
 *    mixta con mensajes legítimos de A), ni con el WABA de A.
 *  - `authorizedOrganizationIds` con tipos raros (`['8']`, `[NaN]`, `[0]`,
 *    `[-8]`, `[8.5]`): fail-closed, nada se aplica.
 *  - Mensajes de un canal no autorizado se saltan SIN insertar; los de uno
 *    autorizado en el mismo lote sí se procesan.
 *  - Replay por `entry.time`: mismo cuerpo N veces → 1 aplicación; replay
 *    tardío fuera de orden (PAUSED@t1 tras APPROVED@t2) se re-aplica (ANOTADO,
 *    bajo: la clave es por evento, no por «último aplicado ≥»); `time` como
 *    string decimal cuenta; con espacios cuenta; `'1e9'`, `Infinity`, `-0` no.
 *  - `templateEventKey` distingue field y event; dos plantillas distintas con el
 *    mismo `time` se aplican las dos.
 *
 * Organizaciones ficticias (7, 8, 9); secretos inventados; sin bytes de control.
 */
import { MAX_LOOKUPS, planWebhookAuthorization, type ResolvedChannel, type WebhookChannelResolver } from '../webhookAuthorization';
import { applyTemplateStatusUpdate, templateEventKey } from '@/lib/services/crm/whatsapp/webhookTemplateStatus';

type Row = Record<string, unknown>;
const templates: Row[] = [];
const campaigns: Row[] = [];
const messagesInserted: Row[] = [];
const updates: Array<{ table: string; id: unknown; patch: Row }> = [];

function colValue(r: Row, col: string): unknown {
  const i = col.indexOf('->>');
  if (i > 0) { const v = (r[col.slice(0, i)] as Row | null)?.[col.slice(i + 3)]; return v == null ? null : String(v); }
  return r[col] ?? null;
}
function builder(table: string, rows: Row[]) {
  let list = rows;
  const b = {
    select() { return b; },
    eq(col: string, v: unknown) { list = list.filter((r) => String(colValue(r, col)) === String(v)); return b; },
    in(col: string, vs: unknown[]) { list = list.filter((r) => vs.map(String).includes(String(colValue(r, col)))); return b; },
    filter(col: string, op: string, v: unknown) { if (op === 'eq') list = list.filter((r) => String(colValue(r, col)) === String(v)); return b; },
    limit() { return Promise.resolve({ data: list, error: null }); },
    maybeSingle() { return Promise.resolve({ data: list[0] ?? null, error: null }); },
    single() { return Promise.resolve({ data: list[0] ?? null, error: list[0] ? null : { code: 'PGRST116', message: 'no rows' } }); },
    then(res: (x: unknown) => void) { res({ data: list, error: null }); },
    insert(row: Row | Row[]) {
      const rows_ = Array.isArray(row) ? row : [row];
      if (table === 'messages') messagesInserted.push(...rows_);
      const sel = { select: () => ({ single: () => Promise.resolve({ data: { id: `ins-${messagesInserted.length}`, ...rows_[0] }, error: null }), maybeSingle: () => Promise.resolve({ data: rows_[0], error: null }) }), then: (res: (x: unknown) => void) => res({ data: rows_, error: null }) };
      return sel;
    },
    update(patch: Row) {
      return { eq: (_c: string, id: unknown) => { updates.push({ table, id, patch }); const row = rows.find((r) => r.id === id); if (row) Object.assign(row, patch); return Promise.resolve({ error: null }); } };
    },
    upsert() { return Promise.resolve({ error: null }); },
  };
  return b;
}
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      if (table === 'templates') return builder(table, templates);
      if (table === 'campaigns') return builder(table, campaigns);
      return builder(table, []);
    },
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

import { whatsappCloudService } from '../whatsappCloudService';
import type { WhatsAppWebhookPayload } from '../whatsappCloudTypes';

const SECRET_A = 'app-secret-org-7-0123456789abcdef';
const SECRET_B = 'app-secret-org-8-fedcba9876543210';
const CH: Record<string, ResolvedChannel & { wabaId: string }> = {
  'pn-a': { channelId: 'ch-a', organizationId: 7, appSecret: SECRET_A, wabaId: 'waba-a' },
  'pn-b': { channelId: 'ch-b', organizationId: 8, appSecret: SECRET_B, wabaId: 'waba-b' },
  'pn-g': { channelId: 'ch-g', organizationId: 9, appSecret: null, wabaId: 'waba-g' },
};
const resolver: WebhookChannelResolver = {
  async byPhoneNumberId(id) { return CH[id] ?? null; },
  async byBusinessAccountId(waba) { return Object.values(CH).filter((c) => c.wabaId === waba); },
};
const TPL_B = 'meta-tpl-of-org-8';
const TPL_A = 'meta-tpl-of-org-7';
const payloadOf = (...entry: unknown[]) => ({ object: 'whatsapp_business_account', entry } as unknown as WhatsAppWebhookPayload);
const tplB = (extra: Row = {}) => ({ field: 'message_template_status_update', value: { event: 'DISABLED', message_template_id: TPL_B, reason: 'ABUSIVE_CONTENT', ...extra } });
const tplA = (extra: Row = {}) => ({ field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: TPL_A, ...extra } });
const msg = (phoneNumberId: unknown) => ({ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId }, contacts: [{ profile: { name: 'x' }, wa_id: '573001112233' }], messages: [{ from: '573001112233', id: `wamid.${String(phoneNumberId)}`, timestamp: '1700000000', type: 'text', text: { body: 'hola' } }] } });

const statusB = () => (templates.find((t) => t.id === 'tpl-8')!.metadata as Row).status;
const statusA = () => (templates.find((t) => t.id === 'tpl-7')!.metadata as Row).status;
const campB = () => (campaigns.find((c) => c.id === 'camp-8')!.statistics as Row | null)?.state;

let processIncoming: jest.SpyInstance;
beforeEach(() => {
  templates.length = 0; campaigns.length = 0; updates.length = 0; messagesInserted.length = 0;
  templates.push({ id: 'tpl-8', organization_id: 8, channel: 'whatsapp', name: 'promo', metadata: { meta_template_id: TPL_B, status: 'APPROVED', waba_id: 'waba-b', language: 'es' } });
  templates.push({ id: 'tpl-7', organization_id: 7, channel: 'whatsapp', name: 'promo', metadata: { meta_template_id: TPL_A, status: 'APPROVED', waba_id: 'waba-a', language: 'es' } });
  campaigns.push({ id: 'camp-8', organization_id: 8, template_id: 'tpl-8', status: 'sending', statistics: null });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(whatsappCloudService, 'findChannelsByBusinessAccountId').mockImplementation(async (waba: string) =>
    Object.values(CH).filter((c) => c.wabaId === waba).map((c) => ({ channelId: c.channelId, organizationId: c.organizationId })));
  jest.spyOn(whatsappCloudService, 'findChannelByPhoneNumberId').mockImplementation(async (id: string) =>
    CH[id] ? { channelId: CH[id].channelId, organizationId: CH[id].organizationId } : null);
  // Los mensajes entrantes se registran (no se persisten de verdad): lo que importa es a qué organización llegan.
  // Firma real: (supabase, channelId, organizationId, message, value).
  processIncoming = jest.spyOn(whatsappCloudService as unknown as { processIncomingMessage: (...a: unknown[]) => Promise<void> }, 'processIncomingMessage').mockImplementation(async (...args: unknown[]) => {
    messagesInserted.push({ channelId: args[1], organizationId: args[2] });
  });
});
afterEach(() => jest.restoreAllMocks());

/** Camino de la ruta con el secreto que firmaría `signer` (null = global de la plataforma). */
async function runAs(payload: WhatsAppWebhookPayload, signer: string | null, globalSecret: string | null = 'platform-app-secret-00112233445566') {
  const plan = await planWebhookAuthorization(payload, resolver, globalSecret);
  if (plan.kind !== 'verify') return { plan, processed: false };
  const expected = signer ?? globalSecret;
  if (plan.secret !== expected) return { plan, processed: false };
  await whatsappCloudService.processWebhookPayload({ ...payload, entry: plan.entries }, { authorizedOrganizationIds: plan.scope === 'channel' ? plan.organizationIds : undefined });
  return { plan, processed: true };
}

describe('H4 extremo a extremo · la plantilla de la org 8 nunca cambia con lo que solo puede firmar la org 7', () => {
  test.each<[string, unknown]>([
    ['número de A', 'pn-a'],
    ['número de B', 'pn-b'],
    ['numérico', 123],
    ['objeto', { $gt: 0 }],
  ])('plantilla de B con metadata.phone_number_id = %s bajo waba-b → no se procesa; tpl-8 sigue APPROVED', async (_l, raw) => {
    const { processed } = await runAs(payloadOf({ id: 'waba-b', changes: [tplB({ metadata: { phone_number_id: raw } })] }), SECRET_A);
    expect(processed).toBe(false);
    expect(statusB()).toBe('APPROVED');
    expect(campB()).toBeUndefined();
    expect(updates).toEqual([]);
  });

  test('entrada mixta (mensajes legítimos de A + plantilla de B con número de A) en waba-b → mixed_channels; ni mensajes ni plantilla', async () => {
    const { plan, processed } = await runAs(payloadOf({ id: 'waba-b', changes: [msg('pn-a'), tplB({ metadata: { phone_number_id: 'pn-a' } })] }), SECRET_A);
    expect(plan).toMatchObject({ kind: 'reject', code: 'mixed_channels' });
    expect(processed).toBe(false);
    expect(messagesInserted).toEqual([]);
    expect(statusB()).toBe('APPROVED');
  });

  test('entrada mixta bajo waba-a: los mensajes de A se procesan para la org 7, la plantilla anómala de B se descarta y tpl-8 no cambia', async () => {
    const { processed } = await runAs(payloadOf({ id: 'waba-a', changes: [msg('pn-a'), tplB({ metadata: { phone_number_id: 'pn-a' } })] }), SECRET_A);
    expect(processed).toBe(true);
    expect(messagesInserted).toEqual([{ channelId: 'ch-a', organizationId: 7 }]);
    expect(statusB()).toBe('APPROVED');
    expect(updates).toEqual([]);
  });

  test('plantilla de B SIN número bajo waba-a firmada por A → se procesa con [7], se busca solo en la org 7 (no está) y la org 8 no cambia; pero la de A sí', async () => {
    const { processed } = await runAs(payloadOf({ id: 'waba-a', changes: [tplB(), tplA()] }), SECRET_A);
    expect(processed).toBe(true);
    expect(statusB()).toBe('APPROVED');
    expect(statusA()).toBe('PAUSED');
    expect(updates.map((u) => `${u.table}:${u.id}`)).toEqual(['templates:tpl-7']);
  });

  test('fallback por nombre + idioma: la plantilla "promo/es" existe en las dos organizaciones; con el WABA de A solo se toca la de A', async () => {
    const byName = { field: 'message_template_status_update', value: { event: 'PAUSED', message_template_name: 'promo', message_template_language: 'es' } };
    await runAs(payloadOf({ id: 'waba-a', changes: [byName] }), SECRET_A);
    expect(statusA()).toBe('PAUSED');
    expect(statusB()).toBe('APPROVED');
  });

  test('control: la misma plantilla de B firmada por B bajo waba-b → DISABLED y campaña pausada', async () => {
    const { processed } = await runAs(payloadOf({ id: 'waba-b', changes: [tplB()] }), SECRET_B);
    expect(processed).toBe(true);
    expect(statusB()).toBe('DISABLED');
    expect(campB()).toBe('paused');
  });

  test('bajo el global (undefined): waba-g resuelve a 9 y se aplica; waba-b (secreto propio) bajo el global → mixed_channels/invalid, no se aplica', async () => {
    templates.push({ id: 'tpl-9', organization_id: 9, channel: 'whatsapp', metadata: { meta_template_id: 'meta-tpl-of-org-9', status: 'APPROVED', waba_id: 'waba-g' } });
    const ok = await runAs(payloadOf({ id: 'waba-g', changes: [{ field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: 'meta-tpl-of-org-9' } }] }), null);
    expect(ok.processed).toBe(true);
    expect((templates.find((t) => t.id === 'tpl-9')!.metadata as Row).status).toBe('PAUSED');
    const bad = await runAs(payloadOf({ id: 'waba-b', changes: [tplB()] }), null);
    expect(bad.processed).toBe(false);
    expect(statusB()).toBe('APPROVED');
  });
});

describe('authorizedOrganizationIds · tipos raros (fail-closed)', () => {
  test.each<[string, unknown[]]>([
    ['[] (nadie: fail-closed)', []],
    ["['8'] (string)", ['8']],
    ['[NaN]', [Number.NaN]],
    ['[0]', [0]],
    ['[-8]', [-8]],
    ['[8.5]', [8.5]],
    ['[null]', [null]],
  ])('%s → la plantilla de la org 8 NO se aplica ni los mensajes de pn-b se procesan', async (_l, ids) => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplB(), msg('pn-b')] }), { authorizedOrganizationIds: ids as number[] });
    expect(statusB()).toBe('APPROVED');
    expect(updates).toEqual([]);
    expect(messagesInserted).toEqual([]);
    expect(processIncoming).not.toHaveBeenCalled();
  });

  test('[8, 8, 7] (duplicados) → se aplica igual', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplB()] }), { authorizedOrganizationIds: [8, 8, 7] });
    expect(statusB()).toBe('DISABLED');
  });

  test('mensajes: pn-b (no autorizado) se salta con aviso y pn-a (autorizado) del mismo lote se procesa; findChannelByPhoneNumberId se consulta para ambos', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-a', changes: [msg('pn-b'), msg('pn-a')] }), { authorizedOrganizationIds: [7] });
    expect(messagesInserted).toEqual([{ channelId: 'ch-a', organizationId: 7 }]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('mensajes descartados'), expect.objectContaining({ phoneNumberId: 'pn-b', organizationId: 8, authorizedOrganizationIds: [7] }));
  });

  test('opts ausente (llamada legada sin segundo argumento) = ámbito global: se aplica por el WABA', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplB()] }));
    expect(statusB()).toBe('DISABLED');
  });
});

describe('replay por entry.time · bordes', () => {
  const body = (time: unknown, extra: Row = {}) => payloadOf({ id: 'waba-b', time, changes: [tplB(extra)] });

  test('el mismo cuerpo 5 veces → 1 aplicación (2 updates: plantilla + campaña) y la campaña reanudada no se vuelve a pausar', async () => {
    for (let i = 0; i < 5; i++) {
      await whatsappCloudService.processWebhookPayload(body(1700000000), { authorizedOrganizationIds: [8] });
      if (i === 0) (campaigns[0].statistics as Row).state = 'running';
    }
    expect(updates.map((u) => `${u.table}:${u.id}`)).toEqual(['templates:tpl-8', 'campaigns:camp-8']);
    expect((campaigns[0].statistics as Row).state).toBe('running');
  });

  test('time como string decimal ("1700000000") y con espacios cuenta como clave; "1e9", Infinity, -0 → sin clave (se aplican siempre)', () => {
    const u = { field: 'message_template_status_update' as const, event: 'DISABLED' as const };
    expect(templateEventKey(u, '1700000000')).toBe('message_template_status_update:DISABLED:1700000000');
    expect(templateEventKey(u, ' 1700000000 ')).toBe('message_template_status_update:DISABLED:1700000000');
    expect(templateEventKey(u, 1700000000)).toBe(templateEventKey(u, '1700000000'));
    expect(templateEventKey(u, '1e9')).toBeNull();
    expect(templateEventKey(u, Number.POSITIVE_INFINITY)).toBeNull();
    expect(templateEventKey(u, Number.NaN)).toBeNull();
    expect(templateEventKey(u, 0)).toBe('message_template_status_update:DISABLED:0');
    expect(templateEventKey(u, '1'.repeat(17))).toBeNull();
  });

  test('la clave distingue field y event: quality_update y status_update con el mismo time se aplican los dos', async () => {
    await whatsappCloudService.processWebhookPayload(body(1700000000), { authorizedOrganizationIds: [8] });
    updates.length = 0;
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', time: 1700000000, changes: [{ field: 'message_template_quality_update', value: { message_template_id: TPL_B, new_quality_score: 'RED' } }] }), { authorizedOrganizationIds: [8] });
    expect(updates.map((u) => u.table)).toEqual(['templates']);
    expect((templates[0].metadata as Row).quality_score).toBe('RED');
    expect((templates[0].metadata as Row).status).toBe('DISABLED');
  });

  test('dos plantillas DISTINTAS con el mismo time (un lote de Meta) se aplican las dos', async () => {
    templates.push({ id: 'tpl-8b', organization_id: 8, channel: 'whatsapp', metadata: { meta_template_id: 'meta-tpl-of-org-8-b', status: 'APPROVED', waba_id: 'waba-b' } });
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', time: 1700000000, changes: [tplB(), tplB({ message_template_id: 'meta-tpl-of-org-8-b' })] }), { authorizedOrganizationIds: [8] });
    expect(statusB()).toBe('DISABLED');
    expect((templates.find((t) => t.id === 'tpl-8b')!.metadata as Row).status).toBe('DISABLED');
  });

  test('ANOTADO (bajo): replay FUERA DE ORDEN — PAUSED@t1 aplicado, luego APPROVED@t2, y se reenvía el PAUSED@t1 capturado → se vuelve a aplicar (la clave es del último evento, no un «≥ último time»)', async () => {
    await whatsappCloudService.processWebhookPayload(body(1700000000, { event: 'PAUSED' }), { authorizedOrganizationIds: [8] });
    await whatsappCloudService.processWebhookPayload(body(1700000060, { event: 'APPROVED' }), { authorizedOrganizationIds: [8] });
    expect(statusB()).toBe('APPROVED');
    (campaigns[0].statistics as Row).state = 'running';
    await whatsappCloudService.processWebhookPayload(body(1700000000, { event: 'PAUSED' }), { authorizedOrganizationIds: [8] });
    expect(statusB()).toBe('PAUSED');
    expect((campaigns[0].statistics as Row).state).toBe('paused');
  });

  test('la clave se escribe con applyTemplateStatusUpdate directo y la segunda llamada devuelve updated 0', async () => {
    const update = { field: 'message_template_status_update' as const, event: 'DISABLED' as const, message_template_id: TPL_B, message_template_name: null, message_template_language: null, reason: null, quality_score: null };
    const svc = (await import('@supabase/supabase-js')).createClient('x', 'y');
    const first = await applyTemplateStatusUpdate(update, 'waba-b', svc, [8], 'message_template_status_update:DISABLED:42');
    const second = await applyTemplateStatusUpdate(update, 'waba-b', svc, [8], 'message_template_status_update:DISABLED:42');
    expect(first).toEqual({ updated: 1, paused_campaigns: 1 });
    expect(second).toEqual({ updated: 0, paused_campaigns: 0 });
  });
});

describe('MAX_LOOKUPS en el plan con resolver real', () => {
  test(`${MAX_LOOKUPS + 1} números distintos → too_many_channels sin resolver ninguno`, async () => {
    const byPhone = jest.spyOn(resolver, 'byPhoneNumberId');
    const plan = await planWebhookAuthorization(payloadOf({ changes: Array.from({ length: MAX_LOOKUPS + 1 }, (_, i) => msg(`pn-${i}`)) }), resolver, null);
    expect(plan).toMatchObject({ kind: 'reject', code: 'too_many_channels' });
    expect(byPhone).not.toHaveBeenCalled();
  });
});
