/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · TESTER, ronda 9
 * (tercera pasada: sobre la corrección de T/U/V/W de la ronda 9 del builder).
 *
 * Rompe, no defiende. Sobre el árbol REAL (sin commitear). QrPoller REAL en
 * Node con fetch controlable y timers falsos; QrPaymentDialog REAL montado
 * con react-dom/client sobre un DOM mínimo (misma técnica que
 * qr-payment-f2c-r9, copiada a propósito: un test no importa de otro).
 *
 * Hallazgos de la ronda 9 (nacieron como `it.failing`; corregidos por el
 * builder en la ronda 10 y pasados a `it`, con las «evidencias» reescritas
 * como la conducta corregida):
 *  X · [bajo] `expiresAt` que no es una fecha («2026-13-99», « ») en
 *      QrPaymentDialog: `hasDeadline` solo mira que sea un string no vacío,
 *      así que `remaining` nace NaN y la caja pinta «Expira en NaN:NaN»
 *      para siempre (el intervalo nunca da por vencido NaN). La pantalla del
 *      cliente, con `parseExpiresAt`, lo trata como «sin vencimiento»: los
 *      dos extremos vuelven a discrepar, que es lo que U quería cerrar.
 *  Y · [bajo] QrPoller: `start()` llamado desde el propio `onError` de
 *      maxAttempts (patrón «reintento automático» de cualquier consumidor)
 *      deja `inFlight` en null con una consulta en vuelo: el guard de V se
 *      salta y el siguiente `checkNow()` abre la segunda cadena que V quiso
 *      eliminar. El diálogo del POS no lo hace (reinicia desde «Ya pague»),
 *      por eso es bajo y latente.
 *  Z · [bajo] Vencimiento por reloj local del diálogo («El tiempo ha
 *      expirado», sin «Ya pague»): el poller seguía consultando hasta
 *      maxAttempts (con backoff, ~24 min más de fetch por un código que la
 *      caja ya declaró muerto) y un `paid` tardío confirmaba el cobro sobre un
 *      código que el cajero vio vencido. El builder lo dejó como «latente,
 *      ronda aparte»; queda medido aquí.
 *
 * Verificado y en verde (sin hallazgo): T de punta a punta hasta la vista
 * (expiresAt 0 → «El código venció» y sin «Ya pagué» en táctil), un aviso
 * por apertura y de nuevo en la siguiente, stop()+start() con la consulta
 * vieja en vuelo, maxAttempts alcanzado por «Ya pague», reinicio sin timer
 * doble, W + vencimiento local, ajustes inválidos, presets vacíos con y sin
 * táctil, base 0 con propina, terminal sin vincular y dos cajas con la
 * misma terminal.
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { transformSync } from 'esbuild';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';
import { resolveDisplayQr, toDisplayPayment, parseExpiresAt } from '@/lib/pos/display/payment';
import { isDownMessage, isUpMessage, PROTOCOL_VERSION, type DisplayPayment } from '@/lib/pos/display/protocol';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings } from '@/lib/pos/display/settings';
import { computeTipAmount, tipOptions, resolveTipSelection, sanitizeDisplayTip } from '@/lib/pos/display/tip';
import { getOrCreateLocalTerminalId, isTerminalId, readLocalTerminalId, setLocalTerminalId } from '@/lib/pos/display/terminal';
import { resolveQrPresentation, resolveTouch, resolveView, sanitizeDisplayPayment } from '@/components/pos-display/logic';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const messagesEs = JSON.parse(readFileSync(join(ROOT, 'messages/es.json'), 'utf8')) as Record<string, unknown>;
const T_PAYMENT = (messagesEs.posDisplay as { payment: Record<string, string> }).payment;

// settings.ts importa el cliente de Supabase del navegador; aquí solo se usan sus funciones puras.
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

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
type ReactNs = typeof import('react');
type RootApi = { render: (el: unknown) => void; unmount: () => void };
type FakeNode = any;

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const BRAND = { name: 'Tienda de calzado', logoUrl: null, primaryColor: '#1f2937', timezone: 'America/Bogota', unknown: false };

// ---------------------------------------------------------------------------
// fetch controlable (compartido por el poller puro y el diálogo real)
// ---------------------------------------------------------------------------

type Deferred = { resolve: (status: string) => void; reject: (e: Error) => void; url: string };
let pending: Deferred[] = [];
let fetchMock: jest.Mock;
const realFetch = globalThis.fetch;

beforeEach(() => {
  pending = [];
  fetchMock = jest.fn((url: string) => new Promise((res, rej) => {
    pending.push({
      url,
      resolve: (status) => res({ ok: true, status: 200, json: async () => ({ status }) }),
      reject: (e) => rej(e),
    });
  }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
};

// ---------------------------------------------------------------------------
// QrPoller puro (sin React)
// ---------------------------------------------------------------------------

describe('QrPoller real · V y W en Node con timers falsos', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  const mk = (over: Partial<ConstructorParameters<typeof QrPoller>[0]> = {}) =>
    new QrPoller({ reference: 'POS-120-t9', organizationId: 120, ...over });

  it('stop() + start() con la consulta vieja en vuelo: checkNow() se suma a la NUEVA consulta y la respuesta vieja se descarta', async () => {
    const onPaid = jest.fn();
    const onStatusChange = jest.fn();
    const poller = mk({ onPaid, onStatusChange });
    poller.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    poller.stop();
    poller.start();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const joined = poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // La respuesta VIEJA (paid) llega: es de otra generación → nada.
    pending.shift()!.resolve('paid');
    await flush();
    expect(onPaid).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
    expect(poller.isRunning).toBe(true);
    // La NUEVA responde pending: checkNow resuelve y sigue una sola cadena.
    pending.shift()!.resolve('pending');
    await joined;
    await flush();
    expect(onStatusChange).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    poller.stop();
  });

  it('maxAttempts alcanzado POR checkNow(): onError con isRunning=false, sin fetch nuevo, y la promesa resuelve (el botón no se queda en «Verificando…»)', async () => {
    const onError = jest.fn();
    const poller = mk({ maxAttempts: 3, onError });
    poller.start();
    for (let i = 0; i < 3; i += 1) {
      pending.shift()!.resolve('pending');
      await flush();
      if (i < 2) {
        jest.advanceTimersByTime(3000);
        await flush();
      }
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(poller.isRunning).toBe(true);
    // Timer pendiente para la 4.ª; el cajero pulsa «Ya pague» antes.
    await poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reinicio tras maxAttempts (start + checkNow como hace «Ya pague»): un solo fetch, un solo timer, attempts desde 0', async () => {
    const onError = jest.fn();
    const poller = mk({ maxAttempts: 2, onError });
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    jest.advanceTimersByTime(3000);
    await flush();
    pending.shift()!.resolve('pending');
    await flush();
    jest.advanceTimersByTime(3000);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    poller.start();
    const p = poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    pending.shift()!.resolve('pending');
    await p;
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    // attempts arrancó de 0: hay al menos maxAttempts consultas más antes de morir.
    jest.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    pending.shift()!.resolve('pending');
    await flush();
    expect(poller.isRunning).toBe(true);
    poller.stop();
  });

  it('checkNow() entre el fetch resuelto y el cuerpo (json) pendiente sigue siendo «en vuelo»: no abre otra consulta', async () => {
    let releaseBody: () => void = () => {};
    const body = new Promise<{ status: string }>((r) => { releaseBody = () => r({ status: 'pending' }); });
    const slowJson = jest.fn(async () => ({ ok: true, status: 200, json: () => body }));
    globalThis.fetch = slowJson as unknown as typeof fetch;
    const poller = mk();
    poller.start();
    await flush(); // fetch resuelto; json() pendiente
    const joined = poller.checkNow();
    expect(slowJson).toHaveBeenCalledTimes(1);
    releaseBody();
    await joined;
    await flush();
    expect(slowJson).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(1);
    poller.stop();
  });

  it('Y · start() desde el propio onError (reintento automático de un consumidor) NO deja `inFlight` en null con una consulta en vuelo: el siguiente checkNow() se suma a ella y no abre una segunda cadena', async () => {
    const poller = mk({
      maxAttempts: 1,
      onError: () => {
        if (!poller.isRunning) poller.start();
      },
    });
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    jest.advanceTimersByTime(3000);
    await flush();
    // 2.º intento > maxAttempts(1) → onError → start() → consulta nueva (la 2.ª de verdad).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(poller.isRunning).toBe(true);
    // «Ya pague» con esa consulta en vuelo: V dice que se suma a ella…
    void poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // …y al responder solo queda UNA cadena de timers (la de la consulta nueva).
    pending.shift()!.resolve('pending');
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    poller.stop();
  });
});

// ---------------------------------------------------------------------------
// DOM mínimo para react-dom/client
// ---------------------------------------------------------------------------

function makeDocument(): FakeNode {
  const doc: FakeNode = {};
  const element = (tag: string): FakeNode => {
    const n: FakeNode = {
      nodeType: 1,
      nodeName: tag.toUpperCase(),
      tagName: tag.toUpperCase(),
      ownerDocument: doc,
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      childNodes: [] as FakeNode[],
      parentNode: null,
      style: {},
      attrs: {} as Record<string, string>,
      setAttribute(k: string, v: string) { this.attrs[k] = String(v); },
      removeAttribute(k: string) { delete this.attrs[k]; },
      getAttribute(k: string) { return this.attrs[k] ?? null; },
      appendChild(c: FakeNode) { c.parentNode = this; this.childNodes.push(c); return c; },
      insertBefore(c: FakeNode, ref: FakeNode) {
        const i = this.childNodes.indexOf(ref);
        c.parentNode = this;
        if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
        return c;
      },
      removeChild(c: FakeNode) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
      addEventListener() {},
      removeEventListener() {},
      get firstChild() { return this.childNodes[0] ?? null; },
      get nextSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return p.childNodes[i + 1] ?? null; },
      get textContent(): string { return this.childNodes.map((c: FakeNode) => c.textContent).join(''); },
      set textContent(v: string) { this.childNodes = v === '' ? [] : [doc.createTextNode(v)]; },
    };
    return n;
  };
  doc.nodeType = 9;
  doc.createElement = element;
  doc.createElementNS = (_ns: string, tag: string) => element(tag);
  doc.createTextNode = (t: string) => ({
    nodeType: 3,
    nodeName: '#text',
    nodeValue: String(t),
    parentNode: null,
    ownerDocument: doc,
    get textContent() { return this.nodeValue; },
    set textContent(v: string) { this.nodeValue = v; },
  });
  doc.documentElement = element('html');
  doc.body = null;
  doc.activeElement = null;
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  return doc;
}

function html(n: FakeNode): string {
  if (n.nodeType === 3) return n.nodeValue;
  const attrs = Object.entries(n.attrs as Record<string, string>).map(([k, v]) => ` ${k}="${v}"`).join('');
  const tag = String(n.tagName).toLowerCase();
  return `<${tag}${attrs}>${n.childNodes.map(html).join('')}</${tag}>`;
}

function findNode(n: FakeNode, pred: (node: FakeNode) => boolean): FakeNode | null {
  if (n.nodeType !== 1) return null;
  if (pred(n)) return n;
  for (const c of n.childNodes) {
    const hit = findNode(c, pred);
    if (hit) return hit;
  }
  return null;
}

function reactProps(node: FakeNode): Record<string, unknown> {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps'));
  if (!key) throw new Error('nodo sin props de React');
  return node[key] as Record<string, unknown>;
}

let React: ReactNs;
let createRoot: (c: unknown) => RootApi;
let act: (cb: () => Promise<void> | void) => Promise<void>;
let document: FakeNode;
let renderToStaticMarkup: (el: unknown) => string;

function passthrough(tag: string): React.FC<Record<string, unknown>> {
  const Stub: React.FC<Record<string, unknown>> = (props) => {
    const { children, ...rest } = props as Record<string, unknown> & { children?: React.ReactNode };
    const attrs: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') attrs[k] = v;
    return React.createElement(tag, { 'data-stub': tag, ...attrs }, children);
  };
  Stub.displayName = `Stub(${tag})`;
  return Stub;
}

let STUBS: Record<string, Record<string, unknown>> = {};
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

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  document = makeDocument();
  class HTMLIFrameElement {}
  (globalThis as any).window = { event: undefined, HTMLIFrameElement, document, addEventListener() {}, removeEventListener() {} };
  (globalThis as any).document = document;
  React = require('react');
  createRoot = require('react-dom/client').createRoot;
  renderToStaticMarkup = require('react-dom/server').renderToStaticMarkup;
  act = React.act as unknown as typeof act;
  STUBS = {
    '@/components/ui/dialog': {
      Dialog: (p: { open?: boolean; children?: React.ReactNode }) => (p.open ? React.createElement('div', { 'data-stub': 'dialog' }, p.children) : null),
      DialogContent: passthrough('section'),
      DialogHeader: passthrough('header'),
      DialogTitle: passthrough('h2'),
      DialogDescription: passthrough('p'),
    },
    '@/components/ui/button': {
      Button: (p: { onClick?: () => void; disabled?: boolean; children?: React.ReactNode }) =>
        React.createElement('button', { 'data-stub': 'button', onClick: p.onClick, disabled: p.disabled }, p.children),
    },
    'lucide-react': new Proxy({}, { get: (_t, name: string) => () => React.createElement('i', { 'data-icon': name }) }),
  };
});

afterAll(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).document;
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

function QrDialog(): React.ComponentType<Record<string, unknown>> {
  return (loadTsx(join(SRC, 'components/shared/QrPaymentDialog.tsx')) as { QrPaymentDialog: React.ComponentType<Record<string, unknown>> }).QrPaymentDialog;
}

/** Gracia tras el vencimiento local (Z): se lee del módulo real (el .tsx solo se carga con esbuild aquí). */
function graceMs(): number {
  const value = loadTsx(join(SRC, 'components/shared/QrPaymentDialog.tsx')).QR_LOCAL_EXPIRY_GRACE_MS;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('QR_LOCAL_EXPIRY_GRACE_MS no exportada');
  return value;
}

const baseProps = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  open: true,
  onClose: () => {},
  reference: 'POS-120-t9',
  organizationId: 120,
  amount: 25_000,
  providerLabel: 'Redeban QR',
  qrImageUrl: IMG,
  ...over,
});

/** Raíces montadas: se desmontan SIEMPRE en afterEach (un test fallido no debe dejar trabajo de React vivo sin `window`). */
const mounted: RootApi[] = [];
afterEach(async () => {
  while (mounted.length > 0) {
    const r = mounted.pop()!;
    try {
      await act(async () => r.unmount());
    } catch {
      /* ya desmontada */
    }
  }
});

async function mountDialog(props: Record<string, unknown>): Promise<{ root: RootApi; container: FakeNode; rerender: (p: Record<string, unknown>) => Promise<void> }> {
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);
  const Dialog = QrDialog();
  const rerender = async (p: Record<string, unknown>) => {
    await act(async () => {
      root.render(React.createElement(Dialog, p));
    });
  };
  await rerender(props);
  return { root, container, rerender };
}

async function respond(status: string): Promise<void> {
  await act(async () => {
    pending.shift()!.resolve(status);
    await flush();
  });
}

const yaPague = (container: FakeNode): FakeNode | null =>
  findNode(container, (n) => n.tagName === 'BUTTON' && n.textContent === 'Ya pague');

// ---------------------------------------------------------------------------
// T · de punta a punta: onTerminal → qrDead → emisor → protocolo → pantalla → vista
// ---------------------------------------------------------------------------

describe('T · el código muerto por el proveedor llega hasta la vista de la pantalla como «El código venció»', () => {
  const future = () => new Date(Date.now() + 5 * 60_000).toISOString();

  function renderQrView(payment: Extract<DisplayPayment, { method: 'qr' }>, touch: boolean): string {
    const views = loadTsx(join(SRC, 'components/pos-display/views.tsx')) as { QrPaymentView: React.ComponentType<Record<string, unknown>> };
    return renderToStaticMarkup(React.createElement(views.QrPaymentView, { payment, currency: 'COP', brand: BRAND, touch, onQrPaidClaim: () => {} }));
  }

  it('qrDead ⇒ {qr:null, expiresAt:0} pasa el guard del protocolo, el saneado de la pantalla conserva el 0 y la presentación es fallback+expired', () => {
    const payment = toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: null, expiresAt: 0, amount: 25_000 });
    expect(payment).toMatchObject({ method: 'qr', qr: null, expiresAt: 0 });
    const msg = { v: PROTOCOL_VERSION, t: 'state', seq: 7, instanceId: 'caja-1', terminalId: 'term-1', state: { mode: 'payment', cart: null, payment, thanks: null, tip: null } };
    expect(isDownMessage(msg)).toBe(true);
    const sane = sanitizeDisplayPayment(payment);
    expect(sane).not.toBeNull();
    expect((sane as { expiresAt: number | null }).expiresAt).toBe(0);
    const pres = resolveQrPresentation(sane as Extract<DisplayPayment, { method: 'qr' }>, { now: Date.now(), online: true });
    expect(pres).toEqual({ kind: 'fallback', value: null, remainingMs: null, expired: true });
  });

  it('vista táctil con el cobro muerto: «El código venció», sin <img> ni «Ya pagué»; no táctil: idéntico sin botón', () => {
    const payment = sanitizeDisplayPayment(
      toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: null, expiresAt: 0 }),
    ) as Extract<DisplayPayment, { method: 'qr' }>;
    const touchOut = renderQrView(payment, true);
    expect(touchOut).toContain(T_PAYMENT.qrExpired);
    expect(touchOut).not.toContain('<img');
    expect(touchOut).not.toContain(T_PAYMENT.qrPaidClaim ?? 'Ya pagué');
    const noTouch = renderQrView(payment, false);
    expect(noTouch).toContain(T_PAYMENT.qrExpired);
    expect(noTouch).not.toContain('Ya pagué');
  });

  it('qr_paid_claim que llegue tarde (el cliente pulsó justo antes) sigue siendo un mensaje válido que solo avisa: el guard no cambia', () => {
    const claim = { v: PROTOCOL_VERSION, t: 'qr_paid_claim', seq: 1, instanceId: 'pantalla-1', terminalId: 'term-1', cartId: 'cart-1' };
    expect(isUpMessage(claim)).toBe(true);
    // El estado de la caja no depende de él: la proyección sigue siendo la del qrDead.
    const projected = toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: null, expiresAt: 0 });
    expect(projected.method === 'qr' && projected.qr).toBeNull();
  });

  it('un aviso por apertura, y OTRO en la apertura siguiente (terminalNotifiedRef se resetea al abrir)', async () => {
    const onTerminal = jest.fn();
    const { root, rerender } = await mountDialog(baseProps({ expiresAt: future(), onTerminal }));
    await respond('rejected');
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await rerender(baseProps({ open: false, expiresAt: future(), onTerminal }));
    await rerender(baseProps({ open: true, reference: 'POS-120-t9-b', expiresAt: future(), onTerminal }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pending[0].url).toContain('POS-120-t9-b');
    await respond('cancelled');
    expect(onTerminal).toHaveBeenCalledTimes(2);
    expect(onTerminal).toHaveBeenLastCalledWith('cancelled');
    await act(async () => root.unmount());
  });

  it('vencimiento LOCAL: onTerminal("expired") una vez (Z: el padre retira el código de la pantalla); el `expired` del proveedor después NO duplica el aviso', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    try {
      const onTerminal = jest.fn();
      const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 2000).toISOString(), onTerminal }));
      await act(async () => {
        jest.advanceTimersByTime(2100);
        await flush();
      });
      expect(html(container)).toContain('El tiempo ha expirado');
      expect(onTerminal).toHaveBeenCalledTimes(1);
      expect(onTerminal).toHaveBeenCalledWith('expired');
      await respond('expired');
      expect(onTerminal).toHaveBeenCalledTimes(1);
      await act(async () => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it('con el interruptor «Mostrar en pantalla» APAGADO el qrDead también viaja como vencido (decisión del builder): la pantalla pasa de «siga las instrucciones» a «El código venció»', () => {
    const off = { qr: null, expiresAt: null };
    const dead = { qr: null, expiresAt: 0 };
    const before = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 10_000, ...off })) as Extract<DisplayPayment, { method: 'qr' }>;
    const after = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 10_000, ...dead })) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveQrPresentation(before, { now: Date.now(), online: true }).expired).toBe(false);
    expect(resolveQrPresentation(after, { now: Date.now(), online: true }).expired).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// U · expiresAt raro
// ---------------------------------------------------------------------------

describe('U · expiresAt que no es una fecha', () => {
  it('X · «2026-13-99» (o « ») en QrPaymentDialog: no pinta «Expira en NaN:NaN»; sin fecha válida no hay cuenta atrás (como parseExpiresAt en la pantalla)', async () => {
    expect(parseExpiresAt('2026-13-99')).toBeNull();
    const { root, container } = await mountDialog(baseProps({ expiresAt: '2026-13-99' }));
    const out = html(container);
    expect(out).toContain('<img');
    expect(out).toContain('Ya pague');
    expect(out).not.toContain('NaN');
    await act(async () => root.unmount());
  });

  it('X · con «2026-13-99» (y con «  ») la caja y la pantalla coinciden: ni «Expira en», ni «NaN», ni vencimiento tras 60 s; el código sigue vivo en los dos extremos', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    try {
      const { root, container } = await mountDialog(baseProps({ expiresAt: '2026-13-99' }));
      expect(html(container)).not.toContain('Expira en');
      expect(html(container)).not.toContain('NaN');
      await act(async () => {
        jest.advanceTimersByTime(60_000);
        await flush();
      });
      expect(html(container)).not.toContain('NaN');
      expect(html(container)).not.toContain('El tiempo ha expirado');
      expect(yaPague(container)).not.toBeNull();
      const blank = await mountDialog(baseProps({ expiresAt: '  ', reference: 'POS-120-t9-blank' }));
      expect(html(blank.container)).not.toContain('Expira en');
      expect(html(blank.container)).not.toContain('NaN');
      await act(async () => blank.root.unmount());
      const resolved = resolveDisplayQr({ imageUrl: IMG, expiresAt: '2026-13-99' });
      expect(resolved.expiresAt).toBeNull();
      expect(resolved.qr).toEqual({ kind: 'image', value: IMG });
      await act(async () => root.unmount());
    } finally {
      jest.useRealTimers();
    }
  });

  it('expiresAt ya vencido al abrir: «El tiempo ha expirado» sin botón; la pantalla también lo retira (qr null, expiresAt conservado)', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { root, container } = await mountDialog(baseProps({ expiresAt: past }));
    const out = html(container);
    expect(out).toContain('El tiempo ha expirado');
    expect(out).not.toContain('Ya pague');
    const resolved = resolveDisplayQr({ imageUrl: IMG, expiresAt: past });
    expect(resolved.qr).toBeNull();
    expect(resolved.expiresAt).toBe(new Date(past).getTime());
    await act(async () => root.unmount());
  });
});

// ---------------------------------------------------------------------------
// W · aviso y reinicio · Z · vencimiento local con el poller vivo
// ---------------------------------------------------------------------------

describe('W/Z · diálogo real con timers falsos', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  async function exhaust(container: FakeNode, n: number): Promise<void> {
    for (let i = 0; i < n; i += 1) {
      await act(async () => {
        pending.shift()!.resolve('pending');
        await flush();
      });
      await act(async () => {
        jest.advanceTimersByTime(15_000);
        await flush();
      });
    }
    void container;
  }

  it('W + vencimiento local: tras el aviso, cuando el reloj llega a 0 desaparecen el aviso, el código y «Ya pague» (coherente)', async () => {
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }));
    await exhaust(container, 100);
    expect(html(container)).toContain('No se pudo verificar el pago');
    await act(async () => {
      jest.advanceTimersByTime(30 * 60_000);
      await flush();
    });
    const out = html(container);
    expect(out).toContain('El tiempo ha expirado');
    expect(out).not.toContain('No se pudo verificar el pago');
    expect(yaPague(container)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(100);
    await act(async () => root.unmount());
  });

  it('W: «Ya pague» tras el aviso y la respuesta es `rejected`: onTerminal una vez, «Pago rechazado por el proveedor» (QA-5, cierre), sin segundo aviso', async () => {
    const onTerminal = jest.fn();
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), onTerminal }));
    await exhaust(container, 100);
    const btn = yaPague(container);
    expect(btn).not.toBeNull();
    let click: Promise<unknown> = Promise.resolve();
    await act(async () => {
      click = (reactProps(btn).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(101);
    await act(async () => {
      pending.shift()!.resolve('rejected');
      await click;
      await flush();
    });
    expect(onTerminal).toHaveBeenCalledTimes(1);
    const out = html(container);
    expect(out).toContain('Pago rechazado por el proveedor');
    expect(out).not.toContain('No se pudo verificar');
    // Solo queda el intervalo de la cuenta atrás: el poller no reprogramó nada tras `rejected`.
    expect(jest.getTimerCount()).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(101);
    await act(async () => root.unmount());
  });

  it('W: doble pulsación de «Ya pague» con el poller muerto: un solo reinicio (start es idempotente) y un solo fetch', async () => {
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }));
    await exhaust(container, 100);
    const btn = yaPague(container);
    let c1: Promise<unknown> = Promise.resolve();
    let c2: Promise<unknown> = Promise.resolve();
    await act(async () => {
      c1 = (reactProps(btn).onClick as () => Promise<void>)();
      c2 = (reactProps(btn).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(101);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await Promise.all([c1, c2]);
      await flush();
    });
    // Cuenta atrás + UN timer del poller (una sola cadena tras el doble tap).
    expect(jest.getTimerCount()).toBe(2);
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(102);
    await act(async () => root.unmount());
  });

  it('Z · vencimiento por reloj LOCAL («El tiempo ha expirado»): el poller para tras la gracia (QR_LOCAL_EXPIRY_GRACE_MS) y un `paid` posterior NO confirma nada', async () => {
    const onPaid = jest.fn();
    const onTerminal = jest.fn();
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid, onTerminal }));
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
    });
    await act(async () => {
      jest.advanceTimersByTime(5100);
      await flush();
    });
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(onTerminal).toHaveBeenCalledWith('expired');
    // La consulta que estaba en vuelo termina en `pending`: dentro de la
    // gracia el poller aún reprograma (absorbe desfase de reloj)…
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
    });
    // …y al vencer la gracia se para: la consulta en vuelo se descarta y no
    // sale ninguna más en los 60 s siguientes.
    await act(async () => {
      jest.advanceTimersByTime(graceMs());
      await flush();
    });
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeLessThanOrEqual(3);
    await act(async () => {
      if (pending.length > 0) pending.shift()!.resolve('paid');
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(html(container)).not.toContain('Pago confirmado');
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    await act(async () => root.unmount());
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('Z · decisión documentada: un `paid` DENTRO de la gracia (pago iniciado justo antes de la hora) sí confirma: onPaid una vez y «Pago confirmado»; el poller ya no consulta más', async () => {
    const onPaid = jest.fn();
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
    });
    await act(async () => {
      jest.advanceTimersByTime(5100);
      await flush();
    });
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.shift()!.resolve('paid');
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 60_000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onPaid).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('Z · ya vencido AL ABRIR: el primer tic avisa onTerminal("expired") y, pasada la gracia, el poller se para sin más consultas', async () => {
    const onTerminal = jest.fn();
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() - 1000).toISOString(), onTerminal }));
    expect(html(container)).toContain('El tiempo ha expirado');
    await act(async () => {
      jest.advanceTimersByTime(1100);
      await flush();
    });
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(graceMs());
      await flush();
    });
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(5 * 60_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    await act(async () => root.unmount());
  });
});

// ---------------------------------------------------------------------------
// Casos borde de las partes A/B pedidos en cada ronda (regresión)
// ---------------------------------------------------------------------------

describe('Regresión · ajustes, propinas, terminal', () => {
  it('ajustes inválidos en organization_settings (tipos cambiados, presets vacíos, touch raro) → defaults saneados; touch fuera de la lista cae en auto', () => {
    const parsed = parseCustomerDisplaySettings({
      enabled: 'sí',
      tips: { enabled: 1, presets: [] },
      touch: 'siempre',
      idle: { mode: 'video', afterSeconds: -5, mediaUrls: ['javascript:alert(1)', 'https://ok.example/a.png'] },
    } as unknown);
    expect(typeof parsed.enabled).toBe('boolean');
    const pres = toDisplayPresentationSettings(parsed);
    expect(['auto', 'touch', 'no-touch']).toContain(pres.touch);
    expect(pres.touch).toBe('auto');
    expect(resolveTouch(false, pres.touch)).toBe(false);
    expect(resolveTouch(true, pres.touch)).toBe(true);
  });

  it('presets vacíos: pantalla NO táctil con propinas activadas no muestra la vista de propina; táctil sí (puede teclear «Otro»)', () => {
    const tip = sanitizeDisplayTip({ cartId: 'c1', base: 25_000, presets: [], allowCustom: true });
    expect(tip).not.toBeNull();
    const state = { mode: 'tip', cart: { lines: [{ id: 'l1', name: 'x', qty: 1, unitPrice: 25_000, lineTotal: 25_000 }], subtotal: 25_000, taxTotal: 0, taxIncluded: true, total: 25_000, lastChangedLineId: null }, payment: null, thanks: null, tip };
    expect(resolveView({ connected: true, updateRequired: false, state: state as never, touch: false })).not.toBe('tip');
    expect(resolveView({ connected: true, updateRequired: false, state: state as never, touch: true })).toBe('tip');
    expect(tipOptions(25_000, [])).toEqual([]);
  });

  it('subtotal 0 con propina: ningún preset produce importe > 0 y la selección por porcentaje da 0', () => {
    expect(computeTipAmount(0, 10)).toBe(0);
    expect(tipOptions(0, [5, 10, 15]).every((o) => o.amount === 0)).toBe(true);
    const sel = resolveTipSelection('c1', 0, { kind: 'percent', value: 10 });
    expect(sel.amount).toBe(0);
  });

  it('terminal sin vincular: la caja crea un UUID local, lo reutiliza, y un valor corrupto en localStorage se regenera', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const a = getOrCreateLocalTerminalId(storage);
    expect(isTerminalId(a)).toBe(true);
    expect(getOrCreateLocalTerminalId(storage)).toBe(a);
    store.set('pos_terminal_id', 'no-es-uuid');
    expect(readLocalTerminalId(storage)).toBeNull();
    const b = getOrCreateLocalTerminalId(storage);
    expect(isTerminalId(b)).toBe(true);
    expect(b).not.toBe('no-es-uuid');
    expect(setLocalTerminalId('tampoco', storage)).toBe(false);
  });

  it('dos cajas con la misma terminal (mismo pos_terminal_id, instanceId distinto): los mensajes se distinguen por instanceId y la pantalla puede dirigirse a uno', () => {
    const payment = toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 5000, qr: { kind: 'text', value: '0002010102' }, expiresAt: Date.now() + 60_000 });
    const a = { v: PROTOCOL_VERSION, t: 'state', seq: 1, instanceId: 'caja-A', terminalId: 'term-1', state: { mode: 'payment', cart: null, payment, thanks: null, tip: null } };
    const b = { ...a, instanceId: 'caja-B' };
    expect(isDownMessage(a)).toBe(true);
    expect(isDownMessage(b)).toBe(true);
    const claimToA = { v: PROTOCOL_VERSION, t: 'qr_paid_claim', seq: 1, instanceId: 'pantalla', terminalId: 'term-1', cartId: 'cart-1', toInstanceId: 'caja-A' };
    expect(isUpMessage(claimToA)).toBe(true);
    expect(isUpMessage({ ...claimToA, toInstanceId: '' })).toBe(false);
  });
});
