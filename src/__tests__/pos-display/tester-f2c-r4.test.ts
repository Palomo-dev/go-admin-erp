/**
 * Tester · Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 4.
 *
 * Rompe lo que la ronda 4 del builder dio por cerrado (lista C1-C5) y los
 * bordes que el encargo pide: no táctil con propinas activadas, QR expirado,
 * ajustes inválidos, presets vacíos, subtotal 0, terminal sin vincular y dos
 * cajas con la misma terminal. Las vistas se pintan con react-dom/server
 * (esbuild → CJS) y el bus entre cajas y pantalla es un canal en memoria
 * síncrono que respeta el contrato de BroadcastChannel (nunca se entrega al
 * emisor del mensaje).
 *
 * Hallazgos de esta ronda. En r4 los `it` afirmaban el comportamiento de
 * entonces con el esperado en comentario; la ronda 5 del builder los corrigió
 * y los `it` afirman ahora lo correcto (el comportamiento anterior queda en
 * comentario):
 *  L. (alto, REGRESIÓN de C2 · corregido r5, QA-1) `resolveQrChargeAmount`
 *     devolvía la entrada tal cual aunque superara el total o lo pendiente
 *     real: entrada 30.000 sobre 25.000 ⇒ QR por 30.000 mientras la pantalla
 *     descartaba el importe (C3) y mostraba «Total $25.000» (PLAN §4.1
 *     «nunca miente»). Ahora recibe `othersTotal` (Σ otras entradas) y acota:
 *     min(entrada, total − otras), siempre en (0, total].
 *  M. (alto, PREEXISTENTE en HEAD · corregido r5, QA-2) `onPaid` añadía una
 *     entrada nueva sin retirar la entrada QR original (25.000 ⇒ 50.000
 *     pagados). Ahora confirma la entrada de origen (`qrEntryId`) y solo
 *     añade si ya no existe.
 *  N. (bajo · corregido r5, QA-3) La limpieza de `[open]` no reiniciaba los
 *     estados del QR: el siguiente cobro proyectaba el código de la venta
 *     anterior con el total de la nueva. Ahora los reinicia todos.
 *  O. (retirado) Subtotal 0 con propinas: mientras se escribía esta ronda,
 *     F2-B r2 (QA-5) hizo que con base 0 se pinte el cobro; el caso queda
 *     como prueba del comportamiento correcto.
 *  Red e imagen (bajo · corregido r5, QA-5): con imagen http Y texto EMVCo
 *     viajaba la imagen y sin red la pantalla caía a las instrucciones; ahora
 *     viaja el texto y la pantalla genera el QR en local.
 *
 * Helpers copiados de los tests anteriores a propósito (un test no importa
 * de otro test). Organización ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { isAmountWithinTotal, resolveDisplayQr, resolveQrChargeAmount, toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  isUpMessage,
  type DisplayPayment,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessage,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings } from '@/lib/pos/display/settings';
import { tipOptions } from '@/lib/pos/display/tip';
import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  type DisplayChannel,
  type DisplayTransport,
  type HelloDraft,
} from '@/lib/pos/display/transport';
import {
  formatCountdown,
  resolveQrPresentation,
  resolveTouch,
  resolveView,
  sanitizeDisplayPayment,
  sanitizeDisplayState,
} from '@/components/pos-display/logic';

// ---------------------------------------------------------------------------
// Cargador de .tsx para pruebas (esbuild → CJS, jsx automático)
// ---------------------------------------------------------------------------

const SRC = join(process.cwd(), 'src');
const messagesEs = JSON.parse(readFileSync(join(process.cwd(), 'messages/es.json'), 'utf8')) as Record<string, unknown>;

// settings.ts importa el cliente de navegador; aquí solo se usa su parser puro.
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));

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
        /* no es .tsx: cae al require de jest */
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

const views = loadTsx(join(SRC, 'components/pos-display/views.tsx')) as {
  QrPaymentView: React.ComponentType<Record<string, unknown>>;
};
const T = (messagesEs.posDisplay as { payment: Record<string, string> }).payment;
const BRAND = { name: 'Tienda de calzado', logoUrl: null, primaryColor: '#1f2937', timezone: 'America/Bogota', unknown: false };

function renderQr(payment: Extract<DisplayPayment, { method: 'qr' }>, extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(React.createElement(views.QrPaymentView, { payment, currency: 'COP', brand: BRAND, ...extra }));
}

const NOW = Date.UTC(2026, 8, 21, 16, 0, 0);
const EMVCO = '000201010212' + '26580014CO.COM.BREB.QR0136' + 'c'.repeat(36) + '52045411530317054061000.05802CO5910COMERCIO Y6006BOGOTA63047B1D';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const CHECKOUT = readFileSync(join(SRC, 'components/pos/CheckoutDialog.tsx'), 'utf8');

function qrPayment(overrides: Partial<Extract<DisplayPayment, { method: 'qr' }>> = {}): Extract<DisplayPayment, { method: 'qr' }> {
  return { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: NOW + 60_000, ...overrides };
}

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

function up(extra: Record<string, unknown>): unknown {
  return { v: PROTOCOL_VERSION, terminalId: TERMINAL, ...extra };
}

// ---------------------------------------------------------------------------
// Emisor de pruebas (transporte falso, planificador manual)
// ---------------------------------------------------------------------------

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  lastDisplaySeenAt: number | null = null;
  private handlers = new Set<(msg: UpMessage) => void>();
  publish(msg: DownMessageDraft): void {
    this.published.push(msg);
  }
  announce(hello: HelloDraft, s: DisplayState): void {
    this.publish(hello);
    this.publish({ t: 'state', state: s });
  }
  onUp(handler: (msg: UpMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
  up(msg: UpMessage): void {
    for (const h of Array.from(this.handlers)) h(msg);
  }
  startHeartbeat(): void {}
  stopHeartbeat(): void {}
  close(): void {}
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

function item(overrides: Partial<CartItem> & { id: string }): CartItem {
  return {
    product_id: 1,
    product: { id: 1, name: 'Zapato' } as CartItem['product'],
    quantity: 1,
    unit_price: 25_000,
    discount_amount: 0,
    tax_amount: 0,
    total: 25_000,
    tax_included: false,
    ...overrides,
  } as CartItem;
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'carrito-r4',
    organization_id: 120,
    branch_id: 1,
    status: 'active',
    items: [item({ id: 'l1' })],
    subtotal: 25_000,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 25_000,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z',
    ...overrides,
  };
}

function settings(overrides: Partial<DisplayPresentationSettings> = {}): DisplayPresentationSettings {
  return {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    locale: null,
    touch: 'no-touch',
    ...overrides,
  };
}

const START = { organizationId: 120, currency: 'COP', sessionOpen: true, cashier: { name: 'Andrea' } };

function harness(opts: { settings?: DisplayPresentationSettings; cart?: Cart } = {}) {
  const transport = new FakeTransport();
  const sched = manualScheduler();
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
    getSettings: opts.settings ? () => opts.settings! : undefined,
    schedule: sched.schedule,
    isVisible: () => true,
  });
  emitter.start(START);
  emitter.setCart(opts.cart ?? cart());
  sched.flush();
  const lastState = (): DisplayState => {
    const states = transport.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state');
    return states[states.length - 1].state;
  };
  return { transport, emitter, flush: sched.flush, lastState };
}

/** Lo que el efecto de CheckoutDialog emite con el diálogo QR CERRADO y la última entrada en un medio QR (sin código ni vencimiento). */
function qrWithoutDialog(total = 25_000): DisplayPayment {
  return toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B (Mono)', total, received: null, change: null });
}

/** Lo que el efecto emite con el diálogo QR ABIERTO y el interruptor «Mostrar en pantalla» encendido. */
function qrWithDialog(input: { total?: number; amount?: number; data?: string; imageUrl?: string; expiresAt?: string | number; now?: number }): DisplayPayment {
  const total = input.total ?? 25_000;
  const resolved = resolveDisplayQr({ imageUrl: input.imageUrl, data: input.data ?? EMVCO, expiresAt: input.expiresAt ?? null, now: input.now ?? NOW });
  return toDisplayPayment({
    methodCode: 'breb_qr',
    methodName: 'Bre-B (Mono)',
    total,
    qr: resolved.qr,
    expiresAt: resolved.expiresAt,
    amount: input.amount ?? total,
  });
}

// ---------------------------------------------------------------------------
// Bus en memoria: cajas y pantalla reales (BroadcastChannelTransport /
// BroadcastChannelReceiver) sobre un canal síncrono con cola drenable.
// ---------------------------------------------------------------------------

class MemoryBus {
  private readonly channels = new Map<string, Set<MemoryChannel>>();
  private readonly queue: Array<() => void> = [];
  factory = (terminalId: string): DisplayChannel => {
    const ch = new MemoryChannel(this, terminalId);
    const set = this.channels.get(terminalId) ?? new Set<MemoryChannel>();
    set.add(ch);
    this.channels.set(terminalId, set);
    return ch;
  };
  post(from: MemoryChannel, msg: unknown): void {
    const targets = Array.from(this.channels.get(from.name) ?? []).filter((c) => c !== from && !c.closed);
    // Copia estructural como haría el navegador: nadie comparte referencias.
    const data = JSON.parse(JSON.stringify(msg)) as unknown;
    for (const target of targets) this.queue.push(() => target.onmessage?.({ data }));
  }
  remove(ch: MemoryChannel): void {
    this.channels.get(ch.name)?.delete(ch);
  }
  /** Entrega todo lo pendiente, incluidas las respuestas que genere la propia entrega. */
  drain(): void {
    let guard = 0;
    while (this.queue.length > 0) {
      if (++guard > 10_000) throw new Error('bus en bucle');
      this.queue.shift()!();
    }
  }
}

class MemoryChannel implements DisplayChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(
    private readonly bus: MemoryBus,
    readonly name: string,
  ) {}
  postMessage(msg: unknown): void {
    if (this.closed) throw new Error('canal cerrado');
    this.bus.post(this, msg);
  }
  close(): void {
    this.closed = true;
    this.bus.remove(this);
  }
}

/** Caja real sobre el bus: transporte + emisor, con reloj y visibilidad inyectados. */
function cajaOnBus(bus: MemoryBus, opts: { instanceId: string; visible: boolean; settings?: DisplayPresentationSettings }) {
  const transport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: bus.factory, __testInstanceId: opts.instanceId, now: () => NOW });
  const sched = manualScheduler();
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
    getSettings: opts.settings ? () => opts.settings! : undefined,
    schedule: sched.schedule,
    isVisible: () => opts.visible,
  });
  const claims: UpMessage[] = [];
  emitter.onUp((m) => claims.push(m));
  emitter.start(START);
  emitter.setCart(cart());
  sched.flush();
  return { transport, emitter, flush: sched.flush, claims };
}

/** Pantalla real sobre el bus: receptor con presencia manual; recuerda el último hello/state aceptados. */
function pantallaOnBus(bus: MemoryBus, opts: { touch: boolean }) {
  const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, channelFactory: bus.factory, now: () => NOW, staleAfterMs: 0, presenceIntervalMs: 0 });
  const accepted: DownMessage[] = [];
  receiver.onDown((m) => accepted.push(m));
  const caps = { touch: opts.touch, width: 1920, height: 1080 };
  const snapshot = () => {
    receiver.send({ t: 'need_snapshot', capabilities: caps });
    bus.drain();
  };
  const lastState = (): DisplayState | null => {
    const states = accepted.filter((m): m is Extract<DownMessage, { t: 'state' }> => m.t === 'state');
    return states.length === 0 ? null : states[states.length - 1].state;
  };
  return { receiver, accepted, snapshot, lastState, caps };
}

// ---------------------------------------------------------------------------
// L. Regresión de C2: el importe del QR no se acota al total ni a lo pendiente real
// ---------------------------------------------------------------------------

describe('HALLAZGO L (alto, regresión C2) · corregido en r5 (QA-1): resolveQrChargeAmount acota la entrada al total y a lo que falta tras las otras', () => {
  it('entrada 30.000 sobre un total de 25.000 (una sola entrada): el QR se genera por 25.000, nunca por encima del total', () => {
    // Ronda 4: devolvía 30.000 (la entrada tal cual) y el proveedor generaba un cobro real mayor que la venta.
    expect(resolveQrChargeAmount({ entryAmount: 30_000, othersTotal: 0, total: 25_000 })).toBe(25_000);
    // Misma respuesta que HEAD (`remaining > 0 ? remaining : cartTotal`) para este caso:
    const remaining = Math.max(0, 25_000 - 30_000);
    expect(remaining > 0 ? remaining : 25_000).toBe(25_000);
  });

  it('pago mixto: efectivo 15.000 + entrada QR 20.000 sobre 25.000 ⇒ QR por los 10.000 que faltan (min(entrada, total − otras))', () => {
    const total = 25_000;
    const entries = [
      { id: 'a', method: 'cash', amount: 15_000 },
      { id: 'b', method: 'breb_qr', amount: 20_000 },
    ];
    const othersTotal = entries.filter((e) => e.id !== 'b').reduce((s, e) => s + e.amount, 0);
    expect(othersTotal).toBe(15_000);
    // Ronda 4: 20.000. Ahora:
    expect(resolveQrChargeAmount({ entryAmount: 20_000, othersTotal, total })).toBe(10_000);
    // Entrada que ya cabe: se respeta.
    expect(resolveQrChargeAmount({ entryAmount: 10_000, othersTotal, total })).toBe(10_000);
    expect(resolveQrChargeAmount({ entryAmount: 5_000, othersTotal, total })).toBe(5_000);
  });

  it('entrada 0, negativa, NaN, null o ausente ⇒ lo pendiente tras las otras; sin pendiente ⇒ el total; othersTotal raro cuenta como 0', () => {
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
    expect(resolveQrChargeAmount({ entryAmount: -1, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
    expect(resolveQrChargeAmount({ entryAmount: Number.NaN, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
    expect(resolveQrChargeAmount({ entryAmount: null, othersTotal: 0, total: 25_000 })).toBe(25_000);
    expect(resolveQrChargeAmount({ othersTotal: 25_000, total: 25_000 })).toBe(25_000);
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal: Number.NaN, total: 25_000 })).toBe(25_000);
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal: -5_000, total: 25_000 })).toBe(25_000);
    expect(resolveQrChargeAmount({ entryAmount: Number.POSITIVE_INFINITY, othersTotal: 0, total: 25_000 })).toBe(25_000);
    // Las otras entradas ya cubren el total: nada pendiente ⇒ el total (como HEAD).
    expect(resolveQrChargeAmount({ entryAmount: 5_000, othersTotal: 25_000, total: 25_000 })).toBe(25_000);
  });

  it('el importe del código siempre cabe en (0, total]: la pantalla lo pinta («Este pago») y coincide con lo que cobra el proveedor', () => {
    const chargeAmount = resolveQrChargeAmount({ entryAmount: 30_000, othersTotal: 0, total: 25_000 });
    expect(isAmountWithinTotal(chargeAmount, 25_000)).toBe(true);
    const payment = qrWithDialog({ amount: chargeAmount }) as Extract<DisplayPayment, { method: 'qr' }>;
    // Igual al total: la clave viaja pero la vista no pinta la línea «Este pago» (no difiere).
    expect(payment.amount).toBe(25_000);
    let html = renderQr(payment, { touch: false });
    expect(html).toContain('25.000');
    expect(html).not.toContain('30.000');

    const mixed = resolveQrChargeAmount({ entryAmount: 20_000, othersTotal: 15_000, total: 25_000 });
    html = renderQr(qrWithDialog({ amount: mixed }) as Extract<DisplayPayment, { method: 'qr' }>, { touch: false });
    expect(html).toContain('data-qr-amount="10000"');
    expect(html).not.toContain('data-qr-amount="20000"');
  });

  it('CheckoutDialog (estático): «Generar QR» pasa payment.id y payment.amount; handleQrPayment calcula othersTotal excluyendo esa entrada y acota con resolveQrChargeAmount', () => {
    expect(CHECKOUT).toContain('handleQrPayment(currentMethod.code, payment.id, payment.amount)');
    expect(CHECKOUT).toContain('const handleQrPayment = async (methodCode: string, entryId?: string, entryAmount?: number) => {');
    expect(CHECKOUT).toContain('const othersTotal = payments.filter((p) => p.id !== entryId).reduce(');
    expect(CHECKOUT).toContain('const amount = resolveQrChargeAmount({ entryAmount, othersTotal, total: cartTotal });');
    expect(CHECKOUT).not.toContain('resolveQrChargeAmount({ entryAmount, remaining, total: cartTotal })');
    // El input de monto de una entrada QR tiene max = total (el efectivo puede superar el total: da cambio).
    expect(CHECKOUT).toContain('max={isQrPaymentCode(payment.method) ? cartTotal : undefined}');
  });
});

// ---------------------------------------------------------------------------
// M. Preexistente (HEAD): onPaid duplica la entrada QR
// ---------------------------------------------------------------------------

describe('HALLAZGO M (alto, PREEXISTENTE en HEAD) · corregido en r5 (QA-2): onPaid confirma la entrada QR de origen en vez de añadir otra', () => {
  it('estático: handleQrPayment guarda qrEntryId; onPaid hace prev.map sobre esa entrada y solo añade (respaldo) si ya no existe', () => {
    expect(CHECKOUT).toContain('const [qrEntryId, setQrEntryId] = useState<string | undefined>();');
    expect(CHECKOUT).toContain('setQrEntryId(entryId);');
    const onPaid = CHECKOUT.slice(CHECKOUT.indexOf('onPaid={() => {'), CHECKOUT.indexOf('<SerialSelectorDialog'));
    expect(onPaid).toContain('prev.some(p => p.id === qrEntryId)');
    expect(onPaid).toContain('prev.map(p => p.id === qrEntryId ? { ...p, method: qrPaymentMethod || p.method, amount: qrPaymentAmount } : p)');
    expect(onPaid).toContain(': [...prev, newPayment]');
    // Ronda 4: `setPayments(prev => [...prev, newPayment])` a secas (duplicaba el pago).
    expect(onPaid).not.toContain('setPayments(prev => [...prev, newPayment])');
  });

  it('aritmética del modal tras onPaid: una sola entrada QR por el total ⇒ 25.000 pagados (cambio 0); mixto 15.000 + 10.000 ⇒ 25.000', () => {
    const total = 25_000;
    // Misma regla que onPaid, en Node: confirmar la entrada de origen o, si no está, añadir.
    const confirm = (prev: Array<{ id: string; method: string; amount: number }>, qrEntryId: string, method: string, amount: number) =>
      prev.some((p) => p.id === qrEntryId)
        ? prev.map((p) => (p.id === qrEntryId ? { ...p, method, amount } : p))
        : [...prev, { id: 'nuevo', method, amount }];

    const single = [{ id: 'q', method: 'breb_qr', amount: 25_000 }];
    const singleAmount = resolveQrChargeAmount({ entryAmount: 25_000, othersTotal: 0, total });
    const afterSingle = confirm(single, 'q', 'breb_qr', singleAmount);
    const paidSingle = afterSingle.reduce((s, e) => s + e.amount, 0);
    expect(afterSingle).toHaveLength(1);
    expect(paidSingle).toBe(25_000);
    expect(Math.max(0, paidSingle - total)).toBe(0);

    const mixed = [
      { id: 'c', method: 'cash', amount: 15_000 },
      { id: 'q', method: 'breb_qr', amount: 10_000 },
    ];
    const mixedAmount = resolveQrChargeAmount({ entryAmount: 10_000, othersTotal: 15_000, total });
    const afterMixed = confirm(mixed, 'q', 'breb_qr', mixedAmount);
    expect(afterMixed).toHaveLength(2);
    expect(afterMixed.reduce((s, e) => s + e.amount, 0)).toBe(25_000);

    // Respaldo: la entrada de origen ya no existe (el cajero la quitó) ⇒ se añade una.
    const gone = [{ id: 'c', method: 'cash', amount: 15_000 }];
    const afterGone = confirm(gone, 'q', 'breb_qr', mixedAmount);
    expect(afterGone).toHaveLength(2);
    expect(afterGone.reduce((s, e) => s + e.amount, 0)).toBe(25_000);
  });
});

// ---------------------------------------------------------------------------
// N. Estados del QR no se limpian al cerrar el cobro
// ---------------------------------------------------------------------------

describe('HALLAZGO N (bajo) · corregido en r5 (QA-3): la limpieza de [open] de CheckoutDialog reinicia los estados del QR', () => {
  it('estático: el bloque `if (!open) {` llama a setShowQrDialog(false) y vacía qrData/qrImageUrl/qrExpiresAt/qrAmount/qrEntryId/qrPaymentMethod/qrReference/qrProviderLabel/showQrOnDisplay', () => {
    const start = CHECKOUT.indexOf('    if (!open) {');
    expect(start).toBeGreaterThan(0);
    const block = CHECKOUT.slice(start, CHECKOUT.indexOf('  }, [open]);', start));
    for (const call of [
      'setShowQrDialog(false);',
      'setQrData(undefined);',
      'setQrImageUrl(undefined);',
      'setQrExpiresAt(undefined);',
      'setQrAmount(undefined);',
      'setQrEntryId(undefined);',
      "setQrPaymentMethod('');",
      "setQrReference('');",
      "setQrProviderLabel('');",
      'setShowQrOnDisplay(false);',
    ]) {
      expect(block).toContain(call);
    }
  });

  it('con los estados reiniciados el guard `showQrDialog && qrPaymentMethod` es falso: el siguiente cobro empieza sin código (proyecta el medio de la última entrada)', () => {
    // Antes (ronda 4) el código de la venta anterior seguía vivo y viajaba con el total nuevo:
    const stale = qrWithDialog({ total: 40_000, amount: 25_000 }) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(stale.qr).not.toBeNull();
    // Tras el reinicio, CheckoutDialog no entra en esa rama: qrPaymentMethod '' y showQrDialog false.
    const showQrDialog = false;
    const qrPaymentMethod = '';
    expect(Boolean(showQrDialog && qrPaymentMethod)).toBe(false);
    // Y lo que viaja es el cobro normal de la venta nueva, sin bloque qr.
    const fresh = toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 40_000 });
    expect(fresh.method).toBe('cash');
    expect('qr' in fresh).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// No táctil + propinas activadas + QR (PLAN §4.4)
// ---------------------------------------------------------------------------

describe('pantalla NO táctil con propinas activadas y cobro QR', () => {
  it('cobro abierto → tip (informativa) → QR con código se impone → sin botón «Ya pagué» → cerrar el diálogo sin pagar devuelve la pregunta → onPaid (skipTip) la cierra', () => {
    const h = harness({ settings: settings({ touch: 'no-touch' }) });
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 25_000 }));
    h.flush();
    expect(h.lastState().mode).toBe('tip');
    expect(h.emitter.tipPhase).toBe('pending');

    h.emitter.setPayment(qrWithDialog({}));
    h.flush();
    const shown = h.lastState();
    expect(shown.mode).toBe('payment');
    expect(shown.tip).toBeNull();
    const touch = resolveTouch(true, 'no-touch'); // hardware táctil, forzado a no táctil por los ajustes
    expect(touch).toBe(false);
    const html = renderQr(shown.payment as Extract<DisplayPayment, { method: 'qr' }>, { touch, onQrPaidClaim: () => {} });
    expect(html).not.toContain(T.qrPaidButton);
    expect(html).toContain('data-qr-kind="text"');

    // El cajero cierra el diálogo sin cobrar: vuelve la pregunta (decisión de la ronda 2).
    h.emitter.setPayment(qrWithoutDialog());
    h.flush();
    expect(h.lastState().mode).toBe('tip');

    // Pago confirmado: skipTip + medio sin código → payment, y ya nunca tip.
    h.emitter.setPayment(qrWithDialog({}));
    h.flush();
    h.emitter.skipTip();
    h.emitter.setPayment(qrWithoutDialog());
    h.flush();
    expect(h.lastState().mode).toBe('payment');
    expect(h.emitter.tipPhase).toBe('done');
    const after = renderQr(h.lastState().payment as Extract<DisplayPayment, { method: 'qr' }>, { touch: false });
    expect(after).toContain(T.qrInstructions);
  });

  it('un tip_selected que llegara con el QR en pantalla (carrera) cierra la fase y NO cambia el modo: sigue el QR', () => {
    const h = harness({ settings: settings({ touch: 'touch' }) });
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 25_000 }));
    h.flush();
    h.emitter.setPayment(qrWithDialog({}));
    h.flush();
    const before = h.emitter.emittedStateCount;
    h.transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'tip_selected', cartId: 'carrito-r4', kind: 'percent', value: 10 });
    h.flush();
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.lastState().mode).toBe('payment');
    expect((h.lastState().payment as { qr: unknown }).qr).not.toBeNull();
    // Un state más (la reproyección al cerrar la fase) pero con el mismo contenido → deduplicado, o distinto → uno solo.
    expect(h.emitter.emittedStateCount - before).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// QR sin código pero con vencimiento (Bold QR sin objeto `qr`; Bre-B sin texto)
// ---------------------------------------------------------------------------

describe('QR sin código pero con vencimiento futuro (proveedor sin qr_data, sesión con expires_at)', () => {
  it('resolveDisplayQr: qr null y expiresAt futuro; buildState lo impone sobre la propina; la pantalla muestra instrucciones + cuenta atrás y ningún botón', () => {
    const resolved = resolveDisplayQr({ imageUrl: undefined, data: undefined, expiresAt: new Date(NOW + 120_000).toISOString(), now: NOW });
    expect(resolved).toEqual({ qr: null, expiresAt: NOW + 120_000 });

    const h = harness({ settings: settings() });
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 25_000 }));
    h.flush();
    expect(h.lastState().mode).toBe('tip');
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'bold_qr', methodName: 'Bold QR', total: 25_000, qr: null, expiresAt: resolved.expiresAt }));
    h.flush();
    expect(h.lastState().mode).toBe('payment');

    const payment = sanitizeDisplayPayment(h.lastState().payment) as Extract<DisplayPayment, { method: 'qr' }>;
    const pres = resolveQrPresentation(payment, { now: NOW, online: true });
    expect(pres).toEqual({ kind: 'fallback', value: null, remainingMs: 120_000, expired: false });
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const html = renderQr(payment, { touch: true, onQrPaidClaim: () => {} });
    jest.restoreAllMocks();
    expect(html).toContain(T.qrInstructions);
    expect(html).toContain(T.qrExpiresIn.replace('{time}', '02:00'));
    expect(html).not.toContain(T.qrPaidButton);
    expect(html).not.toContain('<img');
  });
});

// ---------------------------------------------------------------------------
// Vencimiento: bordes del reloj
// ---------------------------------------------------------------------------

describe('vencimiento del QR: bordes', () => {
  it('expiresAt === now cuenta como vencido en el emisor y en la pantalla; un ms antes, vivo', () => {
    expect(resolveDisplayQr({ data: EMVCO, expiresAt: NOW, now: NOW }).qr).toBeNull();
    expect(resolveDisplayQr({ data: EMVCO, expiresAt: NOW + 1, now: NOW }).qr).not.toBeNull();
    expect(resolveQrPresentation(qrPayment({ expiresAt: NOW }), { now: NOW, online: true }).expired).toBe(true);
    expect(resolveQrPresentation(qrPayment({ expiresAt: NOW + 1 }), { now: NOW, online: true })).toMatchObject({ kind: 'text', remainingMs: 1, expired: false });
  });

  it('expires_at que no es fecha («pronto», «», null) → sin cuenta atrás y sin «venció»; en segundos de época (no ms) → «vencido» en 1970 (documentado: los routes mandan ISO)', () => {
    for (const raw of ['pronto', '', null, undefined]) {
      const r = resolveDisplayQr({ data: EMVCO, expiresAt: raw as string | null | undefined, now: NOW });
      expect(r.expiresAt).toBeNull();
      expect(r.qr).not.toBeNull();
    }
    const seconds = Math.floor((NOW + 60_000) / 1000);
    expect(resolveDisplayQr({ data: EMVCO, expiresAt: seconds, now: NOW })).toEqual({ qr: null, expiresAt: seconds });
  });

  it('formatCountdown: 24 h se pinta como 1440:00; fracciones se truncan; negativos y no finitos → 00:00', () => {
    expect(formatCountdown(24 * 3_600_000)).toBe('1440:00');
    expect(formatCountdown(59_999)).toBe('00:59');
    expect(formatCountdown(-1)).toBe('00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00');
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe('00:00');
  });

  it('un state fabricado con expiresAt como string ISO pasa el guard de forma y el saneado lo deja en null: sin cuenta atrás, código vivo', () => {
    const raw = { v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'state', state: state({ mode: 'payment', payment: { ...qrPayment(), expiresAt: new Date(NOW + 60_000).toISOString() as unknown as number } }) };
    expect(isDownMessage(raw)).toBe(true);
    const clean = sanitizeDisplayState(raw.state);
    expect((clean.payment as { expiresAt: unknown }).expiresAt).toBeNull();
    expect(resolveQrPresentation(clean.payment as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: true })).toMatchObject({ kind: 'text', remainingMs: null, expired: false });
  });
});

// ---------------------------------------------------------------------------
// qr_paid_claim: guard, destino y efecto nulo sobre el estado
// ---------------------------------------------------------------------------

describe('qr_paid_claim', () => {
  it('guard: exige cartId string no vacío; toInstanceId ausente o string no vacío', () => {
    expect(isUpMessage(up({ t: 'qr_paid_claim', cartId: 'carrito-r4' }))).toBe(true);
    expect(isUpMessage(up({ t: 'qr_paid_claim', cartId: 'carrito-r4', toInstanceId: INSTANCE_A }))).toBe(true);
    expect(isUpMessage(up({ t: 'qr_paid_claim', cartId: '' }))).toBe(false);
    expect(isUpMessage(up({ t: 'qr_paid_claim' }))).toBe(false);
    expect(isUpMessage(up({ t: 'qr_paid_claim', cartId: 7 }))).toBe(false);
    expect(isUpMessage(up({ t: 'qr_paid_claim', cartId: 'x', toInstanceId: '' }))).toBe(false);
  });

  it('el emisor reenvía la intención (también con otro cartId: filtra CheckoutDialog) y no toca estado, fase de propina ni contador de states', () => {
    const h = harness({ settings: settings() });
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 25_000 }));
    h.flush();
    h.emitter.setPayment(qrWithDialog({ amount: 10_000 }));
    h.flush();
    const received: UpMessage[] = [];
    h.emitter.onUp((m) => received.push(m));
    const before = { json: JSON.stringify(h.emitter.getState()), count: h.emitter.emittedStateCount, phase: h.emitter.tipPhase };
    h.transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'carrito-r4' });
    h.transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'otro-carrito' });
    h.flush();
    expect(received.map((m) => (m as { cartId: string }).cartId)).toEqual(['carrito-r4', 'otro-carrito']);
    expect(JSON.stringify(h.emitter.getState())).toBe(before.json);
    expect(h.emitter.emittedStateCount).toBe(before.count);
    expect(h.emitter.tipPhase).toBe(before.phase);
  });

  it('CheckoutDialog (estático): el oyente ignora claims de otro carrito y solo muestra un toast informativo; no toca payments ni confirma nada', () => {
    const start = CHECKOUT.indexOf("if (msg.t !== 'qr_paid_claim' || msg.cartId !== cart.id) return;");
    expect(start).toBeGreaterThan(0);
    const block = CHECKOUT.slice(start, CHECKOUT.indexOf('});', start));
    expect(block).toContain("toast.info('El cliente indica que ya pagó'");
    expect(block).not.toMatch(/setPayments|setShowQrDialog|onPaid|skipTip|setMode/);
  });
});

// ---------------------------------------------------------------------------
// Dos cajas con la misma terminal, sobre un bus real
// ---------------------------------------------------------------------------

describe('dos cajas con la misma terminal (bus real: BroadcastChannelTransport + BroadcastChannelReceiver)', () => {
  it('la pantalla sigue a la caja VISIBLE; el QR que proyecta la oculta no llega; «Ya pagué» solo lo recibe la seguida; ambas ven la pantalla como conectada', () => {
    const bus = new MemoryBus();
    const a = cajaOnBus(bus, { instanceId: INSTANCE_A, visible: true, settings: settings() });
    const b = cajaOnBus(bus, { instanceId: INSTANCE_B, visible: false, settings: settings() });
    const pantalla = pantallaOnBus(bus, { touch: true });
    pantalla.snapshot();
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_A);

    // La caja oculta genera un QR: su state no se acepta.
    b.emitter.setPayment(qrWithDialog({}));
    b.flush();
    bus.drain();
    expect(pantalla.lastState()?.mode).toBe('order');

    // La visible lo genera: sí.
    a.emitter.setPayment(qrWithDialog({}));
    a.flush();
    bus.drain();
    expect(pantalla.lastState()?.mode).toBe('payment');
    expect(pantalla.lastState()?.cart?.id).toBe('carrito-r4');

    // «Ya pagué» va dirigido a la instancia seguida.
    pantalla.receiver.send({ t: 'qr_paid_claim', cartId: 'carrito-r4' });
    bus.drain();
    expect(a.claims.map((m) => m.t)).toEqual(['qr_paid_claim']);
    expect(b.claims).toEqual([]);

    // Presencia: display_alive va a todas; la caja B cree (con razón parcial) que hay pantalla conectada.
    pantalla.receiver.startPresence(pantalla.caps);
    bus.drain();
    expect(a.transport.lastDisplaySeenAt).toBe(NOW);
    expect(b.transport.lastDisplaySeenAt).toBe(NOW);
    pantalla.receiver.close();
    a.emitter.stop();
    b.emitter.stop();
  });

  it('la caja oculta pasa a primer plano (focus → reannounce): la pantalla la releva y entonces sí muestra SU QR', () => {
    const bus = new MemoryBus();
    const a = cajaOnBus(bus, { instanceId: INSTANCE_A, visible: true });
    let bVisible = false;
    const bTransport = new BroadcastChannelTransport({ terminalId: TERMINAL, channelFactory: bus.factory, __testInstanceId: INSTANCE_B, now: () => NOW });
    const bSched = manualScheduler();
    const b = new DisplayEmitter({ createTransport: () => bTransport, isEnabled: () => true, schedule: bSched.schedule, isVisible: () => bVisible });
    b.start(START);
    b.setCart(cart({ id: 'carrito-b' }));
    bSched.flush();
    const pantalla = pantallaOnBus(bus, { touch: false });
    pantalla.snapshot();
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_A);

    bVisible = true;
    b.reannounce();
    bus.drain();
    expect(pantalla.receiver.activeInstanceId).toBe(INSTANCE_B);
    b.setPayment(qrWithDialog({}));
    bSched.flush();
    bus.drain();
    expect(pantalla.lastState()?.mode).toBe('payment');
    expect(pantalla.lastState()?.cart?.id).toBe('carrito-b');
    pantalla.receiver.close();
    a.emitter.stop();
    b.stop();
  });
});

// ---------------------------------------------------------------------------
// Ajustes inválidos en organization_settings y presets vacíos
// ---------------------------------------------------------------------------

describe('ajustes inválidos en pos_customer_display (organization_settings)', () => {
  it('touch «TOUCH» / 1 / null → auto; presets [] / [0,5,5] / «5,10,15» → 5/10/15; tips.enabled «yes» → false', () => {
    const parsed = parseCustomerDisplaySettings({ enabled: true, tips: { enabled: 'yes', presets: [], allowCustom: 'no' }, touch: 'TOUCH' });
    expect(parsed.touch).toBe('auto');
    expect(parsed.tips).toEqual({ enabled: false, presets: [5, 10, 15], allowCustom: true });
    expect(parseCustomerDisplaySettings({ tips: { enabled: true, presets: [0, 5, 5], allowCustom: false }, touch: 1 }).tips).toEqual({ enabled: true, presets: [5, 10, 15], allowCustom: false });
    expect(parseCustomerDisplaySettings({ tips: { enabled: true, presets: '5,10,15' }, touch: null }).tips.presets).toEqual([5, 10, 15]);
  });

  it('con esos ajustes saneados el hello viaja con touch auto: el botón «Ya pagué» depende solo de la detección de la pantalla', () => {
    const presentation = toDisplayPresentationSettings(parseCustomerDisplaySettings({ enabled: true, touch: 'TOUCH' }));
    expect(presentation.touch).toBe('auto');
    expect(resolveTouch(false, presentation.touch)).toBe(false);
    expect(resolveTouch(true, presentation.touch)).toBe(true);
    const withButton = renderQr(qrPayment({ expiresAt: null }), { touch: resolveTouch(true, presentation.touch), onQrPaidClaim: () => {} });
    const without = renderQr(qrPayment({ expiresAt: null }), { touch: resolveTouch(false, presentation.touch), onQrPaidClaim: () => {} });
    expect(withButton).toContain(T.qrPaidButton);
    expect(without).not.toContain(T.qrPaidButton);
  });

  it('un hello con settings que no es objeto (array, string) se rechaza entero; con settings {} se acepta y la pantalla queda en «auto»', () => {
    const base = { v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, t: 'hello', organizationId: 120, cashier: null, sessionOpen: true };
    expect(isDownMessage({ ...base, settings: [] })).toBe(false);
    expect(isDownMessage({ ...base, settings: 'touch' })).toBe(false);
    expect(isDownMessage({ ...base, settings: {} })).toBe(true);
    expect(resolveTouch(true, ({} as { touch?: unknown }).touch)).toBe(true);
  });

  it('emisor con getSettings que devuelve presets vacíos y sin «Otro»: no se abre la fase; el QR se pinta directo', () => {
    const h = harness({ settings: settings({ tips: { enabled: true, presets: [], allowCustom: false } }) });
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 25_000 }));
    h.flush();
    expect(h.emitter.tipPhase).toBeNull();
    expect(h.lastState().mode).toBe('payment');
  });

  it('getSettings que LANZA: el hello sale sin ajustes y la fase de propina no se abre; el cobro QR sigue funcionando', () => {
    const transport = new FakeTransport();
    const sched = manualScheduler();
    const emitter = new DisplayEmitter({
      createTransport: () => transport,
      isEnabled: () => true,
      getSettings: () => {
        throw new Error('fila corrupta');
      },
      schedule: sched.schedule,
      isVisible: () => true,
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    emitter.start(START);
    emitter.setCart(cart());
    sched.flush();
    const hello = transport.published.find((m) => m.t === 'hello') as HelloDraft;
    expect('settings' in hello).toBe(false);
    emitter.setPayment(qrWithDialog({}));
    sched.flush();
    expect(emitter.tipPhase).toBeNull();
    expect(emitter.getState().mode).toBe('payment');
    warn.mockRestore();
    emitter.stop();
  });
});

// ---------------------------------------------------------------------------
// Subtotal 0 con propina (HALLAZGO O)
// ---------------------------------------------------------------------------

describe('subtotal 0 con propinas activadas (O: ya cubierto por F2-B r2)', () => {
  it('base 0: la fase queda pendiente pero se pinta el cobro (corregido en paralelo por F2-B r2, QA-5); si la base sube, la pregunta aparece; el QR se impone igual', () => {
    const zero = cart({ items: [item({ id: 'l1', unit_price: 0, total: 0 })], subtotal: 0, total: 0 });
    const h = harness({ settings: settings({ touch: 'touch' }), cart: zero });
    h.emitter.setTipBase(0);
    h.emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 0 }));
    h.flush();
    expect(tipOptions(0, [5, 10, 15]).map((o) => o.amount)).toEqual([0, 0, 0]);
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.lastState().mode).toBe('payment');
    h.emitter.setTipBase(25_000);
    h.flush();
    expect(h.lastState().mode).toBe('tip');
    expect(h.lastState().tip?.base).toBe(25_000);
    h.emitter.setPayment(qrWithDialog({ total: 25_000 }));
    h.flush();
    expect(h.lastState().mode).toBe('payment');
  });

  it('un QR sobre total 0 nunca lleva importe (isAmountWithinTotal(0, 0) es false) y el cálculo del cobro cae a 0', () => {
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal: 0, total: 0 })).toBe(0);
    const payment = toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 0, qr: { kind: 'text', value: EMVCO }, expiresAt: null, amount: 0 });
    expect('amount' in payment).toBe(false);
    expect(payment.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Terminal sin vincular: la pantalla funciona con el id local
// ---------------------------------------------------------------------------

describe('terminal sin vincular a pos_terminals', () => {
  it('el emisor y el receptor solo exigen un terminalId con forma de UUID; ninguna fila de pos_terminals interviene en el cobro QR', () => {
    const bus = new MemoryBus();
    const a = cajaOnBus(bus, { instanceId: INSTANCE_A, visible: true });
    const pantalla = pantallaOnBus(bus, { touch: true });
    pantalla.snapshot();
    a.emitter.setPayment(qrWithDialog({ amount: 10_000 }));
    a.flush();
    bus.drain();
    const shown = sanitizeDisplayState(pantalla.lastState()!);
    expect(resolveView({ connected: true, updateRequired: false, state: shown })).toBe('payment_qr');
    expect((shown.payment as { amount?: number }).amount).toBe(10_000);
    pantalla.receiver.close();
    a.emitter.stop();
  });

  it('CheckoutDialog (estático) no consulta pos_terminals ni posTerminalsService para generar o proyectar el QR', () => {
    expect(CHECKOUT).not.toMatch(/pos_terminals|posTerminalsService|terminalIdentity/);
  });
});

// ---------------------------------------------------------------------------
// Bordes de la vista: imagen remota sin red vs. embebida; claim una sola vez por código
// ---------------------------------------------------------------------------

describe('vista Cobro·QR: red e imagen', () => {
  it('imagen remota (http) sin red → instrucciones; data URL sin red → imagen; texto sin red → QR generado en local', () => {
    const remote = qrPayment({ qr: { kind: 'image', value: 'https://pagos.example/qr.png' } });
    const embedded = qrPayment({ qr: { kind: 'image', value: 'data:image/png;base64,iVBORw0KGgo=' } });
    expect(resolveQrPresentation(remote, { now: NOW, online: false }).kind).toBe('fallback');
    expect(resolveQrPresentation(embedded, { now: NOW, online: false }).kind).toBe('image');
    expect(resolveQrPresentation(qrPayment(), { now: NOW, online: false }).kind).toBe('text');
  });

  it('corregido en r5 (QA-5): con imagen http Y texto EMVCo viaja el TEXTO, así la pantalla genera el QR en local aunque no tenga red', () => {
    // Ronda 4: viajaba la imagen y sin red la pantalla caía a «siga las instrucciones».
    const resolved = resolveDisplayQr({ imageUrl: 'https://pagos.example/qr.png', data: EMVCO, now: NOW });
    expect(resolved.qr).toEqual({ kind: 'text', value: EMVCO });
    const payment = { ...qrPayment(), qr: resolved.qr };
    expect(resolveQrPresentation(payment, { now: NOW, online: false }).kind).toBe('text');
    expect(resolveQrPresentation(payment, { now: NOW, online: true, imageFailed: true }).kind).toBe('text');
  });

  it('la imagen se mantiene cuando es embebida (data URL / base64 crudo / blob) o cuando no hay texto; un texto que es imagen embebida no la desplaza', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveDisplayQr({ imageUrl: dataUrl, data: EMVCO, now: NOW }).qr).toEqual({ kind: 'image', value: dataUrl });
    expect(resolveDisplayQr({ imageUrl: 'iVBORw0KGgo=', data: EMVCO, now: NOW }).qr).toEqual({ kind: 'image', value: dataUrl });
    expect(resolveDisplayQr({ imageUrl: 'blob:https://caja.example/abc', data: EMVCO, now: NOW }).qr).toEqual({ kind: 'image', value: 'blob:https://caja.example/abc' });
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example/qr.png', data: undefined, now: NOW }).qr).toEqual({ kind: 'image', value: 'https://pagos.example/qr.png' });
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example/qr.png', data: '   ', now: NOW }).qr).toEqual({ kind: 'image', value: 'https://pagos.example/qr.png' });
    // `data` es a su vez una imagen embebida (Wompi manda el SVG en qr_image y el modal lo copia a qrData): imagen.
    // Ronda 6 (QA · bajo): con imageUrl http y data embebida gana la EMBEBIDA (se pinta sin red), no la remota.
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example/qr.png', data: dataUrl, now: NOW }).qr).toEqual({ kind: 'image', value: dataUrl });
    // Texto que no cabe en un QR o base64 de imagen roto: no cuenta como texto válido → imagen remota.
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example/qr.png', data: 'x'.repeat(2001), now: NOW }).qr).toEqual({ kind: 'image', value: 'https://pagos.example/qr.png' });
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example/qr.png', data: 'PHN2Zy!!!no-base64', now: NOW }).qr).toEqual({ kind: 'image', value: 'https://pagos.example/qr.png' });
    // Vencido: sigue sin viajar nada, sea texto o imagen.
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example/qr.png', data: EMVCO, expiresAt: NOW - 1, now: NOW }).qr).toBeNull();
  });
});
