import { fetchJson } from '../fetchJson';
import { RequestDeadlineError, withRequestDeadline } from '../requestDeadline';

const originalFetch = global.fetch;
beforeEach(() => jest.useFakeTimers());
afterEach(() => { global.fetch = originalFetch; jest.useRealTimers(); });

test('corta una operación pendiente y aborta su transporte', async () => {
  let signal!: AbortSignal;
  const pending = withRequestDeadline((s) => { signal = s; return new Promise(() => {}); }, { timeoutMs: 100 });
  const check = expect(pending).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT', status: 504 });
  await jest.advanceTimersByTimeAsync(100);
  await check;
  expect(signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('una petición ya cancelada no inicia la operación', async () => {
  const controller = new AbortController(); controller.abort();
  const operation = jest.fn();
  await expect(withRequestDeadline(operation, { timeoutMs: 100, signal: controller.signal }))
    .rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  expect(operation).not.toHaveBeenCalled();
});

test('fetchJson mantiene el límite durante la lectura del cuerpo', async () => {
  let signal!: AbortSignal;
  global.fetch = jest.fn(async (_url, init) => {
    signal = init!.signal!;
    return { ok: true, text: () => new Promise(() => {}) } as Response;
  });
  const pending = fetchJson('/fixture', { timeoutMs: 1000 });
  const check = expect(pending).rejects.toThrow('superó los 1 s');
  await jest.advanceTimersByTimeAsync(1000); await check;
  expect(signal.aborted).toBe(true);
});

test('cancelar después de headers cancela el cuerpo y no afirma timeout', async () => {
  const controller = new AbortController();
  let signal!: AbortSignal;
  global.fetch = jest.fn(async (_url, init) => {
    signal = init!.signal!;
    return { ok: true, text: () => new Promise(() => {}) } as Response;
  });
  const pending = fetchJson('/fixture', { signal: controller.signal });
  const check = expect(pending).rejects.toBeInstanceOf(RequestDeadlineError);
  await jest.advanceTimersByTimeAsync(0);
  controller.abort(); await check;
  expect(signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('conserva JSON correcto y el mensaje HTTP del servidor', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(new Response('{"data":1}'))
    .mockResolvedValueOnce(new Response('{"error":"Clave no configurada"}', { status: 503 }));
  await expect(fetchJson('/fixture')).resolves.toEqual({ data: 1 });
  await expect(fetchJson('/fixture')).rejects.toThrow('Clave no configurada');
  expect(jest.getTimerCount()).toBe(0);
});
