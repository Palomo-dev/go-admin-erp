/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · TESTER, ronda 8
 * (segunda pasada sobre la corrección de F2C-R7-1/2/3).
 *
 * Rompe, no defiende. Sobre el árbol REAL (rondas 7 y 8 sin commitear).
 *
 * Hallazgos nuevos. Corregidos en la ronda 9 (builder): los `it.failing`
 * pasaron a `it` y las «evidencias» del defecto se reescribieron como la
 * conducta corregida (qr-payment-f2c-r9.test.ts los prueba en React real):
 *  T · [medio] Un estado TERMINAL del proveedor distinto de `paid`
 *      (`expired` antes del `expires_at` local, `rejected`, `cancelled`) se
 *      queda en QrPaymentDialog: no existe ningún callback hacia
 *      CheckoutDialog, así que la proyección `payment.qr` sigue viva y la
 *      pantalla del cliente pinta un código que el proveedor ya mató, con
 *      «Ya pagué» activo, hasta que el cajero pulsa Cancelar (PLAN §3.5
 *      «nunca un código roto»).
 *  U · [bajo] QrPaymentDialog SIN `expiresAt` se da por vencido en el primer
 *      render (`remaining` nace en 0 y `isExpired` incluye `remaining <= 0`):
 *      la caja ve «El tiempo ha expirado» sin código ni «Ya pague» mientras
 *      la pantalla del cliente pinta el QR sin cuenta atrás. Hoy los cuatro
 *      proveedores cableados mandan `expires_at`; el defecto es latente.
 *  V · [bajo] `checkNow()` («Ya pague» del cajero) con una consulta YA en
 *      vuelo abre una segunda cadena de polling: desde ahí cada intervalo
 *      hace DOS fetch y `attempts` se consume al doble. Previo a la ronda 8.
 *  W · [bajo] Al agotar `maxAttempts` el poller muere en silencio: el
 *      diálogo no pasa `onError`, sigue en «pending» con la cuenta atrás y
 *      «Ya pague» es un no-op (checkNow retorna con `running=false`).
 *
 * Verificado y en verde (sin hallazgo): stop() con `expired`/`rejected` en
 * vuelo, ajustes inválidos, presets vacíos en pantalla no táctil, base 0 con
 * propina, QR vencido de punta a punta, terminal sin vincular.
 *
 * Helpers copiados a propósito (un test no importa de otro). Organización
 * ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';
import { resolveDisplayQr, resolveQrChargeAmount, toDisplayPayment, isAmountWithinTotal } from '@/lib/pos/display/payment';
import { isDownMessage, isUpMessage, PROTOCOL_VERSION, type DisplayPayment, type DisplayState } from '@/lib/pos/display/protocol';
import { parseCustomerDisplaySettings } from '@/lib/pos/display/settings';
import { getOrCreateLocalTerminalId, isTerminalId, readLocalTerminalId, setLocalTerminalId } from '@/lib/pos/display/terminal';
import { resolveQrPresentation, resolveTouch, resolveView, sanitizeDisplayPayment, sanitizeDisplayState } from '@/components/pos-display/logic';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const CHECKOUT = readSrc('components/pos/CheckoutDialog.tsx');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');
const messagesEs = JSON.parse(readFileSync(join(ROOT, 'messages/es.json'), 'utf8')) as Record<string, unknown>;
const T = (messagesEs.posDisplay as { payment: Record<string, string> }).payment;

// settings.ts importa el cliente de Supabase del navegador; aquí solo se usa parseCustomerDisplaySettings (puro).
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
}));

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
// Cargador de .tsx (esbuild → CJS) con stubs para la UI compartida
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
function passthrough(tag: string): React.FC<AnyProps> {
  const Stub: React.FC<AnyProps> = (props) => {
    const { children, ...rest } = props;
    const attrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') attrs[k] = v;
    return React.createElement(tag, { 'data-stub': tag, ...attrs }, children);
  };
  Stub.displayName = `Stub(${tag})`;
  return Stub;
}
const STUBS: Record<string, Record<string, unknown>> = {
  '@/components/ui/dialog': {
    Dialog: (p: AnyProps) => (p.open ? React.createElement('div', { 'data-stub': 'dialog' }, p.children) : null),
    DialogContent: passthrough('section'),
    DialogHeader: passthrough('header'),
    DialogTitle: passthrough('h2'),
    DialogDescription: passthrough('p'),
  },
  '@/components/ui/button': { Button: passthrough('button') },
  'lucide-react': new Proxy({}, { get: (_t, name: string) => () => React.createElement('i', { 'data-icon': name }) }),
};

const tsxCache = new Map<string, Record<string, unknown>>();
function loadTsx(absPath: string): Record<string, unknown> {
  const cached = tsxCache.get(absPath);
  if (cached) return cached;
  const source = readFileSync(absPath, 'utf8');
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic', target: 'es2020', sourcefile: absPath });
  const mod = { exports: {} as Record<string, unknown> };
  tsxCache.set(absPath, mod.exports);
  const localRequire = (spec: string): unknown => {
    if (STUBS[spec]) return STUBS[spec];
    if (spec === 'react') return React;
    if (spec === 'react/jsx-runtime') return require('react/jsx-runtime');
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
      return require(target);
    }
    return require(spec);
  };
  const fn = new Function('require', 'module', 'exports', code) as (r: typeof localRequire, m: typeof mod, e: typeof mod.exports) => void;
  fn(localRequire, mod, mod.exports);
  tsxCache.set(absPath, mod.exports);
  return mod.exports;
}

const BRAND = { name: 'Tienda de calzado', logoUrl: null, primaryColor: '#1f2937', timezone: 'America/Bogota', unknown: false };
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const EMV = '000201010212...6304ABCD';

function qrPayment(over: Partial<Extract<DisplayPayment, { method: 'qr' }>> = {}): Extract<DisplayPayment, { method: 'qr' }> {
  return { method: 'qr', total: 25_000, provider: 'Redeban QR', qr: { kind: 'image', value: IMG }, expiresAt: null, ...over };
}

function renderQrView(payment: Extract<DisplayPayment, { method: 'qr' }>, touch = true): string {
  const views = loadTsx(join(SRC, 'components/pos-display/views.tsx')) as { QrPaymentView: React.ComponentType<Record<string, unknown>> };
  return renderToStaticMarkup(React.createElement(views.QrPaymentView, { payment, currency: 'COP', brand: BRAND, touch, onQrPaidClaim: () => {} }));
}

function renderQrDialog(props: Record<string, unknown>): string {
  const mod = loadTsx(join(SRC, 'components/shared/QrPaymentDialog.tsx')) as { QrPaymentDialog: React.ComponentType<Record<string, unknown>> };
  return renderToStaticMarkup(
    React.createElement(mod.QrPaymentDialog, {
      open: true,
      onClose: () => {},
      reference: 'POS-1-120',
      organizationId: 120,
      amount: 25_000,
      providerLabel: 'Redeban QR',
      ...props,
    }),
  );
}

// ---------------------------------------------------------------------------
// fetch controlable para QrPoller
// ---------------------------------------------------------------------------

type Deferred = { resolve: (status: string) => void; reject: (e: Error) => void; url: string };
function controllableFetch() {
  const pending: Deferred[] = [];
  const fetchMock = jest.fn((url: string) => {
    return new Promise<{ ok: boolean; status: number; json: () => Promise<{ status: string }> }>((res, rej) => {
      pending.push({
        url,
        resolve: (status) => res({ ok: true, status: 200, json: async () => ({ status }) }),
        reject: (e) => rej(e),
      });
    });
  });
  return { fetchMock, pending, take: () => pending.shift()! };
}

const tick = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
};

describe('A · QrPoller: lo que la ronda 8 no cubrió', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = realFetch;
  });

  it('stop() con `expired` en vuelo: ni onExpired ni onStatusChange (misma regla que `paid`)', async () => {
    const { fetchMock, take } = controllableFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onExpired = jest.fn();
    const onStatusChange = jest.fn();
    const p = new QrPoller({ reference: 'R', organizationId: 120, onExpired, onStatusChange });
    p.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    p.stop();
    take().resolve('expired');
    await tick();
    expect(onExpired).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stop() con `rejected` en vuelo: se descarta y no reprograma', async () => {
    const { fetchMock, take } = controllableFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onStatusChange = jest.fn();
    const p = new QrPoller({ reference: 'R', organizationId: 120, onStatusChange });
    p.start();
    p.stop();
    take().resolve('rejected');
    await tick();
    expect(onStatusChange).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('HALLAZGO V · checkNow() con una consulta ya en vuelo NO abre una segunda cadena de polling: se suma a la que vuela', async () => {
    const { fetchMock, pending } = controllableFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const p = new QrPoller({ reference: 'R', organizationId: 120, intervalMs: 3000 });
    p.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // El cajero pulsa «Ya pague» mientras la consulta #1 sigue en vuelo:
    // checkNow() devuelve ESA consulta (no hay segundo fetch).
    let manualResolved = false;
    const manual = p.checkNow().then(() => {
      manualResolved = true;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await tick();
    expect(manualResolved).toBe(false);
    pending.shift()!.resolve('pending');
    await manual;
    expect(manualResolved).toBe(true);
    await tick();
    // Un solo timer vivo y, un intervalo después, UNA consulta nueva.
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.resolve('pending');
    await tick();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    p.stop();
    pending.shift()!.resolve('pending');
    await tick();
    jest.advanceTimersByTime(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('HALLAZGO V · checkNow() con el timer pendiente (nada en vuelo) sí consulta ya, y sigue una sola cadena', async () => {
    const { fetchMock, pending } = controllableFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const p = new QrPoller({ reference: 'R', organizationId: 120, intervalMs: 3000 });
    p.start();
    pending.shift()!.resolve('pending');
    await tick();
    expect(jest.getTimerCount()).toBe(1);
    const manual = p.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
    // Un «Ya pague» más con la manual en vuelo: se suma, no duplica.
    const manual2 = p.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.resolve('pending');
    await Promise.all([manual, manual2]);
    await tick();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    p.stop();
  });

  it('HALLAZGO V · el `paid` de la consulta compartida llega una sola vez y checkNow() no revive el poller parado', async () => {
    const { fetchMock, pending } = controllableFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onPaid = jest.fn();
    const p = new QrPoller({ reference: 'R', organizationId: 120, intervalMs: 3000, onPaid });
    p.start();
    const manual = p.checkNow();
    pending.shift()!.resolve('paid');
    await manual;
    await tick();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(p.isRunning).toBe(false);
    await p.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('HALLAZGO W (evidencia) · tras maxAttempts el poller muere: onError una vez, running=false y checkNow() es un no-op', async () => {
    const { fetchMock, pending } = controllableFetch();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onError = jest.fn();
    const p = new QrPoller({ reference: 'R', organizationId: 120, intervalMs: 1000, maxAttempts: 2, onError });
    p.start();
    pending.shift()!.resolve('pending');
    await tick();
    jest.advanceTimersByTime(1000);
    await tick();
    pending.shift()!.resolve('pending');
    await tick();
    jest.advanceTimersByTime(1000);
    await tick();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(p.isRunning).toBe(false);
    const calls = fetchMock.mock.calls.length;
    await p.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it('HALLAZGO W · QrPaymentDialog se entera de que el poller murió (onError) y «Ya pague» lo reinicia (start + checkNow)', () => {
    const pollerCtor = QR_DIALOG.slice(QR_DIALOG.indexOf('new QrPoller({'), QR_DIALOG.indexOf('pollerRef.current = poller'));
    expect(pollerCtor).toMatch(/onError\s*:/);
    expect(pollerCtor).toContain('setVerifyFailed(true)');
    const manual = QR_DIALOG.slice(QR_DIALOG.indexOf('const handleManualCheck = async'), QR_DIALOG.indexOf('// Render'));
    expect(manual).toContain('if (!poller.isRunning) {');
    expect(manual.indexOf('poller.start();')).toBeLessThan(manual.indexOf('await poller.checkNow();'));
    expect(QR_DIALOG).toContain('No se pudo verificar el pago; pulse «Ya pague» para reintentar.');
  });
});

describe('B · HALLAZGO T (medio): un estado terminal del proveedor ≠ paid no llega a la pantalla del cliente', () => {
  it('QrPaymentDialog expone al padre los estados terminales no pagados y CheckoutDialog los usa para retirar el código', () => {
    // Contrato mínimo: un callback en las props del diálogo para expired/rejected/cancelled (o el cambio de estado).
    const propsBlock = QR_DIALOG.slice(QR_DIALOG.indexOf('export interface QrPaymentDialogProps'), QR_DIALOG.indexOf('// Helpers'));
    const exposes = /onExpired\??\s*:|onStatusChange\??\s*:|onTerminal\w*\??\s*:|onRejected\??\s*:/.test(propsBlock);
    expect(exposes).toBe(true);
    // Y CheckoutDialog lo cablea en el <QrPaymentDialog … />.
    const usage = CHECKOUT.slice(CHECKOUT.indexOf('<QrPaymentDialog'), CHECKOUT.indexOf('{hasSerialItems &&'));
    expect(/onExpired=|onStatusChange=|onTerminal\w*=|onRejected=/.test(usage)).toBe(true);
  });

  it('corregido: las props del diálogo tienen onTerminal (aditivo, opcional); onExpired y onStatusChange del poller avisan al padre UNA vez', () => {
    const propsBlock = QR_DIALOG.slice(QR_DIALOG.indexOf('export interface QrPaymentDialogProps'), QR_DIALOG.indexOf('// Helpers'));
    const callbacks = Array.from(propsBlock.matchAll(/\bon[A-Z]\w*\??\s*:/g)).map((m) => m[0].replace(/\??\s*:$/, ''));
    expect(callbacks.sort()).toEqual(['onClose', 'onPaid', 'onTerminal']);
    expect(propsBlock).toMatch(/onTerminal\?: \(status: QrTerminalStatus\) => void;/);
    const ctor = QR_DIALOG.slice(QR_DIALOG.indexOf('new QrPoller({'), QR_DIALOG.indexOf('pollerRef.current = poller'));
    const onExpired = ctor.slice(ctor.indexOf('onExpired: () => {'));
    expect(onExpired).toContain("setStatus('expired')");
    expect(onExpired).toContain("notifyTerminal('expired')");
    const onStatusChange = ctor.slice(ctor.indexOf('onStatusChange:'), ctor.indexOf('onPaid:'));
    expect(onStatusChange).toContain("newStatus === 'rejected' || newStatus === 'cancelled'");
    expect(onStatusChange).toContain('notifyTerminal(newStatus)');
    // Un solo aviso por apertura, nunca con el diálogo cerrado, y nunca cierra el cobro.
    expect(QR_DIALOG).toContain('if (!openRef.current || terminalNotifiedRef.current) return;');
    expect(onExpired).not.toMatch(/onClose\(/);
  });

  it('evidencia (pantalla): con `expiresAt` en el futuro y `qr` presente, la vista sigue pintando el código y el botón «Ya pagué» aunque el proveedor lo haya rechazado', () => {
    // La pantalla no recibe ningún dato del estado del proveedor: solo `qr` y `expiresAt`.
    // Un `rejected`/`cancelled`/`expired` (por el proveedor) del poller no cambia nada de esto.
    const payment = qrPayment({ expiresAt: Date.now() + 5 * 60_000 });
    const view = resolveQrPresentation(payment, { now: Date.now(), online: true });
    expect(view.kind).toBe('image');
    const html = renderQrView(payment, true);
    expect(html).toContain('<img');
    expect(html).toContain(T.qrPaidButton);
    expect(html).not.toContain(T.qrExpired);
  });

  it('corregido (caja): `qrDead` entra en las dependencias del efecto de proyección y con él viaja qr null + expiresAt 0 (vencido)', () => {
    const effectStart = CHECKOUT.indexOf('if (showQrDialog && qrPaymentMethod) {');
    const depsStart = CHECKOUT.indexOf('}, [', effectStart);
    const depsEnd = CHECKOUT.indexOf(']);', depsStart);
    const deps = CHECKOUT.slice(depsStart, depsEnd)
      .replace('}, [', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(deps).toEqual(expect.arrayContaining(['showQrDialog', 'showQrOnDisplay', 'qrPaymentMethod', 'qrImageUrl', 'qrData', 'qrExpiresAt', 'qrDead', 'qrAmount']));
    const effect = CHECKOUT.slice(effectStart, depsStart);
    expect(effect).toMatch(/const resolved = qrDead\s*\?\s*\{ qr: null, expiresAt: 0 \}/);
    // El padre lo cablea a setQrDead(true) y lo resetea al generar un código nuevo y al cerrar el cobro.
    expect(CHECKOUT).toContain('onTerminal={() => setQrDead(true)}');
    expect(CHECKOUT.match(/setQrDead\(false\);/g)).toHaveLength(2);
    // Pipeline puro: qrDead ⇒ la pantalla recibe un cobro QR sin código y vencido → «El código venció».
    const payment = toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: null, expiresAt: 0, amount: 25_000 });
    expect(payment).toMatchObject({ method: 'qr', qr: null, expiresAt: 0 });
    const sane = sanitizeDisplayPayment(payment);
    const view = resolveQrPresentation(sane as Extract<DisplayPayment, { method: 'qr' }>, { now: Date.now(), online: true });
    expect(view).toMatchObject({ kind: 'fallback', expired: true });
    const html = renderQrView(sane as Extract<DisplayPayment, { method: 'qr' }>, true);
    expect(html).toContain(T.qrExpired);
    expect(html).not.toContain('<img');
    expect(html).not.toContain(T.qrPaidButton);
  });
});

describe('C · HALLAZGO U (bajo): QrPaymentDialog sin `expiresAt` se da por vencido en el primer render', () => {
  it('sin `expiresAt` el diálogo muestra el código y «Ya pague», no «El tiempo ha expirado»', () => {
    const html = renderQrDialog({ qrImageUrl: IMG });
    expect(html).not.toContain('El tiempo ha expirado');
    expect(html).toContain('<img');
    expect(html).toContain('Ya pague');
  });

  it('corregido: `remaining <= 0` solo cuenta como vencido si hay `expiresAt` (hasDeadline); sin él no hay cuenta atrás', () => {
    // Ronda 10 (HALLAZGO X): `hasDeadline` ya no mira «string no vacío» sino
    // `parseExpiresAt` (la misma regla que la pantalla): sin fecha VÁLIDA no
    // hay cuenta atrás ni NaN.
    expect(QR_DIALOG).toContain('const hasDeadline = deadline !== null;');
    expect(QR_DIALOG).toContain('const deadline = useMemo(() => parseExpiresAt(expiresAt), [expiresAt]);');
    expect(QR_DIALOG).toMatch(/const isExpired = [^;]*\(hasDeadline && remaining <= 0\)/);
    expect(QR_DIALOG).toContain('if (deadline === null) return 0;');
    const html = renderQrDialog({ qrImageUrl: IMG });
    expect(html).not.toContain('El tiempo ha expirado');
    expect(html).not.toContain('Expira en');
    expect(html).toContain('<img');
    // `expiresAt: ''` (Mono normaliza a vacío) cuenta como «sin vencimiento», igual que en la caja (`|| undefined`).
    const html2 = renderQrDialog({ qrImageUrl: IMG, expiresAt: '' });
    expect(html2).not.toContain('El tiempo ha expirado');
    expect(html2).toContain('<img');
  });

  it('control: con `expiresAt` en el futuro el diálogo pinta el código y la cuenta atrás', () => {
    const html = renderQrDialog({ qrImageUrl: IMG, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
    expect(html).toContain('<img');
    expect(html).toContain('Ya pague');
    expect(html).toMatch(/Expira en \d\d:\d\d/);
    expect(html).not.toContain('El tiempo ha expirado');
  });

  it('la pantalla del cliente, con el MISMO cobro sin vencimiento, sí pinta el QR (sin cuenta atrás): caja y pantalla se contradicen', () => {
    const payment = toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: { kind: 'image', value: IMG }, expiresAt: null });
    const html = renderQrView(payment as Extract<DisplayPayment, { method: 'qr' }>, true);
    expect(html).toContain('<img');
    expect(html).not.toContain('Expira');
    expect(html).not.toContain(T.qrExpired);
  });
});

describe('D · bordes pedidos por el orquestador', () => {
  it('ajustes inválidos en organization_settings: cada campo cae a su default sin arrastrar a los demás', () => {
    const s = parseCustomerDisplaySettings({
      enabled: 'sí',
      tips: { enabled: true, presets: [5, 10, 10], allowCustom: 'no' },
      rating: 'x',
      touch: 'TOUCH',
      showTaxBreakdown: true,
      locale: 'es_CO!',
    });
    expect(s.enabled).toBe(false);
    expect(s.tips.enabled).toBe(true);
    expect(s.tips.presets).toEqual([5, 10, 15]);
    expect(s.tips.allowCustom).toBe(true);
    expect(s.rating.enabled).toBe(false);
    expect(s.touch).toBe('auto');
    expect(s.showTaxBreakdown).toBe(true);
    expect(s.locale).toBeNull();
    for (const raw of [null, [], 'x', 42, undefined]) expect(parseCustomerDisplaySettings(raw).touch).toBe('auto');
  });

  it('presets vacíos + pantalla NO táctil + propina activada + QR SIN código: la pantalla cae al cobro QR (instrucciones), no a una pregunta vacía', () => {
    const payment = toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 25_000, qr: null, expiresAt: null });
    const state: DisplayState = {
      mode: 'tip',
      cart: { id: 'c1', lines: [{ id: 'l1', name: 'Café', qty: 1, unitPrice: 25_000, lineTotal: 25_000, taxIncluded: true } as never], subtotal: 25_000, discountTotal: 0, taxTotal: 0, taxIncluded: true, total: 25_000, currency: 'COP', lastChangedLineId: null } as never,
      payment,
      tip: { presets: [], allowCustom: true, base: 25_000, selected: null } as never,
      thanks: null,
    };
    const touch = resolveTouch(false, 'auto');
    expect(resolveView({ connected: true, updateRequired: false, touch, state })).toBe('payment_qr');
    // Forzado 'touch' en los ajustes: aunque el hardware no lo detecte, la pregunta se muestra (con «Otro» pulsable).
    expect(resolveView({ connected: true, updateRequired: false, touch: resolveTouch(false, 'touch'), state })).toBe('tip');
    // Y el fallback de la vista QR con qr null es «siga las instrucciones», nunca un <img> vacío.
    const html = renderQrView(payment as Extract<DisplayPayment, { method: 'qr' }>, false);
    expect(html).toContain(T.qrInstructions);
    expect(html).not.toContain('<img');
    expect(html).not.toContain(T.qrPaidButton);
  });

  it('base 0 (cortesía) con propina: no viaja `amount`, resolveQrChargeAmount da 0 y la caja corta antes del fetch', () => {
    expect(isAmountWithinTotal(0, 0)).toBe(false);
    const payment = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 0, qr: null, expiresAt: null, amount: 0 });
    expect('amount' in payment).toBe(false);
    expect(resolveQrChargeAmount({ entryAmount: 5_000, othersTotal: 0, total: 0 })).toBe(0);
    // Guard de la caja: «No hay saldo pendiente» antes del fetch y dentro del try (el finally suelta el guard).
    const handler = CHECKOUT.slice(CHECKOUT.indexOf('const handleQrPayment = async'), CHECKOUT.indexOf('const loadTaxData'));
    const cut = handler.indexOf("toast.error('No hay saldo pendiente para cobrar con QR')");
    expect(cut).toBeGreaterThan(handler.indexOf('qrRequestInFlightRef.current = true'));
    expect(cut).toBeLessThan(handler.indexOf('await fetch('));
    expect(handler.indexOf('finally {')).toBeGreaterThan(cut);
  });

  it('QR expirado de punta a punta: emisor → guard del protocolo → saneado → vista', () => {
    const now = 1_700_000_000_000;
    const resolved = resolveDisplayQr({ imageUrl: IMG, data: EMV, expiresAt: new Date(now - 1).toISOString(), now });
    expect(resolved.qr).toBeNull();
    expect(resolved.expiresAt).toBe(now - 1);
    const payment = toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: resolved.qr, expiresAt: resolved.expiresAt });
    const state: DisplayState = { mode: 'payment', cart: null, payment, tip: null, thanks: null };
    expect(isDownMessage({ v: PROTOCOL_VERSION, t: 'state', terminalId: 't1', instanceId: 'i1', seq: 1, state })).toBe(true);
    const sane = sanitizeDisplayState(state);
    expect(sane.payment).toMatchObject({ method: 'qr', qr: null, expiresAt: now - 1 });
    const view = resolveQrPresentation(sane.payment as Extract<DisplayPayment, { method: 'qr' }>, { now, online: true });
    expect(view).toMatchObject({ kind: 'fallback', expired: true, remainingMs: null });
    const html = renderQrView(sane.payment as Extract<DisplayPayment, { method: 'qr' }>, true);
    expect(html).toContain(T.qrExpired);
    expect(html).not.toContain('<img');
    expect(html).not.toContain(T.qrPaidButton);
  });

  it('QR con `expiresAt` inválido (NaN, Infinity, string) nunca cuenta como vencido ni como cuenta atrás', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const p = toDisplayPayment({ methodCode: 'qr', methodName: null, total: 10, qr: { kind: 'text', value: EMV }, expiresAt: bad });
      expect((p as { expiresAt: number | null }).expiresAt).toBeNull();
    }
    const sane = sanitizeDisplayPayment({ method: 'qr', total: 10, provider: 'x', qr: { kind: 'text', value: EMV }, expiresAt: '2099-01-01' });
    expect(sane).toMatchObject({ expiresAt: null });
    const view = resolveQrPresentation(sane as Extract<DisplayPayment, { method: 'qr' }>, { now: Date.now(), online: true });
    expect(view).toMatchObject({ kind: 'text', expired: false, remainingMs: null });
  });

  it('QR que vence mientras la pantalla lo muestra: la propia pantalla lo retira con su reloj, sin depender de la caja', () => {
    const start = 1_700_000_000_000;
    const payment = qrPayment({ expiresAt: start + 10_000 });
    expect(resolveQrPresentation(payment, { now: start + 9_999, online: true }).kind).toBe('image');
    expect(resolveQrPresentation(payment, { now: start + 10_000, online: true })).toMatchObject({ kind: 'fallback', expired: true });
  });

  it('qr_paid_claim: el guard exige cartId no vacío; un cartId numérico o vacío (carrito sin id) no pasa', () => {
    const base = { v: PROTOCOL_VERSION, terminalId: 't1', t: 'qr_paid_claim' };
    expect(isUpMessage({ ...base, cartId: 'c1' })).toBe(true);
    expect(isUpMessage({ ...base, cartId: '' })).toBe(false);
    expect(isUpMessage({ ...base, cartId: 7 })).toBe(false);
    expect(isUpMessage({ ...base, cartId: 'c1', toInstanceId: '' })).toBe(false);
    // La caja filtra por cart.id (string): el listener de CheckoutDialog compara estrictamente.
    expect(CHECKOUT).toContain("if (msg.t !== 'qr_paid_claim' || msg.cartId !== cart.id) return;");
  });

  it('terminal sin vincular: la caja funciona con su UUID local; un id que no es UUID se rechaza y no pisa el storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readLocalTerminalId(storage)).toBeNull();
    const local = getOrCreateLocalTerminalId(storage);
    expect(isTerminalId(local)).toBe(true);
    expect(getOrCreateLocalTerminalId(storage)).toBe(local);
    // Vincular con algo que no es una fila de pos_terminals (id no UUID): false y sin cambios.
    expect(setLocalTerminalId('CAJA-1', storage)).toBe(false);
    expect(setLocalTerminalId('', storage)).toBe(false);
    expect(readLocalTerminalId(storage)).toBe(local);
    // Vincular con un UUID válido (id de pos_terminals): se escribe en la misma clave.
    const linked = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(setLocalTerminalId(linked, storage)).toBe(true);
    expect(readLocalTerminalId(storage)).toBe(linked);
    // Storage corrupto (valor que no es UUID): se lee como «sin terminal» y se regenera.
    store.set('pos_terminal_id', 'basura');
    expect(readLocalTerminalId(storage)).toBeNull();
    expect(isTerminalId(getOrCreateLocalTerminalId(storage))).toBe(true);
  });

  it('proveedor que devuelve `expires_at` vacío (Mono normaliza a ""): la caja no manda cuenta atrás y la pantalla no dice «venció»', () => {
    const resolved = resolveDisplayQr({ imageUrl: undefined, data: EMV, expiresAt: '' });
    expect(resolved).toEqual({ qr: { kind: 'text', value: EMV }, expiresAt: null });
    // Y CheckoutDialog convierte '' en undefined antes de guardarlo (`|| undefined`).
    expect(CHECKOUT).toContain('setQrExpiresAt(session?.expires_at || undefined);');
  });
});

describe('E · higiene de esta ronda', () => {
  it('los tres archivos corregidos en las rondas 8 y 9 siguen en LF', () => {
    for (const rel of ['components/pos/CheckoutDialog.tsx', 'components/shared/QrPaymentDialog.tsx', 'lib/services/integrations/qrShared/qrPoller.ts']) {
      expect(readFileSync(join(SRC, rel), 'utf8')).not.toContain('\r');
    }
  });

  it('el guard de en-vuelo también cubre el retorno de Bold Link (payment_url) y el de método no soportado: ambos dentro del try', () => {
    const handler = CHECKOUT.slice(CHECKOUT.indexOf('const handleQrPayment = async'), CHECKOUT.indexOf('const loadTaxData'));
    const tryAt = handler.indexOf('try {');
    const finallyAt = handler.indexOf('finally {');
    for (const marker of ["toast.error('Metodo QR no soportado')", 'window.open(data.payment_url', "toast.error('Error al generar QR', {"]) {
      const at = handler.indexOf(marker);
      expect(at).toBeGreaterThan(tryAt);
      expect(at).toBeLessThan(finallyAt);
    }
  });
});
