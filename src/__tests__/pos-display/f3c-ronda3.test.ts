/**
 * Fase 3, parte C (lado caja) · ronda 3. Lo que esta ronda corrigió:
 *
 * 1. El saludo de una caja recién arrancada llegaba a la pata remota cuando
 *    esta ya no podía publicarlo (el `announce()` es síncrono y la pata se
 *    cuelga tras una consulta a la BD), así que la tableta seguía pintando
 *    el carrito del cliente ANTERIOR. Ahora el reparto RETIENE el último
 *    hello y el último state y se los pasa a la pata tardía, y la compuerta
 *    los publica en cuanto la tableta da señal.
 * 2. El TTL de la compuerta se deriva del ritmo remoto y nunca queda por
 *    debajo del silencio que la tableta tolera.
 * 3. El ritmo del latido remoto se reinicia cuando la compuerta despierta.
 * 4. La espera de la salida del topic anterior tiene tope.
 */

import {
  createFanOutDisplayChannel,
  createListenerGatedChannel,
  upMessageListenerGate,
  REMOTE_LISTENER_TTL_MS,
} from '@/lib/pos/display/multiChannel';
import { createCajaDisplayChannel, SALIDA_ANTERIOR_TIMEOUT_MS } from '@/lib/pos/display/cajaChannel';
import {
  DISPLAY_DOWN_EVENT,
  DISPLAY_UP_EVENT,
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
const seqs = (posted: unknown[]) => posted.map((m) => (m as DownMessage).seq);
const estado = (total: number) =>
  ({ items: [], totals: { subtotal: total, tax: 0, discount: 0, total }, currency: 'COP' }) as never;
const hello = { t: 'hello', organizationId: 120, currency: 'COP' } as never;

/** Doble mínimo del cliente de Supabase: guarda lo enviado y expone el oyente de `up`. */
function fakeRealtime() {
  const canales: Array<{
    sent: Array<{ event: string; payload: unknown }>;
    listeners: Map<string, (m: { payload?: unknown }) => void>;
    subscribeCb: ((s: string) => void) | null;
  }> = [];
  const client: SupabaseClientLike = {
    channel(): SupabaseChannelLike {
      const entry = {
        sent: [] as Array<{ event: string; payload: unknown }>,
        listeners: new Map<string, (m: { payload?: unknown }) => void>(),
        subscribeCb: null as ((s: string) => void) | null,
      };
      canales.push(entry);
      const canal: SupabaseChannelLike = {
        on(_type, filter, callback) {
          entry.listeners.set(filter.event, callback);
          return canal;
        },
        async send(args) {
          entry.sent.push({ event: args.event, payload: args.payload });
          return {};
        },
        subscribe(cb) {
          entry.subscribeCb = cb ?? null;
          return canal;
        },
        async unsubscribe() {
          return {};
        },
      };
      return canal;
    },
    async removeChannel() {
      return {};
    },
  };
  return { client, canales };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------------------
// 1. El saludo no se pierde: reparto que retiene y compuerta que repone
// ---------------------------------------------------------------------------

describe('puesta al día de la pata que llega tarde', () => {
  it('addLeg le entrega a la pata nueva el último hello y el último state, en ese orden y solo a ella', () => {
    const local = new FakeChannel();
    const fanOut = createFanOutDisplayChannel([{ origin: 'local', channel: local }]);
    fanOut.postMessage({ t: 'hello', seq: 1 });
    fanOut.postMessage({ t: 'state', seq: 2 });
    fanOut.postMessage({ t: 'heartbeat', seq: 3 });
    fanOut.postMessage({ t: 'state', seq: 4 });

    const remote = new FakeChannel();
    expect(fanOut.addLeg({ origin: 'remote', channel: remote })).toBe(true);
    // El hello identifica la instancia viva y el state es el carrito de AHORA:
    // el latido intermedio no le sirve a nadie y no se guarda.
    expect(types(remote.posted)).toEqual(['hello', 'state']);
    expect(seqs(remote.posted)).toEqual([1, 4]);
    // A la pata que ya estaba no se le repite nada.
    expect(seqs(local.posted)).toEqual([1, 2, 3, 4]);
  });

  it('tras close() no se retiene nada: una pata colgada después ni se cuelga ni recibe el saludo viejo', () => {
    const fanOut = createFanOutDisplayChannel([{ origin: 'local', channel: new FakeChannel() }]);
    fanOut.postMessage({ t: 'hello', seq: 1 });
    fanOut.close();
    const tarde = new FakeChannel();
    expect(fanOut.addLeg({ origin: 'remote', channel: tarde })).toBe(false);
    expect(tarde.posted).toEqual([]);
  });

  it('la compuerta dormida RETIENE hello y state (no latidos) y los repone al abrirse, antes que nada', () => {
    let ahora = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => ahora, gate: upMessageListenerGate(TERMINAL) });

    gated.postMessage({ t: 'heartbeat', at: 0 });
    expect(gated.hasPendingSnapshot).toBe(false); // un latido perdido no es un hueco
    gated.postMessage({ t: 'hello', seq: 1 });
    gated.postMessage({ t: 'state', seq: 2 });
    expect(inner.posted).toEqual([]);
    expect(gated.hasPendingSnapshot).toBe(true);

    ahora = 1_000;
    inner.inject(up('display_alive'), 'remote');
    expect(types(inner.posted)).toEqual(['hello', 'state']);
    expect(gated.hasPendingSnapshot).toBe(false);

    // Ya repuesto: un segundo sueño sin nada nuevo no vuelve a publicarlo.
    ahora = 1_000 + REMOTE_LISTENER_TTL_MS;
    inner.posted.length = 0;
    inner.inject(up('display_alive'), 'remote');
    expect(inner.posted).toEqual([]);
    gated.close();
  });

  it('un need_snapshot NO duplica el saludo: el announce de la misma vuelta cierra el hueco', () => {
    let ahora = 0;
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { now: () => ahora, gate: upMessageListenerGate(TERMINAL) });
    // Así responde el emisor: hello + state en la misma vuelta (announce).
    gated.onmessage = (event) => {
      if ((event.data as UpMessage).t !== 'need_snapshot') return;
      gated.postMessage({ t: 'hello', seq: 9 });
      gated.postMessage({ t: 'state', seq: 10 });
    };

    gated.postMessage({ t: 'hello', seq: 1 });
    gated.postMessage({ t: 'state', seq: 2 });
    expect(gated.hasPendingSnapshot).toBe(true);

    ahora = 500;
    inner.inject(up('need_snapshot'), 'remote');
    expect(seqs(inner.posted)).toEqual([9, 10]); // solo el fresco, no el retenido
    expect(gated.hasPendingSnapshot).toBe(false);
    gated.close();
  });

  it('close() suelta lo retenido: un canal cerrado no publica nada aunque le hablen', () => {
    const inner = new FakeChannel();
    const gated = createListenerGatedChannel(inner, { gate: upMessageListenerGate(TERMINAL) });
    gated.postMessage({ t: 'hello', seq: 1 });
    expect(gated.hasPendingSnapshot).toBe(true);
    gated.close();
    expect(gated.hasPendingSnapshot).toBe(false);
    inner.inject(up('display_alive'), 'remote');
    expect(inner.posted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. El caso de la tienda: la caja arranca con la tableta ya encendida
// ---------------------------------------------------------------------------

describe('createCajaDisplayChannel · la caja arranca con la tableta ya viva', () => {
  it('el hello publicado ANTES de colgar la pata remota llega a la tableta en su primera señal', async () => {
    const rt = fakeRealtime();
    const local = new FakeChannel();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => local,
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
    });
    const transporte = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: () => canal, now: () => 1 });

    // El emisor saluda EN EL ACTO, mientras la comprobación de la terminal
    // sigue en vuelo: el canal compuesto es todavía solo local.
    transporte.announce(hello, estado(4_500));
    expect(types(local.posted)).toEqual(['hello', 'state']);

    await canal.remoteAttached;
    const remoto = rt.canales[0];
    remoto.subscribeCb?.('SUBSCRIBED');
    // Sin tableta que hable, el canal remoto sigue costando cero mensajes.
    expect(remoto.sent).toEqual([]);

    // La tableta late (todavía cree hablar con la caja anterior): el saludo sale ya.
    remoto.listeners.get(DISPLAY_UP_EVENT)?.({ payload: up('display_alive') });
    expect(remoto.sent.map((s) => s.event)).toEqual([DISPLAY_DOWN_EVENT, DISPLAY_DOWN_EVENT]);
    expect(types(remoto.sent.map((s) => s.payload))).toEqual(['hello', 'state']);
    // Y con el carrito de AHORA, no con uno viejo.
    expect((remoto.sent[1].payload as { state: { totals: { total: number } } }).state.totals.total).toBe(4_500);

    transporte.close();
    await flush();
  });
});

// ---------------------------------------------------------------------------
// 3. Constantes derivadas y tope de la espera de salida
// ---------------------------------------------------------------------------

describe('constantes del tubo remoto', () => {
  it('el TTL de la compuerta son tres latidos remotos y nunca menos que el silencio que tolera la tableta', () => {
    expect(REMOTE_LISTENER_TTL_MS).toBe(3 * REMOTE_PRESENCE_INTERVAL_MS);
    expect(REMOTE_LISTENER_TTL_MS).toBeGreaterThanOrEqual(REMOTE_STALE_AFTER_MS);
  });

  it('el tope de la espera de salida es corto y positivo: nunca deja la pata sin colgar', () => {
    expect(SALIDA_ANTERIOR_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SALIDA_ANTERIOR_TIMEOUT_MS).toBeLessThanOrEqual(2_000);
  });

  it('sin salida anterior anotada no se espera nada: la primera apertura no paga el tope', async () => {
    const rt = fakeRealtime();
    const canal = createCajaDisplayChannel(TERMINAL, {
      local: () => new FakeChannel(),
      realtime: rt.client,
      isRegisteredTerminal: async () => true,
      salidaTimeoutMs: 60_000,
    });
    await expect(canal.remoteAttached).resolves.toBe(true);
    canal.close();
    await flush();
  });
});
