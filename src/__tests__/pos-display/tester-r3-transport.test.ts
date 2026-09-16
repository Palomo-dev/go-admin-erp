/**
 * TESTER ronda 3 — transporte: instancia activa muerta sin bye, carreras entre
 * pestañas al responder need_snapshot, latido con canal que falla, y orden.
 *
 * Ronda 4 (cierre): los `it.failing` de la ronda 3 pasaron a `it` y los que
 * documentaban el estado viejo (gana el último hello en la ventana de
 * elección; bye huérfano entregado) se reescribieron al contrato nuevo.
 *
 * Fixtures con organización ficticia. Sin nombres de clientes reales.
 */

import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName } from '@/lib/pos/display/transport';
import type { DownMessage, UpMessage } from '@/lib/pos/display/protocol';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';

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
const hello = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'hello', seq, terminalId: TERMINAL, instanceId, cashier: null, sessionOpen: true });
const bye = (seq: number, instanceId: string): DownMessage => ({ v: 1, t: 'bye', seq, terminalId: TERMINAL, instanceId });
const IDLE = { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } as const;

describe('TESTER transporte: instancia activa muerta sin bye', () => {
  /**
   * La pestaña activa muere sin `bye` (crash, kill del proceso). La pantalla
   * pasa a Conectando a los 3 s; releaseActiveInstance() suelta la muerta
   * (el watchdog lo hace solo a STALE_AFTER_MS) y el siguiente need_snapshot
   * sale sin destinatario, así lo atiende la pestaña viva.
   */
  it('tras N s sin latido la pantalla puede liberar la instancia y su need_snapshot llega a la pestaña viva', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsB: UpMessage[] = [];
    tabB.onUp((m) => upsB.push(m));

    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === tabA.instanceId);
    tabA.close(false); // muere sin bye

    display.releaseActiveInstance();
    expect(display.activeInstanceId).toBeNull();
    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => upsB.length === 1);
    expect(upsB[0]).not.toHaveProperty('toInstanceId');
  });

  it('antes de que venza el watchdog, need_snapshot sigue dirigido a la activa (aunque haya muerto) y la pestaña viva no lo recibe', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsB: UpMessage[] = [];
    tabB.onUp((m) => upsB.push(m));

    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === tabA.instanceId);
    tabA.close(false);

    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await flush(5);
    expect(upsB).toEqual([]);
    expect(display.activeInstanceId).toBe(tabA.instanceId); // sigue a una muerta hasta STALE_AFTER_MS

    // Salida alternativa: recrear el receptor.
    display.close();
    const fresh = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    fresh.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => upsB.length === 1);
    expect(upsB[0]).not.toHaveProperty('toInstanceId');
  });
});

describe('TESTER transporte: carrera entre dos pestañas al responder need_snapshot', () => {
  /**
   * Pantalla recién abierta (sin activa) → need_snapshot sin destinatario →
   * las DOS pestañas responden hello+state. Regla de adopción en la ventana
   * de elección: gana el hello con sessionOpen=true; a igualdad, el de seq
   * mayor; en empate total se conserva la primera. Sigue siendo contrato de
   * la Parte B responder solo desde la pestaña visible y emitir hello en
   * focus/visibilitychange: fuera de la ventana rige «gana la última».
   */
  const answer = (tab: BroadcastChannelTransport, delayMs: number, sessionOpen: boolean) =>
    tab.onUp((m) => {
      if (m.t !== 'need_snapshot') return;
      setTimeout(() => {
        tab.publish({ t: 'hello', cashier: null, sessionOpen });
        tab.publish({ t: 'state', state: IDLE });
      }, delayMs);
    });

  it('gana la pestaña con caja abierta aunque salude después (y sus states son los que pasan)', async () => {
    const tabOpen = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabClosed = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    answer(tabClosed, 0, false); // responde primero, pero sin caja abierta
    answer(tabOpen, 20, true);

    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => got.some((m) => m.t === 'state' && m.instanceId === tabOpen.instanceId), 2000);
    await flush(5);
    expect(display.activeInstanceId).toBe(tabOpen.instanceId);

    tabClosed.publish({ t: 'state', state: { ...IDLE, mode: 'order' } });
    tabOpen.publish({ t: 'state', state: { ...IDLE, mode: 'order' } });
    await flush(5);
    const orders = got.filter((m) => m.t === 'state' && m.state.mode === 'order');
    expect(orders.map((m) => m.instanceId)).toEqual([tabOpen.instanceId]);
  });

  it('con caja abierta en las dos, la que saluda primero se conserva si después saluda una igual', async () => {
    const tabFirst = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabLater = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    answer(tabFirst, 0, true);
    answer(tabLater, 20, true); // mismo sessionOpen, mismo seq (1): empate total → no releva

    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => got.filter((m) => m.t === 'state').length === 1, 2000);
    await new Promise<void>((r) => setTimeout(r, 60));
    await flush(5);
    expect(display.activeInstanceId).toBe(tabFirst.instanceId);
    expect(got.filter((m) => m.instanceId === tabLater.instanceId)).toEqual([]);
  });
});

describe('TESTER transporte: reglas de instancia con bye y hello', () => {
  it('el bye de una pestaña NO activa no libera a la activa ni se entrega', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage(hello(1, INSTANCE_A));
    raw.postMessage(hello(1, INSTANCE_B)); // B activa
    raw.postMessage(bye(2, INSTANCE_A)); // A se cierra: no es la activa
    raw.postMessage(hb(2, INSTANCE_B));
    await waitFor(() => got.length === 3);
    await flush();
    expect(got.map((m) => [m.t, m.instanceId])).toEqual([['hello', INSTANCE_A], ['hello', INSTANCE_B], ['heartbeat', INSTANCE_B]]);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });

  it('un hello repetido de la misma instancia (mismo seq) se descarta; uno con seq mayor no reinicia la marca', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage(hello(1, INSTANCE_A));
    raw.postMessage(hb(9, INSTANCE_A));
    raw.postMessage(hello(1, INSTANCE_A)); // duplicado
    raw.postMessage(hello(10, INSTANCE_A)); // re-saludo (focus)
    raw.postMessage(hb(5, INSTANCE_A)); // viejo: la marca sigue en 10
    await flush(5);
    expect(got.map((m) => [m.t, m.seq])).toEqual([['hello', 1], ['heartbeat', 9], ['hello', 10]]);
    expect(display.lastSeq).toBe(10);
  });

  it('sin activa, un bye de una instancia desconocida se ignora sin entregarlo: la UI no recibe un bye de nadie', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage(bye(7, INSTANCE_B));
    await flush(5);
    expect(got).toEqual([]);
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastSeq).toBe(-1);
    expect(display.lastByeAt).toBeNull();
    // Y la siguiente que hable se adopta con la marca limpia.
    raw.postMessage(hb(1, INSTANCE_A));
    await waitFor(() => got.length === 1);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });

  it('un hello con seq 0 de una instancia nueva releva a una activa con seq alto', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage(hb(5000, INSTANCE_A));
    raw.postMessage(hello(0, INSTANCE_B));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    expect(display.lastSeq).toBe(0);
  });

  it('la pantalla descarta mensajes de subida de versión desconocida y la caja también', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 2, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c2' });
    await waitFor(() => ups.length === 1);
    await flush();
    expect(ups.map((m) => (m.t === 'qr_paid_claim' ? m.cartId : null))).toEqual(['c2']);
  });
});

describe('TESTER transporte: latido y orden', () => {
  it('si postMessage lanza en algunos ticks del latido, el intervalo sigue vivo y los siguientes latidos llegan', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 5 }));
    const channel = (cashier as unknown as { channel: BroadcastChannel }).channel;
    const original = channel.postMessage.bind(channel);
    let calls = 0;
    channel.postMessage = (m: unknown) => {
      calls += 1;
      if (calls <= 2) throw new Error('DataCloneError simulado');
      original(m);
    };
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    cashier.startHeartbeat();
    await waitFor(() => got.length >= 2, 2000);
    cashier.stopHeartbeat();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(got[0].seq).toBe(3); // los seq 1 y 2 quedaron como hueco
    warn.mockRestore();
  });

  it('500 publicaciones seguidas llegan completas y en orden (seq 1..500)', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    for (let i = 0; i < 500; i += 1) cashier.publish({ t: 'heartbeat', at: i });
    await waitFor(() => got.length === 500, 3000);
    expect(got.every((m, i) => m.seq === i + 1)).toBe(true);
  });

  it('dos pantallas sobre la misma terminal reciben lo mismo y ambas pueden pedir snapshot', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const d1 = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const d2 = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got1: DownMessage[] = [];
    const got2: DownMessage[] = [];
    d1.onDown((m) => got1.push(m));
    d2.onDown((m) => got2.push(m));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));

    cashier.publish({ t: 'hello', cashier: { name: 'Cajero' }, sessionOpen: true });
    await waitFor(() => got1.length === 1 && got2.length === 1);
    expect(got1).toEqual(got2);
    d1.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1, height: 1 } });
    d2.send({ t: 'need_snapshot', capabilities: { touch: true, width: 2, height: 2 } });
    await waitFor(() => ups.length === 2);
    expect(ups.every((m) => m.toInstanceId === cashier.instanceId)).toBe(true);
  });

  it('startHeartbeat tras close es no-op y no deja timers vivos', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 5 }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.close(false);
    cashier.startHeartbeat();
    await new Promise<void>((r) => setTimeout(r, 30));
    await flush();
    expect(got).toEqual([]);
    expect((cashier as unknown as { heartbeatTimer: unknown }).heartbeatTimer).toBeNull();
  });
});
