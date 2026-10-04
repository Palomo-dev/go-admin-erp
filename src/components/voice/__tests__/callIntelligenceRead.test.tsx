/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCallIntelligence } from '@/components/crm/calls/useCallIntelligence';

let originalFetch: typeof fetch;
const transcript = { id: 'transcript', status: 'completed', segments: [] };
const analysis = { analysis: { id: 'analysis', summary: 'Resumen actual' }, tags: [], objections: [], policy: 'suggest' };
const response = (status: number, data: unknown, error?: string) => ({ ok: status < 400, status, json: async () => ({ data, error }) });
beforeEach(() => { originalFetch = global.fetch; });
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

test('analysis403 no se borra por transcript200 y el reintento relee los mismos dos endpoints', async () => {
  global.fetch = jest.fn(async (url: string) => url.endsWith('/transcript') ? response(200, transcript) : response(403, null, 'sin_permiso')) as unknown as typeof fetch;
  const { result } = renderHook(() => useCallIntelligence('call'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.transcript).toEqual(transcript); expect(result.current.analysis).toBeNull();
  expect(result.current.error).toBe('sin_permiso'); expect(result.current.analysisError).toBe('sin_permiso'); expect(result.current.transcriptError).toBeNull();
  (global.fetch as jest.Mock).mockImplementation(async (url: string) => response(200, url.endsWith('/transcript') ? transcript : analysis));
  await act(async () => result.current.refetch());
  expect(result.current.analysis).toEqual(analysis); expect(result.current.error).toBeNull();
  expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual(['/api/crm/calls/call/transcript', '/api/crm/calls/call/analysis', '/api/crm/calls/call/transcript', '/api/crm/calls/call/analysis']);
});

test('404 conserva ausencia y el job nativo; no lo convierte en fallo ni resultado ficticio', async () => {
  global.fetch = jest.fn(async (url: string) => response(404, url.endsWith('/analysis') ? { job: { id: 'job', status: 'failed' } } : null)) as unknown as typeof fetch;
  const { result } = renderHook(() => useCallIntelligence('call'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull(); expect(result.current.transcript).toBeNull();
  expect(result.current.analysis?.analysis).toBeNull(); expect(result.current.analysis?.job?.status).toBe('failed');
});

test('una relectura fallida limpia sólo el resultado que ya no puede consultar', async () => {
  global.fetch = jest.fn(async (url: string) => response(200, url.endsWith('/transcript') ? transcript : analysis)) as unknown as typeof fetch;
  const { result } = renderHook(() => useCallIntelligence('call'));
  await waitFor(() => expect(result.current.analysis?.analysis?.id).toBe('analysis'));
  (global.fetch as jest.Mock).mockImplementation(async (url: string) => url.endsWith('/transcript') ? response(403, null, 'sin_permiso') : response(200, analysis));
  await act(async () => result.current.refetch());
  expect(result.current.transcript).toBeNull(); expect(result.current.analysis).toEqual(analysis); expect(result.current.transcriptError).toBe('sin_permiso'); expect(result.current.analysisError).toBeNull();
});

test('la respuesta tardía de otra llamada no publica transcripción ni análisis antiguos', async () => {
  const deferred: Array<(value: unknown) => void> = [];
  global.fetch = jest.fn((url: string) => url.includes('/old/') ? new Promise((resolve) => deferred.push(resolve)) : Promise.resolve(response(200, url.endsWith('/transcript') ? { ...transcript, id: 'new' } : { ...analysis, analysis: { id: 'new', summary: 'Nuevo' } }))) as unknown as typeof fetch;
  const { result, rerender } = renderHook(({ id }) => useCallIntelligence(id), { initialProps: { id: 'old' } });
  rerender({ id: 'new' }); await waitFor(() => expect(result.current.analysis?.analysis?.id).toBe('new'));
  await act(async () => deferred.forEach((resolve, index) => resolve(response(200, index === 0 ? transcript : analysis))));
  expect(result.current.transcript?.id).toBe('new'); expect(result.current.analysis?.analysis?.id).toBe('new');
});

test('cambio de organización cancela las lecturas previas y no deja acciones del análisis anterior', async () => {
  global.fetch = jest.fn(async (url: string) => response(200, url.endsWith('/transcript') ? transcript : analysis)) as unknown as typeof fetch;
  const { result } = renderHook(() => useCallIntelligence('call'));
  await waitFor(() => expect(result.current.analysis?.analysis?.id).toBe('analysis'));
  const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal;
  (global.fetch as jest.Mock).mockImplementation(async () => response(403, null, 'sin_permiso'));
  await act(async () => window.dispatchEvent(new Event('organization-changed')));
  await waitFor(() => expect(result.current.error).toBe('sin_permiso'));
  expect(signal.aborted).toBe(true); expect(result.current.transcript).toBeNull(); expect(result.current.analysis).toBeNull();
});

test('lector desactivado no hace solicitudes', () => {
  global.fetch = jest.fn() as unknown as typeof fetch;
  renderHook(() => useCallIntelligence('call', false)); expect(global.fetch).not.toHaveBeenCalled();
});

test.each([{ jobs: [] }, { jobs: [{ kind: 'transcribe', status: 'completed' }] }, { jobs: [{ kind: 'analyze', status: 'queued' }] }])('404 con recording y jobs %j conserva ausencia sin polling de transcripción', async ({ jobs }) => {
  jest.useFakeTimers();
  global.fetch = jest.fn(async (url: string) => response(404, url.endsWith('/transcript') ? { jobs, recording: { id: 'recording', status: 'ready' } } : null)) as unknown as typeof fetch;
  const { result } = renderHook(() => useCallIntelligence('call'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.transcript).toBeNull(); expect(result.current.transcriptError).toBeNull();
  await act(async () => jest.advanceTimersByTime(15000));
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test.each(['queued', 'running'])('404 usa exclusivamente job transcribe %s para pending y polling', async (status) => {
  jest.useFakeTimers();
  global.fetch = jest.fn(async (url: string) => response(404, url.endsWith('/transcript') ? { jobs: [{ id: 'job', kind: 'transcribe', status, attempts: 0, last_error: null }], recording: { id: 'recording', status: 'ready' } } : null)) as unknown as typeof fetch;
  const { result } = renderHook(() => useCallIntelligence('call'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.transcript?.status).toBe('pending');
  await act(async () => jest.advanceTimersByTime(5000));
  expect(global.fetch).toHaveBeenCalledTimes(4);
});

test('404 con último job transcribe failed conserva fallo y deja de hacer polling', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn(async (url: string) => response(404, url.endsWith('/transcript') ? { jobs: [{ id: 'job', kind: 'transcribe', status: 'failed', last_error: 'PROVIDER_ERROR: timeout' }], recording: { status: 'ready' } } : null)) as unknown as typeof fetch;
  const { result } = renderHook(() => useCallIntelligence('call'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.transcript?.status).toBe('failed'); expect(result.current.transcript?.error_code).toBe('PROVIDER_ERROR');
  await act(async () => jest.advanceTimersByTime(15000));
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
