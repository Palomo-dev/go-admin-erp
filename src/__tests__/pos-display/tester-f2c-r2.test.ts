/**
 * Tester · Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 2.
 *
 * Rompe lo que la ronda 2 del builder dio por cerrado. Novedad de esta
 * ronda: las VISTAS (.tsx) sí se prueban en Node. El builder dijo que no se
 * podía (`jsx: preserve` + ts-jest sin jsdom); aquí se compilan con
 * `esbuild` (ya en node_modules) a CJS con `jsx: 'automatic'` y se pintan
 * con `react-dom/server`. Así se verifica de punta a punta lo que el
 * cliente ve en «Cobro · QR»: instrucciones sin código, «venció», imagen,
 * QR generado desde texto, cuenta atrás y el botón «Ya pagué» solo en
 * pantalla táctil (PLAN §4.2 y §4.4). Lo que SSR no cubre (el error
 * boundary de clase, que en el servidor no se activa) se deja documentado.
 *
 * Hallazgos de esta ronda (ver StructuredOutput del tester):
 *  F. (medio, entorno) el `git stash` / `git stash pop` del builder con
 *     `core.autocrlf=true` reescribió TODOS los archivos modificados del
 *     árbol con CRLF (mtime 20:15:15). desktop-display-r4.test.ts (D6) hace
 *     regex con `\n` sobre posDisplay.ts y está en rojo. No se prueba aquí
 *     (es del entorno, no del código); se documenta.
 *  G. (bajo) En pago mixto el QR se genera por `remaining` pero la pantalla
 *     pinta `total: cartTotal`: el cliente ve «Total $25.000» y un QR de
 *     $10.000. El protocolo no lleva el importe del QR. Se documenta con un
 *     test sobre toDisplayPayment (el emisor no puede saberlo).
 *     → Ronda 3: corregido con `payment.amount`; los tests de F, G, del QR
 *     vencido y del base64url se actualizaron al comportamiento corregido
 *     (ver qr-payment-f2c-r3.test.ts).
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
  normalizeQrImageSource,
  pickQrFromProviderResponse,
  qrTextFits,
  resolveDisplayQr,
  toDisplayPayment,
} from '@/lib/pos/display/payment';
import { isDownMessage, PROTOCOL_VERSION, type DisplayPayment, type DisplayPresentationSettings, type DisplayState, type DownMessageDraft, type UpMessage } from '@/lib/pos/display/protocol';
import type { DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';
import { resolveQrPresentation, resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';

// ---------------------------------------------------------------------------
// Cargador de .tsx para pruebas (esbuild → CJS, jsx automático)
// ---------------------------------------------------------------------------

const SRC = join(process.cwd(), 'src');
const messagesEs = JSON.parse(readFileSync(join(process.cwd(), 'messages/es.json'), 'utf8')) as Record<string, unknown>;

/**
 * next-intl es solo ESM (jest CJS no lo carga). Se sustituye por un
 * `useTranslations` mínimo sobre messages/es.json con interpolación `{x}`:
 * lo que se prueba es la vista, no la librería de i18n.
 */
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

/**
 * Compila un .tsx del proyecto y lo evalúa con un `require` que: (1) resuelve
 * los imports relativos a .tsx con este mismo cargador; (2) manda todo lo
 * demás (react, next-intl, `@/…` en .ts) al `require` de jest, que aplica
 * moduleNameMapper y ts-jest. Solo para pintar con react-dom/server.
 */
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
      for (const ext of ['.tsx']) {
        try {
          readFileSync(target + ext);
          return loadTsx(target + ext);
        } catch {
          /* no es .tsx: cae al require de jest */
        }
      }
      // .ts (o carpeta con index): jest lo transforma con ts-jest.
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
  PaymentView: React.ComponentType<Record<string, unknown>>;
};
const T = (messagesEs.posDisplay as { payment: Record<string, string> }).payment;

const BRAND = { name: 'Tienda de calzado', logoUrl: null, primaryColor: '#1f2937', timezone: 'America/Bogota', unknown: false };

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

function renderQr(payment: Extract<DisplayPayment, { method: 'qr' }>, extra: Record<string, unknown> = {}): string {
  return render(React.createElement(views.QrPaymentView, { payment, currency: 'COP', brand: BRAND, ...extra }));
}

/** Etiqueta i18n interpolada de forma tosca (solo para comparar HTML). */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const EMVCO = '000201010212' + '26580014CO.COM.BREB.QR0136' + 'a'.repeat(36) + '52045411530317054061000.05802CO5910COMERCIO X6006BOGOTA63047B1C';
const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function qrPayment(overrides: Partial<Extract<DisplayPayment, { method: 'qr' }>> = {}): Extract<DisplayPayment, { method: 'qr' }> {
  return { method: 'qr', total: 25_000, provider: 'Bre-B (Mono)', qr: { kind: 'text', value: EMVCO }, expiresAt: null, ...overrides };
}

// ---------------------------------------------------------------------------
// Vista Cobro · QR pintada de verdad (react-dom/server)
// ---------------------------------------------------------------------------

describe('QrPaymentView (SSR real): lo que el cliente ve en «Cobro · QR»', () => {
  it('sin código → «siga las instrucciones del cajero», sin <img>, sin <svg> y sin botón aunque la pantalla sea táctil', () => {
    const html = renderQr(qrPayment({ qr: null }), { touch: true, onQrPaidClaim: () => {} });
    expect(html).toContain(esc(T.qrInstructions));
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<button');
    expect(html).not.toContain(esc(T.qrExpired));
    // El nombre del medio y el total siguen ahí (PLAN §4.2: «Total y el QR … con el nombre del medio»).
    expect(html).toContain('Bre-B (Mono)');
    expect(html).toMatch(/25[.,]000/);
  });

  it('texto EMVCo → QR generado (svg) + «Escanee…»; táctil → botón «Ya pagué»; no táctil → sin botón (PLAN §4.4)', () => {
    const touchHtml = renderQr(qrPayment(), { touch: true, onQrPaidClaim: () => {} });
    expect(touchHtml).toContain('data-qr-kind="text"');
    expect(touchHtml).toContain('<svg');
    expect(touchHtml).toContain(esc(T.qrScan));
    expect(touchHtml).toContain('<button');
    expect(touchHtml).toContain(esc(T.qrPaidButton));

    const noTouchHtml = renderQr(qrPayment(), { touch: false, onQrPaidClaim: () => {} });
    expect(noTouchHtml).toContain('<svg');
    expect(noTouchHtml).not.toContain('<button');

    // Táctil pero sin cartId de cobro (CustomerDisplay no pasa onQrPaidClaim): tampoco hay botón.
    const noHandler = renderQr(qrPayment(), { touch: true });
    expect(noHandler).not.toContain('<button');
  });

  it('imagen data URL → <img src="data:image/png…"> con alt = nombre del medio; sin <svg>', () => {
    const html = renderQr(qrPayment({ qr: { kind: 'image', value: PNG_DATA_URL } }), { touch: false });
    expect(html).toContain('data-qr-kind="image"');
    expect(html).toContain(`<img src="${PNG_DATA_URL}"`);
    expect(html).not.toContain('<svg');
  });

  it('vencido (expiresAt < now) → «venció», sin código y sin botón aunque sea táctil; sin cuenta atrás', () => {
    const html = renderQr(qrPayment({ expiresAt: Date.now() - 1000 }), { touch: true, onQrPaidClaim: () => {} });
    expect(html).toContain(esc(T.qrExpired));
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('<button');
    expect(html).not.toMatch(/\d{2}:\d{2}/);
  });

  it('con vencimiento futuro → cuenta atrás mm:ss (aria-live)', () => {
    const html = renderQr(qrPayment({ expiresAt: Date.now() + 90_000 }), { touch: false });
    expect(html).toContain('aria-live="polite"');
    expect(html).toMatch(/0[01]:[0-5]\d/);
  });

  it('1 500 «ñ» (≤ 2 000 chars, 3 000 bytes) y 2 400 «x» como texto: la vista NO se cae; pinta las instrucciones', () => {
    for (const value of ['ñ'.repeat(1500), 'x'.repeat(QR_TEXT_MAX_CHARS + 400)]) {
      let html = '';
      expect(() => {
        html = renderQr(qrPayment({ qr: { kind: 'text', value } }), { touch: true, onQrPaidClaim: () => {} });
      }).not.toThrow();
      expect(html).toContain(esc(T.qrInstructions));
      expect(html).not.toContain('<svg');
    }
    // Y en el límite exacto (2 000 ASCII) sí se genera el QR.
    expect(renderQr(qrPayment({ qr: { kind: 'text', value: 'x'.repeat(QR_TEXT_MAX_CHARS) } }))).toContain('<svg');
  });

  it('PaymentView con method qr delega en QrPaymentView (misma salida)', () => {
    const viaPayment = render(React.createElement(views.PaymentView, { payment: qrPayment(), currency: 'COP', brand: BRAND, touch: true, onQrPaidClaim: () => {} }));
    expect(viaPayment).toContain('<svg');
    expect(viaPayment).toContain(esc(T.qrPaidButton));
  });

  it('sin red (navigator.onLine=false): imagen http(s) → instrucciones; data URL y texto se pintan igual', () => {
    const g = globalThis as { navigator?: unknown };
    const previous = Object.getOwnPropertyDescriptor(g, 'navigator');
    Object.defineProperty(g, 'navigator', { value: { onLine: false, maxTouchPoints: 0 }, configurable: true, writable: true });
    try {
      const remote = renderQr(qrPayment({ qr: { kind: 'image', value: 'https://example.test/qr.png' } }));
      expect(remote).toContain(esc(T.qrInstructions));
      expect(remote).not.toContain('<img');
      expect(renderQr(qrPayment({ qr: { kind: 'image', value: PNG_DATA_URL } }))).toContain('<img');
      expect(renderQr(qrPayment())).toContain('<svg');
    } finally {
      if (previous) Object.defineProperty(g, 'navigator', previous);
      else delete g.navigator;
    }
  });

  it('documentado (no verificable en SSR): QrCodeBoundary es un componente de clase con getDerivedStateFromError y key={valor}', () => {
    const src = readFileSync(join(SRC, 'components/pos-display/views.tsx'), 'utf8');
    expect(src).toMatch(/class QrCodeBoundary extends Component/);
    expect(src).toMatch(/static getDerivedStateFromError\(\)/);
    expect(src).toMatch(/<QrCodeBoundary\s+key=\{view\.value \?\? ''\}/);
    // El error boundary de la ruta existe y se remonta solo (sin botones).
    const errorPage = readFileSync(join(SRC, 'app/pos-display/error.tsx'), 'utf8');
    // Ronda 3: el reintento ya no es fijo; la espera sale de retryBackoff.ts (8 s → 60 s por el mismo error).
    expect(errorPage).toMatch(/setTimeout\(reset, delay\)/);
    expect(errorPage).toContain("from '@/components/pos-display/retryBackoff'");
    expect(errorPage).not.toContain('<button');
  });
});

// ---------------------------------------------------------------------------
// Emisor y protocolo: casos borde que faltaban
// ---------------------------------------------------------------------------

class FakeTransport implements DisplayTransport {
  readonly published: DownMessageDraft[] = [];
  private readonly handlers = new Set<(msg: UpMessage) => void>();
  lastDisplaySeenAt: number | null = null;
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
  startHeartbeat(): void {}
  stopHeartbeat(): void {}
  close(): void {}
  emitUp(msg: UpMessage): void {
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get states(): DisplayState[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state);
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

function settings(overrides: Partial<DisplayPresentationSettings> = {}): DisplayPresentationSettings {
  return {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    locale: null,
    touch: 'auto',
    ...overrides,
  };
}

const START = { organizationId: 120, currency: 'COP', sessionOpen: true, cashier: { name: 'Andrea' } };

function harness(opts: { settings?: DisplayPresentationSettings; cartOverrides?: Partial<Cart> } = {}) {
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
  emitter.setActiveCart(cart(opts.cartOverrides));
  sched.flush();
  return { transport, emitter, flush: sched.flush };
}

const QR_PAYMENT: DisplayPayment = toDisplayPayment({
  methodCode: 'breb_qr',
  methodName: 'Bre-B (Mono)',
  total: 5000,
  qr: { kind: 'text', value: EMVCO },
  expiresAt: NOW + 60_000,
});

describe('emisor · QR vencido en la caja con propina pendiente', () => {
  it('QR generado ya vencido (qr null, expiresAt pasado) SÍ se impone (corregido en la ronda 3): sigue en cobro QR; la fase sigue pendiente', () => {
    const { emitter, flush } = harness({ settings: settings() });
    const resolved = resolveDisplayQr({ data: EMVCO, expiresAt: NOW - 1, now: NOW });
    expect(resolved.qr).toBeNull();
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: resolved.qr, expiresAt: resolved.expiresAt }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('pending');
    // Con la propina DESACTIVADA el mismo cobro se pinta como cobro QR y la pantalla dice «venció».
    const off = harness({ settings: settings({ tips: { enabled: false, presets: [], allowCustom: false } }) });
    off.emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: null, expiresAt: NOW - 1 }));
    off.flush();
    const state = off.emitter.getState();
    expect(state.mode).toBe('payment');
    const view = resolveQrPresentation(state.payment as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: true });
    expect(view).toMatchObject({ kind: 'fallback', expired: true, remainingMs: null });
  });

  it('QR con código que vence MIENTRAS se muestra: el emisor no se entera (no hay reloj) y sigue en payment; es la pantalla la que degrada a «venció»', () => {
    const { emitter, flush } = harness({ settings: settings() });
    emitter.setPayment(QR_PAYMENT);
    flush();
    expect(emitter.getState().mode).toBe('payment');
    const payment = emitter.getState().payment as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveQrPresentation(payment, { now: NOW + 59_999, online: true }).kind).toBe('text');
    expect(resolveQrPresentation(payment, { now: NOW + 60_000, online: true })).toMatchObject({ kind: 'fallback', expired: true });
    // El emisor sigue diciendo payment (no vuelve a tip): la pantalla muestra «venció» sobre el cobro, no la propina.
    expect(emitter.getState().mode).toBe('payment');
  });
});

describe('emisor · subtotal 0 con propina activada', () => {
  it('carrito con una línea a $0 y propinas activadas: la fase se abre pero con base 0 NO se pinta la pregunta (decidido en F2-B ronda 2, QA-5)', () => {
    const { emitter, flush } = harness({
      settings: settings(),
      cartOverrides: { items: [item({ id: 'l1', unit_price: 0, total: 0 })], subtotal: 0, total: 0 },
    });
    emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: null, total: 0 }));
    flush();
    const state = emitter.getState();
    // Borde documentado en F2-C r2 y decidido en F2-B r2: la fase queda pendiente
    // (derivado, como hasLines) pero el state es `payment`: no se pregunta «5 % · $0».
    expect(emitter.tipPhase).toBe('pending');
    expect(state.mode).toBe('payment');
    expect(state.tip).toBeNull();
    const sanitized = sanitizeDisplayState(state);
    expect(resolveView({ connected: true, updateRequired: false, state: sanitized })).toBe('payment_cash');
    // Con QR con código por encima, el cliente ve el QR de $0 (coherente con la regla F2-C).
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 0, qr: { kind: 'text', value: EMVCO }, expiresAt: null }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
  });
});

describe('emisor · pantalla no táctil con propinas activadas y QR', () => {
  it('hello.settings.touch = no-touch viaja en el saludo; con QR con código el state es payment y la pantalla no pinta botón', () => {
    const { transport, emitter, flush } = harness({ settings: settings({ touch: 'no-touch' }) });
    const hello = transport.published.find((m) => m.t === 'hello') as Extract<DownMessageDraft, { t: 'hello' }>;
    expect(hello.settings?.touch).toBe('no-touch');
    emitter.setPayment(QR_PAYMENT);
    flush();
    const last = transport.states[transport.states.length - 1];
    expect(last.mode).toBe('payment');
    // Se pinta con el reloj real: el vencimiento de QR_PAYMENT es relativo a NOW (fijo), así que se sustituye por uno futuro.
    const html = renderQr({ ...(last.payment as Extract<DisplayPayment, { method: 'qr' }>), expiresAt: Date.now() + 60_000 }, { touch: false, onQrPaidClaim: () => {} });
    expect(html).toContain('<svg');
    expect(html).not.toContain('<button');
  });
});

describe('emisor · qr_paid_claim: el estado no cambia, tampoco durante «Gracias» ni tras cancelar el cobro', () => {
  it('claim tras setMode(order) (cobro cancelado): se reenvía, el modo sigue order y no se publica nada', () => {
    const { transport, emitter, flush } = harness();
    emitter.setPayment(QR_PAYMENT);
    flush();
    emitter.setMode('order');
    flush();
    const before = transport.states.length;
    const seen: UpMessage[] = [];
    emitter.onUp((m) => seen.push(m));
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: 't1', t: 'qr_paid_claim', cartId: 'cart-1' });
    flush();
    expect(seen).toHaveLength(1);
    expect(emitter.getState().mode).toBe('order');
    expect(transport.states.length).toBe(before);
  });

  it('un claim con cartId de otra caja no se filtra en el emisor (lo hace la UI por cart.id) y no lanza', () => {
    const { emitter, transport } = harness();
    const seen: UpMessage[] = [];
    emitter.onUp((m) => seen.push(m));
    expect(() => transport.emitUp({ v: PROTOCOL_VERSION, terminalId: 't1', t: 'qr_paid_claim', cartId: 'otro' })).not.toThrow();
    expect(seen[0]).toMatchObject({ t: 'qr_paid_claim', cartId: 'otro' });
  });
});

// ---------------------------------------------------------------------------
// Emisor (payment.ts): entradas raras que la ronda 2 no cubrió
// ---------------------------------------------------------------------------

describe('normalizeQrImageSource / pickQrFromProviderResponse · bordes', () => {
  it('base64 con saltos de línea (proveedores que envuelven a 76 columnas) se compacta y se prefija', () => {
    const wrapped = ['PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==']
      .join('')
      .replace(/(.{20})/g, '$1\r\n');
    const out = normalizeQrImageSource(wrapped);
    expect(out).toBe('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==');
  });

  it('base64url (con - o _) se convierte a base64 estándar y viaja como IMAGEN, nunca como texto (corregido en la ronda 3)', () => {
    const b64url = 'PHN2Zy' + 'a-b_c'.repeat(10);
    // 56 caracteres: múltiplo de 4, sin relleno.
    const expected = 'data:image/svg+xml;base64,' + 'PHN2Zy' + 'a+b/c'.repeat(10);
    expect(normalizeQrImageSource(b64url)).toBe(expected);
    expect(resolveDisplayQr({ imageUrl: b64url, now: NOW }).qr).toEqual({ kind: 'image', value: expected });
    const withData = resolveDisplayQr({ data: b64url, now: NOW });
    expect(withData.qr).toEqual({ kind: 'image', value: expected });
  });

  it('data:image sin base64 (SVG en utf8) y data:text NO imagen: la primera es imagen, la segunda es texto que cabe', () => {
    const svgUtf8 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    expect(normalizeQrImageSource(svgUtf8)).toBe(svgUtf8);
    expect(resolveDisplayQr({ data: svgUtf8, now: NOW }).qr).toEqual({ kind: 'image', value: svgUtf8 });
    const txt = 'data:text/plain,hola';
    expect(resolveDisplayQr({ data: txt, now: NOW }).qr).toEqual({ kind: 'text', value: txt });
  });

  it('pickQrFromProviderResponse: qr_image http(s) + qr texto → imageUrl remota y data = texto; solo qr_image http(s) → data = la URL (imagen)', () => {
    expect(pickQrFromProviderResponse({ qr: EMVCO, qr_image: 'https://cdn.test/qr.png' })).toEqual({ data: EMVCO, imageUrl: 'https://cdn.test/qr.png' });
    expect(pickQrFromProviderResponse({ qr_image: 'https://cdn.test/qr.png' })).toEqual({ data: 'https://cdn.test/qr.png', imageUrl: 'https://cdn.test/qr.png' });
    // Campos con solo espacios cuentan como ausentes; valores no string se ignoran.
    expect(pickQrFromProviderResponse({ qr: '   ', qr_image: 42, redirectURL: null })).toEqual({ data: undefined, imageUrl: undefined });
    // Array o string en vez de objeto: tolerante.
    expect(pickQrFromProviderResponse(['x'])).toEqual({ data: undefined, imageUrl: undefined });
    expect(pickQrFromProviderResponse('PHN2Zy')).toEqual({ data: undefined, imageUrl: undefined });
  });

  it('qrTextFits: bordes exactos en bytes (1 000 «ñ» = 2 000 bytes cabe; 1 001 no; 500 emojis = 2 000 bytes cabe; 501 no)', () => {
    expect(qrTextFits('ñ'.repeat(1000))).toBe(true);
    expect(qrTextFits('ñ'.repeat(1001))).toBe(false);
    expect(qrTextFits('😀'.repeat(500))).toBe(true);
    expect(qrTextFits('😀'.repeat(501))).toBe(false);
    expect(qrTextFits('€'.repeat(666))).toBe(true); // 1 998 bytes
    expect(qrTextFits('€'.repeat(667))).toBe(false); // 2 001 bytes
    expect(qrTextFits('')).toBe(false);
    expect(qrTextFits(null)).toBe(false);
  });

  it('resolveDisplayQr: el texto se recorta (trim) antes de medir; 2 000 «x» con espacios alrededor sí cabe', () => {
    const r = resolveDisplayQr({ data: `  ${'x'.repeat(QR_TEXT_MAX_CHARS)}  `, now: NOW });
    expect(r.qr).toEqual({ kind: 'text', value: 'x'.repeat(QR_TEXT_MAX_CHARS) });
  });

  it('HALLAZGO G (corregido en la ronda 3): el protocolo lleva `amount`, el importe que cobra ESTE código; sin él la clave no viaja (= el total)', () => {
    // CheckoutDialog genera el QR por `remaining` (p. ej. 10 000 tras 15 000 en efectivo)
    // y ahora proyecta ese mismo importe en `amount`; la pantalla pinta «Total $25.000 · Este pago $10.000».
    const p = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: { kind: 'text', value: EMVCO }, expiresAt: null, amount: 10_000 });
    expect(p).toMatchObject({ total: 25_000, amount: 10_000 });
    const legacy = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: { kind: 'text', value: EMVCO }, expiresAt: null });
    expect(legacy).not.toHaveProperty('amount');
    expect(legacy).toEqual({ method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: null });
  });
});

// ---------------------------------------------------------------------------
// Protocolo: un state con payment qr enorme sigue pasando el guard (es contenido, no forma)
// ---------------------------------------------------------------------------

describe('protocolo · payment.qr grande', () => {
  it('una imagen de 200 KB en data URL pasa isDownMessage y el saneado la conserva (BroadcastChannel la transporta; la pantalla la pinta con <img>)', () => {
    const big = 'data:image/svg+xml;base64,' + 'A'.repeat(200_000);
    const state: DisplayState = { mode: 'payment', cart: null, payment: { method: 'qr', total: 1, provider: 'x', qr: { kind: 'image', value: big }, expiresAt: null }, tip: null, thanks: null };
    const msg = { v: PROTOCOL_VERSION, seq: 1, terminalId: 't', instanceId: 'i', t: 'state', state };
    expect(isDownMessage(msg)).toBe(true);
    const sanitized = sanitizeDisplayState(state);
    expect((sanitized.payment as Extract<DisplayPayment, { method: 'qr' }>).qr?.value.length).toBe(big.length);
    expect(resolveQrPresentation(sanitized.payment as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: false }).kind).toBe('image');
  });
});
