/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 4 (cierre).
 *
 * Lista congelada del orquestador:
 *  C1. Tras «Pago QR confirmado» (onPaid) la pantalla NO vuelve a preguntar
 *      la propina: la caja llama a skipTip() y la proyección va a
 *      payment/thanks, nunca a 'tip'.
 *  C2. Pago mixto: el `amount` que viaja es el importe de la PROPIA entrada
 *      QR (resolveQrChargeAmount), no `remaining` global.
 *  C3. `amount` acotado a (0, total] en el emisor (toDisplayPayment) y en el
 *      saneado de la pantalla (sanitizeDisplayPayment); fuera de rango la
 *      clave no viaja y la pantalla muestra solo el total.
 *  C4. error.tsx cuenta UNA vez por error aunque StrictMode monte dos veces
 *      (retryDelayFor por objeto) y el contador se reinicia al pintar bien
 *      (markRenderHealthy desde CustomerDisplay).
 *  C5. Archivos nuevos de la parte en LF.
 *
 * Helpers copiados a propósito (un test no importa de otro). Organización
 * ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { isAmountWithinTotal, resolveQrChargeAmount, toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  type DisplayPayment,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';
import { resolveView, sanitizeDisplayPayment, sanitizeDisplayState } from '@/components/pos-display/logic';
import {
  RETRY_BASE_MS,
  errorKey,
  markRenderHealthy,
  nextRetryDelay,
  resetRetryBackoffForTests,
  retryDelayFor,
} from '@/components/pos-display/retryBackoff';

const SRC = join(process.cwd(), 'src');
const EMVCO = '000201010212' + '26580014CO.COM.BREB.QR0136' + 'b'.repeat(36) + '52045411530317054061000.05802CO5910COMERCIO Y6006BOGOTA63047B1D';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const NOW = Date.UTC(2026, 8, 21, 16, 0, 0);

// ---------------------------------------------------------------------------
// Emisor de pruebas
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

function cart(): Cart {
  const item = {
    id: 'l1',
    product_id: 1,
    product: { id: 1, name: 'Zapato' },
    quantity: 1,
    unit_price: 25_000,
    discount_amount: 0,
    tax_amount: 0,
    total: 25_000,
    tax_included: false,
  } as unknown as CartItem;
  return {
    id: 'carrito-r4',
    organization_id: 120,
    branch_id: 1,
    status: 'active',
    items: [item],
    subtotal: 25_000,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 25_000,
    created_at: '2026-09-21T10:00:00.000Z',
    updated_at: '2026-09-21T10:00:00.000Z',
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

function harness(opts: { settings?: DisplayPresentationSettings } = {}) {
  const transport = new FakeTransport();
  const sched = manualScheduler();
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
    getSettings: opts.settings ? () => opts.settings! : undefined,
    schedule: sched.schedule,
    isVisible: () => true,
  });
  emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true, cashier: { name: 'Andrea' } });
  emitter.setCart(cart());
  sched.flush();
  return { transport, emitter, flush: sched.flush };
}

/** Lo que emite CheckoutDialog con el diálogo QR CERRADO y la última entrada en un medio QR (sin código ni vencimiento). */
function qrWithoutDialog(total = 25_000): DisplayPayment {
  return toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B (Mono)', total, received: null, change: null });
}

/** Lo que emite CheckoutDialog con el QR generado y «Mostrar en pantalla» encendido. */
function qrWithCode(amount?: number): DisplayPayment {
  return toDisplayPayment({
    methodCode: 'breb_qr',
    methodName: 'Bre-B (Mono)',
    total: 25_000,
    qr: { kind: 'text', value: EMVCO },
    expiresAt: NOW + 60_000,
    amount,
  });
}

function viewOf(emitter: DisplayEmitter) {
  return resolveView({ connected: true, updateRequired: false, state: sanitizeDisplayState(emitter.getState()) });
}

// ---------------------------------------------------------------------------
// C1 · Tras «Pago QR confirmado» la pantalla no vuelve a 'tip'
// ---------------------------------------------------------------------------

describe('C1 · tras «Pago QR confirmado» la fase de propina queda decidida: payment/thanks, nunca de vuelta a tip', () => {
  it('flujo completo de CheckoutDialog: tip pendiente → QR con código → onPaid (skipTip + medio sin código) → payment → thanks', () => {
    const { emitter, flush } = harness({ settings: settings() });
    emitter.setPayment(qrWithoutDialog());
    flush();
    expect(emitter.getState().mode).toBe('tip');
    expect(emitter.tipPhase).toBe('pending');

    emitter.setPayment(qrWithCode());
    flush();
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('pending'); // generar el QR no decide la propina (ronda 2)

    // onPaid: la caja decide la fase y reproyecta el medio sin código.
    emitter.skipTip();
    emitter.setPayment(qrWithoutDialog());
    flush();
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('done');
    expect(viewOf(emitter)).toBe('payment_qr');

    // Recalcular el efecto por cualquier motivo (otro total, otra entrada) tampoco vuelve a preguntar.
    emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 25_000, received: null, change: null }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('done');

    emitter.setMode('thanks', { total: 25_000 });
    flush();
    expect(emitter.getState().mode).toBe('thanks');
    expect(emitter.getState().tip).toBeNull();
  });

  it('skipTip() sin fase pendiente (propinas desactivadas, o ya decidida) no hace nada ni reemite', () => {
    const { emitter, flush, transport } = harness({ settings: settings({ tips: { enabled: false, presets: [], allowCustom: false } }) });
    emitter.setPayment(qrWithCode());
    flush();
    const before = transport.published.length;
    emitter.skipTip();
    flush();
    expect(transport.published.length).toBe(before);
    expect(emitter.tipPhase).toBeNull();
    expect(emitter.getState().mode).toBe('payment');
  });

  it('un tip_selected tardío de la pantalla tras el pago confirmado se descarta: la fase ya estaba decidida', () => {
    const { emitter, flush, transport } = harness({ settings: settings({ touch: 'touch' }) });
    const seen: unknown[] = [];
    emitter.onTipSelected((sel) => seen.push(sel));
    emitter.setPayment(qrWithoutDialog());
    flush();
    emitter.setPayment(qrWithCode());
    flush();
    emitter.skipTip();
    emitter.setPayment(qrWithoutDialog());
    flush();
    transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'tip_selected', cartId: 'carrito-r4', kind: 'percent', value: 10 } as UpMessage);
    flush();
    expect(seen).toHaveLength(0);
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('done');
  });

  it('una venta nueva vuelve a abrir la fase: skipTip de la venta anterior no la deja decidida para siempre', () => {
    const { emitter, flush } = harness({ settings: settings() });
    emitter.setPayment(qrWithoutDialog());
    flush();
    emitter.skipTip();
    emitter.setMode('thanks', { total: 25_000 });
    flush();
    emitter.setMode('order');
    flush();
    emitter.setPayment(qrWithoutDialog());
    flush();
    expect(emitter.getState().mode).toBe('tip');
    expect(emitter.tipPhase).toBe('pending');
  });

  it('CheckoutDialog (estático): onPaid llama a getPosDisplayEmitter().skipTip() y es la única llamada a skipTip del archivo', () => {
    const src = readFileSync(join(SRC, 'components/pos/CheckoutDialog.tsx'), 'utf8');
    const start = src.indexOf('onPaid={() => {');
    expect(start).toBeGreaterThan(0);
    const onPaid = src.slice(start, src.indexOf('}}', start) + 2);
    expect(onPaid).toContain('getPosDisplayEmitter().skipTip();');
    expect(src.match(/skipTip\(/g)).toHaveLength(1);
    // La fase NO se cierra al generar el QR (handleQrPayment): seguiría viva si el cliente no paga.
    const gen = src.slice(src.indexOf('const handleQrPayment = async'), src.indexOf('const loadTaxData = async'));
    expect(gen).not.toContain('skipTip');
  });
});

// ---------------------------------------------------------------------------
// C2 · Importe de la PROPIA entrada QR
// ---------------------------------------------------------------------------

describe('C2 · resolveQrChargeAmount: el QR se genera por la propia entrada, acotada a total − otras entradas (ronda 5, QA-1)', () => {
  it('efectivo 15.000 + entrada QR 10.000 sobre 25.000 ⇒ 10.000 (othersTotal = 15.000, la propia entrada no se descuenta)', () => {
    expect(resolveQrChargeAmount({ entryAmount: 10_000, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
  });

  it('una sola entrada QR por el total ⇒ amount = total; por MÁS del total ⇒ el total (ronda 4 devolvía la entrada tal cual)', () => {
    expect(resolveQrChargeAmount({ entryAmount: 25_000, othersTotal: 0, total: 25_000 })).toBe(25_000);
    expect(resolveQrChargeAmount({ entryAmount: 30_000, othersTotal: 0, total: 25_000 })).toBe(25_000);
    // Mixto con sobrecobro: efectivo 15.000 + entrada 20.000 ⇒ los 10.000 que faltan.
    expect(resolveQrChargeAmount({ entryAmount: 20_000, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
  });

  it('entrada en 0, negativa, NaN o ausente ⇒ lo pendiente tras las otras; sin pendiente ⇒ el total', () => {
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
    expect(resolveQrChargeAmount({ entryAmount: -1, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
    expect(resolveQrChargeAmount({ entryAmount: Number.NaN, othersTotal: 15_000, total: 25_000 })).toBe(10_000);
    expect(resolveQrChargeAmount({ othersTotal: 15_000, total: 25_000 })).toBe(10_000);
    expect(resolveQrChargeAmount({ entryAmount: null, othersTotal: 0, total: 25_000 })).toBe(25_000);
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal: Number.NaN, total: 25_000 })).toBe(25_000);
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal: 25_000, total: 25_000 })).toBe(25_000);
  });

  it('el mismo importe viaja a la pantalla: «Total 25.000 · Este pago 10.000»', () => {
    const amount = resolveQrChargeAmount({ entryAmount: 10_000, othersTotal: 15_000, total: 25_000 });
    const payment = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: { kind: 'text', value: EMVCO }, expiresAt: null, amount });
    expect(payment).toMatchObject({ method: 'qr', total: 25_000, amount: 10_000 });
    expect(sanitizeDisplayPayment(payment)).toMatchObject({ amount: 10_000 });
  });

  it('CheckoutDialog (estático): un solo cálculo del importe (resolveQrChargeAmount con la entrada) compartido por proveedor, modal, pantalla y onPaid', () => {
    const src = readFileSync(join(SRC, 'components/pos/CheckoutDialog.tsx'), 'utf8');
    expect(src).toContain('const [qrAmount, setQrAmount] = useState<number | undefined>();');
    // Ronda 5 (QA-1): la entrada viaja con su id para excluirla de `othersTotal`.
    expect(src).toContain('const handleQrPayment = async (methodCode: string, entryId?: string, entryAmount?: number) => {');
    expect(src).toContain('const amount = resolveQrChargeAmount({ entryAmount, othersTotal, total: cartTotal });');
    expect(src).toContain('setQrAmount(amount);');
    expect(src).toContain('onClick={() => handleQrPayment(currentMethod.code, payment.id, payment.amount)}');
    // Pantalla del cliente.
    expect(src).toContain('amount: qrAmount ?? cartTotal,');
    expect(src).not.toContain('amount: remaining > 0 ? remaining : cartTotal,');
    // Modal y entrada que añade onPaid.
    expect(src).toContain('amount={qrAmount ?? (remaining > 0 ? remaining : cartTotal)}');
    expect(src).toContain('const qrPaymentAmount = qrAmount ?? (remaining > 0 ? remaining : cartTotal);');
  });
});

// ---------------------------------------------------------------------------
// C3 · amount acotado a (0, total]
// ---------------------------------------------------------------------------

describe('C3 · isAmountWithinTotal en el emisor y en la pantalla', () => {
  it('regla pura: (0, total]; NaN, Infinity, string, total no finito o 0 → false', () => {
    expect(isAmountWithinTotal(10_000, 25_000)).toBe(true);
    expect(isAmountWithinTotal(25_000, 25_000)).toBe(true);
    expect(isAmountWithinTotal(0.01, 25_000)).toBe(true);
    expect(isAmountWithinTotal(0, 25_000)).toBe(false);
    expect(isAmountWithinTotal(-5, 25_000)).toBe(false);
    expect(isAmountWithinTotal(30_000, 25_000)).toBe(false);
    expect(isAmountWithinTotal(Number.NaN, 25_000)).toBe(false);
    expect(isAmountWithinTotal(Number.POSITIVE_INFINITY, 25_000)).toBe(false);
    expect(isAmountWithinTotal('10000', 25_000)).toBe(false);
    expect(isAmountWithinTotal(10, Number.NaN)).toBe(false);
    expect(isAmountWithinTotal(0, 0)).toBe(false);
    expect(isAmountWithinTotal(1, 0)).toBe(false);
  });

  it('emisor: fuera de rango la clave no viaja y la forma es la de las fases previas (toEqual exacto)', () => {
    for (const amount of [-5, 0, 30_000]) {
      const out = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: null, expiresAt: null, amount });
      expect(out).toEqual({ method: 'qr', total: 25_000, provider: 'Bre-B', qr: null, expiresAt: null });
    }
  });

  it('pantalla: un state fabricado con amount fuera de rango pasa el guard de forma y el saneado lo descarta', () => {
    for (const amount of [-5, 0, 30_000, Number.NaN, '10000']) {
      const raw = { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: null, amount } as unknown as DisplayPayment;
      const msg = { v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: 'i', t: 'state', state: { mode: 'payment', cart: null, payment: raw, tip: null, thanks: null } };
      expect(isDownMessage(msg)).toBe(true);
      const clean = sanitizeDisplayPayment(raw);
      expect(clean).not.toBeNull();
      expect(clean).not.toHaveProperty('amount');
    }
  });

  it('qr_paid_claim no altera el estado ni el amount acotado', () => {
    const { emitter, flush, transport } = harness({ settings: settings({ tips: { enabled: false, presets: [], allowCustom: false } }) });
    emitter.setPayment(qrWithCode(10_000));
    flush();
    const before = JSON.stringify(emitter.getState());
    const seen: UpMessage[] = [];
    emitter.onUp((m) => seen.push(m));
    const published = transport.published.length;
    transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'carrito-r4' } as UpMessage);
    flush();
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(emitter.getState())).toBe(before);
    expect(transport.published.length).toBe(published);
  });
});

// ---------------------------------------------------------------------------
// C4 · retroceso: un avance por error y reinicio al recuperarse
// ---------------------------------------------------------------------------

describe('C4 · retryDelayFor / markRenderHealthy', () => {
  beforeEach(() => resetRetryBackoffForTests());

  it('el mismo objeto de error (StrictMode: dos pasadas del efecto) cuenta una vez; otro objeto con el mismo digest avanza', () => {
    const e = { digest: 'x' };
    expect(retryDelayFor(e)).toBe(RETRY_BASE_MS);
    expect(retryDelayFor(e)).toBe(RETRY_BASE_MS);
    expect(retryDelayFor(e)).toBe(RETRY_BASE_MS);
    expect(retryDelayFor({ digest: 'x' })).toBe(16_000);
    expect(retryDelayFor({ digest: 'x' })).toBe(32_000);
    expect(retryDelayFor({ digest: 'x' })).toBe(60_000);
    // Un error distinto vuelve a empezar.
    expect(retryDelayFor({ digest: 'y' })).toBe(RETRY_BASE_MS);
  });

  it('sin digest la clave sale del mensaje; un error real (instancia de Error) también se recuerda por objeto', () => {
    const err = new RangeError('Data too long');
    expect(errorKey(err)).toBe('msg:RangeError:Data too long');
    expect(retryDelayFor(err)).toBe(RETRY_BASE_MS);
    expect(retryDelayFor(err)).toBe(RETRY_BASE_MS);
    expect(retryDelayFor(new RangeError('Data too long'))).toBe(16_000);
    // null/undefined no se pueden recordar: cuentan cada vez (sin lanzar).
    expect(retryDelayFor(null)).toBe(RETRY_BASE_MS);
    expect(retryDelayFor(undefined)).toBe(16_000);
  });

  it('markRenderHealthy reinicia el contador: el mismo digest vuelve a 8 s; resetRetryBackoffForTests hace lo mismo', () => {
    expect(retryDelayFor({ digest: 'z' })).toBe(RETRY_BASE_MS);
    expect(retryDelayFor({ digest: 'z' })).toBe(16_000);
    markRenderHealthy();
    expect(nextRetryDelay(errorKey({ digest: 'z' }))).toBe(RETRY_BASE_MS);
    expect(nextRetryDelay(errorKey({ digest: 'z' }))).toBe(16_000);
    resetRetryBackoffForTests();
    expect(nextRetryDelay(errorKey({ digest: 'z' }))).toBe(RETRY_BASE_MS);
  });

  it('cableado (estático): error.tsx usa retryDelayFor(error) con setTimeout(reset, delay); CustomerDisplay marca sana la pantalla al confirmar un state', () => {
    const errorPage = readFileSync(join(SRC, 'app/pos-display/error.tsx'), 'utf8');
    expect(errorPage).toContain("import { retryDelayFor } from '@/components/pos-display/retryBackoff';");
    expect(errorPage).toContain('const delay = retryDelayFor(error);');
    expect(errorPage).toMatch(/setTimeout\(reset, delay\)/);
    expect(errorPage).not.toContain('nextRetryDelay(');
    const exported = errorPage.match(/^export .*$/gm) ?? [];
    expect(exported).toHaveLength(1);

    const display = readFileSync(join(SRC, 'components/pos-display/CustomerDisplay.tsx'), 'utf8');
    expect(display).toContain("import { markRenderHealthy } from './retryBackoff';");
    expect(display).toMatch(/useEffect\(\(\) => \{\s*if \(state !== null\) markRenderHealthy\(\);\s*\}, \[state\]\);/);
  });
});

// ---------------------------------------------------------------------------
// C5 · LF en los archivos nuevos de la parte
// ---------------------------------------------------------------------------

describe('C5 · archivos nuevos de la Parte C en LF (sin CR)', () => {
  const files = [
    'components/pos-display/retryBackoff.ts',
    'app/pos-display/error.tsx',
    '__tests__/pos-display/qr-payment-f2c.test.ts',
    '__tests__/pos-display/qr-payment-f2c-r3.test.ts',
    '__tests__/pos-display/qr-payment-f2c-r4.test.ts',
    '__tests__/pos-display/tester-f2c-r1.test.ts',
    '__tests__/pos-display/tester-f2c-r2.test.ts',
    '__tests__/pos-display/tester-f2c-r3.test.ts',
  ];
  it.each(files)('%s no contiene \\r', (rel) => {
    const src = readFileSync(join(SRC, rel), 'utf8');
    expect(src.includes('\r')).toBe(false);
  });
});
