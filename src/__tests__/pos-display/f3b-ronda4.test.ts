/**
 * Fase 3, parte B — ronda 4: las correcciones del QA, cada una con la prueba
 * que impide reincidir. Sin React (el proyecto no monta componentes en jest):
 * se prueba la LÓGICA pura y el enlace + receptor remoto sobre el doble del
 * canal de Realtime.
 *
 * QA-1 (alto) · El ritmo remoto se había corregido para la PRESENCIA pero no
 *   para el `need_snapshot`, que es el peor caso: mientras no hay caja viva,
 *   `displayLink` lo repetía cada RESNAPSHOT_INTERVAL_MS = 2 s
 *   INDEFINIDAMENTE (DISCONNECTED_TO_IDLE_MS solo cambia la vista). Sobre
 *   Supabase Broadcast son 30 mensajes de subida por minuto que nadie va a
 *   contestar, justo en las horas en que el comercio está cerrado. Aquí se
 *   cuentan los envíos del doble durante DIEZ MINUTOS simulados de
 *   desconexión, en remoto y en local, y se comparan.
 * QA-2 (bajo) · Sin `crypto.subtle` (http plano: un quiosco apuntado a la
 *   instancia por IP de la LAN) no había huella del código y el respaldo que
 *   salva un `?pair` ya gastado no se aplicaba nunca. Ahora hay huella no
 *   criptográfica con prefijo propio.
 * QA-3 (bajo) · `waitForLeave` dejaba vivo el temporizador del tope cuando
 *   ganaba la salida del canal.
 * QA-4 (bajo) · `bootstrap.locale` se validaba, viajaba y no se usaba.
 *
 * Fixtures con organización ficticia (ids y descripciones). Sin nombres
 * reales.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DISCONNECTED_TO_IDLE_MS,
  RESNAPSHOT_INTERVAL_MS,
  startDisplayLink,
  type DisplayLink,
} from '@/components/pos-display/displayLink';
import {
  NON_CRYPTO_FINGERPRINT_PREFIX,
  pairingCodeFingerprint,
  readStoredRemoteDisplay,
  resolveRedeemFailure,
  resolveRemoteLocale,
  saveStoredRemoteDisplay,
  type RemoteApiFailure,
  type RemoteTokenStorage,
} from '@/lib/pos/display/remoteDisplay';
import {
  REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS,
  REMOTE_PRESENCE_INTERVAL_MS,
  REMOTE_RESNAPSHOT_INTERVAL_MS,
  REMOTE_STALE_AFTER_MS,
  SupabaseBroadcastReceiver,
} from '@/lib/pos/display/supabaseBroadcastTransport';
import { displayChannelName } from '@/lib/pos/display/transport';
import { RealtimeBus, createRealtimeDouble } from './f3b-supabaseRealtimeDouble';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TOKEN = 'D'.repeat(43);
const CODE = '482913';
const OTHER_CODE = '100200';
const CAPS = { touch: false, width: 1024, height: 768 } as const;

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

const opened: DisplayLink[] = [];
afterEach(() => {
  while (opened.length > 0) opened.pop()?.stop();
});

/** Un minuto de reloj de pared simulado, en pasos del intervalo de salud real (250 ms). */
const HEALTH_STEP_MS = 250;
const TEN_MINUTES_MS = 10 * 60_000;

/**
 * Abre el enlace sobre un receptor REMOTO (doble de Realtime) con un reloj
 * inyectado, lo deja diez minutos SIN caja (nadie contesta nunca) y devuelve
 * cuántos `need_snapshot` salieron por el canal, con su instante.
 *
 * El intervalo de salud real se deja en un valor imposible: quien avanza el
 * tiempo es la prueba, llamando `evaluateHealth()` paso a paso. Así el
 * recuento es determinista y no depende de la carga de la máquina.
 */
async function countNeedSnapshots(options: { resnapshotIntervalMs?: number; idleResnapshotIntervalMs?: number }): Promise<number[]> {
  const bus = new RealtimeBus();
  const double = createRealtimeDouble({ bus });
  const receiver = new SupabaseBroadcastReceiver({
    terminalId: TERMINAL,
    channelName: displayChannelName(TERMINAL),
    client: double.client,
    presenceIntervalMs: REMOTE_PRESENCE_INTERVAL_MS,
    staleAfterMs: REMOTE_STALE_AFTER_MS,
  });
  let clock = 0;
  /**
   * Instante (del reloj inyectado) de cada `need_snapshot` que el enlace
   * pide. Se anota aquí y no en `bus.sent` porque el canal publica en un
   * microtask: leyendo solo el bus, todos los envíos quedarían fechados al
   * final del bucle. Cada uno de estos es UN mensaje del canal, y así se
   * comprueba al final contra lo que registró el doble.
   */
  const asked: number[] = [];
  const send = receiver.send.bind(receiver);
  receiver.send = ((msg: Parameters<typeof send>[0]) => {
    if (msg.t === 'need_snapshot') asked.push(clock);
    send(msg);
  }) as typeof receiver.send;
  const link = startDisplayLink({
    receiver,
    capabilities: () => ({ ...CAPS }),
    onChange: () => {},
    now: () => clock,
    staleAfterMs: REMOTE_STALE_AFTER_MS,
    resnapshotIntervalMs: options.resnapshotIntervalMs,
    idleResnapshotIntervalMs: options.idleResnapshotIntervalMs,
    healthIntervalMs: 24 * 60 * 60_000,
    disconnectedToIdleMs: DISCONNECTED_TO_IDLE_MS,
  });
  opened.push(link);
  await flush(); // join del canal: lo encolado sale

  for (let t = HEALTH_STEP_MS; t <= TEN_MINUTES_MS; t += HEALTH_STEP_MS) {
    clock = t;
    link.evaluateHealth();
  }
  await flush();
  // Lo que pidió el enlace es EXACTAMENTE lo que salió por el canal.
  const enElCanal = bus.sent.filter((m) => (m.payload as { t?: string }).t === 'need_snapshot').length;
  expect(enElCanal).toBe(asked.length);
  return asked;
}

describe('F3-B ronda 4 · QA-1: el `need_snapshot` remoto no puede latir al ritmo local', () => {
  it('en remoto: ritmo de la presencia mientras se pinta «Conectando» y uno por minuto una vez en Reposo', async () => {
    const at = await countNeedSnapshots({
      resnapshotIntervalMs: REMOTE_RESNAPSHOT_INTERVAL_MS,
      idleResnapshotIntervalMs: REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS,
    });

    // Primer minuto (el cliente aún puede estar delante: la vista dice
    // «Conectando»): uno al arrancar y uno cada REMOTE_RESNAPSHOT_INTERVAL_MS.
    const primerMinuto = at.filter((t) => t < DISCONNECTED_TO_IDLE_MS);
    expect(primerMinuto.length).toBe(1 + Math.floor((DISCONNECTED_TO_IDLE_MS - 1) / REMOTE_RESNAPSHOT_INTERVAL_MS));
    expect(primerMinuto.length).toBeLessThanOrEqual(13);

    // Pasado DISCONNECTED_TO_IDLE_MS la pantalla ya pinta Reposo: preguntar
    // más no despierta a nadie. Nunca dos preguntas en el mismo minuto.
    const enReposo = at.filter((t) => t >= DISCONNECTED_TO_IDLE_MS);
    expect(enReposo.length).toBeLessThanOrEqual(Math.ceil((TEN_MINUTES_MS - DISCONNECTED_TO_IDLE_MS) / REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS));
    for (let i = 1; i < enReposo.length; i += 1) {
      expect(enReposo[i] - enReposo[i - 1]).toBeGreaterThanOrEqual(REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS);
    }

    // Diez minutos de caja cerrada: decenas de mensajes, no cientos. A 2 s
    // serían 301 (y ~29.000 al día con la tableta encendida toda la noche).
    expect(at.length).toBeLessThanOrEqual(25);
  });

  it('en local NO cambia nada: sigue preguntando cada RESNAPSHOT_INTERVAL_MS (un mensaje de BroadcastChannel no cuesta)', async () => {
    const at = await countNeedSnapshots({});
    expect(at.length).toBe(1 + TEN_MINUTES_MS / RESNAPSHOT_INTERVAL_MS);
  });

  it('las constantes remotas son del orden de la presencia y el retroceso, mayor', () => {
    expect(REMOTE_RESNAPSHOT_INTERVAL_MS).toBeGreaterThanOrEqual(REMOTE_PRESENCE_INTERVAL_MS);
    expect(REMOTE_IDLE_RESNAPSHOT_INTERVAL_MS).toBeGreaterThan(REMOTE_RESNAPSHOT_INTERVAL_MS);
    expect(RESNAPSHOT_INTERVAL_MS).toBe(2_000); // el local se queda como estaba
  });
});

describe('F3-B ronda 4 · QA-2: sin `crypto.subtle` hay huella no criptográfica', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  function sinSubtle() {
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true, writable: true });
  }

  afterEach(() => {
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  });

  function memoryStorage(): RemoteTokenStorage {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => {
        data.set(key, value);
      },
      removeItem: (key) => {
        data.delete(key);
      },
    };
  }

  it('devuelve una huella con prefijo propio, estable y distinta por código', async () => {
    sinSubtle();
    const huella = await pairingCodeFingerprint(CODE);
    expect(huella).not.toBeNull();
    expect(huella!.startsWith(NON_CRYPTO_FINGERPRINT_PREFIX)).toBe(true);
    expect(await pairingCodeFingerprint(CODE)).toBe(huella);
    expect(await pairingCodeFingerprint(OTHER_CODE)).not.toBe(huella);
  });

  it('el quiosco en http sobrevive al reinicio: el `?pair` gastado cae al emparejamiento guardado', async () => {
    sinSubtle();
    const storage = memoryStorage();
    const codeHash = await pairingCodeFingerprint(CODE);
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL, codeHash }, storage)).toBe(true);

    // Reinicio: la URL del quiosco reintenta el MISMO código, ya consumido.
    const stored = readStoredRemoteDisplay(storage);
    expect(stored?.codeHash).toBe(codeHash);
    const noEncontrado: RemoteApiFailure = { ok: false, kind: 'http', status: 404, code: null, retryAfterSeconds: null };
    const decision = resolveRedeemFailure(noEncontrado, stored, codeHash);
    expect(decision.kind).toBe('fallback');
  });

  it('con OTRO código el respaldo sigue sin aplicarse (reapuntar la tableta no puede acabar en silencio)', async () => {
    sinSubtle();
    const storage = memoryStorage();
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL, codeHash: await pairingCodeFingerprint(CODE) }, storage)).toBe(true);
    const decision = resolveRedeemFailure(
      { ok: false, kind: 'http', status: 404, code: null, retryAfterSeconds: null },
      readStoredRemoteDisplay(storage),
      await pairingCodeFingerprint(OTHER_CODE),
    );
    expect(decision.kind).toBe('ask_code');
  });

  it('una huella guardada a mano o corrupta se ignora', () => {
    const storage = memoryStorage();
    expect(saveStoredRemoteDisplay({ token: TOKEN, terminalId: TERMINAL, codeHash: 'fnv1a32:ZZZZ' }, storage)).toBe(true);
    expect(readStoredRemoteDisplay(storage)?.codeHash).toBeUndefined();
  });
});

describe('F3-B ronda 4 · QA-3: `waitForLeave` cancela su temporizador', () => {
  it('limpia el tope cuando gana la salida del canal', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/pos-display/useRemoteDisplay.ts'), 'utf8');
    const fn = src.slice(src.indexOf('function waitForLeave'));
    const cuerpo = fn.slice(0, fn.indexOf('\n}\n') + 3);
    expect(cuerpo).toContain('LEAVE_GRACE_MS');
    expect(cuerpo).toContain('clearTimeout(timer)');
  });
});

describe('F3-B ronda 4 · QA-4: el idioma del comercio llega a la tableta', () => {
  it('devuelve el idioma del bootstrap cuando no es el que hay puesto', () => {
    expect(resolveRemoteLocale('en', 'es')).toBe('en');
    expect(resolveRemoteLocale('PT-BR', 'es')).toBe('pt');
  });

  it('null cuando ya está puesto, cuando no es un idioma de la app o cuando no viene', () => {
    expect(resolveRemoteLocale('es', 'es')).toBeNull();
    expect(resolveRemoteLocale('es-CO', 'es')).toBeNull();
    expect(resolveRemoteLocale('de', 'es')).toBeNull();
    expect(resolveRemoteLocale(null, 'es')).toBeNull();
    expect(resolveRemoteLocale(undefined, 'es')).toBeNull();
    expect(resolveRemoteLocale(42, 'es')).toBeNull();
  });

  it('la pantalla lo aplica al llegar el bootstrap (sin recargar)', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/pos-display/CustomerDisplay.tsx'), 'utf8');
    expect(src).toContain('resolveRemoteLocale');
    expect(src).toContain('changeLanguage');
    expect(src).toContain('bootstrap.locale');
  });
});
