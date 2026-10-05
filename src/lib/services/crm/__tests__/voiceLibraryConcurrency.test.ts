/** Lecturas compartidas con clientes dobles: ninguna petición real al proveedor o a la BD. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SharedVoicesPage } from '@/lib/services/integrations/elevenlabs/voiceCloneClient';
import { RequestDeadlineError } from '@/lib/utils/requestDeadline';

const mockRows = jest.fn();
const mockCreate = jest.fn();
const mockClient = {
  cacheKey: 'fingerprint-a' as string | undefined,
  listSharedVoices: jest.fn(), listVoices: jest.fn(), getSubscription: jest.fn(),
  addSharedVoice: jest.fn(), deleteVoice: jest.fn(), synthesize: jest.fn(),
};
const mockGetClient = jest.fn<Promise<typeof mockClient>, [orgId: number, options?: { signal?: AbortSignal }]>();
jest.mock('@/lib/services/crm/voiceCatalogService', () => ({
  listVoices: (...args: unknown[]) => mockRows(...args),
  createVoice: (...args: unknown[]) => mockCreate(...args), deleteVoice: jest.fn(),
}));
jest.mock('@/lib/services/integrations/elevenlabs/voiceCloneClient', () => ({
  ElevenLabsError: class extends Error {},
  getElevenLabsClientForOrg: (...args: Parameters<typeof mockGetClient>) => mockGetClient(...args),
}));
import {
  addLibraryVoiceToCatalog, clearVoiceLibraryCaches, getAccountCapabilities,
  listVoicesEnriched, previewCatalogVoice, searchLibraryVoices,
} from '../voiceLibraryService';

const db = {} as SupabaseClient, org = 120;
const page = (name: string): SharedVoicesPage => ({ voices: [{ voice_id: 'voice-a', public_owner_id: 'owner', name }], has_more: false, total_count: 1 });
const catalogRow = { id: 'row-a', organization_id: org, provider: 'elevenlabs', provider_voice_id: 'voice-a', name: 'Catálogo nativo', language: 'es', kind: 'library' };
const subscription = { tier: 'free', can_use_instant_voice_cloning: false };
const workspace = (preview: string) => [{ voice_id: 'voice-a', preview_url: preview, labels: { language: 'es' }, category: 'professional' }];
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>(resolve => setImmediate(resolve));

beforeEach(() => {
  clearVoiceLibraryCaches(); jest.resetAllMocks(); mockClient.cacheKey = 'fingerprint-a';
  mockGetClient.mockImplementation(async () => ({ ...mockClient }));
  mockRows.mockResolvedValue([catalogRow]); mockCreate.mockResolvedValue(catalogRow);
  mockClient.listSharedVoices.mockResolvedValue(page('Respuesta vigente'));
  mockClient.listVoices.mockResolvedValue(workspace('https://example.invalid/current.mp3'));
  mockClient.getSubscription.mockResolvedValue(subscription);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => { clearVoiceLibraryCaches(); jest.restoreAllMocks(); });

test('dos búsquedas simultáneas autorizan cada lector pero comparten una lectura del proveedor', async () => {
  const pending = deferred<SharedVoicesPage>(); mockClient.listSharedVoices.mockReturnValue(pending.promise);
  const first = searchLibraryVoices(org, { search: 'voz' }), second = searchLibraryVoices(org, { search: 'voz' });
  await flush(); expect(mockGetClient).toHaveBeenCalledTimes(2); expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(1);
  pending.resolve(page('Compartida')); const result = await Promise.all([first, second]);
  expect(result[0]).toEqual(result[1]); expect(result[0].voices[0].name).toBe('Compartida');
  await searchLibraryVoices(org, { search: 'voz' });
  expect(mockGetClient).toHaveBeenCalledTimes(3); expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(1);
});

test('consultas u organizaciones distintas nunca comparten una entrada, incluso con igual credencial', async () => {
  await Promise.all([searchLibraryVoices(org, { search: 'a' }), searchLibraryVoices(org, { search: 'b' }), searchLibraryVoices(org + 1, { search: 'a' })]);
  expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(3);
});

test('una credencial revocada no devuelve la biblioteca ya cacheada', async () => {
  await searchLibraryVoices(org, {});
  mockGetClient.mockRejectedValueOnce(new Error('Credencial revocada'));
  await expect(searchLibraryVoices(org, {})).rejects.toThrow('Credencial revocada');
  expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(1);
});

test('rotación de credencial separa lecturas pendientes y cachés de una misma organización', async () => {
  const old = deferred<SharedVoicesPage>(); mockClient.listSharedVoices.mockReturnValueOnce(old.promise);
  const oldRead = searchLibraryVoices(org, {}); await flush();
  mockClient.cacheKey = 'fingerprint-b'; mockClient.listSharedVoices.mockResolvedValue(page('Cuenta nueva'));
  expect((await searchLibraryVoices(org, {})).voices[0].name).toBe('Cuenta nueva');
  old.resolve(page('Cuenta anterior')); await oldRead;
  expect((await searchLibraryVoices(org, {})).voices[0].name).toBe('Cuenta nueva');
  expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(2);
});

test('cancelar un lector no cancela la red ni la respuesta de otro lector', async () => {
  const pending = deferred<SharedVoicesPage>(), firstController = new AbortController();
  mockClient.listSharedVoices.mockReturnValue(pending.promise);
  const first = searchLibraryVoices(org, {}, firstController.signal), rejected = expect(first).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  const second = searchLibraryVoices(org, {}); await flush();
  const sharedSignal = mockClient.listSharedVoices.mock.calls[0][1] as AbortSignal;
  expect(sharedSignal).not.toBe(firstController.signal); firstController.abort(); await rejected;
  expect(sharedSignal.aborted).toBe(false); pending.resolve(page('Otro lector')); expect((await second).voices[0].name).toBe('Otro lector');
  await searchLibraryVoices(org, {}); expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(1);
});

test('el último lector cancela la red; una respuesta tardía no cachea ni retira su reemplazo', async () => {
  const old = deferred<SharedVoicesPage>(), fresh = deferred<SharedVoicesPage>(), controller = new AbortController();
  mockClient.listSharedVoices.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  const first = searchLibraryVoices(org, {}, controller.signal), rejected = expect(first).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  await flush(); const oldSignal = mockClient.listSharedVoices.mock.calls[0][1] as AbortSignal;
  controller.abort(); await rejected; expect(oldSignal.aborted).toBe(true);
  const replacement = searchLibraryVoices(org, {}); await flush(); old.resolve(page('Tardía e ignorada')); await flush();
  const joined = searchLibraryVoices(org, {}); await flush(); expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(2);
  fresh.resolve(page('Vigente')); const values = await Promise.all([replacement, joined]);
  expect(values.every(value => value.voices[0].name === 'Vigente')).toBe(true);
  expect((await searchLibraryVoices(org, {})).voices[0].name).toBe('Vigente');
});

test('cancelación previa y cancelación durante configuración no llaman al proveedor', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(searchLibraryVoices(org, {}, controller.signal)).rejects.toMatchObject({ code: 'REQUEST_ABORTED' }); expect(mockGetClient).not.toHaveBeenCalled();
  const config = deferred<typeof mockClient>(), later = new AbortController(); mockGetClient.mockReturnValueOnce(config.promise);
  const read = searchLibraryVoices(org, {}, later.signal), rejected = expect(read).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  later.abort(); config.resolve(mockClient); await rejected; expect(mockClient.listSharedVoices).not.toHaveBeenCalled();
});

test('un fallo compartido rechaza ambos lectores y permite reintentar', async () => {
  const pending = deferred<SharedVoicesPage>(); mockClient.listSharedVoices.mockReturnValueOnce(pending.promise);
  const first = searchLibraryVoices(org, {}), second = searchLibraryVoices(org, {});
  const checks = [expect(first).rejects.toThrow('Proveedor temporalmente caído'), expect(second).rejects.toThrow('Proveedor temporalmente caído')];
  await flush(); pending.reject(new Error('Proveedor temporalmente caído')); await Promise.all(checks);
  expect((await searchLibraryVoices(org, {})).voices).toHaveLength(1); expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(2);
});

test('vaciar cachés cancela la lectura antigua y una nueva lectura no recibe ese resultado', async () => {
  const pending = deferred<SharedVoicesPage>(); mockClient.listSharedVoices.mockReturnValueOnce(pending.promise);
  const first = searchLibraryVoices(org, {}), rejected = expect(first).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  await flush(); clearVoiceLibraryCaches(); await rejected;
  expect((await searchLibraryVoices(org, {})).voices[0].name).toBe('Respuesta vigente');
  pending.resolve(page('Retirada')); await flush();
  expect((await searchLibraryVoices(org, {})).voices[0].name).toBe('Respuesta vigente'); expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(2);
});

test('workspace y plan deduplican lecturas mientras el catálogo nativo autoriza cada lector', async () => {
  const [a, b, p, q] = await Promise.all([listVoicesEnriched(db, org), listVoicesEnriched(db, org), getAccountCapabilities(org), getAccountCapabilities(org)]);
  expect(mockRows).toHaveBeenCalledTimes(2); expect(mockClient.listVoices).toHaveBeenCalledTimes(1); expect(mockClient.getSubscription).toHaveBeenCalledTimes(1);
  expect(a).toEqual(b); expect(p).toEqual(q); expect(a[0].preview_url).toBe('https://example.invalid/current.mp3');
});

test('workspace y plan separan organización y nueva huella de credencial', async () => {
  await Promise.all([listVoicesEnriched(db, org), getAccountCapabilities(org)]);
  await Promise.all([listVoicesEnriched(db, org + 1), getAccountCapabilities(org + 1)]);
  mockClient.cacheKey = 'fingerprint-b'; mockClient.listVoices.mockResolvedValue(workspace('https://example.invalid/new.mp3'));
  mockClient.getSubscription.mockResolvedValue({ tier: 'creator', can_use_instant_voice_cloning: true });
  expect((await listVoicesEnriched(db, org))[0].preview_url).toBe('https://example.invalid/new.mp3');
  expect(await getAccountCapabilities(org)).toMatchObject({ tier: 'creator', can_clone: true });
  expect(mockClient.listVoices).toHaveBeenCalledTimes(3); expect(mockClient.getSubscription).toHaveBeenCalledTimes(3);
});

test('fallo o timeout del proveedor conserva el catálogo nativo y no envenena la caché', async () => {
  mockClient.listVoices.mockRejectedValueOnce(new RequestDeadlineError('REQUEST_TIMEOUT'));
  mockClient.getSubscription.mockRejectedValueOnce(new Error('503'));
  expect(await listVoicesEnriched(db, org)).toEqual([{ ...catalogRow, preview_url: null, labels: {}, provider_category: null }]);
  expect(await getAccountCapabilities(org)).toBeNull();
  expect((await listVoicesEnriched(db, org))[0].preview_url).toBeTruthy(); expect(await getAccountCapabilities(org)).toMatchObject({ tier: 'free' });
  expect(mockClient.listVoices).toHaveBeenCalledTimes(2); expect(mockClient.getSubscription).toHaveBeenCalledTimes(2);
});

test('enriquecimiento y plan propagan cancelación sin convertirla en datos de fallback', async () => {
  const voices = deferred<ReturnType<typeof workspace>>(), plan = deferred<typeof subscription>(), controller = new AbortController();
  mockClient.listVoices.mockReturnValue(voices.promise); mockClient.getSubscription.mockReturnValue(plan.promise);
  const a = listVoicesEnriched(db, org, controller.signal), b = getAccountCapabilities(org, controller.signal);
  const checks = [expect(a).rejects.toMatchObject({ code: 'REQUEST_ABORTED' }), expect(b).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })];
  const otherVoices = listVoicesEnriched(db, org), otherPlan = getAccountCapabilities(org); await flush(); controller.abort(); await Promise.all(checks);
  expect((mockClient.listVoices.mock.calls[0][0] as AbortSignal).aborted).toBe(false);
  voices.resolve(workspace('https://example.invalid/other.mp3')); plan.resolve(subscription);
  expect((await otherVoices)[0].preview_url).toBe('https://example.invalid/other.mp3'); expect(await otherPlan).toMatchObject({ tier: 'free' });
});

test('añadir una voz invalida una lectura de workspace pendiente sin permitir caché vieja', async () => {
  const old = deferred<ReturnType<typeof workspace>>(); mockClient.listVoices.mockReturnValueOnce(old.promise);
  const pending = listVoicesEnriched(db, org), rejected = expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  await flush(); await addLibraryVoiceToCatalog(db, org, { voice_id: 'voice-b', public_owner_id: 'owner', name: 'Nueva' }); await rejected;
  old.resolve(workspace('https://example.invalid/stale.mp3')); await flush();
  expect((await listVoicesEnriched(db, org))[0].preview_url).toBe('https://example.invalid/current.mp3'); expect(mockClient.listVoices).toHaveBeenCalledTimes(2);
});

test('un fallo del catálogo nativo no consulta el proveedor ni devuelve un catálogo anterior', async () => {
  mockRows.mockRejectedValueOnce(new Error('Catálogo no disponible'));
  await expect(listVoicesEnriched(db, org)).rejects.toThrow('Catálogo no disponible'); expect(mockGetClient).not.toHaveBeenCalled();
});

test('los dobles sin huella siguen aislados por organización', async () => {
  mockClient.cacheKey = undefined;
  await searchLibraryVoices(org, {}); await searchLibraryVoices(org, {}); await searchLibraryVoices(org + 1, {});
  expect(mockClient.listSharedVoices).toHaveBeenCalledTimes(2);
});

test('preview separa cuenta y modelo; repetir configuración vigente no vuelve a sintetizar', async () => {
  mockRows.mockResolvedValue([{ ...catalogRow, model_id: 'model-a' }]);
  mockClient.listVoices.mockResolvedValue([{ voice_id: 'voice-a', preview_url: null, labels: {}, category: 'cloned' }]);
  const oldAudio = new ArrayBuffer(8), newAccountAudio = new ArrayBuffer(16), newModelAudio = new ArrayBuffer(24);
  mockClient.synthesize.mockResolvedValueOnce(oldAudio).mockResolvedValueOnce(newAccountAudio).mockResolvedValueOnce(newModelAudio);
  expect(await previewCatalogVoice(db, org, catalogRow.id)).toMatchObject({ kind: 'audio', audio: oldAudio });
  expect(await previewCatalogVoice(db, org, catalogRow.id)).toMatchObject({ kind: 'audio', audio: oldAudio });
  expect(mockClient.synthesize).toHaveBeenCalledTimes(1);
  mockClient.cacheKey = 'fingerprint-b';
  expect(await previewCatalogVoice(db, org, catalogRow.id)).toMatchObject({ kind: 'audio', audio: newAccountAudio });
  mockRows.mockResolvedValue([{ ...catalogRow, model_id: 'model-b' }]);
  expect(await previewCatalogVoice(db, org, catalogRow.id)).toMatchObject({ kind: 'audio', audio: newModelAudio });
  expect(await previewCatalogVoice(db, org, catalogRow.id)).toMatchObject({ kind: 'audio', audio: newModelAudio });
  expect(mockClient.synthesize).toHaveBeenCalledTimes(3);
  expect(mockClient.synthesize.mock.calls.map(call => call[2])).toEqual(['model-a', 'model-a', 'model-b']);
  expect(mockClient.listVoices).toHaveBeenCalledTimes(2); expect(mockGetClient).toHaveBeenCalledTimes(5);
});

test('preview valida credenciales vigentes incluso cuando existe audio en caché', async () => {
  mockClient.listVoices.mockResolvedValue([{ voice_id: 'voice-a', preview_url: null, labels: {}, category: 'cloned' }]);
  mockClient.synthesize.mockResolvedValue(new ArrayBuffer(8)); await previewCatalogVoice(db, org, catalogRow.id);
  mockGetClient.mockRejectedValueOnce(new Error('Credencial revocada'));
  await expect(previewCatalogVoice(db, org, catalogRow.id)).rejects.toThrow('Credencial revocada'); expect(mockClient.synthesize).toHaveBeenCalledTimes(1);
});
