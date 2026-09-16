/**
 * QA ronda 1 — casos borde del transporte BroadcastChannel que el builder no
 * cubrió. Los BUG C y D se corrigieron en la ronda 2 (instanceId en el sobre y
 * sobre escrito después del borrador): sus tests fijan ahora el contrato.
 */

import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName } from '@/lib/pos/display/transport';
import type { DownMessage, DownMessageDraft, UpMessage } from '@/lib/pos/display/protocol';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER = 'ffffffff-0000-4111-8222-333333333333';
const INSTANCE = '11111111-1111-4111-8111-111111111111';

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

const idle: DownMessageDraft = { t: 'state', state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } };

describe('QA transporte: dos cajas con el mismo terminalId (dos pestañas de /app/pos)', () => {
  /**
   * BUG C. Fase 0 identifica la terminal por localStorage, así que dos pestañas
   * del POS en el mismo navegador comparten terminalId y canal, pero cada una
   * lleva su propio contador de seq. Decisión (ronda 2): cada transporte lleva
   * un `instanceId` y la pantalla sigue a la última instancia que saluda; los
   * mensajes de las demás —latidos incluidos— se descartan.
   */
  it('BUG C: el estado de una segunda pestaña de caja debe llegar aunque la primera tenga un seq mayor', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    // La pestaña A lleva rato emitiendo (seq alto).
    for (let i = 0; i < 20; i += 1) tabA.publish({ t: 'heartbeat', at: i });
    await waitFor(() => got.length === 20);

    // La pestaña B se abre, saluda y publica su estado.
    tabB.publish({ t: 'hello', cashier: null, sessionOpen: true }); // seq 1 de B: B pasa a ser la instancia activa
    tabA.publish({ t: 'heartbeat', at: 99 }); // seq 21 de A: descartado, A ya no es la activa
    tabB.publish(idle); // seq 2 de B: aceptado
    await flush(5);

    const states = got.filter((m) => m.t === 'state');
    expect(states).toHaveLength(1);
    expect(states[0].instanceId).toBe(tabB.instanceId);
    expect(display.activeInstanceId).toBe(tabB.instanceId);
    expect(display.lastSeq).toBe(2);
  });

  it('los latidos de la pestaña de fondo no bloquean el estado de la activa, por muchos que sean', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    for (let i = 0; i < 20; i += 1) tabA.publish({ t: 'heartbeat', at: i });
    await waitFor(() => got.length === 20);
    tabB.publish({ t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => got.length === 21);

    // A sigue latiendo de fondo con seq altísimos; B publica varios estados con seq bajos.
    for (let i = 0; i < 10; i += 1) {
      tabA.publish({ t: 'heartbeat', at: 100 + i });
      tabB.publish(idle);
    }
    await flush(5);

    const fromA = got.filter((m) => m.instanceId === tabA.instanceId);
    const fromB = got.filter((m) => m.instanceId === tabB.instanceId);
    expect(fromA).toHaveLength(20); // solo lo anterior al hello de B
    expect(fromB.map((m) => m.t)).toEqual(['hello', ...Array<string>(10).fill('state')]);
    expect(fromB.map((m) => m.seq)).toEqual(Array.from({ length: 11 }, (_, i) => i + 1));
    expect(display.lastSeq).toBe(11);
  });

  it('la pestaña que recupera el foco vuelve a proyectar con un nuevo hello (última caja que saluda)', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true });
    tabB.publish({ t: 'hello', cashier: null, sessionOpen: true });
    tabA.publish(idle); // A ya no es la activa
    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true }); // A recupera el foco y saluda
    tabA.publish(idle); // ahora sí
    tabB.publish(idle); // B ha perdido la pantalla
    await flush(5);

    expect(got.map((m) => [m.t, m.instanceId === tabA.instanceId ? 'A' : 'B'])).toEqual([
      ['hello', 'A'],
      ['hello', 'B'],
      ['hello', 'A'],
      ['state', 'A'],
    ]);
  });

  it('el bye de la instancia activa la libera: la siguiente que hable es adoptada', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    tabA.publish({ t: 'heartbeat', at: 1 });
    tabB.publish({ t: 'hello', cashier: null, sessionOpen: true }); // B activa
    tabA.publish({ t: 'heartbeat', at: 2 }); // descartado
    tabB.close(); // bye: libera la instancia activa
    await waitFor(() => got.filter((m) => m.t === 'bye').length === 1);
    expect(display.activeInstanceId).toBeNull();

    tabA.publish({ t: 'heartbeat', at: 3 }); // A es adoptada sin necesidad de hello
    await waitFor(() => got.length === 4);
    expect(got[3].instanceId).toBe(tabA.instanceId);
    expect(display.activeInstanceId).toBe(tabA.instanceId);
  });

  it('un hello repetido de la misma instancia con seq viejo se descarta (hello idempotente dentro de la instancia)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    const hello = { v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, cashier: null, sessionOpen: true };
    raw.postMessage(hello);
    raw.postMessage(hello); // duplicado exacto
    raw.postMessage({ ...hello, seq: 2 }); // la caja vuelve a saludar (p. ej. tras guardar ajustes)
    await waitFor(() => got.length === 2);
    await flush();
    expect(got.map((m) => m.seq)).toEqual([1, 2]);
  });
});

describe('QA transporte: el sobre es del transporte', () => {
  /**
   * BUG D (corregido en ronda 2). publish hacía `{ v, seq, terminalId, ...draft }`
   * y un draft con `seq`/`terminalId`/`v` a runtime pisaba el sobre; el seq
   * interno seguía avanzando y los mensajes legítimos siguientes se perdían.
   * Ahora el sobre se escribe DESPUÉS del borrador.
   */
  it('BUG D: un draft con seq/terminalId propios no debe sobrescribir el sobre del transporte', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    const tampered = { t: 'heartbeat', at: 1, seq: 500, terminalId: OTHER, v: 7, instanceId: 'ajena' } as unknown as DownMessageDraft;
    cashier.publish(tampered);
    cashier.publish({ t: 'heartbeat', at: 2 });
    await flush(5);

    // El primero sale con seq 1 y terminalId/instanceId propios; el segundo con seq 2. Ambos llegan.
    expect(got.map((m) => [m.seq, m.terminalId, m.v, m.instanceId])).toEqual([
      [1, TERMINAL, 1, cashier.instanceId],
      [2, TERMINAL, 1, cashier.instanceId],
    ]);
  });

  it('un seq inyectado no silencia los mensajes siguientes: llegan seq 1, 2 y 3', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    cashier.publish({ t: 'heartbeat', at: 1, seq: 500 } as unknown as DownMessageDraft);
    cashier.publish({ t: 'heartbeat', at: 2 });
    cashier.publish(idle);
    await flush(5);

    expect(got.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(cashier.lastSeq).toBe(3);
  });

  it('el receptor tampoco deja que un draft de subida hable por otra terminal', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));

    display.send({ t: 'qr_paid_claim', cartId: 'c1', terminalId: OTHER, v: 9 } as unknown as UpMessage);
    await waitFor(() => ups.length === 1);
    expect(ups[0]).toEqual({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' });
  });
});

describe('QA transporte: hello, bye y reloj', () => {
  it('un hello duplicado (mismo seq, misma instancia) se entrega una sola vez', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    const hello = { v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, cashier: null, sessionOpen: true };
    raw.postMessage(hello);
    raw.postMessage(hello);
    await flush(5);
    expect(got).toHaveLength(1);
  });

  it('bye actualiza lastReceivedAt: la pantalla no puede fiarse solo del reloj para "Conectando" tras un bye', async () => {
    let clock = 1000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => (clock += 1000) }));
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.publish({ t: 'heartbeat', at: 1 });
    await waitFor(() => got.length === 1);
    const afterBeat = display.lastReceivedAt;
    cashier.close(); // bye
    await waitFor(() => got.length === 2);
    expect(got[1].t).toBe('bye');
    expect(display.lastReceivedAt).toBeGreaterThan(afterBeat ?? 0);
  });

  it('seq 0 pasa el guard y es aceptado como primer mensaje (el transporte real empieza en 1)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 0, terminalId: TERMINAL, instanceId: INSTANCE, at: 1 });
    await waitFor(() => got.length === 1);
    expect(display.lastSeq).toBe(0);
  });

  it('seq no entero (1.5) se rechaza; un seq gigante bloquea solo su instancia hasta el siguiente hello', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 1.5, terminalId: TERMINAL, instanceId: INSTANCE, at: 1 }); // rechazado
    raw.postMessage({ v: 1, t: 'heartbeat', seq: Number.MAX_SAFE_INTEGER, terminalId: TERMINAL, instanceId: INSTANCE, at: 2 });
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE, at: 3 }); // bloqueado
    await waitFor(() => got.length === 1);
    await flush();
    expect(got.map((m) => (m.t === 'heartbeat' ? m.at : null))).toEqual([2]);
    // Una caja recargada (otra instancia) saluda y recupera la pantalla.
    raw.postMessage({ v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: OTHER, cashier: null, sessionOpen: true });
    await waitFor(() => got.length === 2);
    expect(display.lastSeq).toBe(1);
  });

  it('receptor: tras close no llegan mensajes aunque el canal siga vivo en otros', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    display.close();
    cashier.publish({ t: 'heartbeat', at: 1 });
    await flush(5);
    expect(got).toEqual([]);
    expect(display.lastReceivedAt).toBeNull();
  });

  it('startHeartbeat tras close es no-op y stopHeartbeat sin start no lanza', () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 5 }));
    expect(() => cashier.stopHeartbeat()).not.toThrow();
    cashier.close(false);
    expect(() => cashier.startHeartbeat()).not.toThrow();
    expect(cashier.lastSeq).toBe(0);
  });

  it('close() dos veces no emite dos bye', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    // La pantalla tiene que seguir a la caja: el bye de una instancia nunca adoptada se ignora.
    cashier.publish({ t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => got.length === 1);
    cashier.close();
    cashier.close();
    await waitFor(() => got.length === 2);
    await flush();
    expect(got.filter((m) => m.t === 'bye')).toHaveLength(1);
  });

  it('el emisor descarta mensajes de subida de otra versión y no-objetos sin lanzar', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 2, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' });
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, at: 1 }); // de bajada: no es para la caja
    raw.postMessage(null);
    raw.postMessage(42);
    raw.postMessage([1, 2]);
    await flush(5);
    expect(ups).toEqual([]);
  });

  it('un state con cart.lines no-array o payment.method desconocido se descarta antes de llegar a la pantalla', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({
      v: 1, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE,
      state: { mode: 'order', cart: { lines: 'no-es-array' }, payment: null, tip: null, thanks: null },
    });
    raw.postMessage({
      v: 1, t: 'state', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE,
      state: { mode: 'payment', cart: null, payment: { method: 'bitcoin' }, tip: null, thanks: null },
    });
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 3, terminalId: TERMINAL, instanceId: INSTANCE, at: 1 });
    await waitFor(() => got.length === 1);
    await flush();
    expect(got.map((m) => m.t)).toEqual(['heartbeat']);
    expect(display.lastSeq).toBe(3);
  });
});
