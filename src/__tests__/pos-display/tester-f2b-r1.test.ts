/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 1.
 *
 * Casos borde que el builder no cubrió en tip-f2b.test.ts:
 *  A. emitter.ts — subtotal 0 con propina, QR vencido sobre la pregunta,
 *     carrito eliminado en plena pregunta, siguiente venta tras «Gracias»,
 *     base de propina que se filtra entre organizaciones (defecto), mensajes
 *     `tip_selected` con valores extremos, `hello.visible` en la respuesta a
 *     need_snapshot de una pestaña oculta.
 *  B. settings.ts — ajustes inválidos en `organization_settings` y lo que
 *     hace el emisor con ellos.
 *  C. transport.ts — dos cajas con la misma terminal, las dos en fase de
 *     propina: la elección solo llega a la VISIBLE; dos hellos ocultos caen a
 *     sessionOpen/seq.
 *  D. TipView.tsx (SSR real) — no táctil con propina activada (sin botones,
 *     importes informativos), táctil (3 botones + Otro + Sin propina),
 *     presets vacíos, base 0, moneda de la organización.
 *
 * Los tests marcados `it.failing` documentan DEFECTOS encontrados: pasan
 * mientras el defecto exista y fallarán (para quitarles el `.failing`) cuando
 * se corrija. Organización ficticia (org 120 / org 121), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isUpMessage,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessage,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { computeTipAmount, resolveTipSelection, type DisplayTipBlock } from '@/lib/pos/display/tip';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings } from '@/lib/pos/display/settings';
import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  isBetterHello,
  type DisplayTransport,
  type HelloDraft,
} from '@/lib/pos/display/transport';
import { resolveTouch, resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';
import { describeTipSelection } from '@/components/pos/display/tipNotice';

// settings.ts importa el cliente de navegador de Supabase: aquí solo se usa la
// parte pura (parseCustomerDisplaySettings), así que basta con un stub.
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));

// next-intl es solo ESM: se sustituye por un useTranslations mínimo sobre es.json.
const messagesEs = JSON.parse(readFileSync(join(process.cwd(), 'messages/es.json'), 'utf8')) as Record<string, unknown>;
jest.mock('next-intl', () => ({
  useLocale: () => 'es',
  useTranslations: (ns: string) => (key: string, vars?: Record<string, unknown>) => {
    const path = `${ns}.${key}`.split('.');
    let cur: unknown = messagesEs;
    for (const k of path) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined;
    if (typeof cur !== 'string') throw new Error(`clave i18n ausente: ${path.join('.')}`);
    return cur.replace(/\{(\w+)\}/g, (_, v: string) => String(vars?.[v] ?? `{${v}}`));
  },
}));

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

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

function harness(opts: { settings?: DisplayPresentationSettings | null; isVisible?: () => boolean } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings === undefined ? settings() : opts.settings };
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
    schedule: sched.schedule,
    ...(opts.isVisible ? { isVisible: opts.isVisible } : {}),
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
const tipSelected = (kind: 'percent' | 'amount' | 'none', value: number, cartId = 'cart-1'): UpMessage => ({
  v: PROTOCOL_VERSION,
  t: 'tip_selected',
  terminalId: TERMINAL,
  cartId,
  kind,
  value,
});

// ---------------------------------------------------------------------------
// A. emitter.ts · casos borde de la fase de propina
// ---------------------------------------------------------------------------

describe('emitter.ts · casos borde de la propina (tester F2-B r1)', () => {
  it('subtotal 0 (descuento del 100 %) con propina activada: NO se pregunta («5 % · $0» no describe nada), se pinta el cobro (ronda 2, QA-5)', () => {
    // Ronda 1 documentaba la pregunta con base 0; la ronda 2 la trata como no
    // pintable (derivado, como hasLines): la fase queda pendiente y el state es 'payment'.
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ subtotal: 5000, discount_total: 5000, total: 0 }));
    h.emitter.setTipBase(0);
    h.emitter.setPayment(cashPayment(0));
    h.flush();
    const state = h.transport.lastState;
    expect(state.mode).toBe('payment');
    expect(state.tip).toBeNull();
    expect(h.emitter.tipPhase).toBe('pending');
    expect(computeTipAmount(0, 10)).toBe(0);
    // Si la caja corrige la base (impuestos recalculados), la pregunta aparece.
    h.emitter.setTipBase(5000);
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
  });

  it('describeTipSelection con porcentaje y base 0 dice «Cliente eligió 10 % ($0)», nunca «no dejar propina» (ronda 2, QA-5)', () => {
    const percentZero = resolveTipSelection('cart-1', 0, { kind: 'percent', value: 10 });
    expect(percentZero.amount).toBe(0);
    expect(describeTipSelection(percentZero, 'COP')).toMatch(/^Cliente eligió 10 % \(.*0.*\)$/);
    expect(describeTipSelection(resolveTipSelection('cart-1', 0, { kind: 'none', value: 0 }), 'COP')).toBe('Cliente eligió no dejar propina');
    expect(describeTipSelection(resolveTipSelection('cart-1', 0, { kind: 'amount', value: 0 }), 'COP')).toBe('Cliente eligió no dejar propina');
  });

  it('QR VENCIDO se impone a la pregunta de propina; al retirar el QR (volver a efectivo) la pregunta reaparece sin reabrir la fase', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    // QR vencido: qr null pero expiresAt numérico (resolveDisplayQr lo deja así).
    h.emitter.setPayment({ method: 'qr', total: 5000, provider: 'Bre-B', qr: null, expiresAt: Date.now() - 60_000 });
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.lastState.tip).toBeNull();
    expect(h.emitter.tipPhase).toBe('pending'); // la fase sigue abierta
    // Un tip_selected en ese momento (pantalla rezagada o táctil con la vista anterior) sigue aceptándose.
    const got: string[] = [];
    h.emitter.onTipSelected((s) => got.push(s.kind));
    // QR sin código y sin vencimiento (interruptor «Mostrar en pantalla» apagado) → vuelve la pregunta.
    h.emitter.setPayment({ method: 'qr', total: 5000, provider: 'Bre-B', qr: null, expiresAt: null });
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(got).toEqual(['percent']);
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('el carrito desaparece (removeCart al cobrar) en plena pregunta: se olvida cobro y fase sin emitir un «tip»/«payment» sin carrito', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    h.emitter.onCartsSaved([]); // el carrito activo ya no está
    h.flush();
    expect(h.transport.lastState.mode).toBe('idle');
    expect(h.emitter.tipPhase).toBeNull();
    expect(h.transport.states.every((s) => s.mode !== 'tip' || s.cart !== null)).toBe(true);
    // thanks llega después (flujo real) y no resucita la pregunta
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    expect(h.transport.lastState.mode).toBe('thanks');
    expect(h.transport.lastState.tip).toBeNull();
  });

  it('tras «Gracias», la siguiente venta (otro carrito) vuelve a preguntar con la base nueva', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10));
    h.emitter.setMode('thanks', { total: 7025 });
    h.flush();
    expect(h.emitter.tipSelection).toBeNull();
    h.emitter.setActiveCart(cart({ id: 'cart-2', total: 9000, items: [item({ id: 'l9', unit_price: 9000, total: 9000 })] }));
    h.emitter.onCartsSaved([cart({ id: 'cart-2', total: 9000, items: [item({ id: 'l9', unit_price: 9000, total: 9000 })] })]);
    h.flush();
    h.emitter.setTipBase(9000);
    h.emitter.setPayment(cashPayment(9000));
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(9000);
    expect(h.transport.lastState.cart?.id).toBe('cart-2');
  });

  it('una mutación de líneas durante la pregunta (onCartsSaved) no cierra la fase ni cambia presets; la base sigue siendo la de la caja', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setTipBase(5000);
    h.emitter.setPayment(cashPayment());
    h.flush();
    const bigger = cart({ items: [item({ id: 'l1' }), item({ id: 'l2', product_id: 2 })], subtotal: 10000, total: 10000 });
    h.emitter.onCartsSaved([bigger]);
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.cart?.lines).toHaveLength(2);
    expect(h.transport.lastState.tip?.base).toBe(5000); // la caja aún no reenvió la base: la pantalla mostraría 10 % de 5.000 sobre un pedido de 10.000
    h.emitter.setTipBase(10000);
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(10000);
  });

  it('CORREGIDO F2B-R1-1 (ronda 2): la base de propina (setTipBase) NO sobrevive a stop()/start() con OTRA organización; el primer «tip» de la nueva lleva su propio total', () => {
    // CheckoutDialog llama a setTipBase en un efecto propio; si el modal se
    // abre antes de que ese efecto corra, la pantalla debe ver el total de
    // ESTA venta, nunca la base de la venta/organización anterior.
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
    h.emitter.setPayment(cashPayment(40));
    h.flush();
    const state = h.transport.lastState;
    expect(state.mode).toBe('tip');
    // Sin base de ESTA venta, el total proyectado (40); nunca 20250 de la organización anterior.
    expect(state.tip?.base).toBe(40);
    expect(state.cart?.total).toBe(40);
  });

  it('setTipBase con la caja SIN arrancar (CheckoutDialog en mesas) se IGNORA, como setPayment/setMode (ronda 2, QA-1)', () => {
    const h = harness();
    h.emitter.setTipBase(123456); // mesas: nadie arrancó el emisor
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.tip?.base).toBe(5000); // el total proyectado, no la base residente
  });

  it('tip_selected con importe libre absurdo (1e15) o percent no entero: el guard de forma lo deja pasar, pero la caja lo DESCARTA sin cerrar la fase (ronda 2, QA-4)', () => {
    const huge = tipSelected('amount', 1e15);
    expect(isUpMessage(huge)).toBe(true);
    expect(isUpMessage(tipSelected('amount', Number.MAX_VALUE))).toBe(true);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    const got: Array<{ kind: string; amount: number }> = [];
    h.emitter.onTipSelected((s) => got.push({ kind: s.kind, amount: s.amount }));
    h.transport.emitUp(huge);
    h.flush();
    expect(got).toEqual([]);
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.transport.lastState.mode).toBe('tip');
    expect(warn).toHaveBeenCalled();
    // Un importe de 9 cifras (el máximo del teclado de la pantalla) sí llega.
    h.transport.emitUp(tipSelected('amount', 999_999_999));
    h.flush();
    expect(got).toEqual([{ kind: 'amount', amount: 999_999_999 }]);

    // percent 7,5 (no es un preset válido) → se descarta y la fase SIGUE pendiente.
    const g = harness();
    g.emitter.start(START);
    g.emitter.setActiveCart(cart());
    g.emitter.setPayment(cashPayment());
    g.flush();
    const got2: Array<{ kind: string; amount: number }> = [];
    g.emitter.onTipSelected((s) => got2.push({ kind: s.kind, amount: s.amount }));
    g.transport.emitUp(tipSelected('percent', 7.5));
    g.flush();
    expect(got2).toEqual([]);
    expect(g.emitter.tipPhase).toBe('pending');
  });

  it('resolveTipSelection con base cambiada entre lo que el cliente vio y lo que la caja resuelve: manda el porcentaje, no el importe visto', () => {
    // La pantalla envía {percent, 10}; si la caja recalculó impuestos y su
    // base pasó de 20.000 a 20.250, aplica 2.025, no 2.000. Coherente con
    // handleTipPercentage, pero distinto de la cifra que el cliente vio.
    expect(resolveTipSelection('c', 20000, { kind: 'percent', value: 10 }).amount).toBe(2000);
    expect(resolveTipSelection('c', 20250, { kind: 'percent', value: 10 }).amount).toBe(2025);
  });

  it('la respuesta a need_snapshot de una pestaña OCULTA lleva visible:false; la de la visible, true (así la elección del receptor puede preferirla)', () => {
    const hidden = harness({ isVisible: () => false });
    hidden.emitter.start(START);
    hidden.transport.emitUp({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: CAPS });
    const lastHidden = hidden.transport.hellos.at(-1);
    expect(lastHidden?.visible).toBe(false);

    const visible = harness({ isVisible: () => true });
    visible.emitter.start(START);
    visible.transport.emitUp({ v: PROTOCOL_VERSION, t: 'need_snapshot', terminalId: TERMINAL, capabilities: CAPS });
    expect(visible.transport.hellos.at(-1)?.visible).toBe(true);

    // isVisible que lanza → se asume visible (nunca deja de saludar por no saberlo) y avisa por consola.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = harness({
      isVisible: () => {
        throw new Error('sin document');
      },
    });
    broken.emitter.start(START);
    expect(broken.transport.hellos.at(-1)?.visible).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('getSettings que lanza al entrar en cobro: no hay pregunta, se avisa y el cobro sale igual (PLAN §5.5: nada lanza hacia la venta)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const sched = manualScheduler();
    const transport = new FakeTransport();
    let calls = 0;
    const emitter = new DisplayEmitter({
      createTransport: () => transport,
      isEnabled: () => true,
      schedule: sched.schedule,
      getSettings: () => {
        calls += 1;
        if (calls > 1) throw new Error('caché rota'); // el saludo inicial pasa; falla al abrir la fase
        return settings();
      },
    });
    emitter.start(START);
    emitter.setActiveCart(cart());
    expect(() => emitter.setPayment(cashPayment())).not.toThrow();
    sched.flush();
    expect(transport.lastState.mode).toBe('payment');
    expect(emitter.tipPhase).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('setMode("tip") desde fuera no fuerza la fase (solo setPayment la abre)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    const before = h.transport.published.length;
    h.emitter.setMode('tip');
    h.flush();
    expect(h.transport.published.length).toBe(before);
    expect(h.emitter.tipPhase).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// B. settings.ts · ajustes inválidos en organization_settings
// ---------------------------------------------------------------------------

describe('settings.ts → emitter: ajustes de propina inválidos en organization_settings', () => {
  function emitterWith(raw: unknown) {
    const parsed = parseCustomerDisplaySettings(raw);
    const presentation = toDisplayPresentationSettings(parsed);
    const h = harness({ settings: presentation });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.emitter.setPayment(cashPayment());
    h.flush();
    return { parsed, presentation, state: h.transport.lastState };
  }

  it('presets repetidos / fuera de rango / decimales con enabled:true → se pregunta con 5/10/15 (el catch de zod degrada SOLO presets)', () => {
    for (const presets of [[5, 5, 5], [0, 10, 15], [5, 10, 150], [5, 7.5, 10], [5, 10], 'x', null]) {
      const { state } = emitterWith({ enabled: true, tips: { enabled: true, presets, allowCustom: false } });
      expect(state.mode).toBe('tip');
      expect(state.tip?.presets).toEqual([5, 10, 15]);
      expect(state.tip?.allowCustom).toBe(false);
    }
  });

  it('tips.enabled que no es booleano ("true", 1) → propina DESACTIVADA (cobro directo)', () => {
    for (const enabled of ['true', 1, 'yes']) {
      const { state } = emitterWith({ enabled: true, tips: { enabled, presets: [5, 10, 15], allowCustom: true } });
      expect(state.mode).toBe('payment');
    }
  });

  it('bloque tips que no es objeto ("sí", [], null) o ausente → desactivado con los valores por defecto de PLAN §5.2', () => {
    for (const tips of ['sí', [], null, undefined, 42]) {
      const { parsed, state } = emitterWith({ enabled: true, tips });
      expect(parsed.tips).toEqual({ enabled: false, presets: [5, 10, 15], allowCustom: true });
      expect(state.mode).toBe('payment');
    }
  });

  it('presets se guardan ordenados: [15, 5, 10] → [5, 10, 15] y así viajan a la pantalla', () => {
    const { state } = emitterWith({ enabled: true, tips: { enabled: true, presets: [15, 5, 10], allowCustom: true } });
    expect(state.tip?.presets).toEqual([5, 10, 15]);
  });

  it('touch inválido ("si") → auto; con auto y maxTouchPoints 0 la pantalla NO muestra botones aunque tips esté activada', () => {
    const parsed = parseCustomerDisplaySettings({ enabled: true, touch: 'si', tips: { enabled: true, presets: [5, 10, 15], allowCustom: true } });
    expect(parsed.touch).toBe('auto');
    expect(resolveTouch(false, toDisplayPresentationSettings(parsed).touch)).toBe(false);
    expect(resolveTouch(true, toDisplayPresentationSettings(parsed).touch)).toBe(true);
    expect(resolveTouch(true, 'no-touch')).toBe(false);
    expect(resolveTouch(false, 'touch')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// C. transport.ts · dos cajas con la misma terminal
// ---------------------------------------------------------------------------

describe('transport.ts · dos cajas (misma terminal) en fase de propina', () => {
  it('isBetterHello: dos hellos OCULTOS (visible:false ambos) caen a sessionOpen y luego seq; visible:false frente a null no decide', () => {
    expect(isBetterHello({ visible: false, sessionOpen: true, seq: 1 }, { visible: false, sessionOpen: false, seq: 99 })).toBe(true);
    expect(isBetterHello({ visible: false, sessionOpen: true, seq: 100 }, { visible: false, sessionOpen: true, seq: 99 })).toBe(true);
    expect(isBetterHello({ visible: false, sessionOpen: true, seq: 99 }, { visible: false, sessionOpen: true, seq: 99 })).toBe(false);
    expect(isBetterHello({ visible: false, sessionOpen: true, seq: 100 }, { visible: null, sessionOpen: true, seq: 99 })).toBe(true);
    expect(isBetterHello({ visible: null, sessionOpen: false, seq: 1 }, { visible: false, sessionOpen: true, seq: 99 })).toBe(false);
  });

  it('extremo a extremo: las DOS cajas en fase de propina; la pantalla sigue a la visible y su tip_selected solo cierra la fase de ESA caja', async () => {
    const presentation = settings();
    function caja(instanceId: string, visible: boolean) {
      const transports: BroadcastChannelTransport[] = [];
      const emitter = new DisplayEmitter({
        createTransport: () => {
          const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0 }));
          transports.push(t);
          return t;
        },
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
    for (let i = 0; i < 10; i += 1) oculta.setSession({ cashier: { name: `c${i}` } }); // seq alto
    const visible = caja(INSTANCE_A, true);
    for (const e of [oculta, visible]) {
      e.setActiveCart(cart());
      e.setTipBase(20250);
      e.setPayment(cashPayment());
    }
    await flush(4);
    expect(oculta.tipPhase).toBe('pending');
    expect(visible.tipPhase).toBe('pending');

    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const states: Array<{ instanceId: string; mode: string }> = [];
    display.onDown((m: DownMessage) => {
      if (m.t === 'state') states.push({ instanceId: m.instanceId, mode: m.state.mode });
    });
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => display.activeInstanceId === INSTANCE_A && states.some((s) => s.instanceId === INSTANCE_A && s.mode === 'tip'));

    const gotA: string[] = [];
    const gotB: string[] = [];
    visible.onTipSelected((s) => gotA.push(`${s.percent}:${s.amount}`));
    oculta.onTipSelected((s) => gotB.push(`${s.percent}:${s.amount}`));
    display.send({ t: 'tip_selected', cartId: 'cart-1', kind: 'percent', value: 10 });
    await waitFor(() => gotA.length === 1);
    await waitFor(() => states.at(-1)?.mode === 'payment');
    expect(gotA).toEqual(['10:2025']);
    expect(gotB).toEqual([]); // la oculta ni se entera (toInstanceId)
    expect(visible.tipPhase).toBe('done');
    expect(oculta.tipPhase).toBe('pending');
    // La pantalla ve el cobro de la visible; ningún state de la oculta se aceptó.
    expect(states.at(-1)).toEqual({ instanceId: INSTANCE_A, mode: 'payment' });
    // La oculta pudo responder primero al need_snapshot (adopción transitoria dentro de la ventana de
    // elección); pero desde que la visible releva, ningún state de la oculta vuelve a aceptarse.
    const firstA = states.findIndex((s) => s.instanceId === INSTANCE_A);
    expect(firstA).toBeGreaterThanOrEqual(0);
    expect(states.slice(firstA).every((s) => s.instanceId === INSTANCE_A)).toBe(true);
    expect(states.filter((s) => s.instanceId === INSTANCE_B).length).toBeLessThanOrEqual(1);
    oculta.stop();
    visible.stop();
  });

  it('terminal sin vincular a pos_terminals: el transporte funciona con cualquier UUID local; un terminalId vacío se rechaza al construir', () => {
    expect(() => new BroadcastChannelTransport({ terminalId: '' })).toThrow(/terminalId vacío/);
    const t = track(new BroadcastChannelTransport({ terminalId: TERMINAL }));
    expect(t.terminalId).toBe(TERMINAL);
  });
});

// ---------------------------------------------------------------------------
// D. TipView.tsx · SSR real (react-dom/server)
// ---------------------------------------------------------------------------

const SRC = join(process.cwd(), 'src');
const tsxCache = new Map<string, Record<string, unknown>>();

function loadTsx(absPath: string): Record<string, unknown> {
  const cached = tsxCache.get(absPath);
  if (cached) return cached;
  const source = readFileSync(absPath, 'utf8');
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic', target: 'es2020', sourcefile: absPath });
  const mod = { exports: {} as Record<string, unknown> };
  tsxCache.set(absPath, mod.exports);
  const localRequire = (spec: string): unknown => {
    let target: string | null = null;
    if (spec.startsWith('.')) target = resolvePath(dirname(absPath), spec);
    else if (spec.startsWith('@/')) target = join(SRC, spec.slice(2));
    if (target !== null) {
      try {
        readFileSync(target + '.tsx');
        return loadTsx(target + '.tsx');
      } catch {
        /* no es .tsx */
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(target);
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(spec);
  };
  const fn = new Function('require', 'module', 'exports', code) as (r: typeof localRequire, m: typeof mod, e: typeof mod.exports) => void;
  fn(localRequire, mod, mod.exports);
  tsxCache.set(absPath, mod.exports);
  return mod.exports;
}

const { TipView } = loadTsx(join(SRC, 'components/pos-display/TipView.tsx')) as { TipView: React.ComponentType<Record<string, unknown>> };
const T = (messagesEs.posDisplay as { tip: Record<string, string> }).tip;
const BRAND = { name: 'Tienda de calzado', logoUrl: null, primaryColor: '#1f2937', timezone: 'America/Bogota', unknown: false };

const displayCart: DisplayState['cart'] = {
  id: 'c1',
  currency: 'COP',
  lines: [{ id: 'l1', name: 'Café', variant: null, qty: 1, unitPrice: 20250, total: 20250, modifiers: [], discount: null, note: null, taxExcluded: false, taxIncluded: false }],
  subtotal: 20250,
  discountTotal: 0,
  discountLabel: null,
  taxTotal: 0,
  taxIncluded: false,
  total: 20250,
  lastChangedLineId: null,
};

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function renderTip(tip: DisplayTipBlock, extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(React.createElement(TipView, { cart: displayCart, tip, currency: 'COP', brand: BRAND, touch: true, onSelect: () => {}, ...extra }));
}

describe('TipView (SSR real): lo que el cliente ve en «Propina»', () => {
  const tip: DisplayTipBlock = { presets: [5, 10, 15], allowCustom: true, selected: null, base: 20250 };

  it('NO táctil con propina activada: pregunta + «indique al cajero», los 3 importes como información y NINGÚN botón', () => {
    const html = renderTip(tip, { touch: false });
    expect(html).toContain(esc(T.question));
    expect(html).toContain(esc(T.tellCashier));
    expect(html).not.toContain('<button');
    expect(html).toContain('data-tip-touch="false"');
    for (const [pct, amount] of [
      [5, '1.013'],
      [10, '2.025'],
      [15, '3.038'],
    ] as const) {
      expect(html).toContain(`data-tip-percent="${pct}"`);
      expect(html).toContain(amount);
    }
    expect(html).not.toContain(esc(T.other));
    expect(html).not.toContain(esc(T.none));
  });

  it('táctil sin onSelect (la pantalla aún no sabe a qué carrito responder): tampoco hay botones', () => {
    const html = renderTip(tip, { touch: true, onSelect: undefined });
    expect(html).not.toContain('<button');
    expect(html).toContain(esc(T.tellCashier));
  });

  it('táctil: 3 botones de porcentaje con importe en vivo, «Otro» y «Sin propina»; el total al pie es la base', () => {
    const html = renderTip(tip, { touch: true });
    expect(html).toContain('data-tip-touch="true"');
    expect((html.match(/<button/g) ?? []).length).toBe(5);
    expect(html).toContain('data-tip-percent="10"');
    expect(html).toContain('2.025');
    expect(html).toContain('data-tip-other="true"');
    expect(html).toContain('data-tip-none="true"');
    expect(html).toContain(esc(T.other));
    expect(html).toContain(esc(T.none));
    expect(html).not.toContain(esc(T.tellCashier));
    expect(html).toContain('20.250');
  });

  it('allowCustom:false → sin «Otro»; «Sin propina» ocupa las dos columnas', () => {
    const html = renderTip({ ...tip, allowCustom: false });
    expect(html).not.toContain('data-tip-other');
    expect(html).toContain('data-tip-none="true"');
    expect(html).toContain('col-span-2');
  });

  it('presets vacíos con «Otro» (organización con presets inválidos degradados hasta 0): en pantalla NO táctil resolveView cae al cobro; táctil o sin `touch` sigue en «Propina» (ronda 2, QA-7)', () => {
    // sanitizeDisplayTip deja pasar { presets: [], allowCustom: true }; la vista decide con `touch`.
    const payment = toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 20250 });
    const state = sanitizeDisplayState({ mode: 'tip', cart: displayCart, payment, tip: { presets: [], allowCustom: true, selected: null }, thanks: null });
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state })).toBe('payment_cash');
    expect(resolveView({ connected: true, updateRequired: false, touch: true, state })).toBe('tip');
    expect(resolveView({ connected: true, updateRequired: false, state })).toBe('tip');
    // Sin cobro en el state (no debería ocurrir: el emisor siempre lo manda con `tip`) cae a pedido.
    const noPayment = sanitizeDisplayState({ mode: 'tip', cart: displayCart, payment: null, tip: { presets: [], allowCustom: true, selected: null }, thanks: null });
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: noPayment })).toBe('order');
    // Con presets la pantalla no táctil sí pregunta (importes informativos).
    const withPresets = sanitizeDisplayState({ mode: 'tip', cart: displayCart, payment, tip: { presets: [10], allowCustom: false, selected: null }, thanks: null });
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: withPresets })).toBe('tip');
  });

  it('base 0: los tres porcentajes muestran $ 0 (no NaN ni texto vacío)', () => {
    const html = renderTip({ ...tip, base: 0 });
    expect(html).not.toContain('NaN');
    expect((html.match(/\$\s?0,00/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('sin `base` (emisor anterior) se calcula sobre cart.total; moneda de la organización (USD) en cada importe', () => {
    const html = renderToStaticMarkup(
      React.createElement(TipView, { cart: { ...displayCart, total: 100 }, tip: { presets: [10], allowCustom: false, selected: null }, currency: 'USD', brand: BRAND, touch: false }),
    );
    expect(html).toMatch(/US\$\s?10,00/);
  });

  it('un preset repetido o inválido en el bloque (state fabricado) no duplica ni rompe botones', () => {
    const html = renderTip({ presets: [10, 10, 0, 101] as number[], allowCustom: false, selected: null, base: 1000 });
    expect((html.match(/data-tip-percent=/g) ?? []).length).toBe(1);
  });
});
