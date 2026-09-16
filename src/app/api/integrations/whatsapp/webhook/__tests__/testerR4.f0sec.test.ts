/// <reference types="jest" />
/**
 * F0-SEC r4 · tester · `POST /api/integrations/whatsapp/webhook`.
 *
 * Sondas adversarias extremo a extremo (HMAC real, servicio doblado) sobre los
 * cambios del constructor r4:
 *
 *  - H4 en sus variantes: plantilla de B con el número de A (y con el de B,
 *    numérico, float, objeto, `''`, `null`), fuera de `metadata`, mezclada con
 *    mensajes legítimos de A, en la misma entrada y en entradas separadas.
 *  - Coherencia número ↔ WABA: WABA de B sin app_secret (global), WABA
 *    compartido por dos organizaciones, WABA de la misma organización con otro
 *    secreto.
 *  - `authorizedOrganizationIds`: la ruta nunca entrega `[]` ni una lista con
 *    organizaciones que no resolvieron al secreto firmante.
 *  - Rate limit por IP: la 121.ª petición LEGÍTIMA también recibe 429 (Meta
 *    reintenta); primer salto de `x-forwarded-for`; sin cabecera de IP todas
 *    comparten el cubo `unknown` (anotado); el cubo es propio del webhook.
 *  - `MAX_LOOKUPS`: las anomalías de plantilla no consumen presupuesto; un
 *    mismo WABA en N entradas cuenta una vez; 10 exactos se consultan y el 11.º
 *    no.
 *  - Replay del mismo `entry.time`: la ruta lo entrega dos veces (la
 *    idempotencia vive en el servicio, probada en el test del servicio).
 *
 * Organizaciones ficticias (7, 8, 9); secretos inventados; sin bytes de control.
 */
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const SECRET_A = 'app-secret-org-7-0123456789abcdef';
const SECRET_A2 = 'app-secret-org-7-second-app-0000000';
const SECRET_B = 'app-secret-org-8-fedcba9876543210';
const GLOBAL = 'platform-app-secret-00112233445566';

type Channel = { channelId: string; organizationId: number; appSecret: string | null; wabaId: string };
const CHANNELS: Record<string, Channel> = {
  'pn-a': { channelId: 'ch-a', organizationId: 7, appSecret: SECRET_A, wabaId: 'waba-a' },
  'pn-a2': { channelId: 'ch-a2', organizationId: 7, appSecret: SECRET_A2, wabaId: 'waba-a2' },
  'pn-b': { channelId: 'ch-b', organizationId: 8, appSecret: SECRET_B, wabaId: 'waba-b' },
  'pn-b-global': { channelId: 'ch-bg', organizationId: 8, appSecret: null, wabaId: 'waba-b-global' },
  'pn-g': { channelId: 'ch-g', organizationId: 9, appSecret: null, wabaId: 'waba-g' },
  'pn-shared-8': { channelId: 'ch-s8', organizationId: 8, appSecret: SECRET_B, wabaId: 'waba-shared' },
  'pn-shared-9': { channelId: 'ch-s9', organizationId: 9, appSecret: null, wabaId: 'waba-shared' },
};

jest.mock('svix', () => ({ Webhook: class { verify(): void { /* no se usa */ } } }));

type Change = { field: string; value: Record<string, unknown> };
type Payload = { entry: Array<{ id?: unknown; time?: unknown; changes: Change[] }> };
type ProcessOpts = { authorizedOrganizationIds?: number[] } | undefined;
const processWebhookPayload = jest.fn<Promise<void>, [Payload, ProcessOpts]>(async () => undefined);
const lookups: string[] = [];
jest.mock('@/lib/services/integrations/whatsapp', () => ({
  whatsappCloudService: {
    findChannelByPhoneNumberId: async (id: unknown) => {
      lookups.push(`phone:${String(id)}`);
      const c = CHANNELS[String(id)];
      return c ? { channelId: c.channelId, organizationId: c.organizationId } : null;
    },
    getCredentialsByChannelId: async (channelId: string) => {
      const c = Object.values(CHANNELS).find((x) => x.channelId === channelId);
      return c ? { appSecret: c.appSecret ?? '' } : null;
    },
    findChannelsByBusinessAccountId: async (wabaId: unknown) => {
      lookups.push(`waba:${String(wabaId)}`);
      return Object.values(CHANNELS).filter((c) => c.wabaId === String(wabaId)).map((c) => ({ channelId: c.channelId, organizationId: c.organizationId }));
    },
    processWebhookPayload: (payload: Payload, opts?: ProcessOpts) => processWebhookPayload(payload, opts),
  },
}));

import { POST } from '../route';
import { MAX_LOOKUPS } from '@/lib/services/integrations/whatsapp/webhookAuthorization';
import { _resetRateLimits } from '@/lib/security/rateLimit';

function messagesChange(phoneNumberId: unknown, from = '573001112233'): Change {
  return {
    field: 'messages',
    value: {
      messaging_product: 'whatsapp',
      metadata: { display_phone_number: '57300', phone_number_id: phoneNumberId },
      contacts: [{ profile: { name: 'Prueba' }, wa_id: from }],
      messages: [{ from, id: `wamid.${String(phoneNumberId)}.${from}`, timestamp: '1700000000', type: 'text', text: { body: 'hola' } }],
    },
  };
}
const TPL_B_ID = 'meta-tpl-of-org-8';
const templateOfB = (extraValue: Record<string, unknown> = {}): Change => ({
  field: 'message_template_status_update',
  value: { event: 'DISABLED', message_template_id: TPL_B_ID, reason: 'ABUSIVE_CONTENT', ...extraValue },
});

function sign(body: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}
function postRaw(raw: string, secret: string | null, headersExtra: Record<string, string> = {}, signatureOverride?: string): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...headersExtra };
  if (signatureOverride !== undefined) headers['x-hub-signature-256'] = signatureOverride;
  else if (secret) headers['x-hub-signature-256'] = sign(raw, secret);
  return POST(new NextRequest('http://localhost/api/integrations/whatsapp/webhook', { method: 'post', headers, body: raw }));
}
const post = (body: unknown, secret: string | null, headersExtra: Record<string, string> = {}) => postRaw(JSON.stringify(body), secret, headersExtra);
const payloadOf = (...entry: unknown[]) => ({ object: 'whatsapp_business_account', entry });
const errorOf = async (res: Response) => (await res.json()).error as string;

function forwarded(): Array<{ entryId: unknown; opts: ProcessOpts; change: Change }> {
  return processWebhookPayload.mock.calls.flatMap(([p, opts]) => p.entry.flatMap((e) => e.changes.map((change) => ({ entryId: e.id, opts, change }))));
}
const forwardedTemplateIds = () => forwarded().map((f) => f.change.value.message_template_id).filter((x) => x !== undefined);
const forwardedPhoneIds = () => forwarded().map((f) => (f.change.value as { metadata?: { phone_number_id?: unknown } }).metadata?.phone_number_id).filter((x) => x !== undefined);
const droppedLog = () => warnSpy.mock.calls.find((c) => String(c[0]).includes('Cambios descartados'))?.[1] as { scope: string; organizationIds: number[]; droppedChanges: Array<{ entryIndex: number; changeIndex: number; reason: string }> } | undefined;

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

describe('H4 · variantes del número inyectado en un cambio de plantilla (entry.id = waba-b, firmado por A)', () => {
  test.each<[string, unknown]>([
    ['string de A (pn-a)', 'pn-a'],
    ['string de B (pn-b)', 'pn-b'],
    ['numérico 123', 123],
    ['float 1.5', 1.5],
    ['objeto {$gt:0}', { $gt: 0 }],
    ['array ["pn-a"]', ['pn-a']],
    ['cadena vacía', ''],
    ['booleano false', false],
  ])('metadata.phone_number_id = %s → anomalía: 0 consultas, 403 invalid_signature, nada se procesa', async (_label, raw) => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [templateOfB({ metadata: { phone_number_id: raw } })] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('invalid_signature');
    expect(lookups).toEqual([]);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('metadata.phone_number_id = null cuenta como AUSENTE: la plantilla se resuelve por el WABA de B y la firma de A no vale → 403 invalid_signature; el número no se consulta', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [templateOfB({ metadata: { phone_number_id: null } })] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('invalid_signature');
    expect(lookups).toEqual(['waba:waba-b']);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('el número de A FUERA de metadata (value.phone_number_id) no cuenta: resuelve por el WABA de B → 403 invalid_signature', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [templateOfB({ phone_number_id: 'pn-a' })] }), SECRET_A);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('invalid_signature');
    expect(lookups).toEqual(['waba:waba-b']);
  });

  test('con la firma de B la anomalía TAMBIÉN se descarta: B no puede aplicar su propia plantilla con un número inyectado (Meta no lo envía así)', async () => {
    const res = await post(payloadOf({ id: 'waba-b', changes: [templateOfB({ metadata: { phone_number_id: 'pn-b' } })] }), SECRET_B);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('invalid_signature');
    expect(lookups).toEqual([]);
  });

  test('entrada mixta: mensajes legítimos de A (waba-a) + plantilla de B con el número de A en una entrada waba-b → 403 mixed_channels; la plantilla ni se consulta', async () => {
    const res = await post(payloadOf(
      { id: 'waba-a', changes: [messagesChange('pn-a')] },
      { id: 'waba-b', changes: [templateOfB({ metadata: { phone_number_id: 'pn-a' } }), messagesChange('pn-a', '573009998877')] },
    ), SECRET_A);
    expect(res.status).toBe(403);
    expect(await errorOf(res)).toBe('mixed_channels');
    expect(lookups).toEqual(['phone:pn-a', 'waba:waba-a', 'waba:waba-b']);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('entrada mixta en la MISMA entrada waba-a: mensajes de A + plantilla de B con número de A → 200, el mensaje pasa y la plantilla se descarta y se registra', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a'), templateOfB({ metadata: { phone_number_id: 'pn-a' } })] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedPhoneIds()).toEqual(['pn-a']);
    expect(forwardedTemplateIds()).toEqual([]);
    expect(droppedLog()?.droppedChanges).toEqual([expect.objectContaining({ entryIndex: 0, changeIndex: 1, reason: 'phone_number_on_template_change' })]);
    expect(forwarded()[0].opts).toEqual({ authorizedOrganizationIds: [7] });
  });

  test('la plantilla de B SIN número bajo el WABA de A → llega al servicio con authorizedOrganizationIds = [7] (el servicio la buscará solo en la org 7)', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [templateOfB()] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(forwardedTemplateIds()).toEqual([TPL_B_ID]);
    expect(forwarded()[0].opts?.authorizedOrganizationIds).toEqual([7]);
    expect(forwarded()[0].entryId).toBe('waba-a');
  });

  test('bajo el global, plantilla anómala + mensaje de pn-g en la misma entrada → 200; solo el mensaje pasa y el descarte se registra con scope global', async () => {
    const res = await post(payloadOf({ id: 'waba-g', changes: [templateOfB({ metadata: { phone_number_id: 'pn-g' } }), messagesChange('pn-g')] }), GLOBAL);
    expect(res.status).toBe(200);
    expect(forwardedTemplateIds()).toEqual([]);
    expect(forwardedPhoneIds()).toEqual(['pn-g']);
    expect(droppedLog()).toMatchObject({ scope: 'global', droppedChanges: [expect.objectContaining({ changeIndex: 0, reason: 'phone_number_on_template_change' })] });
  });
});

describe('coherencia número ↔ WABA · bordes', () => {
  test('mensajes de pn-a bajo un WABA de B SIN app_secret (waba-b-global) → 403 mixed_channels con la firma de A y con la global', async () => {
    const body = payloadOf({ id: 'waba-b-global', changes: [messagesChange('pn-a')] });
    expect(await errorOf(await post(body, SECRET_A))).toBe('mixed_channels');
    expect(await errorOf(await post(body, GLOBAL))).toBe('mixed_channels');
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('mensajes de pn-a bajo un WABA de la MISMA organización con OTRO secreto (waba-a2) → coherente por organización: 200 con la firma de A y 403 con la de A2', async () => {
    const body = payloadOf({ id: 'waba-a2', changes: [messagesChange('pn-a')] });
    const ok = await post(body, SECRET_A);
    expect(ok.status).toBe(200);
    expect(forwarded()[0].opts).toEqual({ authorizedOrganizationIds: [7] });
    processWebhookPayload.mockClear();
    const bad = await post(body, SECRET_A2);
    expect(bad.status).toBe(403);
    expect(await errorOf(bad)).toBe('invalid_signature');
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('WABA compartido por dos organizaciones (8 con secreto, 9 sin él): una plantilla bajo él → 403 mixed_channels con cualquiera de los tres secretos', async () => {
    const body = payloadOf({ id: 'waba-shared', changes: [templateOfB()] });
    for (const secret of [SECRET_B, GLOBAL, SECRET_A]) expect(await errorOf(await post(body, secret))).toBe('mixed_channels');
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('mensajes de pn-b (B) bajo waba-a firmados por B → 403 mixed_channels (la coherencia es simétrica)', async () => {
    const res = await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-b')] }), SECRET_B);
    expect(await errorOf(res)).toBe('mixed_channels');
  });

  test('un WABA de B en la entrada de A se consulta UNA sola vez aunque haya N cambios de A (memoización de la coherencia)', async () => {
    const changes = Array.from({ length: 6 }, (_, i) => messagesChange('pn-a', `5730000000${i}`));
    const res = await post(payloadOf({ id: 'waba-b', changes }), SECRET_A);
    expect(res.status).toBe(403);
    expect(lookups).toEqual(['phone:pn-a', 'waba:waba-b']);
  });
});

describe('authorizedOrganizationIds · lo que la ruta entrega al servicio', () => {
  test('nunca llega [] ni una organización que no resolvió al secreto: con ámbito channel siempre es exactamente la del secreto firmante', async () => {
    await post(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a'), messagesChange('pn-nadie'), messagesChange({ x: 1 })] }), SECRET_A);
    await post(payloadOf({ id: 'waba-a2', changes: [messagesChange('pn-a2')] }), SECRET_A2);
    await post(payloadOf({ id: 'waba-b', changes: [templateOfB()] }), SECRET_B);
    const optsSeen = processWebhookPayload.mock.calls.map(([, o]) => o?.authorizedOrganizationIds);
    expect(optsSeen).toEqual([[7], [7], [8]]);
  });

  test('bajo el global es undefined, nunca [] (el servicio no interseca): regla 4', async () => {
    await post(payloadOf({ id: 'waba-g', changes: [messagesChange('pn-nadie')] }), GLOBAL);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    expect(processWebhookPayload.mock.calls[0][1]).toEqual({ authorizedOrganizationIds: undefined });
  });

  test('las entradas entregadas llevan id normalizado y SOLO los cambios conservados (los descartados no viajan aunque compartan entrada)', async () => {
    await post(payloadOf({ id: 12345, changes: [messagesChange('pn-nadie'), messagesChange('pn-a'), templateOfB({ metadata: { phone_number_id: 'pn-a' } })] }), SECRET_A);
    expect(processWebhookPayload).toHaveBeenCalledTimes(1);
    const [payload] = processWebhookPayload.mock.calls[0];
    expect(payload.entry).toHaveLength(1);
    expect(payload.entry[0].id).toBe('12345');
    expect(payload.entry[0].changes).toHaveLength(1);
    expect(droppedLog()?.droppedChanges.map((d) => d.reason).sort()).toEqual(['phone_number_on_template_change', 'unknown_phone_number']);
  });
});

describe('rate limit por IP · bordes', () => {
  const legit = () => {
    const raw = JSON.stringify(payloadOf({ id: 'waba-a', changes: [messagesChange('pn-a')] }));
    return { raw, sig: sign(raw, SECRET_A) };
  };

  test('la 121.ª petición LEGÍTIMA (firma válida) también recibe 429: el límite no distingue firma (va antes); Meta reintenta', async () => {
    const { raw, sig } = legit();
    for (let i = 0; i < 120; i++) await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.20' }, sig);
    processWebhookPayload.mockClear();
    const res = await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.20' }, sig);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toMatch(/^\d+$/);
    expect(Number(res.headers.get('retry-after'))).toBeLessThanOrEqual(60);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('las peticiones basura (sin firma, JSON inválido) también consumen el cubo: 120 basuras + 1 legítima → 429', async () => {
    for (let i = 0; i < 120; i++) await postRaw('{', null, { 'x-forwarded-for': '198.51.100.21' });
    const { raw, sig } = legit();
    const res = await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.21' }, sig);
    expect(res.status).toBe(429);
    expect(processWebhookPayload).not.toHaveBeenCalled();
  });

  test('x-forwarded-for con varios saltos: manda el PRIMERO (el cliente); cambiar el segundo salto no abre otro cubo', async () => {
    const { raw, sig } = legit();
    for (let i = 0; i < 120; i++) await postRaw(raw, null, { 'x-forwarded-for': `198.51.100.22, 10.0.0.${i % 200}` }, sig);
    const res = await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.22, 10.9.9.9' }, sig);
    expect(res.status).toBe(429);
    // Pero el primer salto distinto sí (ANOTADO: si el proxy APPENDA en vez de sobrescribir, el cliente elige su cubo; en Vercel sobrescribe).
    expect((await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.23, 198.51.100.22' }, sig)).status).toBe(200);
  });

  test('F0-pulido (antes ANOTADO): sin x-forwarded-for, x-real-ip ni cf-connecting-ip todas las peticiones comparten el cubo "unknown", acotado a 12/min (unknownClientLimit) y no a 120', async () => {
    const { raw, sig } = legit();
    const headers = { 'content-type': 'application/json', 'x-hub-signature-256': sig };
    const send = () => POST(new NextRequest('http://localhost/api/integrations/whatsapp/webhook', { method: 'post', headers, body: raw }));
    for (let i = 0; i < 12; i++) expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    // El aviso de cubo sin IP salió una vez, y una IP real conserva su cubo de 120.
    expect((console.warn as jest.Mock).mock.calls.filter((c) => String(c[0]).includes('sin cabecera de IP'))).toHaveLength(1);
    expect((await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.99' }, sig)).status).toBe(200);
  });

  test('el 429 no lee el cuerpo: request.text() sigue disponible después (la ruta no lo consumió)', async () => {
    for (let i = 0; i < 120; i++) await postRaw('{}', null, { 'x-forwarded-for': '198.51.100.24' });
    const req = new NextRequest('http://localhost/api/integrations/whatsapp/webhook', { method: 'post', headers: { 'x-forwarded-for': '198.51.100.24' }, body: '{"a":1}' });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(req.bodyUsed).toBe(false);
    expect(await req.text()).toBe('{"a":1}');
  });

  test('el cubo del webhook es propio (wa_webhook:ip:) y no se comparte con otras claves de la misma IP', async () => {
    const { checkRateLimit } = await import('@/lib/security/rateLimit');
    // 120 en el webhook; la clave genérica de la misma IP sigue libre.
    const { raw, sig } = legit();
    for (let i = 0; i < 120; i++) await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.25' }, sig);
    expect((await postRaw(raw, null, { 'x-forwarded-for': '198.51.100.25' }, sig)).status).toBe(429);
    const other = await checkRateLimit('otra_ruta:ip:198.51.100.25', { limit: 1, windowMs: 60_000 });
    expect(other.allowed).toBe(true);
  });
});

describe('MAX_LOOKUPS · presupuesto de consultas', () => {
  test('MAX_LOOKUPS vale 10 (qa r3 §4); 10 números + el WABA de la entrada = 11 → too_many_channels sin consultar', async () => {
    expect(MAX_LOOKUPS).toBe(10);
    const changes = Array.from({ length: 10 }, (_, i) => messagesChange(`pn-nadie-${i}`));
    const res = await post(payloadOf({ id: 'waba-a', changes }), SECRET_A);
    expect(await errorOf(res)).toBe('too_many_channels');
    expect(lookups).toEqual([]);
  });

  test('las anomalías de plantilla NO consumen presupuesto ni consultas: 50 plantillas con número inyectado + 1 mensaje de A → 200 con 2 consultas', async () => {
    const anomalies = Array.from({ length: 50 }, (_, i) => templateOfB({ metadata: { phone_number_id: `pn-x-${i}` } }));
    const res = await post(payloadOf({ id: 'waba-a', changes: [...anomalies, messagesChange('pn-a')] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups).toEqual(['phone:pn-a', 'waba:waba-a']);
    expect(forwarded()).toHaveLength(1);
    expect(droppedLog()?.droppedChanges).toHaveLength(50);
  });

  test('el mismo WABA en 30 entradas cuenta UNA vez y se consulta una vez', async () => {
    const entries = Array.from({ length: 30 }, () => ({ id: 'waba-a', changes: [templateOfB()] }));
    const res = await post(payloadOf(...entries), SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups).toEqual(['waba:waba-a']);
    expect(forwarded()).toHaveLength(30);
  });

  test(`exactamente ${MAX_LOOKUPS} identificadores (${MAX_LOOKUPS} números sin WABA) se consultan todos y la firma basura recibe invalid_signature/secret_missing, no too_many_channels`, async () => {
    const changes = Array.from({ length: MAX_LOOKUPS }, (_, i) => messagesChange(`pn-nadie-${i}`));
    const res = await postRaw(JSON.stringify(payloadOf({ changes })), null, {}, 'sha256=' + 'f'.repeat(64));
    expect(res.status).toBe(403);
    expect(await errorOf(res)).not.toBe('too_many_channels');
    expect(lookups).toHaveLength(MAX_LOOKUPS);
  });

  test(`${MAX_LOOKUPS + 1} WABAs distintos en entradas separadas → too_many_channels sin consultar`, async () => {
    const entries = Array.from({ length: MAX_LOOKUPS + 1 }, (_, i) => ({ id: `waba-${i}`, changes: [templateOfB()] }));
    const res = await post(payloadOf(...entries), SECRET_A);
    expect(await errorOf(res)).toBe('too_many_channels');
    expect(lookups).toEqual([]);
  });

  test('entradas cuyos cambios son todos inválidos no aportan su WABA al presupuesto', async () => {
    const entries = Array.from({ length: MAX_LOOKUPS + 5 }, (_, i) => ({ id: `waba-${i}`, changes: [messagesChange(1.5)] }));
    const res = await post(payloadOf(...entries, { id: 'waba-a', changes: [messagesChange('pn-a')] }), SECRET_A);
    expect(res.status).toBe(200);
    expect(lookups).toEqual(['phone:pn-a', 'waba:waba-a']);
  });
});

describe('replay del mismo entry.time', () => {
  test('la ruta entrega el mismo cuerpo firmado dos veces con el mismo entry.time (la idempotencia es del servicio: ver el test del servicio)', async () => {
    const raw = JSON.stringify(payloadOf({ id: 'waba-b', time: 1700000000, changes: [templateOfB()] }));
    const sig = sign(raw, SECRET_B);
    expect((await postRaw(raw, null, {}, sig)).status).toBe(200);
    expect((await postRaw(raw, null, {}, sig)).status).toBe(200);
    expect(processWebhookPayload).toHaveBeenCalledTimes(2);
    expect(processWebhookPayload.mock.calls.map(([p]) => p.entry[0].time)).toEqual([1700000000, 1700000000]);
  });
});
