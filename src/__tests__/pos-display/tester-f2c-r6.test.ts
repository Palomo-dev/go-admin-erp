/**
 * Tester · Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 6.
 *
 * Rompe lo que la ronda 6 del builder dio por corregido (P, Q, R y el orden
 * «embebido gana a remoto») desde ángulos que las rondas anteriores no
 * cubren. Los `it` afirman el comportamiento CORRECTO: si alguno falla, es
 * un hallazgo de esta ronda.
 *
 * Ángulos nuevos:
 *  - Q por PROVEEDOR: el recorrido real `pickQrFromProviderResponse` →
 *    `resolveDisplayQr` con la forma exacta que devuelve cada route (Bre-B
 *    con y sin `qr`, Redeban, Wompi, Bancolombia directo, Bold), no solo
 *    `{imageUrl, data}` a mano. Un SVG en base64 CRUDO y corto (< 2 000
 *    caracteres, cabe como texto) sin `qr` es el caso que Q dejó sin cerrar:
 *    `data` recibe la data URL y, si se comparara mal, viajaría como texto.
 *  - P con dos confirmaciones (poller + webhook), con la propina aplicada
 *    ANTES de generar el QR y retirada después, y el cierre del flujo (el
 *    cajero cobra la propina en efectivo tras «Falta dinero»).
 *  - R: equivalencia exacta entre el corte del handler y el `disabled` del
 *    botón para importes negativos, NaN y total 0 (el builder dice que con
 *    total 0 el botón sigue habilitado: no es así, `0 >= 0` lo deshabilita).
 *  - Orden r6 «imagen embebida en data gana a imageUrl http» llevado hasta
 *    la pantalla (SSR real): se pinta `<img src="data:…">`, nunca `<svg>` ni
 *    la URL remota.
 *
 * Helpers copiados a propósito (un test no importa de otro). Organización
 * ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import {
  QR_TEXT_MAX_CHARS,
  isImageSource,
  normalizeQrImageSource,
  pickQrFromProviderResponse,
  resolveCashReceived,
  resolveDisplayQr,
  resolveQrChargeAmount,
  toDisplayPayment,
} from '@/lib/pos/display/payment';
import type { DisplayPayment } from '@/lib/pos/display/protocol';
import { applyTipToPrefilledPayment } from '@/components/pos/display/tipNotice';
import { resolveQrPresentation, sanitizeDisplayPayment } from '@/components/pos-display/logic';

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
const REDIRECT = 'https://pagos.example.test/checkout/abc123';
/** base64 estándar de un SVG pequeño: cabe como texto (< QR_TEXT_MAX_CHARS) → es el caso que Q dejó abierto. */
const SVG_B64 = 'PHN2Zy' + 'AB+/'.repeat(300); // 1 206 caracteres, cuerpo válido
const SVG_B64URL = 'PHN2Zy' + 'AB-_'.repeat(300);
const PNG_B64 = 'iVBORw0' + 'KGgo'.repeat(700); // 2 807 caracteres: NO cabe como texto
const CHECKOUT = readFileSync(join(SRC, 'components/pos/CheckoutDialog.tsx'), 'utf8');

interface Entry {
  id: string;
  method: string;
  amount: number;
}

/** Misma regla que onPaid de CheckoutDialog (r5 + r6): confirmar la entrada de origen (o añadir) y marcarla como TOCADA. */
function onPaidConfirm(prev: Entry[], qrEntryId: string | undefined, method: string, amount: number, touched: Set<string>): Entry[] {
  const exists = prev.some((p) => p.id === qrEntryId);
  const next = exists
    ? prev.map((p) => (p.id === qrEntryId ? { ...p, method, amount } : p))
    : [...prev, { id: 'nuevo', method, amount }];
  touched.add(exists && qrEntryId !== undefined ? qrEntryId : 'nuevo');
  return next;
}

/** Misma expresión que el botón «Generar QR de pago» (r6, HALLAZGO R). */
function othersCoverTotal(payments: Entry[], entryId: string, cartTotal: number): boolean {
  return payments.filter((p) => p.id !== entryId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0) >= cartTotal;
}

/** Misma expresión que el corte de handleQrPayment (r6, HALLAZGO R). */
function handlerCuts(payments: Entry[], entryId: string, cartTotal: number): boolean {
  const othersTotal = payments.filter((p) => p.id !== entryId).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return Math.max(0, cartTotal - othersTotal) <= 0;
}

// ---------------------------------------------------------------------------
// Q por proveedor: el recorrido real route → modal → pantalla
// ---------------------------------------------------------------------------

describe('Q por proveedor · pickQrFromProviderResponse → resolveDisplayQr con la forma exacta de cada route', () => {
  it('Bre-B con solo qr_image http (sin qr): viaja la IMAGEN, nunca su URL como texto', () => {
    const picked = pickQrFromProviderResponse({ qr_image: REMOTE_PNG });
    expect(picked).toEqual({ data: REMOTE_PNG, imageUrl: REMOTE_PNG });
    expect(resolveDisplayQr({ ...picked, now: NOW }).qr).toEqual({ kind: 'image', value: REMOTE_PNG });
  });

  it('Bre-B con qr EMVCo + qr_image http: viaja el TEXTO (QA-5) y la pantalla genera el QR sin red', () => {
    const picked = pickQrFromProviderResponse({ qr: EMVCO, qr_image: REMOTE_PNG });
    expect(resolveDisplayQr({ ...picked, now: NOW }).qr).toEqual({ kind: 'text', value: EMVCO });
  });

  it('Wompi con qr_image en base64 CRUDO de un SVG corto y sin qr: viaja la imagen embebida, NO la data URL como texto', () => {
    const picked = pickQrFromProviderResponse({ qr_image: SVG_B64 });
    // pickQr rellena data con la imagen normalizada: cabe como texto (< QR_TEXT_MAX_CHARS)…
    expect(picked.imageUrl).toBe(`data:image/svg+xml;base64,${SVG_B64}`);
    expect(picked.data).toBe(picked.imageUrl);
    expect((picked.data ?? '').length).toBeLessThan(QR_TEXT_MAX_CHARS);
    // …y aun así no viaja como texto: es la propia imagen.
    expect(resolveDisplayQr({ ...picked, now: NOW }).qr).toEqual({ kind: 'image', value: picked.imageUrl });
  });

  it('Wompi con qr_image en base64url corto (RFC 4648 §5): se convierte a estándar y viaja como imagen', () => {
    const picked = pickQrFromProviderResponse({ qr_image: SVG_B64URL });
    const resolved = resolveDisplayQr({ ...picked, now: NOW });
    expect(resolved.qr?.kind).toBe('image');
    expect(resolved.qr?.value).toMatch(/^data:image\/svg\+xml;base64,PHN2Zy[A-Za-z0-9+/]+=*$/);
    expect(resolved.qr?.value).not.toContain('-');
  });

  it('Wompi con qr_image ya como data URL: imagen tal cual', () => {
    const dataUrl = `data:image/svg+xml;base64,${SVG_B64}`;
    const picked = pickQrFromProviderResponse({ qr_image: dataUrl });
    expect(resolveDisplayQr({ ...picked, now: NOW }).qr).toEqual({ kind: 'image', value: dataUrl });
  });

  it('Redeban con qr_string EMVCo + qr_image_base64 PNG crudo: gana la imagen EMBEBIDA sobre el texto (no necesita red)', () => {
    const picked = pickQrFromProviderResponse({ qr_string: EMVCO, qr_image_base64: PNG_B64 });
    expect(picked.data).toBe(EMVCO);
    expect(resolveDisplayQr({ ...picked, now: NOW }).qr).toEqual({ kind: 'image', value: `data:image/png;base64,${PNG_B64}` });
  });

  it('Bancolombia directo con solo redirectURL: viaja como texto y la pantalla genera el QR con la URL', () => {
    const picked = pickQrFromProviderResponse({ redirectURL: REDIRECT });
    expect(picked).toEqual({ data: REDIRECT, imageUrl: undefined });
    expect(resolveDisplayQr({ ...picked, now: NOW }).qr).toEqual({ kind: 'text', value: REDIRECT });
  });

  it('proveedor que manda qr_image http Y qr con la MISMA URL: imagen (el texto es la propia imagen)', () => {
    const picked = pickQrFromProviderResponse({ qr: REMOTE_PNG, qr_image: REMOTE_PNG });
    expect(resolveDisplayQr({ ...picked, now: NOW }).qr).toEqual({ kind: 'image', value: REMOTE_PNG });
  });

  it('Bold (sin objeto qr) y respuestas vacías: qr null, la pantalla muestra las instrucciones', () => {
    for (const raw of [undefined, null, {}, 'texto', 42, { qr: '', qr_image: '   ' }]) {
      const picked = pickQrFromProviderResponse(raw);
      expect(picked).toEqual({ data: undefined, imageUrl: undefined });
      expect(resolveDisplayQr({ ...picked, now: NOW })).toEqual({ qr: null, expiresAt: null });
    }
  });
});

describe('Q · el texto «es la propia imagen» con variantes de forma', () => {
  it('imageUrl con espacios alrededor y data limpia (o al revés): imagen, no texto', () => {
    expect(resolveDisplayQr({ imageUrl: `  ${REMOTE_PNG}  `, data: REMOTE_PNG, now: NOW }).qr).toEqual({ kind: 'image', value: REMOTE_PNG });
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: `${REMOTE_PNG}\n`, now: NOW }).qr).toEqual({ kind: 'image', value: REMOTE_PNG });
  });

  it('imageUrl en base64 crudo CON saltos de línea y data con los mismos saltos: imagen normalizada, no texto', () => {
    const withBreaks = SVG_B64.replace(/(.{76})/g, '$1\n');
    const resolved = resolveDisplayQr({ imageUrl: withBreaks, data: withBreaks, now: NOW });
    expect(resolved.qr).toEqual({ kind: 'image', value: `data:image/svg+xml;base64,${SVG_B64}` });
  });

  it('imageUrl http y data = imagen embebida MÁS LARGA que QR_TEXT_MAX_CHARS: gana lo embebido (orden r6), no la remota', () => {
    const dataUrl = `data:image/png;base64,${PNG_B64}`;
    expect(dataUrl.length).toBeGreaterThan(QR_TEXT_MAX_CHARS);
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: dataUrl, now: NOW }).qr).toEqual({ kind: 'image', value: dataUrl });
  });

  it('imageUrl http y data = la misma URL pero vencido: qr null y expiresAt conservado', () => {
    const resolved = resolveDisplayQr({ imageUrl: REMOTE_PNG, data: REMOTE_PNG, expiresAt: NOW - 1, now: NOW });
    expect(resolved).toEqual({ qr: null, expiresAt: NOW - 1 });
  });

  it('imageUrl http y data = texto EMVCo con un vencimiento en ISO: texto + expiresAt en ms', () => {
    const iso = new Date(NOW + 5 * 60_000).toISOString();
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: EMVCO, expiresAt: iso, now: NOW })).toEqual({
      qr: { kind: 'text', value: EMVCO },
      expiresAt: NOW + 5 * 60_000,
    });
  });

  it('imageUrl http y data = URL http DISTINTA (redirectURL de Wompi junto a su qr_image): viaja la URL como texto (r5), consciente', () => {
    // Documenta la decisión: una redirectURL genera un QR de enlace, que sí paga. Una URL de OTRA imagen
    // no se puede distinguir de una de redirección sin pedir la cabecera; se acepta.
    expect(resolveDisplayQr({ imageUrl: REMOTE_PNG, data: REDIRECT, now: NOW }).qr).toEqual({ kind: 'text', value: REDIRECT });
  });

  it('isImageSource / normalizeQrImageSource no cambian de criterio con la ronda 6', () => {
    expect(isImageSource(REMOTE_PNG)).toBe(true);
    expect(isImageSource(REDIRECT)).toBe(true); // una URL http siempre «parece» imagen: por eso Q compara con la imagen y no con esto
    expect(normalizeQrImageSource(REMOTE_PNG)).toBeNull();
    expect(normalizeQrImageSource(SVG_B64)).toBe(`data:image/svg+xml;base64,${SVG_B64}`);
  });
});

// ---------------------------------------------------------------------------
// Orden r6 (embebido gana a remoto) llevado hasta la pantalla
// ---------------------------------------------------------------------------

describe('pantalla (SSR real) · lo que viaja con el orden r6 se pinta como <img data:…>, nunca como <svg> ni URL remota', () => {
  function qrPayment(input: { imageUrl?: string; data?: string }): Extract<DisplayPayment, { method: 'qr' }> {
    const resolved = resolveDisplayQr({ ...input, now: NOW });
    return toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B (Mono)', total: 25_000, qr: resolved.qr, expiresAt: resolved.expiresAt }) as Extract<
      DisplayPayment,
      { method: 'qr' }
    >;
  }

  it('Wompi SVG corto sin qr: <img src="data:image/svg+xml…"> y sin <svg> generado', () => {
    const html = renderQr(qrPayment(pickQrFromProviderResponse({ qr_image: SVG_B64 })));
    expect(html).toContain('data-qr-kind="image"');
    expect(html).toContain('src="data:image/svg+xml;base64,PHN2Zy');
    expect(html).not.toContain('<svg');
    expect(html).not.toContain(T.qrInstructions);
  });

  it('imageUrl http + data embebida: sin red se sigue pintando la embebida (no depende del <img> remoto)', () => {
    const payment = qrPayment({ imageUrl: REMOTE_PNG, data: `data:image/png;base64,${PNG_B64}` });
    const offline = resolveQrPresentation(payment, { now: NOW, online: false });
    expect(offline.kind).toBe('image');
    expect(offline.value).toMatch(/^data:image\/png;base64,/);
    expect(renderQr(payment)).not.toContain(REMOTE_PNG);
  });

  it('solo imagen remota (Bre-B sin qr) y sin red: instrucciones, y con red la imagen; el saneado de la pantalla conserva la forma', () => {
    const payment = qrPayment(pickQrFromProviderResponse({ qr_image: REMOTE_PNG }));
    expect(sanitizeDisplayPayment(payment)).toEqual(payment);
    expect(resolveQrPresentation(payment, { now: NOW, online: false }).kind).toBe('fallback');
    expect(resolveQrPresentation(payment, { now: NOW, online: true })).toEqual({ kind: 'image', value: REMOTE_PNG, remainingMs: null, expired: false });
  });
});

// ---------------------------------------------------------------------------
// P: la entrada QR confirmada es intocable, también en los caminos raros
// ---------------------------------------------------------------------------

describe('P · la entrada QR confirmada por onPaid queda intocable en todos los caminos', () => {
  const TOTAL = 25_000;
  const TIP = 2_500;

  it('dos confirmaciones (poller y webhook) sobre la misma entrada: idempotente, una sola entrada, un solo id tocado', () => {
    const touched = new Set<string>();
    let payments: Entry[] = [{ id: 'e1', method: 'breb_qr', amount: TOTAL }];
    payments = onPaidConfirm(payments, 'e1', 'breb_qr', TOTAL, touched);
    payments = onPaidConfirm(payments, 'e1', 'breb_qr', TOTAL, touched);
    expect(payments).toEqual([{ id: 'e1', method: 'breb_qr', amount: TOTAL }]);
    expect(Array.from(touched)).toEqual(['e1']);
    expect(payments.reduce((s, p) => s + p.amount, 0)).toBe(TOTAL);
  });

  it('propina aplicada ANTES de generar el QR (27.500 cobrados) y retirada después: la entrada no baja; el modal muestra cambio 2.500 (la verdad: el proveedor cobró 27.500)', () => {
    const touched = new Set<string>();
    let payments: Entry[] = [{ id: 'e1', method: 'breb_qr', amount: TOTAL }];
    // «Aplicar»/botón 10 %: la única entrada pre-rellenada sigue al total.
    payments = applyTipToPrefilledPayment(payments, touched, TOTAL + TIP);
    expect(payments[0].amount).toBe(TOTAL + TIP);
    const amount = resolveQrChargeAmount({ entryAmount: payments[0].amount, othersTotal: 0, total: TOTAL + TIP });
    expect(amount).toBe(TOTAL + TIP);
    payments = onPaidConfirm(payments, 'e1', 'breb_qr', amount, touched);
    // El cajero deselecciona la propina: followTipOnPrefilledPayment(0) → total 25.000.
    const after = applyTipToPrefilledPayment(payments, touched, TOTAL);
    expect(after).toBe(payments);
    expect(after[0].amount).toBe(TOTAL + TIP);
    const totalPaid = after.reduce((s, p) => s + p.amount, 0);
    expect(Math.max(0, totalPaid - TOTAL)).toBe(TIP); // «Cambio 2.500»: el sobrante existe de verdad
  });

  it('cierre del flujo: elección en pantalla → QR sin aplicar → onPaid → «Aplicar» → Falta 2.500 → efectivo 3.000 tecleado → recibido 3.000 y cambio 500', () => {
    const touched = new Set<string>();
    let payments: Entry[] = [{ id: 'e1', method: 'breb_qr', amount: TOTAL }];
    payments = onPaidConfirm(payments, 'e1', 'breb_qr', TOTAL, touched);
    payments = applyTipToPrefilledPayment(payments, touched, TOTAL + TIP);
    const cartTotal = TOTAL + TIP;
    let remaining = Math.max(0, cartTotal - payments.reduce((s, p) => s + p.amount, 0));
    expect(remaining).toBe(TIP);
    // «Agregar pago»: nueva entrada en efectivo pre-rellenada con lo que falta, sin tocar.
    payments = [...payments, { id: 'e2', method: 'cash', amount: remaining }];
    expect(resolveCashReceived(payments, touched)).toBeNull(); // nadie ha entregado nada aún
    // El cajero teclea 3.000: solo esa entrada cuenta como recibido.
    touched.add('e2');
    payments = payments.map((p) => (p.id === 'e2' ? { ...p, amount: 3_000 } : p));
    expect(resolveCashReceived(payments, touched)).toBe(3_000);
    remaining = Math.max(0, cartTotal - payments.reduce((s, p) => s + p.amount, 0));
    expect(remaining).toBe(0);
    expect(Math.max(0, payments.reduce((s, p) => s + p.amount, 0) - cartTotal)).toBe(500);
    // Y la entrada QR sigue en lo que cobró el proveedor.
    expect(payments.find((p) => p.id === 'e1')).toEqual({ id: 'e1', method: 'breb_qr', amount: TOTAL });
  });

  it('entrada de origen retirada antes de la confirmación: se añade una de respaldo y ES esa la que queda tocada', () => {
    const touched = new Set<string>();
    let payments: Entry[] = [{ id: 'e9', method: 'cash', amount: 0 }];
    payments = onPaidConfirm(payments, 'e1', 'breb_qr', TOTAL, touched);
    expect(payments).toHaveLength(2);
    expect(touched.has('nuevo')).toBe(true);
    expect(touched.has('e1')).toBe(false);
    // Con dos entradas applyTipToPrefilledPayment no toca nada (pago mixto).
    expect(applyTipToPrefilledPayment(payments, touched, TOTAL + TIP)).toBe(payments);
  });

  it('CheckoutDialog (estático): onPaid marca con setTouchedIds la entrada de origen si existe, si no la añadida; y updatePayment sigue marcando solo el importe', () => {
    const onPaid = CHECKOUT.slice(CHECKOUT.indexOf('onPaid={() => {'), CHECKOUT.indexOf('<SerialSelectorDialog'));
    expect(onPaid.length).toBeGreaterThan(0);
    expect(onPaid).toMatch(/const confirmedQrEntryId = qrEntryId !== undefined && payments\.some\(p => p\.id === qrEntryId\) \? qrEntryId : newPayment\.id;/);
    expect(onPaid).toMatch(/setTouchedIds\(prev => \(prev\.has\(confirmedQrEntryId\) \? prev : new Set\(prev\)\.add\(confirmedQrEntryId\)\)\);/);
    expect(onPaid.indexOf('setPayments(')).toBeLessThan(onPaid.indexOf('setTouchedIds('));
    expect(CHECKOUT).toMatch(/if \(field === 'amount'\) setTouchedIds\(\(prev\) => \(prev\.has\(id\) \? prev : new Set\(prev\)\.add\(id\)\)\);/);
  });
});

// ---------------------------------------------------------------------------
// R: el corte del handler y el disabled del botón son la misma regla
// ---------------------------------------------------------------------------

describe('R · corte de handleQrPayment ≡ disabled del botón, con importes raros', () => {
  const cases: Array<{ name: string; payments: Entry[]; entry: string; total: number; cut: boolean }> = [
    { name: 'efectivo 25.000 + QR 0 sobre 25.000', payments: [{ id: 'c', method: 'cash', amount: 25_000 }, { id: 'q', method: 'breb_qr', amount: 0 }], entry: 'q', total: 25_000, cut: true },
    { name: 'efectivo 15.000 + QR 10.000 sobre 25.000', payments: [{ id: 'c', method: 'cash', amount: 15_000 }, { id: 'q', method: 'breb_qr', amount: 10_000 }], entry: 'q', total: 25_000, cut: false },
    { name: 'efectivo NEGATIVO (-5.000 tecleado) + QR', payments: [{ id: 'c', method: 'cash', amount: -5_000 }, { id: 'q', method: 'breb_qr', amount: 30_000 }], entry: 'q', total: 25_000, cut: false },
    { name: 'efectivo NaN (input vacío) + QR', payments: [{ id: 'c', method: 'cash', amount: Number.NaN }, { id: 'q', method: 'breb_qr', amount: 25_000 }], entry: 'q', total: 25_000, cut: false },
    { name: 'una sola entrada QR con total 0 (cortesía)', payments: [{ id: 'q', method: 'breb_qr', amount: 0 }], entry: 'q', total: 0, cut: true },
    { name: 'efectivo 25.000,01 sobre 25.000 (sobra)', payments: [{ id: 'c', method: 'cash', amount: 25_000.01 }, { id: 'q', method: 'breb_qr', amount: 0 }], entry: 'q', total: 25_000, cut: true },
    { name: 'efectivo 24.999,99 sobre 25.000 (falta 1 centavo)', payments: [{ id: 'c', method: 'cash', amount: 24_999.99 }, { id: 'q', method: 'breb_qr', amount: 0.01 }], entry: 'q', total: 25_000, cut: false },
  ];

  it.each(cases)('$name → corta=$cut y el botón coincide', ({ payments, entry, total, cut }) => {
    expect(handlerCuts(payments, entry, total)).toBe(cut);
    expect(othersCoverTotal(payments, entry, total)).toBe(cut);
  });

  it('con total 0 el botón queda DESHABILITADO (0 ≥ 0): el pendiente del builder («sigue habilitado») no describe el código', () => {
    expect(othersCoverTotal([{ id: 'q', method: 'breb_qr', amount: 0 }], 'q', 0)).toBe(true);
  });

  it('cuando no corta, el importe del QR nunca supera lo pendiente ni el total, también con otras entradas negativas', () => {
    const negative: Entry[] = [{ id: 'c', method: 'cash', amount: -5_000 }, { id: 'q', method: 'breb_qr', amount: 30_000 }];
    const othersTotal = negative.filter((p) => p.id !== 'q').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    expect(othersTotal).toBe(-5_000);
    expect(resolveQrChargeAmount({ entryAmount: 30_000, othersTotal, total: 25_000 })).toBe(25_000);
    const cent: Entry[] = [{ id: 'c', method: 'cash', amount: 24_999.99 }, { id: 'q', method: 'breb_qr', amount: 0.01 }];
    const others = cent.filter((p) => p.id !== 'q').reduce((s, p) => s + (Number(p.amount) || 0), 0);
    expect(resolveQrChargeAmount({ entryAmount: 0.01, othersTotal: others, total: 25_000 })).toBeCloseTo(0.01, 6);
  });

  it('CheckoutDialog (estático): el corte va ANTES de setQrPaymentMethod y del fetch, y el botón usa la misma expresión de «otras entradas»', () => {
    const handler = CHECKOUT.slice(CHECKOUT.indexOf('const handleQrPayment = async'), CHECKOUT.indexOf('const loadTaxData = async'));
    expect(handler.length).toBeGreaterThan(0);
    const cutIdx = handler.indexOf("toast.error('No hay saldo pendiente para cobrar con QR')");
    expect(cutIdx).toBeGreaterThan(0);
    expect(handler.indexOf('setQrPaymentMethod(methodCode)')).toBeGreaterThan(cutIdx);
    expect(handler.indexOf('await fetch(')).toBeGreaterThan(cutIdx);
    expect(handler.indexOf('resolveQrChargeAmount(')).toBeGreaterThan(cutIdx);
    expect(handler).toMatch(/if \(Math\.max\(0, cartTotal - othersTotal\) <= 0\) \{/);
    const button = CHECKOUT.slice(CHECKOUT.indexOf('const othersCoverTotal ='), CHECKOUT.indexOf('Generar QR de pago', CHECKOUT.indexOf('const othersCoverTotal =')));
    expect(button).toMatch(/payments\.filter\(\(p\) => p\.id !== payment\.id\)\.reduce\(\(sum, p\) => sum \+ \(Number\(p\.amount\) \|\| 0\), 0\) >= cartTotal/);
    expect(button).toContain('disabled={othersCoverTotal}');
  });
});
