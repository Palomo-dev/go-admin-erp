/// <reference types="jest" />
/**
 * F0-SEC r3 · tester · plan + `processWebhookPayload` + `applyTemplateStatusUpdate`
 * encadenados, con dobles de PostgREST que evalúan los filtros de verdad.
 *
 *  - H4 (tester r3; CERRADO en el builder r4): una `message_template_status_update`
 *    de B que trae `value.metadata.phone_number_id` de A. Hasta r3 el plan
 *    resolvía la `change` por el número (A) y la conservaba con
 *    `entry.id = waba-b`; el procesamiento aplicaba la plantilla por el WABA →
 *    la plantilla de la org 8 quedaba DISABLED con la firma de la org 7. Ahora:
 *    (a) el plan descarta la `change` como anomalía
 *    (`phone_number_on_template_change`) y (b) `processWebhookPayload` recibe
 *    `authorizedOrganizationIds` del plan y solo aplica plantillas a
 *    `wabaOrgs ∩ authorized`. Los dos muros se prueban por separado.
 *  - Controles: el mismo payload SIN el número inyectado → 403 `mixed_channels`
 *    (plan) o descarte; y la misma plantilla bajo el WABA de A no toca nada de B.
 *  - `parseTemplateStatusUpdate` coacciona `message_template_id` con `String()`:
 *    un objeto se busca como `[object Object]` (no rompe, no encuentra).
 *  - Sondas de `normalizeMetaId` complementarias (cadenas con separadores de
 *    PostgREST, NUL, unicode): se conservan tal cual (van a `eq.` literal).
 */
import { normalizeMetaId, planWebhookAuthorization, type ResolvedChannel, type WebhookChannelResolver } from '../webhookAuthorization';
import { parseTemplateStatusUpdate } from '@/lib/services/crm/whatsapp/webhookTemplateStatus';

type Row = Record<string, unknown>;
const templates: Row[] = [];
const campaigns: Row[] = [];
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
    then(res: (x: unknown) => void) { res({ data: list, error: null }); },
    update(patch: Row) {
      return { eq: (_c: string, id: unknown) => { updates.push({ table, id, patch }); const row = rows.find((r) => r.id === id); if (row) Object.assign(row, patch); return Promise.resolve({ error: null }); } };
    },
  };
  return b;
}
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(table: string) {
      if (table === 'templates') return builder(table, templates);
      if (table === 'campaigns') return builder(table, campaigns);
      // channel_credentials u otras: sin filas (los canales se resuelven con spies)
      return builder(table, []);
    },
  }),
}));

import { whatsappCloudService } from '../whatsappCloudService';
import type { WhatsAppWebhookPayload } from '../whatsappCloudTypes';

const SECRET_A = 'app-secret-org-7-0123456789abcdef';
const SECRET_B = 'app-secret-org-8-fedcba9876543210';
const CH: Record<string, ResolvedChannel & { wabaId: string }> = {
  'pn-a': { channelId: 'ch-a', organizationId: 7, appSecret: SECRET_A, wabaId: 'waba-a' },
  'pn-b': { channelId: 'ch-b', organizationId: 8, appSecret: SECRET_B, wabaId: 'waba-b' },
};
const resolver: WebhookChannelResolver = {
  async byPhoneNumberId(id) { return CH[id] ?? null; },
  async byBusinessAccountId(waba) { return Object.values(CH).filter((c) => c.wabaId === waba); },
};
const TPL_B = 'meta-tpl-of-org-8';
const payloadOf = (...entry: unknown[]) => ({ object: 'whatsapp_business_account', entry } as unknown as WhatsAppWebhookPayload);
const tplChange = (extra: Row = {}) => ({ field: 'message_template_status_update', value: { event: 'DISABLED', message_template_id: TPL_B, reason: 'ABUSIVE_CONTENT', ...extra } });

beforeEach(() => {
  templates.length = 0; campaigns.length = 0; updates.length = 0;
  templates.push({ id: 'tpl-8', organization_id: 8, channel: 'whatsapp', metadata: { meta_template_id: TPL_B, status: 'APPROVED', waba_id: 'waba-b' } });
  campaigns.push({ id: 'camp-8', organization_id: 8, template_id: 'tpl-8', status: 'sending', statistics: null });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(whatsappCloudService, 'findChannelsByBusinessAccountId').mockImplementation(async (waba: string) =>
    Object.values(CH).filter((c) => c.wabaId === waba).map((c) => ({ channelId: c.channelId, organizationId: c.organizationId })));
  jest.spyOn(whatsappCloudService, 'findChannelByPhoneNumberId').mockImplementation(async (id: string) =>
    CH[id] ? { channelId: CH[id].channelId, organizationId: CH[id].organizationId } : null);
});
afterEach(() => jest.restoreAllMocks());

/** Ejecuta el camino completo de la ruta (plan → entradas filtradas → procesamiento con las organizaciones autorizadas) con el secreto que firmaría A. */
async function runAsA(payload: WhatsAppWebhookPayload): Promise<{ plan: Awaited<ReturnType<typeof planWebhookAuthorization>>; processed: boolean }> {
  const plan = await planWebhookAuthorization(payload, resolver, null);
  if (plan.kind !== 'verify' || plan.secret !== SECRET_A) return { plan, processed: false };
  await whatsappCloudService.processWebhookPayload(
    { ...payload, entry: plan.entries },
    { authorizedOrganizationIds: plan.scope === 'channel' ? plan.organizationIds : undefined },
  );
  return { plan, processed: true };
}

describe('H4 · plantilla de B con phone_number_id de A en el value (cerrado en r4: el plan descarta la anomalía y el procesamiento interseca)', () => {
  test('la plantilla de la org 8 NO debe cambiar con un payload que solo puede firmar la org 7', async () => {
    await runAsA(payloadOf({ id: 'waba-b', changes: [tplChange({ metadata: { phone_number_id: 'pn-a' } })] }));
    expect((templates[0].metadata as Row).status).toBe('APPROVED');
  });

  test('r4, primer muro: el plan descarta la change (phone_number_on_template_change) sin consultar; sin cambios resolubles y sin secreto global → 403 signature_secret_missing', async () => {
    const byPhone = jest.spyOn(resolver, 'byPhoneNumberId');
    const byWaba = jest.spyOn(resolver, 'byBusinessAccountId');
    const { plan, processed } = await runAsA(payloadOf({ id: 'waba-b', changes: [tplChange({ metadata: { phone_number_id: 'pn-a' } })] }));
    expect(plan).toMatchObject({ kind: 'reject', status: 403, code: 'signature_secret_missing' });
    expect(processed).toBe(false);
    expect(byPhone).not.toHaveBeenCalled();
    expect(byWaba).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  test('r4, primer muro bajo la app de la plataforma: la anomalía se descarta y se reporta en droppedChanges; nada llega al procesamiento', async () => {
    const plan = await planWebhookAuthorization(payloadOf({ id: 'waba-b', changes: [tplChange({ metadata: { phone_number_id: 'pn-a' } })] }), resolver, 'platform-app-secret-00112233445566');
    expect(plan.kind).toBe('verify');
    if (plan.kind !== 'verify') return;
    expect(plan.scope).toBe('global');
    expect(plan.entries).toEqual([]);
    expect(plan.droppedChanges).toEqual([{ entryIndex: 0, changeIndex: 0, reason: 'phone_number_on_template_change' }]);
  });

  test('r4, segundo muro: aunque la entrada llegara con id = waba-b, el procesamiento autorizado solo para [7] NO toca la plantilla de la org 8 (waba ∩ autorizadas = ∅)', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplChange()] }), { authorizedOrganizationIds: [7] });
    expect((templates[0].metadata as Row).status).toBe('APPROVED');
    expect((campaigns[0].statistics as Row | null)?.state).toBeUndefined();
    expect(updates).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('ninguna organización autorizada'), expect.objectContaining({ wabaId: 'waba-b', wabaOrganizationIds: [8], authorizedOrganizationIds: [7] }));
  });

  test('r4, segundo muro: autorizado para [8] (la firma de B) → la plantilla de la org 8 sí se aplica: DISABLED + campaña pausada', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplChange()] }), { authorizedOrganizationIds: [8] });
    expect((templates[0].metadata as Row).status).toBe('DISABLED');
    expect((campaigns[0].statistics as Row)?.state).toBe('paused');
    expect(updates.map((u) => `${u.table}:${u.id}`)).toEqual(['templates:tpl-8', 'campaigns:camp-8']);
  });

  test('r4, segundo muro: ámbito global (sin authorizedOrganizationIds) → sin intersección, se aplica por el WABA (como en r3)', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplChange()] }));
    expect((templates[0].metadata as Row).status).toBe('DISABLED');
  });

  test('r4, segundo muro: authorizedOrganizationIds = [] (nadie) → fail-closed, nada se aplica', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', changes: [tplChange()] }), { authorizedOrganizationIds: [] });
    expect((templates[0].metadata as Row).status).toBe('APPROVED');
    expect(updates).toEqual([]);
  });

  test('control 1: la misma plantilla SIN el número inyectado → 403 mixed_channels (waba-b resuelve a B) y nada cambia', async () => {
    const { plan, processed } = await runAsA(payloadOf({ id: 'waba-b', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'pn-a' }, messages: [] } }, tplChange()] }));
    expect(plan.kind).toBe('reject');
    expect(processed).toBe(false);
    expect((templates[0].metadata as Row).status).toBe('APPROVED');
  });

  test('control 2: la plantilla de B bajo el WABA de A → se procesa con [7] y no encuentra la plantilla de la org 8', async () => {
    const { processed } = await runAsA(payloadOf({ id: 'waba-a', changes: [tplChange()] }));
    expect(processed).toBe(true);
    expect((templates[0].metadata as Row).status).toBe('APPROVED');
    expect(updates).toEqual([]);
  });

  test('control 3: el número inyectado en la plantilla es de B (pn-b) → el plan lo resuelve a B y rechaza (A no puede firmarlo)', async () => {
    const { plan } = await runAsA(payloadOf({ id: 'waba-b', changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'pn-a' }, messages: [] } }, tplChange({ metadata: { phone_number_id: 'pn-b' } })] }));
    expect(plan.kind).toBe('reject');
  });
});

describe('r4 · replay de un message_template_status_update firmado (idempotencia por entry.time)', () => {
  test('el MISMO cuerpo dos veces → la segunda no actualiza nada (updated 0) ni vuelve a pausar campañas', async () => {
    const body = payloadOf({ id: 'waba-b', time: 1700000000, changes: [tplChange()] });
    await whatsappCloudService.processWebhookPayload(body, { authorizedOrganizationIds: [8] });
    expect((templates[0].metadata as Row).status).toBe('DISABLED');
    expect((templates[0].metadata as Row).last_webhook_event).toBe('message_template_status_update:DISABLED:1700000000');
    expect(updates.map((u) => `${u.table}:${u.id}`)).toEqual(['templates:tpl-8', 'campaigns:camp-8']);
    // La campaña se reanuda a mano (como haría el usuario) y llega el replay.
    (campaigns[0].statistics as Row).state = 'running';
    updates.length = 0;
    await whatsappCloudService.processWebhookPayload(body, { authorizedOrganizationIds: [8] });
    expect(updates).toEqual([]);
    expect((campaigns[0].statistics as Row).state).toBe('running');
  });

  test('un evento DISTINTO (otro entry.time) sí se aplica', async () => {
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', time: 1700000000, changes: [tplChange()] }), { authorizedOrganizationIds: [8] });
    updates.length = 0;
    await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', time: 1700000060, changes: [tplChange({ event: 'PAUSED' })] }), { authorizedOrganizationIds: [8] });
    expect((templates[0].metadata as Row).status).toBe('PAUSED');
    expect(updates.map((u) => `${u.table}:${u.id}`)).toEqual(['templates:tpl-8', 'campaigns:camp-8']);
  });

  test('sin entry.time (o con tipo raro) no hay clave: se aplica siempre, como en r3', async () => {
    for (const time of [undefined, { $gt: 0 }, -1, 1.5, 'ayer']) {
      updates.length = 0;
      await whatsappCloudService.processWebhookPayload(payloadOf({ id: 'waba-b', time, changes: [tplChange()] }), { authorizedOrganizationIds: [8] });
      expect(updates.map((u) => u.table)).toContain('templates');
      expect((templates[0].metadata as Row).last_webhook_event).toBeUndefined();
    }
  });
});

describe('parseTemplateStatusUpdate · coerción de message_template_id', () => {
  test('objeto → "[object Object]" (no rompe, no encuentra nada); número → string', () => {
    expect(parseTemplateStatusUpdate('message_template_status_update', { event: 'PAUSED', message_template_id: { $ne: null } })?.message_template_id).toBe('[object Object]');
    expect(parseTemplateStatusUpdate('message_template_status_update', { event: 'PAUSED', message_template_id: 42 })?.message_template_id).toBe('42');
    expect(parseTemplateStatusUpdate('message_template_status_update', { event: 'paused', message_template_id: 'x' })?.event).toBe('PAUSED');
    expect(parseTemplateStatusUpdate('message_template_status_update', { event: 'DELETED', message_template_id: 'x' })).toBeNull();
    expect(parseTemplateStatusUpdate('otro', { event: 'PAUSED', message_template_id: 'x' })).toBeNull();
  });
});

describe('normalizeMetaId · cadenas con caracteres especiales se conservan tal cual (van a eq. literal, no a in./or.)', () => {
  test.each<[string, string | null]>([
    ['123,456', '123,456'],
    ['*', '*'],
    ['123)', '123)'],
    ['pn-a\u0000', 'pn-a\u0000'],   // NUL como secuencia de escape, NUNCA como byte 0x00 literal (qa r3 §6)
    ['​', '​'],      // espacio de anchura cero: trim() no lo quita → id "raro" pero inofensivo (no resuelve)
    ['  123  ', '123'],
    ['１２３', '１２３'],       // dígitos fullwidth: no se normalizan a ASCII
    ['0x7b', '0x7b'],
    ['1e3', '1e3'],
    ['007', '007'],
  ])('%p → %p', (raw, expected) => expect(normalizeMetaId(raw)).toBe(expected));

  test('number 7 y string "007" son ids DISTINTOS (PostgREST compara texto): no se confunden', () => {
    expect(normalizeMetaId(7)).toBe('7');
    expect(normalizeMetaId('007')).toBe('007');
  });
});
