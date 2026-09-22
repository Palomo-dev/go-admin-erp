/**
 * Tester · Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 5.
 *
 * Rompe lo que la ronda 5 del builder dio por corregido (QA-1…QA-5) y los
 * bordes que el encargo pide. Los `it` de los HALLAZGOS afirman el
 * comportamiento CORRECTO: hoy fallan y documentan la regresión; cuando el
 * builder corrija, pasan sin tocarlos.
 *
 * Hallazgos de esta ronda:
 *  P. (alto, dinero · nuevo en r5 por QA-2) `onPaid` ahora CONFIRMA la entrada
 *     de origen con `prev.map` pero la deja SIN marcar como tocada; como sigue
 *     siendo «la única entrada pre-rellenada», un «Aplicar» posterior del aviso
 *     de propina (`applyTipToPrefilledPayment`) le reescribe el importe: la
 *     venta registra un pago breb_qr de 27.500 cuando el proveedor cobró
 *     25.000 y la propina figura como pagada. La decisión del builder («tras
 *     onPaid se llama a skipTip(), así que applyTipToPrefilledPayment no puede
 *     alterar la entrada») es falsa: skipTip() «no borra una elección ya
 *     recibida» (emitter.ts) y el aviso conserva «Aplicar» hasta que el modal
 *     se cierra. Ruta real: pantalla táctil, cliente elige 10 % → cajero genera
 *     el QR sin aplicar → cliente paga → cajero pulsa «Aplicar».
 *  Q. (alto · REGRESIÓN de QA-5) `resolveDisplayQr` prefiere el texto cuando
 *     la imagen es remota, pero `pickQrFromProviderResponse` rellena `data`
 *     con la propia URL de la imagen cuando el proveedor no manda texto
 *     (`data: text ?? image`). Resultado: con solo `qr_image` http (Bre-B sin
 *     `qr`, ambos opcionales en monoTypes.ts) viaja `kind: 'text'` con la URL
 *     del PNG y la pantalla genera un QR que, al escanearse, abre una imagen:
 *     un código roto (PLAN §3.5). En r4 viajaba la imagen.
 *  R. (medio, documentado · el builder lo deja en pendientes) Con las otras
 *     entradas cubriendo ya el total, `resolveQrChargeAmount` devuelve el
 *     TOTAL: efectivo 25.000 + «Agregar pago» (0) → «Generar QR» crea un
 *     cobro REAL de 25.000 sobre una venta ya cubierta y, si el cliente lo
 *     paga, el modal queda en 50.000 pagados con 25.000 de cambio. El `it`
 *     afirma el comportamiento actual con el esperado en comentario.
 *
 * Ronda 6 (builder): P, Q y R corregidos. P → onPaid marca la entrada
 * confirmada como tocada (setTouchedIds); Q → resolveDisplayQr no manda como
 * texto la propia URL de la imagen; R → handleQrPayment corta con pendiente 0
 * y el botón se deshabilita. Los `it` de P y R que afirmaban el comportamiento
 * anterior pasan a afirmar el corregido; el borde «imagen http + data blob»
 * de QA-5 cambia también (gana lo embebido).
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
import {
  QR_TEXT_MAX_CHARS,
  pickQrFromProviderResponse,
  resolveCashReceived,
  resolveDisplayQr,
  resolveQrChargeAmount,
  toDisplayPayment,
} from '@/lib/pos/display/payment';
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
import { applyTipToPrefilledPayment } from '@/components/pos/display/tipNotice';
import { resolveQrPresentation, resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';

// ---------------------------------------------------------------------------
// Cargador de .tsx para pruebas (esbuild → CJS, jsx automático)
// ---------------------------------------------------------------------------

const SRC = join(process.cwd(), 'src');
const messagesEs = JSON.parse(readFileSync(join(process.cwd(), 'messages/es.json'), 'utf8')) as Record<string, unknown>;

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
const REMOTE_PNG = 'https://qr.example.test/collections/abc123/qr.png';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = '11111111-1111-4111-8111-111111111111';
const CHECKOUT = readFileSync(join(SRC, 'components/pos/CheckoutDialog.tsx'), 'utf8');

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

function down(extra: Record<string, unknown>): unknown {
  return { v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, ...extra };
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
    id: 'carrito-r5',
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
    touch: 'touch',
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
  return { transport, emitter, flush: sched.flush };
}

/** Lo que el efecto de CheckoutDialog emite con el diálogo QR CERRADO y la última entrada en un medio QR. */
function qrWithoutDialog(total = 25_000): DisplayPayment {
  return toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B (Mono)', total, received: null, change: null });
}

/** Lo que el efecto emite con el diálogo QR ABIERTO y «Mostrar en pantalla» encendido. */
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

interface Entry {
  id: string;
  method: string;
  amount: number;
}

/**
 * Misma regla que onPaid de CheckoutDialog: confirmar la entrada de origen o,
 * si no está, añadir (ronda 5) y marcar la entrada confirmada como TOCADA
 * (ronda 6, HALLAZGO P) para que applyTipToPrefilledPayment no la reescriba.
 * `touched` se muta como hace setTouchedIds en la caja.
 */
function onPaidConfirm(prev: Entry[], qrEntryId: string | undefined, method: string, amount: number, touched: Set<string> = new Set()): Entry[] {
  const exists = prev.some((p) => p.id === qrEntryId);
  const next = exists
    ? prev.map((p) => (p.id === qrEntryId ? { ...p, method, amount } : p))
    : [...prev, { id: 'nuevo', method, amount }];
  touched.add(exists && qrEntryId !== undefined ? qrEntryId : 'nuevo');
  return next;
}

// ---------------------------------------------------------------------------
// P. La entrada QR confirmada sigue siendo «pre-rellenada» para el aviso de propina
// ---------------------------------------------------------------------------

describe('HALLAZGO P (alto, dinero) · la entrada QR confirmada por onPaid queda expuesta a «Aplicar» del aviso de propina', () => {
  it('flujo real: cliente elige 10 % en pantalla táctil → cajero genera el QR sin aplicar → onPaid → «Aplicar» reescribe el importe cobrado', () => {
    const base = 25_000;
    const { emitter, transport, flush } = harness({ settings: settings() });
    emitter.setTipBase(base);
    emitter.setPayment(qrWithoutDialog(base));
    flush();
    expect(emitter.getState().mode).toBe('tip');
    // 1. El cliente elige 10 % en la pantalla: la fase se cierra y la caja recibe la elección (aviso «Aplicar»/«Cambiar»).
    transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, toInstanceId: INSTANCE, t: 'tip_selected', cartId: 'carrito-r5', kind: 'percent', value: 10 });
    flush();
    expect(emitter.tipPhase).toBe('done');
    const selection = emitter.tipSelection;
    expect(selection).not.toBeNull();
    expect(selection!.amount).toBe(2_500);
    // 2. El cajero, sin pulsar «Aplicar», genera el QR desde la única entrada pre-rellenada (25.000, no tocada).
    const entry: Entry = { id: 'q', method: 'breb_qr', amount: base };
    const touched = new Set<string>();
    const charged = resolveQrChargeAmount({ entryAmount: entry.amount, othersTotal: 0, total: base });
    expect(charged).toBe(25_000);
    emitter.setPayment(qrWithDialog({ total: base, amount: charged }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    // 3. El cliente paga 25.000: onPaid → skipTip() (sin efecto, la fase ya estaba decidida) + confirmación de la entrada,
    //    que desde la ronda 6 queda marcada como TOCADA (setTouchedIds).
    emitter.skipTip();
    const afterPaid = onPaidConfirm([entry], 'q', 'breb_qr', charged, touched);
    expect(afterPaid).toEqual([{ id: 'q', method: 'breb_qr', amount: 25_000 }]);
    expect(touched.has('q')).toBe(true);
    // skipTip() «no borra una elección ya recibida»: el aviso sigue ofreciendo «Aplicar» (TipFromDisplayNotice conserva `selection`).
    expect(emitter.tipSelection).not.toBeNull();
    // 4. El cajero pulsa «Aplicar»: la caja hace applyTipToPrefilledPayment(prev, touchedIds, base + propina + domicilio).
    const cartTotal = base + selection!.amount + 0;
    const afterApply = applyTipToPrefilledPayment(afterPaid, touched, cartTotal);
    // La entrada confirmada por el proveedor NO cambia (el QR cobró 25.000) y el modal queda en «Falta dinero» por los 2.500
    // de propina, que el cajero cobra por otro medio. En r5 pasaba a 27.500 y la propina figuraba como cobrada por QR.
    expect(afterApply).toBe(afterPaid);
    expect(afterApply.find((p) => p.id === 'q')?.amount).toBe(25_000);
    const totalPaid = afterApply.reduce((s, p) => s + p.amount, 0);
    expect(Math.max(0, cartTotal - totalPaid)).toBe(2_500);
    // «recibido/cambio» no cambia: la entrada tocada es QR, no efectivo.
    expect(resolveCashReceived(afterApply, touched)).toBeNull();
  });

  it('aritmética pura: applyTipToPrefilledPayment sigue tratando como pre-rellenada una entrada NO tocada; por eso onPaid la marca', () => {
    const untouched = onPaidConfirm([{ id: 'q', method: 'breb_qr', amount: 25_000 }], 'q', 'breb_qr', 25_000, new Set<string>());
    // Sin marcarla (lo que hacía r5) la función pura la reescribe: esa es la exposición que cierra la ronda 6.
    const rewritten = applyTipToPrefilledPayment(untouched, new Set<string>(), 27_500);
    expect(rewritten[0].amount).toBe(27_500);
    expect(rewritten[0].method).toBe('breb_qr');
    // Marcada como tocada (lo que hace onPaid desde r6) queda en 25.000.
    const touched = new Set<string>();
    const paid = onPaidConfirm([{ id: 'q', method: 'breb_qr', amount: 25_000 }], 'q', 'breb_qr', 25_000, touched);
    expect(applyTipToPrefilledPayment(paid, touched, 27_500)[0].amount).toBe(25_000);
    // Y si el cajero había quitado la entrada de origen, la añadida como respaldo es la que queda intocable.
    const touched2 = new Set<string>();
    const appended = onPaidConfirm([], 'q', 'breb_qr', 25_000, touched2);
    expect(touched2.has('nuevo')).toBe(true);
    expect(applyTipToPrefilledPayment(appended, touched2, 27_500)[0].amount).toBe(25_000);
  });

  it('CheckoutDialog (estático): onPaid marca la entrada confirmada como tocada (setTouchedIds) tras confirmarla', () => {
    const onPaid = CHECKOUT.slice(CHECKOUT.indexOf('onPaid={() => {'), CHECKOUT.indexOf('<SerialSelectorDialog'));
    const protectsEntry = onPaid.includes('setTouchedIds') || CHECKOUT.includes('confirmedQrEntry') || /applyTipToPrefilledPayment\(prev,\s*new Set\(\[\.\.\.touchedIds/.test(CHECKOUT);
    expect(protectsEntry).toBe(true);
    // La entrada marcada es la de origen si existe; si no, la añadida como respaldo.
    // Ronda 7 (QA-2): lo decide confirmQrPaymentEntry con el `prev` del updater y viaja por ref.
    expect(onPaid).toContain('confirmedQrEntryIdRef.current = confirmed.confirmedId;');
    expect(onPaid).toContain('const confirmedQrEntryId = confirmedQrEntryIdRef.current ?? newPayment.id;');
    expect(onPaid.indexOf('setPayments(')).toBeLessThan(onPaid.indexOf('setTouchedIds('));
    // Sigue sin fijar propina ni tocar el efectivo.
    expect(onPaid).not.toContain('setTipAmount');
  });
});

// ---------------------------------------------------------------------------
// Q. Imagen remota sin texto: la URL de la imagen viaja como texto
// ---------------------------------------------------------------------------

describe('HALLAZGO Q (alto, regresión de QA-5) · con solo una imagen http el emisor manda su URL como TEXTO y la pantalla genera un QR que abre un PNG', () => {
  it('pickQrFromProviderResponse({ qr_image: http }) rellena data con la URL de la imagen; resolveDisplayQr la convierte en kind text', () => {
    const picked = pickQrFromProviderResponse({ qr_image: REMOTE_PNG });
    expect(picked).toEqual({ data: REMOTE_PNG, imageUrl: REMOTE_PNG });
    const resolved = resolveDisplayQr({ imageUrl: picked.imageUrl, data: picked.data, expiresAt: null, now: NOW });
    // ESPERADO: la imagen (única representación del código). HOY: { kind: 'text', value: 'https://…/qr.png' }.
    expect(resolved.qr).toEqual({ kind: 'image', value: REMOTE_PNG });
  });

  it('resolveDisplayQr con imageUrl http y data igual a esa URL nunca debe viajar como texto (el texto no es un EMVCo, es la propia imagen)', () => {
    const resolved = resolveDisplayQr({ imageUrl: REMOTE_PNG, data: REMOTE_PNG, now: NOW });
    expect(resolved.qr?.kind).toBe('image');
  });

  it('lo que pintaría la pantalla hoy: un <svg> generado a partir de la URL del PNG, con red disponible y sin que el <img> haya fallado', () => {
    const picked = pickQrFromProviderResponse({ qr_image: REMOTE_PNG });
    const payment = toDisplayPayment({
      methodCode: 'breb_qr',
      methodName: 'Bre-B (Mono)',
      total: 25_000,
      ...resolveDisplayQr({ imageUrl: picked.imageUrl, data: picked.data, now: NOW }),
    }) as Extract<DisplayPayment, { method: 'qr' }>;
    const view = resolveQrPresentation(payment, { now: NOW, online: true });
    // ESPERADO: la imagen del proveedor. HOY: 'text' (QR generado con la URL del PNG).
    expect(view.kind).toBe('image');
  });

  it('en cambio, con imagen http Y un texto EMVCo distinto sí debe viajar el texto (QA-5), y con imagen http y URL de redirección distinta, la URL', () => {
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: EMVCO, now: NOW }).qr).toEqual({ kind: 'text', value: EMVCO });
    const redirect = 'https://pagos.example.test/redirect/xyz';
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: redirect, now: NOW }).qr).toEqual({ kind: 'text', value: redirect });
  });
});

// ---------------------------------------------------------------------------
// R. Otras entradas ya cubren el total: el QR sale por el total (documentado)
// ---------------------------------------------------------------------------

describe('HALLAZGO R (medio) · corregido en r6: con el total ya cubierto por otras entradas «Generar QR» no crea ningún cobro', () => {
  it('efectivo 25.000 + «Agregar pago» (0) → pendiente 0: handleQrPayment corta antes del fetch y onPaid nunca ocurre (el modal no llega a 50.000 pagados)', () => {
    const total = 25_000;
    const entries: Entry[] = [
      { id: 'c', method: 'cash', amount: 25_000 },
      { id: 'q', method: 'breb_qr', amount: 0 },
    ];
    const othersTotal = entries.filter((p) => p.id !== 'q').reduce((s, p) => s + p.amount, 0);
    const pending = Math.max(0, total - othersTotal);
    expect(pending).toBe(0);
    // La función pura conserva la regla 3 (último recurso; r4 la afirma), pero la caja ya no llega a ella con pendiente 0:
    expect(resolveQrChargeAmount({ entryAmount: 0, othersTotal, total })).toBe(25_000);
    const handler = CHECKOUT.slice(CHECKOUT.indexOf('const handleQrPayment = async'), CHECKOUT.indexOf('setQrPaymentMethod(methodCode);'));
    expect(handler).toContain('if (Math.max(0, cartTotal - othersTotal) <= 0) {');
    expect(handler).toContain("toast.error('No hay saldo pendiente para cobrar con QR');");
    // El corte va ANTES de resolveQrChargeAmount y de cualquier fetch al proveedor.
    expect(handler.indexOf('No hay saldo pendiente')).toBeLessThan(handler.indexOf('const amount = resolveQrChargeAmount('));
    expect(handler).not.toContain('fetch(');
    // Sin QR no hay onPaid: las entradas quedan como estaban (25.000 pagados, cambio 0).
    const totalPaid = entries.reduce((s, p) => s + p.amount, 0);
    expect(totalPaid).toBe(25_000);
    expect(Math.max(0, totalPaid - total)).toBe(0);
    // Total 0 también se corta (isAmountWithinTotal(0, 0) es false y el cobro real sería por 0 o por «el total»).
    expect(Math.max(0, 0 - 0) <= 0).toBe(true);
  });

  it('CheckoutDialog (estático): el botón «Generar QR de pago» se deshabilita cuando las OTRAS entradas cubren el total', () => {
    // El texto «Generar QR de pago» aparece antes en un comentario de handleQrPayment: se busca DESDE el botón
    // (en r5 el slice quedaba vacío y el `not.toContain` pasaba en vano).
    const start = CHECKOUT.indexOf('Boton para pago QR si el metodo es QR');
    expect(start).toBeGreaterThan(0);
    const button = CHECKOUT.slice(start, CHECKOUT.indexOf('Generar QR de pago', start));
    expect(button.length).toBeGreaterThan(0);
    // Ronda 8 (F2C-R7-2): además, deshabilitado mientras hay una generación en vuelo (isCreatingQr).
    expect(button).toContain('disabled={othersCoverTotal || isCreatingQr}');
    // «Otras» = excluida la propia entrada por id, igual que othersTotal en handleQrPayment.
    expect(button).toContain('payments.filter((p) => p.id !== payment.id).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) >= cartTotal');
  });
});

// ---------------------------------------------------------------------------
// Bordes de QA-5 (resolveDisplayQr) que sí se sostienen
// ---------------------------------------------------------------------------

describe('resolveDisplayQr · bordes de la preferencia por el texto (QA-5)', () => {
  it('imagen http + data blob: el blob embebido de data gana sobre la imageUrl http (ronda 6: la preferencia «sin red» de QA-5 vale también para imágenes); imagen http + base64 roto: → la imagen http', () => {
    const blob = 'blob:https://caja.example.test/8f2c1e';
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: blob, now: NOW }).qr).toEqual({ kind: 'image', value: blob });
    // Lo mismo con una data URL o un base64 crudo en data: se pintan sin red.
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: dataUrl, now: NOW }).qr).toEqual({ kind: 'image', value: dataUrl });
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: 'iVBORw0KGgo=', now: NOW }).qr).toEqual({ kind: 'image', value: dataUrl });
    const broken = 'iVBORw0KGgo!!!no-es-base64***';
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: broken, now: NOW }).qr).toEqual({ kind: 'image', value: REMOTE_PNG });
  });

  it('imagen http + texto de exactamente QR_TEXT_MAX_CHARS → texto; un carácter más → la imagen http (el texto no cabe y no viaja)', () => {
    const fits = 'a'.repeat(QR_TEXT_MAX_CHARS);
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: fits, now: NOW }).qr).toEqual({ kind: 'text', value: fits });
    const tooLong = 'a'.repeat(QR_TEXT_MAX_CHARS + 1);
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: tooLong, now: NOW }).qr).toEqual({ kind: 'image', value: REMOTE_PNG });
    // Bytes UTF-8: 1000 «ñ» = 2000 bytes caben; 1001 no.
    expect(resolveDisplayQr({ data: 'ñ'.repeat(1000), now: NOW }).qr?.kind).toBe('text');
    expect(resolveDisplayQr({ data: 'ñ'.repeat(1001), now: NOW }).qr).toBeNull();
  });

  it('imagen http + texto EMVCo con vencimiento pasado → qr null y expiresAt conservado (la pantalla dice «venció», no genera nada)', () => {
    const resolved = resolveDisplayQr({ imageUrl: REMOTE_PNG, data: EMVCO, expiresAt: NOW - 1, now: NOW });
    expect(resolved).toEqual({ qr: null, expiresAt: NOW - 1 });
    const payment = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, ...resolved }) as Extract<DisplayPayment, { method: 'qr' }>;
    const view = resolveQrPresentation(payment, { now: NOW, online: false });
    expect(view).toEqual({ kind: 'fallback', value: null, remainingMs: null, expired: true });
    expect(renderQr(payment, { touch: true, onQrPaidClaim: () => {} })).toContain(T.qrExpired);
    expect(renderQr(payment, { touch: true, onQrPaidClaim: () => {} })).not.toContain(T.qrPaidButton);
  });
});

// ---------------------------------------------------------------------------
// Guard del protocolo y saneado con un `qr` malformado
// ---------------------------------------------------------------------------

describe('guard del protocolo: `payment.qr` malformado pasa la forma y la pantalla degrada a instrucciones', () => {
  it.each([
    ['string', 'https://x/qr.png'],
    ['array', ['image', 'x']],
    ['kind desconocido', { kind: 'svg', value: '<svg/>' }],
    ['value no string', { kind: 'text', value: 42 }],
    ['value vacío', { kind: 'text', value: '' }],
  ])('qr = %s', (_label, qr) => {
    const msg = down({ t: 'state', state: state({ mode: 'payment', payment: { method: 'qr', total: 25_000, provider: 'Bre-B', qr, expiresAt: null } as unknown as DisplayPayment }) });
    expect(isDownMessage(msg)).toBe(true);
    const sane = sanitizeDisplayState((msg as { state: DisplayState }).state);
    expect(sane.payment?.method).toBe('qr');
    const payment = sane.payment as Extract<DisplayPayment, { method: 'qr' }>;
    const view = resolveQrPresentation(payment, { now: NOW, online: true });
    expect(view.kind).toBe('fallback');
    expect(view.expired).toBe(false);
    expect(resolveView({ connected: true, updateRequired: false, touch: true, state: sane })).toBe('payment_qr');
    const html = renderQr(payment, { touch: true, onQrPaidClaim: () => {} });
    expect(html).toContain(T.qrInstructions);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<img');
    expect(html).not.toContain(T.qrPaidButton);
  });

  it('un texto fabricado por encima de QR_TEXT_MAX_CHARS pasa el guard y la pantalla lo degrada sin <svg> (qrcode.react no llega a montarse)', () => {
    const payment: DisplayPayment = { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: 'x'.repeat(QR_TEXT_MAX_CHARS + 1) }, expiresAt: null };
    const msg = down({ t: 'state', state: state({ mode: 'payment', payment }) });
    expect(isDownMessage(msg)).toBe(true);
    const sane = sanitizeDisplayState((msg as { state: DisplayState }).state);
    const html = renderQr(sane.payment as Extract<DisplayPayment, { method: 'qr' }>, { touch: true, onQrPaidClaim: () => {} });
    expect(html).toContain(T.qrInstructions);
    expect(html).not.toContain('<svg');
  });
});

// ---------------------------------------------------------------------------
// qr_paid_claim: no altera nada, en ninguna de las dos puntas
// ---------------------------------------------------------------------------

describe('qr_paid_claim no altera el estado (emisor) ni el cobro (caja)', () => {
  it('emisor con QR en pantalla: tras el claim el state es el mismo objeto de siempre, la fase de propina no cambia y no se reemite', () => {
    const { emitter, transport, flush } = harness({ settings: settings() });
    emitter.setTipBase(25_000);
    emitter.setPayment(qrWithDialog({ amount: 25_000 }));
    flush();
    const before = JSON.stringify(emitter.getState());
    const published = transport.published.length;
    const phase = emitter.tipPhase;
    const seen: UpMessage[] = [];
    emitter.onUp((m) => seen.push(m));
    transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, toInstanceId: INSTANCE, t: 'qr_paid_claim', cartId: 'carrito-r5' });
    transport.up({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'otro-carrito' });
    flush();
    expect(JSON.stringify(emitter.getState())).toBe(before);
    expect(emitter.tipPhase).toBe(phase);
    expect(transport.published.length).toBe(published);
    expect(seen.map((m) => m.t)).toEqual(['qr_paid_claim', 'qr_paid_claim']);
  });

  it('CheckoutDialog (estático): el oyente se registra solo con el cobro abierto, filtra por cart.id y no toca payments, showQrDialog ni el poller', () => {
    const start = CHECKOUT.indexOf("if (msg.t !== 'qr_paid_claim'");
    expect(start).toBeGreaterThan(0);
    const effect = CHECKOUT.slice(CHECKOUT.lastIndexOf('useEffect(() => {', start), CHECKOUT.indexOf('}, [open, cart.id]);', start));
    expect(effect).toContain('if (!open) return;');
    expect(effect).toContain("if (msg.t !== 'qr_paid_claim' || msg.cartId !== cart.id) return;");
    expect(effect).toContain("toast.info('El cliente indica que ya pagó'");
    for (const forbidden of ['setPayments', 'setShowQrDialog', 'onPaid', 'checkNow', 'setQr']) expect(effect).not.toContain(forbidden);
  });
});

// ---------------------------------------------------------------------------
// Pantalla no táctil con propinas activadas y QR
// ---------------------------------------------------------------------------

describe('pantalla NO táctil (override no-touch) con propinas activadas: el QR se impone y nunca hay botón «Ya pagué»', () => {
  it('tip pendiente → QR con código → vista payment_qr sin botón; el mismo state en táctil sí lo pinta', () => {
    const { emitter, flush } = harness({ settings: settings({ touch: 'no-touch' }) });
    emitter.setTipBase(25_000);
    emitter.setPayment(qrWithoutDialog());
    flush();
    expect(emitter.getState().mode).toBe('tip');
    emitter.setPayment(qrWithDialog({ amount: 10_000 }));
    flush();
    const sane = sanitizeDisplayState(emitter.getState());
    expect(sane.mode).toBe('payment');
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: sane })).toBe('payment_qr');
    const payment = sane.payment as Extract<DisplayPayment, { method: 'qr' }>;
    const noTouch = renderQr(payment, { touch: false, onQrPaidClaim: () => {} });
    expect(noTouch).toContain('<svg');
    expect(noTouch).not.toContain(T.qrPaidButton);
    expect(noTouch).toContain('data-qr-amount="10000"');
    const touch = renderQr(payment, { touch: true, onQrPaidClaim: () => {} });
    expect(touch).toContain(T.qrPaidButton);
    // Sin cartId (onQrPaidClaim ausente: CustomerDisplay solo lo pasa con state.cart.id) tampoco hay botón aunque sea táctil.
    expect(renderQr(payment, { touch: true })).not.toContain(T.qrPaidButton);
  });
});

// ---------------------------------------------------------------------------
// Importe del código en el modal y en la entrada: bordes de resolveQrChargeAmount
// ---------------------------------------------------------------------------

describe('resolveQrChargeAmount · bordes no cubiertos en r4', () => {
  it('entrada con decimales y othersTotal con decimales: min(entrada, total − otras) sin redondeos raros', () => {
    expect(resolveQrChargeAmount({ entryAmount: 10_000.5, othersTotal: 14_999.5, total: 25_000 })).toBe(10_000.5);
    expect(resolveQrChargeAmount({ entryAmount: 10_001, othersTotal: 14_999.5, total: 25_000 })).toBe(10_000.5);
  });

  it('total no finito o string: todo cae a 0 (el emisor descarta amount y el modal muestra 0, nunca NaN)', () => {
    expect(resolveQrChargeAmount({ entryAmount: 10_000, othersTotal: 0, total: Number.NaN })).toBe(0);
    expect(resolveQrChargeAmount({ entryAmount: 10_000, othersTotal: 0, total: Number.POSITIVE_INFINITY })).toBe(0);
    expect(resolveQrChargeAmount({ entryAmount: 10_000, othersTotal: 0, total: '25000' as unknown as number })).toBe(10_000);
  });

  it('othersTotal Infinity cuenta como 0 (pendiente = total) y no como «todo cubierto»', () => {
    expect(resolveQrChargeAmount({ entryAmount: 10_000, othersTotal: Number.POSITIVE_INFINITY, total: 25_000 })).toBe(10_000);
  });

  it('CheckoutDialog (estático): el input de monto lleva max solo para entradas QR y othersTotal excluye la entrada por id', () => {
    expect(CHECKOUT).toContain('max={isQrPaymentCode(payment.method) ? cartTotal : undefined}');
    expect(CHECKOUT).toContain('const othersTotal = payments.filter((p) => p.id !== entryId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);');
    expect(CHECKOUT).toContain('const amount = resolveQrChargeAmount({ entryAmount, othersTotal, total: cartTotal });');
  });
});
