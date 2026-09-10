/// <reference types="jest" />
/**
 * Tests de `webhookSignatures` (F0): Twilio, Meta, cron.
 */

import crypto from 'crypto';
import Twilio from 'twilio';

// svix publica solo ESM (dist/index.mjs) y jest (CJS) no lo transforma, así que
// aquí va un doble. OJO: este doble reproducía svix 1.x, donde `verify()`
// devolvía el payload ya parseado, y esa mentira ocultó un fallo real: con
// svix >= 2 `verify()` devuelve `void`, de modo que TODO webhook de Resend con
// firma VÁLIDA reventaba con 500 en producción mientras el test seguía verde.
// El doble reproduce ahora la semántica de la versión instalada, y el test
// `svix instalado` de más abajo rompe ruidosamente si esa versión cambia.
// La verificación con el paquete real (proceso aparte con tsx, porque jest no
// carga su ESM) vive en `src/lib/services/crm/email/__tests__/svixReal.test.ts`.
jest.mock('svix', () => ({
  Webhook: class {
    verify(_payload: string): void {
      // svix >= 2: valida y no devuelve nada. El parseo es del llamador.
    }
  },
}));

jest.mock('@/lib/supabase/server-service', () => {
  const rows: Record<string, { twilio_subaccount_auth_token: string | null }> = {
    ACsub000000000000000000000000000001: { twilio_subaccount_auth_token: 'sub-token-1' },
  };
  return {
    getServiceClient: () => ({
      from: () => ({
        select: () => ({
          eq: (_col: string, value: string) => ({
            limit: () => ({
              maybeSingle: async () => ({ data: rows[value] ?? null, error: null }),
            }),
          }),
        }),
      }),
    }),
  };
});

import {
  verifyMetaSignature,
  verifyCronSecret,
  verifyTwilioRequest,
  verifyTwilioWebhook,
  resolveTwilioAuthToken,
  getTwilioWebhookOrigin,
  safeEqual,
  WebhookError,
} from '../webhookSignatures';

const ORIGIN = 'https://app.example.test';
const MASTER_SID = 'ACmaster0000000000000000000000000';
const MASTER_TOKEN = 'master-token-abc';

function twilioSig(token: string, url: string, params: Record<string, string>): string {
  // Misma fórmula que Twilio: HMAC-SHA1(token, url + params ordenados) base64
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return crypto.createHmac('sha1', token).update(Buffer.from(data, 'utf-8')).digest('base64');
}

function makeReq(pathAndQuery: string, body: string, headers: Record<string, string>): Request {
  return new Request(`https://vercel-internal-host.local${pathAndQuery}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

describe('safeEqual', () => {
  test('igual → true, distinto/longitud distinta → false', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
});

describe('svix instalado', () => {
  // Guarda de versión: el doble de arriba imita la semántica de svix >= 2
  // (`verify()` no devuelve nada). Si alguien baja a 1.x o sube a una mayor
  // nueva, este caso falla y obliga a revisar el doble ANTES de que un webhook
  // con firma válida vuelva a romperse en silencio en producción.
  test('la mayor instalada sigue siendo la que imita el doble', () => {
    const { version } = jest.requireActual('svix/package.json') as { version: string };
    expect(Number(version.split('.')[0])).toBe(2);
  });
});

describe('verifyMetaSignature', () => {
  const secret = 'meta-app-secret';
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const good = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;

  test('firma válida → true', () => {
    expect(verifyMetaSignature(body, good, secret)).toBe(true);
  });
  test('firma inválida / faltante / secreto vacío → false', () => {
    expect(verifyMetaSignature(body, 'sha256=deadbeef', secret)).toBe(false);
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, good, '')).toBe(false);
    expect(verifyMetaSignature(body + ' ', good, secret)).toBe(false);
  });
});

describe('verifyCronSecret (fail-closed)', () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    if (original === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = original;
  });

  test('sin CRON_SECRET configurado → 401 aunque el header sea correcto', () => {
    delete process.env.CRON_SECRET;
    const req = new Request('https://x/api/crm/jobs/run', { headers: { authorization: 'Bearer anything' } });
    expect(() => verifyCronSecret(req)).toThrow(WebhookError);
    try {
      verifyCronSecret(req);
    } catch (e) {
      expect((e as WebhookError).statusCode).toBe(401);
      expect((e as WebhookError).code).toBe('cron_secret_not_configured');
    }
  });

  test('header incorrecto o ausente → 401; correcto → ok', () => {
    process.env.CRON_SECRET = 's3cret';
    expect(() => verifyCronSecret(new Request('https://x/'))).toThrow(WebhookError);
    expect(() => verifyCronSecret(new Request('https://x/', { headers: { authorization: 'Bearer nope' } }))).toThrow(WebhookError);
    expect(() => verifyCronSecret(new Request('https://x/', { headers: { authorization: 'Bearer s3cret' } }))).not.toThrow();
    expect(() => verifyCronSecret(new Request('https://x/', { headers: { 'x-cron-secret': 's3cret' } }))).not.toThrow();
  });
});

describe('Twilio', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.TWILIO_WEBHOOK_BASE_URL = ORIGIN;
    process.env.TWILIO_MASTER_ACCOUNT_SID = MASTER_SID;
    process.env.TWILIO_MASTER_AUTH_TOKEN = MASTER_TOKEN;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
  });
  afterAll(() => {
    process.env = env;
  });

  test('getTwilioWebhookOrigin: devuelve origin puro incluso si la env trae path; lanza si falta', () => {
    process.env.TWILIO_WEBHOOK_BASE_URL = 'https://app.example.test/api/integrations/twilio';
    expect(getTwilioWebhookOrigin()).toBe('https://app.example.test');
    delete process.env.TWILIO_WEBHOOK_BASE_URL;
    expect(() => getTwilioWebhookOrigin()).toThrow(WebhookError);
  });

  test('resolveTwilioAuthToken: master → env; subcuenta → comm_settings; desconocido → null', async () => {
    await expect(resolveTwilioAuthToken(MASTER_SID)).resolves.toBe(MASTER_TOKEN);
    await expect(resolveTwilioAuthToken('ACsub000000000000000000000000000001')).resolves.toBe('sub-token-1');
    await expect(resolveTwilioAuthToken('ACunknown')).resolves.toBeNull();
    await expect(resolveTwilioAuthToken('')).resolves.toBeNull();
  });

  test('verifyTwilioRequest: firma válida sobre origin+path+query (no sobre el host de la petición)', () => {
    const params = { CallSid: 'CA123', AccountSid: MASTER_SID, CallStatus: 'completed' };
    const body = new URLSearchParams(params).toString();
    const url = `${ORIGIN}/api/voice/status?leg=customer`;
    const sig = twilioSig(MASTER_TOKEN, url, params);
    // Sanity: coincide con la implementación de referencia del SDK
    expect(Twilio.validateRequest(MASTER_TOKEN, sig, url, params)).toBe(true);

    const req = makeReq('/api/voice/status?leg=customer', body, { 'x-twilio-signature': sig });
    expect(verifyTwilioRequest(req, body, { authToken: MASTER_TOKEN })).toEqual(params);
  });

  test('verifyTwilioRequest: sin firma / firma inválida / token vacío → 403', () => {
    const params = { CallSid: 'CA123', AccountSid: MASTER_SID };
    const body = new URLSearchParams(params).toString();
    const noSig = makeReq('/api/voice/status', body, {});
    expect(() => verifyTwilioRequest(noSig, body, { authToken: MASTER_TOKEN })).toThrow(WebhookError);

    const badSig = makeReq('/api/voice/status', body, { 'x-twilio-signature': 'bad' });
    expect(() => verifyTwilioRequest(badSig, body, { authToken: MASTER_TOKEN })).toThrow(WebhookError);

    const goodSig = twilioSig(MASTER_TOKEN, `${ORIGIN}/api/voice/status`, params);
    const okReq = makeReq('/api/voice/status', body, { 'x-twilio-signature': goodSig });
    expect(() => verifyTwilioRequest(okReq, body, { authToken: '' })).toThrow(WebhookError);
    // Firma buena pero token distinto (otra cuenta) → 403
    expect(() => verifyTwilioRequest(okReq, body, { authToken: 'other-token' })).toThrow(WebhookError);
  });

  test('verifyTwilioWebhook: resuelve token por AccountSid (subcuenta) y valida', async () => {
    const subSid = 'ACsub000000000000000000000000000001';
    const params = { MessageSid: 'SM1', AccountSid: subSid, MessageStatus: 'delivered' };
    const body = new URLSearchParams(params).toString();
    const url = `${ORIGIN}/api/integrations/twilio/status-callback`;
    const sig = twilioSig('sub-token-1', url, params);
    const req = makeReq('/api/integrations/twilio/status-callback', body, { 'x-twilio-signature': sig });
    const result = await verifyTwilioWebhook(req);
    expect(result.accountSid).toBe(subSid);
    expect(result.params.MessageStatus).toBe('delivered');
  });

  test('verifyTwilioWebhook: AccountSid desconocido → 403 (nunca warn & continue)', async () => {
    const params = { MessageSid: 'SM1', AccountSid: 'ACnobody' };
    const body = new URLSearchParams(params).toString();
    const sig = twilioSig(MASTER_TOKEN, `${ORIGIN}/api/integrations/twilio/status-callback`, params);
    const req = makeReq('/api/integrations/twilio/status-callback', body, { 'x-twilio-signature': sig });
    await expect(verifyTwilioWebhook(req)).rejects.toMatchObject({ statusCode: 403, code: 'twilio_account_unresolved' });
  });

  test('verifyTwilioWebhook: sin TWILIO_MASTER_AUTH_TOKEN → 403 (fail-closed)', async () => {
    delete process.env.TWILIO_MASTER_AUTH_TOKEN;
    const params = { CallSid: 'CA1', AccountSid: MASTER_SID };
    const body = new URLSearchParams(params).toString();
    const req = makeReq('/api/voice/status', body, { 'x-twilio-signature': 'whatever' });
    await expect(verifyTwilioWebhook(req)).rejects.toMatchObject({ statusCode: 403 });
  });
});
