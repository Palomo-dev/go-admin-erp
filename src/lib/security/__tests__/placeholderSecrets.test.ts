/// <reference types="jest" />
/**
 * F0-SEC · sonda del tester (ronda 1, anexo A) adoptada tal cual como test de
 * regresión «rojo antes, verde después» del crítico 1: la capa
 * `src/lib/security/` aceptaba los literales de `.env.example` como secretos.
 *
 * Bloques:
 *  - P1: `isPlaceholderCredential` reconoce el relleno (incl. `changeme`).
 *  - P2–P5: cron, Meta, Resend y token del ws-server RECHAZAN un secreto de relleno.
 *  - P6/P7: bordes de `wsSessionToken` y `rateLimit` (sub-parte D cambió dos expectativas de P7: fail-closed y evaluar-antes-de-registrar;
 *    los casos que la sub-parte D cambie deben actualizarse allí).
 *  - P8: `foreignOrganizationInBody`.
 *
 * Las expectativas son las del tester; no se han cambiado. Sin datos reales.
 */
import crypto from 'crypto';
jest.mock('svix', () => ({ Webhook: class { constructor(public secret: string) {} verify(): void {} } }));
jest.mock('@/lib/supabase/server-service', () => ({
  getServiceClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }),
}));
import { verifyCronSecret, verifyMetaSignature, verifyResendWebhook, WebhookError } from '../webhookSignatures';
import { issueWsSessionToken, verifyWsSessionToken } from '../wsSessionToken';
import { checkRateLimit, checkRateLimits, getClientIp, _resetRateLimits } from '../rateLimit';
import { foreignOrganizationInBody } from '../organizationBody';
import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';

const PLACEHOLDERS = ['your-secure-random-token-here', 'your-ws-session-secret', 'changeme', 'whsec_your-webhook-secret', 'your-ws-session-secret-at-least-16-chars'];

// El detector registra por consola una vez por variable; silenciarlo aquí.
let errorSpy: jest.SpyInstance;
beforeAll(() => { errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterAll(() => errorSpy.mockRestore());

describe('P1 detector', () => {
  test.each(PLACEHOLDERS)('%s es relleno', (v) => expect(isPlaceholderCredential(v)).toBe(true)); // ROJO en r1: changeme
});
describe('P2 verifyCronSecret con relleno', () => {
  const prev = process.env.CRON_SECRET; afterAll(() => { process.env.CRON_SECRET = prev; });
  test.each(PLACEHOLDERS)('CRON_SECRET=%s → 401', (v) => {                                     // ROJO ×5 en r1
    process.env.CRON_SECRET = v;
    const req = new Request('https://x.test/api/crm/jobs/run', { headers: { authorization: `Bearer ${v}` } });
    expect(() => verifyCronSecret(req)).toThrow(WebhookError);
  });
});
describe('P3 verifyMetaSignature con relleno', () => {
  test.each(PLACEHOLDERS)('appSecret=%s → false', (v) => {                                     // ROJO ×5 en r1
    const body = '{"object":"whatsapp_business_account"}';
    const sig = `sha256=${crypto.createHmac('sha256', v).update(body).digest('hex')}`;
    expect(verifyMetaSignature(body, sig, v)).toBe(false);
  });
});
describe('P4 verifyResendWebhook con relleno', () => {
  test('whsec_your-webhook-secret → 401 antes de svix', () => {                                 // ROJO en r1
    expect(() => verifyResendWebhook('{}', { 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x' }, 'whsec_your-webhook-secret')).toThrow(WebhookError);
  });
});
describe('P5 wsSessionToken con relleno', () => {
  const prev = process.env.WS_SESSION_SECRET; afterAll(() => { process.env.WS_SESSION_SECRET = prev; });
  test.each(['your-ws-session-secret', 'your-ws-session-secret-at-least-16-chars', 'changeme'])('secreto=%s', (v) => { // ROJO ×3 en r1
    process.env.WS_SESSION_SECRET = v;
    let token: string | null = null;
    try { token = issueWsSessionToken({ orgId: 7 }); } catch { token = null; }
    if (token) expect(verifyWsSessionToken(token)).toBeNull(); else expect(token).toBeNull();
  });
});
describe('P6 wsSessionToken bordes', () => {
  beforeAll(() => { process.env.WS_SESSION_SECRET = crypto.randomBytes(32).toString('hex'); });
  test('replay N veces dentro del TTL', () => { const t = issueWsSessionToken({ orgId: 7 }); for (let i = 0; i < 3; i++) expect(verifyWsSessionToken(t)).not.toBeNull(); }); // verde (documenta; jti es de la sub-parte D)
  test('ttl 0: exp == now sigue válido', () => expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, 0))).not.toBeNull());
  test('ttl negativo → null', () => expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, -2))).toBeNull());
  test('orgId string firmado → null', () => {
    const secret = process.env.WS_SESSION_SECRET as string;
    const payload = Buffer.from(JSON.stringify({ orgId: '7', exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url');
    expect(verifyWsSessionToken(`${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`)).toBeNull();
  });
  test('orgId 0 / -1 → null', () => { expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 0 }))).toBeNull(); expect(verifyWsSessionToken(issueWsSessionToken({ orgId: -1 }))).toBeNull(); }); // ROJO en r1
  test('ttl 1 año → null (tope)', () => expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, 365 * 24 * 3600))).toBeNull()); // ROJO en r1
  test('vacío / sin punto → null', () => { for (const t of ['', 'abc', '.', 'a.']) expect(verifyWsSessionToken(t)).toBeNull(); });
});
describe('P7 rateLimit bordes', () => {
  beforeEach(() => _resetRateLimits());
  // F0-SEC r2 sub-parte D: antes era fail-open (documentado en r1); ahora un contador persistente que lanza BLOQUEA.
  test('persistentCount lanza → BLOQUEA (fail-closed)', async () => expect((await checkRateLimit('k1', { limit: 1, persistentCount: async () => { throw new Error('db'); } })).allowed).toBe(false));
  test('persistentCount 100 → bloquea', async () => expect((await checkRateLimit('k2', { limit: 5, persistentCount: async () => 100 })).allowed).toBe(false));
  test('limit 0 / -1 / NaN → bloquea', async () => { for (const l of [0, -1, Number.NaN]) expect((await checkRateLimit('k' + l, { limit: l })).allowed).toBe(false); });
  test('windowMs 0 → bloquea al segundo hit', async () => { const o = { limit: 1, windowMs: 0 }; await checkRateLimit('k6', o); expect((await checkRateLimit('k6', o)).allowed).toBe(false); }); // ROJO en r1
  // F0-SEC r2 sub-parte D: antes 'a' gastaba su hit aunque 'b' bloqueara; ahora se evalúan todas y solo entonces se registra.
  test('checkRateLimits NO consume claves previas cuando una posterior bloquea', async () => {
    await checkRateLimit('b', { limit: 1 });
    const r = await checkRateLimits([{ key: 'a', opts: { limit: 1 } }, { key: 'b', opts: { limit: 1 } }]);
    expect(r.blockedKey).toBe('b');
    expect((await checkRateLimit('a', { limit: 1 })).allowed).toBe(true); // 'a' sigue intacta
  });
  test('getClientIp', () => {
    expect(getClientIp(new Request('https://x.test', { headers: { 'x-forwarded-for': ' 1.2.3.4 , 5.6.7.8' } }))).toBe('1.2.3.4');
    expect(getClientIp(new Request('https://x.test'))).toBe('unknown');
  });
});
describe('P8 foreignOrganizationInBody', () => {
  test('ajeno / igual / ausente', () => {
    expect(foreignOrganizationInBody(8, 7)).toBe(8); expect(foreignOrganizationInBody('8', 7)).toBe('8');
    for (const v of [7, '7', undefined, '  ', '7.0', ' 7 ', [7], '0x7']) expect(foreignOrganizationInBody(v, 7)).toBeNull();
    expect(foreignOrganizationInBody({}, 7)).toEqual({});
  });
});
