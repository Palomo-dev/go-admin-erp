/// <reference types="jest" />
/**
 * F0-SEC r2 · `POST /api/integrations/whatsapp/webhook` con dos canales de
 * organizaciones distintas (7 y 8), cada uno con su propio `app_secret`.
 *
 * Reproduce el fallo 3 del tester r1: la organización A firma con SU secreto
 * un payload cuyo `entry[1]` lleva el `phone_number_id` de B. Antes → 200 y los
 * mensajes de B se insertaban. Ahora → 403 `mixed_channels` y ningún
 * procesamiento. La firma HMAC se calcula de verdad (no está doblada); solo
 * se dobla el servicio de canales y el procesamiento.
 */
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET_A = 'app-secret-org-7-0123456789abcdef';
const SECRET_B = 'app-secret-org-8-fedcba9876543210';
const GLOBAL = 'platform-app-secret-00112233445566';

type Channel = { channelId: string; organizationId: number; appSecret: string | null; wabaId: string };
const CHANNELS: Record<string, Channel> = {
  'pn-a': { channelId: 'ch-a', organizationId: 7, appSecret: SECRET_A, wabaId: 'waba-a' },
  'pn-b': { channelId: 'ch-b', organizationId: 8, appSecret: SECRET_B, wabaId: 'waba-b' },
  'pn-c': { channelId: 'ch-c', organizationId: 9, appSecret: null, wabaId: 'waba-c' }, // app de la plataforma
  'pn-d': { channelId: 'ch-d', organizationId: 10, appSecret: null, wabaId: 'waba-d' }, // app de la plataforma
};

// svix es solo ESM y jest (CJS) no lo carga; la ruta no lo usa (mismo doble que en security/__tests__).
jest.mock('svix', () => ({ Webhook: class { verify(): void { /* no se usa aquí */ } } }));

const processWebhookPayload = jest.fn(async (_payload: { entry: Array<{ id: string }> }) => undefined);
jest.mock('@/lib/services/integrations/whatsapp', () => ({
  whatsappCloudService: {
    findChannelByPhoneNumberId: async (id: string) => {
      const c = CHANNELS[id];
      return c ? { channelId: c.channelId, organizationId: c.organizationId } : null;
    },
    getCredentialsByChannelId: async (channelId: string) => {
      const c = Object.values(CHANNELS).find((x) => x.channelId === channelId);
      return c ? { appSecret: c.appSecret ?? '' } : null;
    },
    findChannelsByBusinessAccountId: async (wabaId: string) =>
      Object.values(CHANNELS).filter((c) => c.wabaId === wabaId).map((c) => ({ channelId: c.channelId, organizationId: c.organizationId })),
    processWebhookPayload: (payload: { entry: Array<{ id: string }> }) => processWebhookPayload(payload),
  },
}));

import { POST } from '../route';

function entryFor(phoneNumberId: string, wabaId = `waba-${phoneNumberId.slice(-1)}`) {
  return {
    id: wabaId,
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '57300', phone_number_id: phoneNumberId },
        contacts: [{ profile: { name: 'Prueba' }, wa_id: '573001112233' }],
        messages: [{ from: '573001112233', id: `wamid.${phoneNumberId}`, timestamp: '1700000000', type: 'text', text: { body: 'hola' } }],
      },
    }],
  };
}

function templateEntryFor(wabaId: string) {
  return { id: wabaId, changes: [{ field: 'message_template_status_update', value: { event: 'PAUSED', message_template_id: 'tpl-b' } }] };
}

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

let warnSpy: jest.SpyInstance;
let errorSpy: jest.SpyInstance;
const originalGlobal = process.env.META_APP_SECRET;
beforeEach(() => {
  processWebhookPayload.mockClear();
  process.env.META_APP_SECRET = GLOBAL;
  delete process.env.WHATSAPP_APP_SECRET;
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});
afterAll(() => {
  if (originalGlobal === undefined) delete process.env.META_APP_SECRET;
  else process.env.META_APP_SECRET = originalGlobal;
});

describe('camino feliz', () => {
  test('A firma con su secreto un payload solo de A → 200 y se procesa', async () => {
    const res = await post(payloadOf(entryFor('pn-a')), SECRET_A);
    expect(res.status).toBe(200);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    const arg = processWebhookPayload.mock.calls[0][0];
    expect(arg.entry).toHaveLength(1);
  });

  test('dos organizaciones bajo la app de la plataforma, firmado con META_APP_SECRET → 200, se procesan ambas', async () => {
    const res = await post(payloadOf(entryFor('pn-c'), entryFor('pn-d')), GLOBAL);
    expect(res.status).toBe(200);
    const arg = processWebhookPayload.mock.calls[0][0];
    expect(arg.entry).toHaveLength(2);
  });
});

describe('multi-organización (fallo 3 del tester r1)', () => {
  test('ATAQUE: A firma con SU secreto y cuela entry[1] de B → 403 mixed_channels y NINGÚN procesamiento', async () => {
    const res = await post(payloadOf(entryFor('pn-a'), entryFor('pn-b')), SECRET_A);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'mixed_channels' });
    expect(processWebhookPayload).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('mixed_channels'));
  });

  test('ATAQUE: entry[0] de B primero y entry[1] de A, firmado por A → 403 (el orden no importa)', async () => {
    const res = await post(payloadOf(entryFor('pn-b'), entryFor('pn-a')), SECRET_A);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('ATAQUE: A firma y cuela una entrada de C (app de la plataforma) → 403 mixed_channels', async () => {
    const res = await post(payloadOf(entryFor('pn-a'), entryFor('pn-c')), SECRET_A);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('ATAQUE: A firma y cuela un cambio de plantilla del WABA de B → 403 mixed_channels', async () => {
    const res = await post(payloadOf(entryFor('pn-a'), templateEntryFor('waba-b')), SECRET_A);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('ATAQUE: A firma y cuela un cambio de plantilla de un WABA desconocido → 200 pero SOLO se procesa la entrada de A', async () => {
    const res = await post(payloadOf(entryFor('pn-a'), templateEntryFor('waba-nadie')), SECRET_A);
    expect(res.status).toBe(200);
    const arg = processWebhookPayload.mock.calls[0][0];
    expect(arg.entry.map((e) => e.id)).toEqual(['waba-a']);
    // r3: el aviso es por CAMBIO (H1/H2) y sigue indicando la entrada que quedó vacía.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('descartados'), expect.objectContaining({ droppedEntryIndexes: [1], droppedChanges: [{ entryIndex: 1, changeIndex: 0, reason: 'unknown_waba' }] }));
  });

  test('payload de A y B firmado con el secreto de B → 403 igualmente (ninguna de las dos lo procesa)', async () => {
    const res = await post(payloadOf(entryFor('pn-a'), entryFor('pn-b')), SECRET_B);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('payload de A y B firmado con META_APP_SECRET → 403 (los dos tienen app propia; la plataforma no firma por ellos)', async () => {
    const res = await post(payloadOf(entryFor('pn-a'), entryFor('pn-b')), GLOBAL);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });
});

describe('firma y secretos de relleno', () => {
  test('sin X-Hub-Signature-256 → 403 sin consultar ni procesar', async () => {
    const res = await post(payloadOf(entryFor('pn-a')), null);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('payload de A firmado con el secreto de B → 403 invalid_signature', async () => {
    const res = await post(payloadOf(entryFor('pn-a')), SECRET_B);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'invalid_signature' });
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('payload de A firmado con META_APP_SECRET → 403 (el canal tiene secreto propio)', async () => {
    const res = await post(payloadOf(entryFor('pn-a')), GLOBAL);
    expect(res.status).toBe(403);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test.each(['your-meta-app-secret', 'changeme', 'short'])('META_APP_SECRET=%s (relleno) + canal de la plataforma → 403 signature_secret_missing aunque la firma cuadre', async (v) => {
    process.env.META_APP_SECRET = v;
    const res = await post(payloadOf(entryFor('pn-c')), v);
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: 'signature_secret_missing' });
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('JSON inválido → 400', async () => {
    const res = await POST(new NextRequest('http://localhost/api/integrations/whatsapp/webhook', { method: 'post', headers: { 'x-hub-signature-256': 'sha256=00' }, body: '{nope' }));
    expect(res.status).toBe(400);
  });
});
