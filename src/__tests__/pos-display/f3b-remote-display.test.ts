/**
 * Fase 3, parte B — emparejamiento, token, bootstrap y latido de la pantalla
 * remota (src/lib/pos/display/remoteDisplay.ts y pairing.ts) con `fetch` y
 * storage mockeados. Sin React: el hook useRemoteDisplay solo envuelve esto.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import {
  DISPLAY_TOKEN_PATTERN,
  PAIRING_CODE_LENGTH,
  PAIRING_CODE_PATTERN,
  isDisplayTokenShape,
  isPairingCodeShape,
  normalizePairingCodeInput,
} from '@/lib/pos/display/pairing';
import * as serverTokens from '@/lib/pos/display/server/displayTokens';
import {
  BOOTSTRAP_ENDPOINT,
  BOOTSTRAP_RETRY_BASE_MS,
  BOOTSTRAP_RETRY_MAX_MS,
  HEARTBEAT_ENDPOINT,
  PAIR_ENDPOINT,
  REMOTE_DISPLAY_STORAGE_KEY,
  REMOTE_HEARTBEAT_INTERVAL_MS,
  bootstrapRetryDelay,
  clearStoredRemoteDisplay,
  fetchRemoteBootstrap,
  isRemoteBootstrap,
  isUnauthorizedFailure,
  pairWithCode,
  readPairCodeFromSearch,
  readStoredRemoteDisplay,
  resolveRemoteIntent,
  saveStoredRemoteDisplay,
  sendRemoteHeartbeat,
  startRemoteHeartbeat,
  stripPairFromUrl,
  type FetchLike,
  type RemoteApiFailure,
  type RemoteTokenStorage,
} from '@/lib/pos/display/remoteDisplay';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
/** 43 caracteres base64url: la forma exacta que devuelve /pair. */
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcde';
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.firma';

function memoryStorage(initial: Record<string, string> = {}): RemoteTokenStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

interface FakeResponse {
  status: number;
  body?: unknown;
  invalidJson?: boolean;
}

/** fetch falso: registra cada llamada y responde según `plan` (por URL, en orden). Un plan `Error` rechaza. */
function fakeFetch(plan: Record<string, Array<FakeResponse | Error>>) {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const fetchFn: FetchLike = async (url, init) => {
    calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined });
    const queue = plan[url] ?? [];
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (!next) throw new Error(`sin plan para ${url}`);
    if (next instanceof Error) throw next;
    return {
      status: next.status,
      ok: next.status >= 200 && next.status < 300,
      json: async () => {
        if (next.invalidJson) throw new SyntaxError('no JSON');
        return next.body;
      },
    };
  };
  return { fetchFn, calls };
}

const bootstrapBody = {
  data: {
    terminal: { id: TERMINAL, name: 'Caja 1', code: 'CAJA-1', branchId: 1 },
    brand: { organizationId: 1, name: 'Tienda de prueba', logoUrl: null, primaryColor: '#123456', secondaryColor: null, timezone: 'America/Bogota' },
    settings: { enabled: true },
    locale: 'es',
    currency: 'COP',
    realtime: { channel: `pos-display:${TERMINAL}`, token: JWT, expiresAt: '2026-09-22T12:05:00.000Z' },
  },
};

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('F3-B · pairing.ts · formas compartidas con el servidor', () => {
  it('el servidor (displayTokens) reexporta las MISMAS definiciones del módulo hoja: una sola fuente', () => {
    expect(serverTokens.PAIRING_CODE_PATTERN).toBe(PAIRING_CODE_PATTERN);
    expect(serverTokens.DISPLAY_TOKEN_PATTERN).toBe(DISPLAY_TOKEN_PATTERN);
    expect(serverTokens.isPairingCodeShape).toBe(isPairingCodeShape);
    expect(serverTokens.isDisplayTokenShape).toBe(isDisplayTokenShape);
    expect(isDisplayTokenShape(serverTokens.generateDisplayToken())).toBe(true);
    expect(isPairingCodeShape(serverTokens.generatePairingCode())).toBe(true);
  });

  it('normalizePairingCodeInput deja solo dígitos, como mucho seis', () => {
    expect(PAIRING_CODE_LENGTH).toBe(6);
    expect(normalizePairingCodeInput('123 456')).toBe('123456');
    expect(normalizePairingCodeInput(' 12-34-56-78 ')).toBe('123456');
    expect(normalizePairingCodeInput('ab12')).toBe('12');
    expect(normalizePairingCodeInput('')).toBe('');
    expect(normalizePairingCodeInput(123456)).toBe('');
    expect(normalizePairingCodeInput(null)).toBe('');
  });

  it('isPairingCodeShape / isDisplayTokenShape: solo forma', () => {
    expect(isPairingCodeShape('000000')).toBe(true);
    expect(isPairingCodeShape('12345')).toBe(false);
    expect(isPairingCodeShape('1234567')).toBe(false);
    expect(isPairingCodeShape('12345a')).toBe(false);
    expect(isDisplayTokenShape(TOKEN)).toBe(true);
    expect(isDisplayTokenShape(`${TOKEN}=`)).toBe(false);
    expect(isDisplayTokenShape(TOKEN.slice(1))).toBe(false);
    expect(isDisplayTokenShape(undefined)).toBe(false);
  });
});

describe('F3-B · remoteDisplay · token en localStorage', () => {
  it('guarda `{ v: 1, token, terminalId, pairedAt }` bajo la clave documentada y lo relee', () => {
    const storage = memoryStorage();
    expect(REMOTE_DISPLAY_STORAGE_KEY).toBe('pos_display_remote');
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL, pairedAt: '2026-09-22T12:00:00.000Z' }, storage)).toBe(true);
    expect(JSON.parse(storage.data[REMOTE_DISPLAY_STORAGE_KEY])).toEqual({ v: 1, token: TOKEN, terminalId: TERMINAL, pairedAt: '2026-09-22T12:00:00.000Z' });
    expect(readStoredRemoteDisplay(storage)).toEqual({ v: 1, token: TOKEN, terminalId: TERMINAL, pairedAt: '2026-09-22T12:00:00.000Z' });
    clearStoredRemoteDisplay(storage);
    expect(readStoredRemoteDisplay(storage)).toBeNull();
    expect(REMOTE_DISPLAY_STORAGE_KEY in storage.data).toBe(false);
  });

  it('rechaza un token sin forma válida al guardar y trata como ausente lo corrupto, otra versión o un token malo al leer', () => {
    const storage = memoryStorage();
    expect(saveStoredRemoteDisplay({ token: 'corto', terminalId: TERMINAL }, storage)).toBe(false);
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: '' }, storage)).toBe(false);
    expect(storage.data).toEqual({});
    for (const raw of ['{', '"x"', '[]', JSON.stringify({ v: 2, token: TOKEN, terminalId: TERMINAL }), JSON.stringify({ v: 1, token: 'x', terminalId: TERMINAL }), JSON.stringify({ v: 1, token: TOKEN })]) {
      storage.data[REMOTE_DISPLAY_STORAGE_KEY] = raw;
      expect(readStoredRemoteDisplay(storage)).toBeNull();
    }
  });

  it('sin storage (null) o con storage que lanza, nunca lanza', () => {
    expect(readStoredRemoteDisplay(null)).toBeNull();
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL }, null)).toBe(false);
    expect(() => clearStoredRemoteDisplay(null)).not.toThrow();
    const broken: RemoteTokenStorage = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cuota');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(readStoredRemoteDisplay(broken)).toBeNull();
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL }, broken)).toBe(false);
    expect(() => clearStoredRemoteDisplay(broken)).not.toThrow();
  });
});

describe('F3-B · remoteDisplay · intención al cargar (selección de transporte)', () => {
  const stored = { v: 1 as const, token: TOKEN, terminalId: TERMINAL, pairedAt: '' };

  it('readPairCodeFromSearch: ausente → null; presente → el valor CRUDO, sin sanear (ronda 2 · 7)', () => {
    expect(readPairCodeFromSearch('')).toBeNull();
    expect(readPairCodeFromSearch(null)).toBeNull();
    expect(readPairCodeFromSearch('?x=1')).toBeNull();
    expect(readPairCodeFromSearch('?pair=123456')).toBe('123456');
    // Ya NO se sanea aquí: quien decide si eso se canjea o se lleva al campo
    // es resolveRemoteIntent, y para decidirlo necesita ver lo que llegó.
    expect(readPairCodeFromSearch('pair=12%2034%2056')).toBe('12 34 56');
    expect(readPairCodeFromSearch('?pair=')).toBe('');
    expect(readPairCodeFromSearch('?pair=12ab')).toBe('12ab');
    expect(readPairCodeFromSearch('?pair=1234567')).toBe('1234567');
  });

  it('sin `?pair` ni token → LOCAL (comportamiento anterior a la parte B)', () => {
    expect(resolveRemoteIntent('', null)).toEqual({ kind: 'local' });
    expect(resolveRemoteIntent('?otra=1', null)).toEqual({ kind: 'local' });
  });

  it('token guardado → REMOTO; un código válido en la URL manda sobre el token (re-emparejar)', () => {
    expect(resolveRemoteIntent('', stored)).toEqual({ kind: 'remote', stored });
    // El código manda, pero se lleva el emparejamiento guardado de respaldo
    // por si ya estuviera consumido (ronda 2 · 1).
    expect(resolveRemoteIntent('?pair=654321', stored)).toEqual({ kind: 'pair', code: '654321', fallback: stored });
    expect(resolveRemoteIntent('?pair=654321', null)).toEqual({ kind: 'pair', code: '654321', fallback: null });
  });

  it('`?pair` sin código válido → pedir el código (con lo tecleado), salvo que haya token guardado', () => {
    expect(resolveRemoteIntent('?pair', null)).toEqual({ kind: 'ask_code', prefill: '' });
    expect(resolveRemoteIntent('?pair=12', null)).toEqual({ kind: 'ask_code', prefill: '12' });
    // Ni truncado ni con letras se canjea nada: al campo, con lo que se pueda leer.
    expect(resolveRemoteIntent('?pair=1234567', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=abc-123456', null)).toEqual({ kind: 'ask_code', prefill: '123456' });
    expect(resolveRemoteIntent('?pair=12', stored)).toEqual({ kind: 'remote', stored });
  });

  it('stripPairFromUrl quita solo `pair` y conserva ruta, otros parámetros y hash', () => {
    expect(stripPairFromUrl('https://app.example/pos-display?pair=123456')).toBe('https://app.example/pos-display');
    expect(stripPairFromUrl('https://app.example/pos-display?a=1&pair=123456&b=2#x')).toBe('https://app.example/pos-display?a=1&b=2#x');
    expect(stripPairFromUrl('no es una url')).toBe('no es una url');
  });
});

describe('F3-B · remoteDisplay · rutas con fetch mockeado', () => {
  it('pairWithCode: POST {code} sin Authorization; 200 → token y terminalId', async () => {
    const { fetchFn, calls } = fakeFetch({ [PAIR_ENDPOINT]: [{ status: 200, body: { data: { token: TOKEN, terminalId: TERMINAL } } }] });
    const result = await pairWithCode('123456', fetchFn);
    expect(result).toEqual({ ok: true, data: { token: TOKEN, terminalId: TERMINAL } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: PAIR_ENDPOINT, method: 'POST', body: { code: '123456' } });
    expect(calls[0].headers.Authorization).toBeUndefined();
    expect(calls[0].headers['Content-Type']).toBe('application/json');
  });

  it('pairWithCode: 404 (inválido/vencido), 429 (rate limit), red, y 200 con forma rara', async () => {
    const { fetchFn } = fakeFetch({
      [PAIR_ENDPOINT]: [
        { status: 404, body: { error: 'Código inválido o vencido', code: 'CODE_INVALID' } },
        { status: 429, body: { code: 'RATE_LIMITED' } },
        new Error('sin red'),
        { status: 200, body: { data: { token: 'corto', terminalId: TERMINAL } } },
        { status: 200, body: { data: { token: TOKEN } } },
      ],
    });
    expect(await pairWithCode('123456', fetchFn)).toEqual({ ok: false, kind: 'http', status: 404, code: 'CODE_INVALID', retryAfterSeconds: null });
    expect(await pairWithCode('123456', fetchFn)).toMatchObject({ ok: false, kind: 'http', status: 429, code: 'RATE_LIMITED' });
    expect(await pairWithCode('123456', fetchFn)).toEqual({ ok: false, kind: 'network', message: 'sin red' });
    expect(await pairWithCode('123456', fetchFn)).toMatchObject({ ok: false, kind: 'network' });
    expect(await pairWithCode('123456', fetchFn)).toMatchObject({ ok: false, kind: 'network' });
  });

  it('fetchRemoteBootstrap: GET con Bearer; 200 → bootstrap; 401 → no autorizado; 503 → reintentable; body no JSON → red', async () => {
    const { fetchFn, calls } = fakeFetch({
      [BOOTSTRAP_ENDPOINT]: [
        { status: 200, body: bootstrapBody },
        { status: 401, body: { code: 'DISPLAY_UNAUTHORIZED' } },
        { status: 503, body: { code: 'REALTIME_NOT_CONFIGURED' } },
        { status: 200, invalidJson: true },
        { status: 200, body: { data: { ...bootstrapBody.data, realtime: { channel: '' } } } },
      ],
    });
    const ok = await fetchRemoteBootstrap(TOKEN, fetchFn);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.data.terminal.id).toBe(TERMINAL);
      expect(ok.data.realtime).toEqual(bootstrapBody.data.realtime);
      expect(ok.data.brand.timezone).toBe('America/Bogota');
    }
    expect(calls[0]).toMatchObject({ method: 'GET', url: BOOTSTRAP_ENDPOINT });
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toBeUndefined();

    const unauthorized = await fetchRemoteBootstrap(TOKEN, fetchFn);
    expect(unauthorized.ok).toBe(false);
    if (!unauthorized.ok) expect(isUnauthorizedFailure(unauthorized)).toBe(true);

    const notConfigured = await fetchRemoteBootstrap(TOKEN, fetchFn);
    expect(notConfigured).toMatchObject({ ok: false, kind: 'http', status: 503, code: 'REALTIME_NOT_CONFIGURED' });
    if (!notConfigured.ok) expect(isUnauthorizedFailure(notConfigured)).toBe(false);

    expect(await fetchRemoteBootstrap(TOKEN, fetchFn)).toMatchObject({ ok: false, kind: 'network' });
    expect(await fetchRemoteBootstrap(TOKEN, fetchFn)).toMatchObject({ ok: false, kind: 'network' });
  });

  it('isRemoteBootstrap exige terminal.id, brand, settings, currency y credencial de Realtime completa', () => {
    expect(isRemoteBootstrap(bootstrapBody.data)).toBe(true);
    expect(isRemoteBootstrap(null)).toBe(false);
    expect(isRemoteBootstrap({ ...bootstrapBody.data, terminal: { name: 'x' } })).toBe(false);
    expect(isRemoteBootstrap({ ...bootstrapBody.data, realtime: { channel: 'c', token: '' , expiresAt: '' } })).toBe(false);
    expect(isRemoteBootstrap({ ...bootstrapBody.data, settings: null })).toBe(false);
  });

  it('sendRemoteHeartbeat: POST con Bearer y sin body; 200 → credencial renovada', async () => {
    const { fetchFn, calls } = fakeFetch({
      [HEARTBEAT_ENDPOINT]: [{ status: 200, body: { data: { terminalId: TERMINAL, at: '2026-09-22T12:01:00.000Z', realtime: bootstrapBody.data.realtime } } }],
    });
    const result = await sendRemoteHeartbeat(TOKEN, fetchFn);
    expect(result).toEqual({ ok: true, data: { terminalId: TERMINAL, at: '2026-09-22T12:01:00.000Z', realtime: bootstrapBody.data.realtime } });
    expect(calls[0]).toMatchObject({ method: 'POST', url: HEARTBEAT_ENDPOINT });
    expect(calls[0].headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0].body).toBeUndefined();
  });

  it('bootstrapRetryDelay: 5 s, 10 s, 20 s, 40 s, tope 60 s', () => {
    expect(BOOTSTRAP_RETRY_BASE_MS).toBe(5_000);
    expect(BOOTSTRAP_RETRY_MAX_MS).toBe(60_000);
    expect([0, 1, 2, 3, 4, 10, 99].map(bootstrapRetryDelay)).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });
});

describe('F3-B · remoteDisplay · latido cada 60 s', () => {
  const fakeTimers = () => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
  async function flush(rounds = 4): Promise<void> {
    for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
  }

  it('late cada REMOTE_HEARTBEAT_INTERVAL_MS (60 s) y entrega la credencial nueva en cada latido; no late al arrancar', async () => {
    fakeTimers();
    expect(REMOTE_HEARTBEAT_INTERVAL_MS).toBe(60_000);
    const { fetchFn, calls } = fakeFetch({
      [HEARTBEAT_ENDPOINT]: [{ status: 200, body: { data: { terminalId: TERMINAL, at: 'x', realtime: { ...bootstrapBody.data.realtime, token: 'jwt-nuevo' } } } }],
    });
    const onCredential = jest.fn();
    const onRevoked = jest.fn();
    const hb = startRemoteHeartbeat({ token: TOKEN, fetchFn, onCredential, onRevoked });
    expect(calls).toHaveLength(0);
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(calls).toHaveLength(1);
    expect(onCredential).toHaveBeenCalledTimes(1);
    expect(onCredential.mock.calls[0][0].token).toBe('jwt-nuevo');
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(calls).toHaveLength(2);
    expect(onRevoked).not.toHaveBeenCalled();
    hb.stop();
    jest.advanceTimersByTime(120_000);
    await flush();
    expect(calls).toHaveLength(2);
    expect(hb.stopped).toBe(true);
  });

  it('401 en el latido → onRevoked UNA vez, se detiene solo y no vuelve a latir (revocada)', async () => {
    fakeTimers();
    const { fetchFn, calls } = fakeFetch({ [HEARTBEAT_ENDPOINT]: [{ status: 401, body: { code: 'DISPLAY_UNAUTHORIZED' } }] });
    const onCredential = jest.fn();
    const onRevoked = jest.fn();
    const hb = startRemoteHeartbeat({ token: TOKEN, fetchFn, onCredential, onRevoked });
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(onRevoked).toHaveBeenCalledTimes(1);
    expect(hb.stopped).toBe(true);
    jest.advanceTimersByTime(180_000);
    await flush();
    expect(calls).toHaveLength(1);
    expect(onCredential).not.toHaveBeenCalled();
  });

  it('503 o red en el latido → onFailure, sigue latiendo (no desempareja); un beat() manual no solapa otro en vuelo', async () => {
    fakeTimers();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    let resolveSlow: ((r: { status: number; ok: boolean; json(): Promise<unknown> }) => void) | null = null;
    const responses: Array<FakeResponse | Error> = [{ status: 503, body: { code: 'HEARTBEAT_FAILED' } }, new Error('sin red')];
    const calls: string[] = [];
    const fetchFn: FetchLike = (url) => {
      calls.push(url);
      const next = responses.shift();
      if (next instanceof Error) return Promise.reject(next);
      if (next) return Promise.resolve({ status: next.status, ok: false, json: async () => next.body });
      return new Promise((resolve) => {
        resolveSlow = resolve;
      });
    };
    const onFailure = jest.fn((f: RemoteApiFailure) => f.kind);
    const onRevoked = jest.fn();
    const hb = startRemoteHeartbeat({ token: TOKEN, fetchFn, onCredential: jest.fn(), onRevoked, onFailure });
    jest.advanceTimersByTime(60_000);
    await flush();
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(onFailure.mock.results.map((r) => r.value)).toEqual(['http', 'network']);
    expect(onRevoked).not.toHaveBeenCalled();
    expect(hb.stopped).toBe(false);
    expect(warn).toHaveBeenCalled();

    // Tercer latido queda en vuelo; un beat() manual y un tick más no abren
    // otra petición MIENTRAS dure el plazo (ronda 4 · B1 y · B2: pasado
    // HEARTBEAT_INFLIGHT_MAX_MS sí sale otro, y eso se prueba en
    // f3b-ronda5.test.ts; aquí se avanza un segundo, muy por debajo).
    const pending = hb.beat();
    await flush();
    expect(calls).toHaveLength(3);
    void hb.beat();
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(calls).toHaveLength(3);
    resolveSlow!({ status: 200, ok: true, json: async () => ({ data: { terminalId: TERMINAL, at: 'x', realtime: bootstrapBody.data.realtime } }) });
    await pending;
    await flush();
    hb.stop();
  });

  it('`immediate: true` late en el acto; tras stop() una respuesta tardía no llama a nada', async () => {
    fakeTimers();
    let resolveLater: ((r: { status: number; ok: boolean; json(): Promise<unknown> }) => void) | null = null;
    const fetchFn: FetchLike = () =>
      new Promise((resolve) => {
        resolveLater = resolve;
      });
    const onCredential = jest.fn();
    const onRevoked = jest.fn();
    const hb = startRemoteHeartbeat({ token: TOKEN, fetchFn, onCredential, onRevoked, immediate: true });
    await flush();
    expect(resolveLater).not.toBeNull();
    hb.stop();
    resolveLater!({ status: 401, ok: false, json: async () => ({}) });
    await flush();
    expect(onRevoked).not.toHaveBeenCalled();
    expect(onCredential).not.toHaveBeenCalled();
  });
});

describe('F3-B · flujo completo de emparejamiento (sin React)', () => {
  it('código → /pair → token guardado → /bootstrap → latido renueva → /revoke (401) → token borrado', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    const flush = async () => {
      for (let i = 0; i < 4; i += 1) await new Promise<void>((r) => setImmediate(r));
    };
    const storage = memoryStorage();
    const { fetchFn, calls } = fakeFetch({
      [PAIR_ENDPOINT]: [{ status: 200, body: { data: { token: TOKEN, terminalId: TERMINAL } } }],
      [BOOTSTRAP_ENDPOINT]: [{ status: 200, body: bootstrapBody }],
      [HEARTBEAT_ENDPOINT]: [
        { status: 200, body: { data: { terminalId: TERMINAL, at: 'x', realtime: { ...bootstrapBody.data.realtime, token: 'jwt-2' } } } },
        { status: 401, body: { code: 'DISPLAY_UNAUTHORIZED' } },
      ],
    });

    // 1. La URL trae el código: canjear.
    const intent = resolveRemoteIntent('?pair=123456', readStoredRemoteDisplay(storage));
    expect(intent.kind).toBe('pair');
    const paired = await pairWithCode((intent as { code: string }).code, fetchFn);
    expect(paired.ok).toBe(true);
    if (!paired.ok) return;
    expect(saveStoredRemoteDisplay(paired.data, storage)).toBe(true);

    // 2. Recarga sin `?pair`: el token guardado decide REMOTO.
    const again = resolveRemoteIntent('', readStoredRemoteDisplay(storage));
    expect(again).toMatchObject({ kind: 'remote', stored: { token: TOKEN, terminalId: TERMINAL } });

    // 3. Bootstrap con el token.
    const boot = await fetchRemoteBootstrap(TOKEN, fetchFn);
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    const applied: string[] = [boot.data.realtime.token];

    // 4. Latido: renueva el JWT; luego el servidor revoca (401) → se borra el token.
    let revoked = false;
    const hb = startRemoteHeartbeat({
      token: TOKEN,
      fetchFn,
      onCredential: (c) => applied.push(c.token),
      onRevoked: () => {
        revoked = true;
        clearStoredRemoteDisplay(storage);
      },
    });
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(applied).toEqual([JWT, 'jwt-2']);
    jest.advanceTimersByTime(60_000);
    await flush();
    expect(revoked).toBe(true);
    expect(hb.stopped).toBe(true);
    expect(readStoredRemoteDisplay(storage)).toBeNull();

    // 5. Siguiente carga: sin token ni código → local (y la UI ofrece emparejar de nuevo).
    expect(resolveRemoteIntent('', readStoredRemoteDisplay(storage))).toEqual({ kind: 'local' });

    // El token largo solo viajó como Bearer a bootstrap y heartbeat; nunca en /pair ni en un body.
    for (const call of calls) {
      if (call.url === PAIR_ENDPOINT) expect(call.headers.Authorization).toBeUndefined();
      else expect(call.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(JSON.stringify(call.body ?? null)).not.toContain(TOKEN);
    }
  });
});
