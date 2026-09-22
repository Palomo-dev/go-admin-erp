import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ai-assistant/attachments/route';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { checkRateLimit } from '@/lib/security/rateLimit';
import { readWsSessionSecret } from '@/lib/security/wsSessionToken';
import { readRealSecret } from '@/lib/security/secrets';
import { uploadAssistantAttachments } from '@/lib/ai/assistant/attachments';

jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: jest.fn(),
  ...jest.requireActual('@/lib/utils/orgContextError'),
}));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock('@/lib/security/wsSessionToken', () => ({ readWsSessionSecret: jest.fn() }));
jest.mock('@/lib/security/secrets', () => ({ readRealSecret: jest.fn() }));

const userId = '11111111-1111-4111-8111-111111111111';
let currentUser = userId;
let organizationId = 120;
let object: { name: string; metadata: { size: number; mimetype: string } } | null;
let saved: Record<string, unknown> | null;
const insert = jest.fn();
const remove = jest.fn().mockResolvedValue({ error: null });
const list = jest.fn();
const createSignedUploadUrl = jest.fn();
const upload = jest.fn();
const filters = jest.fn();
const request = (body: object) => new NextRequest('http://localhost/api/ai-assistant/attachments', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  jest.clearAllMocks(); currentUser = userId; organizationId = 120; object = null; saved = null;
  jest.mocked(readWsSessionSecret).mockReturnValue('a-private-testing-secret-with-at-least-32-characters');
  jest.mocked(readRealSecret).mockReturnValue(null);
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: true, resetAt: new Date(), remaining: 19, count: 1 });
  upload.mockResolvedValue({ error: null });
  createSignedUploadUrl.mockImplementation(async (path: string) => {
    object = { name: path.split('/').pop()!, metadata: { size: 6000000, mimetype: 'image/png' } };
    return { data: { signedUrl: 'https://storage.example/upload', path }, error: null };
  });
  list.mockImplementation(async () => ({ data: object ? [object] : [], error: null }));
  insert.mockImplementation((row: Record<string, unknown>) => {
    saved = { ...row, created_at: '2026-09-19T12:00:00Z' };
    return { select: () => ({ single: async () => ({ data: saved, error: null }) }) };
  });
  const query = () => {
    const q = { select: () => q, eq: (key: string, value: unknown) => { filters(key, value); return q; }, maybeSingle: async () => ({ data: saved, error: null }), insert };
    return q;
  };
  jest.mocked(getServerOrgContext).mockImplementation(async () => ({
    userId: currentUser, organizationId,
    supabase: { from: query, storage: { from: () => ({ createSignedUploadUrl, list, remove, upload }) } },
  }) as unknown as Awaited<ReturnType<typeof getServerOrgContext>>);
});

async function prepare() {
  const response = await POST(request({ operation: 'prepare', filename: 'foto.png', mime: 'image/png', bytes: 6000000 }));
  expect(response.status).toBe(200);
  return response.json();
}

it('prepara sin metadata y finaliza idempotentemente con tamaño/MIME de Storage', async () => {
  const data = await prepare();
  expect(insert).not.toHaveBeenCalled();
  expect(createSignedUploadUrl.mock.calls[0][0]).toMatch(/^org\/120\/[a-f0-9-]+\.png$/);
  expect(createSignedUploadUrl.mock.calls[0][1]).toEqual({ upsert: false });
  const first = await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }));
  expect(first.status).toBe(201);
  const row = await first.json();
  expect(row).toMatchObject({ bytes: 6000000, mime: 'image/png' });
  const retry = await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }));
  expect((await retry.json()).id).toBe(row.id);
  expect(insert).toHaveBeenCalledTimes(1);
  expect(filters).toHaveBeenCalledWith('user_id', userId);
  expect(filters).toHaveBeenCalledWith('organization_id', 120);
});

it.each(['usuario', 'organización', 'firma', 'caducidad'])('rechaza autorización ajena/alterada: %s', async (mode) => {
  const data = await prepare();
  if (mode === 'usuario') currentUser = '22222222-2222-4222-8222-222222222222';
  if (mode === 'organización') organizationId = 121;
  if (mode === 'firma') data.finalizeToken += 'x';
  const now = Date.now();
  const clock = mode === 'caducidad' ? jest.spyOn(Date, 'now').mockReturnValue(now + 3 * 3600000) : null;
  try {
    const response = await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }));
    expect(response.status).toBe(403);
    expect(list).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  } finally { clock?.mockRestore(); }
});

it.each(['ausente', 'tamaño', 'mime', 'excesivo'])('no registra un objeto inválido: %s', async (mode) => {
  const data = await prepare();
  if (mode === 'ausente') object = null;
  if (mode === 'tamaño') object!.metadata.size = 1;
  if (mode === 'excesivo') object!.metadata.size = 20971521;
  if (mode === 'mime') object!.metadata.mimetype = 'text/html';
  const response = await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }));
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(insert).not.toHaveBeenCalled();
});

it('rechaza 20 MB + 1 sin generar URL', async () => {
  const response = await POST(request({ operation: 'prepare', filename: 'foto.png', mime: 'image/png', bytes: 20971521 }));
  expect(response.status).toBe(413);
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});

it.each(['text/html', '__proto__', 'constructor'])('no firma MIME no admitido: %s', async (mime) => {
  expect((await POST(request({ operation: 'prepare', filename: 'foto.png', mime, bytes: 1 }))).status).toBe(415);
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});

it('aplica rate limit de control antes de consultar Storage', async () => {
  jest.mocked(checkRateLimit).mockResolvedValue({ allowed: false, resetAt: new Date(), remaining: 0, count: 100 });
  expect((await POST(request({ operation: 'prepare' }))).status).toBe(429);
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});

it('limita prepare a 20 archivos sin cobrar de nuevo ese cupo en finalize', async () => {
  const data = await prepare();
  expect(checkRateLimit).toHaveBeenCalledWith(`assistant:attach:${userId}`, { limit: 20, windowMs: 3600000 });
  jest.mocked(checkRateLimit).mockClear();
  await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }));
  expect(checkRateLimit).toHaveBeenCalledTimes(1);
  expect(jest.mocked(checkRateLimit).mock.calls[0][0]).toContain('attach-control:120:');
});

it('rechaza si falta el secreto sin emitir URLs', async () => {
  jest.mocked(readWsSessionSecret).mockReturnValue(null);
  expect((await POST(request({ operation: 'prepare' }))).status).toBe(503);
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});

it('funciona sin configuración de voz usando HMAC de plataforma, sin cliente service role', async () => {
  jest.mocked(readWsSessionSecret).mockReturnValue(null);
  jest.mocked(readRealSecret).mockReturnValue('another-private-testing-secret-with-at-least-32-characters');
  const data = await prepare();
  expect((await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }))).status).toBe(201);
  expect(readRealSecret).toHaveBeenCalledWith('SUPABASE_SERVICE_ROLE_KEY', { min: 32 });
});

it('ignora path, bytes y MIME manipulados en finalize y utiliza únicamente claims firmados', async () => {
  const data = await prepare();
  const response = await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken,
    path: 'org/121/ajeno.png', bytes: 1, mime: 'text/html' }));
  expect(response.status).toBe(201);
  expect(insert.mock.calls[0][0]).toMatchObject({ organization_id: 120, user_id: userId, bytes: 6000000, mime: 'image/png' });
  expect(list.mock.calls[0][0]).toBe('org/120');
});

it('conserva el objeto para reintentar cuando falla el insert', async () => {
  const data = await prepare();
  insert.mockImplementationOnce(() => ({ select: () => ({ single: async () => ({ data: null, error: { code: '08006' } }) }) }));
  expect((await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }))).status).toBe(503);
  expect(remove).not.toHaveBeenCalled();
  expect((await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }))).status).toBe(201);
  expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
});

it('resuelve una carrera de PK leyendo la misma fila del usuario', async () => {
  const data = await prepare();
  insert.mockImplementationOnce((row: Record<string, unknown>) => {
    saved = { ...row, created_at: '2026-09-19T12:00:00Z' };
    return { select: () => ({ single: async () => ({ data: null, error: { code: '23505' } }) }) };
  });
  const response = await POST(request({ operation: 'finalize', finalizeToken: data.finalizeToken }));
  expect(response.status).toBe(200);
  expect((await response.json()).id).toBe(saved!.id);
  expect(remove).not.toHaveBeenCalled();
});

it('mantiene el contrato multipart anterior', async () => {
  const form = new FormData();
  form.append('file', new File(['imagen'], 'foto.png', { type: 'image/png' }));
  const response = await POST(new NextRequest('http://localhost/api/ai-assistant/attachments', { method: 'POST', body: form }));
  expect(response.status).toBe(201);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});

it('no lee solicitudes JSON mayores de 8 KB', async () => {
  expect((await POST(request({ operation: 'prepare', filename: 'x'.repeat(9000) }))).status).toBe(413);
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});

it('integra el uploader con prepare/finalize reales sin mandar el binario a Next', async () => {
  const file = new File([new Uint8Array(6000000)], 'foto.png', { type: 'image/png' });
  const transport = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith('https://storage.example/')) {
      expect(init?.body).toBe(file);
      expect(init?.method).toBe('PUT');
      return new Response('{}');
    }
    expect(typeof init?.body).toBe('string');
    const nextInit: ConstructorParameters<typeof NextRequest>[1] = {
      ...init,
      // fetch admite null; el constructor de NextRequest espera undefined.
      signal: init?.signal ?? undefined,
    };
    return POST(new NextRequest('http://localhost/api/ai-assistant/attachments', nextInit));
  });
  const result = await uploadAssistantAttachments([{ id: 'foto', file }], null, transport);
  expect(result.errors).toEqual([]);
  expect(result.ids).toEqual([saved!.id]);
  expect(transport).toHaveBeenCalledTimes(3);
});

it('rechaza una organización distinta en el JSON', async () => {
  const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect((await POST(request({ operation: 'prepare', organizationId: 121 }))).status).toBe(403);
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});

it('rechaza conversaciones ajenas antes de firmar', async () => {
  const response = await POST(request({ operation: 'prepare', filename: 'foto.png', mime: 'image/png', bytes: 1,
    conversation_id: '33333333-3333-4333-8333-333333333333' }));
  expect(response.status).toBe(404);
  expect(filters).toHaveBeenCalledWith('user_id', userId);
  expect(filters).toHaveBeenCalledWith('organization_id', 120);
  expect(createSignedUploadUrl).not.toHaveBeenCalled();
});
