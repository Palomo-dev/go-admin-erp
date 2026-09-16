/**
 * BUILDER ronda 5 (cierre) — hueco de la regla de adopción (feedback r3 #3):
 * la pantalla recién abierta suele oír un LATIDO antes de preguntar. Si el
 * need_snapshot fuera dirigido a esa activa provisional, la pestaña con caja
 * abierta nunca oiría la pregunta y no habría elección. Regla: un
 * need_snapshot solo va dirigido a una activa confirmada por su hello.
 *
 * Fixtures con organización ficticia. Sin nombres de clientes reales.
 */

import type { DownMessage, UpMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName } from '@/lib/pos/display/transport';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const CAPS = { touch: false, width: 1280, height: 800 } as const;

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1000): Promise<void> {
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
const hello = (seq: number, instanceId: string, sessionOpen: boolean): DownMessage => ({
  v: 1, t: 'hello', seq, terminalId: TERMINAL, instanceId, cashier: null, sessionOpen,
});

/** Receptor con reloj inyectado y un canal crudo para simular cajas y espiar lo que sube. */
function setup(): { display: BroadcastChannelReceiver; raw: BroadcastChannel; got: DownMessage[]; ups: UpMessage[] } {
  // Reloj fijo: la ventana de elección (500 ms) queda abierta durante todo el test.
  const clock = 100_000;
  const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
  const got: DownMessage[] = [];
  display.onDown((m) => got.push(m));
  const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
  const ups: UpMessage[] = [];
  raw.onmessage = (ev: MessageEvent<unknown>) => {
    const data = ev.data as { t?: unknown };
    if (typeof data === 'object' && data !== null && typeof data.t === 'string' && !('seq' in data)) ups.push(ev.data as UpMessage);
  };
  return { display, raw, got, ups };
}

describe('BUILDER r5: need_snapshot con activa provisional (adoptada por latido, sin hello)', () => {
  it('sale sin destinatario y abre la elección: la pestaña con caja abierta gana aunque la otra responda antes', async () => {
    const { display, raw, got, ups } = setup();
    raw.postMessage(hb(7, INSTANCE_B)); // la pestaña sin caja late primero
    await waitFor(() => got.length === 1);
    expect(display.activeInstanceId).toBe(INSTANCE_B);

    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => ups.length === 1);
    expect(ups[0]).not.toHaveProperty('toInstanceId');

    raw.postMessage(hello(8, INSTANCE_B, false)); // B responde primero, sin caja
    raw.postMessage(hello(1, INSTANCE_A, true)); // A responde después, con caja abierta
    await waitFor(() => got.length === 3);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(display.lastSeq).toBe(1);
  });

  it('el orden inverso da el mismo resultado: A (caja abierta) responde primero y el hello de B no la releva', async () => {
    const { display, raw, got } = setup();
    raw.postMessage(hb(7, INSTANCE_B));
    await waitFor(() => got.length === 1);
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();

    raw.postMessage(hello(1, INSTANCE_A, true));
    raw.postMessage(hello(8, INSTANCE_B, false));
    await waitFor(() => got.length === 2);
    await flush(3);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(got.map((m) => m.instanceId)).toEqual([INSTANCE_B, INSTANCE_A]);
  });

  it('con la activa CONFIRMADA por su hello, el need_snapshot sí va dirigido a ella', async () => {
    const { display, raw, got, ups } = setup();
    raw.postMessage(hello(1, INSTANCE_A, true));
    await waitFor(() => got.length === 1);
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => ups.length === 1);
    expect(ups[0].toInstanceId).toBe(INSTANCE_A);
  });

  it('las demás intenciones (propina, QR, calificación) siguen dirigidas a la activa aunque sea provisional', async () => {
    const { display, raw, got, ups } = setup();
    raw.postMessage(hb(3, INSTANCE_B));
    await waitFor(() => got.length === 1);
    display.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });
    display.send({ t: 'qr_paid_claim', cartId: 'c1' });
    display.send({ t: 'rating', saleId: null, rating: 5 });
    await waitFor(() => ups.length === 3);
    expect(ups.every((m) => m.toInstanceId === INSTANCE_B)).toBe(true);
  });

  it('extremo a extremo con dos cajas reales que laten: la de caja abierta gana aunque la pantalla oyó primero a la otra', async () => {
    const tabClosed = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabOpen = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    tabClosed.onUp((m) => {
      if (m.t === 'need_snapshot') tabClosed.publish({ t: 'hello', cashier: null, sessionOpen: false });
    });
    const snapshotsOpen: UpMessage[] = [];
    tabOpen.onUp((m) => {
      if (m.t !== 'need_snapshot') return;
      snapshotsOpen.push(m);
      setTimeout(() => tabOpen.publish({ t: 'hello', cashier: { name: 'Caja 1' }, sessionOpen: true }), 15);
    });

    tabClosed.publish({ t: 'heartbeat', at: 1 }); // la pantalla adopta a la cerrada, provisionalmente
    await waitFor(() => display.activeInstanceId === tabClosed.instanceId);

    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => got.some((m) => m.instanceId === tabOpen.instanceId), 2000);
    expect(snapshotsOpen).toHaveLength(1); // la pestaña con caja SÍ oyó la pregunta
    expect(display.activeInstanceId).toBe(tabOpen.instanceId);
  });
});
