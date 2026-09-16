/**
 * TESTER ronda 2 — adopción de instancia tras `bye` y relevo entre pestañas.
 *
 * Sondea la regla «el bye de la activa la libera y la siguiente que hable es
 * adoptada sin hello» (cabecera de transport.ts) con contadores de seq
 * realistas: la pestaña que releva suele llevar un seq MENOR que la que se
 * despidió (Chrome estrangula los timers de una pestaña en segundo plano a
 * 1/min tras 5 min; en Node se simula con un canal crudo).
 *
 * Fixtures con organización ficticia. Sin nombres de clientes reales.
 */

import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName } from '@/lib/pos/display/transport';
import type { DownMessage } from '@/lib/pos/display/protocol';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 500): Promise<void> {
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
});

const hb = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'heartbeat', seq, terminalId: TERMINAL, instanceId, at: seq });
const hello = (seq: number, instanceId: string): DownMessage => ({
  v: 1, t: 'hello', seq, terminalId: TERMINAL, instanceId, cashier: null, sessionOpen: true,
});
const bye = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'bye', seq, terminalId: TERMINAL, instanceId });

describe('TESTER transporte: relevo tras bye con seq menor que el de la instancia que se despidió', () => {
  /**
   * BUG F (corregido en ronda 3). Tras el `bye` de B, `instanceId` pasaba a
   * null pero `highestSeq` se quedaba en el seq del bye. La siguiente
   * instancia que hablaba (A, con seq bajo) se adoptaba antes de la
   * comprobación de seq, así que su mensaje se descartaba y, como ya era «la
   * activa», su propio `hello` posterior también caía en la regla de seq
   * creciente. Ahora la marca de seq se reinicia cada vez que cambia la
   * instancia activa (adopción y bye).
   */
  it('tras un bye con seq alto, la instancia adoptada entrega su latido, su hello y su state', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    // B saluda y trabaja un rato (seq alto), luego se despide.
    raw.postMessage(hello(1, INSTANCE_B));
    for (let s = 2; s <= 100; s += 1) raw.postMessage(hb(s, INSTANCE_B));
    raw.postMessage(bye(101, INSTANCE_B));
    await waitFor(() => got.length === 101);
    expect(display.activeInstanceId).toBeNull();

    // A (pestaña en segundo plano, estrangulada) late con seq 5 → «adoptada sin hello», con marca de seq limpia.
    raw.postMessage(hb(5, INSTANCE_A));
    await waitFor(() => got.length === 102);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(got[101]).toMatchObject({ t: 'heartbeat', seq: 5, instanceId: INSTANCE_A });

    // A recupera el foco y saluda (Parte B lo hará en focus/visibilitychange).
    raw.postMessage(hello(6, INSTANCE_A));
    raw.postMessage({ v: 1, t: 'state', seq: 7, terminalId: TERMINAL, instanceId: INSTANCE_A, state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } });
    await flush(5);

    // Contrato: tras el bye, el latido seq 5 de A se entrega, y luego su hello seq 6 y state seq 7.
    const fromA = got.filter((m) => m.instanceId === INSTANCE_A);
    expect(fromA.map((m) => [m.t, m.seq])).toEqual([['heartbeat', 5], ['hello', 6], ['state', 7]]);
    expect(display.lastSeq).toBe(7);
  });

  it('variante con transportes reales: tras cerrar B, A releva y vuelve a proyectar', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true }); // A seq 1
    tabB.publish({ t: 'hello', cashier: null, sessionOpen: true }); // B seq 1 → B activa
    for (let i = 0; i < 30; i += 1) tabB.publish({ t: 'heartbeat', at: i }); // B seq 2..31
    tabB.close(); // B bye seq 32 → libera
    await waitFor(() => got.some((m) => m.t === 'bye'));

    tabA.publish({ t: 'heartbeat', at: 99 }); // A seq 2: adoptada con marca limpia → se entrega
    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true }); // A seq 3
    tabA.publish({ t: 'state', state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } }); // A seq 4
    await waitFor(() => got.filter((m) => m.instanceId === tabA.instanceId).length === 4); // hello inicial + 3
    await flush(3);

    const fromAAfterBye = got.slice(got.findIndex((m) => m.t === 'bye') + 1).filter((m) => m.instanceId === tabA.instanceId);
    expect(display.activeInstanceId).toBe(tabA.instanceId);
    expect(fromAAfterBye.map((m) => m.t)).toEqual(['heartbeat', 'hello', 'state']);
  });

  it('un hello de otra instancia tras el bye sí recupera (la ruta que funciona hoy)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage(hello(1, INSTANCE_B));
    raw.postMessage(bye(50, INSTANCE_B));
    await waitFor(() => got.length === 2);
    raw.postMessage(hello(3, INSTANCE_A)); // hello de otra instancia: reinicia la marca
    raw.postMessage(hb(4, INSTANCE_A));
    await waitFor(() => got.length === 4);
    expect(got.slice(2).map((m) => m.seq)).toEqual([3, 4]);
  });
});

describe('TESTER transporte: recarga de la caja sin bye (cierre abrupto)', () => {
  /**
   * Contrato que la Parte B debe cumplir: tras recargar /app/pos, el PRIMER
   * mensaje de la nueva instancia tiene que ser `hello`. Si llega antes un
   * latido o un estado, se descartan por «instancia no activa» y la pantalla
   * queda en Conectando hasta que llegue el hello.
   */
  it('la nueva instancia que no saluda primero es ignorada; con hello se adopta', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage(hb(500, INSTANCE_A)); // instancia vieja, sin bye (pestaña matada)
    await waitFor(() => got.length === 1);

    raw.postMessage(hb(1, INSTANCE_B)); // nueva instancia, sin hello: descartado
    raw.postMessage({ v: 1, t: 'state', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE_B, state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } });
    await flush(5);
    expect(got).toHaveLength(1);
    expect(display.activeInstanceId).toBe(INSTANCE_A);

    raw.postMessage(hello(3, INSTANCE_B));
    raw.postMessage(hb(4, INSTANCE_B));
    await waitFor(() => got.length === 3);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    expect(display.lastSeq).toBe(4);
  });
});

describe('TESTER transporte: pantalla recargada a mitad de venta (need_snapshot)', () => {
  it('la pantalla nueva adopta la instancia en curso por su latido y recibe hello+state de respuesta al need_snapshot', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    for (let i = 0; i < 50; i += 1) cashier.publish({ t: 'heartbeat', at: i }); // la caja ya lleva rato
    await flush(3);

    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    // Simula el ciclo de la Parte B: al recibir need_snapshot responde hello + state.
    cashier.onUp((m) => {
      if (m.t === 'need_snapshot') {
        cashier.publish({ t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: true });
        cashier.publish({ t: 'state', state: { mode: 'order', cart: { id: 'c', currency: 'COP', lines: [], subtotal: 0, discountTotal: 0, discountLabel: null, taxTotal: 0, taxIncluded: false, total: 0, lastChangedLineId: null }, payment: null, tip: null, thanks: null } });
      }
    });

    cashier.publish({ t: 'heartbeat', at: 50 }); // seq 51: la pantalla adopta sin hello
    await waitFor(() => got.length === 1);
    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => got.length === 3);
    expect(got.map((m) => m.t)).toEqual(['heartbeat', 'hello', 'state']);
    expect(got.map((m) => m.seq)).toEqual([51, 52, 53]);
  });
});
