/**
 * Fase 3, parte C (lado caja): un sobre por dos tubos.
 *
 * 1. createFanOutDisplayChannel: reparte, etiqueta el origen, aísla fallos,
 *    admite patas tardías y cierra todo.
 * 2. createListenerGatedChannel: la pata remota solo publica mientras hay
 *    oyente; `display_bye` la duerme; el TTL la duerme; la respuesta a un
 *    need_snapshot en la misma vuelta sale.
 * 3. BroadcastChannelTransport sobre el canal compuesto: UN solo seq y UNA
 *    instancia para las dos patas; presencia por origen.
 * 4. DisplayEmitter con «dos transportes» (dos tubos): hello + state a ambos
 *    con el mismo seq; need_snapshot por la pata remota → announce a ambas;
 *    `lastDisplaySeenByOrigin` del emisor.
 * 5. createCajaDisplayChannel con dobles de Supabase: sin cliente / sin
 *    terminal registrada → solo local; registrada → pata remota con
 *    compuerta; cierre antes de resolver → sin pata; cierre → unsubscribe.
 */

import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { createFanOutDisplayChannel, createListenerGatedChannel, REMOTE_LISTENER_TTL_MS } from '@/lib/pos/display/multiChannel';
import { createCajaDisplayChannel } from '@/lib/pos/display/cajaChannel';
import {
  DISPLAY_DOWN_EVENT,
  DISPLAY_UP_EVENT,
  REMOTE_BEAT_INTERVAL_MS,
  REMOTE_PRESENCE_INTERVAL_MS,
  REMOTE_STALE_AFTER_MS,
  type SupabaseChannelLike,
  type SupabaseClientLike,
} from '@/lib/pos/display/supabaseBroadcastTransport';
import { PROTOCOL_VERSION, type DownMessage, type UpMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelTransport, toDisplayLinkOrigin, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const CAPS = { touch: false, width: 1024, height: 768 };

/** Canal falso: guarda lo publicado y permite inyectar mensajes «del otro lado». */
class FakeChannel implements DisplayChannel {
  posted: unknown[] = [];
  onmessage: ((event: DisplayChannelEvent) => void) | null = null;
  closed = false;
  throwOnPost = false;
  postMessage(msg: unknown): void {
    if (this.throwOnPost) throw new Error('tubo roto');
    this.posted.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  /** Lo que llegaría por este tubo desde la pantalla. */
  inject(data: unknown, origin?: 'local' | 'remote'): void {
    this.onmessage?.(origin ? { data, origin } : { data });
  }
}

const up = (t: UpMessage['t'], extra: Record<string, unknown> = {}): UpMessage =>
  ({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t, at: 1, capabilities: CAPS, ...extra }) as unknown as UpMessage;

const seqs = (posted: unknown[]) => posted.map((m) => (m as DownMessage).seq);
const types = (posted: unknown[]) => posted.map((m) => (m as DownMessage).t);

function manualScheduler() {
  let queued: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      queued = fn;
      return () => {
        queued = null;
      };
    },
    flush: () => {
      const fn = queued;
      queued = null;
      fn?.();
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Fan-out
// ---------------------------------------------------------------------------

describe('createFanOutDisplayChannel', () => {
  it('publica el MISMO objeto por todas las patas y entrega lo que vuelve con el origen de la pata', () => {
    const local = new FakeChannel();
    const remote = new FakeChannel();
    const fanOut = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: remote },
    ]);
    const received: DisplayChannelEvent[] = [];
    fanOut.onmessage = (e) => received.push(e);

    const msg = { t: 'heartbeat', seq: 1 };
    fanOut.postMessage(msg);
    expect(local.posted).toEqual([msg]);
    expect(remote.posted).toEqual([msg]);
    expect(fanOut.origins).toEqual(['local', 'remote']);

    remote.inject({ t: 'display_alive' });
    local.inject({ t: 'need_snapshot' });
    expect(received).toEqual([
      { data: { t: 'display_alive' }, origin: 'remote' },
      { data: { t: 'need_snapshot' }, origin: 'local' },
    ]);
  });

  it('la pata decide el origen: una etiqueta que traiga el tubo (o el `origin` URL de un MessageEvent) no la pisa', () => {
    const remote = new FakeChannel();
    const fanOut = createFanOutDisplayChannel([{ origin: 'remote', channel: remote }]);
    const received: DisplayChannelEvent[] = [];
    fanOut.onmessage = (e) => received.push(e);
    remote.inject({ t: 'display_alive' }, 'local');
    expect(received[0].origin).toBe('remote');
    expect(toDisplayLinkOrigin('http://localhost:3000')).toBe('local');
    expect(toDisplayLinkOrigin(undefined)).toBe('local');
    expect(toDisplayLinkOrigin('remote')).toBe('remote');
  });

  it('una pata que lanza al publicar no calla a la otra (aviso en consola, nunca excepción)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const local = new FakeChannel();
    const remote = new FakeChannel();
    remote.throwOnPost = true;
    const fanOut = createFanOutDisplayChannel([
      { origin: 'remote', channel: remote },
      { origin: 'local', channel: local },
    ]);
    expect(() => fanOut.postMessage({ t: 'state' })).not.toThrow();
    expect(local.posted).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('addLeg después de abrir: la pata nueva recibe lo siguiente y entrega con su origen; tras close() se cierra en el acto y no se cuelga', () => {
    const local = new FakeChannel();
    const fanOut = createFanOutDisplayChannel([{ origin: 'local', channel: local }]);
    fanOut.postMessage('a');
    const remote = new FakeChannel();
    expect(fanOut.addLeg({ origin: 'remote', channel: remote })).toBe(true);
    fanOut.postMessage('b');
    expect(local.posted).toEqual(['a', 'b']);
    expect(remote.posted).toEqual(['b']);

    fanOut.close();
    expect(fanOut.isClosed).toBe(true);
    expect(local.closed).toBe(true);
    expect(remote.closed).toBe(true);
    expect(local.onmessage).toBeNull();
    expect(fanOut.origins).toEqual([]);

    const late = new FakeChannel();
    expect(fanOut.addLeg({ origin: 'remote', channel: late })).toBe(false);
    expect(late.closed).toBe(true);
    fanOut.postMessage('c');
    expect(late.posted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Compuerta de oyente
// ---------------------------------------------------------------------------

describe('createListenerGatedChannel', () => {
  it('duerme por defecto: nada sale hasta que el otro lado habla; luego publica hasta el TTL; display_bye la duerme en el acto', () => {
    let now = 1_000;
    const inner = new FakeChannel();
    // `beatIntervalMs: 0` desactiva el ritmo del tubo: aquí se prueba solo la compuerta.
    const gated = createListenerGatedChannel(inner, { now: () => now, listenerTtlMs: 5_000, beatIntervalMs: 0 });
    const received: DisplayChannelEvent[] = [];
    gated.onmessage = (e) => received.push(e);

    gated.postMessage({ t: 'heartbeat' });
    expect(inner.posted).toEqual([]);
    expect(gated.hasListener).toBe(false);

    // La compuerta solo la mueve un `UpMessage` bien formado (ronda 2 · 3).
    inner.inject(up('display_alive'), 'remote');
    expect(received).toEqual([{ data: up('display_alive'), origin: 'remote' }]);
    expect(gated.hasListener).toBe(true);
    expect(gated.listenerUntil).toBe(6_000);
    gated.postMessage({ t: 'state' });
    expect(inner.posted).toEqual([{ t: 'state' }]);

    now = 5_999;
    gated.postMessage({ t: 'heartbeat' });
    expect(inner.posted).toHaveLength(2);
    now = 6_000;
    gated.postMessage({ t: 'heartbeat' });
    expect(inner.posted).toHaveLength(2);
    expect(gated.hasListener).toBe(false);

    inner.inject(up('need_snapshot'));
    expect(gated.hasListener).toBe(true);
    inner.inject(up('display_bye'));
    expect(gated.hasListener).toBe(false);
    gated.postMessage({ t: 'bye' });
    expect(inner.posted).toHaveLength(2);
  });

  it('la compuerta se abre ANTES de entregar: la respuesta a need_snapshot en la misma vuelta sale por el tubo', () => {
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => 0 });
    gated.onmessage = () => gated.postMessage({ t: 'hello' });
    inner.inject(up('need_snapshot'));
    expect(inner.posted).toEqual([{ t: 'hello' }]);
  });

  it('close(): cierra el tubo interior, suelta el handler y no publica ni entrega más; el TTL por defecto son 3 latidos remotos', () => {
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner);
    const received: unknown[] = [];
    gated.onmessage = (e) => received.push(e.data);
    inner.inject(up('display_alive'));
    gated.close();
    expect(inner.closed).toBe(true);
    expect(gated.onmessage).toBeNull();
    expect(gated.hasListener).toBe(false);
    gated.postMessage({ t: 'state' });
    expect(inner.posted).toEqual([]);
    inner.inject(up('display_alive'));
    expect(received).toHaveLength(1);
    // El TTL se deriva del ritmo remoto (ronda 3 · 3): tres latidos, el mismo
    // margen que en local, y nunca por debajo del silencio que la tableta tolera.
    expect(REMOTE_LISTENER_TTL_MS).toBe(3 * REMOTE_PRESENCE_INTERVAL_MS);
    expect(REMOTE_LISTENER_TTL_MS).toBeGreaterThanOrEqual(REMOTE_STALE_AFTER_MS);
  });
});

// ---------------------------------------------------------------------------
// 3. Transporte sobre el canal compuesto: un seq, una instancia, presencia por origen
// ---------------------------------------------------------------------------

describe('BroadcastChannelTransport sobre el canal compuesto', () => {
  function build(now: () => number) {
    const local = new FakeChannel();
    const remote = new FakeChannel();
    const transport = new BroadcastChannelTransport({
      terminalId: TERMINAL,
      now,
      __testInstanceId: 'inst-1',
      channelFactory: () =>
        createFanOutDisplayChannel([
          { origin: 'local', channel: local },
          { origin: 'remote', channel: remote },
        ]),
    });
    return { local, remote, transport };
  }

  it('un solo contador: los dos tubos reciben sobres idénticos con seq 1, 2, 3… y el mismo instanceId', () => {
    const { local, remote, transport } = build(() => 0);
    transport.publish({ t: 'heartbeat', at: 0 });
    transport.announce({ t: 'hello', organizationId: 120, cashier: null, sessionOpen: false }, { mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    transport.close();
    expect(seqs(local.posted)).toEqual([1, 2, 3, 4]);
    expect(seqs(remote.posted)).toEqual([1, 2, 3, 4]);
    expect(types(remote.posted)).toEqual(['heartbeat', 'hello', 'state', 'bye']);
    expect(local.posted).toEqual(remote.posted);
    for (const m of remote.posted as DownMessage[]) {
      expect(m.instanceId).toBe('inst-1');
      expect(m.terminalId).toBe(TERMINAL);
      expect(m.v).toBe(PROTOCOL_VERSION);
    }
  });

  it('presencia por origen: display_alive remoto y local se anotan aparte; lastDisplaySeenAt es la más reciente; display_bye solo borra su origen', () => {
    let now = 10_000;
    const { local, remote, transport } = build(() => now);
    expect(transport.lastDisplaySeenByOrigin).toEqual({ local: null, remote: null });
    expect(transport.lastDisplaySeenAt).toBeNull();

    remote.inject(up('display_alive'));
    expect(transport.lastDisplaySeenByOrigin).toEqual({ local: null, remote: 10_000 });
    expect(transport.lastDisplaySeenAt).toBe(10_000);

    now = 10_500;
    local.inject(up('need_snapshot'));
    expect(transport.lastDisplaySeenByOrigin).toEqual({ local: 10_500, remote: 10_000 });
    expect(transport.lastDisplaySeenAt).toBe(10_500);

    // Firmada con la instancia de esta caja (F3-C ronda 5 · 3): por el tubo remoto
    // una despedida anónima no borra nada, solo deja de renovar.
    remote.inject(up('display_bye', { ackInstanceId: 'inst-1' }));
    expect(transport.lastDisplaySeenByOrigin).toEqual({ local: 10_500, remote: null });
    expect(transport.lastDisplaySeenAt).toBe(10_500);

    local.inject(up('display_bye'));
    expect(transport.lastDisplaySeenAt).toBeNull();
    // El getter devuelve una copia: mutarla no toca la cuenta.
    const copy = transport.lastDisplaySeenByOrigin as Record<string, number | null>;
    copy.local = 1;
    expect(transport.lastDisplaySeenByOrigin.local).toBeNull();
    transport.close();
  });

  it('sin etiqueta de origen (BroadcastChannel a secas) todo cuenta como local: F0–F2 no cambian', () => {
    const plain = new FakeChannel();
    const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, now: () => 7, channelFactory: () => plain });
    plain.inject(up('display_alive'));
    expect(transport.lastDisplaySeenByOrigin).toEqual({ local: 7, remote: null });
    expect(transport.lastDisplaySeenAt).toBe(7);
    transport.close();
  });
});

// ---------------------------------------------------------------------------
// 4. Emisor con dos tubos
// ---------------------------------------------------------------------------

describe('DisplayEmitter con dos transportes (un solo seq, ambos reciben)', () => {
  function harness() {
    const local = new FakeChannel();
    const remote = new FakeChannel();
    let now = 1_000;
    const sched = manualScheduler();
    let transport: BroadcastChannelTransport | null = null;
    const emitter = new DisplayEmitter({
      isEnabled: () => true,
      schedule: sched.schedule,
      isVisible: () => true,
      createTransport: () => {
        transport = new BroadcastChannelTransport({
          terminalId: TERMINAL,
          now: () => now,
          heartbeatIntervalMs: 60_000,
          channelFactory: () =>
            createFanOutDisplayChannel([
              { origin: 'local', channel: local },
              { origin: 'remote', channel: remote },
            ]),
        });
        return transport;
      },
    });
    return { emitter, local, remote, sched, setNow: (n: number) => (now = n), transport: () => transport! };
  }

  it('start(): hello + state llegan a los dos tubos con seq 1 y 2; need_snapshot por el tubo remoto → announce a AMBOS con seq 3 y 4', () => {
    const h = harness();
    h.emitter.start({ organizationId: 120, currency: 'COP' });
    expect(types(h.local.posted)).toEqual(['hello', 'state']);
    expect(types(h.remote.posted)).toEqual(['hello', 'state']);
    expect(seqs(h.local.posted)).toEqual([1, 2]);
    expect(seqs(h.remote.posted)).toEqual([1, 2]);

    h.remote.inject(up('need_snapshot'));
    expect(seqs(h.local.posted)).toEqual([1, 2, 3, 4]);
    expect(seqs(h.remote.posted)).toEqual([1, 2, 3, 4]);
    expect(h.local.posted).toEqual(h.remote.posted);
    expect(h.emitter.emittedStateCount).toBe(2);
    h.emitter.stop();
    expect(types(h.remote.posted).at(-1)).toBe('bye');
    expect(types(h.local.posted).at(-1)).toBe('bye');
  });

  it('lastDisplaySeenByOrigin del emisor sigue al transporte: alive remoto → remote; alive local → ambos; sin transporte → null', () => {
    const h = harness();
    expect(h.emitter.lastDisplaySeenByOrigin).toBeNull();
    h.emitter.start({ organizationId: 120, currency: 'COP' });
    expect(h.emitter.lastDisplaySeenByOrigin).toEqual({ local: null, remote: null });
    h.remote.inject(up('display_alive'));
    expect(h.emitter.lastDisplaySeenByOrigin).toEqual({ local: null, remote: 1_000 });
    h.setNow(1_400);
    h.local.inject(up('display_alive'));
    expect(h.emitter.lastDisplaySeenByOrigin).toEqual({ local: 1_400, remote: 1_000 });
    expect(h.emitter.lastDisplaySeenAt).toBe(1_400);
    h.emitter.stop();
    expect(h.emitter.lastDisplaySeenByOrigin).toBeNull();
  });

  it('un transporte SIN orígenes (doble de F0) se lee como local a partir de lastDisplaySeenAt', () => {
    const emitter = new DisplayEmitter({
      isEnabled: () => true,
      schedule: manualScheduler().schedule,
      createTransport: () => ({
        publish: () => undefined,
        announce: () => undefined,
        onUp: () => () => undefined,
        startHeartbeat: () => undefined,
        stopHeartbeat: () => undefined,
        close: () => undefined,
        lastDisplaySeenAt: 42,
      }),
    });
    emitter.start({ organizationId: 120, currency: 'COP' });
    expect(emitter.lastDisplaySeenByOrigin).toEqual({ local: 42, remote: null });
    emitter.stop();
  });
});

// ---------------------------------------------------------------------------
// 5. createCajaDisplayChannel con dobles de Supabase
// ---------------------------------------------------------------------------

interface FakeRealtime {
  client: SupabaseClientLike;
  channels: Array<{
    name: string;
    opts: unknown;
    sent: Array<{ event: string; payload: unknown }>;
    listeners: Map<string, (message: { payload?: unknown }) => void>;
    subscribeCb: ((status: string, err?: Error) => void) | null;
    unsubscribed: number;
  }>;
  removed: number;
}

function fakeRealtime(): FakeRealtime {
  const fake: FakeRealtime = { channels: [], removed: 0, client: null as unknown as SupabaseClientLike };
  fake.client = {
    channel(name, opts) {
      const entry: FakeRealtime['channels'][number] = { name, opts, sent: [], listeners: new Map(), subscribeCb: null, unsubscribed: 0 };
      fake.channels.push(entry);
      const ch: SupabaseChannelLike = {
        on: (_type, filter, cb) => {
          entry.listeners.set(filter.event, cb);
          return ch;
        },
        send: async (args) => {
          entry.sent.push({ event: args.event, payload: args.payload });
          return 'ok';
        },
        subscribe: (cb) => {
          entry.subscribeCb = cb ?? null;
          return ch;
        },
        unsubscribe: async () => {
          entry.unsubscribed += 1;
          return 'ok';
        },
      };
      return ch;
    },
    removeChannel: async () => {
      fake.removed += 1;
      return 'ok';
    },
  };
  return fake;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('createCajaDisplayChannel', () => {
  it('sin cliente Realtime (doble de prueba, SSR): solo la pata local, y remoteAttached resuelve false', async () => {
    const local = new FakeChannel();
    const isRegisteredTerminal = jest.fn(async () => true);
    const channel = createCajaDisplayChannel(TERMINAL, { local: () => local, realtime: null, isRegisteredTerminal });
    expect(await channel.remoteAttached).toBe(false);
    expect(channel.origins).toEqual(['local']);
    expect(isRegisteredTerminal).not.toHaveBeenCalled();
    channel.close();
  });

  it('terminal NO registrada (UUID local de F0, desactivada, sin sesión): no se abre ningún canal de Supabase; una comprobación que lance cuenta como «no»', async () => {
    const rt = fakeRealtime();
    const a = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => false });
    expect(await a.remoteAttached).toBe(false);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const b = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => {
        throw new Error('sin red');
      },
    });
    expect(await b.remoteAttached).toBe(false);
    warn.mockRestore();
    expect(rt.channels).toHaveLength(0);
    expect(a.origins).toEqual(['local']);
    expect(b.origins).toEqual(['local']);
    a.close();
    b.close();
  });

  it('terminal registrada: canal privado pos-display:<id>, escucha `up`, publica `down` SOLO mientras una pantalla remota habla, y el `up` llega con origen remote', async () => {
    const rt = fakeRealtime();
    const local = new FakeChannel();
    let now = 0;
    const statuses: string[] = [];
    const channel = createCajaDisplayChannel(TERMINAL, {
      local: () => local,
      realtime: rt.client,
      isRegisteredTerminal: async (id) => id === TERMINAL,
      onRemoteStatus: (s) => statuses.push(s),
      now: () => now,
    });
    const received: DisplayChannelEvent[] = [];
    channel.onmessage = (e) => received.push(e);
    expect(await channel.remoteAttached).toBe(true);
    expect(channel.origins).toEqual(['local', 'remote']);
    expect(rt.channels).toHaveLength(1);
    const remote = rt.channels[0];
    expect(remote.name).toBe(`pos-display:${TERMINAL}`);
    expect(remote.opts).toEqual({ config: { private: true, broadcast: { self: false, ack: false } } });
    expect(Array.from(remote.listeners.keys())).toEqual([DISPLAY_UP_EVENT]);

    remote.subscribeCb?.('SUBSCRIBED');
    expect(statuses).toEqual(['SUBSCRIBED']);

    // Sin oyente remoto: lo publicado va a local y NO a Supabase.
    channel.postMessage({ t: 'heartbeat', seq: 1 });
    expect(local.posted).toHaveLength(1);
    expect(remote.sent).toEqual([]);

    // La pantalla remota pregunta: llega con origen remote y despierta la pata.
    remote.listeners.get(DISPLAY_UP_EVENT)?.({ payload: up('need_snapshot') });
    expect(received).toEqual([{ data: up('need_snapshot'), origin: 'remote' }]);
    channel.postMessage({ t: 'hello', seq: 2 });
    expect(remote.sent).toEqual([{ event: DISPLAY_DOWN_EVENT, payload: { t: 'hello', seq: 2 } }]);
    expect(local.posted).toHaveLength(2);

    // Pasa el TTL sin señal: vuelve a dormir.
    now = REMOTE_LISTENER_TTL_MS;
    channel.postMessage({ t: 'heartbeat', seq: 3 });
    expect(remote.sent).toHaveLength(1);
    expect(local.posted).toHaveLength(3);

    channel.close();
    await flush();
    expect(remote.unsubscribed).toBe(1);
    expect(rt.removed).toBe(1);
    expect(local.closed).toBe(true);
  });

  it('el latido de bajada sale por Realtime cada REMOTE_BEAT_INTERVAL_MS, no cada segundo; el tubo local los recibe todos', async () => {
    const rt = fakeRealtime();
    const local = new FakeChannel();
    let now = 0;
    const channel = createCajaDisplayChannel(TERMINAL, {
      local: () => local,
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
      now: () => now,
    });
    await channel.remoteAttached;
    const remote = rt.channels[0];
    remote.subscribeCb?.('SUBSCRIBED');
    remote.listeners.get(DISPLAY_UP_EVENT)?.({ payload: up('display_alive') });

    // Un latido por segundo durante 6 s: los 6 al tubo local, 2 por Realtime (t = 0 y t = 5 s).
    for (let i = 0; i < 6; i += 1) {
      channel.postMessage({ t: 'heartbeat', at: now });
      now += 1_000;
    }
    expect(local.posted).toHaveLength(6);
    expect(remote.sent).toHaveLength(2);

    // Lo que NO es latido sale en el acto, sin esperar al ritmo.
    channel.postMessage({ t: 'state', state: { total: 1 } });
    expect(remote.sent).toHaveLength(3);
    expect(REMOTE_BEAT_INTERVAL_MS).toBe(5_000);
    channel.close();
    await flush();
  });

  it('reabrir el MISMO topic espera a que el canal anterior haya salido (sin dos canales vivos a la vez)', async () => {
    const rt = fakeRealtime();
    const a = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    await a.remoteAttached;
    a.close();
    const b = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: rt.client, isRegisteredTerminal: async () => true });
    expect(await b.remoteAttached).toBe(true);
    // Cuando el segundo se cuelga, el primero ya salió del canal y el cliente lo soltó.
    expect(rt.channels[0].unsubscribed).toBe(1);
    expect(rt.removed).toBe(1);
    expect(rt.channels).toHaveLength(2);
    b.close();
    await flush();
  });

  it('el canal se cierra ANTES de que la comprobación responda: la pata remota no se cuelga ni se abre ningún canal', async () => {
    const rt = fakeRealtime();
    let resolve: ((v: boolean) => void) | null = null;
    const channel = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    });
    channel.close();
    resolve!(true);
    expect(await channel.remoteAttached).toBe(false);
    expect(rt.channels).toHaveLength(0);
  });

  it('un cliente cuyo channel() lanza no rompe la caja: aviso y solo local', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken: SupabaseClientLike = {
      channel: () => {
        throw new Error('cliente roto');
      },
    };
    const channel = createCajaDisplayChannel(TERMINAL, { local: () => new FakeChannel(), realtime: broken, isRegisteredTerminal: async () => true });
    expect(await channel.remoteAttached).toBe(false);
    expect(channel.origins).toEqual(['local']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    channel.close();
  });
});
