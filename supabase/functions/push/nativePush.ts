/** Transportes de push reales: Capacitor Android entrega FCM; iOS entrega APNs. */
export interface NativePushConfig {
  fcmProjectId?: string; fcmClientEmail?: string; fcmPrivateKey?: string;
  apnsTeamId?: string; apnsKeyId?: string; apnsTopic?: string; apnsPrivateKey?: string; apnsSandbox?: boolean;
}
export interface NativePushResult { ok: boolean; invalid: boolean; unavailable?: boolean }
type Fetch = typeof globalThis.fetch;
function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function encode(value: unknown) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function pemBytes(value: string): ArrayBuffer {
  const pem = value.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const binary = atob(pem); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}
async function signJwt(header: object, claims: object, privateKey: string, kind: 'RS256' | 'ES256') {
  const unsigned = `${encode(header)}.${encode(claims)}`;
  const algorithm = kind === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' }
    : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(privateKey), algorithm, false, ['sign']);
  const signature = await crypto.subtle.sign(kind === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : 'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

export async function sendNativePush(
  platform: string, token: string, title: string, body: string, data: Record<string, string> | undefined,
  config: NativePushConfig, fetcher: Fetch = globalThis.fetch,
): Promise<NativePushResult> {
  const incoming = data?.type === 'crm_inbound_call';
  if (platform === 'ios') {
    if (!config.apnsTeamId || !config.apnsKeyId || !config.apnsTopic || !config.apnsPrivateKey) return { ok: false, invalid: false, unavailable: true };
    const jwt = await signJwt({ alg: 'ES256', kid: config.apnsKeyId }, { iss: config.apnsTeamId, iat: Math.floor(Date.now() / 1000) }, config.apnsPrivateKey, 'ES256');
    const host = config.apnsSandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const response = await fetcher(`https://${host}/3/device/${encodeURIComponent(token)}`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: {
        authorization: `bearer ${jwt}`, 'apns-topic': config.apnsTopic, 'apns-push-type': 'alert', 'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + (incoming ? 30 : 3600)), 'content-type': 'application/json',
      }, body: JSON.stringify({ aps: { alert: { title, body }, sound: 'default' }, ...(data ?? {}) }),
    });
    const error = response.ok ? null : await response.json().catch(() => null) as { reason?: string } | null;
    // Un entorno/topic incorrecto y los errores de red no revocan un dispositivo válido.
    return { ok: response.ok, invalid: response.status === 410 && error?.reason === 'Unregistered' };
  }
  if (platform !== 'android' || !config.fcmProjectId || !config.fcmClientEmail || !config.fcmPrivateKey) return { ok: false, invalid: false, unavailable: true };
  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt({ alg: 'RS256', typ: 'JWT' }, {
    iss: config.fcmClientEmail, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }, config.fcmPrivateKey, 'RS256');
  const auth = await fetcher('https://oauth2.googleapis.com/token', {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const credential = await auth.json().catch(() => null) as { access_token?: string } | null;
  if (!auth.ok || !credential?.access_token) return { ok: false, invalid: false };
  const response = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.fcmProjectId)}/messages:send`, {
    method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${credential.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title, body }, data,
      android: { priority: 'high', ttl: incoming ? '30s' : '3600s', notification: { channel_id: 'goadmin_default', sound: 'default' } } } }),
  });
  const failure = response.ok ? null : await response.json().catch(() => null) as { error?: { details?: { errorCode?: string }[] } } | null;
  return { ok: response.ok, invalid: Boolean(failure?.error?.details?.some(detail => detail.errorCode === 'UNREGISTERED')) };
}
