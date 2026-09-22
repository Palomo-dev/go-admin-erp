/**
 * Fase 2 · Parte C — Cobro con QR, ronda 3 de corrección (QA + tester r2).
 *
 * Cubre, en Node y sin DOM:
 *  1. `amount` (importe que cobra ESTE código, pago mixto): proyección con
 *     toDisplayPayment, guard del protocolo con `amount` ausente (emisor
 *     anterior), saneado en la pantalla, y SSR de QrPaymentView con y sin
 *     `amount` («Total X · Este pago Y» solo cuando difieren).
 *  2. buildState: un QR VENCIDO (qr null, expiresAt numérico) con la propina
 *     pendiente sigue en Cobro·QR; solo el QR sin código Y sin vencimiento
 *     (interruptor apagado) deja pasar la pregunta de propina.
 *  3. base64url: se convierte a base64 estándar y viaja como imagen; un
 *     «base64 de imagen» roto no viaja ni como imagen ni como texto.
 *  4. Retroceso del error boundary: 8 s, 16 s, 32 s, tope 60 s por el mismo
 *     error; un error distinto vuelve a 8 s.
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
import { isBrokenRawBase64Image, normalizeQrImageSource, resolveDisplayQr, toDisplayPayment } from '@/lib/pos/display/payment';
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
import { resolveQrPresentation, resolveView, sanitizeDisplayPayment, sanitizeDisplayState } from '@/components/pos-display/logic';
import { RETRY_BASE_MS, RETRY_MAX_MS, errorKey, nextRetryDelay, resetRetryBackoffForTests } from '@/components/pos-display/retryBackoff';

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

function renderQr(payment: Extract<DisplayPayment, { method: 'qr' }>): string {
  return renderToStaticMarkup(React.createElement(views.QrPaymentView, { payment, currency: 'COP', brand: BRAND }));
}

const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const EMVCO = '000201010212' + '26580014CO.COM.BREB.QR0136' + 'a'.repeat(36) + '52045411530317054061000.05802CO5910COMERCIO X6006BOGOTA63047B1C';
const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = 'aaaaaaaa-0000-4000-8000-00000000000a';

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
// 1. `amount`: importe que cobra ESTE código (pago mixto)
// ---------------------------------------------------------------------------

describe('amount (pago mixto): proyección, guard, saneado', () => {
  it('toDisplayPayment: un importe finito viaja; ausente, null, NaN o Infinity → la clave no viaja (= el total), nunca 0', () => {
    const base = { methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: { kind: 'text' as const, value: EMVCO }, expiresAt: null };
    expect(toDisplayPayment({ ...base, amount: 10_000 })).toEqual({ method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: null, amount: 10_000 });
    // La forma de las fases anteriores no cambia: mismas claves exactas.
    expect(Object.keys(toDisplayPayment({ ...base })).sort()).toEqual(['expiresAt', 'method', 'provider', 'qr', 'total']);
    expect(toDisplayPayment({ ...base, amount: null })).not.toHaveProperty('amount');
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(toDisplayPayment({ ...base, amount: bad })).not.toHaveProperty('amount');
    }
    // Efectivo y tarjeta no llevan el campo.
    expect(toDisplayPayment({ methodCode: 'cash', methodName: null, total: 1, amount: 5 })).not.toHaveProperty('amount');
    expect(toDisplayPayment({ methodCode: 'card', methodName: null, total: 1, amount: 5 })).not.toHaveProperty('amount');
  });

  it('guard del protocolo: un state cuyo payment QR NO trae amount (emisor anterior a la ronda 3) sigue pasando; con amount también', () => {
    const legacy = { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: null } as DisplayPayment;
    expect(isDownMessage(down({ t: 'state', state: state({ mode: 'payment', payment: legacy }) }))).toBe(true);
    expect(isDownMessage(down({ t: 'state', state: state({ mode: 'payment', payment: qrPayment({ amount: 10_000 }) }) }))).toBe(true);
    // Un amount raro es contenido, no forma: pasa el guard y el saneado lo descarta.
    expect(isDownMessage(down({ t: 'state', state: state({ mode: 'payment', payment: { ...qrPayment(), amount: 'diez mil' } as unknown as DisplayPayment }) }))).toBe(true);
  });

  it('saneado en la pantalla: ausente → ausente (misma forma que antes); string/NaN → se descarta; número finito se conserva', () => {
    const legacy = { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: null };
    expect(sanitizeDisplayPayment(legacy)).toEqual(legacy);
    expect(Object.keys(sanitizeDisplayPayment(legacy) ?? {}).sort()).toEqual(['expiresAt', 'method', 'provider', 'qr', 'total']);
    expect(sanitizeDisplayPayment({ ...legacy, amount: 'diez mil' })).not.toHaveProperty('amount');
    expect(sanitizeDisplayPayment({ ...legacy, amount: Number.NaN })).not.toHaveProperty('amount');
    expect(sanitizeDisplayPayment({ ...legacy, amount: 10_000 })).toEqual({ ...legacy, amount: 10_000 });
    const full = sanitizeDisplayState(state({ mode: 'payment', payment: { ...legacy, amount: 10_000 } as DisplayPayment }));
    expect(full.payment).toMatchObject({ method: 'qr', amount: 10_000 });
    expect(resolveView({ connected: true, updateRequired: false, state: full })).toBe('payment_qr');
  });
});

describe('QrPaymentView (SSR): «Total X · Este pago Y» solo cuando amount difiere del total', () => {
  it('con amount 10.000 sobre un total de 25.000 pinta la línea con ambos importes (clave i18n de los 4 idiomas)', () => {
    const html = renderQr(qrPayment({ amount: 10_000 }));
    expect(html).toContain('data-qr-amount="10000"');
    expect(html).toContain('Este pago');
    expect(html).toContain('25.000');
    expect(html).toContain('10.000');
    expect(T.qrAmountOfTotal).toBe('Total {total} · Este pago {amount}');
    for (const locale of ['en', 'fr', 'pt']) {
      const m = JSON.parse(readFileSync(join(process.cwd(), `messages/${locale}.json`), 'utf8')) as { posDisplay: { payment: Record<string, string> } };
      expect(m.posDisplay.payment.qrAmountOfTotal).toContain('{amount}');
      expect(m.posDisplay.payment.qrAmountOfTotal).toContain('{total}');
    }
  });

  it('sin amount (ausente) o igual al total: no aparece la línea; el total sigue abajo como siempre', () => {
    expect(renderQr(qrPayment())).not.toContain('data-qr-amount');
    const legacy = { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: null } as Extract<DisplayPayment, { method: 'qr' }>;
    const html = renderQr(legacy);
    expect(html).not.toContain('data-qr-amount');
    expect(html).not.toContain('Este pago');
    expect(html).toContain('25.000');
    expect(renderQr(qrPayment({ amount: 25_000 }))).not.toContain('data-qr-amount');
  });

  it('vencido con amount: sigue diciendo «venció» y la línea del importe no estorba', () => {
    const html = renderQr(qrPayment({ qr: null, expiresAt: NOW - 1, amount: 10_000 }));
    expect(html).toContain(T.qrExpired);
    expect(html).toContain('data-qr-amount="10000"');
  });
});

// ---------------------------------------------------------------------------
// 2. buildState: QR vencido con propina pendiente sigue en Cobro·QR
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
    id: 'carrito-1',
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

describe('emisor · QR vencido con propina pendiente sigue en Cobro·QR', () => {
  it('QR generado ya vencido (qr null, expiresAt pasado) se impone: mode payment, la pantalla dice «venció», la fase sigue pendiente', () => {
    const { emitter, flush } = harness({ settings: settings() });
    const resolved = resolveDisplayQr({ data: EMVCO, expiresAt: NOW - 1, now: NOW });
    expect(resolved).toEqual({ qr: null, expiresAt: NOW - 1 });
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: resolved.qr, expiresAt: resolved.expiresAt }));
    flush();
    const s = emitter.getState();
    expect(s.mode).toBe('payment');
    expect(emitter.tipPhase).toBe('pending');
    expect(resolveView({ connected: true, updateRequired: false, state: sanitizeDisplayState(s) })).toBe('payment_qr');
    expect(resolveQrPresentation(s.payment as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: true })).toMatchObject({ kind: 'fallback', expired: true });
  });

  it('el efecto de la caja se recalcula tras el vencimiento (otro total, otro importe): la pantalla NO salta a la propina', () => {
    const { emitter, flush } = harness({ settings: settings() });
    emitter.setPayment(qrPayment({ total: 5000 }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    // Vence; el cajero toca un importe y CheckoutDialog reproyecta con `now` actual → qr null, expiresAt conservado.
    const again = resolveDisplayQr({ data: EMVCO, expiresAt: NOW + 60_000, now: NOW + 61_000 });
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: again.qr, expiresAt: again.expiresAt, amount: 4000 }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.tipPhase).toBe('pending');
    // Llega el código nuevo: sigue en cobro QR, ahora con código.
    emitter.setPayment(qrPayment({ total: 5000, expiresAt: NOW + 120_000 }));
    flush();
    expect(emitter.getState().mode).toBe('payment');
    expect((emitter.getState().payment as Extract<DisplayPayment, { method: 'qr' }>).qr).not.toBeNull();
  });

  it('solo el QR sin código Y sin vencimiento (interruptor «Mostrar en pantalla» apagado) deja pasar la pregunta de propina', () => {
    const { emitter, flush } = harness({ settings: settings() });
    emitter.setPayment(qrPayment({ qr: null, expiresAt: null }));
    flush();
    expect(emitter.getState().mode).toBe('tip');
    // Un expiresAt no finito cuenta como «sin vencimiento» (nunca llega así desde toDisplayPayment; guarda del emisor).
    emitter.setPayment({ ...qrPayment({ qr: null }), expiresAt: Number.NaN });
    flush();
    expect(emitter.getState().mode).toBe('tip');
    // Y con la propina desactivada, como siempre: cobro QR.
    const off = harness({ settings: settings({ tips: { enabled: false, presets: [], allowCustom: false } }) });
    off.emitter.setPayment(qrPayment({ qr: null, expiresAt: null }));
    off.flush();
    expect(off.emitter.getState().mode).toBe('payment');
  });
});

// ---------------------------------------------------------------------------
// 3. base64url y «base64 de imagen» roto
// ---------------------------------------------------------------------------

describe('normalizeQrImageSource / resolveDisplayQr: base64url y base64 roto', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29"><path d="M1 1h1v1H1z"/><path d="M3 1h1v1H3z"/></svg>';
  const std = Buffer.from(svg).toString('base64');
  const url = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  it('base64url (RFC 4648 §5) con prefijo de SVG se convierte a base64 estándar con relleno y viaja como IMAGEN', () => {
    expect(url).toMatch(/[-_]/); // el fixture sí usa el alfabeto url
    const out = normalizeQrImageSource(url);
    expect(out).toBe(`data:image/svg+xml;base64,${std}`);
    expect(Buffer.from(out!.slice('data:image/svg+xml;base64,'.length), 'base64').toString()).toBe(svg);
    expect(resolveDisplayQr({ data: url, now: NOW }).qr).toEqual({ kind: 'image', value: `data:image/svg+xml;base64,${std}` });
    expect(resolveDisplayQr({ imageUrl: url, now: NOW }).qr).toEqual({ kind: 'image', value: `data:image/svg+xml;base64,${std}` });
    // El estándar sigue igual que antes y un PNG url también se prefija.
    expect(normalizeQrImageSource(std)).toBe(`data:image/svg+xml;base64,${std}`);
    // PNG: la firma del formato (8 bytes) + bytes altos que producen `+` y `/` en base64 (y `-`/`_` en base64url).
    const pngStd = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xfb, 0xef, 0xbf, 0xff, 0xfe, 0xfd]).toString('base64');
    expect(pngStd).toMatch(/^iVBORw0/);
    expect(pngStd).toMatch(/[+/]/);
    const pngUrl = pngStd.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(normalizeQrImageSource(pngUrl)).toBe(`data:image/png;base64,${pngStd}`);
  });

  it('un valor que empieza como base64 de imagen pero con cuerpo inválido no viaja NI como imagen NI como texto (qr null)', () => {
    const broken = 'PHN2Zy' + 'a+b_c'.repeat(10); // mezcla alfabetos: no es base64 ni base64url
    expect(isBrokenRawBase64Image(broken)).toBe(true);
    expect(normalizeQrImageSource(broken)).toBeNull();
    expect(resolveDisplayQr({ data: broken, now: NOW })).toEqual({ qr: null, expiresAt: null });
    expect(resolveDisplayQr({ imageUrl: broken, now: NOW }).qr).toBeNull();
    const withSpacesInside = 'iVBORw0 KGgo AAAA ñ';
    expect(isBrokenRawBase64Image(withSpacesInside)).toBe(true);
    expect(resolveDisplayQr({ data: withSpacesInside, now: NOW }).qr).toBeNull();
    // Un EMVCo o una URL no se confunden con base64 de imagen: siguen viajando como texto.
    expect(isBrokenRawBase64Image(EMVCO)).toBe(false);
    expect(resolveDisplayQr({ data: EMVCO, now: NOW }).qr).toEqual({ kind: 'text', value: EMVCO });
    expect(isBrokenRawBase64Image('https://pagos.example.test/r/1')).toBe(false);
    expect(isBrokenRawBase64Image(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Retroceso del error boundary
// ---------------------------------------------------------------------------

describe('retryBackoff: 8 s, 16 s, 32 s, tope 60 s por el mismo error; otro error vuelve a 8 s', () => {
  beforeEach(() => resetRetryBackoffForTests());

  it('la secuencia crece y se acota', () => {
    const key = errorKey({ digest: 'abc123', name: 'Error', message: 'Data too long' });
    expect(key).toBe('digest:abc123');
    expect([1, 2, 3, 4, 5, 6].map(() => nextRetryDelay(key))).toEqual([8_000, 16_000, 32_000, 60_000, 60_000, 60_000]);
    expect(RETRY_BASE_MS).toBe(8_000);
    expect(RETRY_MAX_MS).toBe(60_000);
  });

  it('un error distinto (otro digest, o sin digest otro mensaje) reinicia en 8 s; sin digest la clave sale del mensaje', () => {
    nextRetryDelay('digest:a');
    nextRetryDelay('digest:a');
    expect(nextRetryDelay('digest:b')).toBe(8_000);
    expect(nextRetryDelay('digest:b')).toBe(16_000);
    expect(errorKey({ name: 'RangeError', message: 'Data too long' })).toBe('msg:RangeError:Data too long');
    expect(errorKey({ digest: '' , name: 'E', message: 'm' })).toBe('msg:E:m');
    expect(errorKey(null)).toBe('msg::');
    expect(nextRetryDelay(errorKey({ name: 'RangeError', message: 'Data too long' }))).toBe(8_000);
  });

  it('error.tsx usa el retroceso (no un setTimeout fijo) y solo exporta el componente', () => {
    const src = readFileSync(join(SRC, 'app/pos-display/error.tsx'), 'utf8');
    expect(src).toContain("from '@/components/pos-display/retryBackoff'");
    expect(src).toMatch(/setTimeout\(reset, delay\)/);
    expect(src).not.toMatch(/setTimeout\(reset,\s*\d/);
    const exported = src.match(/^export .*$/gm) ?? [];
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatch(/^export default function PosDisplayError/);
  });
});
