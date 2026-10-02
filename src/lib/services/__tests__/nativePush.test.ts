import { generateKeyPairSync, webcrypto } from 'node:crypto';
import { sendNativePush, type NativePushConfig } from '../../../../supabase/functions/push/nativePush';
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const config: NativePushConfig = { apnsTeamId: 'TEAM', apnsKeyId: 'KEY', apnsTopic: 'io.example.app', apnsPrivateKey: ec.privateKey,
  fcmProjectId: 'proyecto-prueba', fcmClientEmail: 'prueba@example.test', fcmPrivateKey: rsa.privateKey };
beforeAll(() => Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }));

it('iOS usa APNs con JWT ES256 y contexto efímero; nunca envía un APNs token a FCM', async () => {
  const fetcher = jest.fn().mockResolvedValue(new Response('', { status: 200 }));
  const data = { type: 'crm_inbound_call', call_id: 'prueba' };
  expect(await sendNativePush('ios', 'token-apns', 'GO Admin', '📞', data, config, fetcher)).toEqual({ ok: true, invalid: false });
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, request] = fetcher.mock.calls[0];
  expect(url).toBe('https://api.push.apple.com/3/device/token-apns');
  expect(request.headers).toMatchObject({ 'apns-topic': 'io.example.app', 'apns-push-type': 'alert', 'apns-priority': '10' });
  expect(JSON.parse(request.body)).toMatchObject({ aps: { alert: { title: 'GO Admin', body: '📞' } }, ...data });
  const jwt = request.headers.authorization.slice(7).split('.');
  expect(JSON.parse(Buffer.from(jwt[0], 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY' });
  const claims = JSON.parse(Buffer.from(jwt[1], 'base64url').toString()); expect(claims.iss).toBe('TEAM');
  const pem = ec.publicKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await webcrypto.subtle.importKey('spki', Buffer.from(pem, 'base64'), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  expect(await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(jwt[2], 'base64url'), Buffer.from(`${jwt[0]}.${jwt[1]}`))).toBe(true);
});
it('Android obtiene OAuth y usa FCM con ttl 30s y canal instalado', async () => {
  const fetcher = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth-prueba' }), { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }));
  expect(await sendNativePush('android', 'token-fcm', 'GO Admin', '📞', { type: 'crm_inbound_call' }, config, fetcher)).toMatchObject({ ok: true });
  expect(fetcher.mock.calls[0][0]).toBe('https://oauth2.googleapis.com/token');
  expect(fetcher.mock.calls[1][0]).toContain('fcm.googleapis.com');
  expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({ message: { token: 'token-fcm', android: { ttl: '30s', notification: { channel_id: 'goadmin_default' } } } });
});
it('no revoca tokens por timeout, proveedor caído, credenciales incompletas o sandbox/topic incorrectos', async () => {
  for (const failure of [{ status: 503, reason: 'ServiceUnavailable' }, { status: 400, reason: 'BadDeviceToken' }]) {
    const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify({ reason: failure.reason }), { status: failure.status }));
    expect(await sendNativePush('ios', 'token', 't', 'b', undefined, config, fetcher)).toMatchObject({ ok: false, invalid: false });
  }
  const fetcher = jest.fn();
  expect(await sendNativePush('ios', 'token', 't', 'b', undefined, {}, fetcher)).toEqual({ ok: false, invalid: false, unavailable: true });
  expect(fetcher).not.toHaveBeenCalled();
});
it('solo respuestas explícitas de token revocado permiten eliminarlo', async () => {
  const apns = jest.fn().mockResolvedValue(new Response(JSON.stringify({ reason: 'Unregistered' }), { status: 410 }));
  expect(await sendNativePush('ios', 'token', 't', 'b', undefined, config, apns)).toMatchObject({ invalid: true });
  const fcm = jest.fn().mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'oauth' })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { details: [{ errorCode: 'UNREGISTERED' }] } }), { status: 404 }));
  expect(await sendNativePush('android', 'token', 't', 'b', undefined, config, fcm)).toMatchObject({ invalid: true });
});
