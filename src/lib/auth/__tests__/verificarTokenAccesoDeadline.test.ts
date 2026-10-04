import { SignJWT } from 'jose';
import {
  _reiniciarVerificadorParaTests,
  TIMEOUT_VERIFICACION_RED_MS,
  verificarTokenAcceso,
} from '../verificarTokenAcceso';

const SUB = '11111111-2222-3333-4444-555555555555';
const SECRET = 'secreto-sintetico-solo-para-pruebas-del-plazo-de-auth';
const originalFetch = global.fetch;
const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
let huellas: Promise<ArrayBuffer>[];

function diferida<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(ok => { resolve = ok; });
  return { promise, resolve };
}
function respuesta(userId = SUB, status = 200) {
  return new Response(JSON.stringify({ id: userId }), { status });
}
function conCuerpoPendiente() {
  const body = diferida<{ id: string }>();
  const response = respuesta();
  jest.spyOn(response, 'json').mockReturnValue(body.promise);
  return { response, body };
}
async function token(opts: { exp?: number; role?: string } = {}) {
  return new SignJWT({ role: opts.role ?? 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(SUB)
    .setExpirationTime(opts.exp ?? Math.floor(Date.now() / 1000) + 3600)
    .sign(new TextEncoder().encode(SECRET));
}
async function vaciar() {
  // WebCrypto calcula la huella fuera del reloj simulado. Esperar sus promesas
  // reales evita que la carga del proceso adelante el fixture al consumidor.
  await Promise.all(huellas);
  for (let n = 0; n < 12; n++) await Promise.resolve();
}
async function esperarFetch(count: number) {
  await vaciar();
  expect(fetchMock).toHaveBeenCalledTimes(count);
}

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  jest.setSystemTime(new Date('2026-10-03T00:00:00Z'));
  const environment: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.invalid', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-de-prueba' };
  delete environment.SUPABASE_JWT_SECRET;
  jest.replaceProperty(process, 'env', environment);
  _reiniciarVerificadorParaTests();
  fetchMock.mockReset(); global.fetch = fetchMock;
  huellas = [];
  jest.spyOn(crypto.subtle, 'digest').mockImplementation((algorithm, data) => {
    const hash = originalDigest(algorithm, data);
    huellas.push(hash);
    return hash;
  });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  _reiniciarVerificadorParaTests(); global.fetch = originalFetch;
  jest.restoreAllMocks(); jest.useRealTimers();
});

it.each(['fetch', 'body'] as const)('dos consumidores comparten Auth y terminan a los 1500 ms aunque %s ignore el aborto', async phase => {
  const headers = diferida<Response>(); const pending = conCuerpoPendiente();
  fetchMock.mockReturnValue(phase === 'fetch' ? headers.promise : Promise.resolve(pending.response));
  const jwt = await token(); let settled = 0;
  const readers = [1, 2].map(() => verificarTokenAcceso(jwt).then(value => { settled++; return value; }));
  await esperarFetch(1);
  await jest.advanceTimersByTimeAsync(TIMEOUT_VERIFICACION_RED_MS - 1);
  expect(settled).toBe(0);
  await jest.advanceTimersByTimeAsync(1);
  const results = await Promise.all(readers);
  expect(results).toEqual([
    { estado: 'no_verificable', motivo: 'auth_sin_respuesta' },
    { estado: 'no_verificable', motivo: 'auth_sin_respuesta' },
  ]);
  expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

it.each(['fetch', 'body'] as const)('una respuesta válida tardía de %s no alimenta la caché después del timeout', async phase => {
  const headers = diferida<Response>(); const pending = conCuerpoPendiente();
  fetchMock.mockReturnValueOnce(phase === 'fetch' ? headers.promise : Promise.resolve(pending.response));
  const jwt = await token(); const first = verificarTokenAcceso(jwt);
  await esperarFetch(1); await jest.advanceTimersByTimeAsync(TIMEOUT_VERIFICACION_RED_MS);
  expect(await first).toMatchObject({ estado: 'no_verificable' });
  if (phase === 'fetch') headers.resolve(respuesta());
  else pending.body.resolve({ id: SUB });
  await vaciar();
  fetchMock.mockResolvedValueOnce(respuesta(SUB, 403));
  expect(await verificarTokenAcceso(jwt)).toEqual({ estado: 'invalido', motivo: 'auth_403' });
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(jest.getTimerCount()).toBe(0);
});

it('el reintento tiene su propia consulta compartida; el cuerpo anterior no da sesión ni elimina la espera nueva', async () => {
  const previous = conCuerpoPendiente(), fresh = conCuerpoPendiente();
  fetchMock.mockResolvedValueOnce(previous.response).mockResolvedValueOnce(fresh.response);
  const jwt = await token(); const first = verificarTokenAcceso(jwt);
  await esperarFetch(1); await jest.advanceTimersByTimeAsync(TIMEOUT_VERIFICACION_RED_MS);
  expect(await first).toMatchObject({ estado: 'no_verificable' });
  let retrySettled = false;
  const retry = verificarTokenAcceso(jwt).then(value => { retrySettled = true; return value; });
  await esperarFetch(2); previous.body.resolve({ id: SUB }); await vaciar();
  const companion = verificarTokenAcceso(jwt);
  // La huella usa WebCrypto real: esperar a que el segundo consumidor llegue
  // a enVuelo antes de resolver la respuesta que ambos deben compartir.
  await vaciar();
  expect(retrySettled).toBe(false); expect(fetchMock).toHaveBeenCalledTimes(2);
  fresh.body.resolve({ id: 'otro-usuario-sintetico' });
  expect(await Promise.all([retry, companion])).toEqual([
    { estado: 'invalido', motivo: 'auth_usuario_distinto' },
    { estado: 'invalido', motivo: 'auth_usuario_distinto' },
  ]);
  fetchMock.mockResolvedValueOnce(respuesta());
  expect(await verificarTokenAcceso(jwt)).toMatchObject({ estado: 'valido', metodo: 'servidor-auth' });
  expect(await verificarTokenAcceso(jwt)).toMatchObject({ estado: 'valido' });
  expect(fetchMock).toHaveBeenCalledTimes(3); expect(jest.getTimerCount()).toBe(0);
});

it.each([401, 403])('un rechazo real %i conserva el veredicto inválido y no se cachea', async status => {
  fetchMock.mockResolvedValue(respuesta(SUB, status));
  const jwt = await token();
  expect(await verificarTokenAcceso(jwt)).toEqual({ estado: 'invalido', motivo: `auth_${status}` });
  expect(await verificarTokenAcceso(jwt)).toMatchObject({ estado: 'invalido' });
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(jest.getTimerCount()).toBe(0);
});

it.each(['anon', 'service_role'])('Auth 200 no convierte el role %s en una sesión de usuario', async role => {
  fetchMock.mockResolvedValue(respuesta());
  expect(await verificarTokenAcceso(await token({ role }))).toMatchObject({ estado: 'invalido' });
});

it('el token que vence mientras se lee Auth no da sesión ni entra en la caché', async () => {
  const pending = conCuerpoPendiente(); fetchMock.mockResolvedValue(pending.response);
  const jwt = await token({ exp: Math.floor(Date.now() / 1000) + 1 });
  const read = verificarTokenAcceso(jwt); await esperarFetch(1);
  await jest.advanceTimersByTimeAsync(1000); pending.body.resolve({ id: SUB });
  expect(await read).toEqual({ estado: 'vencido' });
  expect(await verificarTokenAcceso(jwt)).toEqual({ estado: 'vencido' });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

it('una sesión cacheada deja de ser válida cuando vence su exp, sin otra llamada Auth', async () => {
  fetchMock.mockResolvedValue(respuesta());
  const jwt = await token({ exp: Math.floor(Date.now() / 1000) + 1 });
  expect(await verificarTokenAcceso(jwt)).toMatchObject({ estado: 'valido' });
  await jest.advanceTimersByTimeAsync(1000);
  expect(await verificarTokenAcceso(jwt)).toEqual({ estado: 'vencido' });
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

it('un JSON de Auth inválido conserva el motivo de respuesta no verificable', async () => {
  fetchMock.mockResolvedValue(new Response('no-es-json', { status: 200 }));
  expect(await verificarTokenAcceso(await token())).toEqual({ estado: 'no_verificable', motivo: 'auth_respuesta_no_json' });
  expect(jest.getTimerCount()).toBe(0);
});
