/**
 * Tester · Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 3.
 *
 * Rompe lo que la ronda 3 del builder dio por cerrado: `payment.amount`
 * (pago mixto), la regla nueva de buildState (QR vencido se impone; qr y
 * expiresAt ambos null deja pasar la propina), base64url y el retroceso del
 * error boundary. Las vistas se pintan con react-dom/server (esbuild → CJS),
 * igual que en la ronda 2.
 *
 * Hallazgos de esta ronda (ver StructuredOutput del tester):
 *  H. (medio) Tras confirmar el pago QR («Pago QR confirmado», `onPaid` de
 *     QrPaymentDialog) CheckoutDialog cierra el diálogo y el efecto reproyecta
 *     el ÚLTIMO medio (la entrada QR recién añadida) SIN código y SIN
 *     vencimiento. Esa es exactamente la forma «interruptor apagado» que la
 *     regla de buildState deja pasar a la propina: con la fase pendiente
 *     (pantalla no táctil, el cajero no pulsó «Omitir»), el cliente que YA
 *     PAGÓ vuelve a ver «¿Desea dejar propina?». La fase de propina debería
 *     cerrarse al generar un QR con código (el importe ya está fijado) o, al
 *     menos, al confirmarlo.
 *  I. (medio) En pago mixto el `amount` que viaja sigue a `remaining`, y
 *     `remaining = cartTotal − Σ payments` INCLUYE la propia entrada QR
 *     (que «Agregar pago» pre-rellena con lo pendiente). Flujo natural:
 *     efectivo 15.000 + entrada QR 10.000 → remaining 0 → amount = cartTotal
 *     = 25.000 → la pantalla NO pinta «Este pago 10.000» (y el QR se genera
 *     por 25.000: bug preexistente de handleQrPayment que la ronda 3 hereda).
 *     Solo sale bien si el cajero deja la entrada QR en 0.
 *  J. (bajo) `amount` negativo o mayor que el total viaja y se pinta tal
 *     cual («Este pago -$5» / «Este pago $30.000» sobre $25.000): ni el
 *     emisor ni el saneado acotan el importe a (0, total].
 *  K. (bajo, solo desarrollo) React StrictMode monta dos veces los efectos:
 *     `nextRetryDelay` avanza dos pasos por error (8 s → 32 s → 60 s).
 *
 * Ronda 4 (lista congelada C1-C4): los cuatro hallazgos quedaron
 * corregidos y estos casos pasan a afirmar el comportamiento correcto
 * (el de la ronda 3 queda descrito en los comentarios de cada `it`).
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
import { isBrokenRawBase64Image, normalizeQrImageSource, resolveDisplayQr, resolveQrChargeAmount, toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  isUpMessage,
  type DisplayPayment,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';
import { resolveQrPresentation, resolveView, sanitizeDisplayPayment, sanitizeDisplayState } from '@/components/pos-display/logic';
import { errorKey, markRenderHealthy, nextRetryDelay, resetRetryBackoffForTests, retryDelayFor } from '@/components/pos-display/retryBackoff';

// ---------------------------------------------------------------------------
// Cargador de .tsx para pruebas (esbuild → CJS, jsx automático)
// ---------------------------------------------------------------------------

const SRC = join(process.cwd(), 'src');
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
const EMVCO = '000201010212' + '26580014CO.COM.BREB.QR0136' + 'b'.repeat(36) + '52045411530317054061000.05802CO5910COMERCIO Y6006BOGOTA63047B1D';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = 'aaaaaaaa-0000-4000-8000-00000000000b';

function qrPayment(overrides: Partial<Extract<DisplayPayment, { method: 'qr' }>> = {}): Extract<DisplayPayment, { method: 'qr' }> {
  return { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: NOW + 60_000, ...overrides };
}

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

function down(extra: Record<string, unknown>): unknown {
  return { v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, ...extra };
}

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
  /** Simula un mensaje de subida de la pantalla. */
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
    id: 'carrito-r3',
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
  emitter.start(START);
  emitter.setCart(cart());
  sched.flush();
  return { transport, emitter, flush: sched.flush };
}

/** Lo que el efecto de CheckoutDialog emite cuando el diálogo QR está CERRADO y la última entrada es un medio QR (sin código ni vencimiento). */
function qrWithoutDialog(total = 25_000): DisplayPayment {
  return toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B (Mono)', total, received: null, change: null });
}

// ---------------------------------------------------------------------------
// H. Tras confirmar el pago QR la pantalla vuelve a preguntar la propina
// ---------------------------------------------------------------------------

describe('HALLAZGO H (corregido en r4 · C1) · tras «Pago QR confirmado» la pantalla NO vuelve a la pregunta de propina', () => {
  it('QR con código (mode payment) → onPaid cierra el diálogo y reproyecta el medio QR sin código → mode tip con el cliente ya pagado', () => {
    const { emitter, flush } = harness({ settings: settings() });
    // 1. Entrar en cobro con el medio QR: se abre la fase de propina (pantalla no táctil: nadie puede contestar).
    emitter.setPayment(qrWithoutDialog());
    flush();
    expect(emitter.getState().mode).toBe('tip');
    expect(emitter.tipPhase).toBe('pending');
    // 2. Generar el QR: se impone sobre la propina (ronda 2) y el cliente paga con él.
    emitter.setPayment(qrPayment());
    flush();
    expect(emitter.getState().mode).toBe('payment');
    // 3. onPaid (ronda 4, C1): skipTip() + setShowQrDialog(false) + nueva entrada QR → el efecto cae a la rama «último medio» sin qr ni expiresAt.
    emitter.skipTip();
    const afterPaid = qrWithoutDialog();
    expect(afterPaid).toEqual({ method: 'qr', total: 25_000, provider: 'Bre-B (Mono)', qr: null, expiresAt: null });
    emitter.setPayment(afterPaid);
    flush();
    // Ronda 3: aquí volvía 'tip' con el cliente ya pagado. Ahora la fase quedó decidida: 'payment'.
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('done');
    const view = resolveView({ connected: true, updateRequired: false, state: sanitizeDisplayState(emitter.getState()) });
    expect(view).toBe('payment_qr');
    // …y la venta cierra en Gracias sin pasar por la propina.
    emitter.setMode('thanks', { total: 25_000 });
    flush();
    expect(emitter.getState().mode).toBe('thanks');
  });

  it('el emisor no cierra la fase al generar un QR con código: tipPhase sigue pending mientras el cliente escanea', () => {
    const { emitter, flush } = harness({ settings: settings() });
    emitter.setPayment(qrWithoutDialog());
    flush();
    emitter.setPayment(qrPayment({ amount: 10_000 }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    // Documentado: el importe del QR ya está fijado (incluye o no propina) y la pregunta sigue viva.
    expect(emitter.tipPhase).toBe('pending');
  });

  it('CheckoutDialog (C1): onPaid llama a skipTip() del emisor antes de confirmar la entrada; no fija propina y (desde r6) marca la entrada confirmada como tocada', () => {
    const src = readFileSync(join(SRC, 'components/pos/CheckoutDialog.tsx'), 'utf8');
    expect(src).toContain('cashierMovedOn={tipAmount > 0 || touchedIds.size > 0}');
    const start = src.indexOf('onPaid={() => {');
    expect(start).toBeGreaterThan(0);
    const onPaid = src.slice(start, src.indexOf('}}', start) + 2);
    expect(onPaid).toContain('setShowQrDialog(false)');
    expect(onPaid).toContain('getPosDisplayEmitter().skipTip()');
    // Ronda 5 (QA-2): onPaid confirma la entrada de origen y solo añade como respaldo.
    // Ronda 7 (QA-2): la decisión vive en confirmQrPaymentEntry(prev, …) dentro del updater.
    expect(onPaid).toContain('confirmQrPaymentEntry({ payments: prev, qrEntryId, method: qrPaymentMethod, amount: qrPaymentAmount, fallback: newPayment })');
    expect(onPaid.indexOf('skipTip()')).toBeLessThan(onPaid.indexOf('confirmQrPaymentEntry({ payments: prev'));
    // Ronda 6 (HALLAZGO P): ahora SÍ se llama a setTouchedIds. En r5 la entrada
    // confirmada por el proveedor quedaba «pre-rellenada» y un «Aplicar» del
    // aviso de propina (applyTipToPrefilledPayment) la reescribía a total +
    // propina: la venta registraba un pago QR mayor que el cobrado. Marcarla
    // como tocada la vuelve intocable; resolveCashReceived solo mira efectivo,
    // así que «recibido/cambio» no cambia. La propina sigue sin fijarse aquí.
    // Ronda 7 (QA-2): el id tocado lo fija el updater de `payments` (ref) y lo lee el de `touchedIds`.
    expect(onPaid).toContain('confirmedQrEntryIdRef.current = confirmed.confirmedId;');
    expect(onPaid).toContain('const confirmedQrEntryId = confirmedQrEntryIdRef.current ?? newPayment.id;');
    expect(onPaid).toContain('return prev.has(confirmedQrEntryId) ? prev : new Set(prev).add(confirmedQrEntryId);');
    expect(onPaid.indexOf('confirmQrPaymentEntry({ payments: prev')).toBeLessThan(onPaid.indexOf('setTouchedIds'));
    expect(onPaid).not.toContain('setTipAmount');
    // Un solo skipTip en el archivo: el de onPaid. La fase no se cierra al GENERAR el QR (ronda 2).
    expect(src.match(/skipTip\(/g)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// I. Pago mixto: `remaining` incluye la propia entrada QR
// ---------------------------------------------------------------------------

describe('HALLAZGO I (corregido en r4 · C2) · pago mixto: el amount que viaja es el de la PROPIA entrada QR', () => {
  it('CheckoutDialog (C2): el QR se genera por el importe de la PROPIA entrada (resolveQrChargeAmount) y ese `qrAmount` viaja a la pantalla', () => {
    const src = readFileSync(join(SRC, 'components/pos/CheckoutDialog.tsx'), 'utf8');
    expect(src).toContain('const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);');
    expect(src).toContain('const remaining = Math.max(0, cartTotal - totalPaid);');
    // Ronda 3: `amount: remaining > 0 ? remaining : cartTotal` (remaining ya descontaba la entrada QR).
    expect(src).not.toContain('amount: remaining > 0 ? remaining : cartTotal,');
    expect(src).toContain('amount: qrAmount ?? cartTotal,');
    // Ronda 5 (QA-1): el botón pasa también payment.id y el importe se acota a total − otras entradas.
    expect(src).toContain('handleQrPayment(currentMethod.code, payment.id, payment.amount)');
    expect(src).toContain('const amount = resolveQrChargeAmount({ entryAmount, othersTotal, total: cartTotal });');
    expect(src).toContain('setQrAmount(amount);');
    // «Agregar pago» sigue pre-rellenando la entrada nueva con lo pendiente (por eso el importe sale de la entrada).
    expect(src).toMatch(/const addPayment = \(\) => \{[\s\S]*?amount: remaining[\s\S]*?\};/);
  });

  it('flujo natural (C2): efectivo 15.000 + entrada QR pre-rellenada 10.000 → remaining 0, pero el QR sale por los 10.000 de la entrada y la pantalla pinta «Este pago 10.000»', () => {
    const cartTotal = 25_000;
    const payments = [
      { id: 'a', method: 'cash', amount: 15_000 },
      { id: 'b', method: 'breb_qr', amount: 10_000 }, // addPayment: amount = remaining (10.000)
    ];
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const remaining = Math.max(0, cartTotal - totalPaid);
    expect(remaining).toBe(0);
    // Ronda 5: `othersTotal` = Σ de las OTRAS entradas (no `remaining`, que ya descontaba la propia).
    const othersTotal = payments.filter((p) => p.id !== 'b').reduce((sum, p) => sum + p.amount, 0);
    const amount = resolveQrChargeAmount({ entryAmount: payments[1].amount, othersTotal, total: cartTotal });
    expect(amount).toBe(10_000); // ronda 3: 25.000
    const payment = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: cartTotal, qr: { kind: 'text', value: EMVCO }, expiresAt: null, amount });
    expect(payment).toMatchObject({ amount: 10_000, total: 25_000 });
    const html = renderQr(payment as Extract<DisplayPayment, { method: 'qr' }>);
    expect(html).toContain('data-qr-amount="10000"');
    expect(html).toContain('Este pago');
  });

  it('entrada QR en 0 (el cajero la vació): cae a lo pendiente (10.000); una sola entrada QR por el total ⇒ amount = total y sin línea «Este pago»', () => {
    const cartTotal = 25_000;
    const payments = [
      { id: 'a', method: 'cash', amount: 15_000 },
      { id: 'b', method: 'breb_qr', amount: 0 },
    ];
    const othersTotal = payments.filter((p) => p.id !== 'b').reduce((s, p) => s + p.amount, 0);
    const amount = resolveQrChargeAmount({ entryAmount: payments[1].amount, othersTotal, total: cartTotal });
    expect(amount).toBe(10_000);
    const html = renderQr(qrPayment({ amount }));
    expect(html).toContain('data-qr-amount="10000"');
    expect(html).toContain('Este pago');
    // Una sola entrada QR pre-rellenada con el total: sin otras entradas, amount = 25.000 = total.
    const single = resolveQrChargeAmount({ entryAmount: 25_000, othersTotal: 0, total: cartTotal });
    expect(single).toBe(25_000);
    expect(renderQr(qrPayment({ amount: single }))).not.toContain('data-qr-amount');
  });
});

// ---------------------------------------------------------------------------
// J. amount fuera de rango viaja y se pinta
// ---------------------------------------------------------------------------

describe('HALLAZGO J (corregido en r4 · C3) · amount negativo, cero o mayor que el total se acota a (0, total]', () => {
  it('C3: toDisplayPayment NO deja pasar -5, 0 ni 30.000 sobre un total de 25.000 (la clave no viaja); sanitizeDisplayPayment tampoco los conserva', () => {
    const base = { methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: { kind: 'text' as const, value: EMVCO }, expiresAt: null };
    for (const amount of [-5, 0, 30_000, 25_000.01]) {
      const out = toDisplayPayment({ ...base, amount });
      expect(out).not.toHaveProperty('amount');
      const forged = { ...out, amount } as unknown as DisplayPayment;
      expect(sanitizeDisplayPayment(forged)).not.toHaveProperty('amount');
    }
    // Dentro del rango (0, total]: viaja y se conserva; el límite superior (= total) incluido.
    for (const amount of [0.01, 10_000, 25_000]) {
      const out = toDisplayPayment({ ...base, amount });
      expect(out).toHaveProperty('amount', amount);
      expect(sanitizeDisplayPayment(out)).toHaveProperty('amount', amount);
    }
  });

  it('C3: tras el saneado la vista no pinta «Este pago -$5», «$0» ni «$30.000» sobre «Total $25.000»: muestra solo el total', () => {
    for (const amount of [-5, 0, 30_000]) {
      const forged = { ...qrPayment(), amount } as DisplayPayment;
      const clean = sanitizeDisplayPayment(forged) as Extract<DisplayPayment, { method: 'qr' }>;
      expect(clean).not.toHaveProperty('amount');
      const html = renderQr(clean);
      expect(html).not.toContain('data-qr-amount');
      expect(html).not.toContain('Este pago');
    }
    // total 0: nada cabe en (0, 0]; tampoco viaja.
    expect(sanitizeDisplayPayment(qrPayment({ total: 0, amount: 0 }))).not.toHaveProperty('amount');
  });
});

// ---------------------------------------------------------------------------
// Bordes que SÍ resisten (para acotar los hallazgos)
// ---------------------------------------------------------------------------

describe('bordes que resisten en la ronda 3', () => {
  it('qr_paid_claim durante un cobro parcial: el emisor reenvía la intención y el estado (amount incluido) no cambia', () => {
    const { emitter, flush, transport } = harness({ settings: settings({ tips: { enabled: false, presets: [], allowCustom: false } }) });
    emitter.setPayment(qrPayment({ amount: 10_000 }));
    flush();
    const before = JSON.stringify(emitter.getState());
    const seen: UpMessage[] = [];
    emitter.onUp((m) => seen.push(m));
    const claim = { v: PROTOCOL_VERSION, terminalId: TERMINAL, toInstanceId: 'x', t: 'qr_paid_claim', cartId: 'carrito-r3' } as UpMessage;
    expect(isUpMessage(claim)).toBe(true);
    const published = transport.published.length;
    transport.up(claim);
    flush();
    expect(seen).toHaveLength(1);
    expect(JSON.stringify(emitter.getState())).toBe(before);
    expect(transport.published.length).toBe(published);
    expect((emitter.getState().payment as Extract<DisplayPayment, { method: 'qr' }>).amount).toBe(10_000);
  });

  it('QR vencido + amount + táctil: «venció», sin botón «Ya pagué», la línea del importe se conserva', () => {
    const html = renderQr(qrPayment({ qr: null, expiresAt: NOW - 1, amount: 10_000 }), { touch: true, onQrPaidClaim: () => {} });
    expect(html).toContain(T.qrExpired);
    expect(html).not.toContain('<button');
    expect(html).toContain('data-qr-amount="10000"');
    expect(resolveQrPresentation(qrPayment({ qr: null, expiresAt: NOW - 1 }), { now: NOW, online: true })).toMatchObject({ kind: 'fallback', expired: true });
  });

  it('state con payment.amount raro pasa el guard de forma y el saneado lo descarta: la pantalla nunca pinta «Este pago NaN»', () => {
    for (const bad of ['10000', { v: 1 }, [10_000], true, Number.NaN]) {
      const raw = { ...qrPayment(), amount: bad } as unknown as DisplayPayment;
      expect(isDownMessage(down({ t: 'state', state: state({ mode: 'payment', payment: raw }) }))).toBe(true);
      const clean = sanitizeDisplayPayment(raw);
      expect(clean).not.toHaveProperty('amount');
      expect(renderQr(clean as Extract<DisplayPayment, { method: 'qr' }>)).not.toContain('data-qr-amount');
    }
  });

  it('buildState: QR vencido (qr null, expiresAt pasado) con propina pendiente sigue en payment tras un tip_selected tardío', () => {
    const { emitter, flush, transport } = harness({ settings: settings({ touch: 'touch' }) });
    emitter.setPayment(qrWithoutDialog());
    flush();
    expect(emitter.getState().mode).toBe('tip');
    const expired = resolveDisplayQr({ data: EMVCO, expiresAt: NOW - 1, now: NOW });
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: expired.qr, expiresAt: expired.expiresAt }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    // La pantalla táctil aún tenía la vista de propina en memoria y contesta tarde: la fase se cierra sin romper el cobro.
    transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'tip_selected', cartId: 'carrito-r3', kind: 'percent', value: 10 } as UpMessage);
    flush();
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('done');
  });

  it('base64url con longitud ≡ 1 (mod 4) tras quitar el relleno: se prefija con «===» (data URL inválida) y el <img> cae al onError → instrucciones; nunca texto', () => {
    // Un cuerpo válido nunca mide ≡ 1 (mod 4); se comprueba que no viaja como texto y que la pantalla degrada.
    const odd = 'PHN2Zy' + 'a-b_c'.repeat(3); // 6 + 15 = 21 chars → 21 % 4 = 1
    expect(odd.length % 4).toBe(1);
    const out = normalizeQrImageSource(odd);
    expect(out).toMatch(/^data:image\/svg\+xml;base64,.*===$/);
    expect(resolveDisplayQr({ data: odd, now: NOW }).qr?.kind).toBe('image');
    expect(isBrokenRawBase64Image(odd)).toBe(false);
    const html = renderQr(qrPayment({ qr: { kind: 'image', value: out! }, expiresAt: null }));
    expect(html).toContain('<img');
    // Con la imagen fallida (onError) la presentación es fallback.
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'image', value: out! } }), { now: NOW, online: true, imageFailed: true }).kind).toBe('fallback');
  });

  it('EMVCo que por casualidad empieza por «/9j/» o «R0lGOD» con cuerpo no base64 se descarta (qr null), no viaja como imagen rota', () => {
    const fake = 'R0lGOD' + '0002010102*12'; // «*» no está en ningún alfabeto base64 (un espacio se compacta y SÍ pasaría)
    expect(isBrokenRawBase64Image(fake)).toBe(true);
    expect(resolveDisplayQr({ data: fake, now: NOW }).qr).toBeNull();
    expect(normalizeQrImageSource(fake)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// K. Retroceso: StrictMode duplica el avance; sin reinicio tras recuperarse
// ---------------------------------------------------------------------------

describe('HALLAZGO K (corregido en r4 · C4) · retryBackoff bajo StrictMode y reinicio al recuperarse', () => {
  beforeEach(() => resetRetryBackoffForTests());

  it('C4: dos invocaciones del efecto por montaje (StrictMode en desarrollo) con el MISMO objeto de error avanzan UN solo paso: 8 s, 16 s, 32 s…', () => {
    const e1 = { digest: 'd1', name: 'Error', message: 'x' };
    // Montaje 1 (efecto ×2 con el mismo `error`): la misma espera, un solo avance.
    expect(retryDelayFor(e1)).toBe(8_000);
    expect(retryDelayFor(e1)).toBe(8_000);
    // Remontaje tras reset: Next entrega OTRO objeto con el mismo digest → avanza.
    const e2 = { digest: 'd1', name: 'Error', message: 'x' };
    expect(retryDelayFor(e2)).toBe(16_000);
    expect(retryDelayFor(e2)).toBe(16_000);
    expect(retryDelayFor({ digest: 'd1' })).toBe(32_000);
    // El crudo `nextRetryDelay` sigue avanzando en cada llamada (lo usa retryDelayFor por dentro).
    expect(nextRetryDelay(errorKey(e1))).toBe(60_000);
  });

  it('C4: al recuperarse la pantalla (markRenderHealthy desde CustomerDisplay) el contador se reinicia: el mismo digest horas después vuelve a esperar 8 s', () => {
    const key = errorKey({ digest: 'd2' });
    expect(nextRetryDelay(key)).toBe(8_000);
    expect(nextRetryDelay(key)).toBe(16_000);
    // Pantalla recuperada: CustomerDisplay confirmó un state pintado sin error.
    markRenderHealthy();
    expect(nextRetryDelay(key)).toBe(8_000);
    const src = readFileSync(join(SRC, 'components/pos-display/CustomerDisplay.tsx'), 'utf8');
    expect(src).toContain("import { markRenderHealthy } from './retryBackoff';");
    expect(src).toMatch(/useEffect\(\(\) => \{\s*if \(state !== null\) markRenderHealthy\(\);\s*\}, \[state\]\);/);
    const errorPage = readFileSync(join(SRC, 'app/pos-display/error.tsx'), 'utf8');
    expect(errorPage).toContain('retryDelayFor(error)');
    expect(errorPage).not.toContain('nextRetryDelay(');
  });
});
