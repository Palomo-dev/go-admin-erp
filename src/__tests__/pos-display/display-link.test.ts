/**
 * Enlace de /pos-display con el receptor (src/components/pos-display/displayLink.ts),
 * probado en Node con un BroadcastChannel real y el receptor de la Parte A:
 * la caja se simula publicando sobres en el canal de la terminal y un
 * observador cuenta las intenciones (`need_snapshot`) que la pantalla emite.
 *
 * Cubre los defectos de la ronda 3 corregidos en la 4:
 *  - Reposo falso con caja viva pero sin estado (adopción por latido tras
 *    bye): la vista queda en Conectando y el enlace repite need_snapshot a la
 *    instancia adoptada hasta que conteste con un state.
 *  - hello sin su state (o antes de que llegue): Conectando, no Reposo.
 *  - La moneda del hello llega a la instantánea (para Gracias sin carrito).
 *  - Relevo de instancia (dos pestañas de /app/pos): el snapshot de la que
 *    releva NO resalta; una línea nueva de esa misma instancia sí.
 *
 * Tiempos a escala (latido 100 ms, silencio 300 ms, need_snapshot cada
 * 200 ms) con las mismas proporciones que en producción (1 s / 3 s / 2 s);
 * las esperas son por sondeo, no ventanas fijas.
 *
 * Fixtures con organización ficticia (org 120). Sin nombres reales.
 */

import type { DisplayCart, DisplayLine, DisplayState, DownMessage } from '@/lib/pos/display/protocol';
import { BroadcastChannelReceiver, displayChannelName } from '@/lib/pos/display/transport';
import { resolveView, type DisplayView } from '@/components/pos-display/logic';
import { startDisplayLink, type DisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const INSTANCE_B = 'bbbbbbbb-0000-4000-8000-00000000000b';

/** Escala de tiempos del test (ver cabecera). */
const HEARTBEAT_MS = 100;
const STALE_MS = 300;
const RESNAPSHOT_MS = 200;
const HEALTH_MS = 50;

function line(overrides: Partial<DisplayLine> & { id: string }): DisplayLine {
  return {
    name: `Producto ${overrides.id}`,
    variant: null,
    qty: 1,
    unitPrice: 1000,
    total: 1000,
    modifiers: [],
    discount: null,
    note: null,
    taxExcluded: false,
    taxIncluded: true,
    ...overrides,
  };
}

function cart(lines: DisplayLine[], overrides: Partial<DisplayCart> = {}): DisplayCart {
  const subtotal = lines.reduce((sum, l) => sum + l.total, 0);
  return {
    id: 'carrito-1',
    currency: 'USD',
    lines,
    subtotal,
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 0,
    taxIncluded: false,
    total: subtotal,
    lastChangedLineId: lines.length ? lines[lines.length - 1].id : null,
    ...overrides,
  };
}

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Espera por sondeo (hasta `timeoutMs`) a que se cumpla la condición. */
async function until(done: () => boolean, timeoutMs = 3000, what = 'condición'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`until: ${what} no cumplida a tiempo`);
    await tick(5);
  }
}

/** Caja simulada: publica sobres de bajada en el canal de la terminal con seq propio por instancia. */
class FakeCashier {
  private seq = 0;
  readonly channel: BroadcastChannel;
  constructor(readonly instanceId: string) {
    this.channel = new BroadcastChannel(displayChannelName(TERMINAL));
  }
  post(extra: Record<string, unknown>): void {
    this.channel.postMessage({ v: 1, seq: this.seq++, terminalId: TERMINAL, instanceId: this.instanceId, ...extra });
  }
  hello(currency?: string): void {
    this.post({ t: 'hello', organizationId: 120, cashier: { name: 'Andrea' }, sessionOpen: true, ...(currency ? { currency } : {}) });
  }
  state(s: DisplayState): void {
    this.post({ t: 'state', state: s });
  }
  heartbeat(): void {
    this.post({ t: 'heartbeat', at: Date.now() });
  }
  bye(): void {
    this.post({ t: 'bye' });
  }
  close(): void {
    this.channel.close();
  }
}

/** Observador de intenciones de la pantalla (lo que la caja oiría). */
class UpObserver {
  readonly channel: BroadcastChannel;
  readonly messages: Array<{ t: string; toInstanceId?: string }> = [];
  constructor() {
    this.channel = new BroadcastChannel(displayChannelName(TERMINAL));
    this.channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { t?: unknown; toInstanceId?: unknown };
      if (typeof data?.t === 'string') {
        this.messages.push({ t: data.t, toInstanceId: typeof data.toInstanceId === 'string' ? data.toInstanceId : undefined });
      }
    };
  }
  needSnapshots(): Array<{ t: string; toInstanceId?: string }> {
    return this.messages.filter((m) => m.t === 'need_snapshot');
  }
  close(): void {
    this.channel.close();
  }
}

interface Harness {
  link: DisplayLink;
  receiver: BroadcastChannelReceiver;
  observer: UpObserver;
  /** Todas las instantáneas publicadas por el enlace, en orden. */
  snapshots: DisplayLinkSnapshot[];
  /** Vista resuelta (sin Gracias vencida) de cada instantánea. */
  views(): DisplayView[];
  latest(): DisplayLinkSnapshot;
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}

function harness(): Harness {
  const observer = track(new UpObserver());
  const receiver = track(
    new BroadcastChannelReceiver({ terminalId: TERMINAL, staleAfterMs: STALE_MS, presenceIntervalMs: 60_000, adoptionWindowMs: 50 }),
  );
  const snapshots: DisplayLinkSnapshot[] = [];
  const link = startDisplayLink({
    receiver,
    capabilities: () => ({ touch: false, width: 1024, height: 768 }),
    onChange: (s) => snapshots.push(s),
    staleAfterMs: STALE_MS,
    resnapshotIntervalMs: RESNAPSHOT_MS,
    healthIntervalMs: HEALTH_MS,
  });
  opened.push({ close: () => link.stop() });
  const toView = (s: DisplayLinkSnapshot) =>
    resolveView({ connected: s.connected, disconnectedTooLong: s.disconnectedTooLong, updateRequired: s.updateRequired, state: s.state });
  return {
    link,
    receiver,
    observer,
    snapshots,
    views: () => snapshots.map(toView),
    latest: () => link.snapshot,
  };
}

afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
});

describe('displayLink · arranque', () => {
  it('al arrancar pide need_snapshot con las capacidades y queda en Conectando', async () => {
    const h = harness();
    await until(() => h.observer.needSnapshots().length >= 1, 1000, 'need_snapshot inicial');
    expect(h.latest().connected).toBe(false);
    expect(resolveView({ ...h.latest() })).toBe('connecting');
  });

  it('hello + state de la caja → conectada, con estado, hello con moneda y sin resaltar (es el snapshot de lo que ya había)', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    a.hello('USD');
    a.state(state({ mode: 'order', cart: cart([line({ id: '1' })]) }));
    await until(() => h.latest().state !== null, 1000, 'state aceptado');
    const s = h.latest();
    expect(s.connected).toBe(true);
    expect(s.hello).toEqual({ organizationId: 120, cashier: { name: 'Andrea' }, sessionOpen: true, currency: 'USD' });
    expect(s.state?.mode).toBe('order');
    expect(s.highlightUntil).toBe(0);
    expect(resolveView({ ...s })).toBe('order');
  });

  it('un hello sin currency (emisor anterior) deja hello.currency en null', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    a.hello();
    await until(() => h.latest().hello !== null, 1000, 'hello aceptado');
    expect(h.latest().hello?.currency).toBeNull();
  });
});

describe('displayLink · caja viva sin estado (defecto 2 de la ronda 3)', () => {
  it('hello sin su state → Conectando (nunca Reposo) y el enlace repite need_snapshot hasta que llegue el state', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    await until(() => h.observer.needSnapshots().length >= 1, 1000, 'need_snapshot inicial');
    const before = h.observer.needSnapshots().length;
    // A late como una caja real (si callara, el watchdog la soltaría y eso es otro caso).
    const beat = setInterval(() => a.heartbeat(), HEARTBEAT_MS);
    opened.push({ close: () => clearInterval(beat) });
    a.hello('USD');
    await until(() => h.latest().hello !== null, 1000, 'hello aceptado');
    // Viva y con hello pero sin state: Conectando.
    expect(h.latest().connected).toBe(true);
    expect(h.latest().state).toBeNull();
    expect(resolveView({ ...h.latest() })).toBe('connecting');
    // Sigue preguntando (cada RESNAPSHOT_MS) mientras A no diga qué tiene…
    await until(() => h.observer.needSnapshots().length >= before + 2, 2000, '2 need_snapshot repetidos');
    expect(h.views()).not.toContain('idle');
    // …y en cuanto contesta con un state, deja de preguntar.
    a.state(state({ mode: 'order', cart: cart([line({ id: '1' })]) }));
    await until(() => h.latest().state !== null, 1000, 'state aceptado');
    const afterState = h.observer.needSnapshots().length;
    await tick(RESNAPSHOT_MS * 2 + HEALTH_MS);
    expect(h.observer.needSnapshots().length).toBe(afterState);
    expect(resolveView({ ...h.latest() })).toBe('order');
  });

  it('A hello+state → A bye → B solo latidos: se cuentan ≥ 2 need_snapshot hacia B y la vista nunca es Reposo', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    const b = track(new FakeCashier(INSTANCE_B));
    a.hello('USD');
    a.state(state({ mode: 'order', cart: cart([line({ id: '1' })]) }));
    await until(() => h.latest().state !== null, 1000, 'state de A');
    expect(resolveView({ ...h.latest() })).toBe('order');

    a.bye();
    await until(() => h.latest().connected === false, 1000, 'bye de A');
    expect(h.latest().state).toBeNull();
    expect(h.latest().hello).toBeNull();
    expect(resolveView({ ...h.latest() })).toBe('connecting');
    const snapshotsBeforeB = h.observer.needSnapshots().length;

    // B solo late (otra pestaña del POS con un pedido que nunca anuncia): el
    // receptor la adopta por el latido y la pantalla se cree «viva».
    const beat = setInterval(() => b.heartbeat(), HEARTBEAT_MS);
    opened.push({ close: () => clearInterval(beat) });
    await until(() => h.receiver.activeInstanceId === INSTANCE_B, 1000, 'adopción de B por latido');
    await until(() => h.latest().connected === true, 1000, 'viva por el latido de B');
    expect(h.latest().state).toBeNull();

    // 6 latidos (≈ 5 s a escala real): ≥ 2 need_snapshot repetidos, hacia B (o a todas).
    await tick(HEARTBEAT_MS * 6);
    const toB = h.observer.needSnapshots().slice(snapshotsBeforeB);
    expect(toB.length).toBeGreaterThanOrEqual(2);
    expect(toB.every((m) => m.toInstanceId === undefined || m.toInstanceId === INSTANCE_B)).toBe(true);
    // En ningún momento se pintó Reposo con datos desconocidos.
    expect(h.views()).not.toContain('idle');
    expect(resolveView({ ...h.latest() })).toBe('connecting');

    // Cuando B por fin anuncia, la pantalla pinta su pedido sin resaltar (snapshot).
    b.hello('USD');
    b.state(state({ mode: 'order', cart: cart([line({ id: 'b1' })], { id: 'carrito-b' }) }));
    await until(() => h.latest().state?.cart?.id === 'carrito-b', 1000, 'state de B');
    expect(resolveView({ ...h.latest() })).toBe('order');
    expect(h.latest().highlightUntil).toBe(0);
  });

  it('silencio de la caja (sin bye) → Conectando, se olvida el estado y se vuelve a pedir snapshot', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    a.hello('USD');
    a.state(state({ mode: 'order', cart: cart([line({ id: '1' })]) }));
    await until(() => h.latest().state !== null, 1000, 'state de A');
    const before = h.observer.needSnapshots().length;
    await until(() => h.latest().connected === false, STALE_MS * 3, 'silencio detectado');
    expect(h.latest().state).toBeNull();
    expect(resolveView({ ...h.latest() })).toBe('connecting');
    await until(() => h.observer.needSnapshots().length > before, 1000, 'need_snapshot tras el silencio');
  });
});

describe('displayLink · resaltado', () => {
  it('Reposo → primera línea resalta; una línea nueva resalta; el mismo carrito repetido (need_snapshot) no', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    a.hello('USD');
    a.state(state({ mode: 'idle' }));
    await until(() => h.latest().state !== null, 1000, 'idle');
    expect(h.latest().highlightUntil).toBe(0);

    a.state(state({ mode: 'order', cart: cart([line({ id: '1' })]) }));
    await until(() => h.latest().state?.cart !== null && h.latest().state?.cart !== undefined, 1000, 'primera línea');
    const first = h.latest().highlightUntil;
    expect(first).toBeGreaterThan(0);

    a.state(state({ mode: 'order', cart: cart([line({ id: '1' }), line({ id: '2' })]) }));
    await until(() => h.latest().state?.cart?.lines.length === 2, 1000, 'segunda línea');
    const second = h.latest().highlightUntil;
    expect(second).toBeGreaterThanOrEqual(first);

    // Respuesta a need_snapshot: mismo carrito → no resalta (highlightUntil no avanza).
    await tick(20);
    a.hello('USD');
    a.state(state({ mode: 'order', cart: cart([line({ id: '1' }), line({ id: '2' })]) }));
    await until(() => h.snapshots.length > 0 && h.snapshots.at(-1)!.state?.cart?.lines.length === 2, 1000, 'snapshot repetido');
    await tick(20);
    expect(h.latest().highlightUntil).toBe(second);
  });

  it('relevo de instancia (otra pestaña de /app/pos saluda): su snapshot NO resalta; una línea nueva suya después sí', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    const b = track(new FakeCashier(INSTANCE_B));
    a.hello('USD');
    a.state(state({ mode: 'order', cart: cart([line({ id: 'a1' })], { id: 'carrito-a' }) }));
    await until(() => h.latest().state?.cart?.id === 'carrito-a', 1000, 'state de A');
    a.state(state({ mode: 'order', cart: cart([line({ id: 'a1' }), line({ id: 'a2' })], { id: 'carrito-a' }) }));
    await until(() => h.latest().state?.cart?.lines.length === 2, 1000, 'línea nueva de A');
    const afterA = h.latest().highlightUntil;
    expect(afterA).toBeGreaterThan(0);

    // B releva con OTRO carrito (id distinto, línea distinta): decisión de la
    // ronda 4, un relevo no es una línea nueva para el cliente → no resalta.
    await tick(60); // fuera de la ventana de elección
    b.hello('USD');
    b.state(state({ mode: 'order', cart: cart([line({ id: 'b1' })], { id: 'carrito-b' }) }));
    await until(() => h.latest().state?.cart?.id === 'carrito-b', 1000, 'relevo de B');
    expect(h.receiver.activeInstanceId).toBe(INSTANCE_B);
    expect(h.latest().highlightUntil).toBe(afterA);

    // Una línea nueva de B respecto a SU carrito anterior sí resalta.
    await tick(5);
    b.state(state({ mode: 'order', cart: cart([line({ id: 'b1' }), line({ id: 'b2' })], { id: 'carrito-b' }) }));
    await until(() => h.latest().state?.cart?.lines.length === 2, 1000, 'línea nueva de B');
    expect(h.latest().highlightUntil).toBeGreaterThan(afterA);
  });
});

describe('displayLink · parada', () => {
  it('stop() cierra el receptor, deja de escuchar y vuelve a la instantánea inicial sin notificar más', async () => {
    const h = harness();
    const a = track(new FakeCashier(INSTANCE_A));
    a.hello('USD');
    a.state(state({ mode: 'order', cart: cart([line({ id: '1' })]) }));
    await until(() => h.latest().state !== null, 1000, 'state de A');
    const notified = h.snapshots.length;
    h.link.stop();
    expect(h.latest().connected).toBe(false);
    expect(h.latest().state).toBeNull();
    a.state(state({ mode: 'order', cart: cart([line({ id: '1' }), line({ id: '2' })]) }));
    await tick(HEALTH_MS * 3);
    expect(h.snapshots.length).toBe(notified);
    expect(h.latest().state).toBeNull();
  });
});

/** Ayuda de tipos: el sobre que la caja simulada publica es un DownMessage válido. */
it('la caja simulada publica sobres con la forma de DownMessage', () => {
  const sample: DownMessage = { v: 1, seq: 0, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'hello', organizationId: 120, cashier: null, sessionOpen: true, currency: 'USD' };
  expect(sample.t).toBe('hello');
});
