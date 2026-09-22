/**
 * Fase 3, parte C · ronda 5 (correcciones del QA y del tester de la ronda 4).
 *
 * 1. Las CAPACIDADES caducan: una tableta táctil que muere sin despedirse deja
 *    de contar en cuanto la presencia la da por muerta.
 * 2. «Revocar» corta el flujo desde la CAJA: la pata remota queda muda y sorda
 *    y no la reabre ninguna señal hasta un emparejamiento nuevo.
 * 3. El `display_bye` del tubo remoto va FIRMADO con la instancia de la caja:
 *    uno anónimo ni duerme la pata ni borra la presencia.
 * 4. y 5. Cubos de tasa: carril lento del canje y cubo de intentos del emisor
 *    de códigos (las constantes; el comportamiento de las rutas va en
 *    f3a-display-routes / f3b-ronda3-rutas / tester-f3c-r2-rutas).
 *
 * Sin React, sin Supabase, sin DOM: canales falsos y transporte real.
 */

import { createCajaDisplayChannel } from '@/lib/pos/display/cajaChannel';
import { createFanOutDisplayChannel, createListenerGatedChannel, upMessageListenerGate } from '@/lib/pos/display/multiChannel';
import { combineLiveDisplayCapabilities, readDisplayPresenceView } from '@/lib/pos/display/presence';
import { isAuthenticatedDisplayBye, PROTOCOL_VERSION, type DisplayCapabilities, type UpMessage } from '@/lib/pos/display/protocol';
import {
  applyRemoteDisplayRevocationEvent,
  clearRemoteDisplayRevoked,
  isRemoteDisplayRevoked,
  markRemoteDisplayRevoked,
  onRemoteDisplayRevocationChange,
  parseRevocationMark,
  REMOTE_DISPLAY_PAIRING_KEY,
  REMOTE_DISPLAY_REVOKED_KEY,
  resetRemoteDisplayRevocations,
} from '@/lib/pos/display/revocation';
import {
  PAIRING_CODE_ATTEMPT_RATE_LIMIT,
  PAIRING_CODE_RATE_LIMIT,
  PAIR_GLOBAL_RATE_LIMIT,
  PAIR_GLOBAL_SLOW_RATE_LIMIT,
  pairingCodeAttemptRateLimitKey,
  pairingCodeRateLimitKey,
} from '@/lib/pos/display/server/displayTokens';
import { BroadcastChannelReceiver, BroadcastChannelTransport, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const MONITOR: DisplayCapabilities = { touch: false, width: 1920, height: 1080 };
const TABLETA: DisplayCapabilities = { touch: true, width: 800, height: 1280 };

class FakeChannel implements DisplayChannel {
  posted: unknown[] = [];
  closed = false;
  onmessage: ((event: DisplayChannelEvent) => void) | null = null;
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  inject(data: unknown, origin?: 'local' | 'remote'): void {
    this.onmessage?.({ data, origin });
  }
}

const alive = (at: number, capabilities: DisplayCapabilities): unknown => ({
  v: PROTOCOL_VERSION,
  terminalId: TERMINAL,
  t: 'display_alive',
  at,
  capabilities,
});

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  resetRemoteDisplayRevocations();
});

// ---------------------------------------------------------------------------
// 1. Las capacidades caducan con la presencia (qa/tester · alto)
// ---------------------------------------------------------------------------

describe('combineLiveDisplayCapabilities · solo cuentan los orígenes vivos', () => {
  const porOrigen = { local: MONITOR, remote: TABLETA } as const;

  it('sin ningún origen vivo no se cree nada, aunque el transporte recuerde las dos', () => {
    expect(combineLiveDisplayCapabilities(porOrigen, { ...TABLETA }, [])).toBeNull();
    expect(combineLiveDisplayCapabilities(porOrigen, { ...TABLETA }, undefined)).toBeNull();
  });

  it('con la tableta muerta queda el monitor: el táctil deja de prometerse', () => {
    expect(combineLiveDisplayCapabilities(porOrigen, { ...TABLETA }, ['local'])).toEqual(MONITOR);
  });

  it('con las dos vivas el táctil de la tableta manda (nunca se promete de menos)', () => {
    expect(combineLiveDisplayCapabilities(porOrigen, null, ['local', 'remote'])).toEqual({ ...MONITOR, touch: true });
    expect(combineLiveDisplayCapabilities(porOrigen, null, ['remote'])).toEqual(TABLETA);
  });

  it('sin mapa por origen (emisor de F0–F2) se usa la combinación de siempre mientras haya alguien vivo', () => {
    expect(combineLiveDisplayCapabilities(null, MONITOR, ['local'])).toEqual(MONITOR);
    expect(combineLiveDisplayCapabilities(undefined, MONITOR, ['local'])).toEqual(MONITOR);
    expect(combineLiveDisplayCapabilities(null, MONITOR, [])).toBeNull();
  });

  it('el emisor publica el mapa por origen y la presencia decide quién sigue vivo', () => {
    let ahora = 10_000;
    const local = new FakeChannel();
    const remote = new FakeChannel();
    const transport = new BroadcastChannelTransport({
      terminalId: TERMINAL,
      now: () => ahora,
      channelFactory: () =>
        createFanOutDisplayChannel([
          { origin: 'local', channel: local },
          { origin: 'remote', channel: remote },
        ]),
    });
    local.inject(alive(1, MONITOR));
    remote.inject(alive(1, TABLETA));
    ahora += 10 * 60_000;
    local.inject(alive(2, MONITOR));

    const vista = readDisplayPresenceView(
      { isEmitting: true, lastDisplaySeenAt: transport.lastDisplaySeenAt, lastDisplaySeenByOrigin: transport.lastDisplaySeenByOrigin },
      ahora,
    );
    expect(vista.origins).toEqual(['local']);
    expect(combineLiveDisplayCapabilities(transport.lastDisplayCapabilitiesByOrigin, transport.lastDisplayCapabilities, vista.origins)).toEqual(MONITOR);
    transport.close();
  });
});

// ---------------------------------------------------------------------------
// 2. «Revocar» corta desde la caja (qa · alto)
// ---------------------------------------------------------------------------

describe('pestillo de revocación · la pata remota queda muda y sorda', () => {
  function armar() {
    let ahora = 1_000;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, {
      now: () => ahora,
      gate: upMessageListenerGate(TERMINAL, () => 'inst-caja'),
      beatIntervalMs: 0,
    });
    const recibido: unknown[] = [];
    gated.onmessage = (event) => recibido.push(event.data);
    return { inner, gated, recibido, avanzar: (ms: number) => (ahora += ms) };
  }

  it('revocada: no publica, no entrega y ninguna señal la reabre', () => {
    const { inner, gated, recibido } = armar();
    inner.inject(alive(1, TABLETA), 'remote');
    gated.postMessage({ t: 'state' });
    expect(inner.posted).toHaveLength(1);

    gated.revokeListener();
    expect(gated.isListenerRevoked).toBe(true);
    expect(gated.hasListener).toBe(false);

    // Una tableta que ignora su 401 sigue latiendo con el JWT en la mano.
    inner.inject(alive(2, TABLETA), 'remote');
    expect(gated.hasListener).toBe(false);
    expect(recibido).toHaveLength(1); // el segundo latido ni se entrega: la presencia remota caduca
    gated.postMessage({ t: 'state' });
    gated.postMessage({ t: 'hello' });
    expect(inner.posted).toHaveLength(1); // ni carrito, ni saludo, ni el payload del QR
  });

  it('con un emparejamiento nuevo se suelta el pestillo y la pata vuelve a su ciclo', () => {
    const { inner, gated } = armar();
    gated.revokeListener();
    inner.inject(alive(1, TABLETA), 'remote');
    expect(gated.hasListener).toBe(false);

    gated.allowListener();
    expect(gated.isListenerRevoked).toBe(false);
    inner.inject(alive(2, TABLETA), 'remote');
    expect(gated.hasListener).toBe(true);
    gated.postMessage({ t: 'state' });
    expect(inner.posted).toHaveLength(1);
  });
});

describe('revocation.ts · el pestillo por terminal', () => {
  it('marcar y soltar avisa a quien escuche, y solo con cambio real', () => {
    const avisos: Array<[string, boolean]> = [];
    const baja = onRemoteDisplayRevocationChange((id, revoked) => avisos.push([id, revoked]));
    expect(isRemoteDisplayRevoked(TERMINAL)).toBe(false);

    markRemoteDisplayRevoked(TERMINAL, null);
    markRemoteDisplayRevoked(TERMINAL, null); // idempotente
    expect(isRemoteDisplayRevoked(TERMINAL)).toBe(true);
    clearRemoteDisplayRevoked(TERMINAL, null);
    clearRemoteDisplayRevoked(TERMINAL, null);
    expect(isRemoteDisplayRevoked(TERMINAL)).toBe(false);
    expect(avisos).toEqual([
      [TERMINAL, true],
      [TERMINAL, false],
    ]);
    baja();
  });

  it('la marca de localStorage lleva el id y un instante, y se vuelve a leer', () => {
    const guardado: Array<[string, string]> = [];
    markRemoteDisplayRevoked(TERMINAL, { setItem: (k, v) => guardado.push([k, v]) });
    expect(guardado[0][0]).toBe(REMOTE_DISPLAY_REVOKED_KEY);
    expect(parseRevocationMark(guardado[0][1])).toBe(TERMINAL);
    expect(parseRevocationMark(null)).toBeNull();
    expect(parseRevocationMark('')).toBeNull();
  });

  it('el evento `storage` de otra ventana aplica la revocación y el emparejamiento', () => {
    applyRemoteDisplayRevocationEvent({ key: REMOTE_DISPLAY_REVOKED_KEY, newValue: `${TERMINAL}:1` });
    expect(isRemoteDisplayRevoked(TERMINAL)).toBe(true);
    applyRemoteDisplayRevocationEvent({ key: REMOTE_DISPLAY_PAIRING_KEY, newValue: `${TERMINAL}:2` });
    expect(isRemoteDisplayRevoked(TERMINAL)).toBe(false);
    // Otra clave (el interruptor maestro) no toca nada.
    applyRemoteDisplayRevocationEvent({ key: 'pos_customer_display_changed', newValue: `${TERMINAL}:3` });
    expect(isRemoteDisplayRevoked(TERMINAL)).toBe(false);
  });

  it('un storage bloqueado no impide aplicar el pestillo en memoria', () => {
    const roto = {
      setItem() {
        throw new Error('storage bloqueado');
      },
    };
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => markRemoteDisplayRevoked(TERMINAL, roto)).not.toThrow();
    warn.mockRestore();
    expect(isRemoteDisplayRevoked(TERMINAL)).toBe(true);
  });
});

describe('cajaChannel · el pestillo llega a la pata remota de verdad', () => {
  interface CanalFalso {
    name: string;
    sent: Array<{ event: string; payload: unknown }>;
    listeners: Map<string, (m: { payload?: unknown }) => void>;
  }

  function fakeRealtime() {
    const channels: CanalFalso[] = [];
    const client = {
      channel(name: string) {
        const entry: CanalFalso = { name, sent: [], listeners: new Map() };
        channels.push(entry);
        const ch = {
          on: (_t: string, filter: { event: string }, cb: (m: { payload?: unknown }) => void) => {
            entry.listeners.set(filter.event, cb);
            return ch;
          },
          send: async (args: { event: string; payload: unknown }) => {
            entry.sent.push({ event: args.event, payload: args.payload });
            return 'ok';
          },
          subscribe: (cb?: (status: string) => void) => {
            cb?.('SUBSCRIBED');
            return ch;
          },
          unsubscribe: async () => 'ok',
        };
        return ch;
      },
      removeChannel: async () => 'ok',
    };
    return { channels, client: client as never };
  }

  /** Despierta la pata remota con un `display_alive` legítimo por el canal de Supabase. */
  function despertar(entry: CanalFalso) {
    const listener = [...entry.listeners.values()][0];
    listener?.({ payload: alive(1, TABLETA) });
  }

  it('revocar con la pata YA colgada la cierra en el acto, sin recargar la caja', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
    });
    expect(await canal.remoteAttached).toBe(true);
    const entry = rt.channels[0];
    expect(entry.name).toBe(`pos-display:${TERMINAL}`);

    despertar(entry);
    canal.postMessage({ v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: 'i1', t: 'state', state: { mode: 'order' } });
    expect(entry.sent).toHaveLength(1);

    // El administrador revoca desde esta misma ventana (o desde otra: el evento
    // `storage` acaba llamando a lo mismo).
    markRemoteDisplayRevoked(TERMINAL, null);
    despertar(entry); // la tableta ignora su 401 y sigue latiendo
    canal.postMessage({ v: PROTOCOL_VERSION, seq: 2, terminalId: TERMINAL, instanceId: 'i1', t: 'state', state: { mode: 'payment' } });
    // Nada más sale hacia el dispositivo revocado: ni carrito, ni totales, ni el payload del QR.
    expect(entry.sent.map((m) => (m.payload as { seq: number }).seq)).toEqual([1]);

    // Un emparejamiento nuevo la vuelve a abrir: al despertar repone el carrito
    // retenido (el de ahora, seq 2) y a partir de ahí publica con normalidad.
    clearRemoteDisplayRevoked(TERMINAL, null);
    despertar(entry);
    canal.postMessage({ v: PROTOCOL_VERSION, seq: 3, terminalId: TERMINAL, instanceId: 'i1', t: 'state', state: { mode: 'order' } });
    expect(entry.sent.map((m) => (m.payload as { seq: number }).seq)).toEqual([1, 2, 3]);

    canal.close();
    await flush();
  });

  it('con la terminal ya revocada, la pata nace cerrada y no publica aunque la tableta hable', async () => {
    markRemoteDisplayRevoked(TERMINAL, null);
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
    });
    expect(await canal.remoteAttached).toBe(true);
    const entry = rt.channels[0];
    despertar(entry);
    canal.postMessage({ v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: 'i1', t: 'state', state: { mode: 'order' } });
    expect(entry.sent).toHaveLength(0);
    canal.close();
    await flush();
  });

  it('cerrada la pata, un aviso posterior no lanza (la baja quitó al oyente)', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
    });
    await canal.remoteAttached;
    canal.close();
    await flush();
    expect(() => markRemoteDisplayRevoked(TERMINAL, null)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 3. El `display_bye` firmado (qa/tester · medio)
// ---------------------------------------------------------------------------

describe('display_bye firmado con la instancia de la caja', () => {
  it('isAuthenticatedDisplayBye exige la firma exacta y una instancia conocida', () => {
    const bye = { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye' } as UpMessage;
    const firmado = { ...bye, ackInstanceId: 'inst-1' } as UpMessage;
    expect(isAuthenticatedDisplayBye(bye, 'inst-1')).toBe(false);
    expect(isAuthenticatedDisplayBye(firmado, 'inst-1')).toBe(true);
    expect(isAuthenticatedDisplayBye(firmado, 'inst-2')).toBe(false);
    expect(isAuthenticatedDisplayBye(firmado, null)).toBe(false);
    expect(isAuthenticatedDisplayBye({ ...firmado, t: 'display_alive' } as UpMessage, 'inst-1')).toBe(false);
  });

  it('la PANTALLA firma su despedida con la caja que seguía, y no la dirige a nadie', () => {
    const canal = new FakeChannel();
    const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, channelFactory: () => canal });
    // Adopta la instancia de la caja con su hello.
    canal.inject({ v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: 'inst-caja', t: 'hello', organizationId: 120, cashier: null, sessionOpen: true });
    expect(receiver.activeInstanceId).toBe('inst-caja');

    receiver.close();
    const despedida = canal.posted.at(-1) as { t: string; ackInstanceId?: string; toInstanceId?: string };
    expect(despedida.t).toBe('display_bye');
    expect(despedida.ackInstanceId).toBe('inst-caja');
    // Sigue siendo presencia: llega a todas las pestañas de la terminal.
    expect(despedida.toInstanceId).toBeUndefined();
  });

  it('sin caja adoptada la despedida sale sin firma, y la caja la ignorará por el tubo remoto', () => {
    const canal = new FakeChannel();
    const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, channelFactory: () => canal });
    receiver.close();
    const despedida = canal.posted.at(-1) as { t: string; ackInstanceId?: string };
    expect(despedida.t).toBe('display_bye');
    expect(despedida.ackInstanceId).toBeUndefined();
  });

  it('el tubo LOCAL sigue aceptando la despedida sin firma (F0–F2 no cambian)', () => {
    const local = new FakeChannel();
    const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => local });
    local.inject(alive(1, MONITOR));
    expect(transport.lastDisplaySeenAt).not.toBeNull();
    local.inject({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye' });
    expect(transport.lastDisplaySeenAt).toBeNull();
    transport.close();
  });
});

// ---------------------------------------------------------------------------
// 4 y 5. Cubos de tasa (qa · medio / bajo)
// ---------------------------------------------------------------------------

describe('cubos de tasa de la fase', () => {
  it('el carril lento del canje es estrecho y de ventana corta: el techo de conjeturas sube poco', () => {
    expect(PAIR_GLOBAL_SLOW_RATE_LIMIT.windowMs).toBe(PAIR_GLOBAL_RATE_LIMIT.windowMs);
    expect(PAIR_GLOBAL_SLOW_RATE_LIMIT.limit).toBeGreaterThan(0);
    // Como mucho un 20 % más de intentos por ventana que el cubo global.
    expect(PAIR_GLOBAL_SLOW_RATE_LIMIT.limit).toBeLessThanOrEqual(PAIR_GLOBAL_RATE_LIMIT.limit * 0.2);
  });

  it('el cubo de INTENTOS del emisor de códigos tiene clave propia y no le quita cupo al administrador', () => {
    expect(pairingCodeAttemptRateLimitKey(120, 'u-1')).not.toBe(pairingCodeRateLimitKey(120, 'u-1'));
    expect(pairingCodeAttemptRateLimitKey(120, 'u-1')).not.toBe(pairingCodeAttemptRateLimitKey(121, 'u-1'));
    expect(pairingCodeAttemptRateLimitKey(120, 'u-1')).not.toBe(pairingCodeAttemptRateLimitKey(120, 'u-2'));
    // Un administrador real nunca lo alcanza: sus códigos caben de sobra dentro de los intentos.
    expect(PAIRING_CODE_ATTEMPT_RATE_LIMIT.windowMs).toBe(PAIRING_CODE_RATE_LIMIT.windowMs);
    expect(PAIRING_CODE_ATTEMPT_RATE_LIMIT.limit).toBeGreaterThan(PAIRING_CODE_RATE_LIMIT.limit);
  });
});
