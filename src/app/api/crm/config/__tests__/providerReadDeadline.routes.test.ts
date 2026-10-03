import { NextRequest } from 'next/server';
jest.mock('@/lib/utils/orgContext', () => ({ ...jest.requireActual('@/lib/utils/orgContextError'), getServerOrgContext: jest.fn() }));
jest.mock('@/lib/supabase/server-service', () => ({ assertServerOnly: () => undefined, getServiceClient: () => { throw new Error('Sin BD real'); } }));
jest.mock('@/lib/services/providerCredentials.server', () => ({ ...jest.requireActual('@/lib/services/providerCredentials.server'), listProviderConfigsSafe: jest.fn(), upsertProviderConfig: jest.fn() }));
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { listProviderConfigsSafe, ProviderReadError } from '@/lib/services/providerCredentials.server';
import { GET } from '../providers/route';

const context = { organizationId: 7, userId: 'private-unit-actor', roleId: 2, isSuperAdmin: false };
const request = (category?: string, signal?: AbortSignal) => new NextRequest('http://localhost/api/crm/config/providers' + (category ? '?category=' + category + '&organization_id=999' : ''), { signal });
const org = jest.mocked(getServerOrgContext), list = jest.mocked(listProviderConfigsSafe);
beforeEach(() => { jest.clearAllMocks(); org.mockResolvedValue(context as Awaited<ReturnType<typeof getServerOrgContext>>); list.mockResolvedValue([]); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('GET registry TTS con plazo y tenant verificado', () => {
  it('usa org de sesión, lectura estricta 4s y signal propio; no consulta la org de query', async () => {
    const req = request('tts'), response = await GET(req);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ success: true, can_edit: true, items: [] });
    expect(list).toHaveBeenCalledWith(7, 'tts', expect.objectContaining({ seed: true, timeoutMs: 4_000, strict: true, signal: expect.any(AbortSignal) }));
    expect(org).toHaveBeenCalledWith(req, expect.objectContaining({ signal: expect.any(AbortSignal) })); expect(jest.getTimerCount()).toBe(0);
  });
  it.each(['voice', 'llm', undefined])('categoría %s conserva contrato legacy sin presupuesto nuevo', async category => {
    expect((await GET(request(category))).status).toBe(200); expect(org).toHaveBeenCalledWith(); expect(list).toHaveBeenCalledWith(7, category, { seed: true }); expect(jest.getTimerCount()).toBe(0);
  });
  it.each(['PROVIDER_READ_FAILED', 'PROVIDER_READ_TIMEOUT', 'PROVIDER_READ_CANCELLED'] as const)('%s es error recuperable sin inventar disponibilidad', async code => {
    const error = new ProviderReadError(code); list.mockRejectedValue(error); const response = await GET(request('tts'));
    expect(response.status).toBe(code === 'PROVIDER_READ_TIMEOUT' ? 504 : 503); const body = await response.json(); expect(body).toMatchObject({ success: false, code, retryable: true }); expect(body).not.toHaveProperty('items'); expect(body).not.toHaveProperty('credentials');
  });
  it.each([401, 403])('sin sesión/membresía (%s) no consulta credenciales', async status => {
    org.mockRejectedValue(new OrgContextError('Acceso denegado', status)); const response = await GET(request('tts')); expect(response.status).toBe(status); expect(list).not.toHaveBeenCalled();
  });
  it('plazo global 18s corta contexto atascado antes del timeout de pantalla', async () => {
    org.mockImplementation(() => new Promise(() => undefined)); const outcome = GET(request('tts')); await jest.advanceTimersByTimeAsync(18_000);
    const response = await outcome; expect(response.status).toBe(504); expect(await response.json()).toMatchObject({ success: false, code: 'REQUEST_TIMEOUT', retryable: true });
    const signal = org.mock.calls[0][1]?.signal; expect(signal?.aborted).toBe(true); expect(list).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  });
  it('cancelar la petición interrumpe contexto y distingue cancelación de timeout', async () => {
    org.mockImplementation(() => new Promise(() => undefined)); const ctl = new AbortController(), outcome = GET(request('tts', ctl.signal)); await jest.advanceTimersByTimeAsync(0); ctl.abort();
    const response = await outcome; expect(response.status).toBe(499); expect(await response.json()).toMatchObject({ code: 'REQUEST_ABORTED' }); expect(list).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
  });
  it('plazo global también limita una lectura atascada después de resolver contexto', async () => {
    list.mockImplementation(() => new Promise(() => undefined)); const outcome = GET(request('tts')); await jest.advanceTimersByTimeAsync(18_000);
    const response = await outcome; expect(response.status).toBe(504); expect(await response.json()).toMatchObject({ code: 'REQUEST_TIMEOUT' }); expect(list.mock.calls[0][2]?.signal?.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
  });
  it('un miembro puede leer TTS sin sembrar ni obtener privilegios admin por nombre', async () => {
    org.mockResolvedValue({ ...context, roleId: 4, roleName: 'Admin de organización' } as Awaited<ReturnType<typeof getServerOrgContext>>);
    const response = await GET(request('tts')); expect(await response.json()).toMatchObject({ can_edit: false }); expect(list).toHaveBeenCalledWith(7, 'tts', expect.objectContaining({ seed: false }));
  });
});
