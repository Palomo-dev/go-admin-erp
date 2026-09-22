/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 9 (QA de la
 * ronda 4 de cierre: selección congelada + lectura inicial del getter).
 *
 * Lo que se ataca aquí, por la API pública y el camino de producción:
 *
 *  A. Filas REALES de `organization_settings` a 2026-09-22 (verificado con
 *     el MCP, solo lectura): las tres organizaciones con
 *     `pos_customer_display` guardado son de la Fase 0 y NO llevan bloque
 *     `tips` (ni `touch`). Con esa fila la fase de propina no debe abrirse
 *     nunca, y `pos_terminals` sigue con 0 filas: la fase corre con el UUID
 *     local sin vincular.
 *  B. Tope del importe libre: `isAcceptableTipChoice('amount', v)` exige
 *     v < TIP_AMOUNT_LIMIT, pero el importe RESUELTO es `Math.round(v)`:
 *     999.999.999,5 pasa el filtro y se resuelve a 1.000.000.000, que es
 *     exactamente el tope «exclusivo». Se documenta (bajo): la pantalla
 *     propia solo manda enteros de 9 cifras.
 *  C. Carrera cajero ↔ cliente: el cajero pulsa «Omitir» (o teclea el
 *     efectivo → cashierMovedOn) en el mismo instante en que el cliente
 *     pulsa 10 %: el `tip_selected` llega con la fase en «done» y se
 *     DESCARTA sin avisar a la caja ni reabrir la fase; el getter queda
 *     null y la pantalla ya pinta «Cobro». Conducta esperada (documentada
 *     en el emisor), aquí queda clavada.
 *  D. Dos cajas con la MISMA terminal por BroadcastChannel real, las dos en
 *     cobro con propina sobre el MISMO carrito (localStorage compartido):
 *     la pantalla adopta a la visible y su `tip_selected` va dirigido
 *     (`toInstanceId`): solo la adoptada cierra la fase y la oculta sigue
 *     «pending». Un `tip_selected` SIN `toInstanceId` (sobre fabricado o
 *     receptor antiguo) lo aceptan las dos: se documenta como límite (bajo).
 *  E. Congelación: `Object.freeze` es superficial y basta porque
 *     TipSelection es plana; se comprueba que TODAS las claves son
 *     primitivas (si alguien añade un objeto anidado, este test lo delata).
 *     Y la selección que recibe `onApply` del aviso (la que CheckoutDialog
 *     desestructura en `setTipPercentage(selection.percent)`) es la misma
 *     congelada: leerla no lanza.
 *  F. Aritmética: casos límite de `computeTipAmount` (redondeo .5 hacia
 *     arriba, la fórmula no diverge de la del modal para presets
 *     arbitrarios, base decimal, base enorme) y `tipOptions` con presets
 *     fuera de la lista blanca de settings.ts (0, 101, 7.5, NaN, '10').
 *  G. `sanitizeDisplayTip` frente a `selected` basura y `base` -0 / NaN /
 *     negativa: nunca lanza y nunca deja un bloque que pinte «-$ 0».
 *  H. Pantalla NO táctil con `tips.enabled`: la caja emite 'tip' igual
 *     (PLAN §4.4: informativo) y el aviso pasa a «Continuar»; con override
 *     'no-touch' sobre hardware táctil también.
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { parseCustomerDisplaySettings, toDisplayPresentationSettings } from '@/lib/pos/display/settings';
import {
  TIP_AMOUNT_LIMIT,
  TIP_CUSTOM_MAX_DIGITS,
  computeTipAmount,
  isAcceptableTipChoice,
  resolveTipSelection,
  sanitizeDisplayTip,
  tipOptions,
  type TipSelection,
} from '@/lib/pos/display/tip';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName, type DisplayTransport, type HelloDraft } from '@/lib/pos/display/transport';
import { INITIAL_LINK_SNAPSHOT, startDisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import { resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';
import { describeTipSelection, resolveNoticeTouch, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';

// ---------------------------------------------------------------------------
// Utilidades (mismas que las rondas anteriores)
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee9';
const INSTANCE_A = '11111111-1111-4111-8111-111111111119';
const INSTANCE_B = '22222222-2222-4222-8222-222222222229';

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
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
    if (msg.t === 'display_alive' || msg.t === 'need_snapshot') {
      this.lastDisplayCapabilities = { ...msg.capabilities };
      this.lastDisplaySeenAt = Date.now();
    } else if (msg.t === 'display_bye') {
      this.lastDisplayCapabilities = null;
      this.lastDisplaySeenAt = null;
    }
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

function harness(opts: { settings?: DisplayPresentationSettings } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings ?? settings() };
  const selections: TipSelection[] = [];
  const phases: TipPhase[] = [];
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
    schedule: sched.schedule,
    getSettings: () => current.settings,
  });
  emitter.onTipSelected((s) => selections.push(s));
  emitter.onTipPhaseChange((p) => phases.push(p));
  return { emitter, transport, flush: sched.flush, current, selections, phases };
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

/** Abre el cobro con propina pendiente sobre base 20.250 (PLAN §5.3). */
function abrirCobro(h: ReturnType<typeof harness>, base = 20250) {
  h.emitter.start(START);
  h.emitter.setActiveCart(cart({ total: base }));
  h.flush();
  h.emitter.setPayment(cashPayment(base));
  h.emitter.setTipBase(base);
  h.flush();
}

const realScheduler = (fn: () => void) => {
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

function cajaReal(instanceId: string, visible: boolean, opts: { settings?: DisplayPresentationSettings } = {}) {
  const current = { settings: opts.settings ?? settings() };
  const selections: TipSelection[] = [];
  const emitter = new DisplayEmitter({
    createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId })),
    isEnabled: () => true,
    getSettings: () => current.settings,
    isVisible: () => visible,
    schedule: realScheduler,
  });
  emitter.onTipSelected((s) => selections.push(s));
  emitter.start({ ...START, sessionOpen: false });
  track({ close: () => emitter.stop() });
  return { emitter, current, selections };
}

function pantallaReal(hardwareTouch: boolean) {
  const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 20, adoptionWindowMs: 60 }));
  let snap: DisplayLinkSnapshot = INITIAL_LINK_SNAPSHOT;
  const link = startDisplayLink({
    receiver,
    capabilities: () => ({ touch: hardwareTouch, width: 1280, height: 800 }),
    onChange: (next) => {
      snap = next;
    },
    staleAfterMs: 400,
    healthIntervalMs: 20,
    resnapshotIntervalMs: 30,
  });
  track({ close: () => link.stop() });
  return { receiver, link, snap: () => snap };
}

const SRC = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

// ---------------------------------------------------------------------------
// A. Filas reales de organization_settings (Fase 0, sin bloque tips)
// ---------------------------------------------------------------------------

describe('A. filas reales de organization_settings sin bloque tips: la fase no se abre', () => {
  // Forma exacta de las 3 filas vistas en la BD (org 125 / 134 / 140): solo `enabled`, sin `tips` ni `touch`.
  const filaFase0 = { enabled: true };

  it('parseCustomerDisplaySettings de la fila de la Fase 0 → tips.enabled=false, presets por defecto y touch auto', () => {
    const parsed = parseCustomerDisplaySettings(filaFase0);
    expect(parsed.enabled).toBe(true);
    expect(parsed.tips.enabled).toBe(false);
    expect(parsed.tips.presets).toHaveLength(3);
    expect(parsed.touch).toBe('auto');
  });

  it('con esos ajustes la caja entra en cobro directamente en «payment» (sin fase de propina) y no hay avisos de fase', () => {
    const h = harness({ settings: toDisplayPresentationSettings(parseCustomerDisplaySettings(filaFase0)) });
    abrirCobro(h);
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipPhase).toBeNull();
    expect(h.phases).toEqual([]);
    // Un tip_selected que llegara igual (pantalla vieja) no hace nada.
    h.transport.emitUp(tipSelected('percent', 10));
    expect(h.selections).toEqual([]);
    expect(h.emitter.tipSelection).toBeNull();
  });

  it.each([
    ['tips: null', { enabled: true, tips: null }],
    ['tips: "si"', { enabled: true, tips: 'si' }],
    ['tips.enabled: "true" (cadena)', { enabled: true, tips: { enabled: 'true', presets: [5, 10, 15], allowCustom: true } }],
    ['presets con 2 elementos', { enabled: true, tips: { enabled: true, presets: [5, 10], allowCustom: true } }],
    ['presets repetidos', { enabled: true, tips: { enabled: true, presets: [10, 10, 15], allowCustom: true } }],
    ['presets fuera de rango', { enabled: true, tips: { enabled: true, presets: [0, 10, 101], allowCustom: true } }],
  ])('ajustes inválidos en la fila (%s) nunca lanzan y caen a defaults seguros', (_label, raw) => {
    const parsed = parseCustomerDisplaySettings(raw);
    expect(parsed.tips.presets).toHaveLength(3);
    expect(new Set(parsed.tips.presets).size).toBe(3);
    for (const p of parsed.tips.presets) expect(Number.isInteger(p) && p >= 1 && p <= 100).toBe(true);
    const h = harness({ settings: toDisplayPresentationSettings(parsed) });
    expect(() => abrirCobro(h)).not.toThrow();
    expect(['tip', 'payment']).toContain(h.transport.lastState.mode);
  });
});

// ---------------------------------------------------------------------------
// B. Tope del importe libre tras el redondeo
// ---------------------------------------------------------------------------

describe('B. TIP_AMOUNT_LIMIT es exclusivo ANTES del redondeo, no después', () => {
  it('documenta (bajo): 999.999.999,5 pasa isAcceptableTipChoice y se resuelve a 1.000.000.000 === TIP_AMOUNT_LIMIT', () => {
    const casi = TIP_AMOUNT_LIMIT - 0.5;
    expect(isAcceptableTipChoice('amount', casi)).toBe(true);
    const resolved = resolveTipSelection('cart-1', 20250, { kind: 'amount', value: casi });
    expect(resolved.amount).toBe(TIP_AMOUNT_LIMIT); // ← rompe el «exclusivo» por 0,5
    expect(String(resolved.amount)).toHaveLength(TIP_CUSTOM_MAX_DIGITS + 1);
  });

  it('el emisor lo acepta tal cual (la pantalla propia nunca lo manda: solo enteros de 9 cifras)', () => {
    const h = harness();
    abrirCobro(h);
    h.transport.emitUp(tipSelected('amount', TIP_AMOUNT_LIMIT - 0.5));
    expect(h.selections).toHaveLength(1);
    expect(h.selections[0].amount).toBe(TIP_AMOUNT_LIMIT);
  });

  it('el entero exacto TIP_AMOUNT_LIMIT sí se descarta sin cerrar la fase', () => {
    const h = harness();
    abrirCobro(h);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    h.transport.emitUp(tipSelected('amount', TIP_AMOUNT_LIMIT));
    expect(h.selections).toHaveLength(0);
    expect(h.emitter.tipPhase).toBe('pending');
    expect(warn).toHaveBeenCalled();
  });

  it('un importe libre positivo pero < 0,5 se acepta y se resuelve a 0 → «no dejar propina» informativo (sin «Aplicar»)', () => {
    const h = harness();
    abrirCobro(h);
    h.transport.emitUp(tipSelected('amount', 0.4));
    expect(h.selections).toHaveLength(1);
    expect(h.selections[0]).toMatchObject({ kind: 'amount', amount: 0, percent: null });
    expect(describeTipSelection(h.selections[0], 'COP')).toBe('Cliente eligió no dejar propina');
  });
});

// ---------------------------------------------------------------------------
// C. Carrera cajero ↔ cliente
// ---------------------------------------------------------------------------

describe('C. carrera: el cajero omite en el mismo instante en que el cliente pulsa', () => {
  it('skipTip() y luego tip_selected: la elección se descarta, la fase sigue «done», el getter null y la pantalla en «Cobro»', () => {
    const h = harness();
    abrirCobro(h);
    expect(h.transport.lastState.mode).toBe('tip');
    h.emitter.skipTip();
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(h.selections).toEqual([]);
    expect(h.emitter.tipSelection).toBeNull();
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.phases).toEqual(['pending', 'done']);
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('tip_selected y luego skipTip(): la elección se conserva (skipTip no borra lo ya elegido)', () => {
    const h = harness();
    abrirCobro(h);
    h.transport.emitUp(tipSelected('percent', 10));
    h.emitter.skipTip();
    expect(h.emitter.tipSelection?.amount).toBe(2025);
    expect(h.phases).toEqual(['pending', 'done']);
  });

  it('el cajero cancela el cobro (setPayment(null)) justo antes de que llegue la elección: nada se entrega y la caja vuelve a «order»', () => {
    const h = harness();
    abrirCobro(h);
    h.emitter.setPayment(null);
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(h.selections).toEqual([]);
    expect(h.transport.lastState.mode).toBe('order');
    // Reabrir el cobro vuelve a preguntar desde cero.
    h.emitter.setPayment(cashPayment(20250));
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.selected).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D. Dos cajas con la misma terminal (BroadcastChannel real)
// ---------------------------------------------------------------------------

describe('D. dos cajas con la MISMA terminal y el MISMO carrito en cobro', () => {
  it('la pantalla adopta a la VISIBLE (aunque la oculta saludó después) y su tip_selected solo cierra la fase de la adoptada', async () => {
    const visible = cajaReal(INSTANCE_A, true);
    const oculta = cajaReal(INSTANCE_B, false);
    const c = cart({ total: 20250 });
    for (const caja of [visible, oculta]) {
      caja.emitter.setActiveCart(c);
      caja.emitter.setPayment(cashPayment(20250));
      caja.emitter.setTipBase(20250);
    }
    await flush();
    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.snap().connected && pantalla.snap().state?.mode === 'tip');
    // La oculta reanuncia (p. ej. refresh() tras guardar la tarjeta) y NO releva.
    oculta.emitter.reannounce();
    await flush(4);
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_A);
    expect(visible.emitter.tipPhase).toBe('pending');
    expect(oculta.emitter.tipPhase).toBe('pending');

    pantalla.link.send({ t: 'tip_selected', cartId: 'cart-1', kind: 'percent', value: 10 });
    await waitFor(() => visible.selections.length === 1);
    await flush(4);
    expect(visible.selections[0].amount).toBe(2025);
    expect(visible.emitter.tipPhase).toBe('done');
    // Límite B3 documentado: la oculta sigue «pending» (su aviso se queda esperando hasta Omitir o cambio de ventana).
    expect(oculta.selections).toEqual([]);
    expect(oculta.emitter.tipPhase).toBe('pending');
    await waitFor(() => pantalla.snap().state?.mode === 'payment');
  });

  it('documenta (bajo): un tip_selected SIN toInstanceId (sobre fabricado / receptor antiguo) lo aceptan LAS DOS cajas con el mismo carrito', async () => {
    const visible = cajaReal(INSTANCE_A, true);
    const oculta = cajaReal(INSTANCE_B, false);
    const c = cart({ total: 20250 });
    for (const caja of [visible, oculta]) {
      caja.emitter.setActiveCart(c);
      caja.emitter.setPayment(cashPayment(20250));
      caja.emitter.setTipBase(20250);
    }
    await flush();
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, cartId: 'cart-1', kind: 'percent', value: 10 });
    await waitFor(() => visible.selections.length === 1 && oculta.selections.length === 1);
    expect(visible.emitter.tipPhase).toBe('done');
    expect(oculta.emitter.tipPhase).toBe('done');
    // Nada se aplica solo: el cajero de cada ventana decide.
  });

  it('un tip_selected dirigido a OTRA instancia se ignora por completo (no cierra la fase de esta)', async () => {
    const visible = cajaReal(INSTANCE_A, true);
    visible.emitter.setActiveCart(cart({ total: 20250 }));
    visible.emitter.setPayment(cashPayment(20250));
    visible.emitter.setTipBase(20250);
    await flush();
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    raw.postMessage({ v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, toInstanceId: INSTANCE_B, cartId: 'cart-1', kind: 'percent', value: 10 });
    await flush(6);
    expect(visible.selections).toEqual([]);
    expect(visible.emitter.tipPhase).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// E. Congelación superficial: basta porque TipSelection es plana
// ---------------------------------------------------------------------------

describe('E. Object.freeze superficial es suficiente: TipSelection es plana', () => {
  it('todas las claves de la selección entregada son primitivas (si alguien anida un objeto, este test avisa)', () => {
    const h = harness();
    abrirCobro(h);
    h.transport.emitUp(tipSelected('percent', 10));
    const s = h.selections[0] as unknown as Record<string, unknown>;
    expect(Object.keys(s).sort()).toEqual(['amount', 'cartId', 'kind', 'percent', 'value']);
    for (const [k, v] of Object.entries(s)) {
      expect(v === null || ['string', 'number', 'boolean'].includes(typeof v)).toBe(true);
      expect(k).not.toBe('');
    }
    expect(Object.isFrozen(s)).toBe(true);
  });

  it('la selección congelada se puede desestructurar y copiar como hace CheckoutDialog.onApply; el spread produce una copia mutable independiente', () => {
    const h = harness();
    abrirCobro(h);
    h.transport.emitUp(tipSelected('amount', 3000));
    const s = h.selections[0];
    const { percent, amount } = s;
    expect(percent).toBeNull();
    expect(amount).toBe(3000);
    const copia = { ...s };
    expect(Object.isFrozen(copia)).toBe(false);
    copia.amount = 1;
    expect(h.emitter.tipSelection?.amount).toBe(3000);
  });

  it('describeTipSelection sobre la congelada no intenta escribir (no lanza en modo estricto)', () => {
    const h = harness();
    abrirCobro(h);
    h.transport.emitUp(tipSelected('percent', 15));
    expect(() => describeTipSelection(h.selections[0], 'COP')).not.toThrow();
    expect(describeTipSelection(h.selections[0], 'COP')).toMatch(/^Cliente eligió 15 % \(/);
  });

  it('(fuente) el onApply de CheckoutDialog solo LEE percent/amount de la selección', () => {
    const src = SRC('components/pos/CheckoutDialog.tsx');
    const bloque = src.slice(src.indexOf('<TipFromDisplayNotice'), src.indexOf('/>', src.indexOf('<TipFromDisplayNotice')));
    expect(bloque).toMatch(/setTipPercentage\(selection\.percent\)/);
    expect(bloque).toMatch(/setTipAmount\(selection\.amount\)/);
    expect(bloque).not.toMatch(/selection\.\w+\s*=[^=]/);
  });
});

// ---------------------------------------------------------------------------
// F. Aritmética límite
// ---------------------------------------------------------------------------

describe('F. computeTipAmount / tipOptions en los bordes', () => {
  it.each([
    [20250, 10, 2025],
    [25, 58, 15], // 14,5 → 15 (el modal antes daba 14 con base * (pct/100))
    [1005, 10, 101], // 100,5 → 101
    [1, 1, 0], // 0,01 → 0
    [49, 1, 0], // 0,49 → 0
    [50, 1, 1], // 0,5 → 1
    [0.4, 100, 0], // base decimal < 0,5
    [1e15, 10, 1e14],
    [Number.MAX_SAFE_INTEGER, 100, Number.MAX_SAFE_INTEGER],
  ])('computeTipAmount(%p, %p) = %p', (base, pct, esperado) => {
    expect(computeTipAmount(base, pct)).toBe(esperado);
  });

  it('nunca devuelve -0 ni NaN ni negativo', () => {
    for (const [b, p] of [
      [-5, 10],
      [0, 10],
      [NaN, 10],
      [Infinity, 10],
      [100, -10],
      [100, NaN],
      [100, Infinity],
      [-0, 10],
    ] as const) {
      const r = computeTipAmount(b, p);
      expect(Object.is(r, -0)).toBe(false);
      expect(Number.isFinite(r) && r >= 0).toBe(true);
    }
    expect(computeTipAmount(100, Infinity)).toBe(0); // Infinity × base / 100 = Infinity → debe quedar en 0, no en Infinity
  });

  it('tipOptions descarta 0, 101, 7.5, NaN, "10" y repite el orden de llegada sin duplicados', () => {
    const opts = tipOptions(20250, [0, 15, 101, 7.5, NaN, '10', 10, 15, 5]);
    expect(opts).toEqual([
      { percent: 15, amount: 3038 },
      { percent: 10, amount: 2025 },
      { percent: 5, amount: 1013 },
    ]);
  });

  it('tipOptions con presets que no es array → [] y con base 0 → importes 0', () => {
    expect(tipOptions(100, null)).toEqual([]);
    expect(tipOptions(100, 'x')).toEqual([]);
    expect(tipOptions(0, [5, 10])).toEqual([
      { percent: 5, amount: 0 },
      { percent: 10, amount: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// G. sanitizeDisplayTip con basura
// ---------------------------------------------------------------------------

describe('G. sanitizeDisplayTip: base -0 / NaN / negativa y selected basura', () => {
  it('base -0 se conserva como 0 (>= 0) pero NUNCA pinta «-$»: resolveTipBase devuelve un valor que formatea sin signo', () => {
    const block = sanitizeDisplayTip({ presets: [5, 10, 15], allowCustom: true, base: -0 });
    expect(block).not.toBeNull();
    // -0 >= 0 es true en JS: el saneado lo deja pasar…
    expect(Object.is(block?.base, -0) || block?.base === 0).toBe(true);
    // …y en la pantalla el importe de cada preset sale de computeTipAmount (Math.max(0, …)): nunca -0.
    for (const o of tipOptions(block?.base, block?.presets)) expect(Object.is(o.amount, -0)).toBe(false);
    // Un state con base -0 y presets se pinta como 'tip' en la pantalla (la caja no lo emite: effectiveTipBase() > 0 lo impide).
  });

  it.each([
    ['NaN', NaN],
    ['negativa', -1],
    ['Infinity', Infinity],
    ['cadena', '20250'],
  ])('base %s se omite (la pantalla usa cart.total)', (_l, base) => {
    const block = sanitizeDisplayTip({ presets: [5, 10, 15], allowCustom: true, base });
    expect(block).not.toBeNull();
    expect(block).not.toHaveProperty('base');
  });

  it.each([
    ['selected sin t', { cartId: 'c', kind: 'percent', value: 10 }],
    ['selected con kind desconocido', { t: 'tip_selected', cartId: 'c', kind: 'foo', value: 10 }],
    ['selected con value NaN', { t: 'tip_selected', cartId: 'c', kind: 'percent', value: NaN }],
    ['selected array', []],
    ['selected cadena', 'x'],
  ])('%s → selected null, sin lanzar', (_l, selected) => {
    const block = sanitizeDisplayTip({ presets: [5], allowCustom: false, selected });
    expect(block?.selected).toBeNull();
  });

  it('sin presets válidos y sin «Otro» → null, y la pantalla cae al cobro (resolveView)', () => {
    expect(sanitizeDisplayTip({ presets: [0, 101, 'x'], allowCustom: false })).toBeNull();
    // Carrito proyectado por el emisor real, con un bloque tip basura sobrescrito como lo haría un sobre fabricado.
    const h = harness();
    abrirCobro(h, 5000);
    const emitido = h.transport.lastState;
    const state = sanitizeDisplayState({ ...emitido, mode: 'tip', tip: { presets: [0, 101], allowCustom: false, selected: null, base: 5000 } });
    expect(state.tip).toBeNull();
    expect(resolveView({ connected: true, updateRequired: false, state, touch: true })).not.toBe('tip');
  });
});

// ---------------------------------------------------------------------------
// H. Pantalla NO táctil con propina activada
// ---------------------------------------------------------------------------

describe('H. pantalla NO táctil con tips.enabled (PLAN §4.4: informativo)', () => {
  it('la caja emite «tip» igual y el aviso de la caja es «Continuar» (informativo), no «esperando»', () => {
    const h = harness();
    abrirCobro(h);
    expect(h.transport.lastState.mode).toBe('tip');
    h.transport.emitUp({ v: PROTOCOL_VERSION, t: 'display_alive', terminalId: TERMINAL, capabilities: { touch: false, width: 1280, height: 800 } } as UpMessage);
    const notice = resolveTipWaitingNotice({
      phase: h.emitter.tipPhase,
      displayMode: h.emitter.getState().mode,
      connected: true,
      touch: resolveNoticeTouch(h.emitter.lastDisplayCapabilities, h.emitter.presentationSettings?.touch),
      presetsCount: h.emitter.getState().tip?.presets.length ?? 0,
    });
    expect(notice?.kind).toBe('informational');
  });

  it('override no-touch sobre hardware táctil: la pantalla declara touch:false resuelto y la caja lo cree', async () => {
    const caja = cajaReal(INSTANCE_A, true, { settings: settings({}, { touch: 'no-touch' }) });
    caja.emitter.setActiveCart(cart({ total: 20250 }));
    caja.emitter.setPayment(cashPayment(20250));
    caja.emitter.setTipBase(20250);
    await flush();
    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.snap().connected && pantalla.snap().state?.mode === 'tip');
    await waitFor(() => caja.emitter.lastDisplayCapabilities?.touch === false);
    const notice = resolveTipWaitingNotice({
      phase: caja.emitter.tipPhase,
      displayMode: caja.emitter.getState().mode,
      connected: true,
      touch: resolveNoticeTouch(caja.emitter.lastDisplayCapabilities, caja.emitter.presentationSettings?.touch),
      presetsCount: 3,
    });
    expect(notice?.kind).toBe('informational');
    // La pantalla no táctil no manda tip_selected: pinta importes como información.
    expect(resolveView({ connected: true, updateRequired: false, state: pantalla.snap().state as DisplayState, touch: false })).toBe('tip');
  });

  it('un tip_selected que llegara desde una pantalla que se declara NO táctil se acepta igual (el emisor no filtra por táctil: es la pantalla la que no pregunta)', () => {
    const h = harness();
    abrirCobro(h);
    h.transport.emitUp({ v: PROTOCOL_VERSION, t: 'display_alive', terminalId: TERMINAL, capabilities: { touch: false, width: 1280, height: 800 } } as UpMessage);
    h.transport.emitUp(tipSelected('percent', 5));
    expect(h.selections).toHaveLength(1);
    expect(h.selections[0].amount).toBe(1013);
  });
});
