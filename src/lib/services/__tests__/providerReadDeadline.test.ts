/** Sólo clientes de BD simulados; sin lectura de secretos ni proveedores reales. */
import type { SupabaseClient } from '@supabase/supabase-js';
jest.mock('@/lib/supabase/server-service', () => ({ assertServerOnly: () => undefined, getServiceClient: () => { throw new Error('No usar BD real'); } }));
import { __setProviderCredentialsClient, getProviderCredentials, listProviderConfigsSafe, ProviderReadError } from '../providerCredentials.server';

type Row = { organization_id: number; id: string; category: string; provider: string; credentials: Record<string, string>; settings: Record<string, unknown>; is_active: boolean; priority: number };
type Result = { data: Row[] | null; error: { message: string } | null };
type Read = { filters: Record<string, unknown>; signal?: AbortSignal };
const ownKey = 'private-unit-org7-8364abcdef0123456789';
const otherKey = 'private-unit-org8-1357fedcba9876543210';
const platformKey = 'private-unit-platform-1234abcdef987654';
const row = (org: number, key: string): Row => ({ organization_id: org, id: String(org), category: 'tts', provider: 'elevenlabs', credentials: { ELEVENLABS_API_KEY: key }, settings: {}, is_active: true, priority: 10 });
function fakeDb(handler: (read: Read) => Promise<Result> | Result) {
  const reads: Read[] = [];
  const execute = jest.fn(handler);
  const rpc = jest.fn(async () => ({ data: null, error: null }));
  const from = jest.fn((table: string) => {
    expect(table).toBe('provider_configs');
    const read: Read = { filters: {} }; reads.push(read);
    const q = {
      select: (_columns: string) => { void _columns; return q; },
      eq: (column: string, value: unknown) => { read.filters[column] = value; return q; },
      order: (_column: string, _options: unknown) => { void _column; void _options; return q; },
      abortSignal: (signal: AbortSignal) => { read.signal = signal; return q; },
      then: (resolve: (value: Result) => unknown, reject?: (error: unknown) => unknown) => Promise.resolve().then(() => execute(read)).then(resolve, reject),
    };
    return q;
  });
  return { client: { from, rpc } as unknown as SupabaseClient, reads, execute, rpc };
}
const previousKey = process.env.ELEVENLABS_API_KEY;
beforeEach(() => { process.env.ELEVENLABS_API_KEY = platformKey; jest.useFakeTimers(); });
afterEach(() => { __setProviderCredentialsClient(null); jest.useRealTimers(); jest.restoreAllMocks(); if (previousKey === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = previousKey; });

describe('Lecturas estrictas del registry de voces', () => {
  it('resuelve sólo el tenant/categoría solicitado y relee cambios sin caché de secretos', async () => {
    let rows = [row(8, otherKey), row(7, ownKey)];
    const db = fakeDb(({ filters }) => ({ data: rows.filter(r => Object.entries(filters).every(([k, v]) => r[k as keyof Row] === v)), error: null }));
    __setProviderCredentialsClient(db.client);
    expect(await getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, timeoutMs: 4_000 })).toMatchObject({ source: 'org', credentials: { ELEVENLABS_API_KEY: ownKey } });
    rows = [row(8, otherKey), row(7, ownKey + '-rotated')];
    expect(await getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, timeoutMs: 4_000 })).toMatchObject({ credentials: { ELEVENLABS_API_KEY: ownKey + '-rotated' } });
    expect(db.execute).toHaveBeenCalledTimes(2); expect(db.reads.every(r => r.filters.organization_id === 7 && r.filters.category === 'tts')).toBe(true);
  });
  it('a los 4 segundos aborta transporte y resuelve error aunque el cliente ignore abort', async () => {
    const db = fakeDb(() => new Promise<Result>(() => undefined)); __setProviderCredentialsClient(db.client);
    const outcome = getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, timeoutMs: 4_000 }).catch(error => error);
    await jest.advanceTimersByTimeAsync(3_999); expect(db.reads[0].signal?.aborted).toBe(false);
    await jest.advanceTimersByTimeAsync(1); expect(await outcome).toMatchObject({ code: 'PROVIDER_READ_TIMEOUT', status: 504, retryable: true });
    expect(db.reads[0].signal?.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  });
  it('un error de BD no se transforma en credencial env ni filtra el detalle', async () => {
    const db = fakeDb(() => ({ data: null, error: { message: `Credencial ${otherKey}` } })); __setProviderCredentialsClient(db.client);
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = await getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, timeoutMs: 4_000 }).catch(e => e);
    expect(error).toBeInstanceOf(ProviderReadError); expect(error).toMatchObject({ code: 'PROVIDER_READ_FAILED', status: 503 });
    expect(error.message).not.toContain(otherKey); expect(log).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  });
  it('un rechazo de transporte es recuperable y no filtra secretos', async () => {
    const db = fakeDb(async () => { throw new Error(otherKey); }); __setProviderCredentialsClient(db.client);
    const error = await getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true }).catch(e => e);
    expect(error).toMatchObject({ code: 'PROVIDER_READ_FAILED', status: 503 }); expect(error.message).not.toContain(otherKey);
  });
  it('un fallo al crear el lector también es recuperable sin revelar su mensaje', async () => {
    __setProviderCredentialsClient({ from: () => { throw new Error(otherKey); } } as unknown as SupabaseClient);
    const error = await getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, timeoutMs: 4_000 }).catch(e => e);
    expect(error).toMatchObject({ code: 'PROVIDER_READ_FAILED', status: 503 }); expect(error.message).not.toContain(otherKey);
  });
  it('cancelado antes de iniciar no ejecuta la consulta ni usa fallback', async () => {
    const db = fakeDb(() => ({ data: [], error: null })); __setProviderCredentialsClient(db.client);
    const ctl = new AbortController(); ctl.abort();
    await expect(getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, signal: ctl.signal })).rejects.toMatchObject({ code: 'PROVIDER_READ_CANCELLED', status: 503 });
    expect(db.execute).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  });
  it('cancelación externa durante consulta aborta el transporte', async () => {
    const db = fakeDb(() => new Promise<Result>(() => undefined)); __setProviderCredentialsClient(db.client);
    const ctl = new AbortController(), outcome = getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, timeoutMs: 4_000, signal: ctl.signal }).catch(e => e);
    await jest.advanceTimersByTimeAsync(0); ctl.abort();
    expect(await outcome).toMatchObject({ code: 'PROVIDER_READ_CANCELLED' }); expect(db.reads[0].signal?.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  });
  it('la ausencia confirmada conserva fallback de plataforma, sin usar la fila de otro tenant', async () => {
    const rows = [row(8, otherKey)], db = fakeDb(({ filters }) => ({ data: rows.filter(r => r.organization_id === filters.organization_id), error: null })); __setProviderCredentialsClient(db.client);
    expect(await getProviderCredentials(7, 'tts', 'elevenlabs', { strict: true, timeoutMs: 4_000 })).toMatchObject({ source: 'env', credentials: { ELEVENLABS_API_KEY: platformKey } });
  });
  it('el listado seguro no genera filas virtuales ni seed ante lectura desconocida', async () => {
    const db = fakeDb(() => ({ data: null, error: { message: 'DB temporal' } })); __setProviderCredentialsClient(db.client);
    await expect(listProviderConfigsSafe(7, 'tts', { strict: true, timeoutMs: 4_000, seed: true })).rejects.toMatchObject({ code: 'PROVIDER_READ_FAILED' }); expect(db.rpc).not.toHaveBeenCalled();
  });
  it('el listado seguro conserva estado utilizable sin devolver valores de credenciales', async () => {
    const db = fakeDb(() => ({ data: [row(7, ownKey)], error: null })); __setProviderCredentialsClient(db.client);
    const items = await listProviderConfigsSafe(7, 'tts', { strict: true, timeoutMs: 4_000 });
    expect(items[0]).toMatchObject({ configured: true, category: 'tts', provider: 'elevenlabs' }); expect(JSON.stringify(items)).not.toContain(ownKey); expect(items[0]).not.toHaveProperty('credentials'); expect(db.rpc).not.toHaveBeenCalled();
  });
  it('sin opt-in conserva el contrato legacy y no añade cancelación ni temporizador', async () => {
    const db = fakeDb(() => ({ data: null, error: { message: 'Fallo legacy' } })); __setProviderCredentialsClient(db.client); jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await getProviderCredentials(7, 'tts', 'elevenlabs')).toMatchObject({ source: 'env', credentials: { ELEVENLABS_API_KEY: platformKey } }); expect(db.reads[0].signal).toBeUndefined(); expect(jest.getTimerCount()).toBe(0);
  });
});
