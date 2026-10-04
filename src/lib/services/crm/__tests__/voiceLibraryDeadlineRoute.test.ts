import { NextRequest } from 'next/server';

const mockContext = jest.fn();
const mockSearch = jest.fn();
jest.mock('@/lib/utils/orgContext', () => ({
  getServerOrgContext: (...args: unknown[]) => mockContext(...args),
  requireOrgAdmin: jest.fn(),
  OrgContextError: class extends Error { constructor(message: string, readonly statusCode: number) { super(message); } },
}));
jest.mock('@/lib/services/crm/voiceLibraryService', () => ({
  searchLibraryVoices: (...args: unknown[]) => mockSearch(...args), addLibraryVoiceToCatalog: jest.fn(),
}));
import { GET } from '@/app/api/crm/voices/library/route';
import { OrgContextError } from '@/lib/utils/orgContext';
import { ElevenLabsError } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';

const request = () => new NextRequest('https://fixture.invalid/api/crm/voices/library?page=0&language=es');
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

test('la espera del contexto también finaliza antes del timeout20 del navegador', async () => {
  mockContext.mockImplementation(() => new Promise(() => {}));
  const pending = GET(request());
  await jest.advanceTimersByTimeAsync(18_000);
  const response = await pending;
  expect(response.status).toBe(504);
  expect((await response.json()).error).toContain('Vuelve a intentarlo');
  expect(mockContext.mock.calls[0][1].signal.aborted).toBe(true);
  expect(mockSearch).not.toHaveBeenCalled();
});

test.each([401, 403])('conserva rechazo real %s y no consulta proveedor/caché', async (status) => {
  mockContext.mockRejectedValue(new OrgContextError('Sin acceso', status));
  expect((await GET(request())).status).toBe(status);
  expect(mockSearch).not.toHaveBeenCalled();
});

test('usa sólo la org autenticada y pasa cancelación a la búsqueda', async () => {
  mockContext.mockResolvedValue({ organizationId: 120 });
  mockSearch.mockResolvedValue({ voices: [{ id: 'fixture' }], page: 0 });
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(mockSearch.mock.calls[0][0]).toBe(120);
  expect(mockSearch.mock.calls[0][1]).toMatchObject({ language: 'es', page: 0 });
  expect(mockSearch.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
});

test.each([[504, 'provider_timeout'], [503, 'credentials_unavailable']])('devuelve HTTP%s recuperable sin fingir una biblioteca vacía', async (status, code) => {
  mockContext.mockResolvedValue({ organizationId: 120 });
  mockSearch.mockRejectedValue(new ElevenLabsError(status as number, 'Vuelve a intentarlo.', undefined, code as string));
  const response = await GET(request());
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ success: false, error: 'Vuelve a intentarlo.', provider_code: code });
});

test('cancelar la solicitud aborta contexto y responde sin afirmar timeout', async () => {
  const controller = new AbortController();
  mockContext.mockImplementation(() => new Promise(() => {}));
  const pending = GET(new NextRequest('https://fixture.invalid/api/crm/voices/library', { signal: controller.signal }));
  await jest.advanceTimersByTimeAsync(0); controller.abort();
  const response = await pending;
  expect(response.status).toBe(499);
  expect((await response.json()).error).toBe('Petición cancelada.');
  expect(mockContext.mock.calls[0][1].signal.aborted).toBe(true);
});
