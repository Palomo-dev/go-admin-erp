/**
 * Fase 3, parte B — transporte remoto sobre Supabase Broadcast
 * (src/lib/pos/display/supabaseBroadcastTransport.ts) con el doble de
 * Realtime de f3b-supabaseRealtimeDouble.ts (sin socket).
 *
 * Lo que se afirma:
 * - Cumple DisplayTransport / DisplayReceiver con el MISMO sobre que el
 *   transporte local (v, seq, terminalId, instanceId, toInstanceId) y el mismo
 *   descarte (terminal, seq, instancia), porque hereda la lógica de
 *   transport.ts: solo cambia el tubo.
 * - Canal privado por terminal, `self: false`, un evento por sentido: la caja
 *   solo escucha `up` y la pantalla solo `down`.
 * - Cola previa al join (orden, tope) y vaciado al SUBSCRIBED.
 * - Latido, presencia, `bye` + salida del canal al cerrar, onStatus.
 *
 * Fixtures con organización ficticia (org 1). Sin nombres de clientes reales.
 */

import type { DisplayState, DownMessage, UpMessage } from '@/lib/pos/display/protocol';
import {
  DISPLAY_DOWN_EVENT,
  DISPLAY_UP_EVENT,
  JOIN_QUEUE_LIMIT,
  SupabaseBroadcastReceiver,
  SupabaseBroadcastTransport,
  createSupabaseDisplayChannel,
  type SupabaseChannelStatus,
} from '@/lib/pos/display/supabaseBroadcastTransport';
import { displayChannelName, type DisplayReceiver, type DisplayTransport } from '@/lib/pos/display/transport';
import { RealtimeBus, createRealtimeDouble, type DoubleChannel } from './f3b-supabaseRealtimeDouble';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-0000-4111-8222-333333333333';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const CAPS = { touch: true, width: 1024, height: 768 } as const;
const IDLE: DisplayState = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null };
const HELLO = { t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: true, organizationId: 1 } as const;

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Caja y pantalla sobre el mismo bus, cada una con su propio cliente (como dos dispositivos). */
function pair(bus = new RealtimeBus(), opts: { autoJoin?: boolean; instanceId?: string } = {}) {
  const cajaClient = createRealtimeDouble({ bus, autoJoin: opts.autoJoin });
  const pantallaClient = createRealtimeDouble({ bus, autoJoin: opts.autoJoin });
  const transport = track(
    new SupabaseBroadcastTransport({ terminalId: TERMINAL, client: cajaClient.client, __testInstanceId: opts.instanceId ?? INSTANCE_A, now: () => 1000 }),
  );
  const receiver = track(new SupabaseBroadcastReceiver({ terminalId: TERMINAL, client: pantallaClient.client, now: () => 1000 }));
  return { bus, transport, receiver, cajaChannel: cajaClient.channels[0], pantallaChannel: pantallaClient.channels[0] };
}

describe('F3-B · transporte remoto · contrato y canal', () => {
  it('SupabaseBroadcastTransport cumple DisplayTransport y SupabaseBroadcastReceiver cumple DisplayReceiver', () => {
    const { transport, receiver } = pair();
    const t: DisplayTransport = transport;
    const r: DisplayReceiver = receiver;
    expect(typeof t.publish).toBe('function');
    expect(typeof t.announce).toBe('function');
    expect(typeof t.onUp).toBe('function');
    expect(typeof t.startHeartbeat).toBe('function');
    expect(typeof t.stopHeartbeat).toBe('function');
    expect(t.lastDisplaySeenAt).toBeNull();
    expect(typeof r.send).toBe('function');
    expect(typeof r.onDown).toBe('function');
    expect(typeof r.releaseActiveInstance).toBe('function');
    expect(typeof r.startPresence).toBe('function');
    expect(r.activeInstanceId).toBeNull();
    expect(r.lastSeq).toBe(-1);
    expect(r.incompatibleVersionCount).toBe(0);
  });

  it('un canal por terminal, PRIVADO y sin eco (self: false); la caja escucha solo `up` y la pantalla solo `down`', () => {
    const { cajaChannel, pantallaChannel } = pair();
    expect(cajaChannel.topic).toBe(displayChannelName(TERMINAL));
    expect(pantallaChannel.topic).toBe(displayChannelName(TERMINAL));
    for (const ch of [cajaChannel, pantallaChannel]) {
      expect(ch.opts.config.private).toBe(true);
      expect(ch.opts.config.broadcast.self).toBe(false);
    }
    expect(cajaChannel.listening).toEqual([DISPLAY_UP_EVENT]);
    expect(pantallaChannel.listening).toEqual([DISPLAY_DOWN_EVENT]);
    expect(DISPLAY_DOWN_EVENT).toBe('down');
    expect(DISPLAY_UP_EVENT).toBe('up');
  });

  it('la pantalla puede pasar el `realtime.channel` del bootstrap como nombre del canal', () => {
    const bus = new RealtimeBus();
    const d = createRealtimeDouble({ bus });
    track(new SupabaseBroadcastReceiver({ terminalId: TERMINAL, client: d.client, channelName: `pos-display:${TERMINAL}` }));
    expect(d.channels[0].topic).toBe(`pos-display:${TERMINAL}`);
  });

  it('terminalId vacío falla al construir (misma regla que el transporte local)', () => {
    const d = createRealtimeDouble({ bus: new RealtimeBus() });
    expect(() => new SupabaseBroadcastTransport({ terminalId: '', client: d.client })).toThrow(/terminalId/);
    expect(() => new SupabaseBroadcastReceiver({ terminalId: '', client: d.client })).toThrow(/terminalId/);
  });

  it('onStatus recibe cada estado de la suscripción y un handler que lanza no rompe el canal', async () => {
    const bus = new RealtimeBus();
    const d = createRealtimeDouble({ bus, autoJoin: false });
    const statuses: SupabaseChannelStatus[] = [];
    const onStatus = jest.fn((s: SupabaseChannelStatus) => {
      statuses.push(s);
      if (s === 'CHANNEL_ERROR') throw new Error('handler roto');
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const receiver = track(new SupabaseBroadcastReceiver({ terminalId: TERMINAL, client: d.client, onStatus }));
    d.channels[0].setStatus('CHANNEL_ERROR', new Error('no autorizado'));
    d.channels[0].setStatus('SUBSCRIBED');
    d.channels[0].setStatus('estado-desconocido');
    expect(statuses).toEqual(['CHANNEL_ERROR', 'SUBSCRIBED']);
    expect(errorSpy).toHaveBeenCalled();
    expect(receiver.isClosed).toBe(false);
    await flush();
  });
});

describe('F3-B · transporte remoto · sobre, entrega y descarte', () => {
  it('publish estampa el sobre (v, seq, terminalId, instanceId) y la pantalla lo recibe y adopta la instancia', async () => {
    const { transport, receiver, bus } = pair();
    await flush(); // join
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    transport.announce(HELLO, IDLE);
    await flush();
    expect(received.map((m) => m.t)).toEqual(['hello', 'state']);
    expect(received[0]).toMatchObject({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A });
    expect(received[1]).toMatchObject({ v: 1, seq: 2, terminalId: TERMINAL, instanceId: INSTANCE_A });
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
    expect(receiver.lastSeq).toBe(2);
    expect(bus.sent.map((s) => s.event)).toEqual([DISPLAY_DOWN_EVENT, DISPLAY_DOWN_EVENT]);
  });

  it('un borrador con sobre falso no lo pisa: el transporte es dueño de v/seq/terminalId/instanceId', async () => {
    const { transport, receiver } = pair();
    await flush();
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    transport.publish({ ...HELLO, v: 9, seq: 999, terminalId: OTHER_TERMINAL, instanceId: INSTANCE_B } as never);
    await flush();
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ v: 1, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A });
  });

  it('descarta por terminal, por seq repetido/menor y por instancia no activa; un hello de otra instancia releva', async () => {
    const { receiver, pantallaChannel } = pair();
    await flush();
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    const hello = (seq: number, instanceId: string, terminalId = TERMINAL): DownMessage => ({ v: 1, t: 'hello', seq, terminalId, instanceId, cashier: null, sessionOpen: true, organizationId: 1 });
    const hb = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'heartbeat', seq, terminalId: TERMINAL, instanceId, at: seq });

    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hello(1, INSTANCE_A, OTHER_TERMINAL)); // otra terminal: fuera
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hello(5, INSTANCE_A)); // adopta A
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hb(5, INSTANCE_A)); // seq repetido: fuera
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hb(3, INSTANCE_A)); // seq menor: fuera
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hb(1, INSTANCE_B)); // otra instancia sin hello: fuera
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hb(6, INSTANCE_A)); // sigue
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hello(1, INSTANCE_B)); // releva (gana la última que saluda)
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, hb(7, INSTANCE_A)); // la anterior ya no es la activa: fuera
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, { v: 2, t: 'heartbeat', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE_B, at: 0 }); // otra versión
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, 'basura');
    pantallaChannel.inject(DISPLAY_DOWN_EVENT, undefined);

    expect(received.map((m) => `${m.t}:${m.seq}:${m.instanceId === INSTANCE_A ? 'A' : 'B'}`)).toEqual(['hello:5:A', 'heartbeat:6:A', 'hello:1:B']);
    expect(receiver.activeInstanceId).toBe(INSTANCE_B);
    expect(receiver.lastSeq).toBe(1);
    expect(receiver.incompatibleVersionCount).toBe(1);
  });

  it('la pantalla envía `up` con toInstanceId hacia la activa; la caja lo recibe, y descarta lo dirigido a otra instancia', async () => {
    const { transport, receiver, cajaChannel, bus } = pair();
    await flush();
    transport.announce(HELLO, IDLE);
    await flush();
    const ups: UpMessage[] = [];
    transport.onUp((m) => ups.push(m));
    receiver.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });
    await flush();
    expect(ups).toHaveLength(1);
    expect(ups[0]).toMatchObject({ v: 1, t: 'tip_selected', terminalId: TERMINAL, toInstanceId: INSTANCE_A, cartId: 'c1' });
    expect(bus.sent[bus.sent.length - 1].event).toBe(DISPLAY_UP_EVENT);

    cajaChannel.inject(DISPLAY_UP_EVENT, { v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, toInstanceId: INSTANCE_B, cartId: 'c1' });
    cajaChannel.inject(DISPLAY_UP_EVENT, { v: 1, t: 'qr_paid_claim', terminalId: OTHER_TERMINAL, cartId: 'c1' });
    cajaChannel.inject(DISPLAY_UP_EVENT, { v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' });
    expect(ups).toHaveLength(2);
    expect(ups[1].t).toBe('qr_paid_claim');
  });

  it('la caja NO recibe sus propios `down` ni la pantalla sus propios `up` (un evento por sentido)', async () => {
    const { transport, receiver } = pair();
    await flush();
    const ups: UpMessage[] = [];
    const downs: DownMessage[] = [];
    transport.onUp((m) => ups.push(m));
    receiver.onDown((m) => downs.push(m));
    transport.publish({ t: 'heartbeat', at: 1 });
    receiver.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    expect(downs.map((m) => m.t)).toEqual(['heartbeat']);
    expect(ups.map((m) => m.t)).toEqual(['need_snapshot']);
  });

  it('presencia: display_alive/need_snapshot fijan lastDisplaySeenAt y las capacidades; display_bye los borra', async () => {
    const { transport, receiver } = pair();
    await flush();
    receiver.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    expect(transport.lastDisplaySeenAt).toBe(1000);
    expect(transport.lastDisplayCapabilities).toEqual(CAPS);
    receiver.close(); // display_bye
    await flush();
    expect(transport.lastDisplaySeenAt).toBeNull();
    expect(transport.lastDisplayCapabilities).toBeNull();
  });

  it('dos cajas (dos clientes, dos instancias) sobre el mismo canal: la pantalla sigue a la última que saluda', async () => {
    const bus = new RealtimeBus();
    const { receiver } = pair(bus);
    const cajaB = createRealtimeDouble({ bus });
    const tB = track(new SupabaseBroadcastTransport({ terminalId: TERMINAL, client: cajaB.client, __testInstanceId: INSTANCE_B }));
    await flush();
    tB.announce(HELLO, IDLE);
    await flush();
    expect(receiver.activeInstanceId).toBe(INSTANCE_B);
  });
});

describe('F3-B · transporte remoto · cola previa al join, latido y cierre', () => {
  it('lo publicado antes del SUBSCRIBED se retiene y se vacía EN ORDEN al unirse (hello antes que state)', async () => {
    const { transport, receiver, cajaChannel, pantallaChannel, bus } = pair(new RealtimeBus(), { autoJoin: false });
    pantallaChannel.setStatus('SUBSCRIBED');
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    transport.announce(HELLO, IDLE);
    transport.publish({ t: 'heartbeat', at: 1 });
    await flush();
    expect(bus.sent).toHaveLength(0); // nada salió: la caja aún no está unida
    cajaChannel.setStatus('SUBSCRIBED');
    await flush();
    expect(received.map((m) => `${m.t}:${m.seq}`)).toEqual(['hello:1', 'state:2', 'heartbeat:3']);
  });

  it('la cola tiene tope: por encima se descarta lo más viejo (hueco de seq inocuo)', async () => {
    const bus = new RealtimeBus();
    const d = createRealtimeDouble({ bus, autoJoin: false });
    const channel = createSupabaseDisplayChannel(d.client, TERMINAL, { sendEvent: 'down', listenEvent: 'up', joinQueueLimit: 3 });
    for (let i = 1; i <= 5; i += 1) channel.postMessage({ n: i });
    d.channels[0].setStatus('SUBSCRIBED');
    await flush();
    expect(bus.sent.map((s) => (s.payload as { n: number }).n)).toEqual([3, 4, 5]);
    channel.close();
    expect(JOIN_QUEUE_LIMIT).toBe(32);
  });

  it('tras un CHANNEL_ERROR o CLOSED se vuelve a encolar hasta el siguiente SUBSCRIBED', async () => {
    const bus = new RealtimeBus();
    const d = createRealtimeDouble({ bus, autoJoin: false });
    const channel = createSupabaseDisplayChannel(d.client, TERMINAL, { sendEvent: 'down', listenEvent: 'up' });
    d.channels[0].setStatus('SUBSCRIBED');
    channel.postMessage({ n: 1 });
    d.channels[0].setStatus('CHANNEL_ERROR', new Error('corte'));
    channel.postMessage({ n: 2 });
    expect(bus.sent).toHaveLength(1);
    d.channels[0].setStatus('SUBSCRIBED');
    await flush();
    expect(bus.sent.map((s) => (s.payload as { n: number }).n)).toEqual([1, 2]);
    channel.close();
  });

  it('un send que rechaza se registra con console.warn y no rompe nada (PLAN §5.5)', async () => {
    const bus = new RealtimeBus();
    const d = createRealtimeDouble({ bus, failSend: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const transport = track(new SupabaseBroadcastTransport({ terminalId: TERMINAL, client: d.client, __testInstanceId: INSTANCE_A }));
    await flush();
    expect(() => transport.publish({ t: 'heartbeat', at: 1 })).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no se pudo publicar'), expect.anything());
    expect(transport.lastSeq).toBe(1);
    transport.close(false);
  });

  it('startHeartbeat late cada intervalo por el canal y stopHeartbeat lo detiene', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    const { transport, receiver } = pair();
    await flush();
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    transport.startHeartbeat();
    transport.startHeartbeat(); // idempotente
    jest.advanceTimersByTime(1000);
    await flush();
    jest.advanceTimersByTime(1000);
    await flush();
    expect(received.filter((m) => m.t === 'heartbeat')).toHaveLength(2);
    transport.stopHeartbeat();
    jest.advanceTimersByTime(3000);
    await flush();
    expect(received.filter((m) => m.t === 'heartbeat')).toHaveLength(2);
  });

  it('close() de la caja manda `bye` por el canal y DESPUÉS sale (unsubscribe + removeChannel); nada más se publica', async () => {
    const { transport, receiver, cajaChannel, bus } = pair();
    await flush();
    const received: DownMessage[] = [];
    receiver.onDown((m) => received.push(m));
    transport.announce(HELLO, IDLE);
    await flush();
    transport.close();
    await flush();
    expect(received.map((m) => m.t)).toEqual(['hello', 'state', 'bye']);
    expect(receiver.lastByeAt).not.toBeNull();
    expect(receiver.activeInstanceId).toBeNull();
    expect(cajaChannel.unsubscribed).toBe(true);
    expect(bus.removed).toBe(1);
    const before = bus.sent.length;
    transport.publish({ t: 'heartbeat', at: 2 });
    await flush();
    expect(bus.sent.length).toBe(before);
  });

  it('close() de la pantalla manda `display_bye` y sale del canal; con `sayBye: false` solo sale', async () => {
    const bus = new RealtimeBus();
    const { transport, receiver, pantallaChannel } = pair(bus);
    await flush();
    receiver.startPresence(CAPS);
    await flush();
    expect(transport.lastDisplaySeenAt).not.toBeNull();
    receiver.close();
    await flush();
    expect(pantallaChannel.unsubscribed).toBe(true);
    expect(bus.sent.filter((s) => (s.payload as { t: string }).t === 'display_bye')).toHaveLength(1);

    const silent = createRealtimeDouble({ bus });
    const r2 = track(new SupabaseBroadcastReceiver({ terminalId: TERMINAL, client: silent.client }));
    await flush();
    const sentBefore = bus.sent.length;
    r2.close(false);
    await flush();
    expect(bus.sent.length).toBe(sentBefore);
    expect(silent.channels[0].unsubscribed).toBe(true);
  });

  it('un cliente sin removeChannel y un unsubscribe que rechaza no impiden cerrar', async () => {
    const bus = new RealtimeBus();
    const d = createRealtimeDouble({ bus, withoutRemoveChannel: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const channel = createSupabaseDisplayChannel(d.client, TERMINAL, { sendEvent: 'down', listenEvent: 'up' });
    const raw: DoubleChannel = d.channels[0];
    jest.spyOn(raw, 'unsubscribe').mockRejectedValue(new Error('socket cerrado'));
    expect(() => channel.close()).not.toThrow();
    await flush();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no se pudo salir del canal'), expect.anything());
    // Tras cerrar, lo que llegue por el canal ya no se entrega.
    const handler = jest.fn();
    channel.onmessage = handler;
    raw.inject('up', { x: 1 });
    expect(handler).not.toHaveBeenCalled();
  });
});
