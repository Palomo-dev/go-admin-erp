/// <reference types="jest" />
/**
 * F0-SEC r2 · tester · `POST /api/integrations/whatsapp/webhook`.
 *
 * Huecos encontrados en `planWebhookAuthorization` (ámbito de canal): la
 * autorización se decide POR ENTRADA (`entry[*]`) pero `processWebhookPayload`
 * procesa POR CAMBIO (`entry[*].changes[*]`). Basta con que UNA `change` de la
 * entrada resuelva al canal de A para que TODA la entrada pase, incluidas las
 * `changes` que no resolvieron a nada:
 *
 *  H1. `phone_number_id` NUMÉRICO (`123` en vez de `"123"`): `describeEntry` lo
 *      ignora (`typeof id === 'string'`), así que no cuenta para el ámbito ni
 *      para `MAX_LOOKUPS`; pero `findChannelByPhoneNumberId(123)` construye el
 *      mismo filtro PostgREST que `'123'` (`credentials->>phone_number_id=eq.123`)
 *      y encuentra el canal de B. Resultado: mensajes inventados en las
 *      conversaciones de B firmados con el secreto de A. Es el fallo 3 del
 *      tester r1 reabierto por coerción de tipo.
 *  H2. `message_template_status_update` con el `message_template_id` de B en la
 *      misma entrada que un mensaje de A, con `entry.id` desconocido o ausente:
 *      la entrada se conserva (A resolvió) y `applyTemplateStatusUpdate` busca
 *      por `metadata->>meta_template_id` en TODAS las organizaciones → pausa la
 *      plantilla y las campañas de B. El test «plantilla de un WABA desconocido
 *      se DESCARTA» del constructor solo cubre la plantilla en una entrada
 *      SEPARADA.
 *
 * Los casos H1/H2 estaban marcados `test.failing` (rojo = hueco abierto).
 * F0-SEC r3 (constructor): cerrados. `planWebhookAuthorization` resuelve y
 * descarta POR CAMBIO y normaliza los ids con `normalizeMetaId` (un `123`
 * numérico se consulta y se trata exactamente como `'123'`), así que ahora son
 * `test` normales: rojo antes, verde después. El resto documenta el
 * comportamiento correcto que NO debía romperse al cerrarlos (camino feliz con
 * HMAC real).
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
};

jest.mock('svix', () => ({ Webhook: class { verify(): void { /* no se usa aquí */ } } }));

type Payload = { entry: Array<{ id?: string; changes: Array<{ field: string; value: Record<string, unknown> }> }> };
const processWebhookPayload = jest.fn<Promise<undefined>, [Payload]>(async () => undefined);
const lookups: string[] = [];
jest.mock('@/lib/services/integrations/whatsapp', () => ({
  whatsappCloudService: {
    // Simula PostgREST: el valor se interpola en la URL (`eq.${value}`), así que 123 y '123' coinciden.
    findChannelByPhoneNumberId: async (id: unknown) => {
      lookups.push(`phone:${String(id)}`);
      const c = CHANNELS[String(id)];
      return c ? { channelId: c.channelId, organizationId: c.organizationId } : null;
    },
    getCredentialsByChannelId: async (channelId: string) => {
      const c = Object.values(CHANNELS).find((x) => x.channelId === channelId);
      return c ? { appSecret: c.appSecret ?? '' } : null;
    },
    findChannelsByBusinessAccountId: async (wabaId: string) => {
      lookups.push(`waba:${wabaId}`);
      return Object.values(CHANNELS).filter((c) => c.wabaId === wabaId).map((c) => ({ channelId: c.channelId, organizationId: c.organizationId }));
    },
    processWebhookPayload: (payload: Payload) => processWebhookPayload(payload),
  },
}));

import { POST } from '../route';
import { _resetRateLimits } from '@/lib/security/rateLimit';

function messagesChange(phoneNumberId: unknown) {
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
const templateChangeOfB = { field: 'message_template_status_update', value: { event: 'DISABLED', message_template_id: 'meta-tpl-of-org-8', reason: 'ABUSIVE_CONTENT' } };

function sign(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}
function post(body: unknown, secret: string | null): Promise<Response> {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret) headers['x-hub-signature-256'] = sign(raw, secret);
  return POST(new NextRequest('http://localhost/api/integrations/whatsapp/webhook', { method: 'post', headers, body: raw }));
}
const payloadOf = (...entry: unknown[]) => ({ object: 'whatsapp_business_account', entry });

/** `true` si alguna `change` entregada al procesamiento pertenece a B (número 123 o plantilla de B). */
function forwardedSomethingOfB(): boolean {
  return processWebhookPayload.mock.calls.some(([p]) =>
    p.entry.some((e) => e.changes.some((c) =>
      String((c.value as { metadata?: { phone_number_id?: unknown } }).metadata?.phone_number_id) === '123' ||
      (c.value as { message_template_id?: string }).message_template_id === 'meta-tpl-of-org-8'
    ))
  );
}

const originalGlobal = process.env.META_APP_SECRET;
beforeEach(() => {
  processWebhookPayload.mockClear();
  lookups.length = 0;
  // F0-pulido: sin cabecera de IP las peticiones comparten el cubo `unknown` (12/min); cada test parte de cero.
  _resetRateLimits();
  process.env.META_APP_SECRET = GLOBAL;
  delete process.env.WHATSAPP_APP_SECRET;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => { if (originalGlobal === undefined) delete process.env.META_APP_SECRET; else process.env.META_APP_SECRET = originalGlobal; });

describe('camino feliz (no debe romperse al cerrar H1/H2)', () => {
  test('webhook legítimo de UNA organización con app propia: mensajes + statuses → 200 y se procesa entero', async () => {
    const entry = {
      id: 'waba-a',
      changes: [
        messagesChange('pn-a'),
        { field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '57300', phone_number_id: 'pn-a' }, statuses: [{ id: 'wamid.x', status: 'delivered', timestamp: '1700000001', recipient_id: '573001112233' }] } },
      ],
    };
    const res = await post(payloadOf(entry), SECRET_A);
    expect(res.status).toBe(200);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    expect(processWebhookPayload.mock.calls[0][0].entry).toHaveLength(1);
    expect(processWebhookPayload.mock.calls[0][0].entry[0].changes).toHaveLength(2);
  });

  test('sin X-Hub-Signature-256 → 403 ANTES de consultar ningún canal (M16 del mutation testing)', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }), null);
    expect(res.status).toBe(403);
    expect(lookups).toEqual([]);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('WHATSAPP_APP_SECRET (alias legacy) vale como secreto global; de relleno no (M17)', async () => {
    delete process.env.META_APP_SECRET;
    process.env.WHATSAPP_APP_SECRET = GLOBAL;
    const unknown = payloadOf({ id: 'waba-zz', changes: [messagesChange('pn-desconocido')] });
    expect((await post(unknown, GLOBAL)).status).toBe(200);
    process.env.WHATSAPP_APP_SECRET = 'your-whatsapp-app-secret-placeholder';
    const res = await post(unknown, 'your-whatsapp-app-secret-placeholder');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'signature_secret_missing' });
    delete process.env.WHATSAPP_APP_SECRET;
  });

  test('mismo payload firmado con el secreto de B → 403 y nada se procesa', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }), SECRET_B);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('B (string "123") en la MISMA entrada que A → 403 mixed_channels (la comprobación por entrada sí funciona con strings)', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a'), messagesChange('123')] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'mixed_channels' });
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });
});

describe('H1 · phone_number_id numérico (coerción de tipo)', () => {
  test('r3: el plan SÍ consulta el 123 numérico (normalizado a "123"): cuenta para el ámbito', async () => {
    await post(payloadOf({ id: 'waba-zz', changes: [messagesChange('pn-a'), messagesChange(123)] }), SECRET_A);
    expect(lookups).toContain('phone:123');
  });

  test('ATAQUE: A firma {pn-a (string), 123 (number = B)} en una entrada → 403 mixed_channels y nada llega al procesamiento', async () => {
    const res = await post(payloadOf({ id: 'waba-zz', changes: [messagesChange('pn-a'), messagesChange(123)] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'mixed_channels' });
    expect(forwardedSomethingOfB()).toBe(false);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('ATAQUE: 123 numérico SOLO bajo el secreto GLOBAL → se resuelve (es el canal de B, con secreto propio) y responde EXACTAMENTE igual que "123"', async () => {
    // r2 esperaba 200 + consulta; pero en este arnés "123" es el canal de B con app_secret
    // propio, así que el plan exige la firma de B y la global no vale: 403 invalid_signature,
    // idéntico al caso string. Lo que cierra H1 es que el número ya se consulta y se
    // trata igual que el string, no un 200.
    const asNumber = await post(payloadOf({ id: 'waba-zz', changes: [messagesChange(123)] }), GLOBAL);
    expect(lookups).toContain('phone:123');
    const numberBody = await asNumber.json();
    lookups.length = 0;
    const asString = await post(payloadOf({ id: 'waba-zz', changes: [messagesChange('123')] }), GLOBAL);
    expect(lookups).toContain('phone:123');
    expect(asNumber.status).toBe(asString.status);
    expect(numberBody).toEqual(await asString.json());
    expect(asNumber.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('r3: 123 numérico firmado por B → 200 y el procesamiento recibe "123" como STRING (normalizado por el plan)', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [messagesChange(123)] }), SECRET_B);
    expect(res.status).toBe(200);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    const forwarded = processWebhookPayload.mock.calls[0][0].entry[0].changes[0].value as { metadata?: { phone_number_id?: unknown } };
    expect(forwarded.metadata?.phone_number_id).toBe('123');
  });
});

describe('H2 · plantilla de B dentro de la entrada de A', () => {
  test('ATAQUE: {mensaje de A, template_status de B} con entry.id de un WABA desconocido → 200, el mensaje de A se procesa y la plantilla se DESCARTA', async () => {
    const res = await post(payloadOf({ id: 'waba-desconocido', changes: [messagesChange('pn-a'), templateChangeOfB] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedSomethingOfB()).toBe(false);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    expect(processWebhookPayload.mock.calls[0][0].entry[0].changes).toHaveLength(1);
  });

  test('ATAQUE: igual pero SIN entry.id → 200 y la plantilla de B se DESCARTA', async () => {
    const res = await post(payloadOf({ changes: [messagesChange('pn-a'), templateChangeOfB] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedSomethingOfB()).toBe(false);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
  });

  test('control: la misma plantilla de B en una entrada SEPARADA sí se descarta (caso del constructor)', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }, { id: 'waba-desconocido', changes: [templateChangeOfB] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedSomethingOfB()).toBe(false);
  });

  test('control: la plantilla con el WABA de B (resoluble) en la entrada de A → 403 mixed_channels', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [messagesChange('pn-a'), templateChangeOfB] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });
});
