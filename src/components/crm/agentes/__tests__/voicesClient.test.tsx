/** @jest-environment jsdom */
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { fetchJson } from '@/lib/utils/fetchJson';
import { useVoiceCatalog } from '../useVoiceCatalog';
import { useVoiceLibrary } from '../voces/useVoiceLibrary';
import { VoicesPanel } from '../VoicesPanel';
import type { VoiceCatalogState } from '../useVoiceCatalog';
import type { LibraryVoice } from '@/lib/services/crm/voiceLibrary';

let mockScope = 120;
jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => mockScope, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
jest.mock('@/lib/utils/fetchJson', () => ({ fetchJson: jest.fn() }));
jest.mock('../voces/VoiceLibraryGrid', () => ({ VoiceLibraryGrid: ({ onAdded }: { onAdded: () => void }) => <button onClick={onAdded}>Añadir fixture</button> }));
jest.mock('../voces/MyVoicesPanel', () => ({ MyVoicesPanel: () => null }));
jest.mock('../voces/CloneVoiceWizard', () => ({ CloneVoiceWizard: () => null }));
jest.mock('../voces/VoiceLibraryFilters', () => ({ VoiceLibraryFilters: () => null }));
jest.mock('../voces/useAudioPreview', () => ({ useAudioPreview: () => ({ status: 'idle', error: null, statusFor: () => 'idle' }) }));
jest.mock('@/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('@/components/shared/motion', () => ({ FadeIn: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../voces/VoiceCard', () => ({ VoiceCard: ({ voice, onAdd, added }: { voice: LibraryVoice; onAdd: (voice: LibraryVoice) => void; added: boolean }) => <button onClick={() => onAdd(voice)}>{added ? 'Añadida' : voice.name}</button> }));
jest.mock('../voces/MyVoiceCard', () => ({ myVoiceCardId: (id: string) => `fixture-${id}`, MyVoiceCard: ({ voice, onMakeDefault, onDelete }: { voice: { id: string }; onMakeDefault: (voice: unknown) => void; onDelete: (voice: unknown) => void }) => <><button onClick={() => onMakeDefault(voice)}>Predeterminada fixture</button><button onClick={() => onDelete(voice)}>Eliminar fixture</button></> }));
jest.mock('../VoiceAddForms', () => ({ VoiceAddForms: ({ onChanged }: { onChanged: () => void }) => <button onClick={onChanged}>Importar fixture</button> }));
const { MyVoicesPanel } = jest.requireActual<typeof import('../voces/MyVoicesPanel')>('../voces/MyVoicesPanel');
const { VoiceLibraryGrid } = jest.requireActual<typeof import('../voces/VoiceLibraryGrid')>('../voces/VoiceLibraryGrid');
const read = fetchJson as jest.Mock;
const voice = (name: string) => ({ voice_id: name, name, public_owner_id: 'fixture', preview_url: null }) as LibraryVoice;
const library = (name: string, more = false) => ({ success: true, data: { voices: [voice(name)], has_more: more, total_count: 2, page: 0 } });
const catalog = (id: string) => ({ success: true, data: [{ id, provider: 'elevenlabs', provider_voice_id: id, is_active: true, is_default: true }], account: { tier: 'fixture', free_tier: true, can_clone: false } });
const providers = { success: true, items: [{ provider: 'elevenlabs', configured: true }] };
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: Error) => void; const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
const changeOrganization = () => window.dispatchEvent(new Event('organization-changed'));
beforeEach(() => { mockScope = 120; read.mockReset(); });
afterEach(() => { cleanup(); jest.useRealTimers(); });

it('catálogo y registry empiezan en paralelo; pendiente nunca se declara fallo', async () => {
  const own = deferred<ReturnType<typeof catalog>>(), credential = deferred<typeof providers>();
  read.mockImplementation((url: string) => url.includes('/config/') ? credential.promise : own.promise);
  const { result } = renderHook(() => useVoiceCatalog());
  expect(read.mock.calls.map(call => call[0])).toEqual(['/api/crm/voices', '/api/crm/config/providers?category=tts']);
  expect(result.current.ttsLoading).toBe(true);
  expect(result.current.loading).toBe(true);
  await act(async () => credential.resolve(providers));
  expect(result.current.tts.ready).toBe(true); expect(result.current.ttsLoading).toBe(false); expect(result.current.loading).toBe(true);
  await act(async () => own.resolve(catalog('own')));
  expect(result.current.voices[0].id).toBe('own'); expect(result.current.loading).toBe(false);
  for (const [, options] of read.mock.calls) expect(options).toMatchObject({ cache: 'no-store', credentials: 'include', signal: expect.any(AbortSignal) });
});

it('dos recargas simultáneas comparten las lecturas pendientes sin ampliar timeout', async () => {
  const pending = deferred<unknown>(); read.mockReturnValue(pending.promise);
  const { result, unmount } = renderHook(() => useVoiceCatalog());
  let first!: Promise<void>, second!: Promise<void>;
  act(() => { first = result.current.reload(); second = result.current.reload(); });
  expect(first).toBe(second); expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls.every(([, options]) => options.timeoutMs === undefined)).toBe(true);
  unmount(); expect(read.mock.calls[0][1].signal.aborted).toBe(true);
});

it('el banner espera el fallo real del registry y su reintento recupera la comprobación', async () => {
  const credential = deferred<typeof providers>();
  read.mockImplementation((url: string) => url.includes('/config/') ? credential.promise : Promise.resolve(catalog('own')));
  render(<VoicesPanel />);
  expect(screen.queryByText(/falló la lectura de Proveedores/)).toBeNull();
  await act(async () => credential.reject(new Error('503 fixture')));
  expect(screen.getByText(/falló la lectura de Proveedores/)).toBeTruthy();
  read.mockImplementation((url: string) => Promise.resolve(url.includes('/config/') ? providers : catalog('own')));
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar comprobación' }));
  await waitFor(() => expect(screen.queryByText(/falló la lectura de Proveedores/)).toBeNull());
});

it('un fallo del catálogo no impide resolver el registry ni conserva un plan anterior', async () => {
  read.mockImplementation((url: string) => url.includes('/config/') ? Promise.resolve(providers) : Promise.reject(new Error('catálogo fixture no disponible')));
  const { result } = renderHook(() => useVoiceCatalog());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toMatch(/no disponible/); expect(result.current.account).toBeNull(); expect(result.current.tts.ready).toBe(true);
});

it('el cambio de organización aborta catálogo/registry e ignora respuestas viejas no cooperativas', async () => {
  const previous = [deferred<unknown>(), deferred<unknown>()];
  read.mockImplementationOnce(() => previous[0].promise).mockImplementationOnce(() => previous[1].promise)
    .mockImplementation((url: string) => Promise.resolve(url.includes('/config/') ? providers : catalog('new-org')));
  const { result } = renderHook(() => useVoiceCatalog());
  const firstSignal = read.mock.calls[0][1].signal as AbortSignal;
  act(() => { mockScope = 222; changeOrganization(); });
  expect(firstSignal.aborted).toBe(true); expect(result.current.voices).toEqual([]); expect(result.current.account).toBeNull();
  await waitFor(() => expect(result.current.voices[0]?.id).toBe('new-org'));
  await act(async () => { previous[0].resolve(catalog('old-org')); previous[1].resolve({ success: true, items: [] }); });
  expect(result.current.voices[0].id).toBe('new-org'); expect(result.current.tts.ready).toBe(true);
});

it('una respuesta vieja no pisa los filtros nuevos aunque el transporte ignore abort', async () => {
  jest.useFakeTimers(); const previous = deferred<unknown>();
  read.mockImplementationOnce(() => previous.promise).mockResolvedValue(library('en'));
  const { result } = renderHook(() => useVoiceLibrary()); const signal = read.mock.calls[0][1].signal as AbortSignal;
  act(() => result.current.setFilter('language', 'en'));
  await act(async () => jest.advanceTimersByTime(0));
  expect(signal.aborted).toBe(true); expect(result.current.voices[0].name).toBe('en');
  await act(async () => previous.resolve(library('old-es')));
  expect(result.current.filters.language).toBe('en'); expect(result.current.voices[0].name).toBe('en');
});

it('repetir un filtro con el mismo valor no cancela ni duplica la consulta', async () => {
  jest.useFakeTimers(); read.mockResolvedValue(library('es'));
  const { result } = renderHook(() => useVoiceLibrary());
  await act(async () => jest.advanceTimersByTime(0));
  act(() => { result.current.setFilter('search', 'consulta'); result.current.setFilter('search', 'consulta'); });
  await act(async () => jest.advanceTimersByTime(300)); expect(read).toHaveBeenCalledTimes(2);
  act(() => result.current.setFilter('search', 'consulta'));
  await act(async () => jest.advanceTimersByTime(600)); expect(read).toHaveBeenCalledTimes(2);
});

it('cargar más dos veces en el mismo turno emite una sola consulta', async () => {
  const more = deferred<unknown>(); read.mockResolvedValueOnce(library('first', true)).mockImplementation(() => more.promise);
  const { result } = renderHook(() => useVoiceLibrary());
  await waitFor(() => expect(result.current.loading).toBe(false));
  act(() => { result.current.loadMore(); result.current.loadMore(); });
  expect(read).toHaveBeenCalledTimes(2); expect(read.mock.calls[1][0]).toContain('page=1');
  await act(async () => more.resolve({ success: true, data: { voices: [voice('first'), voice('next'), voice('next')], has_more: false, total_count: 2 } }));
  expect(result.current.voices.map(v => v.name)).toEqual(['first', 'next']);
});

it('la biblioteca reinicia el ámbito y descarta datos viejos al cambiar de organización', async () => {
  const previous = deferred<unknown>(); read.mockImplementationOnce(() => previous.promise).mockResolvedValue(library('new'));
  const { result, unmount } = renderHook(() => useVoiceLibrary()); const signal = read.mock.calls[0][1].signal as AbortSignal;
  act(() => { mockScope = 222; changeOrganization(); }); expect(signal.aborted).toBe(true);
  await waitFor(() => expect(result.current.voices[0]?.name).toBe('new'));
  await act(async () => previous.resolve(library('old'))); expect(result.current.voices[0].name).toBe('new');
  const current = read.mock.calls[1][1].signal as AbortSignal; unmount(); expect(current.aborted).toBe(true);
});

it('el scroll se detiene tras fallar la página siguiente y el retry explícito funciona', async () => {
  const observers: Array<{ callback: IntersectionObserverCallback; disconnected: boolean }> = [];
  const original = global.IntersectionObserver;
  global.IntersectionObserver = class {
    item: { callback: IntersectionObserverCallback; disconnected: boolean };
    constructor(callback: IntersectionObserverCallback) { this.item = { callback, disconnected: false }; observers.push(this.item); }
    observe() {} disconnect() { this.item.disconnected = true; } unobserve() {} takeRecords() { return []; }
  } as unknown as typeof IntersectionObserver;
  const more = deferred<unknown>(); read.mockResolvedValueOnce(library('first', true)).mockImplementationOnce(() => more.promise).mockResolvedValue(library('recovered'));
  try {
    render(<VoiceLibraryGrid ownedVoiceIds={new Set()} onAdded={jest.fn()} account={null} />);
    await screen.findByText('first');
    const enter = (item: typeof observers[number]) => item.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    act(() => enter(observers[observers.length - 1]));
    await act(async () => more.reject(new Error('página fixture fallida')));
    expect(screen.getByText(/página fixture fallida/)).toBeTruthy();
    const count = read.mock.calls.length;
    act(() => { for (const item of observers) enter(item); });
    expect(read).toHaveBeenCalledTimes(count); expect(observers.every(item => item.disconnected)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findByText('recovered'); expect(read).toHaveBeenCalledTimes(count + 1);
  } finally { global.IntersectionObserver = original; }
});

it('añadir dos veces una voz comparte la escritura y una respuesta vieja no marca el nuevo ámbito', async () => {
  const addition = deferred<unknown>(); const onAdded = jest.fn();
  read.mockImplementation((url: string, options?: RequestInit) => options?.method === 'POST' ? addition.promise : Promise.resolve(library('add')));
  render(<VoiceLibraryGrid ownedVoiceIds={new Set()} onAdded={onAdded} account={null} />);
  const button = await screen.findByRole('button', { name: 'add' });
  fireEvent.click(button); fireEvent.click(button);
  const writes = read.mock.calls.filter(([, options]) => options?.method === 'POST'); expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).not.toHaveProperty('organization_id');
  act(() => { mockScope = 222; changeOrganization(); }); expect(writes[0][1].signal.aborted).toBe(true);
  await act(async () => addition.resolve({ success: true, data: { already_in_catalog: false } }));
  expect(onAdded).not.toHaveBeenCalled(); expect(screen.queryByText('Añadida')).toBeNull();
});


it('una recarga forzada después de escribir aborta la lectura previa y obtiene el catálogo nuevo', async () => {
  const previous = [deferred<unknown>(), deferred<unknown>()];
  read.mockImplementationOnce(() => previous[0].promise).mockImplementationOnce(() => previous[1].promise)
    .mockImplementation((url: string) => Promise.resolve(url.includes('/config/') ? providers : catalog('after-write')));
  const { result } = renderHook(() => useVoiceCatalog()); const signal = read.mock.calls[0][1].signal as AbortSignal;
  await act(async () => { await result.current.reload({ force: true }); });
  expect(read).toHaveBeenCalledTimes(4); expect(signal.aborted).toBe(true);
  expect(result.current.voices[0].id).toBe('after-write');
  await act(async () => { previous[0].resolve(catalog('before-write')); previous[1].resolve({ success: true, items: [] }); });
  expect(result.current.voices[0].id).toBe('after-write'); expect(result.current.tts.ready).toBe(true);
});

it('el callback de añadir en Voces exige lectura nueva aunque el catálogo inicial siga pendiente', async () => {
  const previous = [deferred<unknown>(), deferred<unknown>()];
  read.mockImplementationOnce(() => previous[0].promise).mockImplementationOnce(() => previous[1].promise)
    .mockImplementation((url: string) => Promise.resolve(url.includes('/config/') ? providers : catalog('added')));
  render(<VoicesPanel />); const signal = read.mock.calls[0][1].signal as AbortSignal;
  fireEvent.click(screen.getByRole('button', { name: 'Añadir fixture' }));
  await waitFor(() => expect(read).toHaveBeenCalledTimes(4)); expect(signal.aborted).toBe(true);
});


it('por defecto, borrado e importación en Mis voces fuerzan recarga; los retries siguen normales', async () => {
  read.mockImplementation((url: string) => Promise.resolve(url === '/api/crm/voice-agents' ? { success: true, data: [] } : { success: true, data: { removed_from_provider: false } }));
  const reload = jest.fn(async () => undefined);
  const row = { ...catalog('own').data[0], name: 'Voz fixture', description: null, kind: 'library', language: 'es', model_id: 'fixture', consent_recorded_at: null };
  const state = { voices: [row], defaultVoice: row, loading: false, refreshing: false, error: null, tts: { ready: true, unknown: false, ownProviders: ['elevenlabs'], platformProviders: [] }, ttsLoading: false, account: null, reload } as VoiceCatalogState;
  const view = render(<MyVoicesPanel catalog={state} onGoToLibrary={jest.fn()} onGoToClone={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Predeterminada fixture' }));
  await waitFor(() => expect(reload).toHaveBeenCalledWith({ force: true })); reload.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar fixture' }));
  fireEvent.click(screen.getByRole('button', { name: 'Borrar voz' }));
  await waitFor(() => expect(reload).toHaveBeenCalledWith({ force: true })); reload.mockClear();
  fireEvent.click(screen.getByRole('button', { name: /Más opciones/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Importar fixture' }));
  expect(reload).toHaveBeenCalledWith({ force: true }); reload.mockClear();
  view.rerender(<MyVoicesPanel catalog={{ ...state, error: 'fixture read failed' }} onGoToLibrary={jest.fn()} onGoToClone={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
  expect(reload).toHaveBeenCalledWith();
});


it.each(['catalog', 'providers'] as const)('retry manual renueva ambas lecturas cuando falla %s y la otra sigue pendiente', async failedBranch => {
  const previous = deferred<unknown>();
  read.mockImplementationOnce(() => failedBranch === 'catalog' ? Promise.reject(new Error('fixture catalog failed')) : previous.promise)
    .mockImplementationOnce(() => failedBranch === 'providers' ? Promise.reject(new Error('fixture providers failed')) : previous.promise)
    .mockImplementation((url: string) => Promise.resolve(url.includes('/config/') ? providers : catalog('retry-fresh')));
  const { result } = renderHook(() => useVoiceCatalog()); const signal = read.mock.calls[0][1].signal as AbortSignal;
  await waitFor(() => failedBranch === 'catalog' ? expect(result.current.error).toMatch(/fixture catalog failed/) : expect(result.current.ttsLoading).toBe(false));
  expect(read).toHaveBeenCalledTimes(2);
  await act(async () => { await result.current.reload(); });
  expect(signal.aborted).toBe(true); expect(read).toHaveBeenCalledTimes(4);
  expect(result.current.error).toBeNull(); expect(result.current.voices[0].id).toBe('retry-fresh'); expect(result.current.tts.ready).toBe(true);
  await act(async () => previous.resolve(failedBranch === 'catalog' ? { success: true, items: [] } : catalog('retry-old')));
  expect(result.current.voices[0].id).toBe('retry-fresh'); expect(result.current.tts.ready).toBe(true);
});
