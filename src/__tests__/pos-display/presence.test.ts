/**
 * Presencia de la pantalla vista desde la caja (Parte D): el criterio del
 * indicador verde/gris. Se prueba en puro (fuente simulada) y con el
 * transporte real de la Parte A y el emisor real de la Parte B, que es quien
 * anota `lastDisplaySeenAt` cuando la pantalla (BroadcastChannelReceiver)
 * emite display_alive / need_snapshot / display_bye.
 * Node ≥ 18 expone BroadcastChannel como global. Fixtures ficticios (org 1).
 */

import { BroadcastChannelReceiver, BroadcastChannelTransport, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import {
  DEFAULT_PRESENCE_ENVIRONMENT,
  DISCONNECTED_PRESENCE,
  isDisplayPresent,
  isSamePresence,
  readDisplayPresence,
  resolvePresenceReason,
  type DisplayPresenceSource,
} from '@/lib/pos/display/presence';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-0000-4111-8222-333333333333';
const CAPS = { touch: true, width: 1920, height: 1080 } as const;

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await flush(1);
  }
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.restoreAllMocks();
});

function source(lastDisplaySeenAt: number | null, isEmitting = true): DisplayPresenceSource {
  return { lastDisplaySeenAt, isEmitting };
}

describe('isDisplayPresent', () => {
  it('null nunca está presente', () => {
    expect(isDisplayPresent(null, 1000)).toBe(false);
  });
  it('presente mientras la señal sea más reciente que STALE_AFTER_MS (3 s), igual que «Conectando…»', () => {
    expect(STALE_AFTER_MS).toBe(3000);
    expect(isDisplayPresent(1000, 1000 + STALE_AFTER_MS - 1)).toBe(true);
    expect(isDisplayPresent(1000, 1000 + STALE_AFTER_MS)).toBe(false);
  });
  it('acepta un umbral propio', () => {
    expect(isDisplayPresent(0, 500, 400)).toBe(false);
    expect(isDisplayPresent(0, 300, 400)).toBe(true);
  });
});

describe('readDisplayPresence', () => {
  it('sin transporte (interruptor apagado, entorno cargado y compatible): gris, no emite y reason «disabled»', () => {
    expect(readDisplayPresence(source(null, false), 5000)).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });
    expect(DEFAULT_PRESENCE_ENVIRONMENT).toEqual({ settingsLoaded: true, transportSupported: true });
  });
  it('emitiendo pero sin pantalla: gris y sin motivo', () => {
    expect(readDisplayPresence(source(null, true), 5000)).toEqual({ connected: false, emitting: true, reason: null, lastSeenAt: null });
  });
  it('interruptor aún cargando (sin caché): no emite y reason «loading», nunca «disabled»', () => {
    const snapshot = readDisplayPresence(source(null, false), 5000, STALE_AFTER_MS, { settingsLoaded: false, transportSupported: true });
    expect(snapshot).toEqual({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null });
    // El estado inicial del hook también es «cargando»: el menú no pinta etiqueta hasta saber.
    expect(DISCONNECTED_PRESENCE.reason).toBe('loading');
  });
  it('entorno sin BroadcastChannel: reason «unsupported» aunque el interruptor esté cargado (y encendido)', () => {
    const snapshot = readDisplayPresence(source(null, false), 5000, STALE_AFTER_MS, { settingsLoaded: true, transportSupported: false });
    expect(snapshot.reason).toBe('unsupported');
    // Sin soporte manda sobre «cargando»: es definitivo y Configuración no lo arregla.
    expect(resolvePresenceReason(false, { settingsLoaded: false, transportSupported: false })).toBe('unsupported');
    // Con transporte abierto no hay motivo, diga lo que diga el entorno.
    expect(resolvePresenceReason(true, { settingsLoaded: false, transportSupported: false })).toBeNull();
  });
  it('señal reciente: verde; señal vieja: gris sin mensaje alguno (decide el reloj)', () => {
    expect(readDisplayPresence(source(5000), 5000 + STALE_AFTER_MS - 1).connected).toBe(true);
    expect(readDisplayPresence(source(5000), 5000 + STALE_AFTER_MS).connected).toBe(false);
  });
  it('una fuente que lanza al leerse cuenta como sin pantalla y no rompe la UI', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: DisplayPresenceSource = {
      get lastDisplaySeenAt(): number | null {
        throw new Error('transporte roto');
      },
      isEmitting: true,
    };
    expect(readDisplayPresence(broken, 1)).toEqual(DISCONNECTED_PRESENCE);
    expect(warn).toHaveBeenCalled();
  });
});

describe('isSamePresence', () => {
  it('solo mira lo que se pinta: el latido (lastSeenAt) no cuenta como cambio', () => {
    expect(isSamePresence({ connected: true, emitting: true, reason: null, lastSeenAt: 1 }, { connected: true, emitting: true, reason: null, lastSeenAt: 2 })).toBe(true);
    expect(isSamePresence({ connected: true, emitting: true, reason: null, lastSeenAt: 1 }, { connected: false, emitting: true, reason: null, lastSeenAt: 1 })).toBe(false);
    expect(isSamePresence({ connected: false, emitting: true, reason: null, lastSeenAt: null }, { connected: false, emitting: false, reason: 'disabled', lastSeenAt: null })).toBe(false);
  });
  it('el motivo también se pinta: pasar de «cargando» a «apagada» es un cambio', () => {
    expect(isSamePresence({ connected: false, emitting: false, reason: 'loading', lastSeenAt: null }, { connected: false, emitting: false, reason: 'disabled', lastSeenAt: null })).toBe(false);
    expect(isSamePresence({ connected: false, emitting: false, reason: 'unsupported', lastSeenAt: null }, { connected: false, emitting: false, reason: 'unsupported', lastSeenAt: null })).toBe(true);
  });
});

describe('con el transporte real de la caja (Parte A)', () => {
  /** El transporte no expone isEmitting; el adaptador es lo que hace DisplayEmitter. */
  function asSource(transport: BroadcastChannelTransport): DisplayPresenceSource {
    return {
      get lastDisplaySeenAt() {
        return transport.lastDisplaySeenAt;
      },
      isEmitting: true,
    };
  }

  it('display_alive de la pantalla real pone verde; el silencio lo quita por reloj', async () => {
    let clock = 10_000;
    const transport = track(new BroadcastChannelTransport({ terminalId: TERMINAL, now: () => clock }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000 }));
    display.startPresence({ ...CAPS }); // el primer «estoy» sale ya
    await waitFor(() => transport.lastDisplaySeenAt !== null);

    expect(readDisplayPresence(asSource(transport), clock)).toEqual({ connected: true, emitting: true, reason: null, lastSeenAt: 10_000 });
    clock += STALE_AFTER_MS - 1;
    expect(readDisplayPresence(asSource(transport), clock).connected).toBe(true);
    clock += 1;
    expect(readDisplayPresence(asSource(transport), clock).connected).toBe(false);
  });

  it('need_snapshot también cuenta; display_bye deja gris al instante', async () => {
    const transport = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000 });
    display.send({ t: 'need_snapshot', capabilities: { ...CAPS } });
    await waitFor(() => readDisplayPresence(asSource(transport)).connected);

    display.close(); // emite display_bye
    await waitFor(() => !readDisplayPresence(asSource(transport)).connected);
    expect(transport.lastDisplaySeenAt).toBeNull();
  });

  it('la pantalla de otra terminal no cuenta', async () => {
    const transport = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const other = track(new BroadcastChannelReceiver({ terminalId: OTHER_TERMINAL, presenceIntervalMs: 60_000 }));
    other.startPresence({ ...CAPS });
    await flush(5);
    expect(readDisplayPresence(asSource(transport)).connected).toBe(false);
  });
});

describe('con el emisor real de la caja (Parte B)', () => {
  it('apagado: no emite y queda gris aunque haya pantalla; encendido tras refresh(): verde', async () => {
    let enabled = false;
    const transports: BroadcastChannelTransport[] = [];
    const emitter = new DisplayEmitter({
      createTransport: () => {
        const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
        transports.push(t);
        return t;
      },
      isEnabled: () => enabled,
      schedule: (fn) => {
        const id = setTimeout(fn, 0);
        return () => clearTimeout(id);
      },
    });
    opened.push({ close: () => emitter.stop() });
    emitter.start({ organizationId: 1, currency: 'COP' });

    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 50 }));
    display.startPresence({ ...CAPS });
    await flush(5);
    expect(readDisplayPresence(emitter)).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });

    enabled = true;
    emitter.refresh(); // la tarjeta de configuración acaba de encender el interruptor
    expect(emitter.isEmitting).toBe(true);
    await waitFor(() => readDisplayPresence(emitter).connected);

    enabled = false;
    emitter.refresh(); // y ahora lo apaga: el transporte se cierra y la presencia desaparece
    expect(readDisplayPresence(emitter)).toEqual({ connected: false, emitting: false, reason: 'disabled', lastSeenAt: null });
  });
});
