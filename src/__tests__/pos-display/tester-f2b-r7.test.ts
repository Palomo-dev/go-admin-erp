/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 7 (QA de la ronda
 * de corrección «sin cambios de código» del builder).
 *
 * Las rondas 1-6 cubren la fase, la base, la tolerancia de `tip_selected`,
 * el táctil resuelto, las dos cajas y el QR. Esta ronda ataca lo que queda
 * en los bordes, siempre por la API pública del emisor y la lógica pura:
 *
 *  A. Coalescencia y orden de estados en UNA venta real: el mismo tick en
 *     que CheckoutDialog llama a setPayment + setTipBase + setTotals produce
 *     UN solo `state` con mode 'tip' y la base de la caja; la secuencia de
 *     modos publicados en la venta completa es exactamente
 *     order → tip → payment → thanks → idle, y cada camino de vuelta a
 *     `order` (cancelar, setPayment(null)) publica un solo frame.
 *  B. Base inválida (NaN, negativa, Infinity) fijada por la caja durante la
 *     fase: se trata como «sin base» y la pregunta usa el total proyectado,
 *     coherente entre pantalla y caja.
 *  C. Elecciones que la pantalla propia nunca manda pero otra sí podría:
 *     `amount` sin «Otro» (se descarta sin cerrar), `amount: 0` con «Otro»
 *     (cierra como «no dejar propina»), `percent` que solo está en los
 *     presets DUPLICADOS del ajuste (entra: el dedup no lo pierde).
 *  D. Ajustes rotos con la forma exacta que puede traer `organization_settings`
 *     (verificado con el MCP: las filas reales solo traen `enabled`), más
 *     mezclas: presets con texto, decimales, negativos, > 100 y repetidos;
 *     `enabled`/`allowCustom` como texto; `tips: null`.
 *  E. Deriva de la base tras la elección: el getter `tipSelection` devuelve
 *     la MISMA `TipSelection` entregada a `onTipSelected` (importe congelado
 *     con la base que el cliente vio); si la base cambia después, una sola
 *     cifra por cualquier camino de lectura (corregido en la ronda 8: antes
 *     el getter se re-resolvía con la base actual).
 *  F. F2B-R7-1 (bajo, corregido en la ronda 8): con pantalla NO táctil,
 *     presets vacíos y solo «Otro», la pantalla cae al cobro (QA-7) y el
 *     aviso de la caja es null cuando recibe `presetsCount: 0` (antes decía
 *     «La pantalla muestra las propinas sugeridas» sobre importes que el
 *     cliente no veía).
 *  G. stop()/start() con la fase pendiente: la fase avisa null al parar y NO
 *     se reabre sola al arrancar (el cobro siguiente la abre).
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
import { computeTipAmount, type TipSelection } from '@/lib/pos/display/tip';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';
import { resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';
import { TIP_INFORMATIONAL_TEXT, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings } from '@/lib/pos/display/settings';

// ---------------------------------------------------------------------------
// Utilidades (mismas que las rondas anteriores)
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee7';

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
  get modes(): string[] {
    return this.states.map((s) => s.mode);
  }
  get lastState(): DisplayState {
    const states = this.states;
    if (states.length === 0) throw new Error('sin state emitido');
    return states[states.length - 1];
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
    get pending() {
      return queued !== null;
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

function harness(opts: { settings?: DisplayPresentationSettings | null; thanksMs?: number } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings === undefined ? settings() : opts.settings };
  const selections: TipSelection[] = [];
  const phases: TipPhase[] = [];
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
    schedule: sched.schedule,
    thanksDurationMs: opts.thanksMs,
    ...(current.settings === null ? {} : { getSettings: () => current.settings as DisplayPresentationSettings }),
  });
  emitter.onTipSelected((s) => selections.push(s));
  emitter.onTipPhaseChange((p) => phases.push(p));
  return { emitter, transport, flush: sched.flush, sched, current, selections, phases };
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
const cardPayment = (total = 5000) => toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total });
const tipSelected = (kind: string, value: number, cartId = 'cart-1'): UpMessage =>
  ({ v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, cartId, kind, value }) as unknown as UpMessage;

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// A. Coalescencia y orden de estados en una venta real
// ---------------------------------------------------------------------------

describe('A. coalescencia y orden de estados en una venta completa', () => {
  it('setPayment + setTipBase + setTotals en el MISMO tick (un commit de React) → UN solo state, mode tip, con la base de la caja', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    const before = h.transport.states.length;

    // Lo que hace CheckoutDialog al abrirse: efecto de cobro, efecto de base y TaxSummary, todos antes del rAF.
    h.emitter.setPayment(cashPayment(20250));
    h.emitter.setTipBase(20250);
    h.emitter.setTotals('cart-1', { discountTotal: 0, taxTotal: 3234, total: 20250 });
    expect(h.transport.states.length).toBe(before); // nada salió todavía
    h.flush();
    expect(h.transport.states.length).toBe(before + 1);
    const state = h.transport.lastState;
    expect(state.mode).toBe('tip');
    expect(state.tip?.base).toBe(20250);
    expect(state.tip?.presets).toEqual([5, 10, 15]);
    expect(state.cart?.total).toBe(20250);
  });

  it('venta completa: order → tip → payment (omitir) → thanks → idle, un frame por paso y sin repeticiones', () => {
    jest.useFakeTimers();
    try {
      const h = harness({ thanksMs: 50 });
      h.emitter.start(START);
      h.transport.published.length = 0;
      h.emitter.setActiveCart(cart());
      h.flush();
      h.emitter.setPayment(cashPayment());
      h.emitter.setTipBase(5000);
      h.flush();
      h.emitter.skipTip();
      h.flush();
      h.emitter.setMode('thanks', { total: 5000 });
      h.flush();
      // Cobrado: posService retira el carrito.
      h.emitter.onCartsSaved([]);
      h.flush();
      jest.advanceTimersByTime(60);
      h.flush();
      expect(h.transport.modes).toEqual(['order', 'tip', 'payment', 'thanks', 'idle']);
      expect(h.phases).toEqual(['pending', 'done', null]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancelar desde tip (setMode order) y desde payment tras elegir: un solo frame «order», la fase avisa null y el siguiente cobro vuelve a preguntar', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.emitter.setTipBase(5000);
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    h.emitter.setMode('order');
    h.flush();
    expect(h.transport.modes.slice(-2)).toEqual(['tip', 'order']);
    expect(h.phases).toEqual(['pending', null]);

    // Segundo cobro: elige, luego setPayment(null) (cancelación por otro camino).
    h.emitter.setPayment(cardPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    h.emitter.setPayment(null);
    h.flush();
    expect(h.transport.lastState.mode).toBe('order');
    expect(h.phases).toEqual(['pending', null, 'pending', 'done', null]);
    expect(h.selections).toHaveLength(1);
    expect(h.emitter.tipSelection).toBeNull();
  });

  it('cambiar de método DURANTE la fase (cash → card → cash) no reemite el frame tip si nada más cambió, ni cambia presets ni base', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.emitter.setTipBase(5000);
    h.flush();
    const tipFrames = () => h.transport.states.filter((s) => s.mode === 'tip');
    expect(tipFrames()).toHaveLength(1);
    h.emitter.setPayment(cardPayment());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    // Tres frames tip (el payment que viaja dentro cambia), pero presets y base idénticos en todos.
    const frames = tipFrames();
    expect(frames).toHaveLength(3);
    for (const f of frames) {
      expect(f.tip?.presets).toEqual([5, 10, 15]);
      expect(f.tip?.base).toBe(5000);
      expect(f.tip?.selected).toBeNull();
    }
    expect(h.phases).toEqual(['pending']);
  });
});

// ---------------------------------------------------------------------------
// B. Base inválida fijada por la caja
// ---------------------------------------------------------------------------

describe('B. setTipBase con valores inválidos durante la fase', () => {
  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('base %p → «sin base»: la pregunta usa el total proyectado y la caja resuelve con el mismo', (bad) => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ total: 7000 }));
    h.flush();
    h.emitter.setPayment(cashPayment(7000));
    h.emitter.setTipBase(20250);
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(20250);
    h.emitter.setTipBase(bad);
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(7000);
    h.transport.emitUp(tipSelected('percent', 10));
    expect(h.selections[0]?.amount).toBe(computeTipAmount(7000, 10));
  });

  it('setTipBase con el mismo valor no reemite; con un valor distinto en fase «done» tampoco (la pregunta ya no se pinta)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.emitter.setTipBase(5000);
    h.flush();
    const n = h.transport.states.length;
    h.emitter.setTipBase(5000);
    expect(h.sched.pending).toBe(false);
    h.emitter.skipTip();
    h.flush();
    expect(h.transport.states.length).toBe(n + 1);
    h.emitter.setTipBase(9000);
    expect(h.sched.pending).toBe(false);
    expect(h.transport.lastState.mode).toBe('payment');
  });
});

// ---------------------------------------------------------------------------
// C. Elecciones que la pantalla propia no manda
// ---------------------------------------------------------------------------

describe('C. elecciones fuera del contrato congelado', () => {
  it('`amount` sin «Otro» se descarta sin cerrar la fase; `none` sigue entrando', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness({ settings: settings({ allowCustom: false }) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('amount', 1500));
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.selections).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no está entre lo ofrecido'), expect.anything());
    h.transport.emitUp(tipSelected('none', 0));
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.selections[0]).toMatchObject({ kind: 'none', amount: 0 });
  });

  it('`amount: 0` con «Otro» (la pantalla propia deshabilita «Confirmar» en 0) cierra la fase como «no dejar propina»', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('amount', 0));
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.selections[0]).toMatchObject({ kind: 'amount', amount: 0, value: 0, percent: null });
  });

  it('presets repetidos en el ajuste ([10, 10, 15]): la pregunta viaja deduplicada y la elección «10» entra una vez', () => {
    const h = harness({ settings: settings({ presets: [10, 10, 15] }) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.presets).toEqual([10, 15]);
    h.transport.emitUp(tipSelected('percent', 10));
    h.transport.emitUp(tipSelected('percent', 10));
    expect(h.selections).toHaveLength(1);
    expect(h.selections[0]).toMatchObject({ percent: 10, amount: 500 });
  });

  it('`value` -0 en percent se descarta (no es un entero en [1,100]) y en amount cuenta como 0', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('percent', -0));
    expect(h.emitter.tipPhase).toBe('pending');
    h.transport.emitUp(tipSelected('amount', -0));
    expect(h.emitter.tipPhase).toBe('done');
    expect(Object.is(h.selections[0]?.amount, 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D. Ajustes rotos con la forma de organization_settings
// ---------------------------------------------------------------------------

describe('D. ajustes rotos tal como pueden venir de la fila `pos_customer_display`', () => {
  it('fila real de producción ({ enabled: true } sin más): no se pregunta y el estado va a payment', () => {
    const parsed = parseCustomerDisplaySettings({ enabled: true });
    const h = harness({ settings: toDisplayPresentationSettings(parsed) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipPhase).toBeNull();
  });

  it('presets con texto, decimales, negativos, > 100 y repetidos: el emisor pregunta solo con los válidos, deduplicados y en orden', () => {
    const raw = { enabled: true, presets: [10, '15', 20.5, -5, 100, 101, 10, 0, 1] as unknown as number[], allowCustom: true };
    const h = harness({ settings: settings(raw) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.presets).toEqual([10, 100, 1]);
    // Y la pantalla sanea igual lo que recibe: mismo resultado.
    const last = h.transport.lastState;
    const sane = sanitizeDisplayState({ ...last, tip: { presets: raw.presets, allowCustom: true, selected: null, base: last.tip?.base } });
    expect(sane?.tip?.presets).toEqual([10, 100, 1]);
  });

  it.each([
    ['enabled como texto', { enabled: 'true' as unknown as boolean }],
    ['enabled como 1', { enabled: 1 as unknown as boolean }],
    ['sin presets ni Otro', { presets: [], allowCustom: false }],
    ['presets no array y allowCustom como texto', { presets: '5,10,15' as unknown as number[], allowCustom: 'yes' as unknown as boolean }],
  ])('%s → no se pregunta, no se lanza', (_label, tips) => {
    const h = harness({ settings: settings(tips) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    expect(() => h.emitter.setPayment(cashPayment())).not.toThrow();
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipPhase).toBeNull();
  });

  it('`tips: null` en los ajustes → no se pregunta y el hello sigue llevando settings', () => {
    const broken = { ...settings(), tips: null } as unknown as DisplayPresentationSettings;
    const h = harness({ settings: broken });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    const hello = h.transport.published.find((m) => m.t === 'hello') as HelloDraft | undefined;
    expect(hello?.settings).toBe(broken);
  });
});

// ---------------------------------------------------------------------------
// E. Deriva de la base tras la elección
// ---------------------------------------------------------------------------

describe('E. la base cambia DESPUÉS de que el cliente eligiera', () => {
  it('la elección entregada conserva el importe visto (2.025) y el getter tipSelection devuelve ESA misma elección aunque la base suba a 30.000: una sola cifra por elección', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ total: 20250 }));
    h.flush();
    h.emitter.setPayment(cashPayment(20250));
    h.emitter.setTipBase(20250);
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10));
    expect(h.selections[0]?.amount).toBe(2025);
    expect(h.emitter.tipSelection?.amount).toBe(2025);
    // El cajero cambia un descuento en el modal: la base sube.
    h.emitter.setTipBase(30000);
    expect(h.selections[0]?.amount).toBe(2025); // lo que el aviso muestra y «Aplicar» aplica
    expect(h.emitter.tipSelection?.amount).toBe(2025); // el getter congela la misma cifra (ronda 8)
    expect(h.emitter.tipSelection).toBe(h.selections[0]); // y es la MISMA referencia entregada al oyente
    // Quien quiera el importe con la base nueva lo recalcula explícitamente.
    expect(computeTipAmount(30000, 10)).toBe(3000);
    // Cerrar la fase olvida la elección congelada.
    h.emitter.setPayment(null);
    expect(h.emitter.tipSelection).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F. Defecto: el aviso informativo promete importes que la pantalla no pinta
// ---------------------------------------------------------------------------

describe('F. pantalla NO táctil, presets vacíos y solo «Otro»', () => {
  it('la pantalla cae al cobro (QA-7) mientras el emisor sigue en mode tip y la fase pendiente', () => {
    const h = harness({ settings: settings({ presets: [], allowCustom: true }, { touch: 'no-touch' }) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    const state = h.transport.lastState;
    expect(state.mode).toBe('tip');
    expect(resolveView({ connected: true, disconnectedTooLong: false, updateRequired: false, thanksExpired: false, touch: false, state })).toBe('payment_cash');
  });

  it('F2B-R7-1 (corregido, ronda 8): con presetsCount 0 y sin táctil el aviso de la caja es null, no «La pantalla muestra las propinas sugeridas»', () => {
    const h = harness({ settings: settings({ presets: [], allowCustom: true }, { touch: 'no-touch' }) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    const presetsCount = h.emitter.getState().tip?.presets.length ?? 0;
    expect(presetsCount).toBe(0);
    const notice = resolveTipWaitingNotice({ phase: h.emitter.tipPhase, displayMode: h.emitter.getState().mode, connected: true, touch: false, presetsCount });
    expect(notice).toBeNull();
    expect(notice?.text ?? null).not.toBe(TIP_INFORMATIONAL_TEXT);
  });

  it('con presets y sin táctil el aviso sigue siendo informativo; con táctil y 0 presets sigue «esperando» (la pantalla sí pinta «Otro»)', () => {
    const base = { phase: 'pending' as const, displayMode: 'tip' as const, connected: true };
    expect(resolveTipWaitingNotice({ ...base, touch: false, presetsCount: 3 })?.kind).toBe('informational');
    expect(resolveTipWaitingNotice({ ...base, touch: false })?.kind).toBe('informational'); // llamador sin el campo: como antes
    expect(resolveTipWaitingNotice({ ...base, touch: true, presetsCount: 0 })?.kind).toBe('waiting');
    expect(resolveTipWaitingNotice({ ...base, touch: null, presetsCount: 0 })?.kind).toBe('waiting');
  });
});

// ---------------------------------------------------------------------------
// G. stop()/start() con la fase pendiente
// ---------------------------------------------------------------------------

describe('G. parar y arrancar la caja con la pregunta en pantalla', () => {
  it('stop() avisa null y start() (misma organización) NO reabre la fase: el primer state es «order» y el cobro siguiente vuelve a preguntar', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.emitter.setTipBase(5000);
    h.flush();
    expect(h.emitter.tipPhase).toBe('pending');
    h.emitter.stop();
    expect(h.phases).toEqual(['pending', null]);
    h.emitter.start(START);
    expect(h.transport.lastState.mode).toBe('order');
    expect(h.emitter.tipPhase).toBeNull();
    // Sin setTipBase nuevo: la base anterior no sobrevivió (QA-1).
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(5000); // total proyectado, no una base residente distinta
    expect(h.phases).toEqual(['pending', null, 'pending']);
  });

  it('un tip_selected que llega al transporte viejo tras stop() no se acepta ni avisa', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.emitter.stop();
    h.transport.emitUp(tipSelected('percent', 10));
    expect(h.selections).toHaveLength(0);
    expect(h.emitter.tipPhase).toBeNull();
  });
});
