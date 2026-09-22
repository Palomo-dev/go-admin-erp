/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 13 (ronda de
 * CIERRE: hallazgos QA-2/AD, QA-5 y QA-6 de la ronda 12).
 *
 *  AD (QA-2) · «Ya pague» pulsado ANTES del vencimiento local con la
 *      respuesta llegando DESPUÉS de que venza la gracia de Z: la gracia ya
 *      no para el poller mientras hay una consulta manual en vuelo
 *      (`manualChecksInFlightRef`); difiere el stop() al finally de
 *      handleManualCheck (`stopAfterManualRef`). Regla única: una consulta
 *      pedida a mano siempre se honra. El diálogo real con esa secuencia
 *      queda en tester-f2c-r12 (AD pasó de it.failing a it, más `pending` y
 *      error de red). Aquí lo estático y los bordes: doble pulsación
 *      solapada, y que sin consulta manual la gracia sigue parando.
 *  QA-5 · `rejected` y `cancelled` del proveedor ya no se pintan como «El
 *      tiempo ha expirado»: texto por veredicto, y la cuenta atrás local no
 *      pisa el veredicto (`providerTerminalRef`) ni arma una gracia sobre un
 *      poller que ya se paró solo.
 *  QA-6 · GET /api/integrations/qr/status responde con `err.statusCode` de
 *      cualquier OrgContextError (no disfraza un 400/409 de 403) y solo
 *      registra el 403. Lo dinámico está en qr-status-route-f2c-r12-tester.
 *
 * QrPaymentDialog REAL + QrPoller REAL montados con react-dom/client sobre
 * un DOM mínimo. Helpers copiados a propósito (un test no importa de otro).
 * Organización ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { transformSync } from 'esbuild';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');
const ROUTE = readSrc('app/api/integrations/qr/status/route.ts');

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
type ReactNs = typeof import('react');
type RootApi = { render: (el: unknown) => void; unmount: () => void };
type FakeNode = any;

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

/** Props que React deja en cada nodo (`__reactProps$…`): así se pulsa un botón sin eventos del DOM. */
function reactProps(node: FakeNode): Record<string, unknown> {
  const key = Object.keys(node).find((k) => k.startsWith('__reactProps'));
  if (!key) throw new Error('nodo sin props de React');
  return node[key] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Cargador de .tsx (esbuild → CJS) con stubs para la UI compartida
// ---------------------------------------------------------------------------

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
    // El botón conserva onClick/disabled: los tests pulsan «Ya pague» por las props que React deja en el nodo.
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

const flush = async () => {
  for (let i = 0; i < 4; i += 1) await new Promise((r) => setImmediate(r));
};

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// ---------------------------------------------------------------------------
// fetch controlable para el QrPoller real
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
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
});
afterEach(() => {
  globalThis.fetch = realFetch;
  jest.useRealTimers();
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
  reference: 'POS-120-r13',
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

async function mountDialog(props: Record<string, unknown>): Promise<{ container: FakeNode }> {
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);
  const Dialog = QrDialog();
  await act(async () => {
    root.render(React.createElement(Dialog, props));
  });
  return { container };
}

async function respond(status: string): Promise<void> {
  await act(async () => {
    pending.shift()!.resolve(status);
    await flush();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flush();
  });
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

const button = (container: FakeNode, label: string): FakeNode | null =>
  findNode(container, (n) => n.tagName === 'BUTTON' && n.textContent === label);

/** Pulsa un botón cuyo onClick es async; devuelve la promesa de la pulsación ENVUELTA. */
async function press(btn: FakeNode): Promise<{ click: Promise<unknown> }> {
  let click: Promise<unknown> = Promise.resolve();
  await act(async () => {
    click = (reactProps(btn).onClick as () => Promise<void>)();
    await flush();
  });
  return { click };
}

// ---------------------------------------------------------------------------
// QA-5 · veredicto del proveedor: texto propio y el reloj local no lo pisa
// ---------------------------------------------------------------------------

describe('QA-5 · `rejected`/`cancelled` del proveedor: texto por veredicto que sobrevive al vencimiento local', () => {
  it.each([
    ['rejected', 'Pago rechazado por el proveedor'],
    ['cancelled', 'Pago cancelado'],
  ] as const)('onStatusChange(%s) → «%s»; al vencer el reloj local el texto se conserva, no «El tiempo ha expirado», sin gracia (0 timers) y solo «Cancelar»', async (status, text) => {
    const onTerminal = jest.fn();
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onTerminal, onPaid }));
    await respond(status);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith(status);
    let out = html(container);
    expect(out).toContain(text);
    expect(out).not.toContain('El tiempo ha expirado');
    expect(buttons(container)).toEqual(['Cancelar']);
    // Vence el reloj local: el veredicto del proveedor manda.
    await advance(6000);
    out = html(container);
    expect(out).toContain(text);
    expect(out).not.toContain('El tiempo ha expirado');
    expect(out).not.toContain('Verificar pago');
    expect(buttons(container)).toEqual(['Cancelar']);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    // Ni gracia ni poller: nada vive y nadie consulta.
    expect(jest.getTimerCount()).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await advance(graceMs() + 120_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('`expired` del PROVEEDOR antes del vencimiento local: «El tiempo ha expirado» sin «Verificar pago», y al vencer el reloj local no se arma gracia (0 timers) ni hay segundo onTerminal', async () => {
    const onTerminal = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onTerminal }));
    await respond('expired');
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(buttons(container)).toEqual(['Cancelar']);
    await advance(6000);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(buttons(container)).toEqual(['Cancelar']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('vencimiento por reloj LOCAL sin veredicto: sigue «El tiempo ha expirado» con «Verificar pago» y la gracia armada (sin regresión de AA/Z)', async () => {
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString() }));
    await respond('pending');
    await advance(5100);
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    // Gracia armada (+ el timer del poller): pasada la gracia el poller se para.
    expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);
    await advance(graceMs() + 100);
    for (const p of pending.splice(0)) p.resolve('pending');
    await advance(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AD (QA-2) · bordes: doble pulsación solapada; sin consulta manual la gracia para
// ---------------------------------------------------------------------------

describe('AD · bordes del stop() diferido', () => {
  /** t=0 fetch1 → pending; t=2 s se pulsa «Ya pague» (consulta manual en vuelo). */
  async function pressYaPagueAt2s(container: FakeNode): Promise<{ click: Promise<unknown> }> {
    await respond('pending');
    await advance(2000);
    expect(buttons(container)).toEqual(['Cancelar', 'Ya pague']);
    return press(button(container, 'Ya pague'));
  }

  it('dos pulsaciones solapadas de «Ya pague» (misma consulta en vuelo) y la gracia vence con ambas en vuelo: un solo fetch, el `paid` se honra UNA vez y el poller queda parado', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    const { click: c1 } = await pressYaPagueAt2s(container);
    // Segunda pulsación con la consulta en vuelo: el botón está deshabilitado en
    // la UI, pero el handler es reentrante (se llama a mano, como un doble clic).
    let c2: Promise<unknown> = Promise.resolve();
    await act(async () => {
      const btn = findNode(container, (n: FakeNode) => n.tagName === 'BUTTON' && n.textContent === 'Verificando...');
      c2 = (reactProps(btn).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2); // fetch1 (pending) + la consulta manual compartida
    await advance(3100 + graceMs() + 1000);
    expect(pending.length).toBe(1);
    await act(async () => {
      pending.shift()!.resolve('paid');
      await Promise.all([c1, c2]);
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Pago confirmado');
    expect(buttons(container)).toEqual(['Cerrar']);
    // Solo el cierre automático.
    expect(jest.getTimerCount()).toBe(1);
  });

  it('dos pulsaciones solapadas y respuesta `pending` tras la gracia: el stop() diferido se aplica al terminar la ÚLTIMA (contador a 0), 0 timers, «Verificar pago»', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    const { click: c1 } = await pressYaPagueAt2s(container);
    let c2: Promise<unknown> = Promise.resolve();
    await act(async () => {
      const btn = findNode(container, (n: FakeNode) => n.tagName === 'BUTTON' && n.textContent === 'Verificando...');
      c2 = (reactProps(btn).onClick as () => Promise<void>)();
      await flush();
    });
    await advance(3100 + graceMs() + 1000);
    await act(async () => {
      pending.shift()!.resolve('pending');
      await Promise.all([c1, c2]);
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    expect(jest.getTimerCount()).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await advance(120_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it('sin consulta manual en vuelo la gracia sigue parando el poller al vencer (Z intacto): la respuesta automática en vuelo se descarta y no hay más fetch', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await respond('pending');
    await advance(5100);
    expect(html(container)).toContain('El tiempo ha expirado');
    await advance(graceMs() + 100);
    const calls = fetchMock.mock.calls.length;
    for (const p of pending.splice(0)) p.resolve('paid');
    await advance(0);
    // La respuesta automática tardía se descarta (no era una consulta pedida a mano).
    expect(onPaid).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    await advance(120_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
  });

  it('la consulta manual termina ANTES de que venza la gracia (respuesta `pending` dentro de la ventana): no queda ninguna marca diferida y la gracia para el poller como siempre', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    const { click } = await pressYaPagueAt2s(container);
    await advance(3100);
    expect(html(container)).toContain('El tiempo ha expirado');
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click;
      await flush();
    });
    // Dentro de la gracia el poller sigue vivo (no era consulta única).
    expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);
    await advance(graceMs() + 5000);
    for (const p of pending.splice(0)) p.resolve('pending');
    await advance(0);
    expect(jest.getTimerCount()).toBe(0);
    const calls = fetchMock.mock.calls.length;
    await advance(120_000);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(onPaid).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Estáticos
// ---------------------------------------------------------------------------

describe('Estático · QrPaymentDialog (AD, QA-5) y route qr/status (QA-6)', () => {
  const manual = QR_DIALOG.slice(QR_DIALOG.indexOf('const handleManualCheck = async'), QR_DIALOG.indexOf('// Render'));
  const countdown = QR_DIALOG.slice(QR_DIALOG.indexOf('// Efecto: cuenta regresiva'), QR_DIALOG.indexOf('// Handlers'));
  const pollerEffect = QR_DIALOG.slice(QR_DIALOG.indexOf('const poller = new QrPoller('), QR_DIALOG.indexOf('pollerRef.current = poller;'));

  it('AD · la gracia difiere el stop() si hay consultas manuales en vuelo; el contador sube antes de checkNow y baja en el finally, que aplica el stop() diferido salvo paid', () => {
    expect(countdown).toContain('if (manualChecksInFlightRef.current > 0) {');
    expect(countdown).toContain('stopAfterManualRef.current = true;');
    expect(manual.indexOf('manualChecksInFlightRef.current += 1;')).toBeLessThan(manual.indexOf('await poller.checkNow();'));
    const fin = manual.slice(manual.indexOf('} finally {'));
    expect(fin).toContain('manualChecksInFlightRef.current = Math.max(0, manualChecksInFlightRef.current - 1);');
    expect(fin).toContain('const stopAfterManual = stopAfterManualRef.current && manualChecksInFlightRef.current === 0;');
    expect(fin).toContain('if (!paidHandledRef.current) poller.stop();');
    // Las marcas se reinician por apertura.
    const openEffect = QR_DIALOG.slice(QR_DIALOG.indexOf('useEffect(() => {\n    if (!open) return;'), QR_DIALOG.indexOf('const poller = new QrPoller('));
    expect(openEffect).toContain('stopAfterManualRef.current = false;');
    expect(openEffect).toContain('providerTerminalRef.current = false;');
  });

  it('AD · onError avisa también cuando la gracia venció con la consulta manual en vuelo (no habrá reintento)', () => {
    const onError = pollerEffect.slice(pollerEffect.indexOf('onError: () => {'));
    expect(onError.indexOf('if (stopAfterManualRef.current) {')).toBeLessThan(onError.indexOf('if (poller.isRunning && !oneShotCheckRef.current) return;'));
  });

  it('QA-5 · la cuenta atrás local respeta el veredicto del proveedor (providerTerminalRef) y hay un texto por estado', () => {
    expect(countdown).toContain('if (providerTerminalRef.current) return;');
    expect(countdown.indexOf('if (providerTerminalRef.current) return;')).toBeLessThan(countdown.indexOf("setStatus((prev: QrPaymentStatus) => (prev === 'paid' ? prev : 'expired'));"));
    expect(pollerEffect.match(/providerTerminalRef\.current = true;/g)?.length).toBe(2);
    expect(QR_DIALOG).toContain("? 'Pago rechazado por el proveedor'");
    expect(QR_DIALOG).toContain("? 'Pago cancelado'");
    expect(QR_DIALOG).toContain(": 'El tiempo ha expirado'");
  });

  it('QA-6 · route qr/status: 401 propio, registro SOLO con statusCode 403 y respuesta con err.statusCode (nunca un 403 fijo)', () => {
    const block = ROUTE.slice(ROUTE.indexOf('catch (err) {'), ROUTE.indexOf('// Buscar sesion QR'));
    expect(block).toContain("return NextResponse.json({ error: 'No autorizado' }, { status: 401 });");
    expect(block).toContain('if (err.statusCode === 403) {');
    expect(block.indexOf('if (err.statusCode === 403) {')).toBeLessThan(block.indexOf('console.warn('));
    expect(block).toContain('{ status: err.statusCode }');
    expect(block).not.toContain('{ status: 403 }');
  });
});
