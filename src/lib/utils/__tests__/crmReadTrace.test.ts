import { webcrypto } from 'node:crypto';
import { createCrmReadTrace, isCrmReadTraceRoute } from '../crmReadTrace';

const id = '30000000-0000-4000-8000-000000000001';
const route = '/api/crm/voices/library';
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
let info: jest.SpyInstance;
beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
  info.mockRestore(); jest.restoreAllMocks();
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
});

test.each(['/api/crm/voices/library', '/api/crm/voices', '/api/crm/config/providers', '/api/crm/voice-agents'])(
  'la lectura %s permite traza con UUID de correlación', path => {
    const trace = createCrmReadTrace(path, id.toUpperCase());
    trace.step('handler-start'); trace.finish(200);
    expect(trace.id).toBe(id);
    expect(info.mock.calls).toEqual([
      ['[crm/read]', { requestId: id, route: path, stage: 'handler-start', atMs: expect.any(Number), elapsedMs: expect.any(Number) }],
      ['[crm/read]', { requestId: id, route: path, stage: 'finish', atMs: expect.any(Number), elapsedMs: expect.any(Number), status: 200 }],
    ]);
  },
);

test.each(['/api/crm/agents', '/api/crm/voices/library?search=private', '/api/other', 'https://secret.invalid/api/crm/voices/library'])(
  'una ruta no autorizada nunca se imprime: %s', path => {
    expect(isCrmReadTraceRoute(path)).toBe(false);
    const trace = createCrmReadTrace(path, id);
    trace.step('handler-start'); trace.finish(500, 'INTERNAL_ERROR');
    expect(info).not.toHaveBeenCalled();
  },
);

test.each(['token-private-value', `${id}\nforged`, '00000000-0000-0000-0000-000000000000', undefined])(
  'un id no válido se reemplaza sin imprimirlo: %s', unsafeId => {
    const trace = createCrmReadTrace(route, unsafeId);
    expect(trace.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    trace.finish(504, 'REQUEST_TIMEOUT');
    expect(info).toHaveBeenCalledWith('[crm/read]', expect.objectContaining({ requestId: trace.id, code: 'REQUEST_TIMEOUT' }));
  },
);

test('fallback sin randomUUID usa getRandomValues y genera UUID RFC v4', () => {
  const getRandomValues = jest.fn((bytes: Uint8Array) => { bytes.fill(0xff); return bytes; });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues } });
  expect(createCrmReadTrace(route).id).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  expect(getRandomValues).toHaveBeenCalledTimes(1);
});

test('etapas y códigos externos no filtran búsquedas, identidad o credenciales', () => {
  const secret = 'org=120&user=private@example.test&key=opaque-secret';
  const trace = createCrmReadTrace(route, secret);
  trace.step(secret); trace.step('context-start'); trace.finish(502, secret);
  expect(info).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(info.mock.calls)).not.toContain(secret);
  expect(info.mock.calls[1][1]).toEqual({ requestId: trace.id, route, stage: 'finish', atMs: expect.any(Number), elapsedMs: expect.any(Number), status: 502, code: 'INTERNAL_ERROR' });
  expect(Object.keys(info.mock.calls[1][1]).sort()).toEqual(['atMs', 'code', 'elapsedMs', 'requestId', 'route', 'stage', 'status']);
});

test('finish es terminal e idempotente incluso ante operación que responde tarde', () => {
  const trace = createCrmReadTrace(route, id);
  trace.step('context-start'); trace.finish(504, 'REQUEST_TIMEOUT');
  trace.step('context-end'); trace.step('library-start'); trace.finish(200);
  expect(info).toHaveBeenCalledTimes(2);
  expect(info.mock.calls[1][1]).toMatchObject({ stage: 'finish', status: 504, code: 'REQUEST_TIMEOUT' });
});

test('duración se mide desde la creación y nunca produce números negativos', () => {
  const now = jest.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_052).mockReturnValueOnce(990);
  const trace = createCrmReadTrace(route, id); trace.step('handler-start'); trace.finish(200);
  expect(info.mock.calls[0][1].elapsedMs).toBe(52);
  expect(info.mock.calls[0][1].atMs).toBe(1_052);
  expect(info.mock.calls[1][1].elapsedMs).toBe(0);
  expect(info.mock.calls[1][1].atMs).toBe(990);
  now.mockRestore();
});

test.each([NaN, Infinity, -1])('fecha de reloj inválida %s se normaliza y nunca imprime NaN/Infinity', atMs => {
  jest.spyOn(Date, 'now').mockReturnValue(atMs);
  createCrmReadTrace(route, id).finish(200);
  expect(info.mock.calls[0][1]).toMatchObject({ atMs: 0, elapsedMs: 0 });
});

test.each([NaN, Infinity, 200.5, 600, -1])('estado inválido %s se normaliza sin payload externo', status => {
  createCrmReadTrace(route, id).finish(status);
  expect(info.mock.calls[0][1].status).toBe(500);
});
