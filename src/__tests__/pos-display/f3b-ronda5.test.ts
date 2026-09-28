/**
 * Fase 3, parte B — ronda de cierre: las seis correcciones congeladas por el
 * orquestador (B1…B6), cada una con la prueba que impide reincidir. Sin
 * React: lo que vive en componentes se comprueba sobre la LÓGICA pura y, para
 * el cableado, leyendo el fuente (el proyecto no monta componentes en jest).
 *
 * B1 · Ninguna petición a `/api/pos/display/*` tenía tope: un `fetch` que
 *   nunca responde —wifi de hotel que acepta la conexión y calla— dejaba el
 *   `await` colgado para siempre, y con él el bootstrap sin reintento.
 *   Ahora `callDisplayApi` corre contra `DISPLAY_API_TIMEOUT_MS`, aborta y
 *   devuelve el fallo de red que todo el camino ya sabía reintentar.
 * B2 · El latido daba por «en vuelo» al anterior para siempre: si uno se
 *   colgaba, el latido quedaba MUERTO y con él la renovación del JWT de
 *   canal, que vive 5 min. Ahora se abandona pasado `HEARTBEAT_INFLIGHT_MAX_MS`
 *   y sale el siguiente; el abandonado ya no aplica su credencial.
 * B3 · `resolveRedeemFailure` excluía el 429 del respaldo, y eso dejaba sin
 *   arrancar al quiosco que agotó el cubo de /pair reintentando su propio
 *   código gastado, con su emparejamiento vivo. La huella pasa a ser la
 *   única condición.
 * B4 · La fase `bootstrapping` reintenta para siempre mientras el fallo no
 *   sea un 401: tras tres fallos seguidos se ofrece teclear un código.
 * B5 · `retryAfterSeconds` se buscaba solo en el body y las rutas mandan
 *   `Retry-After` en la CABECERA: quedaba siempre en null. Ahora se lee la
 *   cabecera, y si no viene sigue siendo null (nunca una ventana inventada).
 * B6 · Un fallo que NO consume el código (red o 5xx) conserva los seis
 *   dígitos en el campo; 400, 404 y 429 lo limpian.
 *
 * Fixtures con organización ficticia (org 120, «una tienda de calzado»).
 * Sin nombres de clientes reales.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BOOTSTRAP_FAILURES_BEFORE_PAIRING,
  DISPLAY_API_TIMEOUT_MESSAGE,
  DISPLAY_API_TIMEOUT_MS,
  HEARTBEAT_INFLIGHT_MAX_MS,
  fetchRemoteBootstrap,
  offersPairingFromBootstrap,
  pairWithCode,
  resolveRedeemFailure,
  sendRemoteHeartbeat,
  shouldKeepPairingCode,
  startRemoteHeartbeat,
  type FetchLike,
  type RemoteApiFailure,
  type StoredRemoteDisplay,
} from '@/lib/pos/display/remoteDisplay';
import { displayChannelName } from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma';
const OTRO_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsIm4iOjJ9.firma';
const HUELLA_PROPIA = 'a'.repeat(64);
const HUELLA_AJENA = 'b'.repeat(64);

const GUARDADO: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: TERMINAL, pairedAt: '2026-09-22T12:00:00.000Z', codeHash: HUELLA_PROPIA };

function credencial(token: string) {
  return { channel: displayChannelName(TERMINAL), token, expiresAt: '2026-09-22T12:05:00.000Z' };
}

function latidoOk(token: string) {
  return {
    status: 200,
    ok: true,
    json: async () => ({ data: { terminalId: TERMINAL, at: '2026-09-22T12:00:00.000Z', realtime: credencial(token) } }),
  };
}

/** Respuesta con cabeceras, como las devuelve un `fetch` de verdad. */
function respuesta(status: number, body: unknown, headers: Record<string, string> = {}) {
  const normalizadas = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name: string) => normalizadas.get(name.toLowerCase()) ?? null },
    json: async () => body,
  };
}

/**
 * Temporizadores falsos dejando VIVAS las microtareas: si se falsean
 * `nextTick`/`queueMicrotask`, `flush()` no volvería nunca.
 */
const fakeTimers = () => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });

/** Deja correr las microtareas pendientes sin avanzar el reloj. */
async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => process.nextTick(resolve));
}

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// B1 · tope de tiempo por petición
// ---------------------------------------------------------------------------

describe('F3-B ronda de cierre · B1 · ninguna petición se queda colgada', () => {
  it('un fetch que NUNCA responde termina en fallo de red al vencer el plazo, no en una promesa eterna', async () => {
    fakeTimers();
    const nunca: FetchLike = () => new Promise(() => undefined);
    const promesa = fetchRemoteBootstrap(TOKEN, nunca);

    // Un segundo antes del plazo sigue en vuelo: el tope no adelanta nada.
    jest.advanceTimersByTime(DISPLAY_API_TIMEOUT_MS - 1_000);
    await flush();
    let resuelta = false;
    void promesa.then(() => {
      resuelta = true;
    });
    await flush();
    expect(resuelta).toBe(false);

    jest.advanceTimersByTime(1_000);
    expect(await promesa).toEqual({ ok: false, kind: 'network', message: DISPLAY_API_TIMEOUT_MESSAGE });
  });

  it('al vencer el plazo se ABORTA la petición: el `signal` que recibe el fetch queda abortado', async () => {
    fakeTimers();
    let visto: AbortSignal | undefined;
    const nunca: FetchLike = (_url, init) => {
      visto = init?.signal;
      return new Promise(() => undefined);
    };
    const promesa = pairWithCode('482913', nunca);
    expect(visto).toBeDefined();
    expect(visto!.aborted).toBe(false);
    jest.advanceTimersByTime(DISPLAY_API_TIMEOUT_MS);
    expect(await promesa).toEqual({ ok: false, kind: 'network', message: DISPLAY_API_TIMEOUT_MESSAGE });
    expect(visto!.aborted).toBe(true);
  });

  it('una respuesta cuyo BODY nunca llega también vence: cabeceras sin cuerpo no cuelgan la pantalla', async () => {
    fakeTimers();
    const cuerpoEterno: FetchLike = async () => ({ status: 200, ok: true, json: () => new Promise<unknown>(() => undefined) });
    const promesa = fetchRemoteBootstrap(TOKEN, cuerpoEterno);
    await flush();
    jest.advanceTimersByTime(DISPLAY_API_TIMEOUT_MS);
    expect(await promesa).toEqual({ ok: false, kind: 'network', message: DISPLAY_API_TIMEOUT_MESSAGE });
  });

  it('una respuesta normal no deja temporizadores pendientes: el plazo se cancela siempre', async () => {
    fakeTimers();
    const ok: FetchLike = async () => latidoOk(JWT);
    const resultado = await sendRemoteHeartbeat(TOKEN, ok, { expectedTerminalId: TERMINAL });
    expect(resultado.ok).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// B2 · el latido no puede quedar muerto para siempre
// ---------------------------------------------------------------------------

describe('F3-B ronda de cierre · B2 · un latido colgado no mata el latido', () => {
  /**
   * El reloj avanza SIN que corran los temporizadores (`setSystemTime`), que
   * es justo lo que le pasa a una tableta suspendida: la pared corre y los
   * temporizadores del navegador no. Así se aísla el guard de `inFlight` del
   * plazo de B1, que en producción resolvería el atasco antes.
   */
  it('pasado HEARTBEAT_INFLIGHT_MAX_MS sale el siguiente latido y renueva el JWT; el abandonado ya no pisa la credencial', async () => {
    fakeTimers();
    jest.setSystemTime(new Date('2026-09-22T12:00:00.000Z'));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    let llamadas = 0;
    let resolverPrimera: ((r: Awaited<ReturnType<FetchLike>>) => void) | null = null;
    const fetchFn: FetchLike = () => {
      llamadas += 1;
      if (llamadas === 1) {
        return new Promise((resolve) => {
          resolverPrimera = resolve;
        });
      }
      return Promise.resolve(latidoOk(JWT));
    };
    const onCredential = jest.fn();
    const hb = startRemoteHeartbeat({ token: TOKEN, fetchFn, onCredential, onRevoked: jest.fn(), expectedTerminalId: TERMINAL, immediate: true });
    await flush();
    expect(llamadas).toBe(1);

    // Dentro del tope, «uno en vuelo» sigue valiendo: no se solapan.
    void hb.beat();
    await flush();
    expect(llamadas).toBe(1);
    expect(onCredential).not.toHaveBeenCalled();

    // La tableta despierta: el reloj saltó por encima del tope.
    jest.setSystemTime(new Date(Date.now() + HEARTBEAT_INFLIGHT_MAX_MS + 1_000));
    await hb.beat();
    expect(llamadas).toBe(2);
    expect(onCredential).toHaveBeenCalledTimes(1);
    expect(onCredential).toHaveBeenCalledWith(credencial(JWT));

    // El primero responde por fin, con un JWT más viejo: no se aplica.
    resolverPrimera!(latidoOk(OTRO_JWT));
    await flush();
    await flush();
    expect(onCredential).toHaveBeenCalledTimes(1);
    hb.stop();
  });

  it('el tope está por encima del plazo de la petición: lo normal es que el plazo resuelva el atasco antes', () => {
    expect(HEARTBEAT_INFLIGHT_MAX_MS).toBeGreaterThan(DISPLAY_API_TIMEOUT_MS);
  });
});

// ---------------------------------------------------------------------------
// B3 · el respaldo depende de la huella, no del estado HTTP
// ---------------------------------------------------------------------------

describe('F3-B ronda de cierre · B3 · respaldo con la huella del código', () => {
  const limitado: RemoteApiFailure = { ok: false, kind: 'http', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 60 };

  it('un 429 con la huella IGUAL cae al emparejamiento guardado (el quiosco que agotó el cubo con su propio código)', () => {
    expect(resolveRedeemFailure(limitado, GUARDADO, HUELLA_PROPIA)).toEqual({ kind: 'fallback', stored: GUARDADO });
  });

  it('con la huella DISTINTA se sigue pidiendo el código, sea cual sea el estado: reapuntar a otra caja nunca arranca en silencio', () => {
    const fallos: RemoteApiFailure[] = [
      limitado,
      { ok: false, kind: 'http', status: 404, code: 'CODE_INVALID', retryAfterSeconds: null },
      { ok: false, kind: 'http', status: 503, code: null, retryAfterSeconds: null },
      { ok: false, kind: 'network', message: 'offline' },
    ];
    for (const fallo of fallos) {
      expect(resolveRedeemFailure(fallo, GUARDADO, HUELLA_AJENA)).toEqual({ kind: 'ask_code', failure: fallo });
      // Sin huella calculable tampoco hay respaldo, y sin emparejamiento guardado no hay a dónde caer.
      expect(resolveRedeemFailure(fallo, GUARDADO, null)).toEqual({ kind: 'ask_code', failure: fallo });
      expect(resolveRedeemFailure(fallo, null, HUELLA_PROPIA)).toEqual({ kind: 'ask_code', failure: fallo });
    }
  });

  it('un emparejamiento guardado SIN huella nunca tiene respaldo, ni con su propio código', () => {
    const sinHuella: StoredRemoteDisplay = { v: 1, token: TOKEN, terminalId: TERMINAL, pairedAt: '' };
    expect(resolveRedeemFailure(limitado, sinHuella, HUELLA_PROPIA).kind).toBe('ask_code');
  });
});

// ---------------------------------------------------------------------------
// B4 · salida de la fase bootstrapping
// ---------------------------------------------------------------------------

describe('F3-B ronda de cierre · B4 · tras tres fallos seguidos se ofrece teclear un código', () => {
  const fallo: RemoteApiFailure = { ok: false, kind: 'http', status: 503, code: 'REALTIME_NOT_CONFIGURED', retryAfterSeconds: null };

  it('con menos de tres fallos NO se ofrece: un corte pasajero se resuelve solo', () => {
    expect(BOOTSTRAP_FAILURES_BEFORE_PAIRING).toBe(3);
    expect(offersPairingFromBootstrap(0, null)).toBe(false);
    expect(offersPairingFromBootstrap(0, fallo)).toBe(false);
    expect(offersPairingFromBootstrap(1, null)).toBe(false);
    expect(offersPairingFromBootstrap(1, fallo)).toBe(false);
    expect(offersPairingFromBootstrap(2, null)).toBe(false);
  });

  it('al tercer fallo (y mientras el intento en curso sigue en vuelo) sí se ofrece', () => {
    expect(offersPairingFromBootstrap(2, fallo)).toBe(true);
    expect(offersPairingFromBootstrap(3, null)).toBe(true);
    expect(offersPairingFromBootstrap(9, fallo)).toBe(true);
  });

  it('un `attempt` negativo o absurdo no abre la puerta antes de tiempo', () => {
    expect(offersPairingFromBootstrap(-5, null)).toBe(false);
    expect(offersPairingFromBootstrap(-5, fallo)).toBe(false);
  });

  it('la vista de arranque acepta `onPair` y la pantalla se lo pasa con la regla pura', () => {
    const views = readFileSync(join(process.cwd(), 'src/components/pos-display/views.tsx'), 'utf8');
    expect(views).toMatch(/export function RemoteBootstrappingView\(\{ failureCode, onPair \}/);
    expect(views).toMatch(/\{onPair && <PairButton onPair=\{onPair\} \/>\}/);
    const pantalla = readFileSync(join(process.cwd(), 'src/components/pos-display/CustomerDisplay.tsx'), 'utf8');
    expect(pantalla).toMatch(/offersPairingFromBootstrap\(remotePhase\.attempt, remotePhase\.failure\) \? remote\.openPairing : undefined/);
    // Y el hook sabe abrir el emparejamiento desde `bootstrapping`, soltando antes el reintento.
    const hook = readFileSync(join(process.cwd(), 'src/components/pos-display/useRemoteDisplay.ts'), 'utf8');
    expect(hook).toMatch(/if \(prev\.kind === 'bootstrapping'\) \{\s*\n\s*teardownRemote\(\);/);
  });
});

// ---------------------------------------------------------------------------
// B5 · Retry-After real
// ---------------------------------------------------------------------------

describe('F3-B ronda de cierre · B5 · retryAfterSeconds sale de la cabecera', () => {
  it('un 429 con `Retry-After: 42` llega a la pantalla con 42 segundos', async () => {
    const fetchFn: FetchLike = async () => respuesta(429, { error: 'Demasiados intentos', code: 'RATE_LIMITED' }, { 'Retry-After': '42' });
    expect(await pairWithCode('482913', fetchFn)).toEqual({ ok: false, kind: 'http', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 42 });
  });

  it('la forma con FECHA HTTP también se entiende, en segundos desde ahora', async () => {
    fakeTimers();
    jest.setSystemTime(new Date('2026-09-22T12:00:00.000Z'));
    const fetchFn: FetchLike = async () => respuesta(429, { code: 'RATE_LIMITED' }, { 'Retry-After': 'Tue, 22 Sep 2026 12:01:00 GMT' });
    const resultado = await pairWithCode('482913', fetchFn);
    expect(resultado).toMatchObject({ kind: 'http', status: 429, retryAfterSeconds: 60 });
  });

  it('sin cabecera —o con una que no se entiende, o sin `headers` en la respuesta— queda en null: no se inventa una ventana', async () => {
    const sinCabecera: FetchLike = async () => respuesta(429, { code: 'RATE_LIMITED' });
    expect(await pairWithCode('482913', sinCabecera)).toMatchObject({ retryAfterSeconds: null });
    const ilegible: FetchLike = async () => respuesta(429, { code: 'RATE_LIMITED' }, { 'Retry-After': 'pronto' });
    expect(await pairWithCode('482913', ilegible)).toMatchObject({ retryAfterSeconds: null });
    const sinHeaders: FetchLike = async () => ({ status: 429, ok: false, json: async () => ({ code: 'RATE_LIMITED' }) });
    expect(await pairWithCode('482913', sinHeaders)).toMatchObject({ retryAfterSeconds: null });
  });

  it('si alguna ruta mandara `retryAfter` en el body, ese manda sobre la cabecera', async () => {
    const fetchFn: FetchLike = async () => respuesta(429, { code: 'RATE_LIMITED', retryAfter: 7 }, { 'Retry-After': '42' });
    expect(await pairWithCode('482913', fetchFn)).toMatchObject({ retryAfterSeconds: 7 });
  });

  it('las rutas del repositorio mandan la cabecera: por eso hay que leerla', () => {
    const pair = readFileSync(join(process.cwd(), 'src/app/api/pos/display/pair/route.ts'), 'utf8');
    expect(pair).toMatch(/'Retry-After': String\(retryAfter\)/);
  });
});

// ---------------------------------------------------------------------------
// B6 · qué pasa con el código tecleado tras un fallo
// ---------------------------------------------------------------------------

describe('F3-B ronda de cierre · B6 · el código solo se borra cuando el fallo lo consumió', () => {
  it('red y 5xx lo conservan: la petición ni llegó a mirarlo', () => {
    expect(shouldKeepPairingCode({ ok: false, kind: 'network', message: 'offline' })).toBe(true);
    expect(shouldKeepPairingCode({ ok: false, kind: 'network', message: DISPLAY_API_TIMEOUT_MESSAGE })).toBe(true);
    expect(shouldKeepPairingCode({ ok: false, kind: 'http', status: 500, code: null, retryAfterSeconds: null })).toBe(true);
    expect(shouldKeepPairingCode({ ok: false, kind: 'http', status: 503, code: 'REALTIME_NOT_CONFIGURED', retryAfterSeconds: null })).toBe(true);
  });

  it('400, 404 y 429 lo limpian: hay que volver a la caja o esperar', () => {
    expect(shouldKeepPairingCode({ ok: false, kind: 'http', status: 400, code: 'BAD_REQUEST', retryAfterSeconds: null })).toBe(false);
    expect(shouldKeepPairingCode({ ok: false, kind: 'http', status: 404, code: 'CODE_INVALID', retryAfterSeconds: null })).toBe(false);
    expect(shouldKeepPairingCode({ ok: false, kind: 'http', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 60 })).toBe(false);
  });

  it('el hook aplica la regla en el campo del código', () => {
    const hook = readFileSync(join(process.cwd(), 'src/components/pos-display/useRemoteDisplay.ts'), 'utf8');
    // Cierre de F3: la regla se calcula una vez (`conserva`) y viaja también
    // como `keepCode` a la vista, que es donde antes moría el valor.
    expect(hook).toMatch(/const conserva = shouldKeepPairingCode\(result\)/);
    expect(hook).toMatch(/prefill: conserva \? code : ''/);
    expect(hook).toMatch(/keepCode: conserva/);
  });
});
