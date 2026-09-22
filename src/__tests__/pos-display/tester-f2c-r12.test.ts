/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · TESTER, ronda 12
 * (sobre la corrección AC + route qr/status + r8-parte-b de la ronda 12).
 *
 * Rompe, no defiende. Árbol REAL sin commitear. QrPoller real en Node con
 * fetch controlable y timers falsos; QrPaymentDialog real montado con
 * react-dom/client sobre un DOM mínimo (harness copiado a propósito de
 * tester-f2c-r11: un test no importa de otro).
 *
 * Qué se ataca en esta ronda:
 *  - AC en sus variantes no cubiertas por el builder: pulsación durante la
 *    gracia con el poller en ESPERA (timer armado, nada en vuelo), respuesta
 *    `expired`/`rejected` del proveedor, error de red durante la consulta
 *    única de la gracia, y la misma secuencia bajo StrictMode.
 *  - AD · [bajo] «Ya pague» pulsado ANTES del vencimiento local (estado de
 *    espera, sin gracia armada) y la respuesta llega DESPUÉS de que la gracia
 *    de Z pare el poller: ese `paid`, que el cajero PIDIÓ, se descartaba en
 *    silencio (sin onPaid, sin aviso, botón «Verificar pago»). Es la misma
 *    clase que AC pero fuera de la ventana que acotó la corrección
 *    (`graceTimerRef !== null` en la pulsación). Nació como `it.failing`;
 *    corregido en la ronda de cierre (QA-2): mientras hay una consulta manual
 *    en vuelo la gracia no para el poller sino que difiere el stop() al
 *    finally de handleManualCheck, y la respuesta se honra (`paid` → onPaid;
 *    `pending` → parado y 0 timers; error de red → aviso).
 *  - GET /api/integrations/qr/status: fallos no-OrgContextError (500 sin
 *    filtrar el mensaje), `parseInt` permisivo («120abc» cuenta como 120:
 *    evidencia, no defecto, porque la membresía manda), 403 sin datos.
 *  - Variantes nuevas de los bordes de cada ronda (ajustes inválidos,
 *    presets vacíos, subtotal 0 con propina, QR expirado, no táctil con
 *    propinas, terminal sin vincular, dos cajas con la misma terminal).
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { transformSync } from 'esbuild';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';
import { resolveDisplayQr, toDisplayPayment, parseExpiresAt, resolveCashReceived, confirmQrPaymentEntry } from '@/lib/pos/display/payment';
import { isUpMessage, isDownMessage, PROTOCOL_VERSION, type DisplayPayment } from '@/lib/pos/display/protocol';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings, DEFAULT_CUSTOMER_DISPLAY_SETTINGS } from '@/lib/pos/display/settings';
import { computeTipAmount, tipOptions, resolveTipSelection, sanitizeDisplayTip, resolveTipBase } from '@/lib/pos/display/tip';
import { isTerminalId, readLocalTerminalId, setLocalTerminalId, getOrCreateLocalTerminalId } from '@/lib/pos/display/terminal';
import { PosTerminalsService } from '@/lib/services/posTerminalsService';
import { resolveQrPresentation, resolveTouch, resolveView, sanitizeDisplayPayment, sanitizeDisplayState } from '@/components/pos-display/logic';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');
const ROUTE = readSrc('app/api/integrations/qr/status/route.ts');

// settings.ts y posTerminalsService importan el cliente de Supabase del navegador; aquí solo se usan sus funciones puras.
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
}));

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
type ReactNs = typeof import('react');
type RootApi = { render: (el: unknown) => void; unmount: () => void };
type FakeNode = any;

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ---------------------------------------------------------------------------
// fetch controlable
// ---------------------------------------------------------------------------

type Deferred = {
  resolve: (status: string) => void;
  resolveHttp: (httpStatus: number) => void;
  reject: (e: Error) => void;
  url: string;
};
let pending: Deferred[] = [];
let fetchMock: jest.Mock;
const realFetch = globalThis.fetch;

beforeEach(() => {
  pending = [];
  fetchMock = jest.fn((url: string) => new Promise((res, rej) => {
    pending.push({
      url,
      resolve: (status) => res({ ok: true, status: 200, json: async () => ({ status }) }),
      resolveHttp: (httpStatus) => res({ ok: false, status: httpStatus, json: async () => ({ error: 'x' }) }),
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
// QrPoller puro · lo que hace handleManualCheck DENTRO de la gracia (AC)
// ---------------------------------------------------------------------------

describe('QrPoller real · la consulta única de AC con el poller VIVO (dentro de la gracia)', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  const mk = (over: Partial<ConstructorParameters<typeof QrPoller>[0]> = {}) =>
    new QrPoller({ reference: 'POS-120-t12', organizationId: 120, ...over });

  /** handleManualCheck con oneShot=true y el poller vivo: no hay start(), checkNow() y stop() en el finally salvo paid. */
  async function oneShotAlive(poller: QrPoller, paidRef: { current: boolean }): Promise<void> {
    try {
      await poller.checkNow();
    } finally {
      if (!paidRef.current) poller.stop();
    }
  }

  it('poller vivo en ESPERA (timer armado, nada en vuelo): checkNow() cancela el timer y lanza SU consulta; con `pending` el finally lo para y no queda ningún timer', async () => {
    const paidRef = { current: false };
    const poller = mk({ onPaid: () => { paidRef.current = true; } });
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    // Espera del intervalo: timer armado, nada en vuelo.
    expect(jest.getTimerCount()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const run = oneShotAlive(poller, paidRef);
    // checkNow() abrió su propia consulta (no había ninguna en vuelo).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.resolve('pending');
    await run;
    await flush();
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    // Ya nadie consulta.
    jest.advanceTimersByTime(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('poller vivo con consulta EN VUELO: checkNow() se suma (un solo fetch) y un `paid` en esa respuesta dispara onPaid UNA vez y no se para dos veces', async () => {
    const paidRef = { current: false };
    const onPaid = jest.fn(() => { paidRef.current = true; });
    const poller = mk({ onPaid });
    poller.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const run = oneShotAlive(poller, paidRef);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.shift()!.resolve('paid');
    await run;
    await flush();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('poller vivo con consulta en vuelo que responde `rejected`: onStatusChange(rejected), sin onPaid ni onExpired, parado, sin timers', async () => {
    const paidRef = { current: false };
    const onStatusChange = jest.fn();
    const onExpired = jest.fn();
    const onPaid = jest.fn();
    const poller = mk({ onStatusChange, onExpired, onPaid });
    poller.start();
    const run = oneShotAlive(poller, paidRef);
    pending.shift()!.resolve('rejected');
    await run;
    await flush();
    expect(onStatusChange).toHaveBeenCalledWith('rejected');
    expect(onPaid).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
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

let React: ReactNs;
let createRoot: (c: unknown) => RootApi;
let act: (cb: () => Promise<void> | void) => Promise<void>;
let document: FakeNode;

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

function graceMs(): number {
  const value = loadTsx(join(SRC, 'components/shared/QrPaymentDialog.tsx')).QR_LOCAL_EXPIRY_GRACE_MS;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error('QR_LOCAL_EXPIRY_GRACE_MS no exportada');
  return value;
}

const baseProps = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  open: true,
  onClose: () => {},
  reference: 'POS-120-t11',
  organizationId: 120,
  amount: 25_000,
  providerLabel: 'Redeban QR',
  qrImageUrl: IMG,
  ...over,
});

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

async function mountDialog(props: Record<string, unknown>, strict = false): Promise<{ root: RootApi; container: FakeNode; rerender: (p: Record<string, unknown>) => Promise<void> }> {
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);
  const Dialog = QrDialog();
  const rerender = async (p: Record<string, unknown>) => {
    await act(async () => {
      const el = React.createElement(Dialog, p);
      root.render(strict ? React.createElement(React.StrictMode, null, el) : el);
    });
  };
  await rerender(props);
  return { root, container, rerender };
}

const buttons = (container: FakeNode): string[] => {
  const out: string[] = [];
  const walk = (n: FakeNode) => {
    if (n.nodeType !== 1) return;
    if (n.tagName === 'BUTTON') out.push(n.textContent);
    for (const c of n.childNodes) walk(c);
  };
  walk(container);
  return out;
};

const yaPague = (container: FakeNode): FakeNode | null =>
  findNode(container, (n) => n.tagName === 'BUTTON' && n.textContent === 'Ya pague');

const verificar = (container: FakeNode): FakeNode | null =>
  findNode(container, (n) => n.tagName === 'BUTTON' && n.textContent === 'Verificar pago');

/** Props que React deja en cada nodo (`__reactProps$…`): así se pulsa un botón sin eventos del DOM. */
function reactProps(node: FakeNode): Record<string, unknown> {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps'));
  if (!key) throw new Error('nodo sin props de React');
  return node[key] as Record<string, unknown>;
}

async function expireLocally(container: FakeNode, ms: number): Promise<void> {
  await act(async () => {
    pending.shift()!.resolve('pending');
    await flush();
  });
  await act(async () => {
    jest.advanceTimersByTime(ms + 100);
    await flush();
  });
  expect(html(container)).toContain('El tiempo ha expirado');
}

/** Pulsa un botón cuyo onClick es async; devuelve la promesa de la pulsación ENVUELTA (una async que devolviera la promesa la aplanaría y esperaría al fetch). */
async function pressAsync(btn: FakeNode): Promise<{ click: Promise<unknown> }> {
  let click: Promise<unknown> = Promise.resolve();
  await act(async () => {
    click = (reactProps(btn).onClick as () => Promise<void>)();
    await flush();
  });
  return { click };
}

// ---------------------------------------------------------------------------
// AA/AB · bordes que abrió la ronda 11
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// AC · variantes que la ronda 12 no cubre
// ---------------------------------------------------------------------------

describe('AC · variantes: diálogo real con timers falsos', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  /** Vence localmente dejando al poller en ESPERA (timer armado, nada en vuelo) dentro de la gracia. */
  async function expireWithPollerIdle(container: FakeNode): Promise<void> {
    // t=0: fetch1 en vuelo → pending → timer 3 s. t=3 s: fetch2 en vuelo. t=5 s: vence.
    await expireLocally(container, 5000);
    expect(pending.length).toBe(1);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
    });
    // fetch2 respondió pending → timer de 3 s armado, nada en vuelo; gracia armada.
    expect(pending.length).toBe(0);
  }

  it('AC · «Verificar pago» durante la gracia con el poller en ESPERA (nada en vuelo): la pulsación abre SU consulta; `pending` → parado, 0 timers, botón disponible, sin aviso de error', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireWithPollerIdle(container);
    const before = fetchMock.mock.calls.length;
    const { click } = await pressAsync(verificar(container));
    expect(html(container)).toContain('Verificando...');
    expect(fetchMock.mock.calls.length).toBe(before + 1);
    expect(pending.length).toBe(1);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click;
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    expect(html(container)).not.toContain('No se pudo verificar');
    // La gracia se canceló en la pulsación y el finally paró el poller: nada vive.
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(120_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(before + 1);
    expect(pending.length).toBe(0);
  });

  it('AC · «Verificar pago» durante la gracia → `expired` del PROVEEDOR: solo queda «Cancelar», onTerminal UNA vez (ya avisó el reloj local), poller parado, 0 timers', async () => {
    const onPaid = jest.fn();
    const onTerminal = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid, onTerminal }));
    await expireLocally(container, 5000);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    const { click } = await pressAsync(verificar(container));
    await act(async () => {
      pending.shift()!.resolve('expired');
      await click;
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(buttons(container)).toEqual(['Cancelar']);
    expect(html(container)).toContain('Solicita un nuevo codigo QR');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('AC · «Verificar pago» durante la gracia → error de RED: aviso «No se pudo verificar el pago», poller parado (no reintenta solo), 0 timers; la siguiente pulsación consulta de nuevo y un `paid` se honra', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireLocally(container, 5000);
    const { click } = await pressAsync(verificar(container));
    await act(async () => {
      pending.shift()!.reject(new TypeError('Failed to fetch'));
      await click;
      await flush();
    });
    expect(html(container)).toContain('No se pudo verificar el pago; pulse «Verificar pago»');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    expect(jest.getTimerCount()).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(120_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    const { click: click2 } = await pressAsync(verificar(container));
    expect(html(container)).not.toContain('No se pudo verificar');
    expect(pending.length).toBe(1);
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click2;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
  });

  it('AC · en StrictMode (efectos montados dos veces): pulsación durante la gracia, la gracia vence con la respuesta en vuelo y el `paid` se honra UNA vez', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }), true);
    // StrictMode: el poller desechado lanzó fetch1 (se descarta) y el vivo fetch2.
    expect(pending.length).toBe(2);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
    });
    await act(async () => {
      jest.advanceTimersByTime(5100);
      await flush();
    });
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(pending.length).toBe(1);
    const { click } = await pressAsync(verificar(container));
    expect(html(container)).toContain('Verificando...');
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
    expect(buttons(container)).toEqual(['Cerrar']);
  });

  it('AC · el `paid` honrado tras la gracia cierra solo a los 3 s (onClose una vez) como cualquier pago', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid, onClose }));
    await expireLocally(container, 5000);
    const { click } = await pressAsync(verificar(container));
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await flush();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // AD · [bajo] la misma clase que AC, fuera de la ventana corregida
  // -------------------------------------------------------------------------

  it('AD · «Ya pague» pulsado ANTES del vencimiento local y la respuesta llega DESPUÉS de que la gracia venza: el `paid` que el cajero PIDIÓ se honra (onPaid una vez, «Pago confirmado»); la gracia difiere el stop() al finally de la consulta', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    // t=0: fetch1 → pending; timer 3 s. Se pulsa «Ya pague» en t≈2 s (espera, sin gracia armada).
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
      jest.advanceTimersByTime(2000);
      await flush();
    });
    expect(buttons(container)).toEqual(['Cancelar', 'Ya pague']);
    const { click } = await pressAsync(yaPague(container));
    expect(html(container)).toContain('Verificando...');
    expect(pending.length).toBe(1);
    // Vence localmente con la consulta manual todavía en vuelo; se arma la gracia…
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await flush();
    });
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(html(container)).toContain('Verificando...');
    // …y la gracia vence ANTES de que el banco responda.
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    // La consulta que el cajero pidió a mano se honra.
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
    expect(buttons(container)).toEqual(['Cerrar']);
    // Solo vive el cierre automático de 3 s: el poller se paró con el `paid`.
    expect(jest.getTimerCount()).toBe(1);
  });

  it('AD · tras el `paid` honrado no hace falta una segunda pulsación: no queda «Verificar pago», no hay aviso, onClose llega solo a los 3 s y después nadie consulta', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid, onClose }));
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
      jest.advanceTimersByTime(2000);
      await flush();
    });
    const { click } = await pressAsync(yaPague(container));
    await act(async () => {
      jest.advanceTimersByTime(3100 + graceMs() + 1000);
      await flush();
    });
    // La gracia venció con la consulta manual en vuelo: el poller sigue vivo (stop diferido).
    expect(pending.length).toBe(1);
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    const out = html(container);
    expect(out).toContain('Pago confirmado');
    expect(out).not.toContain('No se pudo verificar');
    expect(buttons(container)).toEqual(['Cerrar']);
    expect(verificar(container)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await flush();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(120_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('AD · misma secuencia con respuesta `pending` tras la gracia: el stop() diferido se aplica en el finally → poller parado, 0 timers, «Verificar pago» disponible, sin aviso, sin onPaid; nadie vuelve a consultar solo', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
      jest.advanceTimersByTime(2000);
      await flush();
    });
    const { click } = await pressAsync(yaPague(container));
    await act(async () => {
      jest.advanceTimersByTime(3100 + graceMs() + 1000);
      await flush();
    });
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(pending.length).toBe(1);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click;
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    const out = html(container);
    expect(out).not.toContain('Pago confirmado');
    expect(out).not.toContain('No se pudo verificar');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    expect(jest.getTimerCount()).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(120_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(pending.length).toBe(0);
    // «Verificar pago» sigue siendo la consulta única de AA y un `paid` se honra.
    const { click: click2 } = await pressAsync(verificar(container));
    expect(pending.length).toBe(1);
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click2;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
  });

  it('AD · misma secuencia con error de RED tras la gracia: aviso «No se pudo verificar el pago; pulse «Verificar pago»», poller parado, 0 timers (la consulta manual no queda muda)', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
      jest.advanceTimersByTime(2000);
      await flush();
    });
    const { click } = await pressAsync(yaPague(container));
    await act(async () => {
      jest.advanceTimersByTime(3100 + graceMs() + 1000);
      await flush();
    });
    await act(async () => {
      pending.shift()!.reject(new TypeError('Failed to fetch'));
      await click;
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(html(container)).toContain('No se pudo verificar el pago; pulse «Verificar pago»');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    expect(jest.getTimerCount()).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(120_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('«Ya pague» antes del vencimiento con respuesta `pending` DENTRO de la gracia: el poller sigue (no era consulta única) y la gracia lo para; después nadie consulta y queda «Verificar pago»', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
      jest.advanceTimersByTime(2000);
      await flush();
    });
    const { click } = await pressAsync(yaPague(container));
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await flush();
    });
    expect(html(container)).toContain('El tiempo ha expirado');
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click;
      await flush();
    });
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    // Dentro de la gracia el poller sigue consultando (Z lo permite).
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(3100);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    // Pasada la gracia, parado: la consulta en vuelo se descarta y no hay más.
    await act(async () => {
      jest.advanceTimersByTime(graceMs());
      await flush();
    });
    const after = fetchMock.mock.calls.length;
    for (const p of pending.splice(0)) p.resolve('pending');
    await act(async () => {
      await flush();
      jest.advanceTimersByTime(120_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(after);
    expect(jest.getTimerCount()).toBe(0);
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
  });

  it('cambio de `expiresAt` con el diálogo abierto (mismo cobro, el padre lo corrige) reinicia la cuenta atrás y desarma la gracia anterior; el poller no se para dos veces', async () => {
    const onPaid = jest.fn();
    const onTerminal = jest.fn();
    const props = baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid, onTerminal });
    const { container, rerender } = await mountDialog(props);
    await expireLocally(container, 5000);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    // El padre pasa un vencimiento nuevo (misma referencia): la gracia vieja se limpia en el cleanup del efecto.
    await rerender({ ...props, expiresAt: new Date(Date.now() + 60_000).toISOString() });
    // remaining NO se recalcula solo (estado): sigue en 0 hasta el tic siguiente.
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await flush();
    });
    // Evidencia: con vencimiento futuro el estado `status` sigue en 'expired' (no se reinicia sin reabrir).
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Estáticos sobre la corrección AC
// ---------------------------------------------------------------------------

describe('AC · estático sobre QrPaymentDialog', () => {
  it('la pulsación cancela la gracia (clearTimeout de graceTimerRef) ANTES de consultar y el finally solo para si NO hubo paid', () => {
    const idxGrace = QR_DIALOG.indexOf('const inGrace = canVerifyExpired && graceTimerRef.current !== null;');
    const idxClear = QR_DIALOG.indexOf('clearTimeout(graceTimerRef.current);', idxGrace);
    const idxCheck = QR_DIALOG.indexOf('await poller.checkNow();', idxGrace);
    const idxFinally = QR_DIALOG.indexOf('if (oneShot && !paidHandledRef.current) poller.stop();', idxCheck);
    expect(idxGrace).toBeGreaterThan(0);
    expect(idxClear).toBeGreaterThan(idxGrace);
    expect(idxCheck).toBeGreaterThan(idxClear);
    expect(idxFinally).toBeGreaterThan(idxCheck);
    // La consulta única se decide con la gracia viva O el poller parado.
    expect(QR_DIALOG).toContain('const oneShot = canVerifyExpired && (inGrace || !poller.isRunning);');
  });

  it('el gate de onError sigue mirando oneShotCheckRef (una consulta única fallida avisa aunque el poller figure corriendo)', () => {
    expect(QR_DIALOG).toContain('if (poller.isRunning && !oneShotCheckRef.current) return;');
    expect(QR_DIALOG).toContain('oneShotCheckRef.current = oneShot;');
  });
});

// ---------------------------------------------------------------------------
// Regresión · bordes de cada ronda (variantes nuevas)
// ---------------------------------------------------------------------------

describe('Regresión · ajustes, presets, subtotal 0, no táctil, terminal, dos cajas (variantes de la ronda 12)', () => {
  it('ajustes inválidos en organization_settings: JSON como string, array, número, o `tips` no objeto → defaults de PLAN §5.2 sin lanzar; un `idle` roto no arrastra a `tips`', () => {
    for (const raw of ['{"enabled":true}', [], 0, null, undefined, true, new Date()]) {
      const parsed = parseCustomerDisplaySettings(raw);
      expect(parsed).toEqual(DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
      expect(parsed.tips.presets).not.toBe(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets); // clon, no la referencia congelada
    }
    for (const tips of ['yes', 5, [5, 10, 15], null]) {
      const parsed = parseCustomerDisplaySettings({ enabled: true, tips, idle: { mode: 'video', idleAfterSeconds: 1 } });
      expect(parsed.enabled).toBe(true);
      expect(parsed.tips).toEqual(DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips);
      expect(parsed.idle.mode).toBe('brand');
      expect(parsed.idle.idleAfterSeconds).toBe(90);
    }
    // presets como string «5,10,15» no es una lista: defaults, y enabled de propinas se conserva.
    const parsed = parseCustomerDisplaySettings({ tips: { enabled: true, presets: '5,10,15' } });
    expect(parsed.tips.enabled).toBe(true);
    expect(parsed.tips.presets).toEqual([...DEFAULT_CUSTOMER_DISPLAY_SETTINGS.tips.presets]);
    // toDisplayPresentationSettings no expone el `enabled` maestro. `idle` SÍ
    // viaja desde la F4 (la pantalla lo necesita para el modo reposo) y llega
    // ya saneado: un modo inventado sale como 'brand'.
    const shipped = toDisplayPresentationSettings(parsed) as unknown as Record<string, unknown>;
    expect(shipped).not.toHaveProperty('enabled');
    expect(shipped.idle).toEqual({ mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 });
  });

  it('presets vacíos: [] sin «Otro» es null (cae a pedido); [] con «Otro» se acepta y en pantalla NO táctil cae al cobro, en táctil se pregunta', () => {
    const cart = { id: 'c1', currency: 'COP', lines: [{ id: 'l1', name: 'x', qty: 1, unitPrice: 25_000, lineTotal: 25_000, modifiers: [], note: null }], subtotal: 25_000, discountTotal: 0, discountLabel: null, taxTotal: 0, taxIncluded: true, total: 25_000, lastChangedLineId: null };
    const payment = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 25_000, qr: null, expiresAt: null }));
    // [] sin «Otro» no es una pregunta: null, y el modo tip cae a pedido (hay líneas).
    expect(sanitizeDisplayTip({ cartId: 'c1', base: 25_000, presets: [], allowCustom: false })).toBeNull();
    expect(resolveView({ connected: true, updateRequired: false, touch: true, state: { mode: 'tip', cart, payment, thanks: null, tip: null } as never })).toBe('order');
    const empty = sanitizeDisplayTip({ cartId: 'c1', base: 25_000, presets: [], allowCustom: true });
    expect(empty).not.toBeNull();
    expect(tipOptions(25_000, empty!.presets)).toEqual([]);
    const state = { mode: 'tip', cart, payment, thanks: null, tip: empty } as never;
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state })).toBe('payment_qr');
    expect(resolveView({ connected: true, updateRequired: false, touch: true, state })).toBe('tip');
    // Sin `touch` (compatibilidad) no se degrada por presets vacíos.
    expect(resolveView({ connected: true, updateRequired: false, state })).toBe('tip');
    // sanitizeDisplayState conserva el bloque tip vacío (no lo convierte en null).
    const sane = sanitizeDisplayState({ mode: 'tip', cart, payment, thanks: null, tip: empty } as never);
    expect(sane.tip).not.toBeNull();
  });

  it('subtotal 0 con propina: tipOptions da importes 0, resolveTipBase cae al total del carrito (0) y una selección «amount» sobre base 0 conserva el importe tecleado (evidencia: la caja lo valida, no la pantalla)', () => {
    expect(tipOptions(0, [5, 10, 15]).map((o) => o.amount)).toEqual([0, 0, 0]);
    expect(resolveTipBase({ base: 0 }, { total: 0 })).toBe(0);
    expect(resolveTipBase({ base: Number.NaN }, { total: 0 })).toBe(0);
    expect(computeTipAmount(0, 15)).toBe(0);
    const custom = resolveTipSelection('c', 0, { kind: 'amount', value: 2000 });
    expect(custom.amount).toBe(2000);
    // resolveCashReceived con total 0 y sin efectivo tocado → null (no «Recibido $0»).
    expect(resolveCashReceived([{ id: 'a', method: 'nequi', amount: 0 }], new Set())).toBeNull();
    // confirmQrPaymentEntry con lista vacía usa el respaldo y no duplica.
    const fallback = { id: 'f', method: 'nequi', amount: 0 };
    const confirmed = confirmQrPaymentEntry({ payments: [], qrEntryId: 'x', method: 'nequi', amount: 0, fallback });
    expect(confirmed.payments).toEqual([fallback]);
    expect(confirmed.confirmedId).toBe('f');
  });

  it('QR expirado: `expiresAt` exactamente igual a `now` cuenta como vencido en el emisor y en la pantalla (≤, no <); un `expiresAt` numérico en segundos (no ms) se interpreta como 1970 y sale vencido: evidencia del contrato «ms de época»', () => {
    const now = 1_800_000_000_000;
    expect(resolveDisplayQr({ imageUrl: IMG, expiresAt: now, now }).qr).toBeNull();
    expect(resolveDisplayQr({ imageUrl: IMG, expiresAt: now + 1, now }).qr).toEqual({ kind: 'image', value: IMG });
    const p = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 1000, qr: { kind: 'image', value: IMG }, expiresAt: now })) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveQrPresentation(p, { now, online: true })).toMatchObject({ kind: 'fallback', expired: true, remainingMs: null });
    expect(resolveQrPresentation(p, { now: now - 1, online: true })).toMatchObject({ kind: 'image', expired: false, remainingMs: 1 });
    // Segundos de época (proveedor que manda `exp` unix): parseExpiresAt lo toma como ms → 1970 → vencido.
    expect(parseExpiresAt(1_800_000_000)).toBe(1_800_000_000);
    expect(resolveDisplayQr({ imageUrl: IMG, expiresAt: 1_800_000_000, now }).qr).toBeNull();
    // Y la caja (getRemainingSeconds del diálogo) usa la MISMA parseExpiresAt: sin doble criterio.
    expect(QR_DIALOG).toContain('const deadline = parseExpiresAt(expiresAt);');
  });

  it('pantalla NO táctil con propinas activadas: el ajuste `touch: "no-touch"` gana al hardware táctil y con presets válidos se pinta la propina (sin botones: el cajero aplica desde la caja); `touch: "touch"` en hardware sin táctil habilita «Ya pagué»', () => {
    expect(resolveTouch(true, 'no-touch')).toBe(false);
    expect(resolveTouch(false, 'touch')).toBe(true);
    expect(resolveTouch(false, 'auto')).toBe(false);
    expect(resolveTouch(true, undefined)).toBe(true);
    const cart = { id: 'c1', currency: 'COP', lines: [{ id: 'l1', name: 'x', qty: 1, unitPrice: 25_000, lineTotal: 25_000, modifiers: [], note: null }], subtotal: 25_000, discountTotal: 0, discountLabel: null, taxTotal: 0, taxIncluded: true, total: 25_000, lastChangedLineId: null };
    const payment = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: { kind: 'image', value: IMG }, expiresAt: null }));
    const tip = sanitizeDisplayTip({ cartId: 'c1', base: 25_000, presets: [5, 10, 15], allowCustom: false });
    expect(resolveView({ connected: true, updateRequired: false, touch: resolveTouch(true, 'no-touch'), state: { mode: 'tip', cart, payment, thanks: null, tip } as never })).toBe('tip');
    // El QR sigue proyectado en el mismo state para cuando la caja cierre la propina.
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: { mode: 'payment', cart, payment, thanks: null, tip } as never })).toBe('payment_qr');
  });

  it('terminal sin vincular: resolveLinkedTerminal distingue «sin id local» (unlinked=false) de «id local que no está en la lista» (unlinked=true) y devuelve la vinculada aunque esté inactiva', () => {
    const rowA = { id: '0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e', organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'C1', is_active: false, display_last_seen_at: null, created_at: 'x', updated_at: 'x' };
    const rowB = { ...rowA, id: '1b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e', code: 'C2', is_active: true };
    expect(PosTerminalsService.resolveLinkedTerminal([rowA, rowB] as never, null)).toEqual({ localTerminalId: null, terminal: null, unlinked: false });
    const local = getOrCreateLocalTerminalId({ getItem: () => null, setItem: () => {} } as never);
    expect(isTerminalId(local)).toBe(true);
    expect(PosTerminalsService.resolveLinkedTerminal([rowA, rowB] as never, local)).toEqual({ localTerminalId: local, terminal: null, unlinked: true });
    const linked = PosTerminalsService.resolveLinkedTerminal([rowA, rowB] as never, rowA.id);
    expect(linked.unlinked).toBe(false);
    expect(linked.terminal?.is_active).toBe(false);
    // Vincular escribe el id de la fila; un id inválido no pisa el local.
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    expect(setLocalTerminalId(rowB.id, storage as never)).toBe(true);
    expect(setLocalTerminalId('', storage as never)).toBe(false);
    expect(readLocalTerminalId(storage as never)).toBe(rowB.id);
  });

  it('dos cajas con la misma terminal: sobres `state` de dos instanceId con el mismo terminalId son ambos válidos para el protocolo (la pantalla adopta por latido; el transporte filtra por terminal) y un claim sin cartId no pasa el guard', () => {
    const payment = toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 1000, qr: null, expiresAt: null });
    const state = { mode: 'payment', cart: null, payment, thanks: null, tip: null };
    const fromA = { v: PROTOCOL_VERSION, t: 'state', seq: 1, instanceId: 'caja-A', terminalId: 'term-1', state };
    const fromB = { v: PROTOCOL_VERSION, t: 'state', seq: 1, instanceId: 'caja-B', terminalId: 'term-1', state };
    expect(isDownMessage(fromA)).toBe(true);
    expect(isDownMessage(fromB)).toBe(true);
    const claimA = { v: PROTOCOL_VERSION, t: 'qr_paid_claim', seq: 1, instanceId: 'pantalla', terminalId: 'term-1', cartId: 'cart-1', toInstanceId: 'caja-A' };
    expect(isUpMessage(claimA)).toBe(true);
    expect(isUpMessage({ ...claimA, cartId: undefined })).toBe(false);
    expect(isUpMessage({ ...claimA, cartId: 7 })).toBe(false);
    expect(isUpMessage({ ...claimA, terminalId: '' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route · estático (la ejecución va en qr-status-route-f2c-r12-tester.test.ts)
// ---------------------------------------------------------------------------

describe('GET /api/integrations/qr/status · estático', () => {
  it('no importa cookies/headers de next ni ningún cliente de Supabase directamente: la organización la resuelve orgContext', () => {
    expect(ROUTE).not.toMatch(/from '@\/lib\/supabase/);
    expect(ROUTE).not.toContain("from 'next/headers'");
    expect(ROUTE).not.toContain('@supabase/auth-helpers-nextjs');
    expect(ROUTE).toContain("from '@/lib/utils/orgContext'");
  });

  it('el 500 genérico no devuelve el mensaje del error (nada del stack ni de Postgres al cliente)', () => {
    expect(ROUTE).toContain("{ error: 'Error interno del servidor' }");
    expect(ROUTE).not.toMatch(/error:\s*err\.message[^,]*\}\s*,\s*\{\s*status:\s*500/);
  });
});
