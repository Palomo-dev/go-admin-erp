/**
 * BroadcastChannelTransport / BroadcastChannelReceiver en el mismo proceso
 * (Node ≥ 18 expone BroadcastChannel como global). Emisor y receptor son dos
 * canales distintos con el mismo nombre, igual que dos ventanas del navegador.
 */

import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  HEARTBEAT_INTERVAL_MS,
  displayChannelName,
  isBroadcastChannelSupported,
  type DisplayTransport,
} from '@/lib/pos/display/transport';
import type { DownMessage, UpMessage } from '@/lib/pos/display/protocol';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const OTHER_TERMINAL = 'ffffffff-0000-4111-8222-333333333333';
const INSTANCE = '11111111-1111-4111-8111-111111111111';
const INSTANCE_RELOADED = '22222222-2222-4222-8222-222222222222';

/** BroadcastChannel entrega en el siguiente giro del bucle de eventos; se espera un par de vueltas. */
async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
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

describe('BroadcastChannel en Node', () => {
  it('está disponible para las pruebas', () => {
    expect(isBroadcastChannelSupported()).toBe(true);
  });

  it('el nombre del canal es por terminal', () => {
    expect(displayChannelName(TERMINAL)).toBe(`pos-display:${TERMINAL}`);
  });
});

describe('caja → pantalla', () => {
  it('la pantalla recibe hello, state y bye con seq creciente y terminalId de la caja', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    cashier.publish({ t: 'hello', cashier: { name: 'Andrea' }, sessionOpen: true });
    cashier.publish({ t: 'state', state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null } });
    cashier.close(); // emite bye

    await waitFor(() => got.length === 3);
    expect(got.map((m) => m.t)).toEqual(['hello', 'state', 'bye']);
    expect(got.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(got.every((m) => m.v === 1 && m.terminalId === TERMINAL && m.instanceId === cashier.instanceId)).toBe(true);
    expect(cashier.instanceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(cashier.lastSeq).toBe(3);
    // El bye libera la instancia y con ella la marca de seq (ronda 3): la siguiente que hable arranca limpia.
    expect(display.activeInstanceId).toBeNull();
    expect(display.lastSeq).toBe(-1);
    expect(display.lastReceivedAt).not.toBeNull();
  });

  it('el emisor no recibe sus propios mensajes ni mensajes de bajada de otra caja', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const other = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));

    cashier.publish({ t: 'heartbeat', at: 1 });
    other.publish({ t: 'heartbeat', at: 2 });
    await flush();
    expect(ups).toEqual([]);
  });

  it('descarta mensajes de otra terminal aunque lleguen por el mismo canal', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    // Un tercero escribe en el canal con otro terminalId (defensa ante ids duplicados).
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 1, terminalId: OTHER_TERMINAL, instanceId: INSTANCE, at: 1 });
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE, at: 2 });

    await waitFor(() => got.length === 1);
    await flush();
    expect(got).toHaveLength(1);
    expect(got[0].terminalId).toBe(TERMINAL);
  });

  it('descarta seq repetido o viejo; un hello reinicia la marca (caja recargada)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    const hb = (seq: number, instanceId = INSTANCE): DownMessage => ({ v: 1, t: 'heartbeat', seq, terminalId: TERMINAL, instanceId, at: seq });

    raw.postMessage(hb(5));
    raw.postMessage(hb(5)); // repetido
    raw.postMessage(hb(3)); // viejo
    raw.postMessage(hb(6));
    await waitFor(() => got.length === 2);
    await flush();
    expect(got.map((m) => m.seq)).toEqual([5, 6]);
    expect(display.lastSeq).toBe(6);

    // La caja se recarga: nueva instancia que vuelve a empezar en 1 con hello.
    raw.postMessage({ v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_RELOADED, cashier: null, sessionOpen: false });
    raw.postMessage(hb(2, INSTANCE_RELOADED));
    await waitFor(() => got.length === 4);
    expect(got.map((m) => m.seq)).toEqual([5, 6, 1, 2]);
    expect(display.lastSeq).toBe(2);
    expect(display.activeInstanceId).toBe(INSTANCE_RELOADED);
  });

  it('descarta mensajes malformados o de otra versión', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage({ v: 2, t: 'heartbeat', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, at: 1 });
    raw.postMessage('basura');
    raw.postMessage({ v: 1, t: 'state', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE, state: null });
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 2, terminalId: TERMINAL, at: 1 }); // sin instanceId
    raw.postMessage({ v: 1, t: 'heartbeat', seq: 2, terminalId: TERMINAL, instanceId: INSTANCE, at: 1 }); // válido: adopta
    raw.postMessage({ v: 1, t: 'bye', seq: 3, terminalId: TERMINAL, instanceId: INSTANCE });

    await waitFor(() => got.length === 2);
    await flush();
    expect(got.map((m) => m.t)).toEqual(['heartbeat', 'bye']);
  });

  it('el heartbeat emite cada intervalo y se detiene con stopHeartbeat (a través de la interfaz DisplayTransport)', async () => {
    let clock = 1000;
    const concrete = track(
      new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 15, now: () => (clock += 1) }),
    );
    // La caja solo debe conocer la interfaz: startHeartbeat/stopHeartbeat forman parte de ella.
    const cashier: DisplayTransport = concrete;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const beats: number[] = [];
    display.onDown((m) => {
      if (m.t === 'heartbeat') beats.push(m.at);
    });

    cashier.startHeartbeat();
    cashier.startHeartbeat(); // idempotente
    await waitFor(() => beats.length >= 3, 2000);
    cashier.stopHeartbeat();
    const countAtStop = beats.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 60));
    await flush();

    expect(beats.length).toBe(countAtStop);
    // `at` viene del reloj inyectado y crece monótonamente.
    expect(beats.every((at, i) => i === 0 || at > beats[i - 1])).toBe(true);
    expect(concrete.lastSeq).toBe(countAtStop);
  });

  it('publish nunca lanza: un mensaje no clonable se avisa con console.warn y el flujo sigue', () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const poison = { t: 'heartbeat', at: 1, fn: () => undefined } as unknown as Parameters<typeof cashier.publish>[0];
    expect(() => cashier.publish(poison)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[pos-display] no se pudo publicar', expect.anything());
    expect(cashier.lastSeq).toBe(1); // el seq consumido queda como hueco, inocuo para el receptor
    warnSpy.mockRestore();
  });

  it('el intervalo por defecto del latido es 1 s', () => {
    expect(HEARTBEAT_INTERVAL_MS).toBe(1000);
  });
});

describe('pantalla → caja', () => {
  it('la caja recibe need_snapshot y tip_selected con v y terminalId añadidos por el receptor', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));

    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    display.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });

    await waitFor(() => ups.length === 2);
    expect(ups[0]).toEqual({
      v: 1, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: false, width: 1280, height: 800 },
    });
    expect(ups[1]).toEqual({ v: 1, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent', value: 10 });
  });

  it('la caja descarta intenciones de otra terminal y payloads inválidos', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: OTHER_TERMINAL, cartId: 'c1' });
    raw.postMessage({ v: 1, t: 'rating', terminalId: TERMINAL, saleId: null, rating: 9 });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' });

    await waitFor(() => ups.length === 1);
    await flush();
    expect(ups).toEqual([{ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1' }]);
  });

  it('las intenciones van dirigidas a la instancia que la pantalla sigue: con dos pestañas solo la activa recibe tip_selected', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsA: UpMessage[] = [];
    const upsB: UpMessage[] = [];
    tabA.onUp((m) => upsA.push(m));
    tabB.onUp((m) => upsB.push(m));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    tabA.publish({ t: 'hello', cashier: null, sessionOpen: true });
    tabB.publish({ t: 'hello', cashier: null, sessionOpen: true }); // el último hello gana: B es la activa
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(tabB.instanceId);

    display.send({ t: 'tip_selected', cartId: 'c1', kind: 'percent', value: 10 });
    await waitFor(() => upsB.length === 1);
    await flush();
    expect(upsA).toEqual([]);
    expect(upsB[0]).toEqual({
      v: 1, t: 'tip_selected', terminalId: TERMINAL, toInstanceId: tabB.instanceId, cartId: 'c1', kind: 'percent', value: 10,
    });
  });

  it('sin instancia activa, need_snapshot no lleva destinatario y lo reciben todas las pestañas', async () => {
    const tabA = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const tabB = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const upsA: UpMessage[] = [];
    const upsB: UpMessage[] = [];
    tabA.onUp((m) => upsA.push(m));
    tabB.onUp((m) => upsB.push(m));
    expect(display.activeInstanceId).toBeNull();

    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => upsA.length === 1 && upsB.length === 1);
    expect(upsA[0]).not.toHaveProperty('toInstanceId');
    expect(upsA[0]).toEqual(upsB[0]);
  });

  it('un draft de subida no decide el destinatario: sin activa se le quita; con activa se sobrescribe', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const spoofed = { t: 'qr_paid_claim', cartId: 'c1', toInstanceId: 'otra-instancia' } as unknown as UpMessage;

    display.send(spoofed); // sin activa: llega sin toInstanceId
    await waitFor(() => ups.length === 1);
    expect(ups[0]).not.toHaveProperty('toInstanceId');

    cashier.publish({ t: 'hello', cashier: null, sessionOpen: true });
    await waitFor(() => display.activeInstanceId === cashier.instanceId);
    display.send(spoofed); // con activa: el sobre gana
    await waitFor(() => ups.length === 2);
    expect(ups[1].toInstanceId).toBe(cashier.instanceId);
  });

  it('la caja descarta una intención dirigida a otra instancia o con toInstanceId malformado', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const ups: UpMessage[] = [];
    cashier.onUp((m) => ups.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));

    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c1', toInstanceId: INSTANCE });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c2', toInstanceId: '' });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c3', toInstanceId: 7 });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c4', toInstanceId: cashier.instanceId });
    raw.postMessage({ v: 1, t: 'qr_paid_claim', terminalId: TERMINAL, cartId: 'c5' });

    await waitFor(() => ups.length === 2);
    await flush();
    expect(ups.map((m) => (m.t === 'qr_paid_claim' ? m.cartId : null))).toEqual(['c4', 'c5']);
  });

  it('la pantalla no recibe mensajes de subida (solo de bajada)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const other = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    other.send({ t: 'qr_paid_claim', cartId: 'c1' });
    await flush();
    expect(got).toEqual([]);
  });
});

describe('suscripción y cierre', () => {
  it('onUp/onDown devuelven una función para darse de baja', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    const off = display.onDown((m) => got.push(m));

    cashier.publish({ t: 'heartbeat', at: 1 });
    await waitFor(() => got.length === 1);
    off();
    cashier.publish({ t: 'heartbeat', at: 2 });
    await flush();
    expect(got).toHaveLength(1);
  });

  it('un handler que lanza no impide que los demás reciban', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const got: DownMessage[] = [];
    display.onDown(() => {
      throw new Error('falla a propósito');
    });
    display.onDown((m) => got.push(m));

    cashier.publish({ t: 'heartbeat', at: 1 });
    await waitFor(() => got.length === 1);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('tras close, publicar/enviar es no-op y no llega nada', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    const ups: UpMessage[] = [];
    display.onDown((m) => got.push(m));
    cashier.onUp((m) => ups.push(m));

    cashier.close(false); // sin bye
    display.close();
    expect(cashier.isClosed).toBe(true);
    expect(display.isClosed).toBe(true);

    cashier.publish({ t: 'heartbeat', at: 1 });
    display.send({ t: 'qr_paid_claim', cartId: 'c1' });
    await flush();
    expect(got).toEqual([]);
    expect(ups).toEqual([]);
    expect(cashier.lastSeq).toBe(0);
  });

  it('close() con bye por defecto detiene el latido y deja la pantalla con un bye final', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, heartbeatIntervalMs: 10 }));
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));

    cashier.startHeartbeat();
    await waitFor(() => got.length >= 1, 2000);
    cashier.close();
    await waitFor(() => got[got.length - 1]?.t === 'bye', 2000);
    const total = got.length;
    await new Promise<void>((resolve) => setTimeout(resolve, 40));
    await flush();
    expect(got.length).toBe(total);
  });
});
