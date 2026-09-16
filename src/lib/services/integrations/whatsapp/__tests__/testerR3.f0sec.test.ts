/// <reference types="jest" />
/**
 * F0-SEC r3 · tester · plan + `processWebhookPayload` + `applyTemplateStatusUpdate`
 * encadenados, con dobles de PostgREST que evalúan los filtros de verdad.
 *
 *  - H4 (nuevo): una `message_template_status_update` de B que trae
 *    `value.metadata.phone_number_id` de A. `planWebhookAuthorization` resuelve
 *    la `change` por el número (A) y la conserva con `entry.id = waba-b`;
 *    `processWebhookPayload` resuelve las organizaciones de la plantilla por el
 *    WABA de la entrada → `applyTemplateStatusUpdate(..., [8])` → la plantilla
 *    de la org 8 queda DISABLED y su campaña `sending` pausada, con la firma de
 *    la org 7. `test.failing` = hueco abierto.
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

/** Ejecuta el camino completo de la ruta (plan → entradas filtradas → procesamiento) con el secreto que firmaría A. */
async function runAsA(payload: WhatsAppWebhookPayload): Promise<{ plan: Awaited<ReturnType<typeof planWebhookAuthorization>>; processed: boolean }> {
  const plan = await planWebhookAuthorization(payload, resolver, null);
  if (plan.kind !== 'verify' || plan.secret !== SECRET_A) return { plan, processed: false };
  await whatsappCloudService.processWebhookPayload({ ...payload, entry: plan.entries });
  return { plan, processed: true };
}

describe('H4 · plantilla de B con phone_number_id de A en el value (plan por número, procesamiento por WABA)', () => {
  test.failing('la plantilla de la org 8 NO debe cambiar con un payload que solo puede firmar la org 7', async () => {
    await runAsA(payloadOf({ id: 'waba-b', changes: [tplChange({ metadata: { phone_number_id: 'pn-a' } })] }));
    expect((templates[0].metadata as Row).status).toBe('APPROVED');
  });

  test('evidencia: el plan conserva la change (ámbito de A), el procesamiento resuelve la org 8 por waba-b y DISABLED + campaña pausada', async () => {
    const { plan, processed } = await runAsA(payloadOf({ id: 'waba-b', changes: [tplChange({ metadata: { phone_number_id: 'pn-a' } })] }));
    expect(plan.kind).toBe('verify');
    if (plan.kind !== 'verify') return;
    expect(plan.scope).toBe('channel');
    expect(plan.organizationIds).toEqual([7]);
    expect(plan.droppedChanges).toEqual([]);
    expect(plan.entries[0].id).toBe('waba-b');
    expect(processed).toBe(true);
    expect((templates[0].metadata as Row).status).toBe('DISABLED');
    expect((campaigns[0].statistics as Row)?.state).toBe('paused');
    expect(updates.map((u) => `${u.table}:${u.id}`)).toEqual(['templates:tpl-8', 'campaigns:camp-8']);
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
    ['pn-a ', 'pn-a '],
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
