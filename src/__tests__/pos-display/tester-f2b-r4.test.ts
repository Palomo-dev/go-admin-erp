/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 4.
 *
 * El builder de esta ronda no tocó código («ya estaba todo»); esta ronda
 * busca lo que las rondas 1-3 no miraron:
 *
 *  A. Dos pestañas de /app/pos: los caminos que SALUDABAN sin mirar la
 *     visibilidad. `setSession` anunciaba desde una pestaña OCULTA y, fuera
 *     de la ventana de elección, «gana la última que saluda»: cuando la
 *     pestaña visible abre la caja, la oculta recarga `cash_sessions` por
 *     Realtime (+300 ms de debounce en page.tsx) y saludaba la ÚLTIMA → la
 *     pantalla pasaba a seguir a la oculta hasta que la visible volviera a
 *     tener foco (DEFECTO F2B-R4-1, medio). CORREGIDO en la ronda 5 por los
 *     dos lados: `setSession` no saluda con la ventana oculta (emitter.ts) y
 *     el receptor no deja que un hello `visible:false` releve a una activa
 *     adoptada con `visible:true` fuera de la ventana (transport.ts). Se
 *     comprueba el escenario real, un hello oculto fabricado, el relevo al
 *     volver a verse (reannounce) y que un hello SIN `visible` releva como
 *     antes.
 *  B. Emisor · aceptación frente a la configuración CONGELADA: la caja
 *     DESCARTA (ronda 5) un `amount` con `allowCustom: false` y un porcentaje
 *     que no ofreció, con aviso en consola y sin cerrar la fase. Bordes de
 *     percent (0, 1, 100, 101), «closed» en plena pregunta, reapertura del
 *     cobro en la misma vuelta, `setTipBase` con la fase cerrada, el getter
 *     `tipSelection` frente a la instantánea del oyente, reenvío a `onUp` de
 *     un tip_selected DESCARTADO, e interruptor apagado al entrar en cobro.
 *  C. Lógica pura: monedas raras en describeTipSelection, sanitizeDisplayTip
 *     con basura fina, tipOptions con bases pequeñas (redondeo .5).
 *  D. Aviso de la caja: `onTipPhaseChange` no dispara al suscribirse (la UI
 *     lee `tipPhase` al montar) y la secuencia completa de un cobro con
 *     «closed» intercalado.
 *
 * Sin `it.failing` desde la ronda 5: los defectos que documentaba están
 * corregidos y sus pruebas exigen el comportamiento nuevo. Organización
 * ficticia (org 120), sin nombres reales.
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
import { computeTipAmount, resolveTipBase, sanitizeDisplayTip, tipOptions, type TipSelection } from '@/lib/pos/display/tip';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName, type DisplayTransport, type HelloDraft } from '@/lib/pos/display/transport';
import { resolveView } from '@/components/pos-display/logic';
import { describeTipSelection, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';

// ---------------------------------------------------------------------------
// Utilidades (mismas que las rondas anteriores)
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee4';
const INSTANCE_A = '11111111-1111-4111-8111-111111111114';
const INSTANCE_B = '22222222-2222-4222-8222-222222222224';

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
  get modes(): string[] {
    return this.states.map((s) => s.mode);
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

/** Caja arrancada, con carrito y en fase de propina pendiente (state «tip» ya emitido). */
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

/** Caja real por BroadcastChannel con instancia fija y visibilidad inyectable. */
function cajaReal(instanceId: string, opts: { visible?: () => boolean; sessionOpen?: boolean } = {}) {
  const current = { settings: settings() };
  const emitter = new DisplayEmitter({
    createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0 })),
    isEnabled: () => true,
    getSettings: () => current.settings,
    isVisible: opts.visible ?? (() => true),
    schedule: realScheduler,
  });
  emitter.start({ ...START, sessionOpen: opts.sessionOpen ?? false });
  track({ close: () => emitter.stop() });
  return { emitter, current };
}

/** Receptor real (sin displayLink): basta para saber a quién sigue la pantalla. */
function receptorReal() {
  const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000, adoptionWindowMs: 60 }));
  const states: DisplayState[] = [];
  receiver.onDown((msg) => {
    if (msg.t === 'state') states.push(msg.state);
  });
  receiver.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1280, height: 800 } });
  return { receiver, states };
}

// ---------------------------------------------------------------------------
// A. Dos pestañas: caminos que saludan sin mirar la visibilidad
// ---------------------------------------------------------------------------

describe('A. dos pestañas de /app/pos · la oculta no releva a la visible fuera de la ventana de elección', () => {
  /**
   * Escenario real (page.tsx): la pestaña VISIBLE abre la caja
   * (handleSessionOpened → setCashSession → setSession({sessionOpen:true}) →
   * hello). La OCULTA está suscrita a Realtime de `cash_sessions`, recarga la
   * sesión con 300 ms de debounce y también llama a setSession. Hasta la
   * ronda 4 su hello (visible:false) llegaba el ÚLTIMO, fuera de la ventana
   * de elección, y el receptor aplicaba «gana la última que saluda»: la
   * pantalla pasaba a pintar el carrito de la pestaña de FONDO justo al abrir
   * la caja. Desde la ronda 5 la oculta no saluda (emitter) y, aunque
   * saludara, el receptor no la deja relevar a la visible (transport).
   */
  it('F2B-R4-1 corregido: abrir la caja en la visible → la oculta recarga por Realtime (setSession) y la pantalla SIGUE a la visible', async () => {
    const oculta = cajaReal(INSTANCE_A, { visible: () => false, sessionOpen: false });
    const visible = cajaReal(INSTANCE_B, { visible: () => true, sessionOpen: false });
    visible.emitter.setActiveCart(cart());
    await flush(4);
    const pantalla = receptorReal();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B);
    await sleep(80); // la ventana de elección (60 ms) se cierra

    // La visible abre la caja: saluda con sessionOpen:true, visible:true.
    visible.emitter.setSession({ sessionOpen: true });
    await flush(4);
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_B);

    // La oculta recarga cash_sessions por Realtime (debounce 300 ms) y también llama a setSession.
    oculta.emitter.setSession({ sessionOpen: true });
    await flush(4);
    // PLAN §8, punto 0 de esta parte: la pantalla sigue a la VISIBLE y sigue pintando su pedido.
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_B);
    expect(pantalla.states[pantalla.states.length - 1].mode).toBe('order');
  });

  it('un hello visible:false FABRICADO (otra pestaña oculta, fuera de la ventana) no releva a la activa adoptada con visible:true; su state se descarta', async () => {
    const visible = cajaReal(INSTANCE_B, { visible: () => true, sessionOpen: true });
    visible.emitter.setActiveCart(cart());
    await flush(4);
    const pantalla = receptorReal();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B);
    await sleep(80);
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({
      v: PROTOCOL_VERSION, t: 'hello', seq: 500, terminalId: TERMINAL, instanceId: INSTANCE_A,
      cashier: null, sessionOpen: true, organizationId: 120, visible: false,
    });
    raw.postMessage({
      v: PROTOCOL_VERSION, t: 'state', seq: 501, terminalId: TERMINAL, instanceId: INSTANCE_A,
      state: { mode: 'idle', cart: null, payment: null, tip: null, thanks: null },
    });
    await flush(6);
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_B);
    expect(pantalla.states[pantalla.states.length - 1].mode).toBe('order'); // el «idle» de la oculta nunca llegó a la vista
  });

  it('la oculta pasa a VISIBLE y reannounce() → releva (dos hellos visibles: gana la última que saluda, como siempre)', async () => {
    const vis = { value: false };
    const oculta = cajaReal(INSTANCE_A, { visible: () => vis.value, sessionOpen: false });
    const visible = cajaReal(INSTANCE_B, { visible: () => true, sessionOpen: false });
    visible.emitter.setActiveCart(cart());
    await flush(4);
    const pantalla = receptorReal();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B);
    await sleep(80);
    oculta.emitter.setSession({ sessionOpen: true }); // oculta: no saluda
    await flush(4);
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_B);
    // El cajero cambia a la otra ventana: visibilitychange → reannounce() con visible:true y la sesión ya abierta.
    vis.value = true;
    oculta.emitter.reannounce();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A);
    expect(pantalla.states[pantalla.states.length - 1].mode).toBe('idle'); // la que ahora se ve no tiene carrito
    // Y de vuelta: la primera recupera la pantalla al verse (reannounce), sin depender de la sesión.
    visible.emitter.reannounce();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B);
    expect(pantalla.states[pantalla.states.length - 1].mode).toBe('order');
  });

  it('hello SIN `visible` (emisor anterior) releva fuera de la ventana como antes, aunque la activa se adoptara con visible:true', async () => {
    const visible = cajaReal(INSTANCE_B, { visible: () => true, sessionOpen: true });
    visible.emitter.setActiveCart(cart());
    await flush(4);
    const pantalla = receptorReal();
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B);
    await sleep(80);
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: PROTOCOL_VERSION, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, cashier: null, sessionOpen: false, organizationId: 120 });
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A);
    expect(pantalla.receiver.lastSeq).toBe(1);
  });

  it('setSession desde la pestaña OCULTA no saluda; la sesión nueva viaja en el siguiente hello (reannounce al volver a verse, con visible:true)', () => {
    const vis = { value: true };
    const h = harness({ visible: () => vis.value });
    h.emitter.start(START);
    expect(h.transport.hellos[0].visible).toBe(true);
    expect(h.transport.hellos[0].sessionOpen).toBe(false);
    vis.value = false;
    h.emitter.setSession({ sessionOpen: true, cashier: { name: 'Ana' } });
    expect(h.transport.hellos).toHaveLength(1); // oculta: nada
    vis.value = true;
    h.emitter.reannounce();
    expect(h.transport.hellos).toHaveLength(2);
    const last = h.transport.hellos[1];
    expect(last.visible).toBe(true);
    expect(last.sessionOpen).toBe(true);
    expect(last.cashier?.name).toBe('Ana');
  });

  it('setSession con la ventana VISIBLE sigue saludando en el acto (caja abierta desde la pestaña que se ve)', () => {
    const h = harness({ visible: () => true });
    h.emitter.start(START);
    h.emitter.setSession({ sessionOpen: true });
    expect(h.transport.hellos).toHaveLength(2);
    expect(h.transport.hellos[1].sessionOpen).toBe(true);
    expect(h.transport.hellos[1].visible).toBe(true);
  });

  it('setSession sin cambio real (mismo sessionOpen, mismo nombre) NO saluda: la recarga Realtime en la pestaña que ya sabía no abre otra carrera', () => {
    const h = harness();
    h.emitter.start({ ...START, sessionOpen: true, cashier: { name: 'Ana' } });
    expect(h.transport.hellos).toHaveLength(1);
    h.emitter.setSession({ sessionOpen: true });
    h.emitter.setSession({ cashier: { name: 'Ana' } });
    expect(h.transport.hellos).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// B. Emisor · aceptación frente a la configuración congelada y bordes
// ---------------------------------------------------------------------------

describe('B. emitter.ts · lo que la caja acepta frente a lo que ofreció', () => {
  it('corregido (ronda 5): con allowCustom:false congelado, un tip_selected amount se DESCARTA (aviso, fase sigue pendiente); y un percent que no está en los presets también', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = enTip({ settings: settings({ allowCustom: false, presets: [5, 10, 15] }) });
    expect(h.transport.lastState.tip?.allowCustom).toBe(false);
    const seen: TipSelection[] = [];
    h.emitter.onTipSelected((s) => seen.push(s));
    h.transport.emitUp(tipSelected('amount', 7777));
    expect(h.emitter.tipPhase).toBe('pending');
    expect(seen).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no está entre lo ofrecido'), expect.objectContaining({ kind: 'amount', value: 7777 }));

    const h2 = enTip();
    const seen2: TipSelection[] = [];
    h2.emitter.onTipSelected((s) => seen2.push(s));
    h2.transport.emitUp(tipSelected('percent', 100)); // la pantalla propia solo ofrece 5/10/15
    expect(h2.emitter.tipPhase).toBe('pending');
    expect(seen2).toEqual([]);
    // Lo ofrecido sigue entrando: la fase no se cerró y el cliente puede volver a elegir.
    h2.transport.emitUp(tipSelected('percent', 15));
    expect(h2.emitter.tipPhase).toBe('done');
    expect(seen2[0]).toEqual(expect.objectContaining({ kind: 'percent', percent: 15, amount: 3038 }));
  });

  it('lo ofrecido se acepta tal cual: amount con allowCustom:true, «none» siempre (también con allowCustom:false y presets vacíos… no: sin presets ni custom no hay fase)', () => {
    const h = enTip({ settings: settings({ allowCustom: true, presets: [5, 10, 15] }) });
    const seen: TipSelection[] = [];
    h.emitter.onTipSelected((s) => seen.push(s));
    h.transport.emitUp(tipSelected('amount', 7777));
    expect(h.emitter.tipPhase).toBe('done');
    expect(seen[0]).toEqual(expect.objectContaining({ kind: 'amount', amount: 7777 }));

    const g = enTip({ settings: settings({ allowCustom: false, presets: [10] }) });
    const seenG: TipSelection[] = [];
    g.emitter.onTipSelected((s) => seenG.push(s));
    g.transport.emitUp(tipSelected('none', 0));
    expect(g.emitter.tipPhase).toBe('done');
    expect(seenG[0]).toEqual(expect.objectContaining({ kind: 'none', amount: 0 }));
  });

  it('bordes de percent: 0 y 101 se descartan (fase sigue pending, sin aviso); 1 y 100 se aceptan cuando están entre los presets', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const bad of [0, 101, -5, 1e9]) {
      const h = enTip();
      const seen: TipSelection[] = [];
      h.emitter.onTipSelected((s) => seen.push(s));
      h.transport.emitUp(tipSelected('percent', bad));
      expect(h.emitter.tipPhase).toBe('pending');
      expect(seen).toHaveLength(0);
    }
    expect(warn).toHaveBeenCalled();
    for (const [ok, amount] of [
      [1, 203],
      [100, 20250],
    ] as const) {
      const h = enTip({ settings: settings({ presets: [1, 10, 100] }) });
      const seen: TipSelection[] = [];
      h.emitter.onTipSelected((s) => seen.push(s));
      h.transport.emitUp(tipSelected('percent', ok));
      expect(h.emitter.tipPhase).toBe('done');
      expect(seen[0].amount).toBe(amount);
    }
  });

  it('un tip_selected DESCARTADO por rango también se reenvía a onUp (la UI de la caja no debe aplicarlo por ese camino)', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = enTip();
    const ups: UpMessage[] = [];
    h.emitter.onUp((m) => ups.push(m));
    h.transport.emitUp(tipSelected('percent', 7.5));
    expect(h.emitter.tipPhase).toBe('pending');
    expect(ups.map((m) => m.t)).toEqual(['tip_selected']); // llega tal cual: CheckoutDialog solo escucha qr_paid_claim
  });

  it('setMode("closed") en plena pregunta: se pinta closed, la fase sigue pendiente, el aviso de espera se apaga; order la olvida', () => {
    const h = enTip();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    h.emitter.setMode('closed');
    h.flush();
    expect(h.transport.lastState.mode).toBe('closed');
    expect(h.emitter.tipPhase).toBe('pending');
    expect(
      resolveTipWaitingNotice({ phase: 'pending', displayMode: h.emitter.getState().mode, connected: true, touch: true }),
    ).toBeNull();
    // Una elección que llegue mientras la caja está cerrada se acepta (la fase está pendiente): la caja decide.
    h.transport.emitUp(tipSelected('percent', 10));
    expect(h.emitter.tipPhase).toBe('done');
    h.emitter.setMode('order');
    h.flush();
    expect(h.transport.lastState.mode).toBe('order');
    expect(phases).toEqual(['done', null]);
  });

  it('cancelar y reabrir el cobro en la MISMA vuelta: fases [null, pending], un solo frame «tip» y los presets se recongelan con los ajustes nuevos', () => {
    const h = enTip();
    const before = h.emitter.emittedStateCount;
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    h.current.settings = settings({ presets: [10, 20, 30] });
    h.emitter.setPayment(null);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(phases).toEqual([null, 'pending']);
    expect(h.emitter.emittedStateCount).toBe(before + 1);
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.presets).toEqual([10, 20, 30]);
    // La base se borró con setPayment(null): el frame nuevo lleva el total proyectado (5000), no 20250.
    expect(h.transport.lastState.tip?.base).toBe(5000);
  });

  it('setTipBase con la fase cerrada (done) no reemite: el cobro no lleva base y no hay nada que cambiar', () => {
    const h = enTip();
    h.transport.emitUp(tipSelected('none', 0));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    const count = h.emitter.emittedStateCount;
    h.emitter.setTipBase(99999);
    h.flush();
    expect(h.emitter.emittedStateCount).toBe(count);
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('el getter tipSelection devuelve la MISMA instantánea que recibió la caja: el importe que el cliente vio, aunque la base cambie después (ronda 8; antes seguía la base actual)', () => {
    const h = enTip();
    const seen: TipSelection[] = [];
    h.emitter.onTipSelected((s) => seen.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    expect(seen[0].amount).toBe(2025);
    h.emitter.setTipBase(30000); // los impuestos se recalcularon después del tap
    expect(h.emitter.tipSelection).toBe(seen[0]); // una sola cifra por elección, por cualquier camino de lectura
    expect(h.emitter.tipSelection?.amount).toBe(2025);
    expect(seen[0].amount).toBe(2025); // lo que pinta el aviso «Cliente eligió 10 % ($2.025)»
  });

  it('onTipPhaseChange no dispara al suscribirse con la fase ya pendiente: la UI debe leer tipPhase al montar (como hace TipFromDisplayNotice)', () => {
    const h = enTip();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    expect(phases).toEqual([]);
    expect(h.emitter.tipPhase).toBe('pending');
  });

  it('interruptor APAGADO al entrar en cobro: la fase se abre igual sin publicar nada; al encender (refresh, visible) el primer state es «tip» con la base', () => {
    const enabled = { value: false };
    const h = harness({ enabled: () => enabled.value });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.transport.published).toHaveLength(0);
    enabled.value = true;
    h.emitter.refresh();
    expect(h.transport.hellos).toHaveLength(1);
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(20250);
  });

  it('interruptor apagado + pestaña OCULTA al encender: el transporte se abre pero no saluda; un need_snapshot de la pantalla recibe hello + «tip»', () => {
    const enabled = { value: false };
    const h = harness({ enabled: () => enabled.value, visible: () => false });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    enabled.value = true;
    h.emitter.refresh();
    expect(h.emitter.isEmitting).toBe(true);
    expect(h.transport.published).toHaveLength(0);
    h.transport.emitUp({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: { touch: true, width: 1, height: 1 } });
    expect(h.transport.hellos).toHaveLength(1);
    expect(h.transport.hellos[0].visible).toBe(false);
    expect(h.transport.lastState.mode).toBe('tip');
  });

  it('carrito en «hold» (pedido en espera reactivado) también pregunta; en «hold_with_debt» no hay pedido y el cobro sale sin pregunta ni carrito', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ status: 'hold' }));
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    h.emitter.setMode('order');
    h.emitter.setActiveCart(cart({ id: 'cart-2', status: 'hold_with_debt' }));
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.emitter.tipPhase).toBeNull();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.lastState.cart).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// C. Lógica pura
// ---------------------------------------------------------------------------

describe('C. tip.ts / tipNotice.ts · bordes finos', () => {
  const sel = (kind: TipSelection['kind'], amount: number, percent: number | null): TipSelection => ({
    cartId: 'cart-1',
    kind,
    value: percent ?? amount,
    amount,
    percent,
  });

  it('describeTipSelection con moneda vacía o con espacios NO lanza (Intl lanza RangeError; formatCurrency lo traga)', () => {
    for (const currency of ['', 'COP ', 'xx']) {
      expect(() => describeTipSelection(sel('percent', 2025, 10), currency)).not.toThrow();
      expect(describeTipSelection(sel('percent', 2025, 10), currency)).toMatch(/^Cliente eligió 10 % \(/);
    }
  });

  it('tipOptions con base pequeña: el redondeo .5 va hacia arriba (base 1 · 50 % → 1) y los importes nunca son negativos ni NaN', () => {
    expect(tipOptions(1, [50, 1, 100])).toEqual([
      { percent: 50, amount: 1 },
      { percent: 1, amount: 0 },
      { percent: 100, amount: 1 },
    ]);
    expect(computeTipAmount(0.4, 100)).toBe(0);
    expect(computeTipAmount(Number.MAX_SAFE_INTEGER, 100)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('sanitizeDisplayTip: presets como strings/NaN/1e3 fuera, base negativa omitida (la pantalla cae a cart.total), selected malformado → null', () => {
    const block = sanitizeDisplayTip({
      presets: ['10', NaN, 1000, 10, 10.0, 15],
      allowCustom: 'yes',
      base: -1,
      selected: { t: 'tip_selected', cartId: 'cart-1', kind: 'percent', value: Infinity },
    });
    expect(block).toEqual({ presets: [10, 15], allowCustom: false, selected: null });
    expect(resolveTipBase(block!, { total: 4321 })).toBe(4321);
  });

  it('un bloque con presets vacíos y allowCustom true SÍ se pregunta en táctil; en no táctil resolveView cae al cobro y sin cobro válido al pedido', () => {
    const block = sanitizeDisplayTip({ presets: [], allowCustom: true });
    expect(block).toEqual({ presets: [], allowCustom: true, selected: null });
    const base: DisplayState = { mode: 'tip', cart: { id: 'c', currency: 'COP', lines: [{ id: 'l', name: 'x', qty: 1, unitPrice: 1, total: 1, modifiers: [] }], subtotal: 1, discountTotal: 0, taxTotal: 0, total: 1, lastChangedLineId: null } as unknown as DisplayState['cart'], payment: null, tip: block, thanks: null };
    expect(resolveView({ connected: true, updateRequired: false, touch: true, state: base })).toBe('tip');
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: base })).toBe('order');
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: { ...base, payment: cashPayment(1) } })).toBe('payment_cash');
  });
});

// ---------------------------------------------------------------------------
// D. Secuencia completa con pantalla no táctil
// ---------------------------------------------------------------------------

describe('D. pantalla NO táctil con propina activada · secuencia completa vista desde la caja', () => {
  it('order → tip (informativo) → el cajero teclea (skipTip) → payment → thanks → idle; el aviso cambia en cada paso', () => {
    const h = enTip();
    h.transport.emitUp({ v: PROTOCOL_VERSION, t: 'display_alive', terminalId: TERMINAL, at: 0, capabilities: { touch: false, width: 1, height: 1 } });
    const notice = () =>
      resolveTipWaitingNotice({
        phase: h.emitter.tipPhase,
        displayMode: h.emitter.getState().mode,
        connected: true,
        touch: h.emitter.lastDisplayCapabilities?.touch ?? null,
      });
    expect(notice()?.kind).toBe('informational');
    // El cajero registra lo que dijo el cliente y sigue: cashierMovedOn → skipTip.
    h.emitter.skipTip();
    h.flush();
    expect(notice()).toBeNull();
    expect(h.transport.lastState.mode).toBe('payment');
    // Una elección tardía (imposible en no táctil, posible con otra pantalla) se descarta.
    const seen: TipSelection[] = [];
    h.emitter.onTipSelected((s) => seen.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    expect(seen).toHaveLength(0);
    h.emitter.setMode('thanks', { total: 5500 });
    h.flush();
    expect(h.transport.lastState.mode).toBe('thanks');
    expect(h.emitter.tipPhase).toBeNull();
  });
});
