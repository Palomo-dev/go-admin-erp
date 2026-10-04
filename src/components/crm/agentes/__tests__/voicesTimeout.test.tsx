/** @jest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { useVoiceLibrary } from '../voces/useVoiceLibrary';
import { useVoiceCatalog } from '../useVoiceCatalog';
import { DEFAULT_FETCH_TIMEOUT_MS } from '@/lib/utils/fetchJson';

jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
const originalFetch = global.fetch;
beforeEach(() => { jest.useFakeTimers(); global.fetch = jest.fn(() => new Promise<Response>(() => undefined)); });
afterEach(() => { cleanup(); global.fetch = originalFetch; jest.restoreAllMocks(); jest.useRealTimers(); });

it('la biblioteca sale del spinner con el timeout20s real aunque fetch no coopere con abort', async () => {
  const { result } = renderHook(() => useVoiceLibrary());
  await act(async () => jest.advanceTimersByTime(DEFAULT_FETCH_TIMEOUT_MS - 1));
  expect(result.current.loading).toBe(true); expect(result.current.error).toBeNull();
  await act(async () => jest.advanceTimersByTime(1));
  expect(result.current.loading).toBe(false); expect(result.current.error).toMatch(/superó los 20 s/);
  act(() => jest.runAllTicks());
  expect(jest.getTimerCount()).toBe(0);
});

it('catálogo y providers tienen límite independiente; el registry sólo declara fallo después del timeout', async () => {
  const { result } = renderHook(() => useVoiceCatalog());
  await act(async () => { await Promise.resolve(); });
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(result.current.ttsLoading).toBe(true); expect(result.current.error).toBeNull();
  await act(async () => jest.advanceTimersByTime(DEFAULT_FETCH_TIMEOUT_MS));
  expect(result.current.loading).toBe(false); expect(result.current.error).toMatch(/superó los 20 s/);
  expect(result.current.ttsLoading).toBe(false); expect(result.current.tts.unknown).toBe(true);
  act(() => jest.runAllTicks());
  expect(jest.getTimerCount()).toBe(0);
});

it('una entrada de desarrollo que tarda 25 s carga biblioteca, catálogo y proveedores sin reintentar', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'development' });
  global.fetch = jest.fn(input => new Promise<Response>(resolve => setTimeout(() => {
    const url = String(input);
    const data = url.includes('/library?') ? { success: true, data: { voices: [], total_count: 0, has_more: false } }
      : url.includes('/config/providers') ? { success: true, items: [{ category: 'tts', provider: 'elevenlabs', configured: true, is_active: true }] }
      : { success: true, data: [] };
    resolve({ ok: true, status: 200, text: async () => JSON.stringify(data) } as Response);
  }, 25_000)));
  const library = renderHook(() => useVoiceLibrary());
  const catalog = renderHook(() => useVoiceCatalog());
  await act(async () => jest.advanceTimersByTimeAsync(20_000));
  expect(library.result.current.loading).toBe(true);
  expect(library.result.current.error).toBeNull();
  expect(catalog.result.current.ttsLoading).toBe(true);
  await act(async () => jest.advanceTimersByTimeAsync(5_000));
  expect(library.result.current.loading).toBe(false);
  expect(library.result.current.error).toBeNull();
  expect(catalog.result.current.error).toBeNull();
  expect(catalog.result.current.loading).toBe(false);
  expect(catalog.result.current.tts.ready).toBe(true);
  expect(global.fetch).toHaveBeenCalledTimes(3);
  expect(jest.getTimerCount()).toBe(0);
});

it('el margen de desarrollo sigue limitado si biblioteca no responde y permite reintento manual', async () => {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'development' });
  const { result } = renderHook(() => useVoiceLibrary());
  await act(async () => jest.advanceTimersByTimeAsync(59_999));
  expect(result.current.loading).toBe(true);
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toMatch(/superó los 60 s/);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  await act(async () => { result.current.retry(); });
  expect(result.current.error).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
