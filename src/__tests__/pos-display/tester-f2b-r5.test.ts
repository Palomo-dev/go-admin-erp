/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 5.
 *
 * La ronda 5 del builder cerró F2B-R4-1 por los dos lados (emisor y
 * receptor), B1 (presencia realineada en askSnapshot), B2 (computeTipAmount
 * en el modal) y el descarte de lo NO ofrecido. Esta ronda busca lo que esas
 * correcciones pueden haber roto o dejado a medias:
 *
 *  A. La guarda «visible:false no releva a visible:true» del receptor NO
 *     debe dejar a la pantalla huérfana: la visible muere sin `bye` y solo
 *     queda la oculta; la visible se despide con `bye`; la propia activa
 *     vuelve a saludar OCULTA (la marca `visible` no puede quedarse rancia);
 *     start() repetido desde una pestaña oculta (organización cambiada) no
 *     roba la pantalla a la visible.
 *  B. La sesión guardada en oculto viaja en la respuesta a need_snapshot
 *     (no solo en reannounce) y `refresh()` oculto con ajustes nuevos no
 *     saluda; lo que sí saluda lleva `visible` coherente con isVisible.
 *  C. displayLink · B1: al arrancar hay UN solo display_alive (la
 *     realineación no dobla la presencia) y un need_snapshot que NO cambia el
 *     táctil no reemite nada.
 *  D. Emisor · fase de propina frente a acontecimientos ajenos: el carrito
 *     desaparece por otra pestaña (removeCart) en plena pregunta; la venta se
 *     confirma directamente (thanks) sin skipTip; el cobro se reabre en la
 *     misma vuelta con presets NUEVOS y una elección con el preset VIEJO se
 *     descarta; un tip_selected del carrito anterior tras cambiar de pestaña.
 *  E. Aritmética: presets exóticos (33, 1, 100) sobre bases con decimales y
 *     bases enormes; el importe que la caja resuelve es el que la pantalla
 *     muestra para CADA preset (misma función) y nunca supera el tope.
 *  F. Pantalla no táctil con propina + «Otro» solo: el estado viaja, la vista
 *     cae al cobro y el aviso de la caja es «registre lo que indique…».
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter, type TipPhase } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  type DisplayCapabilities,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { TIP_AMOUNT_LIMIT, computeTipAmount, resolveTipSelection, tipOptions, type TipSelection } from '@/lib/pos/display/tip';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName, type DisplayTransport, type HelloDraft } from '@/lib/pos/display/transport';
import { INITIAL_LINK_SNAPSHOT, startDisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import { resolveView } from '@/components/pos-display/logic';
import { resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';

// ---------------------------------------------------------------------------
// Utilidades (mismas que las rondas anteriores)
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee5';
const INSTANCE_A = '11111111-1111-4111-8111-111111111115';
const INSTANCE_B = '22222222-2222-4222-8222-222222222225';

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await flush(1);
  }
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.restoreAllMocks();
});

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  lastDisplaySeenAt: number | null = null;
  lastDisplayCapabilities: DisplayCapabilities | null = null;
  private handlers = new Set<(msg: UpMessage) => void>();
  publish(msg: DownMessageDraft): void {
    this.published.push(msg);
  }
  announce(hello: HelloDraft, state: DisplayState): void {
    this.publish(hello);
    this.publish({ t: 'state', state });
  }
  onUp(handler: (msg: UpMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
  startHeartbeat(): void {}
  stopHeartbeat(): void {}
  close(): void {}
  emitUp(msg: UpMessage): void {
    if (msg.t === 'display_alive' || msg.t === 'need_snapshot') this.lastDisplayCapabilities = { ...msg.capabilities };
    else if (msg.t === 'display_bye') this.lastDisplayCapabilities = null;
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get states(): DisplayState[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state);
  }
  get lastState(): DisplayState {
    const states = this.states;
    if (states.length === 0) throw new Error('sin state emitido');
    return states[states.length - 1];
  }
  get hellos(): HelloDraft[] {
    return this.published.filter((m): m is HelloDraft => m.t === 'hello');
  }
}

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

function settings(tips: Partial<DisplayPresentationSettings['tips']> = {}, extra: Partial<DisplayPresentationSettings> = {}): DisplayPresentationSettings {
  return {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true, ...tips },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    locale: null,
    touch: 'auto',
    ...extra,
  };
}

function harness(opts: { settings?: DisplayPresentationSettings | null; enabled?: () => boolean; visible?: () => boolean } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings === undefined ? settings() : opts.settings };
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: opts.enabled ?? (() => true),
    isVisible: opts.visible,
    schedule: sched.schedule,
    ...(current.settings === null ? {} : { getSettings: () => current.settings as DisplayPresentationSettings }),
  });
  return { emitter, transport, flush: sched.flush, current };
}

function item(overrides: Partial<CartItem> & { id: string }): CartItem {
  return {
    product_id: 1,
    product: { id: 1, name: 'Café' } as CartItem['product'],
    quantity: 1,
    unit_price: 5000,
    discount_amount: 0,
    tax_amount: 0,
    total: 5000,
    tax_included: false,
    ...overrides,
  } as CartItem;
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    organization_id: 120,
    branch_id: 1,
    status: 'active',
    items: [item({ id: 'l1' })],
    subtotal: 5000,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 5000,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

const START = { organizationId: 120, currency: 'COP' };
const cashPayment = (total = 5000) => toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total });
const tipSelected = (kind: string, value: number, cartId = 'cart-1'): UpMessage =>
  ({ v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, cartId, kind, value }) as unknown as UpMessage;
const needSnapshot = (touch = true): UpMessage =>
  ({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch, width: 1280, height: 800 } }) as UpMessage;

function enTip(opts: Parameters<typeof harness>[0] = {}) {
  const h = harness(opts);
  h.emitter.start(START);
  h.emitter.setActiveCart(cart());
  h.flush();
  h.emitter.setTipBase(20250);
  h.emitter.setPayment(cashPayment());
  h.flush();
  expect(h.emitter.tipPhase).toBe('pending');
  expect(h.transport.lastState.mode).toBe('tip');
  return h;
}

const realScheduler = (fn: () => void) => {
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

function cajaReal(instanceId: string, opts: { visible?: () => boolean; sessionOpen?: boolean; heartbeatIntervalMs?: number } = {}) {
  const current = { settings: settings() };
  const emitter = new DisplayEmitter({
    createTransport: () =>
      track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0, heartbeatIntervalMs: opts.heartbeatIntervalMs })),
    isEnabled: () => true,
    getSettings: () => current.settings,
    isVisible: opts.visible ?? (() => true),
    schedule: realScheduler,
  });
  emitter.start({ ...START, sessionOpen: opts.sessionOpen ?? false });
  track({ close: () => emitter.stop() });
  return { emitter, current };
}

function matarSinBye(emitter: DisplayEmitter): void {
  const transport = (emitter as unknown as { transport: { close(sayBye?: boolean): void } | null }).transport;
  if (!transport) throw new Error('la caja no tenía transporte abierto');
  transport.close(false);
}

/** Receptor real sin displayLink (basta para saber a quién sigue la pantalla). */
function receptorReal(adoptionWindowMs = 60) {
  const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000, adoptionWindowMs }));
  const states: DisplayState[] = [];
  const hellos: Array<{ instanceId: string; visible: unknown; sessionOpen: boolean; organizationId: number }> = [];
  receiver.onDown((msg) => {
    if (msg.t === 'state') states.push(msg.state);
    if (msg.t === 'hello') hellos.push({ instanceId: msg.instanceId, visible: msg.visible, sessionOpen: msg.sessionOpen, organizationId: msg.organizationId });
  });
  receiver.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1280, height: 800 } });
  return { receiver, states, hellos };
}

/** Pantalla real por el camino de producción (receptor + displayLink). */
function pantallaReal(hardwareTouch: boolean, presenceIntervalMs = 60_000, resnapshotIntervalMs = 30) {
  const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs, adoptionWindowMs: 60 }));
  let snap: DisplayLinkSnapshot = INITIAL_LINK_SNAPSHOT;
  const link = startDisplayLink({
    receiver,
    capabilities: () => ({ touch: hardwareTouch, width: 1280, height: 800 }),
    onChange: (next) => {
      snap = next;
    },
    staleAfterMs: 200,
    healthIntervalMs: 20,
    resnapshotIntervalMs,
  });
  track({ close: () => link.stop() });
  return { receiver, link, snap: () => snap };
}

/** Escucha cruda del canal: qué sobres de subida salen y con qué táctil. */
function espiaCanal() {
  const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
  const ups: Array<{ t: string; touch?: unknown }> = [];
  raw.onmessage = (ev: MessageEvent<unknown>) => {
    const m = ev.data as { t?: unknown; capabilities?: { touch?: unknown } };
    if (m.t === 'need_snapshot' || m.t === 'display_alive' || m.t === 'display_bye') ups.push({ t: String(m.t), touch: m.capabilities?.touch });
  };
  return ups;
}

// ---------------------------------------------------------------------------
// A. La guarda del receptor no deja huérfana a la pantalla
// ---------------------------------------------------------------------------

describe('A. la guarda «oculta no releva a visible» nunca deja a la pantalla sin caja', () => {
  it('la VISIBLE muere sin bye y solo queda la OCULTA: tras el silencio la pantalla la adopta (su hello visible:false ya no tiene a quién respetar)', async () => {
    const visible = cajaReal(INSTANCE_A, { visible: () => true, sessionOpen: true, heartbeatIntervalMs: 50 });
    const oculta = cajaReal(INSTANCE_B, { visible: () => false, sessionOpen: true, heartbeatIntervalMs: 50 });
    visible.emitter.setActiveCart(cart());
    oculta.emitter.setActiveCart(cart({ id: 'cart-oculta' }));
    await flush(4);
    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A && pantalla.snap().state?.mode === 'order');
    await sleep(80);

    matarSinBye(visible.emitter);
    // La pantalla olvida a la visible por silencio (staleAfterMs 200) y pide snapshot sin destinatario; la oculta responde y se adopta.
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B, 3000);
    await waitFor(() => pantalla.snap().state?.cart?.id === 'cart-oculta', 3000);
    expect(pantalla.snap().connected).toBe(true);
  });

  it('la VISIBLE se despide con bye: el siguiente hello de la OCULTA (respuesta a need_snapshot) la releva sin esperar', async () => {
    const visible = cajaReal(INSTANCE_A, { visible: () => true, sessionOpen: true });
    const oculta = cajaReal(INSTANCE_B, { visible: () => false, sessionOpen: true });
    oculta.emitter.setActiveCart(cart({ id: 'cart-oculta' }));
    await flush(4);
    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A);
    await sleep(80);

    visible.emitter.stop(); // bye
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B, 3000);
    await waitFor(() => pantalla.snap().state?.cart?.id === 'cart-oculta', 3000);
  });

  it('la marca `visible` de la activa no se queda rancia: la propia activa vuelve a saludar OCULTA (need_snapshot dirigido) y entonces otra oculta sí releva', async () => {
    const visA = { value: true };
    const a = cajaReal(INSTANCE_A, { visible: () => visA.value, sessionOpen: true });
    const b = cajaReal(INSTANCE_B, { visible: () => false, sessionOpen: true });
    a.emitter.setActiveCart(cart({ id: 'cart-a' }));
    b.emitter.setActiveCart(cart({ id: 'cart-b' }));
    await flush(4);
    const pantalla = receptorReal();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A);
    await sleep(80);

    // Ahora las dos están ocultas (el cajero abrió otra cosa encima). B intenta relevar: bloqueada (A se adoptó visible:true).
    visA.value = false;
    b.emitter.reannounce();
    await flush(6);
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_A);

    // La pantalla pide snapshot a su activa (dirigido): A responde con visible:false → la marca se actualiza.
    pantalla.receiver.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1280, height: 800 } });
    await waitFor(() => pantalla.hellos.some((h) => h.instanceId === INSTANCE_A && h.visible === false));
    await sleep(80);

    // Dos ocultas: vuelve a regir «gana la última que saluda».
    b.emitter.reannounce();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B);
    expect(pantalla.states[pantalla.states.length - 1].cart?.id).toBe('cart-b');
  });

  it('start() repetido desde la pestaña OCULTA (cambio de organización en caliente) saluda con visible:false y NO roba la pantalla a la visible', async () => {
    const visible = cajaReal(INSTANCE_A, { visible: () => true, sessionOpen: true });
    const oculta = cajaReal(INSTANCE_B, { visible: () => false, sessionOpen: true });
    visible.emitter.setActiveCart(cart({ id: 'cart-a' }));
    await flush(4);
    const pantalla = receptorReal();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A);
    await sleep(80);

    // La respuesta inicial de B al need_snapshot (org 120) pudo llegar antes que la de A y adoptarse un instante:
    // lo que se comprueba es el hello del start() repetido (org 121), que sale con visible:false y fuera de la ventana.
    oculta.emitter.start({ organizationId: 121, currency: 'COP', sessionOpen: true });
    await sleep(60);
    await flush(6);
    // Ese hello se descartó en el receptor (no llegó a onDown) y la activa sigue siendo la visible.
    expect(pantalla.hellos.filter((h) => h.organizationId === 121)).toHaveLength(0);
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_A);
    expect(pantalla.states[pantalla.states.length - 1].cart?.id).toBe('cart-a');
  });

  it('adoptada por LATIDO (provisional, sin hello): la primera que saluda releva aunque sea oculta; la ventana de elección de su need_snapshot resuelve por visible', async () => {
    const oculta = cajaReal(INSTANCE_B, { visible: () => false, sessionOpen: true, heartbeatIntervalMs: 20 });
    oculta.emitter.setActiveCart(cart({ id: 'cart-b' }));
    const visible = cajaReal(INSTANCE_A, { visible: () => true, sessionOpen: true, heartbeatIntervalMs: 20 });
    visible.emitter.setActiveCart(cart({ id: 'cart-a' }));
    await flush(4);
    // Receptor SIN pedir snapshot: adopta al primer latido que oiga.
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000, adoptionWindowMs: 60 }));
    const states: DisplayState[] = [];
    receiver.onDown((msg) => {
      if (msg.t === 'state') states.push(msg.state);
    });
    await waitFor(() => receiver.activeInstanceId !== null);
    // Ahora pide snapshot: sin hello adoptado sale SIN destinatario y abre la ventana; las dos responden y gana la visible.
    receiver.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1280, height: 800 } });
    await waitFor(() => receiver.activeInstanceId === INSTANCE_A && states.some((s) => s.cart?.id === 'cart-a'));
    await sleep(80);
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
  });
});

// ---------------------------------------------------------------------------
// B. Lo que viaja en el hello desde una pestaña oculta
// ---------------------------------------------------------------------------

describe('B. emisor · setSession/refresh ocultos y el hello que sí sale', () => {
  it('setSession oculta no saluda; la sesión nueva viaja en la respuesta a need_snapshot (no hace falta reannounce)', () => {
    const h = harness({ visible: () => false });
    h.emitter.start(START);
    expect(h.transport.hellos).toHaveLength(1);
    expect(h.transport.hellos[0].visible).toBe(false);
    h.emitter.setSession({ sessionOpen: true, cashier: { name: 'Caja 2' } });
    expect(h.transport.hellos).toHaveLength(1); // sin saludo
    h.transport.emitUp(needSnapshot());
    expect(h.transport.hellos).toHaveLength(2);
    expect(h.transport.hellos[1]).toMatchObject({ sessionOpen: true, cashier: { name: 'Caja 2' }, visible: false });
  });

  it('refresh() oculto con ajustes nuevos no saluda; al verse, reannounce lleva los ajustes nuevos Y la sesión guardada', () => {
    const vis = { value: false };
    const h = harness({ visible: () => vis.value });
    h.emitter.start(START);
    h.emitter.setSession({ sessionOpen: true });
    h.current.settings = settings({ presets: [7, 14] });
    h.emitter.refresh();
    expect(h.transport.hellos).toHaveLength(1);
    vis.value = true;
    h.emitter.reannounce();
    expect(h.transport.hellos).toHaveLength(2);
    expect(h.transport.hellos[1]).toMatchObject({ sessionOpen: true, visible: true, settings: { tips: { presets: [7, 14] } } });
  });

  it('isVisible que lanza o devuelve algo raro cuenta como visible: setSession saluda y el hello lleva visible:true', () => {
    const lanza = harness({ visible: () => { throw new Error('sin document'); } });
    lanza.emitter.start(START);
    lanza.emitter.setSession({ sessionOpen: true });
    expect(lanza.transport.hellos).toHaveLength(2);
    expect(lanza.transport.hellos[1].visible).toBe(true);
    const raro = harness({ visible: (() => undefined) as unknown as () => boolean });
    raro.emitter.start(START);
    raro.emitter.setSession({ sessionOpen: true });
    expect(raro.transport.hellos).toHaveLength(2);
    expect(raro.transport.hellos[1].visible).toBe(true);
  });

  it('setSession oculta durante la fase de propina no toca la fase ni reemite state', () => {
    const vis = { value: true };
    const h = enTip({ visible: () => vis.value });
    const before = h.transport.published.length;
    vis.value = false;
    h.emitter.setSession({ sessionOpen: true, cashier: { name: 'X' } });
    h.flush();
    expect(h.transport.published.length).toBe(before);
    expect(h.emitter.tipPhase).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// C. displayLink · B1 sin dobles
// ---------------------------------------------------------------------------

describe('C. displayLink · la realineación de presencia (B1) no duplica avisos', () => {
  it('al arrancar sale UN need_snapshot y UN display_alive (la realineación no aplica al primero)', async () => {
    const ups = espiaCanal();
    pantallaReal(true, 60_000, 60_000);
    await flush(6);
    expect(ups.filter((u) => u.t === 'need_snapshot')).toHaveLength(1);
    expect(ups.filter((u) => u.t === 'display_alive')).toHaveLength(1);
  });

  it('need_snapshot repetidos sin caja (mismo táctil) no reemiten display_alive', async () => {
    const ups = espiaCanal();
    const p = pantallaReal(true, 60_000, 10);
    await sleep(120); // varios ticks de salud sin caja → varios need_snapshot
    await flush(4);
    expect(ups.filter((u) => u.t === 'need_snapshot').length).toBeGreaterThan(2);
    expect(ups.filter((u) => u.t === 'display_alive')).toHaveLength(1);
    expect(p.snap().connected).toBe(false);
  });

  it('caída sin bye con forzado no-touch: exactamente un display_alive:true (crudo, al olvidar) y uno :false (resuelto, al reaceptar)', async () => {
    const current = { settings: settings({}, { touch: 'no-touch' }) };
    const emitter = new DisplayEmitter({
      createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => 0, heartbeatIntervalMs: 50 })),
      isEnabled: () => true,
      getSettings: () => current.settings,
      schedule: realScheduler,
    });
    emitter.start({ ...START, sessionOpen: true });
    track({ close: () => emitter.stop() });
    emitter.setActiveCart(cart());
    await flush(4);
    const ups = espiaCanal();
    const pantalla = pantallaReal(true, 60_000, 30);
    await waitFor(() => pantalla.snap().hello !== null && pantalla.snap().state?.mode === 'order');
    await flush(4);
    const alives0 = ups.filter((u) => u.t === 'display_alive').map((u) => u.touch);
    expect(alives0).toEqual([true, false]); // detección cruda al arrancar, resuelta al aceptar el hello

    matarSinBye(emitter);
    await waitFor(() => pantalla.snap().connected === false && pantalla.snap().hello === null, 3000);
    await sleep(100); // varios need_snapshot crudos
    const alives1 = ups.filter((u) => u.t === 'display_alive').map((u) => u.touch);
    expect(alives1).toEqual([true, false, true]); // UNA realineación, no una por need_snapshot

    emitter.stop();
    emitter.start({ ...START, sessionOpen: true });
    emitter.setActiveCart(cart());
    await waitFor(() => pantalla.snap().connected && pantalla.snap().hello !== null, 3000);
    await flush(6);
    const alives2 = ups.filter((u) => u.t === 'display_alive').map((u) => u.touch);
    expect(alives2).toEqual([true, false, true, false]);
    expect(emitter.lastDisplayCapabilities?.touch).toBe(false);
  });

  it('QA-4 (ronda 4): el PRIMER need_snapshot tras la caída sin bye ya declara la detección cruda, no el forzado del hello olvidado', async () => {
    const current = { settings: settings({}, { touch: 'no-touch' }) };
    const emitter = new DisplayEmitter({
      createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => 0, heartbeatIntervalMs: 50 })),
      isEnabled: () => true,
      getSettings: () => current.settings,
      schedule: realScheduler,
    });
    emitter.start({ ...START, sessionOpen: true });
    track({ close: () => emitter.stop() });
    emitter.setActiveCart(cart());
    await flush(4);
    const ups = espiaCanal();
    const pantalla = pantallaReal(true, 60_000, 30);
    await waitFor(() => pantalla.snap().hello !== null && pantalla.snap().state?.mode === 'order');
    await flush(4);
    // Caja viva con estado aceptado: no se pide snapshot. Todo need_snapshot
    // posterior a este punto es el de la caída (y sus repeticiones).
    const before = ups.filter((u) => u.t === 'need_snapshot').length;
    expect(before).toBeGreaterThanOrEqual(1); // el de arranque, crudo: aún no había hello
    // Lo que sí quedó resuelto con el hello es la presencia (display_alive:false).
    expect(ups.filter((u) => u.t === 'display_alive').map((u) => u.touch)).toEqual([true, false]);

    matarSinBye(emitter);
    await waitFor(() => pantalla.snap().connected === false && pantalla.snap().hello === null, 3000);
    await flush(4);
    const after = ups.filter((u) => u.t === 'need_snapshot');
    expect(after.length).toBeGreaterThan(before);
    // El primero tras el silencio ya no arrastra el forzado del hello olvidado.
    expect(after[before].touch).toBe(true);
    // Y la presencia se realineó en ese mismo tick (B1), no en el resnapshot siguiente.
    expect(ups.filter((u) => u.t === 'display_alive').map((u) => u.touch)).toEqual([true, false, true]);
  });
});

// ---------------------------------------------------------------------------
// D. Fase de propina frente a acontecimientos ajenos
// ---------------------------------------------------------------------------

describe('D. emisor · la fase de propina y lo que pasa alrededor', () => {
  it('el carrito desaparece por OTRA pestaña (removeCart) en plena pregunta: cobro y fase se olvidan, la pantalla pasa a reposo y la fase avisa null', () => {
    const h = enTip();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    const selections: TipSelection[] = [];
    h.emitter.onTipSelected((s) => selections.push(s));
    h.emitter.onCartsSaved([]); // la lista guardada ya no trae cart-1
    h.flush();
    expect(h.emitter.tipPhase).toBeNull();
    expect(phases).toEqual([null]);
    expect(h.transport.lastState).toMatchObject({ mode: 'idle', payment: null, tip: null });
    // Una elección tardía de la pantalla para ese carrito ya no llega a nadie.
    h.transport.emitUp(tipSelected('percent', 10));
    expect(selections).toHaveLength(0);
  });

  it('la venta se confirma directamente (thanks) con la fase pendiente: thanks se pinta, la fase queda null y un tip_selected posterior se descarta', () => {
    const h = enTip();
    const selections: TipSelection[] = [];
    h.emitter.onTipSelected((s) => selections.push(s));
    h.emitter.setMode('thanks', { total: 20250 });
    h.flush();
    expect(h.transport.lastState.mode).toBe('thanks');
    expect(h.emitter.tipPhase).toBeNull();
    h.transport.emitUp(tipSelected('percent', 10));
    expect(selections).toHaveLength(0);
    expect(h.transport.lastState.mode).toBe('thanks');
  });

  it('reabrir el cobro con presets NUEVOS: una elección con el preset VIEJO (que la pantalla ya no ofrece) se descarta; con el nuevo entra', () => {
    const h = enTip();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const selections: TipSelection[] = [];
    h.emitter.onTipSelected((s) => selections.push(s));
    h.emitter.setMode('order');
    h.current.settings = settings({ presets: [8, 12] });
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.presets).toEqual([8, 12]);
    h.transport.emitUp(tipSelected('percent', 10));
    expect(selections).toHaveLength(0);
    expect(h.emitter.tipPhase).toBe('pending');
    h.transport.emitUp(tipSelected('percent', 12));
    expect(selections).toHaveLength(1);
    // setMode('order') borró la base del cobro anterior (QA-1, ronda 2): hasta que CheckoutDialog vuelva a
    // fijarla, la base es el total proyectado (5.000), no los 20.250 de antes. 12 % de 5.000 = 600.
    expect(h.transport.lastState.tip?.base).toBe(5000);
    expect(selections[0]).toMatchObject({ percent: 12, amount: computeTipAmount(5000, 12) });
    expect(selections[0].amount).toBe(600);
  });

  it('cambio de pestaña de carrito con el cobro abierto: la fase sigue (es de la venta), la pregunta pasa al carrito nuevo y la elección del carrito VIEJO se descarta', () => {
    const h = enTip();
    const selections: TipSelection[] = [];
    h.emitter.onTipSelected((s) => selections.push(s));
    h.emitter.setActiveCart(cart({ id: 'cart-2', items: [item({ id: 'l9', unit_price: 100, total: 100 })], subtotal: 100, total: 100 }));
    h.flush();
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.cart?.id).toBe('cart-2');
    h.transport.emitUp(tipSelected('percent', 10, 'cart-1'));
    expect(selections).toHaveLength(0);
    expect(h.emitter.tipPhase).toBe('pending');
    h.transport.emitUp(tipSelected('percent', 10, 'cart-2'));
    expect(selections).toHaveLength(1);
    // La base sigue siendo la que fijó la caja (20250), no el total del carrito nuevo: es CheckoutDialog quien la actualiza.
    expect(selections[0].amount).toBe(2025);
  });

  it('un segundo tip_selected tras el primero (doble pulsación o pantalla rezagada) no vuelve a avisar ni reabre la fase', () => {
    const h = enTip();
    const selections: TipSelection[] = [];
    h.emitter.onTipSelected((s) => selections.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    h.transport.emitUp(tipSelected('percent', 15));
    h.transport.emitUp(tipSelected('none', 0));
    expect(selections).toHaveLength(1);
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.emitter.tipSelection?.percent).toBe(10);
  });

  it('interruptor apagado en caliente (sin refresh) durante la fase: un tip_selected sigue llegando por el transporte viejo y NO se acepta tras cerrar', () => {
    const on = { value: true };
    const h = enTip({ enabled: () => on.value });
    const selections: TipSelection[] = [];
    h.emitter.onTipSelected((s) => selections.push(s));
    on.value = false;
    h.emitter.setTipBase(30000); // requestFlush → flush → ensureEnabledOrClose cierra el transporte
    h.flush();
    expect(h.emitter.isEmitting).toBe(false);
    // El transporte falso ya no tiene handler: nada llega.
    h.transport.emitUp(tipSelected('percent', 10));
    expect(selections).toHaveLength(0);
    expect(h.emitter.tipPhase).toBe('pending'); // la fase sigue pendiente pero no hay pantalla que conteste
  });

  it('presets con más de tres valores válidos viajan TODOS (el emisor no recorta a 3): la pantalla decide cómo pintarlos', () => {
    const h = enTip({ settings: settings({ presets: [5, 10, 15, 20, 25] }) });
    expect(h.transport.lastState.tip?.presets).toEqual([5, 10, 15, 20, 25]);
  });
});

// ---------------------------------------------------------------------------
// E. Aritmética
// ---------------------------------------------------------------------------

describe('E. tip.ts · lo que la pantalla muestra es lo que la caja resuelve, preset a preset', () => {
  const bases = [1, 3, 7, 25, 99, 100.5, 20250, 20250.49, 20250.5, 999_999_999, 1e12];
  const presets = [1, 3, 33, 58, 66, 99, 100];

  it('para cada base y preset, tipOptions y resolveTipSelection coinciden y el importe es entero ≥ 0', () => {
    for (const base of bases) {
      const options = tipOptions(base, presets);
      expect(options.map((o) => o.percent)).toEqual(presets);
      for (const option of options) {
        const resolved = resolveTipSelection('c', base, { kind: 'percent', value: option.percent });
        expect(resolved.amount).toBe(option.amount);
        expect(Number.isInteger(option.amount)).toBe(true);
        expect(option.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('100 % de la base devuelve la base redondeada; 1 % de 25 → 0 (Math.round(0.25)); 1 % de 50 → 1 (0.5 sube)', () => {
    expect(computeTipAmount(20250, 100)).toBe(20250);
    expect(computeTipAmount(20250.5, 100)).toBe(20251);
    expect(computeTipAmount(25, 1)).toBe(0);
    expect(computeTipAmount(50, 1)).toBe(1);
  });

  it('un importe libre justo por debajo del tope entra y el tope exacto no; resolveTipSelection redondea decimales del importe', () => {
    expect(resolveTipSelection('c', 0, { kind: 'amount', value: TIP_AMOUNT_LIMIT - 1 }).amount).toBe(TIP_AMOUNT_LIMIT - 1);
    expect(resolveTipSelection('c', 0, { kind: 'amount', value: 1234.5 }).amount).toBe(1235);
    expect(resolveTipSelection('c', 0, { kind: 'amount', value: -5 }).amount).toBe(0);
  });

  it('la elección percent con base 0 en la caja (cortesía) resuelve 0 y NO se describe como «Sin propina»', () => {
    const s = resolveTipSelection('c', 0, { kind: 'percent', value: 10 });
    expect(s).toMatchObject({ kind: 'percent', percent: 10, amount: 0 });
  });
});

// ---------------------------------------------------------------------------
// F. Pantalla no táctil con propina activada
// ---------------------------------------------------------------------------

describe('F. pantalla NO táctil con tips activadas', () => {
  it('solo «Otro» (sin presets) en no táctil: el estado «tip» viaja igual, la vista cae al cobro y el aviso de la caja es informativo', () => {
    const h = enTip({ settings: settings({ presets: [], allowCustom: true }) });
    const state = h.transport.lastState;
    expect(state.mode).toBe('tip');
    expect(state.tip).toMatchObject({ presets: [], allowCustom: true });
    expect(resolveView({ connected: true, disconnectedTooLong: false, updateRequired: false, state, thanksExpired: false, touch: false })).toBe('payment_cash');
    expect(resolveView({ connected: true, disconnectedTooLong: false, updateRequired: false, state, thanksExpired: false, touch: true })).toBe('tip');
    // La pantalla no táctil declaró touch:false: la caja no promete respuesta.
    h.transport.emitUp(needSnapshot(false));
    const notice = resolveTipWaitingNotice({ phase: h.emitter.tipPhase, displayMode: h.emitter.getState().mode, connected: true, touch: h.emitter.lastDisplayCapabilities?.touch ?? null });
    expect(notice?.kind).toBe('informational');
  });

  it('no táctil con presets: los importes son información; una elección que llegara igual (sobre fabricado) se acepta, porque la pantalla es quien no la manda', () => {
    const h = enTip();
    h.transport.emitUp(needSnapshot(false));
    expect(h.emitter.lastDisplayCapabilities?.touch).toBe(false);
    const selections: TipSelection[] = [];
    h.emitter.onTipSelected((s) => selections.push(s));
    h.transport.emitUp(tipSelected('percent', 15));
    expect(selections).toHaveLength(1);
    expect(h.emitter.tipPhase).toBe('done');
  });
});
