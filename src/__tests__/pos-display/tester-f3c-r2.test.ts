/**
 * TESTER · Fase 3, parte C (lado caja), ronda 2. Intento de rotura.
 *
 * Se ataca lo que la ronda 2 CAMBIO: el ritmo del latido por la pata remota
 * (beatIntervalMs), la compuerta de oyente frente al nuevo ritmo de 5 s de
 * la tableta, y la espera de la salida del topic anterior.
 *
 * Los `it` marcados DEFECTO documentaban lo que pasaba en la ronda 2. La
 * ronda 3 los CORRIGIO y aqui estan invertidos: cada uno afirma ahora el
 * comportamiento esperado, y si alguien reintroduce el defecto, falla.
 */

import {
  createFanOutDisplayChannel,
  createListenerGatedChannel,
  REMOTE_LISTENER_TTL_MS,
  upMessageListenerGate,
} from '@/lib/pos/display/multiChannel';
import { createCajaDisplayChannel, SALIDA_ANTERIOR_TIMEOUT_MS } from '@/lib/pos/display/cajaChannel';
import {
  REMOTE_BEAT_INTERVAL_MS,
  REMOTE_PRESENCE_INTERVAL_MS,
  REMOTE_STALE_AFTER_MS,
  type SupabaseChannelLike,
  type SupabaseClientLike,
} from '@/lib/pos/display/supabaseBroadcastTransport';
import { PROTOCOL_VERSION, type DownMessage, type UpMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelTransport, type DisplayChannel, type DisplayChannelEvent } from '@/lib/pos/display/transport';

const TERMINAL = '11111111-2222-4333-8444-555555555555';
const CAPS = { touch: false, width: 1024, height: 768 };

class FakeChannel implements DisplayChannel {
  posted: unknown[] = [];
  onmessage: ((event: DisplayChannelEvent) => void) | null = null;
  closed = false;
  postMessage(msg: unknown): void {
    this.posted.push(msg);
  }
  close(): void {
    this.closed = true;
  }
  inject(data: unknown, origin?: 'local' | 'remote'): void {
    this.onmessage?.(origin ? { data, origin } : { data });
  }
}

const up = (t: UpMessage['t'], extra: Record<string, unknown> = {}): UpMessage =>
  ({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t, at: 1, capabilities: CAPS, ...extra }) as unknown as UpMessage;
const types = (posted: unknown[]) => posted.map((m) => (m as DownMessage).t);

const estado = (total: number) =>
  ({ items: [], totals: { subtotal: total, tax: 0, discount: 0, total }, currency: 'COP' }) as never;

// ---------------------------------------------------------------------------
// 1. El TTL de la compuerta no se ajusto al ritmo nuevo de la tableta
// ---------------------------------------------------------------------------

describe('compuerta de oyente · margen frente al latido remoto de 5 s', () => {
  it('CORREGIDO: el TTL son TRES latidos de la tableta y nunca menos que el silencio que ella tolera', () => {
    expect(REMOTE_PRESENCE_INTERVAL_MS).toBe(5_000);
    // El mismo margen que en local: tres latidos perdidos, no dos.
    expect(REMOTE_LISTENER_TTL_MS / REMOTE_PRESENCE_INTERVAL_MS).toBe(3);
    // Y nunca por debajo del silencio que la propia tableta tolera de la caja:
    // la caja no puede callarse antes de que la tableta se de por desconectada.
    expect(REMOTE_LISTENER_TTL_MS).toBeGreaterThanOrEqual(REMOTE_STALE_AFTER_MS);
  });

  it('CORREGIDO: un latido perdido ya no calla a la caja, y lo que se publique con la compuerta dormida se repone al despertar', () => {
    let ahora = 0;
    const local = new FakeChannel();
    const remoto = new FakeChannel();
    const gated = createListenerGatedChannel(remoto, { now: () => ahora, gate: upMessageListenerGate(TERMINAL) });
    const fanOut = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: gated },
    ]);
    const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fanOut, now: () => ahora });

    // t=0 y t=5000: la tableta late con su ritmo real. Con el TTL nuevo (15 s)
    // la compuerta aguanta hasta t=20000.
    remoto.inject(up('display_alive'), 'remote');
    ahora = 5_000;
    remoto.inject(up('display_alive'), 'remote');
    // t=10000: el latido se pierde (wifi de la tienda). El cajero escanea en t=15000.
    ahora = 15_000;
    remoto.posted.length = 0;
    local.posted.length = 0;
    transport.publish({ t: 'state', state: estado(9900) });
    expect(types(local.posted)).toEqual(['state']);
    expect(types(remoto.posted)).toEqual(['state']); // la tableta TAMBIEN lo ve

    // Con TRES latidos perdidos la compuerta si duerme, y lo publicado se RETIENE.
    ahora = 20_000;
    remoto.posted.length = 0;
    transport.publish({ t: 'state', state: estado(12_500) });
    expect(remoto.posted).toEqual([]);
    expect(gated.hasPendingSnapshot).toBe(true);

    // El siguiente latido la despierta y el carrito retenido sale en el acto.
    ahora = 20_100;
    remoto.inject(up('display_alive'), 'remote');
    expect(types(remoto.posted)).toEqual(['state']);
    expect((remoto.posted[0] as { state: { totals: { total: number } } }).state.totals.total).toBe(12_500);
    expect(gated.hasPendingSnapshot).toBe(false);
    transport.close();
  });
});

// ---------------------------------------------------------------------------
// 2. El reloj del latido remoto sobrevive al sueno de la compuerta
// ---------------------------------------------------------------------------

describe('ritmo del latido remoto · lastBeatAt y el sueno de la compuerta', () => {
  it('CORREGIDO: tras dormir y despertar, el ritmo se reinicia y la tableta recien llegada recibe latido en el acto', () => {
    let ahora = 0;
    const remoto = new FakeChannel();
    const gated = createListenerGatedChannel(remoto, {
      now: () => ahora,
      gate: upMessageListenerGate(TERMINAL),
      beatIntervalMs: REMOTE_BEAT_INTERVAL_MS,
    });

    remoto.inject(up('display_alive'), 'remote'); // abre hasta t=15000
    gated.postMessage({ t: 'heartbeat', at: ahora }); // sale: lastBeatAt = 0
    expect(types(remoto.posted)).toEqual(['heartbeat']);

    // La tableta calla mas que el TTL y la compuerta duerme.
    ahora = 15_500;
    gated.postMessage({ t: 'heartbeat', at: ahora });
    expect(remoto.posted).toHaveLength(1);

    // Vuelve en el acto (reconexion): need_snapshot reabre la compuerta.
    ahora = 15_600;
    remoto.inject(up('need_snapshot'), 'remote');
    remoto.posted.length = 0;
    gated.postMessage({ t: 'heartbeat', at: ahora });
    expect(types(remoto.posted)).toEqual(['heartbeat']); // lastBeatAt pasa a 15600

    // Caso visible: dormir y despertar dentro del mismo intervalo de 5 s.
    ahora = 15_601;
    remoto.inject(up('display_bye'), 'remote'); // duerme
    ahora = 15_700;
    remoto.inject(up('need_snapshot'), 'remote'); // despierta: tableta NUEVA
    remoto.posted.length = 0;
    gated.postMessage({ t: 'heartbeat', at: ahora });
    expect(types(remoto.posted)).toEqual(['heartbeat']); // el ritmo se midio desde cero
    gated.close();
  });
});

// ---------------------------------------------------------------------------
// 3. La espera de la salida del topic anterior no tiene tope
// ---------------------------------------------------------------------------

function clienteConUnsubscribeColgado(): { client: SupabaseClientLike; resolver: () => void } {
  let resolver: () => void = () => {};
  const colgado = new Promise<void>((res) => {
    resolver = () => res();
  });
  const canal: SupabaseChannelLike = {
    on: () => canal,
    send: async () => ({}),
    subscribe: (cb?: (s: string) => void) => {
      cb?.('SUBSCRIBED');
      return canal;
    },
    unsubscribe: () => colgado,
  };
  return { client: { channel: () => canal, removeChannel: async () => ({}) }, resolver };
}

describe('salidas en vuelo · la espera del canal anterior tiene tope', () => {
  it('CORREGIDO: si unsubscribe() no resuelve, la reapertura del mismo topic se abre igual pasado el tope', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { client, resolver } = clienteConUnsubscribeColgado();
    const deps = {
      local: () => new FakeChannel(),
      realtime: client,
      isRegisteredTerminal: async () => true,
      // El tope de produccion es SALIDA_ANTERIOR_TIMEOUT_MS; aqui uno corto para no esperar.
      salidaTimeoutMs: 20,
    };
    const primero = createCajaDisplayChannel(TERMINAL, deps);
    await expect(primero.remoteAttached).resolves.toBe(true);
    primero.close(); // registra la salida colgada bajo el topic

    // Antes se quedaba colgado para siempre y la caja perdia la tableta sin aviso.
    const segundo = createCajaDisplayChannel(TERMINAL, deps);
    await expect(segundo.remoteAttached).resolves.toBe(true);
    expect(warn).toHaveBeenCalled(); // y queda constancia en el registro
    expect(SALIDA_ANTERIOR_TIMEOUT_MS).toBeGreaterThan(0);

    resolver();
    segundo.close();
    warn.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 4. El hello de una caja recien arrancada no llega a la tableta ya conectada
// ---------------------------------------------------------------------------

describe('arranque de la caja con la tableta ya viva', () => {
  it('CORREGIDO: el hello retenido sale en cuanto la tableta da senal, sin esperar a su watchdog', () => {
    let ahora = 0;
    const local = new FakeChannel();
    const remoto = new FakeChannel();
    // Produccion: la pata remota va SIEMPRE con compuerta (cajaChannel.ts).
    const gated = createListenerGatedChannel(remoto, { now: () => ahora, gate: upMessageListenerGate(TERMINAL) });
    const fanOut = createFanOutDisplayChannel([
      { origin: 'local', channel: local },
      { origin: 'remote', channel: gated },
    ]);
    const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => fanOut, now: () => ahora });

    // La caja arranca y saluda: la tableta lleva rato encendida pero aun no ha hablado
    // con ESTA instancia, asi que la compuerta esta dormida. El saludo NO se publica
    // (coste cero sin tableta) pero tampoco se tira: queda RETENIDO.
    transport.announce({ t: 'hello', organizationId: 120, currency: 'COP' } as never, estado(0));
    expect(types(local.posted)).toEqual(['hello', 'state']);
    expect(remoto.posted).toEqual([]);
    expect(gated.hasPendingSnapshot).toBe(true);

    // La tableta late (sigue creyendo que habla con la caja anterior): la compuerta
    // se abre y el saludo retenido sale en el acto, con el carrito de AHORA.
    ahora = 3_000;
    remoto.inject(up('display_alive'), 'remote');
    expect(types(remoto.posted)).toEqual(['hello', 'state']);
    expect(gated.hasPendingSnapshot).toBe(false);

    // Ese hello releva la instancia en la tableta: ya no hay ventana de
    // REMOTE_STALE_AFTER_MS con el carrito del cliente anterior delante del nuevo.
    ahora = 3_001;
    transport.publish({ t: 'heartbeat', at: ahora });
    expect(types(remoto.posted)).toEqual(['hello', 'state', 'heartbeat']);
    expect(REMOTE_STALE_AFTER_MS).toBe(15_000);
    transport.close();
  });
});
