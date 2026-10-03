/** @jest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { ErrorApiCrm, pedirCrm } from '@/components/crm/acciones/apiCrm';
import type { CallStats } from '@/lib/services/crm/callManagementService';
import { RequestDeadlineError } from '@/lib/utils/requestDeadline';
import { leerLlamadas, tiempoCargaLlamadas, useCallsData } from '../useCallsData';

jest.mock('@/components/crm/acciones/apiCrm', () => ({
  ...jest.requireActual('@/components/crm/acciones/apiCrm'),
  pedirCrm: jest.fn(),
}));

const pedir = jest.mocked(pedirCrm);
const params = 'limit=25&offset=0';
function respuesta(count = 0) {
  const stats: CallStats = {
    totalToday: count, answered: 0, missed: 0, avgDuration: 0,
    voiceSeconds: 0, remainingVoiceMinutes: null, voiceConfigured: false,
  };
  return { data: [], extra: { count, stats, canViewAll: false } };
}
function diferida<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, no) => { resolve = ok; reject = no; });
  return { promise, resolve, reject };
}
function entorno(mode: 'development' | 'production' | 'test') {
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: mode });
}
async function vaciar() {
  await act(async () => { for (let n = 0; n < 8; n++) await Promise.resolve(); });
}
async function avanzar(ms: number) {
  await act(async () => { await jest.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  // React act usa microtareas para su propia coordinación; el reloj controla
  // únicamente los plazos de red y no cuenta esas microtareas como timers.
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  pedir.mockReset(); entorno('test');
});
afterEach(async () => {
  cleanup(); await vaciar(); jest.restoreAllMocks(); jest.useRealTimers();
});

it.each([['development', 60_000], ['production', 20_000], ['test', 20_000]] as const)(
  'el presupuesto de %s es %i ms', (mode, budget) => {
    entorno(mode); expect(tiempoCargaLlamadas()).toBe(budget);
  },
);

it('una primera carga de 25 segundos en desarrollo funciona sin segunda petición', async () => {
  entorno('development');
  pedir.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(respuesta(2)), 25_000)));
  const { result } = renderHook(() => useCallsData(params, 0));
  await avanzar(20_000);
  expect(result.current).toMatchObject({ loading: true, error: false });
  await avanzar(5_000);
  expect(result.current).toMatchObject({ loading: false, error: false, result: { count: 2 } });
  expect(pedir).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

it('producción termina a los 20 segundos aunque el transporte ignore la cancelación', async () => {
  entorno('production'); pedir.mockImplementation(() => new Promise(() => undefined));
  const { result } = renderHook(() => useCallsData(params, 0));
  await avanzar(19_999); expect(result.current.loading).toBe(true);
  await avanzar(1);
  expect(result.current).toMatchObject({ loading: false, error: true, forbidden: false, errorCode: 'REQUEST_TIMEOUT', result: null });
  expect(pedir.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(pedir).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

it('el plazo sigue vigente después de recibir cabeceras, mientras queda pendiente el cuerpo', async () => {
  const cabeceras = jest.fn(); const cuerpo = diferida<ReturnType<typeof respuesta>>();
  pedir.mockImplementation(async () => { cabeceras(); return await cuerpo.promise; });
  const lectura = leerLlamadas(params);
  const rechazado = expect(lectura).rejects.toMatchObject({ status: 504, codigo: 'REQUEST_TIMEOUT' });
  await vaciar(); expect(cabeceras).toHaveBeenCalledTimes(1);
  await avanzar(20_000); await rechazado;
  expect(pedir.mock.calls[0][1]?.signal?.aborted).toBe(true);
  cuerpo.resolve(respuesta(9)); await vaciar();
  expect(pedir).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

it('un timeout devuelve un error tipado y un mensaje seguro en español', async () => {
  pedir.mockImplementation(() => new Promise(() => undefined));
  const lectura = leerLlamadas(params).catch(error => error);
  await avanzar(20_000); const error = await lectura;
  expect(error).toBeInstanceOf(ErrorApiCrm);
  expect(error).toMatchObject({ status: 504, codigo: 'REQUEST_TIMEOUT' });
  expect(error.message).toMatch(/tiempo|tard|espera/i);
  expect(error.message).not.toMatch(/postgres|supabase|stack|\/api\//i);
});

it('una señal ya cancelada no inicia la operación ni deja temporizadores', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(leerLlamadas(params, controller.signal)).rejects.toBeInstanceOf(RequestDeadlineError);
  await expect(leerLlamadas(params, controller.signal)).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  expect(pedir).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});

it('cancelar una lectura pendiente aborta el transporte sin declararlo timeout', async () => {
  const controller = new AbortController(); pedir.mockImplementation(() => new Promise(() => undefined));
  const lectura = leerLlamadas(params, controller.signal);
  const rechazado = expect(lectura).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  await vaciar(); controller.abort(); await rechazado;
  expect(pedir.mock.calls[0][1]?.signal?.aborted).toBe(true); expect(jest.getTimerCount()).toBe(0);
});

it('desmontar cancela la lectura y no publica un error por la respuesta antigua', async () => {
  const anterior = diferida<ReturnType<typeof respuesta>>(); pedir.mockReturnValue(anterior.promise);
  const { result, unmount } = renderHook(() => useCallsData(params, 0));
  await vaciar(); const signal = pedir.mock.calls[0][1]?.signal;
  unmount(); await vaciar(); expect(signal?.aborted).toBe(true);
  anterior.reject(new ErrorApiCrm(500, 'temporal', 'Fallo anterior')); await vaciar();
  expect(result.current.error).toBe(false); expect(jest.getTimerCount()).toBe(0);
});

it.each([401, 403])('un rechazo %i conserva forbidden y no se reintenta automáticamente', async status => {
  pedir.mockRejectedValue(new ErrorApiCrm(status, 'sin_permiso', 'Acceso denegado'));
  const { result } = renderHook(() => useCallsData(params, 0)); await vaciar();
  expect(result.current).toMatchObject({ loading: false, error: true, forbidden: true, result: null });
  await avanzar(60_000); expect(pedir).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

it('espera enabled antes de consultar la organización y carga al quedar válida', async () => {
  pedir.mockResolvedValue(respuesta(3));
  const { result, rerender } = renderHook(
    ({ enabled, scope }) => useCallsData(params, 0, { enabled, scope }),
    { initialProps: { enabled: false, scope: 0 } },
  );
  await vaciar(); expect(pedir).not.toHaveBeenCalled();
  expect(result.current).toMatchObject({ loading: true, error: false, result: null });
  rerender({ enabled: true, scope: 120 }); await vaciar();
  expect(result.current.result?.count).toBe(3); expect(pedir).toHaveBeenCalledTimes(1);
  expect(pedir.mock.calls[0][0]).toBe(`/api/crm/calls?${params}`);
});

it.each(['params', 'scope'] as const)('cambiar %s descarta la respuesta pendiente del ámbito anterior', async changed => {
  const anterior = diferida<ReturnType<typeof respuesta>>();
  pedir.mockReturnValueOnce(anterior.promise).mockResolvedValue(respuesta(4));
  const { result, rerender } = renderHook(
    ({ query, scope }) => useCallsData(query, 0, { scope }),
    { initialProps: { query: params, scope: 120 } },
  );
  await vaciar(); const signal = pedir.mock.calls[0][1]?.signal;
  rerender({ query: changed === 'params' ? `${params}&q=nueva` : params, scope: changed === 'scope' ? 121 : 120 });
  await vaciar(); expect(signal?.aborted).toBe(true); expect(result.current.result?.count).toBe(4);
  anterior.resolve(respuesta(99)); await vaciar();
  expect(result.current.result?.count).toBe(4); expect(result.current.error).toBe(false);
  expect(pedir).toHaveBeenCalledTimes(2);
});

it.each(['params', 'scope'] as const)('al cambiar %s oculta las filas anteriores desde el primer render, antes de efectos', async changed => {
  const siguiente = diferida<ReturnType<typeof respuesta>>();
  pedir.mockResolvedValueOnce(respuesta(8)).mockReturnValueOnce(siguiente.promise);
  const renders: Array<{ query: string; scope: number; count: number | null; loading: boolean }> = [];
  const { rerender } = renderHook(({ query, scope }) => {
    const state = useCallsData(query, 0, { scope });
    renders.push({ query, scope, count: state.result?.count ?? null, loading: state.loading });
    return state;
  }, { initialProps: { query: params, scope: 120 } });
  const next = { query: changed === 'params' ? `${params}&q=nueva` : params, scope: changed === 'scope' ? 121 : 120 };
  await vaciar(); rerender(next); await vaciar();
  const nuevos = renders.filter(render => render.query === next.query && render.scope === next.scope);
  expect(nuevos[0]).toEqual({ ...next, count: null, loading: true });
  expect(nuevos.every(render => render.count !== 8)).toBe(true);
});

it('la revisión manual reintenta tras un fallo y limpia el detalle anterior', async () => {
  pedir.mockRejectedValueOnce(new ErrorApiCrm(503, 'temporal', 'Intenta otra vez')).mockResolvedValue(respuesta(6));
  const { result, rerender } = renderHook(({ revision }) => useCallsData(params, revision), { initialProps: { revision: 0 } });
  await vaciar(); expect(result.current.error).toBe(true); expect(pedir).toHaveBeenCalledTimes(1);
  rerender({ revision: 1 }); await vaciar();
  expect(result.current).toMatchObject({ loading: false, error: false, errorCode: null, result: { count: 6 } });
  expect(pedir).toHaveBeenCalledTimes(2); expect(jest.getTimerCount()).toBe(0);
});
