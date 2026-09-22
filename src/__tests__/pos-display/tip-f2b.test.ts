/**
 * Fase 2 · Parte B — Propina en pantalla (PLAN §4.2, §4.4, §5.3) y deuda
 * del QA de la Parte A (la pantalla elige la caja VISIBLE).
 *
 * 1. transport.ts · isBetterHello con `hello.visible`: dos emisores (uno
 *    oculto con seq alto, otro visible con seq bajo) → el receptor adopta al
 *    visible; un hello sin el campo se compara como antes.
 * 2. tip.ts · aritmética pura: redondeo, presets, importe libre, saneado.
 * 3. emitter.ts · máquina de estados: tip solo si tips.enabled; tip_selected
 *    llega a la caja y la pantalla pasa a payment; skipTip vuelve a payment;
 *    cancelar vuelve a order; thanks limpia.
 * 4. logic.ts · resolveView 'tip' y sanitizeDisplayState del bloque tip.
 * 5. Ronda 3 (QA): una entrada QR ya cobrada no se reescribe con «Aplicar»
 *    (QA-1); la entrada pre-rellenada sigue a la propina en ambos sentidos
 *    (QA-3); la pantalla declara el táctil RESUELTO y la caja lo sigue por
 *    onDisplayCapabilitiesChange (QA-2, QA-5).
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter, type TipPhase } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessage,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import {
  TIP_AMOUNT_LIMIT,
  TIP_CUSTOM_MAX_DIGITS,
  computeTipAmount,
  isAcceptableTipChoice,
  isValidTipPercent,
  resolveTipBase,
  resolveTipSelection,
  sanitizeDisplayTip,
  sanitizeTipAmount,
  tipOptions,
  type TipSelection,
} from '@/lib/pos/display/tip';
import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  HEARTBEAT_INTERVAL_MS,
  displayChannelName,
  isBetterHello,
  type DisplayTransport,
  type HelloDraft,
} from '@/lib/pos/display/transport';
import { readFileSync } from 'fs';
import { join } from 'path';
import { resolveTouch, resolveView, sanitizeDisplayState, viewShowsAmounts } from '@/components/pos-display/logic';
import { INITIAL_LINK_SNAPSHOT, startDisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import {
  TIP_INFORMATIONAL_ACTION,
  TIP_INFORMATIONAL_TEXT,
  TIP_WAITING_ACTION,
  TIP_WAITING_TEXT,
  applyTipToPrefilledPayment,
  describeTipSelection,
  isInformativeTipSelection,
  resolveNoticeTouch,
  resolveTipWaitingNotice,
} from '@/components/pos/display/tipNotice';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const CAPS = { touch: true, width: 1280, height: 800 } as const;

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

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. transport.ts · la pantalla elige la caja VISIBLE
// ---------------------------------------------------------------------------

describe('transport.ts · isBetterHello prefiere la caja visible (deuda del QA de F2-A)', () => {
  const hello = (seq: number, instanceId: string, visible?: boolean, sessionOpen = true): DownMessage => ({
    v: 1,
    t: 'hello',
    seq,
    terminalId: TERMINAL,
    instanceId,
    cashier: null,
    sessionOpen,
    organizationId: 1,
    ...(visible === undefined ? {} : { visible }),
  });

  async function openElection() {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    return { display, raw, got, tick: (ms: number) => (clock += ms) };
  }

  it('isBetterHello: visible manda antes que sessionOpen y seq; sin el campo en alguno se compara como antes', () => {
    // visible decide
    expect(isBetterHello({ visible: true, sessionOpen: false, seq: 1 }, { visible: false, sessionOpen: true, seq: 99 })).toBe(true);
    expect(isBetterHello({ visible: false, sessionOpen: true, seq: 99 }, { visible: true, sessionOpen: false, seq: 1 })).toBe(false);
    // ambas visibles: sessionOpen y luego seq, como antes
    expect(isBetterHello({ visible: true, sessionOpen: true, seq: 1 }, { visible: true, sessionOpen: false, seq: 99 })).toBe(true);
    expect(isBetterHello({ visible: true, sessionOpen: true, seq: 5 }, { visible: true, sessionOpen: true, seq: 5 })).toBe(false);
    expect(isBetterHello({ visible: true, sessionOpen: true, seq: 6 }, { visible: true, sessionOpen: true, seq: 5 })).toBe(true);
    // compatibilidad: sin el campo en cualquiera de los dos, no decide
    expect(isBetterHello({ visible: true, sessionOpen: false, seq: 1 }, { visible: null, sessionOpen: true, seq: 99 })).toBe(false);
    expect(isBetterHello({ visible: null, sessionOpen: true, seq: 100 }, { visible: false, sessionOpen: true, seq: 99 })).toBe(true);
    expect(isBetterHello({ visible: null, sessionOpen: true, seq: 1 }, { visible: null, sessionOpen: true, seq: 99 })).toBe(false);
    // sin hello previo cualquiera releva
    expect(isBetterHello({ visible: false, sessionOpen: false, seq: 0 }, null)).toBe(true);
  });

  it('dos emisores: el OCULTO con seq alto responde primero y el VISIBLE con seq bajo lo releva', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hello(500, INSTANCE_B, false));
    raw.postMessage(hello(2, INSTANCE_A, true));
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    expect(display.lastSeq).toBe(2);
  });

  it('dos emisores: el VISIBLE responde primero y el OCULTO (seq alto, caja abierta) NO lo releva', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hello(2, INSTANCE_A, true, false));
    raw.postMessage(hello(500, INSTANCE_B, false, true));
    await flush(5);
    expect(got.map((m) => m.instanceId)).toEqual([INSTANCE_A]);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });

  it('compatibilidad: un hello sin `visible` frente a otro con `visible: true` se decide por sessionOpen/seq como antes', async () => {
    const { display, raw, got } = await openElection();
    raw.postMessage(hello(40, INSTANCE_B)); // emisor anterior, sin el campo
    raw.postMessage(hello(2, INSTANCE_A, true)); // visible pero seq menor: no es «mejor» sin poder comparar visibilidad
    await flush(5);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    raw.postMessage(hello(41, INSTANCE_A, true)); // seq mayor: releva por la regla de siempre
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
  });

  it('isDownMessage: `visible` opcional y booleano; otro tipo invalida el hello', () => {
    expect(isDownMessage(hello(1, INSTANCE_A))).toBe(true);
    expect(isDownMessage(hello(1, INSTANCE_A, true))).toBe(true);
    expect(isDownMessage(hello(1, INSTANCE_A, false))).toBe(true);
    expect(isDownMessage({ ...hello(1, INSTANCE_A), visible: 'yes' })).toBe(false);
  });

  it('extremo a extremo con BroadcastChannelTransport: la caja visible gana con isVisible inyectado en el emisor', async () => {
    const presentation: DisplayPresentationSettings = {
      tips: { enabled: false, presets: [5, 10, 15], allowCustom: true },
      rating: { enabled: false },
      showTaxBreakdown: false,
      showCustomerName: false,
      locale: null,
      touch: 'auto',
    };
    function caja(instanceId: string, visible: boolean): DisplayEmitter {
      const emitter = new DisplayEmitter({
        createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0 })),
        isEnabled: () => true,
        getSettings: () => presentation,
        isVisible: () => visible,
        schedule: (fn) => {
          const id = setTimeout(fn, 0);
          return () => clearTimeout(id);
        },
      });
      emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
      return emitter;
    }
    const oculta = caja(INSTANCE_B, false);
    for (let i = 0; i < 20; i += 1) {
      oculta.setSession({ cashier: { name: `c${i}` } }); // sube el seq de la oculta
    }
    await flush(4);
    const visible = caja(INSTANCE_A, true);
    await flush(4);

    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const hellos: Array<{ instanceId: string; visible: boolean | undefined }> = [];
    display.onDown((m) => {
      if (m.t === 'hello') hellos.push({ instanceId: m.instanceId, visible: m.visible });
    });
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    expect(hellos.some((h) => h.instanceId === INSTANCE_A && h.visible === true)).toBe(true);
    oculta.stop();
    visible.stop();
  });
});

// ---------------------------------------------------------------------------
// 2. tip.ts · aritmética pura
// ---------------------------------------------------------------------------

describe('tip.ts · importes de propina', () => {
  it('computeTipAmount redondea al entero como handleTipPercentage del modal (10 % de 20.250 = 2.025)', () => {
    expect(computeTipAmount(20250, 10)).toBe(2025);
    expect(computeTipAmount(20255, 10)).toBe(2026); // 2025,5 → 2026
    expect(computeTipAmount(20254, 10)).toBe(2025); // 2025,4 → 2025
    expect(computeTipAmount(33333, 15)).toBe(5000); // 4999,95 → 5000
    expect(computeTipAmount(100, 5)).toBe(5);
  });

  it('computeTipAmount nunca negativo ni NaN: base o porcentaje inválidos → 0', () => {
    expect(computeTipAmount(0, 10)).toBe(0);
    expect(computeTipAmount(-100, 10)).toBe(0);
    expect(computeTipAmount(Number.NaN, 10)).toBe(0);
    expect(computeTipAmount(1000, 0)).toBe(0);
    expect(computeTipAmount(1000, -5)).toBe(0);
    expect(computeTipAmount(1000, Number.POSITIVE_INFINITY)).toBe(0);
    expect(computeTipAmount('1000', 10)).toBe(0);
  });

  it('tipOptions: presets con importe, en orden, sin repetidos ni inválidos', () => {
    expect(tipOptions(20000, [5, 10, 15])).toEqual([
      { percent: 5, amount: 1000 },
      { percent: 10, amount: 2000 },
      { percent: 15, amount: 3000 },
    ]);
    expect(tipOptions(20000, [10, 10, 0, 101, 7.5, 'x', 15])).toEqual([
      { percent: 10, amount: 2000 },
      { percent: 15, amount: 3000 },
    ]);
    expect(tipOptions(20000, null)).toEqual([]);
    expect(tipOptions(0, [5])).toEqual([{ percent: 5, amount: 0 }]);
  });

  it('isValidTipPercent: entero en [1, 100]', () => {
    expect([1, 50, 100].every(isValidTipPercent)).toBe(true);
    expect([0, 101, 7.5, -1, Number.NaN, '10', null].some(isValidTipPercent)).toBe(false);
  });

  it('resolveTipSelection: percent → importe sobre la base; amount → entero saneado; none/desconocido → 0', () => {
    expect(resolveTipSelection('c1', 20250, { kind: 'percent', value: 10 })).toEqual({
      cartId: 'c1',
      kind: 'percent',
      value: 10,
      amount: 2025,
      percent: 10,
    });
    expect(resolveTipSelection('c1', 20250, { kind: 'amount', value: 3000.4 })).toEqual({
      cartId: 'c1',
      kind: 'amount',
      value: 3000,
      amount: 3000,
      percent: null,
    });
    expect(resolveTipSelection('c1', 20250, { kind: 'none', value: 0 })).toEqual({ cartId: 'c1', kind: 'none', value: 0, amount: 0, percent: null });
    expect(resolveTipSelection('c1', 20250, { kind: 'percent', value: 0 }).amount).toBe(0); // porcentaje inválido → sin propina
    expect(resolveTipSelection('c1', 20250, { kind: 'amount', value: -5 }).amount).toBe(0);
    expect(resolveTipSelection('c1', 20250, { kind: 'rating', value: 5 }).kind).toBe('none');
  });

  it('sanitizeTipAmount: entero no negativo', () => {
    expect(sanitizeTipAmount(1234.6)).toBe(1235);
    expect(sanitizeTipAmount(0)).toBe(0);
    expect(sanitizeTipAmount(-3)).toBe(0);
    expect(sanitizeTipAmount(Number.NaN)).toBe(0);
    expect(sanitizeTipAmount('5')).toBe(0);
  });

  it('sanitizeDisplayTip: filtra presets, normaliza allowCustom y base; sin nada que preguntar → null', () => {
    expect(sanitizeDisplayTip({ presets: [5, 10, 15], allowCustom: true, selected: null, base: 20250 })).toEqual({
      presets: [5, 10, 15],
      allowCustom: true,
      selected: null,
      base: 20250,
    });
    expect(sanitizeDisplayTip({ presets: [0, 'x', 10, 10], allowCustom: 'sí', selected: undefined, base: 'n' })).toEqual({
      presets: [10],
      allowCustom: false,
      selected: null,
    });
    expect(sanitizeDisplayTip({ presets: [], allowCustom: false, selected: null })).toBeNull();
    expect(sanitizeDisplayTip({ presets: [], allowCustom: true, selected: null })).toEqual({ presets: [], allowCustom: true, selected: null });
    expect(sanitizeDisplayTip(null)).toBeNull();
    expect(sanitizeDisplayTip([5, 10])).toBeNull();
    const selected = { v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, cartId: 'c1', kind: 'percent', value: 10 };
    expect(sanitizeDisplayTip({ presets: [10], allowCustom: false, selected })?.selected).toEqual(selected);
    expect(sanitizeDisplayTip({ presets: [10], allowCustom: false, selected: { t: 'rating' } })?.selected).toBeNull();
  });

  it('resolveTipBase (pantalla): la base de la caja o, si falta, el total del carrito', () => {
    expect(resolveTipBase({ base: 20250 }, { total: 99 })).toBe(20250);
    expect(resolveTipBase({}, { total: 99 })).toBe(99);
    expect(resolveTipBase({ base: Number.NaN }, { total: 99 })).toBe(99);
    expect(resolveTipBase({}, { total: Number.NaN })).toBe(0);
  });

  it('describeTipSelection (caja): «Cliente eligió 10 % ($X)», importe libre y sin propina', () => {
    expect(describeTipSelection({ cartId: 'c', kind: 'percent', value: 10, amount: 2025, percent: 10 }, 'COP')).toMatch(/^Cliente eligió 10 % \(.*2\.025.*\)$/);
    expect(describeTipSelection({ cartId: 'c', kind: 'amount', value: 3000, amount: 3000, percent: null }, 'COP')).toMatch(/^Cliente eligió una propina de .*3\.000/);
    expect(describeTipSelection({ cartId: 'c', kind: 'none', value: 0, amount: 0, percent: null }, 'COP')).toBe('Cliente eligió no dejar propina');
  });
});

// ---------------------------------------------------------------------------
// 3. emitter.ts · máquina de estados order → tip → payment → thanks
// ---------------------------------------------------------------------------

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  lastDisplaySeenAt: number | null = null;
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
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get lastState(): DisplayState {
    const states = this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state');
    if (states.length === 0) throw new Error('sin state emitido');
    return states[states.length - 1].state;
  }
  get modes(): string[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state.mode);
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

function settings(tips: Partial<DisplayPresentationSettings['tips']> = {}): DisplayPresentationSettings {
  return {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true, ...tips },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    locale: null,
    touch: 'auto',
  };
}

function harness(opts: { settings?: DisplayPresentationSettings | null } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings === undefined ? settings() : opts.settings };
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
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
const cashPayment = () => toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 5000 });
const tipSelected = (kind: 'percent' | 'amount' | 'none', value: number, cartId = 'cart-1'): UpMessage => ({
  v: PROTOCOL_VERSION,
  t: 'tip_selected',
  terminalId: TERMINAL,
  cartId,
  kind,
  value,
});

describe('emitter.ts · fase de propina (F2-B)', () => {
  it('con tips.enabled, entrar en cobro emite mode tip con presets, allowCustom y base; el cobro viaja también', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    expect(h.transport.lastState.mode).toBe('order');
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.flush();
    const state = h.transport.lastState;
    expect(state.mode).toBe('tip');
    expect(state.tip).toEqual({ presets: [5, 10, 15], allowCustom: true, selected: null, base: 20250 });
    expect(state.payment?.method).toBe('cash');
    expect(state.cart?.id).toBe('cart-1');
    expect(h.emitter.tipPhase).toBe('pending');
    expect(isDownMessage({ v: 1, t: 'state', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, state })).toBe(true);
  });

  it('sin tips.enabled (o sin getSettings) entrar en cobro va directo a payment', () => {
    const off = harness({ settings: settings({ enabled: false }) });
    off.emitter.start(START);
    off.emitter.setActiveCart(cart());
    off.emitter.setPayment(cashPayment());
    off.flush();
    expect(off.transport.lastState.mode).toBe('payment');
    expect(off.transport.lastState.tip).toBeNull();
    expect(off.emitter.tipPhase).toBeNull();

    const none = harness({ settings: null });
    none.emitter.start(START);
    none.emitter.setActiveCart(cart());
    none.emitter.setPayment(cashPayment());
    none.flush();
    expect(none.transport.lastState.mode).toBe('payment');
  });

  it('sin presets válidos ni «Otro» no hay pregunta; con solo «Otro» sí', () => {
    const nada = harness({ settings: settings({ presets: [], allowCustom: false }) });
    nada.emitter.start(START);
    nada.emitter.setActiveCart(cart());
    nada.emitter.setPayment(cashPayment());
    nada.flush();
    expect(nada.transport.lastState.mode).toBe('payment');

    const otro = harness({ settings: settings({ presets: [0, 200], allowCustom: true }) });
    otro.emitter.start(START);
    otro.emitter.setActiveCart(cart());
    otro.emitter.setPayment(cashPayment());
    otro.flush();
    expect(otro.transport.lastState.mode).toBe('tip');
    expect(otro.transport.lastState.tip).toEqual({ presets: [], allowCustom: true, selected: null, base: 5000 });
  });

  it('sin base de la caja, la base es el total proyectado; setTipBase reemite en fase pendiente', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ total: 7000 }));
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(7000);
    h.emitter.setTipBase(7500);
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(7500);
    h.emitter.setTipBase(Number.NaN); // inválida → se retira y vuelve al total proyectado
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(7000);
  });

  it('sin carrito con líneas no se pregunta (un cobro sin pedido no tiene sobre qué calcular)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [], total: 0 }));
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('tip_selected del carrito proyectado: llega a la caja resuelto a importe, cierra la fase y la pantalla pasa a payment', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.flush();
    const received: unknown[] = [];
    h.emitter.onTipSelected((sel) => received.push(sel));
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(received).toEqual([{ cartId: 'cart-1', kind: 'percent', value: 10, amount: 2025, percent: 10 }]);
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.emitter.tipSelection).toEqual({ cartId: 'cart-1', kind: 'percent', value: 10, amount: 2025, percent: 10 });
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.lastState.tip).toBeNull(); // nada se aplica solo: el cobro no muestra la propina como hecha
    // Una segunda elección (pantalla rezagada) ya no se entrega.
    h.transport.emitUp(tipSelected('percent', 15));
    h.flush();
    expect(received).toHaveLength(1);
    expect(h.emitter.tipSelection?.percent).toBe(10);
  });

  it('tip_selected de OTRO carrito o fuera de la fase se descarta', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    const received: unknown[] = [];
    h.emitter.onTipSelected((sel) => received.push(sel));
    h.transport.emitUp(tipSelected('percent', 10)); // sin cobro: sin fase
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10, 'cart-otro'));
    h.flush();
    expect(received).toEqual([]);
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.transport.lastState.mode).toBe('tip');
  });

  it('«Sin propina» e importe libre también cierran la fase con su importe', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    const received: Array<{ kind: string; amount: number }> = [];
    h.emitter.onTipSelected((sel) => received.push({ kind: sel.kind, amount: sel.amount }));
    h.transport.emitUp(tipSelected('none', 0));
    h.flush();
    expect(received).toEqual([{ kind: 'none', amount: 0 }]);
    expect(h.transport.lastState.mode).toBe('payment');

    const g = harness();
    g.emitter.start(START);
    g.emitter.setActiveCart(cart());
    g.emitter.setPayment(cashPayment());
    g.flush();
    const got: Array<{ kind: string; amount: number }> = [];
    g.emitter.onTipSelected((sel) => got.push({ kind: sel.kind, amount: sel.amount }));
    g.transport.emitUp(tipSelected('amount', 3000));
    g.flush();
    expect(got).toEqual([{ kind: 'amount', amount: 3000 }]);
  });

  it('skipTip (el cajero omite): la pantalla pasa a payment; repetirlo no reemite', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    const before = h.transport.published.length;
    h.emitter.skipTip();
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipPhase).toBe('done');
    h.emitter.skipTip();
    h.flush();
    expect(h.transport.published.length).toBe(before + 1);
  });

  it('cambiar de método o teclear el efectivo NO vuelve a preguntar ni anula la fase', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total: 5000 }));
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip'); // sigue pendiente
    expect(h.transport.lastState.payment?.method).toBe('card');
    h.emitter.skipTip();
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 5000, received: 10000, change: 5000 }));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment'); // omitida: no se vuelve a preguntar
    expect(h.emitter.tipPhase).toBe('done');
  });

  it('cancelar el cobro (setMode order) vuelve a order y olvida la fase; el siguiente cobro vuelve a preguntar', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    h.emitter.setMode('order');
    h.flush();
    expect(h.transport.lastState.mode).toBe('order');
    expect(h.emitter.tipPhase).toBeNull();
    expect(h.emitter.tipSelection).toBeNull();
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
  });

  it('setPayment(null) también olvida la fase', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.emitter.setPayment(null);
    h.flush();
    expect(h.transport.lastState.mode).toBe('order');
    expect(h.emitter.tipPhase).toBeNull();
  });

  it('orden completo: order → tip → payment → thanks; thanks limpia la fase', () => {
    const h = harness({ settings: settings() });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    h.emitter.setMode('thanks', { total: 5500 });
    h.flush();
    expect(h.transport.modes).toEqual(['idle', 'order', 'tip', 'payment', 'thanks']);
    expect(h.emitter.tipPhase).toBeNull();
    expect(h.transport.lastState.thanks).toEqual({ total: 5500, askRating: false });
  });

  it('los presets se congelan al entrar en la fase: cambiar los ajustes a mitad de cobro no cambia la pregunta', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.current.settings = settings({ presets: [20, 25, 30] });
    h.emitter.reannounce();
    expect(h.transport.lastState.tip?.presets).toEqual([5, 10, 15]);
  });

  it('un need_snapshot durante la fase responde hello + state en modo tip (la pantalla reconectada sigue preguntando)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: CAPS });
    const last = h.transport.published.slice(-2);
    expect(last.map((m) => m.t)).toEqual(['hello', 'state']);
    expect((last[1] as Extract<DownMessageDraft, { t: 'state' }>).state.mode).toBe('tip');
  });

  it('un oyente de onTipSelected que lanza no afecta al resto ni al emisor', () => {
    const h = harness();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    const got: string[] = [];
    h.emitter.onTipSelected(() => {
      throw new Error('boom');
    });
    h.emitter.onTipSelected((sel) => got.push(sel.kind));
    h.transport.emitUp(tipSelected('percent', 5));
    h.flush();
    expect(got).toEqual(['percent']);
    expect(h.transport.lastState.mode).toBe('payment');
    expect(warn).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 4. logic.ts · vista tip
// ---------------------------------------------------------------------------

describe('logic.ts · resolveView y saneado del bloque tip', () => {
  const cartWithLines: DisplayState['cart'] = {
    id: 'c1',
    currency: 'COP',
    lines: [
      {
        id: 'l1',
        name: 'Café',
        variant: null,
        qty: 1,
        unitPrice: 5000,
        total: 5000,
        modifiers: [],
        discount: null,
        note: null,
        taxExcluded: false,
        taxIncluded: false,
      },
    ],
    subtotal: 5000,
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 0,
    taxIncluded: false,
    total: 5000,
    lastChangedLineId: null,
  };
  const base = { connected: true, updateRequired: false };

  it("mode 'tip' con carrito y bloque tip → 'tip'; sin bloque o sin líneas → pedido/reposo", () => {
    const tip = { presets: [5, 10, 15], allowCustom: true, selected: null, base: 5000 };
    expect(resolveView({ ...base, state: { mode: 'tip', cart: cartWithLines, payment: null, tip, thanks: null } })).toBe('tip');
    expect(resolveView({ ...base, state: { mode: 'tip', cart: cartWithLines, payment: null, tip: null, thanks: null } })).toBe('order');
    expect(resolveView({ ...base, state: { mode: 'tip', cart: null, payment: null, tip, thanks: null } })).toBe('idle');
    expect(viewShowsAmounts('tip')).toBe(true);
  });

  it('sanitizeDisplayState sanea el bloque tip (presets inválidos fuera; sin nada que preguntar → null)', () => {
    const raw = {
      mode: 'tip',
      cart: cartWithLines,
      payment: null,
      tip: { presets: [5, 'x', 200, 10], allowCustom: true, selected: null, base: 5000 },
      thanks: null,
    } as unknown as DisplayState;
    expect(sanitizeDisplayState(raw).tip).toEqual({ presets: [5, 10], allowCustom: true, selected: null, base: 5000 });
    const empty = { ...raw, tip: { presets: [], allowCustom: false, selected: null } } as DisplayState;
    expect(sanitizeDisplayState(empty).tip).toBeNull();
    expect(resolveView({ ...base, state: sanitizeDisplayState(empty) })).toBe('order');
  });
});

// ---------------------------------------------------------------------------
// 5. Ronda 2 de F2-B (correcciones del QA y del tester)
// ---------------------------------------------------------------------------

describe('emitter.ts · ronda 2 · la base de propina es de la venta (QA-1)', () => {
  it('stop() + start() con OTRA organización: el primer «tip» lleva el total de ESTA venta (40), no la base anterior (20250)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(20250);
    h.emitter.stop();
    h.emitter.start({ organizationId: 121, currency: 'USD' });
    h.emitter.setActiveCart(cart({ id: 'cart-otra', organization_id: 121, total: 40 }));
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 40 }));
    h.flush();
    const state = h.transport.lastState;
    expect(state.mode).toBe('tip');
    expect(state.tip?.base).toBe(40);
    expect(state.cart?.total).toBe(40);
  });

  it('stop() + start() con la MISMA organización tampoco arrastra la base: la fija el cobro siguiente', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.emitter.stop();
    h.emitter.start(START);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(5000);
  });

  it('setTipBase sin arrancar se ignora; setPayment(null), setMode(order) y thanks la borran', () => {
    const h = harness();
    h.emitter.setTipBase(123456);
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(5000);

    h.emitter.setTipBase(20250);
    h.emitter.setPayment(null);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(5000);

    h.emitter.setTipBase(20250);
    h.emitter.setMode('order');
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(5000);

    h.emitter.setTipBase(20250);
    h.emitter.setMode('thanks', { total: 5000 });
    h.emitter.setMode('order');
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(5000);
  });

  it('la base fijada DURANTE la fase sobrevive a cambios de método (resetTip no la toca)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.emitter.setTipBase(20250);
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total: 5000 }));
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(20250);
  });
});

describe('emitter.ts · ronda 2 · tolerancia de tip_selected (QA-4)', () => {
  it('isAcceptableTipChoice: percent entero en [1,100]; amount < 10^TIP_CUSTOM_MAX_DIGITS; none siempre; otro kind no', () => {
    expect(TIP_AMOUNT_LIMIT).toBe(10 ** TIP_CUSTOM_MAX_DIGITS);
    expect(isAcceptableTipChoice('percent', 10)).toBe(true);
    expect(isAcceptableTipChoice('percent', 7.5)).toBe(false);
    expect(isAcceptableTipChoice('percent', 0)).toBe(false);
    expect(isAcceptableTipChoice('percent', 101)).toBe(false);
    expect(isAcceptableTipChoice('amount', 999_999_999)).toBe(true);
    expect(isAcceptableTipChoice('amount', 1_000_000_000)).toBe(false);
    expect(isAcceptableTipChoice('amount', 1e15)).toBe(false);
    expect(isAcceptableTipChoice('amount', -1)).toBe(false);
    expect(isAcceptableTipChoice('amount', Number.NaN)).toBe(false);
    expect(isAcceptableTipChoice('none', 0)).toBe(true);
    expect(isAcceptableTipChoice('gift', 5)).toBe(false);
  });

  it('percent 7.5 se descarta y deja tipPhase pending; amount 1e15 no llega a onTipSelected; amount 999.999.999 sí', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    const got: number[] = [];
    h.emitter.onTipSelected((s) => got.push(s.amount));
    h.transport.emitUp(tipSelected('percent', 7.5));
    h.flush();
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.transport.lastState.mode).toBe('tip');
    h.transport.emitUp(tipSelected('amount', 1e15));
    h.flush();
    expect(got).toEqual([]);
    expect(h.emitter.tipPhase).toBe('pending');
    h.transport.emitUp(tipSelected('amount', 999_999_999));
    h.flush();
    expect(got).toEqual([999_999_999]);
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.transport.lastState.mode).toBe('payment');
  });
});

describe('emitter.ts · ronda 2 · base 0 no se pregunta (QA-5)', () => {
  it('base 0 → mode payment con la fase pendiente; al subir la base aparece la pregunta', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ subtotal: 5000, discount_total: 5000, total: 0 }));
    h.emitter.setTipBase(0);
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 0 }));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.lastState.tip).toBeNull();
    expect(h.emitter.tipPhase).toBe('pending');
    h.emitter.setTipBase(5000);
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
  });

  it('sin base de la caja y carrito con total 0 tampoco se pregunta', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ subtotal: 5000, discount_total: 5000, total: 0 }));
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 0 }));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('describeTipSelection: percent con base 0 → «Cliente eligió 10 % ($0)»; none → «no dejar propina»; isInformativeTipSelection', () => {
    const zero = resolveTipSelection('c', 0, { kind: 'percent', value: 10 });
    expect(describeTipSelection(zero, 'COP')).toMatch(/^Cliente eligió 10 % \(.*0.*\)$/);
    expect(isInformativeTipSelection(zero)).toBe(true);
    expect(describeTipSelection(resolveTipSelection('c', 0, { kind: 'none', value: 0 }), 'COP')).toBe('Cliente eligió no dejar propina');
    expect(isInformativeTipSelection(resolveTipSelection('c', 20250, { kind: 'percent', value: 10 }))).toBe(false);
    expect(isInformativeTipSelection(resolveTipSelection('c', 20250, { kind: 'amount', value: 3000 }))).toBe(false);
  });
});

describe('emitter.ts · ronda 2 · onTipPhaseChange y onStatePublished (QA-6, QA-3)', () => {
  it('setPayment → skipTip → setMode(order) produce exactamente [pending, done, null]', () => {
    const h = harness();
    const phases: TipPhase[] = [];
    const off = h.emitter.onTipPhaseChange((p) => phases.push(p));
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total: 5000 })); // no cambia la fase
    h.emitter.skipTip();
    h.emitter.skipTip(); // repetido: no avisa
    h.emitter.setMode('order');
    h.emitter.setMode('order'); // ya era null: no avisa
    expect(phases).toEqual(['pending', 'done', null]);
    off();
    h.emitter.setPayment(cashPayment());
    expect(phases).toEqual(['pending', 'done', null]);
  });

  it('tip_selected y thanks también avisan; un oyente que lanza no rompe a los demás', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange(() => {
      throw new Error('boom');
    });
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10));
    h.emitter.setMode('thanks', { total: 5500 });
    expect(phases).toEqual(['pending', 'done', null]);
  });

  it('onStatePublished avisa con cada state que sale (announce y flush con cambio real), nunca sin transporte', () => {
    const h = harness();
    const modes: string[] = [];
    h.emitter.onStatePublished((state) => modes.push(state.mode));
    h.emitter.setActiveCart(cart()); // sin arrancar: no hay transporte, no se avisa
    expect(modes).toEqual([]);
    h.emitter.start(START); // announce
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total: 5000 }));
    h.flush();
    h.emitter.setTipBase(5000); // misma proyección: flush no publica ni avisa
    h.flush();
    h.emitter.skipTip();
    h.flush();
    expect(modes).toEqual(['order', 'tip', 'tip', 'payment']);
  });

  it('lastDisplayCapabilities del emisor: null sin transporte o si el transporte no las guarda', () => {
    const h = harness();
    expect(h.emitter.lastDisplayCapabilities).toBeNull();
    h.emitter.start(START);
    expect(h.emitter.lastDisplayCapabilities).toBeNull(); // FakeTransport no las expone
  });
});

describe('tipNotice.ts · ronda 2 · aviso de espera según lo que pinta la pantalla (QA-3)', () => {
  const base = { phase: 'pending' as TipPhase, displayMode: 'tip' as const, connected: true, touch: true as boolean | null };

  it('solo con fase pendiente, pantalla conectada y mode tip; un QR con código (mode payment) lo apaga', () => {
    expect(resolveTipWaitingNotice(base)).toEqual({ kind: 'waiting', text: TIP_WAITING_TEXT, action: TIP_WAITING_ACTION });
    expect(resolveTipWaitingNotice({ ...base, displayMode: 'payment' })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, displayMode: null })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, connected: false })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, phase: 'done' })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, phase: null })).toBeNull();
  });

  it('pantalla NO táctil: «registre lo que indique el cliente» con «Continuar»; sin capacidades conocidas se asume que contestará', () => {
    expect(resolveTipWaitingNotice({ ...base, touch: false })).toEqual({ kind: 'informational', text: TIP_INFORMATIONAL_TEXT, action: TIP_INFORMATIONAL_ACTION });
    expect(resolveTipWaitingNotice({ ...base, touch: null })?.kind).toBe('waiting');
    expect(resolveTipWaitingNotice({ ...base, touch: false, displayMode: 'payment' })).toBeNull();
  });
});

describe('tipNotice.ts · ronda 2 · «Aplicar» ajusta la entrada pre-rellenada (QA-2)', () => {
  const entry = (id: string, amount: number, method = 'cash') => ({ id, method, amount });

  it('una sola entrada NO tocada sigue al total nuevo; la referencia cambia solo si hay cambio', () => {
    const payments = [entry('a', 20250)];
    const next = applyTipToPrefilledPayment(payments, new Set(), 22275);
    expect(next).toEqual([{ id: 'a', method: 'cash', amount: 22275 }]);
    expect(next).not.toBe(payments);
    expect(applyTipToPrefilledPayment(payments, new Set(), 20250)).toBe(payments);
  });

  it('una entrada TOCADA nunca se modifica; con varias entradas (pago mixto) tampoco', () => {
    const touched = [entry('a', 25000)];
    expect(applyTipToPrefilledPayment(touched, new Set(['a']), 22275)).toBe(touched);
    const mixed = [entry('a', 10000, 'card'), entry('b', 10250)];
    expect(applyTipToPrefilledPayment(mixed, new Set(), 22275)).toBe(mixed);
    expect(applyTipToPrefilledPayment([], new Set(), 22275)).toEqual([]);
  });

  it('un total inválido (NaN, negativo) no toca nada; tarjeta/QR pre-rellenados también se ajustan', () => {
    const card = [entry('a', 20250, 'card')];
    expect(applyTipToPrefilledPayment(card, new Set(), Number.NaN)).toBe(card);
    expect(applyTipToPrefilledPayment(card, new Set(), -1)).toBe(card);
    expect(applyTipToPrefilledPayment(card, new Set(), 22275)[0]).toEqual({ id: 'a', method: 'card', amount: 22275 });
  });
});

describe('transport.ts · ronda 2 · lastDisplayCapabilities (QA-3)', () => {
  it('se actualizan con cada display_alive / need_snapshot y se borran con display_bye', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    expect(cashier.lastDisplayCapabilities).toBeNull();
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 10 }));
    display.startPresence({ touch: false, width: 1024, height: 768 });
    await waitFor(() => cashier.lastDisplayCapabilities !== null);
    expect(cashier.lastDisplayCapabilities).toEqual({ touch: false, width: 1024, height: 768 });
    display.startPresence({ touch: true, width: 1280, height: 800 }); // resize / cambio: solo actualiza
    await waitFor(() => cashier.lastDisplayCapabilities?.touch === true);
    expect(cashier.lastDisplayCapabilities).toEqual({ touch: true, width: 1280, height: 800 });
    display.close();
    await waitFor(() => cashier.lastDisplayCapabilities === null);
    expect(cashier.lastDisplaySeenAt).toBeNull();

    const muda = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    muda.send({ t: 'need_snapshot', capabilities: { touch: false, width: 800, height: 600 } });
    await waitFor(() => cashier.lastDisplayCapabilities !== null);
    expect(cashier.lastDisplayCapabilities?.touch).toBe(false);
    expect(HEARTBEAT_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('el emisor reexpone las capacidades de su transporte real', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const emitter = new DisplayEmitter({ createTransport: () => cashier, isEnabled: () => true });
    emitter.start(START);
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 10 }));
    display.startPresence({ touch: false, width: 1024, height: 768 });
    await waitFor(() => emitter.lastDisplayCapabilities !== null);
    expect(emitter.lastDisplayCapabilities?.touch).toBe(false);
    emitter.stop();
    expect(emitter.lastDisplayCapabilities).toBeNull();
  });
});

describe('logic.ts · ronda 2 · resolveView con `touch` (QA-7)', () => {
  const cartWithLines: DisplayState['cart'] = {
    id: 'c1',
    currency: 'COP',
    lines: [{ id: 'l1', name: 'Café', variant: null, qty: 1, unitPrice: 5000, total: 5000, modifiers: [], discount: null, note: null, taxExcluded: false, taxIncluded: false }],
    subtotal: 5000,
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 0,
    taxIncluded: false,
    total: 5000,
    lastChangedLineId: null,
  };
  const payment = toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 5000 });
  const base = { connected: true, updateRequired: false };

  it('sin presets y sin táctil cae al cobro del mismo state; con presets, táctil o sin `touch` sigue en tip', () => {
    const empty = { presets: [], allowCustom: true, selected: null, base: 5000 };
    const state: DisplayState = { mode: 'tip', cart: cartWithLines, payment, tip: empty, thanks: null };
    expect(resolveView({ ...base, touch: false, state })).toBe('payment_cash');
    expect(resolveView({ ...base, touch: true, state })).toBe('tip');
    expect(resolveView({ ...base, state })).toBe('tip');
    expect(resolveView({ ...base, touch: false, state: { ...state, payment: null } })).toBe('order');
    expect(resolveView({ ...base, touch: false, state: { ...state, tip: { ...empty, presets: [10] } } })).toBe('tip');
  });
});

// ---------------------------------------------------------------------------
// 5. Ronda 3 · correcciones del QA
// ---------------------------------------------------------------------------

const CHECKOUT_SOURCE = readFileSync(join(process.cwd(), 'src/components/pos/CheckoutDialog.tsx'), 'utf8');

/** Entrada de pago del modal (lo mínimo que usan onPaid y applyTipToPrefilledPayment). */
interface Entry {
  id: string;
  method: string;
  amount: number;
}

/**
 * Lo que hace `onPaid` de CheckoutDialog con la entrada desde la que se generó
 * el QR (ronda 5 de F2-C + ronda 6 «HALLAZGO P»): la confirma con el método y
 * el importe que cobró el código Y la marca como tocada (definitiva). Se
 * reproduce aquí para probar la aritmética en Node; el test estático de abajo
 * comprueba que el componente hace exactamente esto.
 */
function onPaidConfirm(payments: Entry[], touched: Set<string>, qrEntryId: string, method: string, charged: number): { payments: Entry[]; touched: Set<string> } {
  const exists = payments.some((p) => p.id === qrEntryId);
  const newPayment: Entry = { id: 'nuevo', method, amount: charged };
  const next = exists ? payments.map((p) => (p.id === qrEntryId ? { ...p, method, amount: charged } : p)) : [...payments, newPayment];
  const confirmedId = exists ? qrEntryId : newPayment.id;
  return { payments: next, touched: new Set(touched).add(confirmedId) };
}

describe('ronda 3 · QA-1 (dinero) · «Aplicar» no reescribe una entrada QR ya cobrada', () => {
  const qrWithCode = (total: number, amount: number) =>
    toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total, amount, qr: { kind: 'image', value: 'data:image/png;base64,QUJD' }, expiresAt: Date.now() + 60_000 });
  const qrWithoutCode = (total: number) => toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total, qr: null, expiresAt: null });

  it('selección 10 % → QR generado → onPaid (marca la entrada) → Aplicar deja la entrada QR en 25.000 y remaining = 2.500', () => {
    const base = 25_000;
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ total: base, subtotal: base, items: [item({ id: 'l1', unit_price: base, total: base })] }));
    h.flush();
    h.emitter.setTipBase(base);
    h.emitter.setPayment(qrWithoutCode(base));
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    // 1. El cliente elige 10 % en la pantalla táctil: la caja recibe la elección (aviso Aplicar / Cambiar).
    let selection: TipSelection | null = null;
    h.emitter.onTipSelected((s) => {
      selection = s;
    });
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(selection).not.toBeNull();
    expect(selection!.amount).toBe(2_500);
    // 2. El cajero, SIN aplicar, genera el QR desde la única entrada pre-rellenada (25.000, no tocada).
    let payments: Entry[] = [{ id: 'q', method: 'breb_qr', amount: base }];
    let touched = new Set<string>();
    h.emitter.setPayment(qrWithCode(base, base));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    // 3. El proveedor confirma 25.000: onPaid → skipTip (sin efecto: la fase ya estaba decidida) + entrada confirmada y TOCADA.
    h.emitter.skipTip();
    ({ payments, touched } = onPaidConfirm(payments, touched, 'q', 'breb_qr', base));
    expect(payments).toEqual([{ id: 'q', method: 'breb_qr', amount: 25_000 }]);
    expect(touched.has('q')).toBe(true);
    expect(h.emitter.tipSelection).not.toBeNull(); // el aviso sigue ofreciendo «Aplicar»
    // 4. «Aplicar»: la caja fija la propina (tipAmount 2.500) y llama a applyTipToPrefilledPayment con el total nuevo.
    const tipAmount = selection!.amount;
    const cartTotal = base + tipAmount + 0;
    const after = applyTipToPrefilledPayment(payments, touched, cartTotal);
    expect(after).toBe(payments); // misma referencia: nada que cambiar
    expect(after.find((p) => p.id === 'q')?.amount).toBe(25_000); // lo que el proveedor cobró
    const totalPaid = after.reduce((sum, p) => sum + p.amount, 0);
    expect(Math.max(0, cartTotal - totalPaid)).toBe(2_500); // la propina queda como «Falta dinero», a cobrar aparte
    expect(totalPaid >= cartTotal).toBe(false); // canComplete false: no se registra un pago que el proveedor no cobró
  });

  it('el cajero quitó la entrada original antes de pagar: onPaid añade una de respaldo y también la marca; Aplicar no la toca', () => {
    const { payments, touched } = onPaidConfirm([], new Set<string>(), 'q', 'breb_qr', 25_000);
    expect(payments).toEqual([{ id: 'nuevo', method: 'breb_qr', amount: 25_000 }]);
    expect(touched.has('nuevo')).toBe(true);
    expect(applyTipToPrefilledPayment(payments, touched, 27_500)[0].amount).toBe(25_000);
  });

  it('CheckoutDialog (estático): onPaid marca como tocada la entrada QR confirmada (confirmedQrEntryId → setTouchedIds) y «Aplicar» pasa por followTipOnPrefilledPayment con touchedIds', () => {
    const onPaid = CHECKOUT_SOURCE.slice(CHECKOUT_SOURCE.indexOf('onPaid={() => {'), CHECKOUT_SOURCE.indexOf('<SerialSelectorDialog'));
    expect(onPaid).toContain('const confirmedQrEntryId');
    expect(onPaid).toMatch(/setTouchedIds\(prev => \(prev\.has\(confirmedQrEntryId\) \? prev : new Set\(prev\)\.add\(confirmedQrEntryId\)\)\)/);
    const notice = CHECKOUT_SOURCE.slice(CHECKOUT_SOURCE.indexOf('<TipFromDisplayNotice'), CHECKOUT_SOURCE.indexOf('{/* Botones de porcentaje */}'));
    expect(notice).toContain('followTipOnPrefilledPayment(selection.amount)');
    expect(CHECKOUT_SOURCE).toMatch(/const followTipOnPrefilledPayment = \(nextTipAmount: number\) => \{\s*setPayments\(\(prev\) => applyTipToPrefilledPayment\(prev, touchedIds, baseTotal \+ nextTipAmount \+ shippingFee\)\);/);
  });
});

describe('ronda 3 · QA-3 · la entrada pre-rellenada sigue a la propina en AMBOS sentidos', () => {
  /** Lo que hacen handleTipPercentage / handleTipAmountChange / onApply del modal con la única entrada pre-rellenada. */
  function modal(baseTotal: number, shippingFee = 0) {
    let payments: Entry[] = [{ id: 'a', method: 'card', amount: baseTotal }];
    const touched = new Set<string>();
    let tipAmount = 0;
    let tipPercentage: number | null = null;
    const follow = (next: number) => {
      payments = applyTipToPrefilledPayment(payments, touched, baseTotal + next + shippingFee);
    };
    return {
      get payments() {
        return payments;
      },
      get cartTotal() {
        return baseTotal + tipAmount + shippingFee;
      },
      get totalPaid() {
        return payments.reduce((sum, p) => sum + p.amount, 0);
      },
      get change() {
        return Math.max(0, this.totalPaid - this.cartTotal);
      },
      get canComplete() {
        return this.totalPaid >= this.cartTotal;
      },
      touch(id: string, amount: number) {
        touched.add(id);
        payments = payments.map((p) => (p.id === id ? { ...p, amount } : p));
      },
      applyFromDisplay(selection: TipSelection) {
        tipPercentage = selection.percent;
        tipAmount = selection.amount;
        follow(selection.amount);
      },
      pressPercent(pct: number) {
        if (tipPercentage === pct) {
          tipPercentage = null;
          tipAmount = 0;
          follow(0);
        } else {
          tipPercentage = pct;
          tipAmount = Math.round(baseTotal * (pct / 100));
          follow(tipAmount);
        }
      },
      typeAmount(value: number) {
        tipPercentage = null;
        tipAmount = value;
        follow(value);
      },
    };
  }

  it('5.000 → Aplicar 10 % (5.500) → deseleccionar el «10 %» → 5.000: sin sobrepago ni «Cambio»', () => {
    const m = modal(5_000);
    m.applyFromDisplay(resolveTipSelection('cart-1', 5_000, { kind: 'percent', value: 10 }));
    expect(m.payments[0].amount).toBe(5_500);
    expect(m.canComplete).toBe(true);
    m.pressPercent(10); // el cliente se arrepiente: el cajero deselecciona el botón resaltado
    expect(m.cartTotal).toBe(5_000);
    expect(m.payments[0].amount).toBe(5_000);
    expect(m.change).toBe(0);
    expect(m.canComplete).toBe(true);
  });

  it('el porcentaje del modal también sube la entrada; cambiarlo por otro o por un importe libre la ajusta; borrar el importe la baja', () => {
    const m = modal(20_250, 3_000);
    m.pressPercent(10);
    expect(m.payments[0].amount).toBe(20_250 + 2_025 + 3_000);
    m.pressPercent(15);
    expect(m.payments[0].amount).toBe(20_250 + 3_038 + 3_000);
    m.typeAmount(1_000);
    expect(m.payments[0].amount).toBe(24_250);
    m.typeAmount(0);
    expect(m.payments[0].amount).toBe(23_250);
    expect(m.change).toBe(0);
  });

  it('una entrada TOCADA (efectivo tecleado) no sigue a la propina en ningún sentido', () => {
    const m = modal(5_000);
    m.touch('a', 10_000); // el cliente entregó un billete de 10.000
    m.pressPercent(10);
    expect(m.payments[0].amount).toBe(10_000);
    m.pressPercent(10);
    expect(m.payments[0].amount).toBe(10_000);
  });

  it('CheckoutDialog (estático): handleTipPercentage (ambas ramas) y handleTipAmountChange llaman a followTipOnPrefilledPayment', () => {
    const handlers = CHECKOUT_SOURCE.slice(CHECKOUT_SOURCE.indexOf('const handleTipPercentage'), CHECKOUT_SOURCE.indexOf('// Generar QR de pago'));
    expect(handlers).toContain('followTipOnPrefilledPayment(0)');
    expect(handlers).toContain('followTipOnPrefilledPayment(calculatedTip)');
    expect(handlers).toContain('followTipOnPrefilledPayment(value)');
  });
});

describe('ronda 3 · QA-2 / QA-5 · táctil resuelto en la pantalla y seguido por la caja', () => {
  it('displayLink declara la detección hasta el hello y el táctil RESUELTO después, reemitiendo display_alive en el acto', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const alives: boolean[] = [];
    cashier.onUp((m) => {
      if (m.t === 'display_alive' || m.t === 'need_snapshot') alives.push(m.capabilities.touch);
    });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    let snap: DisplayLinkSnapshot = INITIAL_LINK_SNAPSHOT;
    const link = startDisplayLink({
      receiver: display,
      capabilities: () => ({ touch: true, width: 1280, height: 800 }), // hardware táctil
      onChange: (next) => {
        snap = next;
      },
    });
    track({ close: () => link.stop() });
    await waitFor(() => alives.length >= 2); // need_snapshot + primer display_alive: detección cruda
    expect(alives.every((t) => t === true)).toBe(true);
    // La caja saluda con forzado 'no-touch': la pantalla resuelve false y lo declara sin esperar al latido (1 s).
    const before = alives.length;
    cashier.announce(
      { t: 'hello', organizationId: 120, cashier: null, sessionOpen: true, currency: 'COP', settings: { ...settings(), touch: 'no-touch' } },
      { mode: 'idle', cart: null, payment: null, tip: null, thanks: null },
    );
    await waitFor(() => alives.length > before && alives[alives.length - 1] === false, 500);
    expect(snap.hello?.settings?.touch).toBe('no-touch');
    expect(cashier.lastDisplayCapabilities?.touch).toBe(false);
    expect(resolveTouch(true, snap.hello?.settings?.touch)).toBe(false); // lo mismo que pinta CustomerDisplay
    // Mismo forzado de nuevo (resaludo sin cambios): no hay display_alive extra.
    const again = alives.length;
    cashier.announce(
      { t: 'hello', organizationId: 120, cashier: null, sessionOpen: true, currency: 'COP', settings: { ...settings(), touch: 'no-touch' } },
      { mode: 'idle', cart: null, payment: null, tip: null, thanks: null },
    );
    await flush(4);
    expect(alives.length).toBe(again);
  });

  it('BroadcastChannelReceiver.startPresence: con la presencia corriendo, un cambio de touch emite display_alive en el acto; solo de tamaño espera al latido', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const alives: Array<{ touch: boolean; width: number }> = [];
    cashier.onUp((m) => {
      if (m.t === 'display_alive') alives.push({ touch: m.capabilities.touch, width: m.capabilities.width });
    });
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 60_000 }));
    display.startPresence({ touch: true, width: 1000, height: 800 });
    await waitFor(() => alives.length === 1);
    display.startPresence({ touch: true, width: 1200, height: 800 }); // resize: solo actualiza
    await flush(4);
    expect(alives.length).toBe(1);
    display.startPresence({ touch: false, width: 1200, height: 800 }); // táctil resuelto distinto: sale ya
    await waitFor(() => alives.length === 2);
    expect(alives[1]).toEqual({ touch: false, width: 1200 });
  });

  it('emitter.onDisplayCapabilitiesChange: avisa con cada cambio real (alive, bye → null, stop → null), no repite y un oyente que lanza no rompe', async () => {
    const cashier = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A }));
    const emitter = new DisplayEmitter({ createTransport: () => cashier, isEnabled: () => true });
    const got: Array<boolean | null> = [];
    emitter.onDisplayCapabilitiesChange(() => {
      throw new Error('oyente roto');
    });
    const off = emitter.onDisplayCapabilitiesChange((caps) => got.push(caps === null ? null : caps.touch));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    emitter.start(START);
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 10 }));
    display.startPresence({ touch: true, width: 1024, height: 768 });
    await waitFor(() => got.length === 1);
    await flush(6); // varios latidos iguales: sin avisos nuevos
    expect(got).toEqual([true]);
    display.startPresence({ touch: false, width: 1024, height: 768 });
    await waitFor(() => got.length === 2);
    expect(got).toEqual([true, false]);
    display.close(); // display_bye
    await waitFor(() => got.length === 3);
    expect(got).toEqual([true, false, null]);
    expect(emitter.lastDisplayCapabilities).toBeNull();
    // Otra pantalla vuelve; luego la caja para: el cierre del transporte deja null.
    const otra = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 10 }));
    otra.startPresence({ touch: true, width: 800, height: 600 });
    await waitFor(() => got.length === 4);
    emitter.stop();
    expect(got).toEqual([true, false, null, true, null]);
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('onDisplayCapabilitiesChange'))).toBe(true);
    off();
  });

  it('emitter.presentationSettings: los ajustes de getSettings, o null sin cableado / si lanza', () => {
    const h = harness();
    expect(h.emitter.presentationSettings?.touch).toBe('auto');
    h.current.settings = { ...settings(), touch: 'no-touch' };
    expect(h.emitter.presentationSettings?.touch).toBe('no-touch');
    const sin = harness({ settings: null });
    expect(sin.emitter.presentationSettings).toBeNull();
    const roto = new DisplayEmitter({
      createTransport: () => null,
      isEnabled: () => true,
      getSettings: () => {
        throw new Error('caché rota');
      },
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(roto.presentationSettings).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('resolveNoticeTouch (caja): capacidades declaradas + el mismo forzado que la pantalla; null sin capacidades', () => {
    expect(resolveNoticeTouch({ touch: true }, 'no-touch')).toBe(false);
    expect(resolveNoticeTouch({ touch: false }, 'touch')).toBe(true);
    expect(resolveNoticeTouch({ touch: true }, 'auto')).toBe(true);
    expect(resolveNoticeTouch({ touch: false }, 'auto')).toBe(false);
    expect(resolveNoticeTouch({ touch: true }, undefined)).toBe(true);
    expect(resolveNoticeTouch(null, 'touch')).toBeNull();
    expect(resolveNoticeTouch(undefined, undefined)).toBeNull();
    // El aviso que resulta coincide con lo que la pantalla pinta (resolveTouch) para cualquier combinación.
    const base = { phase: 'pending' as TipPhase, displayMode: 'tip' as const, connected: true };
    for (const override of ['auto', 'touch', 'no-touch'] as const) {
      for (const detected of [true, false]) {
        const painted = resolveTouch(detected, override);
        expect(resolveTipWaitingNotice({ ...base, touch: resolveNoticeTouch({ touch: painted }, override) })?.kind).toBe(painted ? 'waiting' : 'informational');
        // Respaldo: aunque la pantalla declarase la detección cruda, la caja llega al mismo aviso.
        expect(resolveTipWaitingNotice({ ...base, touch: resolveNoticeTouch({ touch: detected }, override) })?.kind).toBe(painted ? 'waiting' : 'informational');
      }
    }
  });
});
