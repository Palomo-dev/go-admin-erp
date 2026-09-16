/// <reference types="jest" />
/**
 * F0-SEC r3 · tester · `POST /api/integrations/whatsapp/webhook`.
 *
 * Verifica contra el código r3 los fallos 1 (H1) y 2 (H2) del tester r2 y
 * añade sondas adversarias nuevas sobre la autorización POR CAMBIO:
 *
 *  - Tipos raros de `phone_number_id` (float, negativo, booleano, objeto,
 *    array, 2^53+1 como número JSON crudo, 1e400) dentro de la entrada de A.
 *  - H2 con `entry.id` de B, desconocido y ausente.
 *  - H4 (tester r3; CERRADO en el builder r4): una `message_template_status_update`
 *    de B que ADEMÁS trae `value.metadata.phone_number_id` de A. Hasta r3 el
 *    plan resolvía la `change` por el número (A) y la conservaba con
 *    `id = waba-b`, y el procesamiento aplicaba la plantilla por el WABA de B:
 *    la plantilla de B se pausaba con la firma de A. Ahora los `field` de
 *    plantilla NUNCA se resuelven por número: con `metadata.phone_number_id`
 *    la `change` se descarta como anomalía (`phone_number_on_template_change`),
 *    sin consultar la base; y la ruta entrega al servicio las organizaciones
 *    que autorizó (`authorizedOrganizationIds`) para que interseque.
 *  - Coherencia número ↔ WABA (r4): un `messages` de A bajo un `entry.id` que
 *    resuelve a B → 403 `mixed_channels`.
 *  - Rate limit por IP (r4): la 121.ª petición en un minuto → 429 sin consultar.
 *  - Firmas con el secreto de otro canal o con el global sobre un payload de
 *    canal; canal global + canal propio en el mismo payload.
 *  - Replay del mismo payload firmado (la ruta no lo impide: lo documenta).
 *  - Coste sin firma válida: hasta MAX_LOOKUPS consultas antes del 403.
 *
 * Organizaciones ficticias (7, 8, 9); secretos inventados.
 */
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET_A = 'app-secret-org-7-0123456789abcdef';
const SECRET_B = 'app-secret-org-8-fedcba9876543210';
const GLOBAL = 'platform-app-secret-00112233445566';

type Channel = { channelId: string; organizationId: number; appSecret: string | null; wabaId: string };
const CHANNELS: Record<string, Channel> = {
  'pn-a': { channelId: 'ch-a', organizationId: 7, appSecret: SECRET_A, wabaId: 'waba-a' },
  '123': { channelId: 'ch-b', organizationId: 8, appSecret: SECRET_B, wabaId: 'waba-b' },
  'pn-g': { channelId: 'ch-g', organizationId: 9, appSecret: null, wabaId: 'waba-g' },
  '777': { channelId: 'ch-a2', organizationId: 7, appSecret: SECRET_A, wabaId: '12345' },
};

jest.mock('svix', () => ({ Webhook: class { verify(): void { /* no se usa */ } } }));

type Change = { field: string; value: Record<string, unknown> };
type Payload = { entry: Array<{ id?: unknown; changes: Change[] }> };
type ProcessOpts = { authorizedOrganizationIds?: number[] } | undefined;
const processWebhookPayload = jest.fn<Promise<void>, [Payload, ProcessOpts]>(async () => undefined);
const lookups: string[] = [];
jest.mock('@/lib/services/integrations/whatsapp', () => ({
  whatsappCloudService: {
    findChannelByPhoneNumberId: async (id: unknown) => {
      lookups.push(`phone:${String(id)}:${typeof id}`);
      const c = CHANNELS[String(id)];
      return c ? { channelId: c.channelId, organizationId: c.organizationId } : null;
    },
    getCredentialsByChannelId: async (channelId: string) => {
      const c = Object.values(CHANNELS).find((x) => x.channelId === channelId);
      return c ? { appSecret: c.appSecret ?? '' } : null;
    },
    findChannelsByBusinessAccountId: async (wabaId: unknown) => {
      lookups.push(`waba:${String(wabaId)}:${typeof wabaId}`);
      return Object.values(CHANNELS).filter((c) => c.wabaId === String(wabaId)).map((c) => ({ channelId: c.channelId, organizationId: c.organizationId }));
    },
    processWebhookPayload: (payload: Payload, opts?: ProcessOpts) => processWebhookPayload(payload, opts),
  },
}));

import { POST } from '../route';
import { MAX_LOOKUPS } from '@/lib/services/integrations/whatsapp/webhookAuthorization';
import { _resetRateLimits } from '@/lib/security/rateLimit';

function messagesChange(phoneNumberId: unknown): Change {
  return {
    field: 'messages',
    value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '57300', phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: 'Prueba' }, wa_id: '573001112233' }],
      messages: [{ from: '573001112233', id: `wamid.${String(phoneNumberId)}`, timestamp: '1700000000', type: 'text', text: { body: 'hola' } }],
    },
  };
}
const TPL_B_ID = 'meta-tpl-of-org-8';
const templateChangeOfB = (extraValue: Record<string, unknown> = {}): Change => ({
  field: 'message_template_status_update',
  value: { event: 'DISABLED', message_template_id: TPL_B_ID, reason: 'ABUSIVE_CONTENT', ...extraValue },
});

function sign(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}
function postRaw(raw: string, secret: string | null, signatureOverride?: string, ip = '203.0.113.7'): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': ip };
  if (signatureOverride !== undefined) headers['x-hub-signature-256'] = signatureOverride;
  else if (secret) headers['x-hub-signature-256'] = sign(raw, secret);
  return POST(new NextRequest('http://localhost/api/integrations/whatsapp/webhook', { method: 'post', headers, body: raw }));
}
const post = (body: unknown, secret: string | null) => postRaw(JSON.stringify(body), secret);
const payloadOf = (...entry: unknown[]) => ({ object: 'whatsapp_business_account', entry });

function forwardedChanges(): Array<{ entryId: unknown; change: Change }> {
  return processWebhookPayload.mock.calls.flatMap(([p]) => p.entry.flatMap((e) => e.changes.map((change) => ({ entryId: e.id, change }))));
}
function forwardedPhoneIds(): unknown[] {
  return forwardedChanges().map((f) => (f.change.value as { metadata?: { phone_number_id?: unknown } }).metadata?.phone_number_id).filter((x) => x !== undefined);
}
function forwardedTemplateIds(): unknown[] {
  return forwardedChanges().map((f) => (f.change.value as { message_template_id?: unknown }).message_template_id).filter((x) => x !== undefined);
}

const originalGlobal = process.env.META_APP_SECRET;
let warnSpy: jest.SpyInstance;
beforeEach(() => {
  processWebhookPayload.mockClear();
  lookups.length = 0;
  _resetRateLimits();
  process.env.META_APP_SECRET = GLOBAL;
  delete process.env.WHATSAPP_APP_SECRET;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { if (originalGlobal === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = originalGlobal; });

describe('fallo 1 (H1) del tester r2 · phone_number_id numérico de B en la entrada de A', () => {
  test('123 (número) + pn-a en la misma entrada, firmado por A → 403 mixed_channels; el 123 SÍ se consultó (como string) y nada llegó al procesamiento', async () => {
    const res = await post(payloadOf({ id: 'waba-zz', changes: [messagesChange('pn-a'), messagesChange(123)] }), SECRET_A);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('mixed_channels');
    expect(lookups).toContain('phone:123:string');
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('" 123 " (string con espacios) resuelve a B tras recortar → 403 mixed_channels', async () => {
    const res = await post(payloadOf({ id: 'waba-zz', changes: [messagesChange('pn-a'), messagesChange(' 123 ')] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(lookups).toContain('phone:123:string');
  });

  test.each<[string, unknown]>([
    ['float 123.5', 123.5],
    ['negativo -1', -1],
    ['booleano true', true],
    ['objeto {$gt:0}', { $gt: 0 }],
    ['array ["123"]', ['123']],
    ['cadena vacía', ''],
    ['solo espacios', '   '],
    ['null', null],
  ])('tipo inutilizable (%s) junto a pn-a, firmado por A → 200, la change se DESCARTA sin consultarse y solo pn-a se procesa', async (_label, raw) => {
    const res = await post(payloadOf({ id: 'waba-zz', changes: [messagesChange('pn-a'), messagesChange(raw)] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups.filter((l) => l.startsWith('phone:')).map((l) => l.split(':')[1])).toEqual(['pn-a']);
    expect(forwardedPhoneIds()).toEqual(['pn-a']);
    // El descarte queda en el log con índice de entrada y de cambio.
    const dropped = warnSpy.mock.calls.find((c) => String(c[0]).includes('Cambios descartados'));
    expect(dropped).toBeDefined();
    expect(dropped?.[1]).toMatchObject({ scope: 'channel', organizationIds: [7] });
    expect((dropped?.[1] as { droppedChanges: Array<{ entryIndex: number; changeIndex: number }> }).droppedChanges).toEqual([
      expect.objectContaining({ entryIndex: 0, changeIndex: 1 }),
    ]);
  });

  test('2^53+1 y 1e400 como NÚMEROS JSON crudos → no seguros → se descartan sin consultar (el raw se firma tal cual)', async () => {
    const raw = `{"object":"whatsapp_business_account","entry":[{"id":"waba-zz","changes":[${JSON.stringify(messagesChange('pn-a'))},{"field":"messages","value":{"metadata":{"phone_number_id":9007199254740993},"messages":[]}},{"field":"messages","value":{"metadata":{"phone_number_id":1e400},"messages":[]}}]}]}`;
    const res = await postRaw(raw, SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups.filter((l) => l.startsWith('phone:'))).toEqual(['phone:pn-a:string']);
    expect(forwardedPhoneIds()).toEqual(['pn-a']);
  });

  test('entry.id numérico (12345) del WABA de A → se consulta como string y llega al procesamiento como "12345"', async () => {
    const tplA = { field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: 'meta-tpl-of-org-7' } };
    const res = await post(payloadOf({ id: 12345, changes: [tplA] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups).toContain('waba:12345:string');
    expect(processWebhookPayload.mock.calls[0][0].entry[0].id).toBe('12345');
  });
});

describe('fallo 2 (H2) del tester r2 · plantilla de B dentro de la entrada de A', () => {
  test('entry.id = waba-b (de B) + mensaje de A, firmado por A → 403 mixed_channels', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [messagesChange('pn-a'), templateChangeOfB()] }), SECRET_A);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('mixed_channels');
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('entry.id desconocido → 200, la plantilla se descarta (unknown_waba) y solo el mensaje de A se procesa', async () => {
    const res = await post(payloadOf({ id: 'waba-nadie', changes: [messagesChange('pn-a'), templateChangeOfB()] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedTemplateIds()).toEqual([]);
    expect(forwardedPhoneIds()).toEqual(['pn-a']);
    const dropped = warnSpy.mock.calls.find((c) => String(c[0]).includes('Cambios descartados'))?.[1] as { droppedChanges: Array<{ reason: string }> };
    expect(dropped.droppedChanges.map((d) => d.reason)).toEqual(['unknown_waba']);
  });

  test('sin entry.id → 200, la plantilla se descarta (missing_waba)', async () => {
    const res = await post(payloadOf({ changes: [messagesChange('pn-a'), templateChangeOfB()] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedTemplateIds()).toEqual([]);
    const dropped = warnSpy.mock.calls.find((c) => String(c[0]).includes('Cambios descartados'))?.[1] as { droppedChanges: Array<{ reason: string }> };
    expect(dropped.droppedChanges.map((d) => d.reason)).toEqual(['missing_waba']);
  });

  test('la plantilla de B en una entrada SEPARADA con id waba-b → 403 mixed_channels (control de r2)', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }, { id: 'waba-b', changes: [templateChangeOfB()] }), SECRET_A);
    expect(res.status).toBe(403);
  });
});

describe('H4 (tester r3, cerrado en r4) · plantilla de B con el phone_number_id de A dentro del value', () => {
  // Un webhook real de plantilla no trae `metadata.phone_number_id`; el
  // atacante (org 7, con su propio app_secret) lo añadía para que la `change`
  // resolviera a SU canal mientras la entrada conservaba `id = waba-b`.
  test('entry.id = waba-b + plantilla de B con metadata.phone_number_id = pn-a, firmado por A → NO debe llegar al procesamiento con el WABA de B', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [templateChangeOfB({ metadata: { phone_number_id: 'pn-a' } })] }), SECRET_A);
    const reachedB = forwardedChanges().some((f) => f.entryId === 'waba-b' && (f.change.value as { message_template_id?: string }).message_template_id === TPL_B_ID);
    expect(res.status === 403 || !reachedB).toBe(true);
  });

  test('r4: la change es una anomalía → se descarta SIN consultar la base; sin cambios resolubles el plan cae al global y la firma de A no vale → 403 invalid_signature', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [templateChangeOfB({ metadata: { phone_number_id: 'pn-a' } })] }), SECRET_A);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('invalid_signature');
    expect(lookups).toEqual([]);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('r4: la misma anomalía firmada por la app de la plataforma → 200, pero la change se descarta y se registra (phone_number_on_template_change); nada llega con waba-b', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [templateChangeOfB({ metadata: { phone_number_id: 'pn-a' } })] }), GLOBAL);
    expect(res.status).toBe(200);
    expect(forwardedTemplateIds()).toEqual([]);
    const dropped = warnSpy.mock.calls.find((c) => String(c[0]).includes('Cambios descartados'))?.[1] as { scope: string; droppedChanges: Array<{ reason: string }> };
    expect(dropped.scope).toBe('global');
    expect(dropped.droppedChanges).toEqual([expect.objectContaining({ entryIndex: 0, changeIndex: 0, reason: 'phone_number_on_template_change' })]);
  });

  test('r4: la plantilla LEGÍTIMA (sin metadata) bajo waba-a firmada por A → 200 y el servicio recibe authorizedOrganizationIds = [7]', async () => {
    const tplA = { field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: 'meta-tpl-of-org-7' } };
    const res = await post(payloadOf({ id: 'waba-a', changes: [tplA] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups).toEqual(['waba:waba-a:string']);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    expect(processWebhookPayload.mock.calls[0][1]).toEqual({ authorizedOrganizationIds: [7] });
  });

  test('r4: bajo el ámbito global el servicio recibe authorizedOrganizationIds = undefined (sin intersección)', async () => {
    const res = await post(payloadOf({ id: 'waba-g', changes: [messagesChange('pn-g')] }), GLOBAL);
    expect(res.status).toBe(200);
    expect(processWebhookPayload.mock.calls[0][1]).toEqual({ authorizedOrganizationIds: undefined });
  });

  test('variante con quality_update: mismo camino (descarte sin consulta, 403 con la firma de A)', async () => {
    const quality: Change = { field: 'message_template_quality_update', value: { message_template_id: TPL_B_ID, new_quality_score: 'RED', metadata: { phone_number_id: 'pn-a' } } };
    const res = await post(payloadOf({ id: 'waba-b', changes: [quality] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(lookups).toEqual([]);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('variante con un field de plantilla futuro (message_template_components_update) con número inyectado: también se descarta', async () => {
    const future: Change = { field: 'message_template_components_update', value: { message_template_id: TPL_B_ID, metadata: { phone_number_id: 'pn-a' } } };
    const res = await post(payloadOf({ id: 'waba-b', changes: [future] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(lookups).toEqual([]);
  });
});

describe('r4 · coherencia número ↔ WABA de la entrada (regla general)', () => {
  test('messages de pn-a (A) bajo entry.id = waba-b (B), firmado por A → 403 mixed_channels; nada se procesa', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [messagesChange('pn-a')] }), SECRET_A);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('mixed_channels');
    expect(lookups).toEqual(['phone:pn-a:string', 'waba:waba-b:string']);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('messages de pn-a bajo su propio WABA (waba-a) → 200 (coherente)', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedPhoneIds()).toEqual(['pn-a']);
  });

  test('messages de pn-a bajo un WABA desconocido → 200: un WABA que no resuelve no contradice al número', async () => {
    const res = await post(payloadOf({ id: 'waba-zz', changes: [messagesChange('pn-a')] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedPhoneIds()).toEqual(['pn-a']);
  });

  test('messages de pn-a bajo un WABA cuyo único canal es OTRO número de la MISMA organización sin app_secret → 200 (mismo tenant: coherente)', async () => {
    CHANNELS['pn-a3'] = { channelId: 'ch-a3', organizationId: 7, appSecret: null, wabaId: 'waba-a3' };
    try {
      const res = await post(payloadOf({ id: 'waba-a3', changes: [messagesChange('pn-a')] }), SECRET_A);
      expect(res.status).toBe(200);
      expect(forwardedPhoneIds()).toEqual(['pn-a']);
    } finally {
      delete CHANNELS['pn-a3'];
    }
  });

  test('messages de pn-g (canal de la plataforma) bajo entry.id = waba-a (secreto propio de A) → 403 mixed_channels con cualquiera de los dos secretos', async () => {
    const body = payloadOf({ id: 'waba-a', changes: [messagesChange('pn-g')] });
    expect((await post(body, GLOBAL)).status).toBe(403);
    expect((await post(body, SECRET_A)).status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });
});

describe('firmas con otro secreto, ámbito global y replay', () => {
  test('payload de A firmado con el secreto de B → 403 invalid_signature, nada se procesa', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }), SECRET_B);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('invalid_signature');
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('payload de A firmado con META_APP_SECRET (global) → 403: el canal con app_secret propio NO cae al global', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }), GLOBAL);
    expect(res.status).toBe(403);
  });

  test('canal sin app_secret (pn-g) firmado con el global → 200; firmado con el secreto de A → 403', async () => {
    expect((await post(payloadOf({ id: 'waba-g', changes: [messagesChange('pn-g')] }), GLOBAL)).status).toBe(200);
    processWebhookPayload.mockClear();
    expect((await post(payloadOf({ id: 'waba-g', changes: [messagesChange('pn-g')] }), SECRET_A)).status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('pn-a (canal) + pn-g (global) en el mismo payload → 403 mixed_channels con cualquiera de los dos secretos', async () => {
    const body = payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a'), messagesChange('pn-g')] });
    expect((await post(body, SECRET_A)).status).toBe(403);
    expect((await post(body, GLOBAL)).status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('bajo el global, los números desconocidos y los tipos raros se ENTREGAN al procesamiento (regla 4) — el servicio es quien los ignora', async () => {
    const res = await post(payloadOf({ id: 'waba-g', changes: [messagesChange('pn-g'), messagesChange('pn-nadie'), messagesChange({ $gt: 0 })] }), GLOBAL);
    expect(res.status).toBe(200);
    expect(forwardedChanges()).toHaveLength(3);
  });

  test('replay: el MISMO cuerpo firmado enviado dos veces se procesa dos veces (la ruta no tiene anti-replay; la deduplicación es por external_message_id en el servicio)', async () => {
    const raw = JSON.stringify(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }));
    const sig = sign(raw, SECRET_A);
    expect((await postRaw(raw, null, sig)).status).toBe(200);
    expect((await postRaw(raw, null, sig)).status).toBe(200);
    expect(processWebhookPayload).toHaveBeenCalledTimes(2);
  });

  test('firma con formato distinto (sin "sha256=", mayúsculas, longitud distinta) → 403', async () => {
    const raw = JSON.stringify(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }));
    const hex = crypto.createHmac('sha256', SECRET_A).update(raw, 'utf8').digest('hex');
    expect((await postRaw(raw, null, hex)).status).toBe(403);
    expect((await postRaw(raw, null, `sha256=${hex.slice(0, 63)}`)).status).toBe(403);
    expect((await postRaw(raw, null, `SHA256=${hex}`)).status).toBe(403);
    expect((await postRaw(raw, null, '')).status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });
});

describe('coste antes de la firma y límites', () => {
  test(`${MAX_LOOKUPS + 1} identificadores distintos → 403 too_many_channels SIN consultar la base`, async () => {
    const changes = Array.from({ length: MAX_LOOKUPS + 1 }, (_, i) => messagesChange(`pn-${i}`));
    const res = await post(payloadOf({ id: 'waba-a', changes }), SECRET_A);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('too_many_channels');
    expect(lookups).toEqual([]);
  });

  test('r4: MAX_LOOKUPS es 10; 9 números desconocidos + el WABA con firma basura → 10 consultas como máximo ANTES del 403', async () => {
    expect(MAX_LOOKUPS).toBe(10);
    const changes = Array.from({ length: MAX_LOOKUPS - 1 }, (_, i) => messagesChange(`pn-${i}`));
    const res = await postRaw(JSON.stringify(payloadOf({ id: 'waba-a', changes })), null, 'sha256=' + '0'.repeat(64));
    expect(res.status).toBe(403);
    expect(lookups.filter((l) => l.startsWith('phone:'))).toHaveLength(MAX_LOOKUPS - 1);
    expect(lookups.length).toBeLessThanOrEqual(MAX_LOOKUPS);
  });

  test('r4: 10 números desconocidos + 1 WABA = 11 identificadores → too_many_channels sin consultar', async () => {
    const changes = Array.from({ length: MAX_LOOKUPS }, (_, i) => messagesChange(`pn-${i}`));
    const res = await postRaw(JSON.stringify(payloadOf({ id: 'waba-a', changes })), null, 'sha256=' + '0'.repeat(64));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('too_many_channels');
    expect(lookups).toEqual([]);
  });

  test('r4: rate limit por IP: la 121.ª petición en la ventana → 429 con Retry-After y SIN consultar la base ni procesar', async () => {
    const raw = JSON.stringify(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }));
    const sig = sign(raw, SECRET_A);
    for (let i = 0; i < 120; i++) expect((await postRaw(raw, null, sig, '198.51.100.9')).status).toBe(200);
    lookups.length = 0;
    processWebhookPayload.mockClear();
    const res = await postRaw(raw, null, sig, '198.51.100.9');
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate_limited');
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(lookups).toEqual([]);
    expect(processWebhookPayload).not.toHaveBeenCalled();
    // Otra IP no comparte el cubo.
    expect((await postRaw(raw, null, sig, '198.51.100.10')).status).toBe(200);
  });

  test('r4: el 429 va ANTES de parsear el JSON: un cuerpo inválido tras el límite también recibe 429', async () => {
    for (let i = 0; i < 120; i++) await postRaw('{}', null, 'sha256=' + '0'.repeat(64), '198.51.100.11');
    const res = await postRaw('no-json', null, undefined, '198.51.100.11');
    expect(res.status).toBe(429);
  });

  test('el mismo id repetido 25 veces se consulta UNA vez (memoización)', async () => {
    const changes = Array.from({ length: 25 }, () => messagesChange('pn-a'));
    const res = await post(payloadOf({ id: 'waba-a', changes }), SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups.filter((l) => l.startsWith('phone:'))).toEqual(['phone:pn-a:string']);
    expect(forwardedChanges()).toHaveLength(25);
  });

  test('object distinto de whatsapp_business_account con firma válida → 200 ignored, sin procesar', async () => {
    const res = await post({ object: 'page', entry: [{ id: 'waba-a', changes: [messagesChange('pn-a')] }] }, SECRET_A);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, ignored: true });
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('entry / changes con formas raras (string, null, objeto) no rompen: 403 sin secreto de canal ni consultas', async () => {
    delete process.env.META_APP_SECRET;
    for (const body of [{ object: 'whatsapp_business_account', entry: 'x' }, { object: 'whatsapp_business_account', entry: [null, 5, { changes: 'y' }, { changes: [null, 7] }] }, []]) {
      const res = await post(body, SECRET_A);
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('signature_secret_missing');
    }
    expect(lookups).toEqual([]);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });
});
