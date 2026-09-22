/**
 * Tester · Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 1.
 *
 * Casos que qr-payment-f2c.test.ts (builder) no cubre. Los defectos iban
 * como `it.failing`; en la ronda 2 el builder los corrigió y los pasó a `it`
 * (los «hoy:» que documentaban el defecto se reescribieron como
 * «corregido»). El hallazgo D (planificador de pruebas) se quedó como
 * evidencia: el emisor no cambió, el builder cambió su planificador.
 *
 * Hallazgos de esta ronda:
 *  A. (crítico) Un texto QR más largo de lo que cabe en un QR (≈ 2,3 KB en
 *     modo byte) hace que `QRCodeSVG` (qrcode.react) LANCE «Data too long»
 *     durante el render; /pos-display no tiene error boundary y la pantalla
 *     se cae entera. Caso real: Wompi (`bancolombia_qr_wompi`) devuelve
 *     `qr_image` como base64 CRUDO de un SVG (docs/integraciones/…:1014,
 *     «data:image/svg+xml;base64,{qr_image}»), CheckoutDialog lo pasa como
 *     qrImageUrl y qrData, `isImageSource` no lo reconoce (sin prefijo
 *     `data:`), `resolveDisplayQr` lo manda como `kind: 'text'` de 4-20 KB y
 *     la pantalla revienta. PLAN §3.5: «nunca un código roto».
 *  B. (alto) Con propinas activadas, generar el QR mientras la fase de
 *     propina sigue pendiente deja la pantalla en «Propina»: el QR viaja en
 *     `payment.qr` pero `buildState` devuelve `mode: 'tip'` y resolveView
 *     pinta TipView. En pantalla NO táctil (propina informativa) el cajero
 *     no teclea nada si el cliente no deja propina, `cashierMovedOn` sigue
 *     false, nadie llama a skipTip() y el cliente nunca ve el QR.
 *  C. (medio) `qrData` que es una URL http(s) sin imagen (Bancolombia
 *     `redirectURL`) se clasifica como IMAGEN, el <img> falla y la pantalla
 *     cae al fallback en vez de generar un QR escaneable a partir de la URL.
 *  D. (bajo, solo pruebas) El «immediateScheduler» del test del builder deja
 *     al emisor sin poder publicar tras el primer flush: `emittedStateCount`
 *     no puede cambiar y la aserción «no cambia» es vacua.
 *  E. (bajo) `toDisplayPayment` convierte `expiresAt` NaN/Infinity en 0
 *     (vencido en 1970) en vez de null. Inalcanzable por CheckoutDialog hoy
 *     (resolveDisplayQr ya devuelve null), pero la API pública lo permite.
 *
 * Los helpers se copian de los tests del builder a propósito: un test no
 * importa de otro test. Organización ficticia (org 120), sin nombres reales.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { isImageSource, resolveDisplayQr, toDisplayPayment } from '@/lib/pos/display/payment';
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
import { BroadcastChannelReceiver, BroadcastChannelTransport, type DisplayTransport, type HelloDraft } from '@/lib/pos/display/transport';
import {
  formatCountdown,
  resolveQrPresentation,
  resolveTouch,
  resolveView,
  sanitizeDisplayPayment,
  sanitizeDisplayState,
} from '@/components/pos-display/logic';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = 'aaaaaaaa-0000-4000-8000-00000000000a';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const NOW = 1_760_000_000_000;
const EMVCO = '000201010212…6304ABCD';
const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** Base64 crudo (sin `data:`) de un SVG como el que devuelve Wompi en `payment_method.extra.qr_image`. */
const WOMPI_RAW_SVG_B64 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29">' + '<rect x="1" y="1" width="1" height="1"/>'.repeat(300) + '</svg>',
).toString('base64');

function qrPayment(overrides: Partial<Extract<DisplayPayment, { method: 'qr' }>> = {}): Extract<DisplayPayment, { method: 'qr' }> {
  return { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'text', value: EMVCO }, expiresAt: NOW + 60_000, ...overrides };
}

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

function down(extra: Record<string, unknown>): unknown {
  return { v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, ...extra };
}

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
  emitUp(msg: UpMessage): void {
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get handlerCount(): number {
    return this.handlers.size;
  }
}

/**
 * Planificador manual (como tip-f2b.test.ts). NO se usa el «immediateScheduler»
 * del builder: el emisor asigna `this.pendingFlush = this.schedule(fn)` y un
 * planificador síncrono deja pendingFlush con la cancelación tras el PRIMER
 * flush, así que ningún requestFlush posterior vuelve a publicar (ver
 * hallazgo D más abajo). Con este, cada `flush()` ejecuta lo encolado.
 */
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

// ---------------------------------------------------------------------------
// A. Nunca un código roto: texto demasiado largo / base64 crudo
// ---------------------------------------------------------------------------

describe('A · texto QR más largo que la capacidad de un QR (PLAN §3.5 «nunca un código roto»)', () => {
  it('evidencia: QRCodeSVG (qrcode.react) LANZA durante el render con más de ≈2,3 KB en modo byte; con el EMVCo normal no', () => {
    expect(() => renderToStaticMarkup(React.createElement(QRCodeSVG, { value: WOMPI_RAW_SVG_B64, level: 'M' }))).toThrow('Data too long');
    expect(() => renderToStaticMarkup(React.createElement(QRCodeSVG, { value: 'x'.repeat(2400), level: 'M' }))).toThrow('Data too long');
    expect(() => renderToStaticMarkup(React.createElement(QRCodeSVG, { value: EMVCO, level: 'M' }))).not.toThrow();
  });

  it('corregido (ronda 2): isImageSource sigue sin aceptar base64 crudo (no es fuente pintable tal cual), pero resolveDisplayQr lo prefija y lo manda como IMAGEN', () => {
    expect(isImageSource(WOMPI_RAW_SVG_B64)).toBe(false);
    const resolved = resolveDisplayQr({ imageUrl: WOMPI_RAW_SVG_B64, data: WOMPI_RAW_SVG_B64, now: NOW });
    expect(resolved.qr).toEqual({ kind: 'image', value: `data:image/svg+xml;base64,${WOMPI_RAW_SVG_B64}` });
    const view = resolveQrPresentation(qrPayment({ qr: resolved.qr, expiresAt: null }), { now: NOW, online: true });
    expect(view.kind).toBe('image');
  });

  it('HALLAZGO A (crítico, lado pantalla) corregido: resolveQrPresentation degrada a fallback un texto que no cabe en un QR (≥ 2,4 KB), nunca le pide a QRCodeSVG que lance', () => {
    const view = resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: 'x'.repeat(2400) }, expiresAt: null }), { now: NOW, online: true });
    expect(view.kind).toBe('fallback');
    expect(view.expired).toBe(false);
    // Y si un emisor viejo mandara el base64 crudo como texto, la pantalla tampoco se cae.
    const raw = resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: WOMPI_RAW_SVG_B64 }, expiresAt: null }), { now: NOW, online: true });
    expect(raw.kind).toBe('fallback');
  });

  it('HALLAZGO A (crítico, lado caja) corregido: resolveDisplayQr con el base64 crudo de un SVG (Wompi) manda una IMAGEN con prefijo data:, nunca kind text', () => {
    const resolved = resolveDisplayQr({ imageUrl: WOMPI_RAW_SVG_B64, data: WOMPI_RAW_SVG_B64, now: NOW });
    expect(resolved.qr === null || resolved.qr.kind === 'image').toBe(true);
    if (resolved.qr) expect(resolved.qr.value.startsWith('data:image/')).toBe(true);
    // Un texto largo que NO es imagen no viaja (qr null): la pantalla muestra las instrucciones.
    expect(resolveDisplayQr({ data: 'x'.repeat(2400), now: NOW }).qr).toBeNull();
    expect(resolveDisplayQr({ data: 'x'.repeat(20_000), now: NOW }).qr).toBeNull();
  });

  it('un base64 crudo que empieza por «PHN2Zy» (<svg) o «iVBORw0» (PNG) es reconocible sin red: la caja puede prefijarlo ella misma', () => {
    // Documenta el punto de corrección más barato: no depende del proveedor.
    expect(WOMPI_RAW_SVG_B64.startsWith('PHN2Zy')).toBe(true);
    expect(DATA_URL.slice('data:image/png;base64,'.length).startsWith('iVBORw0')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. Propina pendiente tapa el QR
// ---------------------------------------------------------------------------

describe('B · propinas activadas: el QR generado con la fase de propina pendiente no se ve', () => {
  function harness() {
    const sched = manualScheduler();
    const transport = new FakeTransport();
    const emitter = new DisplayEmitter({ createTransport: () => transport, isEnabled: () => true, schedule: sched.schedule, getSettings: () => settings() });
    emitter.start(START);
    emitter.setCart(cart());
    sched.flush();
    return { transport, emitter, flush: sched.flush };
  }

  it('corregido (ronda 2): setPayment(QR con código) con la fase pendiente → mode «payment» (la fase sigue pendiente, pero no tapa el código); resolveView pinta el QR', () => {
    const { emitter } = harness();
    emitter.setPayment(qrPayment());
    expect(emitter.tipPhase).toBe('pending');
    const s = emitter.getState();
    expect(s.mode).toBe('payment');
    expect(s.payment).toEqual(qrPayment());
    const clean = sanitizeDisplayState(s);
    expect(resolveView({ connected: true, updateRequired: false, state: clean })).toBe('payment_qr');
    // Sin código (interruptor «Mostrar en pantalla» apagado) la pregunta de propina sigue en pie.
    emitter.setPayment(qrPayment({ qr: null, expiresAt: null }));
    expect(emitter.getState().mode).toBe('tip');
  });

  it('corregido (ronda 2): cambiar de «card» a QR con código no cierra la fase, pero el QR se ve igual', () => {
    const { emitter } = harness();
    emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: null, total: 5000 }));
    expect(emitter.getState().mode).toBe('tip');
    emitter.setPayment(qrPayment());
    expect(emitter.tipPhase).toBe('pending');
    expect(emitter.getState().mode).toBe('payment');
  });

  it('HALLAZGO B (alto) corregido: un cobro QR CON código en pantalla se impone a la pregunta de propina: el cliente ve el QR', () => {
    const { emitter } = harness();
    emitter.setPayment(qrPayment());
    const clean = sanitizeDisplayState(emitter.getState());
    expect(resolveView({ connected: true, updateRequired: false, state: clean })).toBe('payment_qr');
  });

  it('con skipTip() explícito sí se ve el QR; y «Ya pagué» no es posible en modo tip (no hay cartId de cobro)', () => {
    const { emitter } = harness();
    emitter.setPayment(qrPayment());
    emitter.skipTip();
    const clean = sanitizeDisplayState(emitter.getState());
    expect(clean.mode).toBe('payment');
    expect(resolveView({ connected: true, updateRequired: false, state: clean })).toBe('payment_qr');
  });

  it('pantalla NO táctil con propinas activadas: sin botón «Ya pagué» (resolveTouch) y la propina se queda informativa', () => {
    expect(resolveTouch(false, 'auto')).toBe(false);
    expect(resolveTouch(false, undefined)).toBe(false);
    expect(resolveTouch(true, 'no-touch')).toBe(false);
  });

  it('propina pendiente + qr_paid_claim: el emisor ni cierra la fase ni cambia de estado ni publica (solo reenvía a onUp)', () => {
    const { transport, emitter, flush } = harness();
    emitter.setPayment(qrPayment());
    flush();
    const published = transport.published.length;
    const heard: string[] = [];
    emitter.onUp((m) => heard.push(m.t));
    const before = emitter.getState();
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-1' });
    flush();
    expect(heard).toEqual(['qr_paid_claim']);
    expect(emitter.tipPhase).toBe('pending');
    expect(emitter.getState()).toEqual(before);
    expect(transport.published.length).toBe(published);
  });
});

// ---------------------------------------------------------------------------
// C. URL de redirección (Bancolombia) clasificada como imagen
// ---------------------------------------------------------------------------

describe('C · qrData que es una URL http(s) sin imagen (Bancolombia redirectURL)', () => {
  const REDIRECT = 'https://pagos.example.test/transfer/abc123/redirect';

  it('corregido (ronda 2): sin imageUrl, una URL en data viaja como TEXTO y la pantalla genera el QR (imageFailed no le afecta)', () => {
    const resolved = resolveDisplayQr({ imageUrl: undefined, data: REDIRECT, now: NOW });
    expect(resolved.qr).toEqual({ kind: 'text', value: REDIRECT });
    const view = resolveQrPresentation(qrPayment({ qr: resolved.qr, expiresAt: null }), { now: NOW, online: true, imageFailed: true });
    expect(view.kind).toBe('text');
  });

  it('HALLAZGO C (medio) corregido: una URL en `data` (no en `imageUrl`) viaja como TEXTO; en `imageUrl` sin texto sigue siendo imagen', () => {
    expect(resolveDisplayQr({ imageUrl: undefined, data: REDIRECT, now: NOW }).qr).toEqual({ kind: 'text', value: REDIRECT });
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example.test/qr/abc.png', data: undefined, now: NOW }).qr).toEqual({ kind: 'image', value: 'https://pagos.example.test/qr/abc.png' });
    // Ronda 5 (QA-5): con imagen REMOTA y texto válido viaja el texto, que la pantalla
    // convierte en QR sin red (hasta r4 aquí viajaba la imagen).
    expect(resolveDisplayQr({ imageUrl: 'https://pagos.example.test/qr/abc.png', data: REDIRECT, now: NOW }).qr).toEqual({ kind: 'text', value: REDIRECT });
  });
});

// ---------------------------------------------------------------------------
// Casos borde que sí pasan hoy
// ---------------------------------------------------------------------------

describe('resolveDisplayQr · vencimientos y entradas raras', () => {
  it('expires_at exactamente ahora → vencido (qr null, expiresAt conservado); 1 ms después no', () => {
    expect(resolveDisplayQr({ data: EMVCO, expiresAt: NOW, now: NOW })).toEqual({ qr: null, expiresAt: NOW });
    expect(resolveDisplayQr({ data: EMVCO, expiresAt: NOW + 1, now: NOW })).toEqual({ qr: { kind: 'text', value: EMVCO }, expiresAt: NOW + 1 });
  });

  it('expires_at inválido («mañana», «», NaN, Infinity) → sin vencimiento, el código viaja', () => {
    for (const bad of ['mañana', '', Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(resolveDisplayQr({ data: EMVCO, expiresAt: bad, now: NOW })).toEqual({ qr: { kind: 'text', value: EMVCO }, expiresAt: null });
    }
  });

  it('expires_at ISO con offset (-05:00) se convierte igual que en UTC', () => {
    const local = '2026-09-21T10:00:00-05:00';
    const utc = '2026-09-21T15:00:00.000Z';
    expect(resolveDisplayQr({ data: EMVCO, expiresAt: local, now: 0 }).expiresAt).toBe(new Date(utc).getTime());
  });

  it('now no finito → se usa Date.now(); un vencimiento de hace un año sigue vencido', () => {
    expect(resolveDisplayQr({ data: EMVCO, expiresAt: Date.now() - 365 * 86_400_000, now: Number.NaN }).qr).toBeNull();
  });

  it('imageUrl con espacios alrededor se recorta; imageUrl que no es fuente pintable cae al texto de data', () => {
    expect(resolveDisplayQr({ imageUrl: `  ${DATA_URL}  `, data: EMVCO, now: NOW }).qr).toEqual({ kind: 'image', value: DATA_URL });
    expect(resolveDisplayQr({ imageUrl: 'ni-imagen-ni-nada', data: EMVCO, now: NOW }).qr).toEqual({ kind: 'text', value: EMVCO });
  });

  it('blob: URL cuenta como imagen (Electron/objectURL local)', () => {
    expect(resolveDisplayQr({ imageUrl: 'blob:http://localhost/1234', now: NOW }).qr).toEqual({ kind: 'image', value: 'blob:http://localhost/1234' });
  });

  it('toDisplayPayment ignora qr/expiresAt con método no QR y revalida la forma con método QR', () => {
    const card = toDisplayPayment({ methodCode: 'card', methodName: null, total: 100, qr: { kind: 'text', value: EMVCO }, expiresAt: NOW });
    expect(card).toEqual({ method: 'card', total: 100, provider: null });
    const junk = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 100, qr: { kind: 'svg' as 'text', value: EMVCO }, expiresAt: null });
    expect(junk).toEqual({ method: 'qr', total: 100, provider: 'Bre-B', qr: null, expiresAt: null });
  });

  it('HALLAZGO E (bajo) corregido: toDisplayPayment deja expiresAt NaN/Infinity en null (nunca 0 = «vencido en 1970»)', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const p = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 100, qr: { kind: 'text', value: EMVCO }, expiresAt: bad });
      expect(p).toMatchObject({ method: 'qr', expiresAt: null });
      expect(resolveQrPresentation(p as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: true })).toMatchObject({ kind: 'text', expired: false, remainingMs: null });
    }
  });
});

describe('protocolo y saneado · un state con payment qr malformado nunca pinta un código roto', () => {
  const cases: Array<[string, unknown, unknown]> = [
    ['qr como string', 'https://x.test/qr.png', NOW + 1000],
    ['qr con kind desconocido', { kind: 'svg', value: '<svg/>' }, NOW + 1000],
    ['qr con value numérico', { kind: 'text', value: 12345 }, NOW + 1000],
    ['qr válido con expiresAt string', { kind: 'text', value: EMVCO }, 'mañana'],
    ['qr válido con expiresAt Infinity', { kind: 'text', value: EMVCO }, Number.POSITIVE_INFINITY],
  ];

  it.each(cases)('%s: pasa la forma (isDownMessage) y sanitizeDisplayPayment normaliza', (_label, qr, expiresAt) => {
    const payment = { method: 'qr', total: 100, provider: 'Bre-B', qr, expiresAt } as unknown as DisplayPayment;
    const msg = down({ t: 'state', state: state({ mode: 'payment', payment }) });
    expect(isDownMessage(msg)).toBe(true);
    const clean = sanitizeDisplayPayment((msg as { state: DisplayState }).state.payment);
    expect(clean?.method).toBe('qr');
    if (clean?.method !== 'qr') return;
    const view = resolveQrPresentation(clean, { now: NOW, online: true });
    expect(['text', 'image', 'fallback']).toContain(view.kind);
    if (view.kind !== 'fallback') expect(typeof view.value).toBe('string');
  });

  it('qr con value vacío pasa el saneado (Parte A) y la vista lo degrada a fallback sin «venció»', () => {
    const clean = sanitizeDisplayPayment({ method: 'qr', total: 100, provider: 'Bre-B', qr: { kind: 'image', value: '   ' }, expiresAt: NOW + 5000 });
    expect(clean).toMatchObject({ method: 'qr', qr: { kind: 'image', value: '   ' } });
    const view = resolveQrPresentation(clean as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: true });
    expect(view).toEqual({ kind: 'fallback', value: null, remainingMs: 5000, expired: false });
  });

  it('total no finito con método qr → payment null → resolveView degrada a pedido/reposo (nunca payment_qr sin total)', () => {
    const s = sanitizeDisplayState(state({ mode: 'payment', payment: { method: 'qr', total: Number.NaN, provider: 'x', qr: { kind: 'text', value: EMVCO }, expiresAt: null } }));
    expect(s.payment).toBeNull();
    expect(resolveView({ connected: true, updateRequired: false, state: s })).toBe('idle');
  });

  it('provider vacío o no string → "" (la vista usa la etiqueta genérica «Pago con QR»)', () => {
    expect(sanitizeDisplayPayment({ method: 'qr', total: 1, provider: 42, qr: null, expiresAt: null })).toMatchObject({ provider: '' });
  });
});

describe('resolveQrPresentation · red, imagen fallida, vencimiento en vivo', () => {
  it('sin red: imagen http(s) → fallback (no vencido, cuenta atrás sigue); data URL y texto se pintan igual', () => {
    const http = resolveQrPresentation(qrPayment({ qr: { kind: 'image', value: 'https://x.test/qr.png' } }), { now: NOW, online: false });
    expect(http).toEqual({ kind: 'fallback', value: null, remainingMs: 60_000, expired: false });
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'image', value: DATA_URL } }), { now: NOW, online: false }).kind).toBe('image');
    expect(resolveQrPresentation(qrPayment(), { now: NOW, online: false }).kind).toBe('text');
  });

  it('imagen que falló al cargar → fallback aunque haya red; un texto no se ve afectado por imageFailed', () => {
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'image', value: DATA_URL } }), { now: NOW, online: true, imageFailed: true }).kind).toBe('fallback');
    expect(resolveQrPresentation(qrPayment(), { now: NOW, online: true, imageFailed: true }).kind).toBe('text');
  });

  it('la cuenta atrás llega a 0 en vivo: 1 ms antes remainingMs=1, justo al vencer expired=true y fallback', () => {
    const p = qrPayment({ expiresAt: NOW + 1 });
    expect(resolveQrPresentation(p, { now: NOW, online: true })).toEqual({ kind: 'text', value: EMVCO, remainingMs: 1, expired: false });
    expect(resolveQrPresentation(p, { now: NOW + 1, online: true })).toEqual({ kind: 'fallback', value: null, remainingMs: null, expired: true });
  });

  it('QR vencido en la caja (qr null, expiresAt pasado) → la pantalla dice «venció», no «falta»', () => {
    const resolved = resolveDisplayQr({ data: EMVCO, expiresAt: NOW - 1, now: NOW });
    const view = resolveQrPresentation(qrPayment({ qr: resolved.qr, expiresAt: resolved.expiresAt }), { now: NOW, online: true });
    expect(view).toEqual({ kind: 'fallback', value: null, remainingMs: null, expired: true });
  });

  it('reloj de la pantalla adelantado respecto a la caja: el código se da por vencido aunque la caja lo vea vivo (F3, otro dispositivo: documentado)', () => {
    const skewAhead = 5 * 60_000;
    expect(resolveQrPresentation(qrPayment({ expiresAt: NOW + 60_000 }), { now: NOW + skewAhead, online: true }).expired).toBe(true);
  });

  it('formatCountdown: bordes', () => {
    expect(formatCountdown(59_999)).toBe('00:59');
    expect(formatCountdown(60_000)).toBe('01:00');
    expect(formatCountdown(3_600_000)).toBe('60:00');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00');
    expect(formatCountdown(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});

describe('resolveTouch · valores raros del override', () => {
  it('cualquier cosa que no sea touch/no-touch es auto', () => {
    for (const weird of [undefined, null, 'auto', 'TOUCH', 1, true, {}, []]) {
      expect(resolveTouch(true, weird)).toBe(true);
      expect(resolveTouch(false, weird)).toBe(false);
    }
  });
});

describe('isUpMessage · qr_paid_claim', () => {
  it('cartId vacío, numérico o ausente → inválido; toInstanceId "" → inválido', () => {
    expect(isUpMessage({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: '' })).toBe(false);
    expect(isUpMessage({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 7 })).toBe(false);
    expect(isUpMessage({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim' })).toBe(false);
    expect(isUpMessage({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'c', toInstanceId: '' })).toBe(false);
    expect(isUpMessage({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'c', toInstanceId: INSTANCE })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Emisor: casos que el builder no cubre
// ---------------------------------------------------------------------------

describe('emisor · qr_paid_claim en situaciones raras', () => {
  function harness(opts: { settings?: DisplayPresentationSettings } = {}) {
    const sched = manualScheduler();
    const transport = new FakeTransport();
    const emitter = new DisplayEmitter({
      createTransport: () => transport,
      isEnabled: () => true,
      schedule: sched.schedule,
      ...(opts.settings ? { getSettings: () => opts.settings as DisplayPresentationSettings } : {}),
    });
    emitter.start(START);
    return { transport, emitter, flush: sched.flush };
  }

  it('claim de OTRO carrito (pantalla rezagada) se reenvía igual: filtrar por cart.id es de la UI; el estado no cambia', () => {
    const { transport, emitter } = harness();
    emitter.setCart(cart());
    emitter.setPayment(qrPayment());
    const heard: UpMessage[] = [];
    emitter.onUp((m) => heard.push(m));
    const before = emitter.getState();
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-viejo' });
    expect(heard).toHaveLength(1);
    expect(emitter.getState()).toEqual(before);
  });

  it('claim sin cobro abierto (modo pedido) y en Gracias: se reenvía, no se publica nada nuevo', () => {
    const { transport, emitter, flush } = harness();
    emitter.setCart(cart());
    flush();
    const heard: string[] = [];
    emitter.onUp((m) => heard.push(m.t));
    let count = emitter.emittedStateCount;
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-1' });
    flush();
    expect(emitter.getState().mode).toBe('order');
    expect(emitter.emittedStateCount).toBe(count);

    emitter.setMode('thanks', { total: 5000 });
    flush();
    count = emitter.emittedStateCount;
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-1' });
    flush();
    expect(emitter.getState().mode).toBe('thanks');
    expect(emitter.emittedStateCount).toBe(count);
    expect(heard).toEqual(['qr_paid_claim', 'qr_paid_claim']);
  });

  it('tras stop() el transporte queda sin handler: un claim tardío no llega a nadie; tras start() el oyente sigue registrado', () => {
    const { transport, emitter } = harness();
    const heard: string[] = [];
    emitter.onUp((m) => heard.push(m.t));
    emitter.stop();
    expect(transport.handlerCount).toBe(0);
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-1' });
    expect(heard).toEqual([]);
    emitter.start(START);
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-1' });
    expect(heard).toEqual(['qr_paid_claim']);
  });

  it('un oyente que se da de baja DURANTE la entrega no rompe la iteración; uno que se registra durante la entrega no recibe ese mensaje', () => {
    const { transport, emitter } = harness();
    const heard: string[] = [];
    let offSelf: () => void = () => undefined;
    offSelf = emitter.onUp(() => {
      heard.push('self');
      offSelf();
      emitter.onUp(() => heard.push('late'));
    });
    emitter.onUp(() => heard.push('second'));
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-1' });
    expect(heard).toEqual(['self', 'second']);
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'cart-1' });
    expect(heard).toEqual(['self', 'second', 'second', 'late']);
  });

  it('un sobre sin `t` o null que un transporte futuro dejara pasar no lanza ni se reenvía', () => {
    const { transport, emitter } = harness();
    const heard: string[] = [];
    emitter.onUp((m) => heard.push(m.t));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => transport.emitUp(null as unknown as UpMessage)).not.toThrow();
    expect(() => transport.emitUp({} as UpMessage)).not.toThrow();
    expect(heard).toEqual([]);
    warn.mockRestore();
  });

  it('el QR con código viaja tal cual en el state publicado (imagen data URL y texto) y con el interruptor apagado viaja qr null + expiresAt null', () => {
    const { transport, emitter, flush } = harness();
    emitter.setCart(cart());
    const on = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, ...resolveDisplayQr({ imageUrl: DATA_URL, data: EMVCO, expiresAt: NOW + 90_000, now: NOW }) });
    emitter.setPayment(on);
    flush();
    let last = transport.published.filter((m) => m.t === 'state').pop() as { state: DisplayState };
    expect(last.state.mode).toBe('payment');
    expect(last.state.payment).toEqual({ method: 'qr', total: 5000, provider: 'Bre-B', qr: { kind: 'image', value: DATA_URL }, expiresAt: NOW + 90_000 });

    const off = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: null, expiresAt: null });
    emitter.setPayment(off);
    flush();
    last = transport.published.filter((m) => m.t === 'state').pop() as { state: DisplayState };
    expect(last.state.payment).toEqual({ method: 'qr', total: 5000, provider: 'Bre-B', qr: null, expiresAt: null });
    const view = resolveQrPresentation(last.state.payment as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: true });
    expect(view).toEqual({ kind: 'fallback', value: null, remainingMs: null, expired: false });
  });

  it('el mismo payment QR repetido (el efecto de CheckoutDialog se reejecuta) no publica un state nuevo; uno distinto sí', () => {
    const { emitter, flush } = harness();
    emitter.setCart(cart());
    emitter.setPayment(qrPayment());
    flush();
    const count = emitter.emittedStateCount;
    emitter.setPayment(qrPayment());
    flush();
    emitter.setPayment({ ...qrPayment() });
    flush();
    expect(emitter.emittedStateCount).toBe(count);
    emitter.setPayment(qrPayment({ expiresAt: NOW + 61_000 }));
    flush();
    expect(emitter.emittedStateCount).toBe(count + 1);
  });

  it('HALLAZGO D (bajo, solo pruebas): con el «immediateScheduler» de qr-payment-f2c.test.ts el emisor solo publica UNA vez (pendingFlush queda con la cancelación); emittedStateCount no puede cambiar y la aserción «no cambia» es vacua', () => {
    const transport = new FakeTransport();
    const immediate = (fn: () => void) => {
      fn();
      return () => undefined;
    };
    const emitter = new DisplayEmitter({ createTransport: () => transport, isEnabled: () => true, schedule: immediate });
    emitter.start(START);
    emitter.setCart(cart());
    const first = emitter.emittedStateCount;
    emitter.setPayment(qrPayment());
    emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: null, total: 5000 }));
    // Se deriva bien (getState) pero NO se publica nada más: el transporte no ve el cobro.
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.emittedStateCount).toBe(first);
    expect(transport.published.filter((m) => m.t === 'state').pop()).toMatchObject({ state: { mode: 'order' } });
  });
});

// ---------------------------------------------------------------------------
// Dos cajas con la misma terminal: el claim solo llega a la que proyecta
// ---------------------------------------------------------------------------

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

describe('dos pestañas de /app/pos con la misma terminal (BroadcastChannel real)', () => {
  const opened: Array<{ close(): void }> = [];
  afterEach(() => {
    while (opened.length > 0) opened.pop()?.close();
  });

  it('qr_paid_claim va dirigido (toInstanceId) a la instancia adoptada; la otra caja no lo ve', async () => {
    const a = new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A });
    const b = new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_B });
    const receiver = new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs: 0 });
    opened.push(a, b, receiver);
    const heardA: UpMessage[] = [];
    const heardB: UpMessage[] = [];
    a.onUp((m) => heardA.push(m));
    b.onUp((m) => heardB.push(m));
    const accepted: DownMessage[] = [];
    receiver.onDown((m) => accepted.push(m));

    // Solo A saluda y manda estado: la pantalla la adopta.
    a.announce({ t: 'hello', organizationId: 120, currency: 'COP', cashier: null, sessionOpen: true }, state({ mode: 'payment', payment: qrPayment() }));
    await flush();
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
    expect(accepted.map((m) => m.t)).toEqual(['hello', 'state']);

    receiver.send({ t: 'qr_paid_claim', cartId: 'cart-1' });
    await flush();
    expect(heardA.filter((m) => m.t === 'qr_paid_claim')).toHaveLength(1);
    expect(heardA.find((m) => m.t === 'qr_paid_claim')?.toInstanceId).toBe(INSTANCE_A);
    expect(heardB.filter((m) => m.t === 'qr_paid_claim')).toHaveLength(0);
  });

  it('un claim de una pantalla de OTRA terminal no llega (canal por terminal + guarda de terminalId)', async () => {
    const OTHER = 'ffffffff-0000-4111-8222-333333333333';
    const a = new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A });
    const other = new BroadcastChannelReceiver({ terminalId: OTHER, presenceIntervalMs: 0 });
    opened.push(a, other);
    const heard: UpMessage[] = [];
    a.onUp((m) => heard.push(m));
    other.send({ t: 'qr_paid_claim', cartId: 'cart-1' });
    await flush();
    expect(heard).toHaveLength(0);
  });
});
