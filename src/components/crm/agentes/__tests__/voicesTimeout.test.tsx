/** @jest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { useVoiceLibrary } from '../voces/useVoiceLibrary';
import { useVoiceCatalog } from '../useVoiceCatalog';
import { DEFAULT_FETCH_TIMEOUT_MS } from '@/lib/utils/fetchJson';

jest.mock('@/lib/hooks/useOrganization', () => ({ getOrganizationId: () => 120, ORGANIZATION_CHANGED_EVENT: 'organization-changed' }));
const originalFetch = global.fetch;
beforeEach(() => { jest.useFakeTimers(); global.fetch = jest.fn(() => new Promise<Response>(() => undefined)); });
afterEach(() => { cleanup(); global.fetch = originalFetch; jest.useRealTimers(); });

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
