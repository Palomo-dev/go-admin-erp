/**
 * Fase 2 · Parte C — Cobro con QR a pantalla completa (PLAN §4.2, §3.5, §8).
 *
 * Cubre, en Node y sin DOM:
 *  1. La proyección del cobro QR desde lo que ya genera el POS
 *     (`resolveDisplayQr` + `toDisplayPayment`): imagen, texto, vencido, sin nada.
 *  2. El guard del protocolo con `qr: null` y con `expiresAt` ya pasado
 *     (forma válida: la pantalla decide qué pintar), y `qr_paid_claim` de subida.
 *  3. Qué pinta la pantalla (`resolveQrPresentation`): nunca un código roto.
 *  4. Que `qr_paid_claim` NO altera el estado del emisor: solo llega a los
 *     oyentes de `onUp` (la UI de la caja muestra un aviso y nada más).
 *  5. `DisplayLink.send`: solo con caja conectada.
 *
 * Fixtures con organización ficticia (org 120). Sin nombres reales.
 */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import {
  QR_TEXT_MAX_CHARS,
  isImageSource,
  normalizeQrImageSource,
  parseExpiresAt,
  pickQrFromProviderResponse,
  qrTextFits,
  resolveDisplayQr,
  toDisplayPayment,
} from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  isUpMessage,
  type DisplayPayment,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessageDraft,
  type UpMessage,
  type UpMessageDraft,
} from '@/lib/pos/display/protocol';
import type { DisplayReceiver, DisplayTransport, HelloDraft } from '@/lib/pos/display/transport';
import {
  formatCountdown,
  resolveQrPresentation,
  resolveTouch,
  resolveView,
  sanitizeDisplayPayment,
  sanitizeDisplayState,
} from '@/components/pos-display/logic';
import { startDisplayLink } from '@/components/pos-display/displayLink';

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE = 'aaaaaaaa-0000-4000-8000-00000000000a';
const NOW = 1_760_000_000_000;
const IMAGE_URL = 'https://pagos.example.test/qr/abc.png';
const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const EMVCO = '000201010212…6304ABCD';
const REDIRECT_URL = 'https://pagos.example.test/transfer/abc123/redirect';
/** Base64 crudo (sin `data:`) de un SVG, como `payment_method.extra.qr_image` de Wompi antes de prefijarlo. */
const RAW_SVG_B64 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29">' + '<rect x="1" y="1" width="1" height="1"/>'.repeat(300) + '</svg>',
).toString('base64');
const RAW_PNG_B64 = DATA_URL.slice('data:image/png;base64,'.length);

function qrPayment(overrides: Partial<Extract<DisplayPayment, { method: 'qr' }>> = {}): Extract<DisplayPayment, { method: 'qr' }> {
  return { method: 'qr', total: 25_000, provider: 'Bre-B', qr: { kind: 'image', value: IMAGE_URL }, expiresAt: NOW + 60_000, ...overrides };
}

function state(overrides: Partial<DisplayState>): DisplayState {
  return { mode: 'idle', cart: null, payment: null, tip: null, thanks: null, ...overrides };
}

function down(extra: Record<string, unknown>): unknown {
  return { v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, ...extra };
}

// ---------------------------------------------------------------------------
// 1. Proyección del cobro QR (lado caja)
// ---------------------------------------------------------------------------

describe('resolveDisplayQr: del QR que ya genera el POS al bloque del protocolo', () => {
  it('qrImageUrl http(s) sin texto → imagen; con texto EMVCo → texto (ronda 5, QA-5: sin red la pantalla lo genera en local); expires_at ISO → ms de época', () => {
    const iso = new Date(NOW + 90_000).toISOString();
    expect(resolveDisplayQr({ imageUrl: IMAGE_URL, data: undefined, expiresAt: iso, now: NOW })).toEqual({
      qr: { kind: 'image', value: IMAGE_URL },
      expiresAt: NOW + 90_000,
    });
    // Hasta r4 aquí viajaba la imagen remota; si la pantalla no tenía red caía a las instrucciones.
    expect(resolveDisplayQr({ imageUrl: IMAGE_URL, data: EMVCO, expiresAt: iso, now: NOW })).toEqual({
      qr: { kind: 'text', value: EMVCO },
      expiresAt: NOW + 90_000,
    });
  });

  it('sin qrImageUrl pero qrData es una data URL de imagen → imagen (Bold/Bre-B devuelven qr_image en base64)', () => {
    expect(resolveDisplayQr({ data: DATA_URL, now: NOW })).toEqual({ qr: { kind: 'image', value: DATA_URL }, expiresAt: null });
  });

  it('solo texto EMVCo → texto (la pantalla lo convierte en QR con qrcode.react)', () => {
    expect(resolveDisplayQr({ imageUrl: '', data: `  ${EMVCO} `, now: NOW })).toEqual({ qr: { kind: 'text', value: EMVCO }, expiresAt: null });
  });

  it('vencido → qr null pero expiresAt conservado (la pantalla sabe que venció, no que falta)', () => {
    const r = resolveDisplayQr({ imageUrl: IMAGE_URL, expiresAt: NOW - 1, now: NOW });
    expect(r).toEqual({ qr: null, expiresAt: NOW - 1 });
  });

  it('sin imagen ni texto → qr null; expires_at inválido → expiresAt null', () => {
    expect(resolveDisplayQr({ imageUrl: null, data: undefined, expiresAt: 'ayer', now: NOW })).toEqual({ qr: null, expiresAt: null });
    expect(parseExpiresAt('')).toBeNull();
    expect(parseExpiresAt(Number.NaN)).toBeNull();
    expect(parseExpiresAt(NOW)).toBe(NOW);
  });

  it('isImageSource: data:image, http(s) y blob sí; texto EMVCo, data:text y vacío no', () => {
    expect(isImageSource(DATA_URL)).toBe(true);
    expect(isImageSource(IMAGE_URL)).toBe(true);
    expect(isImageSource('blob:https://caja/uuid')).toBe(true);
    expect(isImageSource(EMVCO)).toBe(false);
    expect(isImageSource('data:text/plain,hola')).toBe(false);
    expect(isImageSource('')).toBe(false);
    expect(isImageSource(42)).toBe(false);
  });

  it('base64 crudo de una imagen (Wompi SVG, Redeban PNG) → kind image con data URL; nunca kind text de miles de caracteres', () => {
    expect(resolveDisplayQr({ imageUrl: RAW_SVG_B64, data: RAW_SVG_B64, now: NOW }).qr).toEqual({ kind: 'image', value: `data:image/svg+xml;base64,${RAW_SVG_B64}` });
    expect(resolveDisplayQr({ data: RAW_PNG_B64, now: NOW }).qr).toEqual({ kind: 'image', value: DATA_URL });
    expect(normalizeQrImageSource(RAW_SVG_B64)).toBe(`data:image/svg+xml;base64,${RAW_SVG_B64}`);
    expect(normalizeQrImageSource(`  ${RAW_PNG_B64}\n`)).toBe(DATA_URL);
    expect(normalizeQrImageSource('/9j/4AAQSkZJRg==')).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(normalizeQrImageSource('R0lGODlhAQABAA==')).toBe('data:image/gif;base64,R0lGODlhAQABAA==');
    // Ya prefijado o blob: tal cual. Texto EMVCo, http(s), «casi base64» y vacío: no es imagen embebida.
    expect(normalizeQrImageSource(DATA_URL)).toBe(DATA_URL);
    expect(normalizeQrImageSource('blob:https://caja/uuid')).toBe('blob:https://caja/uuid');
    expect(normalizeQrImageSource(EMVCO)).toBeNull();
    expect(normalizeQrImageSource(IMAGE_URL)).toBeNull();
    expect(normalizeQrImageSource('PHN2Zy con espacios y ñ')).toBeNull();
    expect(normalizeQrImageSource('')).toBeNull();
    expect(normalizeQrImageSource(null)).toBeNull();
  });

  it('una URL http(s) en data (Bancolombia redirectURL, sin imageUrl) viaja como TEXTO: la pantalla genera un QR escaneable con ella', () => {
    expect(resolveDisplayQr({ imageUrl: undefined, data: REDIRECT_URL, now: NOW })).toEqual({ qr: { kind: 'text', value: REDIRECT_URL }, expiresAt: null });
    // En imageUrl una URL http(s) sin texto sigue siendo imagen (qr_image_url remota)...
    expect(resolveDisplayQr({ imageUrl: IMAGE_URL, data: undefined, now: NOW }).qr).toEqual({ kind: 'image', value: IMAGE_URL });
    // ...pero con un texto válido al lado viaja el texto (ronda 5, QA-5): la pantalla no depende de la red.
    expect(resolveDisplayQr({ imageUrl: IMAGE_URL, data: REDIRECT_URL, now: NOW }).qr).toEqual({ kind: 'text', value: REDIRECT_URL });
  });

  it('qrTextFits: cuenta caracteres y bytes UTF-8 contra el mismo límite', () => {
    expect(qrTextFits(EMVCO)).toBe(true);
    expect(qrTextFits('x'.repeat(QR_TEXT_MAX_CHARS))).toBe(true);
    expect(qrTextFits('x'.repeat(QR_TEXT_MAX_CHARS + 1))).toBe(false);
    expect(qrTextFits('ñ'.repeat(1000))).toBe(true); // 2 000 bytes
    expect(qrTextFits('ñ'.repeat(1001))).toBe(false); // 2 002 bytes
    expect(qrTextFits('😀'.repeat(500))).toBe(true); // 2 000 bytes
    expect(qrTextFits('😀'.repeat(501))).toBe(false);
    expect(qrTextFits('')).toBe(false);
    expect(qrTextFits(42)).toBe(false);
    expect(resolveDisplayQr({ data: 'ñ'.repeat(1500), now: NOW }).qr).toBeNull();
    // Por qué bytes: 1 500 «ñ» son ≤ 2 000 chars pero 3 000 bytes y QRCodeSVG lanza igual.
    expect(() => renderToStaticMarkup(React.createElement(QRCodeSVG, { value: 'ñ'.repeat(1500), level: 'M' }))).toThrow('Data too long');
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: 'ñ'.repeat(1500) }, expiresAt: null }), { now: NOW, online: true })).toMatchObject({ kind: 'fallback' });
  });

  it(`un texto más largo que QR_TEXT_MAX_CHARS (${QR_TEXT_MAX_CHARS}) no cabe en un QR y no viaja (qr null); en el límite sí`, () => {
    expect(resolveDisplayQr({ data: 'x'.repeat(2400), now: NOW })).toEqual({ qr: null, expiresAt: null });
    expect(resolveDisplayQr({ data: 'x'.repeat(20_000), expiresAt: NOW + 60_000, now: NOW })).toEqual({ qr: null, expiresAt: NOW + 60_000 });
    expect(resolveDisplayQr({ data: 'x'.repeat(QR_TEXT_MAX_CHARS), now: NOW }).qr).toEqual({ kind: 'text', value: 'x'.repeat(QR_TEXT_MAX_CHARS) });
    // Con imagen válida el texto largo no importa: viaja la imagen.
    expect(resolveDisplayQr({ imageUrl: DATA_URL, data: 'x'.repeat(20_000), now: NOW }).qr).toEqual({ kind: 'image', value: DATA_URL });
  });
});

describe('pickQrFromProviderResponse: del objeto qr de cada proveedor a qrData / qrImageUrl del modal de cobro', () => {
  it('Bre-B (Mono): `qr` es el texto EMVCo; `qr_image` opcional', () => {
    expect(pickQrFromProviderResponse({ id: 'c1', qr: EMVCO, expires_at: '2026-09-21T10:00:00Z' })).toEqual({ data: EMVCO, imageUrl: undefined });
    expect(pickQrFromProviderResponse({ qr: EMVCO, qr_image: DATA_URL })).toEqual({ data: EMVCO, imageUrl: DATA_URL });
  });

  it('Redeban: `qr_string` texto y `qr_image_base64` PNG crudo → imagen prefijada', () => {
    expect(pickQrFromProviderResponse({ qr_string: EMVCO, qr_image_base64: RAW_PNG_B64 })).toEqual({ data: EMVCO, imageUrl: DATA_URL });
    expect(pickQrFromProviderResponse({ qr_string: EMVCO })).toEqual({ data: EMVCO, imageUrl: undefined });
  });

  it('Wompi: `qr_image` (SVG crudo o ya data URL) → imagen; sin texto, qrData lleva la misma imagen (el modal pinta <img>)', () => {
    const svg = `data:image/svg+xml;base64,${RAW_SVG_B64}`;
    expect(pickQrFromProviderResponse({ qr_image: RAW_SVG_B64 })).toEqual({ data: svg, imageUrl: svg });
    expect(pickQrFromProviderResponse({ qr_image: svg })).toEqual({ data: svg, imageUrl: svg });
    expect(pickQrFromProviderResponse({ qr_image: IMAGE_URL })).toEqual({ data: IMAGE_URL, imageUrl: IMAGE_URL });
  });

  it('Bancolombia directo: solo `redirectURL` → texto, sin imagen', () => {
    expect(pickQrFromProviderResponse({ transferCode: 'T1', redirectURL: REDIRECT_URL })).toEqual({ data: REDIRECT_URL, imageUrl: undefined });
  });

  it('sin objeto qr (Bold), null, o campos vacíos → ambos undefined; nunca lanza', () => {
    expect(pickQrFromProviderResponse(undefined)).toEqual({ data: undefined, imageUrl: undefined });
    expect(pickQrFromProviderResponse(null)).toEqual({ data: undefined, imageUrl: undefined });
    expect(pickQrFromProviderResponse('texto')).toEqual({ data: undefined, imageUrl: undefined });
    expect(pickQrFromProviderResponse({ qr: '  ', qr_image: '', redirectURL: null })).toEqual({ data: undefined, imageUrl: undefined });
  });
});

describe('toDisplayPayment con QR (Fase 2)', () => {
  it('método QR + qr resuelto → viaja el código, el vencimiento y el nombre del medio', () => {
    const p = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B (Mono)', total: 25_000, qr: { kind: 'image', value: IMAGE_URL }, expiresAt: NOW + 60_000 });
    expect(p).toEqual({ method: 'qr', total: 25_000, provider: 'Bre-B (Mono)', qr: { kind: 'image', value: IMAGE_URL }, expiresAt: NOW + 60_000 });
  });

  it('método QR sin código (interruptor «Mostrar en pantalla» apagado) → qr null, expiresAt null: como en la Fase 0', () => {
    expect(toDisplayPayment({ methodCode: 'nequi', methodName: null, total: 1000 })).toEqual({ method: 'qr', total: 1000, provider: 'nequi', qr: null, expiresAt: null });
    expect(toDisplayPayment({ methodCode: 'nequi', methodName: null, total: 1000, qr: null, expiresAt: null })).toMatchObject({ qr: null, expiresAt: null });
  });

  it('un objeto qr malformado nunca viaja: kind raro o value vacío → null', () => {
    expect(toDisplayPayment({ methodCode: 'bold_qr', methodName: 'Bold', total: 1, qr: { kind: 'svg', value: 'x' } as unknown as { kind: 'text'; value: string } })).toMatchObject({ qr: null });
    expect(toDisplayPayment({ methodCode: 'bold_qr', methodName: 'Bold', total: 1, qr: { kind: 'text', value: '' } })).toMatchObject({ qr: null });
  });

  it('expiresAt NaN/Infinity → null (nunca 0 = «vencido en 1970»); un número finito viaja tal cual', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const p = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 100, qr: { kind: 'text', value: EMVCO }, expiresAt: bad });
      expect(p).toMatchObject({ method: 'qr', expiresAt: null, qr: { kind: 'text', value: EMVCO } });
      expect(resolveQrPresentation(p as Extract<DisplayPayment, { method: 'qr' }>, { now: NOW, online: true })).toMatchObject({ kind: 'text', expired: false, remainingMs: null });
    }
    expect(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 100, expiresAt: NOW + 5 })).toMatchObject({ expiresAt: NOW + 5 });
  });

  it('en efectivo y tarjeta el qr se ignora (no cambia la forma de esos estados)', () => {
    expect(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 1000, qr: { kind: 'text', value: 'x' } })).toEqual({ method: 'cash', total: 1000, received: null, change: null });
    expect(toDisplayPayment({ methodCode: 'bold_card', methodName: 'Bold', total: 1000, qr: { kind: 'text', value: 'x' } })).toEqual({ method: 'card', total: 1000, provider: 'Bold' });
  });
});

// ---------------------------------------------------------------------------
// 2. Guard del protocolo
// ---------------------------------------------------------------------------

describe('protocolo: cobro QR con qr null o vencido, y qr_paid_claim', () => {
  it('state con payment.qr null pasa el guard de forma (la pantalla degrada a las instrucciones)', () => {
    const msg = down({ t: 'state', state: state({ mode: 'payment', payment: qrPayment({ qr: null, expiresAt: null }) }) });
    expect(isDownMessage(msg)).toBe(true);
  });

  it('state con expiresAt ya pasado pasa el guard: vencer es contenido, no forma; el saneado lo conserva', () => {
    const payment = qrPayment({ expiresAt: NOW - 5_000 });
    expect(isDownMessage(down({ t: 'state', state: state({ mode: 'payment', payment }) }))).toBe(true);
    expect(sanitizeDisplayPayment(payment)).toEqual(payment);
    // La vista sigue siendo Cobro·QR: es la vista quien muestra «venció» en vez del código.
    expect(resolveView({ connected: true, updateRequired: false, state: state({ mode: 'payment', payment }) })).toBe('payment_qr');
  });

  it('saneado: qr con value vacío o expiresAt no finito → se conserva la forma con null, nunca un código roto', () => {
    const p = sanitizeDisplayPayment({ method: 'qr', total: 1, provider: 'X', qr: { kind: 'image', value: IMAGE_URL }, expiresAt: 'mañana' });
    expect(p).toEqual({ method: 'qr', total: 1, provider: 'X', qr: { kind: 'image', value: IMAGE_URL }, expiresAt: null });
  });

  it('qr_paid_claim: válido con cartId no vacío; rechazado sin cartId, con cartId vacío o de otra versión', () => {
    const base = { v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim' };
    expect(isUpMessage({ ...base, cartId: 'carrito-1' })).toBe(true);
    expect(isUpMessage({ ...base, cartId: 'carrito-1', toInstanceId: INSTANCE })).toBe(true);
    expect(isUpMessage({ ...base, cartId: '' })).toBe(false);
    expect(isUpMessage({ ...base })).toBe(false);
    expect(isUpMessage({ ...base, cartId: 'carrito-1', v: 2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Qué pinta la pantalla
// ---------------------------------------------------------------------------

describe('resolveQrPresentation: nunca un código roto (PLAN §3.5)', () => {
  const online = { now: NOW, online: true };

  it('imagen con red → image, con cuenta atrás', () => {
    expect(resolveQrPresentation(qrPayment(), online)).toEqual({ kind: 'image', value: IMAGE_URL, remainingMs: 60_000, expired: false });
  });

  it('texto → text (qrcode.react); sin vencimiento no hay cuenta atrás', () => {
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: EMVCO }, expiresAt: null }), online)).toEqual({ kind: 'text', value: EMVCO, remainingMs: null, expired: false });
  });

  it('sin qr → fallback («Pago con QR: siga las instrucciones del cajero»)', () => {
    expect(resolveQrPresentation(qrPayment({ qr: null }), online)).toMatchObject({ kind: 'fallback', value: null, expired: false });
  });

  it('vencido → fallback con expired=true y sin cuenta atrás', () => {
    expect(resolveQrPresentation(qrPayment({ expiresAt: NOW }), online)).toEqual({ kind: 'fallback', value: null, remainingMs: null, expired: true });
  });

  it('sin red: la imagen remota cae a fallback; una data URL no necesita red y se pinta', () => {
    expect(resolveQrPresentation(qrPayment(), { now: NOW, online: false })).toMatchObject({ kind: 'fallback' });
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'image', value: DATA_URL } }), { now: NOW, online: false })).toMatchObject({ kind: 'image', value: DATA_URL });
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: EMVCO } }), { now: NOW, online: false })).toMatchObject({ kind: 'text' });
  });

  it('la imagen falló al cargar (onError) → fallback', () => {
    expect(resolveQrPresentation(qrPayment(), { ...online, imageFailed: true })).toMatchObject({ kind: 'fallback', expired: false });
  });

  it('texto más largo que QR_TEXT_MAX_CHARS (2 400 y 20 000 chars) → fallback: QRCodeSVG lanzaría «Data too long»; en el límite se pinta', () => {
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: 'x'.repeat(2400) }, expiresAt: null }), online)).toEqual({ kind: 'fallback', value: null, remainingMs: null, expired: false });
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: 'x'.repeat(20_000) } }), online)).toMatchObject({ kind: 'fallback', expired: false, remainingMs: 60_000 });
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'text', value: 'x'.repeat(QR_TEXT_MAX_CHARS) }, expiresAt: null }), online)).toMatchObject({ kind: 'text' });
    // Evidencia del límite: la librería instalada lanza con 2 400 chars y no con un EMVCo ni con el límite.
    expect(() => renderToStaticMarkup(React.createElement(QRCodeSVG, { value: 'x'.repeat(2400), level: 'M' }))).toThrow('Data too long');
    expect(() => renderToStaticMarkup(React.createElement(QRCodeSVG, { value: 'x'.repeat(QR_TEXT_MAX_CHARS), level: 'M' }))).not.toThrow();
  });

  it('una imagen larga (SVG en data URL de 20 KB) no está sujeta al límite del texto', () => {
    const big = `data:image/svg+xml;base64,${'A'.repeat(20_000)}`;
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'image', value: big } }), online)).toMatchObject({ kind: 'image', value: big });
  });

  it('value vacío o kind desconocido → fallback', () => {
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'image', value: '   ' } }), online)).toMatchObject({ kind: 'fallback' });
    expect(resolveQrPresentation(qrPayment({ qr: { kind: 'svg', value: 'x' } as unknown as { kind: 'text'; value: string } }), online)).toMatchObject({ kind: 'fallback' });
  });

  it('formatCountdown: mm:ss; negativos y NaN → 00:00', () => {
    expect(formatCountdown(60_000)).toBe('01:00');
    expect(formatCountdown(59_999)).toBe('00:59');
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(-5)).toBe('00:00');
    expect(formatCountdown(Number.NaN)).toBe('00:00');
    expect(formatCountdown(3_600_000)).toBe('60:00');
  });
});

describe('resolveTouch (PLAN §4.4): detección + forzado', () => {
  it('auto o desconocido → lo que detectó el navegador; touch/no-touch fuerzan', () => {
    expect(resolveTouch(true, 'auto')).toBe(true);
    expect(resolveTouch(false, 'auto')).toBe(false);
    expect(resolveTouch(false, undefined)).toBe(false);
    expect(resolveTouch(true, 'raro')).toBe(true);
    expect(resolveTouch(false, 'touch')).toBe(true);
    expect(resolveTouch(true, 'no-touch')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. El emisor no cambia con qr_paid_claim
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
  emitUp(msg: UpMessage): void {
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
}

/**
 * Planificador manual (el mismo de tip-f2b.test.ts): `schedule` encola y
 * `flush` ejecuta lo encolado. NO se usa un planificador síncrono: el emisor
 * hace `this.pendingFlush = this.schedule(fn)`, y si `fn` corre ANTES de la
 * asignación, `pendingFlush` se queda con la cancelación del primer flush y
 * el emisor no vuelve a publicar nunca (la aserción «emittedStateCount no
 * cambia» sería vacua). Con cola explícita, `queued === null` tras un flush
 * significa «no hay publicación pendiente» de verdad.
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
    get pending(): boolean {
      return queued !== null;
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

describe('emisor: qr_paid_claim solo avisa (PLAN §8 «solo avisa; no confirma nada»)', () => {
  function setup() {
    const sched = manualScheduler();
    const transport = new FakeTransport();
    const emitter = new DisplayEmitter({ createTransport: () => transport, isEnabled: () => true, schedule: sched.schedule });
    emitter.start(START);
    emitter.setCart(cart());
    emitter.setPayment(qrPayment());
    sched.flush();
    return { transport, emitter, sched };
  }

  it('el planificador manual sí deja publicar varias veces (la aserción «no cambia» de abajo no es vacua)', () => {
    const { emitter, sched } = setup();
    const count = emitter.emittedStateCount;
    emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: null, total: 5000 }));
    expect(sched.pending).toBe(true);
    sched.flush();
    expect(emitter.emittedStateCount).toBe(count + 1);
    expect(sched.pending).toBe(false);
  });

  it('llega a los oyentes de onUp con el cartId; el estado, la cola y el contador de emisiones no cambian', () => {
    const { transport, emitter, sched } = setup();
    const before = emitter.getState();
    const count = emitter.emittedStateCount;
    const published = transport.published.length;
    const heard: UpMessage[] = [];
    const off = emitter.onUp((msg) => heard.push(msg));

    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'carrito-1' });

    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ t: 'qr_paid_claim', cartId: 'carrito-1' });
    // Nada encolado tras el claim: el emisor ni siquiera PIDIÓ publicar.
    expect(sched.pending).toBe(false);
    sched.flush();
    expect(emitter.getState()).toEqual(before);
    expect(emitter.getState().payment).toEqual(qrPayment());
    expect(emitter.getState().mode).toBe('payment');
    expect(emitter.emittedStateCount).toBe(count);
    expect(transport.published.length).toBe(published);
    off();
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'carrito-1' });
    expect(heard).toHaveLength(1);
  });

  it('need_snapshot y la presencia no se reenvían a los oyentes; need_snapshot sigue respondiendo hello+state', () => {
    const { transport, emitter } = setup();
    const heard: UpMessage[] = [];
    emitter.onUp((msg) => heard.push(msg));
    const published = transport.published.length;
    const caps = { touch: true, width: 1024, height: 768 };
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'need_snapshot', capabilities: caps });
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_alive', at: NOW, capabilities: caps });
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'display_bye' });
    expect(heard).toHaveLength(0);
    expect(transport.published.slice(published).map((m) => m.t)).toEqual(['hello', 'state']);
  });

  it('un oyente que lanza no rompe al resto ni al emisor', () => {
    const { transport, emitter } = setup();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const heard: string[] = [];
    emitter.onUp(() => {
      throw new Error('boom');
    });
    emitter.onUp((msg) => heard.push(msg.t));
    expect(() => transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'carrito-1' })).not.toThrow();
    expect(heard).toEqual(['qr_paid_claim']);
    expect(emitter.getState().mode).toBe('payment');
    warn.mockRestore();
  });

  it('el oyente sobrevive a stop()/start(): se registra una vez por componente', () => {
    const { transport, emitter } = setup();
    const heard: string[] = [];
    emitter.onUp((msg) => heard.push(msg.t));
    emitter.stop();
    emitter.start({ organizationId: 120, currency: 'COP' });
    transport.emitUp({ v: PROTOCOL_VERSION, terminalId: TERMINAL, t: 'qr_paid_claim', cartId: 'carrito-1' });
    expect(heard).toEqual(['qr_paid_claim']);
  });
});

// ---------------------------------------------------------------------------
// 4-bis. Propinas activadas: el QR con código se impone a la pregunta de propina
// ---------------------------------------------------------------------------

describe('emisor con tips.enabled: un cobro QR CON código se pinta aunque la fase de propina siga pendiente', () => {
  function harness(tips: DisplayPresentationSettings['tips'] = settings().tips) {
    const sched = manualScheduler();
    const transport = new FakeTransport();
    const emitter = new DisplayEmitter({ createTransport: () => transport, isEnabled: () => true, schedule: sched.schedule, getSettings: () => settings({ tips }) });
    emitter.start(START);
    emitter.setCart(cart());
    sched.flush();
    return { transport, emitter, sched };
  }

  function lastState(transport: FakeTransport): DisplayState {
    return (transport.published.filter((m) => m.t === 'state').pop() as { state: DisplayState }).state;
  }

  it('setPayment(QR con código) con la fase pendiente → mode payment y la pantalla pinta payment_qr; la fase NO se cierra', () => {
    const { transport, emitter, sched } = harness();
    emitter.setPayment(qrPayment({ qr: { kind: 'text', value: EMVCO } }));
    expect(emitter.tipPhase).toBe('pending');
    const s = emitter.getState();
    expect(s.mode).toBe('payment');
    expect(s.payment).toEqual(qrPayment({ qr: { kind: 'text', value: EMVCO } }));
    expect(s.tip).toBeNull();
    expect(resolveView({ connected: true, updateRequired: false, state: sanitizeDisplayState(s) })).toBe('payment_qr');
    sched.flush();
    expect(lastState(transport).mode).toBe('payment');
  });

  it('un cobro QR SIN código (interruptor «Mostrar en pantalla» apagado) no se impone: sigue la pregunta de propina', () => {
    const { emitter } = harness();
    emitter.setPayment(qrPayment({ qr: null, expiresAt: null }));
    expect(emitter.getState().mode).toBe('tip');
    expect(resolveView({ connected: true, updateRequired: false, state: sanitizeDisplayState(emitter.getState()) })).toBe('tip');
  });

  it('efectivo y tarjeta tampoco se imponen (la regla es solo para el QR con código)', () => {
    const { emitter } = harness();
    emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: null, total: 5000 }));
    expect(emitter.getState().mode).toBe('tip');
    emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: null, total: 5000 }));
    expect(emitter.getState().mode).toBe('tip');
  });

  it('cambiar de tarjeta a QR con código muestra el QR; apagar el interruptor (qr y expiresAt null) vuelve a la propina; skipTip() la cierra del todo', () => {
    const { emitter } = harness();
    emitter.setPayment(toDisplayPayment({ methodCode: 'card', methodName: null, total: 5000 }));
    expect(emitter.getState().mode).toBe('tip');
    emitter.setPayment(qrPayment());
    expect(emitter.getState().mode).toBe('payment');
    // Ronda 3: qr null con expiresAt numérico es un QR VENCIDO y sigue en cobro (ver qr-payment-f2c-r3.test.ts).
    emitter.setPayment(qrPayment({ qr: null }));
    expect(emitter.getState().mode).toBe('payment');
    emitter.setPayment(qrPayment({ qr: null, expiresAt: null }));
    expect(emitter.getState().mode).toBe('tip');
    emitter.skipTip();
    expect(emitter.tipPhase).toBe('done');
    expect(emitter.getState().mode).toBe('payment');
  });

  it('con la propina desactivada el comportamiento es el de siempre: QR con o sin código → payment', () => {
    const { emitter } = harness({ enabled: false, presets: [], allowCustom: false });
    emitter.setPayment(qrPayment({ qr: null }));
    expect(emitter.tipPhase).toBeNull();
    expect(emitter.getState().mode).toBe('payment');
  });

  it('closed y thanks siguen por encima del QR con código', () => {
    const { emitter } = harness();
    emitter.setPayment(qrPayment());
    emitter.setMode('thanks', { total: 5000 });
    expect(emitter.getState().mode).toBe('thanks');
  });
});

// ---------------------------------------------------------------------------
// 5. DisplayLink.send: solo con caja conectada
// ---------------------------------------------------------------------------

class FakeReceiver implements DisplayReceiver {
  sent: UpMessageDraft[] = [];
  private downHandlers = new Set<(msg: import('@/lib/pos/display/protocol').DownMessage) => void>();
  activeInstanceId: string | null = null;
  lastSeq = -1;
  lastReceivedAt: number | null = null;
  lastByeAt: number | null = null;
  lastStaleAt: number | null = null;
  incompatibleVersionAt: number | null = null;
  incompatibleVersionCount = 0;
  send(msg: UpMessageDraft): void {
    this.sent.push(msg);
  }
  onDown(handler: (msg: import('@/lib/pos/display/protocol').DownMessage) => void): () => void {
    this.downHandlers.add(handler);
    return () => {
      this.downHandlers.delete(handler);
    };
  }
  releaseActiveInstance(): void {
    this.activeInstanceId = null;
  }
  startPresence(): void {}
  stopPresence(): void {}
  close(): void {}
  /** Simula un `state` aceptado por el receptor de la Parte A (marca el reloj y entrega). */
  deliverState(s: DisplayState, at: number): void {
    this.lastReceivedAt = at;
    this.activeInstanceId = INSTANCE;
    for (const h of Array.from(this.downHandlers)) h({ v: PROTOCOL_VERSION, seq: 1, terminalId: TERMINAL, instanceId: INSTANCE, t: 'state', state: s });
  }
}

describe('DisplayLink.send (Fase 2): las intenciones solo salen con caja conectada', () => {
  it('sin caja se descarta; con state aceptado se reenvía al receptor; tras stop() no sale nada', () => {
    let clock = NOW;
    const receiver = new FakeReceiver();
    const link = startDisplayLink({ receiver, capabilities: () => ({ touch: true, width: 1, height: 1 }), onChange: () => undefined, now: () => clock });
    const claim: UpMessageDraft = { t: 'qr_paid_claim', cartId: 'carrito-1' };

    link.send(claim);
    expect(receiver.sent.filter((m) => m.t === 'qr_paid_claim')).toHaveLength(0);

    clock += 10;
    receiver.deliverState(state({ mode: 'payment', payment: qrPayment() }), clock);
    expect(link.snapshot.connected).toBe(true);
    link.send(claim);
    expect(receiver.sent.filter((m) => m.t === 'qr_paid_claim')).toEqual([claim]);

    link.stop();
    link.send(claim);
    expect(receiver.sent.filter((m) => m.t === 'qr_paid_claim')).toHaveLength(1);
  });
});
