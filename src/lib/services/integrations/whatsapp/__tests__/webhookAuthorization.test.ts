/// <reference types="jest" />
/**
 * F0-SEC r2 · `planWebhookAuthorization`: una firma autoriza un solo secreto y
 * todas las entradas del payload tienen que pertenecer a él. Casos
 * multi-organización sin base de datos (resolver inyectado). Sin datos reales:
 * organizaciones 7 y 8, números ficticios.
 */
import { MAX_LOOKUPS, planWebhookAuthorization, type ResolvedChannel, type WebhookChannelResolver } from '../webhookAuthorization';
import type { WhatsAppWebhookEntry, WhatsAppWebhookPayload } from '../whatsappCloudTypes';

const SECRET_A = 'app-secret-org-7-0123456789abcdef';
const SECRET_B = 'app-secret-org-8-fedcba9876543210';
const GLOBAL = 'platform-app-secret-00112233445566';

const CH_A: ResolvedChannel = { channelId: 'ch-a', organizationId: 7, appSecret: SECRET_A };
const CH_B: ResolvedChannel = { channelId: 'ch-b', organizationId: 8, appSecret: SECRET_B };
const CH_A_PLATFORM: ResolvedChannel = { channelId: 'ch-a', organizationId: 7, appSecret: null };
const CH_B_PLATFORM: ResolvedChannel = { channelId: 'ch-b', organizationId: 8, appSecret: null };
const CH_B_PLACEHOLDER: ResolvedChannel = { channelId: 'ch-b', organizationId: 8, appSecret: 'your-meta-app-secret' };

function messagesEntry(phoneNumberId: string, wabaId = `waba-${phoneNumberId}`): WhatsAppWebhookEntry {
  return {
    id: wabaId,
    changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '57300', phone_number_id: phoneNumberId }, messages: [] } }],
  };
}

function templateEntry(wabaId: string): WhatsAppWebhookEntry {
  return {
    id: wabaId,
    changes: [{ field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: 'tpl-1' } as never }],
  };
}

function payloadOf(...entry: WhatsAppWebhookEntry[]): WhatsAppWebhookPayload {
  return { object: 'whatsapp_business_account', entry };
}

function resolverWith(phones: Record<string, ResolvedChannel | null>, wabas: Record<string, ResolvedChannel[]> = {}): WebhookChannelResolver & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async byPhoneNumberId(id) { calls.push(`phone:${id}`); return phones[id] ?? null; },
    async byBusinessAccountId(id) { calls.push(`waba:${id}`); return wabas[id] ?? []; },
  };
}

describe('planWebhookAuthorization — ámbito de canal (app propia)', () => {
  test('una sola organización con app propia → verify con SU secreto', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-a')), resolverWith({ 'pn-a': CH_A }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'channel', secret: SECRET_A, droppedEntryIndexes: [], organizationIds: [7] });
    expect((plan as { entries: unknown[] }).entries).toHaveLength(1);
  });

  test('ATAQUE: entry[0] de A (secreto propio) + entry[1] de B (secreto propio) → 403 mixed_channels', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-a'), messagesEntry('pn-b')), resolverWith({ 'pn-a': CH_A, 'pn-b': CH_B }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'reject', status: 403, code: 'mixed_channels' });
    expect((plan as { detail: string }).detail).toContain('7, 8');
  });

  test('ATAQUE: A (secreto propio) + B (canal de la plataforma, sin secreto propio) → 403 mixed_channels', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-a'), messagesEntry('pn-b')), resolverWith({ 'pn-a': CH_A, 'pn-b': CH_B_PLATFORM }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'reject', status: 403, code: 'mixed_channels' });
  });

  test('ATAQUE: A (secreto propio) + plantilla del WABA de B → 403 mixed_channels', async () => {
    const plan = await planWebhookAuthorization(
      payloadOf(messagesEntry('pn-a'), templateEntry('waba-b')),
      resolverWith({ 'pn-a': CH_A }, { 'waba-b': [CH_B] }),
      GLOBAL
    );
    expect(plan).toMatchObject({ kind: 'reject', status: 403, code: 'mixed_channels' });
  });

  test('A (secreto propio) + número desconocido → verify con A y la entrada desconocida DESCARTADA', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-a'), messagesEntry('pn-zz')), resolverWith({ 'pn-a': CH_A }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'channel', secret: SECRET_A, droppedEntryIndexes: [1], organizationIds: [7] });
    const entries = (plan as { entries: WhatsAppWebhookEntry[] }).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].changes[0].value.metadata.phone_number_id).toBe('pn-a');
  });

  test('A (secreto propio) + plantilla de un WABA desconocido → la plantilla se DESCARTA (no toca meta_template_id de otras orgs)', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-a'), templateEntry('waba-desconocido')), resolverWith({ 'pn-a': CH_A }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'channel', secret: SECRET_A, droppedEntryIndexes: [1] });
  });

  test('dos números del MISMO canal/secreto en entradas distintas → verify, ambas se procesan', async () => {
    const CH_A2: ResolvedChannel = { channelId: 'ch-a2', organizationId: 7, appSecret: SECRET_A };
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-a'), messagesEntry('pn-a2')), resolverWith({ 'pn-a': CH_A, 'pn-a2': CH_A2 }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'channel', secret: SECRET_A, droppedEntryIndexes: [] });
    expect((plan as { entries: unknown[] }).entries).toHaveLength(2);
  });

  test('plantilla de un WABA con canal propio → verify con el secreto del canal (sin META_APP_SECRET)', async () => {
    const plan = await planWebhookAuthorization(payloadOf(templateEntry('waba-a')), resolverWith({}, { 'waba-a': [CH_A] }), null);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'channel', secret: SECRET_A });
  });
});

describe('planWebhookAuthorization — ámbito global (app de la plataforma)', () => {
  test('A y B bajo la app de la plataforma → verify con META_APP_SECRET y se procesan las dos', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-a'), messagesEntry('pn-b')), resolverWith({ 'pn-a': CH_A_PLATFORM, 'pn-b': CH_B_PLATFORM }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'global', secret: GLOBAL, droppedEntryIndexes: [] });
    expect((plan as { organizationIds: number[] }).organizationIds.sort()).toEqual([7, 8]);
    expect((plan as { entries: unknown[] }).entries).toHaveLength(2);
  });

  test('app_secret de relleno en el canal = sin secreto propio → cae al global', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-b')), resolverWith({ 'pn-b': CH_B_PLACEHOLDER }), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'global', secret: GLOBAL });
  });

  test('número desconocido bajo la plataforma → verify global; la entrada NO se descarta (el procesamiento la ignora)', async () => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-zz')), resolverWith({}), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'global', secret: GLOBAL, droppedEntryIndexes: [], organizationIds: [] });
    expect((plan as { entries: unknown[] }).entries).toHaveLength(1);
  });

  test('sin entradas → verify global (Meta manda pings vacíos)', async () => {
    const plan = await planWebhookAuthorization(payloadOf(), resolverWith({}), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'global', secret: GLOBAL });
  });

  test.each([null, '', 'your-meta-app-secret', 'changeme', 'short'])('META_APP_SECRET=%s (ausente/relleno/corto) → 403 signature_secret_missing', async (g) => {
    const plan = await planWebhookAuthorization(payloadOf(messagesEntry('pn-b')), resolverWith({ 'pn-b': CH_B_PLATFORM }), g);
    expect(plan).toMatchObject({ kind: 'reject', status: 403, code: 'signature_secret_missing' });
  });
});

describe('planWebhookAuthorization — robustez', () => {
  test('payload sin `entry` o con entradas malformadas no lanza', async () => {
    const plan = await planWebhookAuthorization({ object: 'whatsapp_business_account' } as never, resolverWith({}), GLOBAL);
    expect(plan).toMatchObject({ kind: 'verify', scope: 'global' });
    const malformed = { object: 'whatsapp_business_account', entry: [null, {}, { id: 5, changes: 'x' }, { changes: [{ value: null }] }] } as never;
    await expect(planWebhookAuthorization(malformed, resolverWith({}), GLOBAL)).resolves.toMatchObject({ kind: 'verify', scope: 'global' });
  });

  test('cada id se resuelve una sola vez aunque aparezca en varias entradas', async () => {
    const r = resolverWith({ 'pn-a': CH_A });
    await planWebhookAuthorization(payloadOf(messagesEntry('pn-a'), messagesEntry('pn-a'), messagesEntry('pn-a')), r, GLOBAL);
    expect(r.calls.filter((c) => c === 'phone:pn-a')).toHaveLength(1);
  });

  test(`más de ${MAX_LOOKUPS} identificadores distintos → 403 too_many_channels sin consultar`, async () => {
    const r = resolverWith({});
    const entries = Array.from({ length: MAX_LOOKUPS + 1 }, (_, i) => messagesEntry(`pn-${i}`));
    const plan = await planWebhookAuthorization(payloadOf(...entries), r, GLOBAL);
    expect(plan).toMatchObject({ kind: 'reject', status: 403, code: 'too_many_channels' });
    expect(r.calls).toHaveLength(0);
  });
});
