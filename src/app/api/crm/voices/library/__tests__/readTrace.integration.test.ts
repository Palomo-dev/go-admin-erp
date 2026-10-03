/** GET real: sesión/contexto, lector de credenciales, caché y cliente ElevenLabs.
 * Sólo se sustituyen I/O de SDK y fetch; no hay BD ni proveedor reales. */
import { webcrypto } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

const user = { id: '30000000-0000-4000-8000-000000000002', email: 'private-user@example.test' };
const traceId = '30000000-0000-4000-8000-000000000003';
const key = 'fixture-provider-key-sufficiently-long';
let authPending = false;
let authPresent = true;
let membershipPending = false;
let membershipPresent = true;
let configPending = false;
let configError = false;
const never = <T,>() => new Promise<T>(() => undefined);

const mockGetUser = jest.fn(() => authPending ? never() : Promise.resolve({ data: { user: authPresent ? user : null }, error: null }));
const mockMaybeSingle = jest.fn(() => membershipPending ? never() : Promise.resolve({
  data: membershipPresent ? { id: 1, organization_id: 120, role_id: 1, is_super_admin: false, organizations: { name: 'Org 120' }, roles: { name: 'Admin' } } : null,
  error: null,
}));
interface SessionQuery {
  select(): SessionQuery;
  eq(column: string, value: unknown): SessionQuery;
  maybeSingle: typeof mockMaybeSingle;
}
const mockSessionFrom = jest.fn((table: string) => {
  if (table !== 'organization_members') throw new Error(`Unexpected table ${table}`);
  const query: SessionQuery = { select: () => query, eq: jest.fn(() => query), maybeSingle: mockMaybeSingle };
  return query;
});
const mockSessionClient = { auth: { getUser: mockGetUser }, from: mockSessionFrom };
const mockSdkFactory = jest.fn(() => mockSessionClient);
jest.mock('@supabase/ssr', () => ({ createServerClient: (...args: unknown[]) => mockSdkFactory(...args as []) }));
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => name === 'goadmin_org_id' ? { value: '120' } : undefined, getAll: () => [], set: jest.fn() }),
  headers: async () => new Headers(),
}));
// Import incidental de cron/webhook en orgContext; GET nunca lo invoca.
jest.mock('@/lib/security/webhookSignatures', () => ({ verifyCronSecret: jest.fn(), WebhookError: class extends Error {} }));
jest.mock('@/lib/services/crm/voiceCatalogService', () => ({ listVoices: jest.fn(), createVoice: jest.fn(), deleteVoice: jest.fn() }));

import { NextRequest } from 'next/server';
import { GET, POST } from '../route';
import { __setProviderCredentialsClient } from '@/lib/services/providerCredentials.server';
import { clearVoiceLibraryCaches } from '@/lib/services/crm/voiceLibraryService';
import { CRM_READ_TRACE_HEADER } from '@/lib/utils/crmReadTrace';

interface ConfigQuery {
  select(): ConfigQuery;
  eq(column: string, value: unknown): ConfigQuery;
  order(): ConfigQuery;
  abortSignal(signal: AbortSignal): ConfigQuery;
  then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown): Promise<unknown>;
}
const mockConfigFrom = jest.fn((table: string) => {
  if (table !== 'provider_configs') throw new Error(`Unexpected table ${table}`);
  const result = () => configPending ? never() : Promise.resolve({
    data: [{ id: '30000000-0000-4000-8000-000000000004', category: 'tts', provider: 'elevenlabs', credentials: { ELEVENLABS_API_KEY: key }, settings: {}, is_active: true, priority: 1 }],
    error: configError ? { message: 'opaque-internal-database-details' } : null,
  });
  const query: ConfigQuery = {
    select: () => query, eq: jest.fn(() => query), order: () => query, abortSignal: jest.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject),
  };
  return query;
});
const configClient = { from: mockConfigFrom } as unknown as SupabaseClient;
const originalFetch = global.fetch;
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let info: jest.SpyInstance;
let errorLog: jest.SpyInstance;
let providerFetch: jest.MockedFunction<typeof fetch>;

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks();
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  authPending = false; authPresent = true; membershipPending = false; membershipPresent = true; configPending = false; configError = false;
  __setProviderCredentialsClient(configClient); clearVoiceLibraryCaches();
  providerFetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ voices: [{ voice_id: 'voice-one', public_owner_id: 'owner-one', name: 'Voz', language: 'es' }], has_more: false, total_count: 1 })));
  global.fetch = providerFetch;
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  clearVoiceLibraryCaches(); __setProviderCredentialsClient(null);
  global.fetch = originalFetch; info.mockRestore(); errorLog.mockRestore(); jest.useRealTimers();
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

function request(signal?: AbortSignal) {
  return new NextRequest('http://localhost/api/crm/voices/library?search=private-search-text&language=es', {
    headers: { [CRM_READ_TRACE_HEADER]: traceId }, signal,
  });
}
function stages() { return info.mock.calls.map(call => call[1].stage); }
function expectFinish(status: number, code?: string) {
  const records = info.mock.calls.map(call => call[1]);
  expect(records.filter(record => record.stage === 'finish')).toEqual([
    { requestId: traceId, route: '/api/crm/voices/library', stage: 'finish', atMs: expect.any(Number), elapsedMs: expect.any(Number), status, ...(code ? { code } : {}) },
  ]);
  const serialized = JSON.stringify(records);
  for (const privateValue of [user.id, user.email, key, 'private-search-text', 'opaque-internal-database-details']) expect(serialized).not.toContain(privateValue);
  expect(errorLog).not.toHaveBeenCalled();
}

test('sesión→membresía→credenciales→transporte reales devuelven voces y correlación sin PII', async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
  expect(await response.json()).toMatchObject({ success: true, data: { voices: [{ voice_id: 'voice-one', name: 'Voz' }] } });
  expect(mockGetUser).toHaveBeenCalledTimes(1); expect(mockMaybeSingle).toHaveBeenCalledTimes(1);
  expect(mockConfigFrom).toHaveBeenCalledWith('provider_configs'); expect(providerFetch).toHaveBeenCalledTimes(1);
  expect(stages()).toEqual(['handler-start', 'context-start', 'context-end', 'library-start', 'library-end', 'finish']);
  expectFinish(200); expect(jest.getTimerCount()).toBe(0);
});

test.each(['auth', 'membership'])('una espera en %s termina en 18s sin consultar proveedor', async phase => {
  authPending = phase === 'auth'; membershipPending = phase === 'membership';
  const pending = GET(request()); await jest.advanceTimersByTimeAsync(18_000);
  const response = await pending;
  expect(response.status).toBe(504); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
  expect(await response.json()).toMatchObject({ success: false });
  expect(stages()).toEqual(['handler-start', 'context-start', 'finish']);
  expectFinish(504, 'REQUEST_TIMEOUT');
  expect(mockConfigFrom).not.toHaveBeenCalled(); expect(providerFetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test.each([['no-session', 401, 'UNAUTHENTICATED'], ['no-membership', 403, 'ORG_FORBIDDEN']] as const)(
  'denegación %s conserva status/correlación y nunca entra en biblioteca', async (phase, status, code) => {
    authPresent = phase !== 'no-session'; membershipPresent = phase !== 'no-membership';
    const response = await GET(request());
    expect(response.status).toBe(status); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
    expectFinish(status, code); expect(stages()).not.toContain('library-start');
    expect(mockConfigFrom).not.toHaveBeenCalled(); expect(providerFetch).not.toHaveBeenCalled();
  },
);

test('credenciales lentas terminan en 4s y no llegan al transporte de voces', async () => {
  configPending = true;
  const pending = GET(request()); await jest.advanceTimersByTimeAsync(4_000);
  const response = await pending;
  expect(response.status).toBe(504); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
  expect(stages()).toEqual(['handler-start', 'context-start', 'context-end', 'library-start', 'finish']);
  expectFinish(504, 'credentials_unavailable'); expect(providerFetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('error de configuración real es 503 sin imprimir detalles de BD ni secreto', async () => {
  configError = true;
  const response = await GET(request());
  expect(response.status).toBe(503); expectFinish(503, 'credentials_unavailable');
  expect(providerFetch).not.toHaveBeenCalled();
});

test.each(['headers', 'body'])('el transporte en %s se aborta a los 10s sin duplicar solicitud', async phase => {
  let transportSignal!: AbortSignal;
  providerFetch.mockImplementation(async (_url, init) => {
    transportSignal = init!.signal!;
    return phase === 'headers' ? never<Response>() : { ok: true, text: () => never<string>() } as Response;
  });
  const pending = GET(request()); await jest.advanceTimersByTimeAsync(10_000);
  const response = await pending;
  expect(response.status).toBe(504); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
  expectFinish(504, 'provider_timeout'); expect(transportSignal.aborted).toBe(true);
  expect(providerFetch).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('un código externo desconocido se atribuye al proveedor sin imprimirlo', async () => {
  providerFetch.mockResolvedValue(new Response(JSON.stringify({ detail: { status: 'opaque-provider-private-code', message: 'opaque-provider-private-message' } }), { status: 403 }));
  const response = await GET(request());
  expect(response.status).toBe(502); expectFinish(502, 'PROVIDER_ERROR');
  expect(JSON.stringify(info.mock.calls)).not.toMatch(/opaque-provider-private/);
});

test('cancelación del cliente termina una vez en 499 y cancela transporte pendiente', async () => {
  const controller = new AbortController();
  let transportSignal!: AbortSignal;
  providerFetch.mockImplementation(async (_url, init) => { transportSignal = init!.signal!; return never<Response>(); });
  const pending = GET(request(controller.signal)); await jest.advanceTimersByTimeAsync(0);
  controller.abort(); const response = await pending;
  expect(response.status).toBe(499); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
  expectFinish(499, 'REQUEST_ABORTED'); expect(transportSignal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('una petición ya abortada tiene correlación pero no consulta sesión ni proveedor', async () => {
  const controller = new AbortController(); controller.abort();
  const response = await GET(request(controller.signal));
  expect(response.status).toBe(499); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
  expect(stages()).toEqual(['handler-start', 'finish']); expectFinish(499, 'REQUEST_ABORTED');
  expect(mockSdkFactory).not.toHaveBeenCalled(); expect(mockConfigFrom).not.toHaveBeenCalled(); expect(providerFetch).not.toHaveBeenCalled();
});

test('fallo inesperado se registra como INTERNAL_ERROR sin volcar mensaje privado', async () => {
  mockMaybeSingle.mockRejectedValueOnce(new Error('opaque-internal-database-details'));
  const response = await GET(request());
  expect(response.status).toBe(500); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBe(traceId);
  expectFinish(500, 'INTERNAL_ERROR'); expect(providerFetch).not.toHaveBeenCalled();
});

test('POST inválido conserva 400 sin traza ni nuevo header de diagnóstico', async () => {
  const response = await POST(new NextRequest('http://localhost/api/crm/voices/library', {
    method: 'POST', headers: { 'content-type': 'application/json', [CRM_READ_TRACE_HEADER]: traceId }, body: '{}',
  }));
  expect(response.status).toBe(400); expect(response.headers.get(CRM_READ_TRACE_HEADER)).toBeNull();
  expect(await response.json()).toMatchObject({ success: false, error: expect.stringContaining('Faltan campos') });
  expect(info).not.toHaveBeenCalled(); expect(mockConfigFrom).not.toHaveBeenCalled(); expect(providerFetch).not.toHaveBeenCalled();
});
