/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · TESTER, ronda 10
 * (cuarta pasada: sobre la corrección X/Y/Z de la ronda 10 del builder).
 *
 * Rompe, no defiende. Árbol REAL sin commitear. QrPoller real en Node con
 * fetch controlable y timers falsos; QrPaymentDialog real montado con
 * react-dom/client sobre un DOM mínimo (harness copiado a propósito de
 * tester-f2c-r9: un test no importa de otro).
 *
 * Hallazgos de esta ronda (nacieron como `it.failing`; RESUELTOS en la ronda
 * 11 del builder y convertidos en `it` que afirman la corrección):
 *  AA · [medio] Consecuencia de Z: pasada la gracia (30 s tras el vencimiento
 *      por reloj LOCAL) el poller se para Y el diálogo esconde «Ya pague»
 *      (isWaiting = false). El cajero se queda sin NINGUNA vía desde la caja
 *      para verificar un pago que el banco confirma 30-120 s después del
 *      escaneo (flujo normal de Nequi/Bancolombia) o con un reloj local
 *      adelantado > 30 s. El webhook (paymentConfirmation.ts) inserta en
 *      `payments` sin `source`/`source_id` ni vínculo con la venta: la venta
 *      sigue «Falta dinero», el cajero genera otro QR y el cliente paga dos
 *      veces. Antes de Z el poller seguía consultando ~24 min y ese `paid`
 *      tardío sí cerraba la entrada. RESUELTO: en el estado vencido por reloj
 *      local SIN veredicto del proveedor (`providerTerminal` false) queda el
 *      botón «Verificar pago»: UNA consulta por pulsación (start + checkNow +
 *      stop), un `paid` confirma la entrada, un `pending` deja el poller
 *      parado (no vuelven los ~24 min que Z retiró), un error de red se avisa.
 *      Tras expired/rejected/cancelled del proveedor no hay botón.
 *  AB · [bajo, estático] Al REABRIR el diálogo para un QR nuevo, `status`
 *      ('expired' del QR anterior) y `remaining` (0) solo se reiniciaban en el
 *      efecto pasivo [open]: el primer render con open=true pintaba «El tiempo
 *      ha expirado» sin código ni «Ya pague» durante un frame. RESUELTO: el
 *      reinicio ocurre DURANTE el render al cambiar `open` (`openSeen`, patrón
 *      de estado derivado de React); el efecto solo reinicia refs.
 *
 * Verificado y en verde (sin hallazgo): Y con stop() desde onError de red,
 * stop() síncrono desde onStatusChange, checkNow() nunca rechaza, backoff con
 * tope y reinicio, gracia cancelada al cerrar y sin efecto sobre el QR
 * siguiente, `expired` del proveedor dentro de la gracia, paid dentro de la
 * gracia + cierre automático, StrictMode (doble efecto) con un solo onPaid,
 * reapertura limpia tras un vencimiento local, ajustes inválidos, presets
 * raros, base 0, QR vencido exactamente en `now` en los dos extremos,
 * terminal sin vincular y dos cajas con la misma terminal.
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { transformSync } from 'esbuild';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';
import { resolveDisplayQr, toDisplayPayment, parseExpiresAt, isAmountWithinTotal } from '@/lib/pos/display/payment';
import { isDownMessage, isUpMessage, PROTOCOL_VERSION, type DisplayPayment } from '@/lib/pos/display/protocol';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings, isValidTipPresets } from '@/lib/pos/display/settings';
import { computeTipAmount, tipOptions, resolveTipSelection, sanitizeDisplayTip } from '@/lib/pos/display/tip';
import { getOrCreateLocalTerminalId, isTerminalId, readLocalTerminalId } from '@/lib/pos/display/terminal';
import { resolveQrPresentation, resolveTouch, resolveView, sanitizeDisplayPayment } from '@/components/pos-display/logic';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');
const CONFIRMATION = readSrc('lib/services/integrations/qrShared/paymentConfirmation.ts');

// settings.ts importa el cliente de Supabase del navegador; aquí solo se usan sus funciones puras.
jest.mock('@/lib/supabase/config', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) },
}));

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
type ReactNs = typeof import('react');
type RootApi = { render: (el: unknown) => void; unmount: () => void };
type FakeNode = any;

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ---------------------------------------------------------------------------
// fetch controlable
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
// QrPoller puro
// ---------------------------------------------------------------------------

describe('QrPoller real · bordes de Y (reentrada) y de la cadena única', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  const mk = (over: Partial<ConstructorParameters<typeof QrPoller>[0]> = {}) =>
    new QrPoller({ reference: 'POS-120-t10', organizationId: 120, ...over });

  it('stop() + start() desde onError de RED (fetch rechazado): una sola cadena, inFlight de la generación nueva, y checkNow() se suma a ella', async () => {
    const poller = mk({
      onError: () => {
        poller.stop();
        poller.start();
      },
    });
    poller.start();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.shift()!.reject(new Error('red caída'));
    await flush();
    // El reinicio anidado lanzó su consulta; la vieja no reprogramó timer.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
    const joined = poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.resolve('pending');
    await joined;
    await flush();
    expect(jest.getTimerCount()).toBe(1);
    jest.advanceTimersByTime(3000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    poller.stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stop() SÍNCRONO desde onStatusChange("pending"): no se reprograma ningún timer ni queda inFlight', async () => {
    const poller = mk({ onStatusChange: () => poller.stop() });
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
    // checkNow() con el poller parado es un no-op que resuelve.
    await expect(poller.checkNow()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('checkNow() NUNCA rechaza: con red caída resuelve, avisa onError y reprograma una sola vez', async () => {
    const onError = jest.fn();
    const poller = mk({ onError });
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    const p = poller.checkNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.reject(new Error('timeout'));
    await expect(p).resolves.toBeUndefined();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(true);
    expect(jest.getTimerCount()).toBe(1);
    poller.stop();
  });

  it('un onPaid que LANZA no deja timers ni dispara onError: el poller ya estaba parado', async () => {
    const onError = jest.fn();
    const poller = mk({ onPaid: () => { throw new Error('boom'); }, onError });
    poller.start();
    pending.shift()!.resolve('paid');
    await flush();
    expect(poller.isRunning).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('backoff: a partir del 5.º intento el intervalo se duplica con tope 15 s, y start() tras stop() vuelve al base', async () => {
    const poller = mk({ intervalMs: 3000 });
    poller.start();
    const intervals: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      pending.shift()!.resolve('pending');
      await flush();
      const before = fetchMock.mock.calls.length;
      // Se mide cuándo sale la siguiente consulta avanzando de 1 s en 1 s.
      let waited = 0;
      while (fetchMock.mock.calls.length === before && waited < 20_000) {
        jest.advanceTimersByTime(1000);
        waited += 1000;
      }
      intervals.push(waited);
    }
    expect(intervals.slice(0, 4)).toEqual([3000, 3000, 3000, 3000]);
    expect(intervals.slice(4)).toEqual([6000, 12_000, 15_000, 15_000]);
    poller.stop();
    pending = []; // la consulta de la generación vieja ya no cuenta
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    const before = fetchMock.mock.calls.length;
    jest.advanceTimersByTime(3000);
    expect(fetchMock.mock.calls.length).toBe(before + 1);
    poller.stop();
  });

  it('maxAttempts se cuenta por consulta REAL: 3 checkNow() manuales sobre respuestas resueltas consumen 3 intentos', async () => {
    const onError = jest.fn();
    const poller = mk({ maxAttempts: 3, onError });
    poller.start();
    pending.shift()!.resolve('pending');
    await flush();
    for (let i = 0; i < 2; i += 1) {
      const p = poller.checkNow();
      pending.shift()!.resolve('pending');
      await p;
      await flush();
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await poller.checkNow();
    expect(onError).toHaveBeenCalledTimes(1);
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
  reference: 'POS-120-t10',
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

// ---------------------------------------------------------------------------
// Z · consecuencias de la gracia
// ---------------------------------------------------------------------------

describe('Z · gracia tras el vencimiento local: bordes', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

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

  it('AA · pasada la gracia el cajero conserva UNA vía para verificar un pago tardío: «Verificar pago» en el estado vencido', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireLocally(container, 5000);
    await act(async () => {
      if (pending.length > 0) pending.shift()!.resolve('pending');
      await flush();
    });
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    expect(html(container)).toContain('Si el cliente ya pagó, pulse «Verificar pago»');
    // El poller sigue parado: nadie consulta solo.
    const before = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(before);
  });

  it('AA · «Verificar pago» tras la gracia: UNA consulta; `paid` real del proveedor confirma la entrada (onPaid una vez, «Pago confirmado»)', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireLocally(container, 5000);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    pending = [];
    const before = fetchMock.mock.calls.length;
    const btn = verificar(container);
    expect(btn).not.toBeNull();
    let click: Promise<unknown> = Promise.resolve();
    await act(async () => {
      click = (reactProps(btn).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    expect(html(container)).toContain('Verificando...');
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
    expect(buttons(container)).toEqual(['Cerrar']);
    // Y el webhook que «reconcilia» sigue sin vincular el pago con la venta: `payments` sin source/source_id ni sale
    // (fuera del alcance de la Parte C; por eso la vía desde la caja importa).
    const paymentRow = /const paymentRow: Record<string, unknown> = \{([\s\S]*?)\};/.exec(CONFIRMATION);
    expect(paymentRow).not.toBeNull();
    expect(paymentRow![1]).not.toMatch(/source|sale_id/);
  });

  it('AA · «Verificar pago» con `pending`: el poller vuelve a pararse (no reanuda los ~24 min de Z) y el botón sigue disponible para otra pulsación', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireLocally(container, 5000);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    pending = [];
    const before = fetchMock.mock.calls.length;
    let click: Promise<unknown> = Promise.resolve();
    await act(async () => {
      click = (reactProps(verificar(container)).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click;
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    // Sin timer del poller: pasa un minuto y nadie consulta.
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    // Segunda pulsación: otra consulta, esta vez `paid`.
    await act(async () => {
      click = (reactProps(verificar(container)).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(before + 2);
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('AA · «Verificar pago» con la red caída: se avisa («No se pudo verificar») sin reintento automático; el botón sigue', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireLocally(container, 5000);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    pending = [];
    const before = fetchMock.mock.calls.length;
    let click: Promise<unknown> = Promise.resolve();
    await act(async () => {
      click = (reactProps(verificar(container)).onClick as () => Promise<void>)();
      await flush();
    });
    await act(async () => {
      pending.shift()!.reject(new Error('red caída'));
      await click;
      await flush();
    });
    const out = html(container);
    expect(out).toContain('No se pudo verificar el pago; pulse «Verificar pago»');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('AA · el aviso de W («no se pudo verificar», poller muerto por maxAttempts) NO sobrevive al vencimiento local: el estado vencido arranca limpio', async () => {
    // 100 consultas `pending` agotan maxAttempts (intervalo 3 s, backoff hasta 15 s: ~24 min); el QR vence después.
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 40 * 60_000).toISOString() }));
    for (let i = 0; i < 100; i += 1) {
      await act(async () => {
        if (pending.length > 0) pending.shift()!.resolve('pending');
        await flush();
        jest.advanceTimersByTime(15_000);
        await flush();
      });
    }
    expect(html(container)).toContain('No se pudo verificar el pago; pulse «Ya pague»');
    await act(async () => {
      jest.advanceTimersByTime(40 * 60_000);
      await flush();
    });
    const out = html(container);
    expect(out).toContain('El tiempo ha expirado');
    expect(out).not.toContain('No se pudo verificar');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
  });

  it('AA · veredicto del PROVEEDOR (expired dentro de la gracia): sin «Verificar pago», solo «Cancelar»; ya no hay nada que consultar', async () => {
    const onTerminal = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onTerminal }));
    await expireLocally(container, 5000);
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    await act(async () => {
      while (pending.length > 0) pending.shift()!.resolve('expired');
      await flush();
    });
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(buttons(container)).toEqual(['Cancelar']);
    expect(html(container)).toContain('Solicita un nuevo codigo QR');
  });

  it('AA · «Verificar pago» DURANTE la gracia (poller vivo): se suma a la consulta en vuelo sin abrir otra; con `pending` es la consulta única y el poller queda parado (AC, ronda 12)', async () => {
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString() }));
    await expireLocally(container, 5000);
    // Consulta en vuelo del poller vivo: la pulsación se suma a ella (V).
    const before = fetchMock.mock.calls.length;
    let click: Promise<unknown> = Promise.resolve();
    await act(async () => {
      click = (reactProps(verificar(container)).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(before);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click;
      await flush();
    });
    // AC (ronda 12): la pulsación dentro de la gracia la cancela y es la
    // consulta única de AA: al terminar sin pago el poller se para (Z se
    // cumple igual) y no queda ningún timer. Antes seguía consultando hasta
    // que la gracia lo parara, y ese stop() podía descartar un `paid` pedido.
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(jest.getTimerCount()).toBe(0);
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
  });

  it('la gracia se cancela al CERRAR: reabrir con un QR nuevo dentro de esos 30 s no para el poller del nuevo', async () => {
    const onPaid = jest.fn();
    const { container, rerender } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 3000).toISOString(), onPaid }));
    await expireLocally(container, 3000);
    // Cancelar → cerrado; el timer de gracia debe morir con el efecto.
    await rerender(baseProps({ open: false, expiresAt: new Date(Date.now() - 1).toISOString(), onPaid }));
    const timersAfterClose = jest.getTimerCount();
    expect(timersAfterClose).toBe(0);
    pending = [];
    await rerender(baseProps({ open: true, reference: 'POS-120-t10-b', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), onPaid }));
    expect(pending.length).toBe(1);
    expect(pending[0].url).toContain('POS-120-t10-b');
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
    });
    // Pasa la gracia del QR anterior: el nuevo sigue vivo y consultando.
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 5000);
      await flush();
    });
    expect(pending.length).toBeGreaterThan(0);
    const out = html(container);
    expect(out).not.toContain('El tiempo ha expirado');
    expect(yaPague(container)).not.toBeNull();
    await act(async () => {
      pending.shift()!.resolve('paid');
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('`expired` del proveedor DENTRO de la gracia: el poller para en el acto, onTerminal una sola vez, y el timer de gracia no rompe nada', async () => {
    const onTerminal = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 3000).toISOString(), onTerminal }));
    await expireLocally(container, 3000);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.shift()!.resolve('expired');
      await flush();
    });
    expect(onTerminal).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 60_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(html(container)).toContain('El tiempo ha expirado');
  });

  it('paid dentro de la gracia: onPaid una vez, onClose a los 3 s UNA vez, y la gracia posterior no reabre ni duplica', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const onTerminal = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 3000).toISOString(), onPaid, onClose, onTerminal }));
    await expireLocally(container, 3000);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.shift()!.resolve('paid');
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await flush();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 60_000);
      await flush();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('StrictMode (efectos dobles en desarrollo): el poller de la primera pasada muere; su `paid` se descarta y el de la segunda confirma UNA vez', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 60_000).toISOString(), onPaid }), true);
    // Dos fetch: el del poller desechado por el cleanup y el del vivo.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      pending.shift()!.resolve('paid'); // el muerto
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    await act(async () => {
      pending.shift()!.resolve('paid'); // el vivo
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
    // Solo queda el timer de cierre automático (la cuenta atrás siguió hasta aquí, y el poller vivo se paró).
    expect(jest.getTimerCount()).toBeLessThanOrEqual(2);
  });

  it('reapertura tras un vencimiento local: tras los efectos, el QR nuevo se pinta con «Ya pague» y sin «expirado» (AB queda como estático)', async () => {
    const { container, rerender } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 2000).toISOString() }));
    await expireLocally(container, 2000);
    await rerender(baseProps({ open: false, expiresAt: new Date(Date.now() - 1).toISOString() }));
    await rerender(baseProps({ open: true, reference: 'POS-120-t10-c', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }));
    const out = html(container);
    expect(out).not.toContain('El tiempo ha expirado');
    expect(out).toContain('<img');
    expect(yaPague(container)).not.toBeNull();
    expect(out).toMatch(/Expira en (10:00|09:5\d)/);
  });

  it('AB · estático: `status`/`remaining` se reinician DURANTE el render al cambiar `open` (openSeen), no solo en el efecto pasivo', () => {
    // Patrón de estado derivado: el bloque `if (open !== openSeen)` reinicia el
    // estado renderizado antes de pintar; el efecto [open] ya no lo toca.
    const derived = /const \[openSeen, setOpenSeen\] = useState<boolean>\(open\);\n  if \(open !== openSeen\) \{\n    setOpenSeen\(open\);\n    if \(open\) \{\n      setStatus\('pending'\);\n      setRemaining\(getRemainingSeconds\(expiresAt\)\);/.exec(QR_DIALOG);
    expect(derived).not.toBeNull();
    const openEffect = QR_DIALOG.slice(QR_DIALOG.indexOf('useEffect(() => {\n    if (!open) return;'), QR_DIALOG.indexOf('const poller = new QrPoller('));
    expect(openEffect).not.toContain("setStatus('pending')");
    expect(openEffect).not.toContain('setRemaining(');
    // El bloque derivado va ANTES de cualquier hook que dependa de esos estados.
    expect(QR_DIALOG.indexOf('const [openSeen, setOpenSeen]')).toBeLessThan(QR_DIALOG.indexOf('const pollerRef = useRef'));
  });
});

// ---------------------------------------------------------------------------
// U/X · vencimiento en el límite, en los dos extremos
// ---------------------------------------------------------------------------

describe('X · el límite exacto del vencimiento coincide en caja y pantalla', () => {
  it('expiresAt === now: el emisor deja qr null (≤ now) y la pantalla lo declara vencido; un ms después de ahora, vivo en los dos', () => {
    const now = Date.UTC(2026, 8, 22, 15, 0, 0);
    const exact = resolveDisplayQr({ imageUrl: IMG, expiresAt: new Date(now).toISOString(), now });
    expect(exact.qr).toBeNull();
    expect(exact.expiresAt).toBe(now);
    const paymentExact = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 1000, qr: exact.qr, expiresAt: exact.expiresAt })) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveQrPresentation(paymentExact, { now, online: true }).expired).toBe(true);
    const alive = resolveDisplayQr({ imageUrl: IMG, expiresAt: now + 1, now });
    expect(alive.qr).toEqual({ kind: 'image', value: IMG });
    const paymentAlive = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 1000, qr: alive.qr, expiresAt: alive.expiresAt })) as Extract<DisplayPayment, { method: 'qr' }>;
    const pres = resolveQrPresentation(paymentAlive, { now, online: true });
    expect(pres.expired).toBe(false);
    expect(pres.kind).toBe('image');
    expect(pres.remainingMs).toBe(1);
  });

  it('parseExpiresAt: epoch como STRING («1758560000000») no es fecha (Date lo rechaza) → sin cuenta atrás en la caja, igual que en la pantalla', () => {
    expect(parseExpiresAt('1758560000000')).toBeNull();
    expect(parseExpiresAt(1758560000000)).toBe(1758560000000);
    expect(parseExpiresAt(Number.NaN)).toBeNull();
    expect(parseExpiresAt(Number.POSITIVE_INFINITY)).toBeNull();
    expect(resolveDisplayQr({ imageUrl: IMG, expiresAt: '1758560000000' }).expiresAt).toBeNull();
  });

  it('guard del protocolo (superficial por diseño) + saneado de la pantalla: qr null/expiresAt 0 pasan; NaN/Infinity y un qr de forma rara los normaliza sanitizeDisplayPayment, nunca llegan a la vista', () => {
    const base = { v: PROTOCOL_VERSION, t: 'state', seq: 1, instanceId: 'caja-1', terminalId: 'term-1' };
    const mk = (payment: unknown) => ({ ...base, state: { mode: 'payment', cart: null, payment, thanks: null, tip: null } });
    expect(isDownMessage(mk({ method: 'qr', total: 1000, provider: 'Nequi', qr: null, expiresAt: 0 }))).toBe(true);
    // El guard solo mira la forma (method); lo demás lo sanea la pantalla (documentado en protocol.ts).
    expect(isDownMessage(mk({ method: 'qr', total: 1000, provider: 'Nequi', qr: null, expiresAt: Number.NaN }))).toBe(true);
    const nan = sanitizeDisplayPayment({ method: 'qr', total: 1000, provider: 'Nequi', qr: null, expiresAt: Number.NaN }) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(nan.expiresAt).toBeNull();
    const inf = sanitizeDisplayPayment({ method: 'qr', total: 1000, provider: 'Nequi', qr: { kind: 'image', value: IMG }, expiresAt: Number.POSITIVE_INFINITY }) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(inf.expiresAt).toBeNull();
    expect(resolveQrPresentation(inf, { now: Date.now(), online: true })).toMatchObject({ kind: 'image', expired: false, remainingMs: null });
    const odd = sanitizeDisplayPayment({ method: 'qr', total: 1000, provider: 'Nequi', qr: { kind: 'svg', value: '<svg/>' }, expiresAt: null }) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(odd.qr).toBeNull();
    const empty = sanitizeDisplayPayment({ method: 'qr', total: 1000, provider: 'Nequi', qr: { kind: 'text', value: '' }, expiresAt: null }) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveQrPresentation(empty, { now: Date.now(), online: true }).kind).toBe('fallback');
  });

  it('qr_paid_claim: cartId vacío, ausente o no string no pasa el guard; con cartId válido pasa aunque traiga campos extra', () => {
    const claim = { v: PROTOCOL_VERSION, t: 'qr_paid_claim', seq: 1, instanceId: 'pantalla-1', terminalId: 'term-1' };
    expect(isUpMessage({ ...claim, cartId: 'cart-1' })).toBe(true);
    expect(isUpMessage({ ...claim, cartId: 'cart-1', paid: true, amount: 999 })).toBe(true);
    expect(isUpMessage({ ...claim, cartId: '' })).toBe(false);
    expect(isUpMessage({ ...claim })).toBe(false);
    expect(isUpMessage({ ...claim, cartId: 7 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Regresión de las partes A/B (bordes pedidos en cada ronda)
// ---------------------------------------------------------------------------

describe('Regresión · ajustes, propinas, terminal (variantes nuevas)', () => {
  it('ajustes con presets de strings, negativos, > 100, duplicados o decimales: no pasan isValidTipPresets y el parse cae a los defaults', () => {
    expect(isValidTipPresets(['10', '15', '20'])).toBe(false);
    expect(isValidTipPresets([-5, 10, 15])).toBe(false);
    expect(isValidTipPresets([10, 15, 150])).toBe(false);
    expect(isValidTipPresets([10, 10, 15])).toBe(false);
    expect(isValidTipPresets([10.5, 15, 20])).toBe(false);
    const parsed = parseCustomerDisplaySettings({ enabled: true, tips: { enabled: true, presets: ['10', '15', '20'] }, touch: 'TOUCH' });
    expect(Array.isArray(parsed.tips.presets)).toBe(true);
    expect(isValidTipPresets(parsed.tips.presets)).toBe(true);
    const pres = toDisplayPresentationSettings(parsed);
    // 'TOUCH' (mayúsculas) no es un override válido → auto.
    expect(pres.touch).toBe('auto');
    expect(resolveTouch(false, 'TOUCH')).toBe(false);
    expect(resolveTouch(true, 'no-touch')).toBe(false);
    expect(resolveTouch(false, 'touch')).toBe(true);
  });

  it('organization_settings con un JSON que no es objeto (string, array, null): defaults sin lanzar', () => {
    for (const raw of ['{}', [], null, 42, undefined]) {
      const parsed = parseCustomerDisplaySettings(raw);
      expect(typeof parsed.enabled).toBe('boolean');
      expect(['auto', 'touch', 'no-touch']).toContain(toDisplayPresentationSettings(parsed).touch);
    }
  });

  it('presets vacíos + allowCustom false + pantalla táctil: no hay nada que elegir → no se muestra la vista de propina', () => {
    const tip = sanitizeDisplayTip({ cartId: 'c1', base: 25_000, presets: [], allowCustom: false });
    const cart = { lines: [{ id: 'l1', name: 'x', qty: 1, unitPrice: 25_000, lineTotal: 25_000 }], subtotal: 25_000, taxTotal: 0, taxIncluded: true, total: 25_000, lastChangedLineId: null };
    const state = { mode: 'tip', cart, payment: null, thanks: null, tip };
    expect(resolveView({ connected: true, updateRequired: false, state: state as never, touch: true })).not.toBe('tip');
    expect(resolveView({ connected: true, updateRequired: false, state: state as never, touch: false })).not.toBe('tip');
  });

  it('base 0 o negativa con propina: porcentajes a 0, importe fijo se conserva acotado, «none» siempre 0', () => {
    expect(computeTipAmount(0, 15)).toBe(0);
    expect(computeTipAmount(-100, 15)).toBe(0);
    expect(tipOptions(-100, [5, 10]).every((o) => o.amount === 0)).toBe(true);
    expect(resolveTipSelection('c', 0, { kind: 'amount', value: 2000 }).amount).toBe(2000);
    expect(resolveTipSelection('c', 0, { kind: 'none', value: 0 }).amount).toBe(0);
    expect(resolveTipSelection('c', 0, { kind: 'percent', value: 10 }).amount).toBe(0);
  });

  it('importe parcial del QR: 0, negativo, > total, NaN o string no viajan; en el límite (== total) sí', () => {
    expect(isAmountWithinTotal(0, 1000)).toBe(false);
    expect(isAmountWithinTotal(-1, 1000)).toBe(false);
    expect(isAmountWithinTotal(1001, 1000)).toBe(false);
    expect(isAmountWithinTotal(Number.NaN, 1000)).toBe(false);
    expect(isAmountWithinTotal('500', 1000)).toBe(false);
    expect(isAmountWithinTotal(1000, 1000)).toBe(true);
    expect(isAmountWithinTotal(1, 0)).toBe(false);
    const p = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 1000, amount: 1000 });
    expect(p.method === 'qr' && p.amount).toBe(1000);
  });

  it('terminal sin vincular: localStorage que LANZA (Safari privado / cuota) no tumba la caja y devuelve un UUID válido cada vez', () => {
    const throwing = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    const id = getOrCreateLocalTerminalId(throwing as never);
    expect(isTerminalId(id)).toBe(true);
    expect(readLocalTerminalId(throwing as never)).toBeNull();
  });

  it('dos cajas con la misma terminal: una pantalla que responde a la caja A no vale para B (toInstanceId), y el claim sin destinatario va a la caja seguida', () => {
    const claim = { v: PROTOCOL_VERSION, t: 'qr_paid_claim', seq: 1, instanceId: 'pantalla', terminalId: 'term-1', cartId: 'cart-1' };
    expect(isUpMessage({ ...claim, toInstanceId: 'caja-A' })).toBe(true);
    expect(isUpMessage({ ...claim, toInstanceId: 'caja-B' })).toBe(true);
    expect(isUpMessage({ ...claim, toInstanceId: 42 })).toBe(false);
    expect(isUpMessage(claim)).toBe(true);
  });
});
