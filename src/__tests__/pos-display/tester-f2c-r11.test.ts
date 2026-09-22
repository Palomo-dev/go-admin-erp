/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · TESTER, ronda 11
 * (sobre la corrección AA/AB de la ronda 11 del builder).
 *
 * Rompe, no defiende. Árbol REAL sin commitear. QrPoller real en Node con
 * fetch controlable y timers falsos; QrPaymentDialog real montado con
 * react-dom/client sobre un DOM mínimo (harness copiado a propósito de
 * tester-f2c-r10: un test no importa de otro).
 *
 * Hallazgos de esta ronda:
 *  AC · [bajo] «Verificar pago» pulsado DURANTE la gracia (poller vivo, la
 *      pulsación se suma a la consulta en vuelo, AA) y la gracia vence con
 *      esa respuesta todavía en vuelo: el `stop()` de Z descarta el `paid`
 *      que el cajero pidió a mano. No hay onPaid, no hay aviso, el botón
 *      vuelve a «Verificar pago» y nada explica que hubo respuesta. Es
 *      recuperable (la segunda pulsación, ya con el poller parado, consulta
 *      de nuevo y el `paid` de la sesión sigue ahí), por eso bajo: pero una
 *      consulta que el cajero PIDIÓ no debería tirarse en silencio. Nació
 *      como `it.failing`; corregido en la ronda 12 (handleManualCheck
 *      cancela la gracia y trata la pulsación como consulta única): los dos
 *      tests de AC afirman ahora la corrección y vigilan que no reincida.
 *
 * Lo demás son bordes nuevos que AA/AB abrieron y que pasan (evidencia de
 * que no se rompió nada): Cancelar con la consulta única en vuelo y
 * reapertura; reabrir tras `paid` antes de los 3 s; vencimiento a menos de
 * 1 s; HTTP no-OK en la consulta única; sin `expiresAt` nunca hay
 * «Verificar pago»; y variantes nuevas de los bordes que pide cada ronda
 * (ajustes, presets, subtotal 0, no táctil con propinas, terminal sin
 * vincular, dos cajas con la misma terminal).
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { transformSync } from 'esbuild';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';
import { resolveDisplayQr, toDisplayPayment, parseExpiresAt, isAmountWithinTotal, resolveQrChargeAmount } from '@/lib/pos/display/payment';
import { isUpMessage, isDownMessage, PROTOCOL_VERSION, type DisplayPayment } from '@/lib/pos/display/protocol';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings, isValidTipPresets } from '@/lib/pos/display/settings';
import { computeTipAmount, tipOptions, resolveTipSelection, sanitizeDisplayTip } from '@/lib/pos/display/tip';
import { isTerminalId, readLocalTerminalId, setLocalTerminalId, getOrCreateLocalTerminalId } from '@/lib/pos/display/terminal';
import { resolveQrPresentation, resolveTouch, resolveView, sanitizeDisplayPayment } from '@/components/pos-display/logic';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const CHECKOUT = readSrc('components/pos/CheckoutDialog.tsx');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');

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
// QrPoller puro · la consulta única (AA) con respuestas que no son 200
// ---------------------------------------------------------------------------

describe('QrPoller real · consulta única de AA con respuestas HTTP no OK', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  const mk = (over: Partial<ConstructorParameters<typeof QrPoller>[0]> = {}) =>
    new QrPoller({ reference: 'POS-120-t11', organizationId: 120, ...over });

  /** Lo que hace handleManualCheck en el estado vencido con el poller parado. */
  async function oneShot(poller: QrPoller): Promise<void> {
    if (!poller.isRunning) poller.start();
    try {
      await poller.checkNow();
    } finally {
      poller.stop();
    }
  }

  it('404 (sesión no encontrada) en la consulta única: onError con «HTTP 404», ningún timer queda vivo y el poller acaba parado', async () => {
    const onError = jest.fn();
    const poller = mk({ onError });
    const run = oneShot(poller);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    pending.shift()!.resolveHttp(404);
    await run;
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0].message)).toContain('404');
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('401 (sesión de la caja vencida) en la consulta única: igual que 404, y una segunda pulsación vuelve a consultar desde attempts 0', async () => {
    const onError = jest.fn();
    const poller = mk({ onError, maxAttempts: 1 });
    await (async () => {
      const run = oneShot(poller);
      pending.shift()!.resolveHttp(401);
      await run;
    })();
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    // maxAttempts 1: si attempts NO se reiniciara en start(), la segunda pulsación moriría sin fetch.
    const run2 = oneShot(poller);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    pending.shift()!.resolve('paid');
    await run2;
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cuerpo JSON inválido en la consulta única (proxy que devuelve HTML con 200): onError, sin timers, parado', async () => {
    const onError = jest.fn();
    const onPaid = jest.fn();
    const poller = mk({ onError, onPaid });
    fetchMock.mockImplementationOnce(() => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
    await oneShot(poller);
    await flush();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(poller.isRunning).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('`status` desconocido del backend («processing») en la consulta única cuenta como pending: sin onPaid, sin onExpired, parado sin timer', async () => {
    const onPaid = jest.fn();
    const onExpired = jest.fn();
    const onStatusChange = jest.fn();
    const poller = mk({ onPaid, onExpired, onStatusChange });
    const run = oneShot(poller);
    pending.shift()!.resolve('processing');
    await run;
    await flush();
    expect(onPaid).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith('pending');
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

describe('AA/AB · diálogo real con timers falsos: bordes de la consulta única y del reinicio derivado', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  it('AC · «Verificar pago» pulsado durante la gracia y la gracia vence con la respuesta en vuelo: el `paid` que el cajero PIDIÓ se honra (corregido en la ronda 12: la pulsación cancela la gracia y es la consulta única)', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireLocally(container, 5000);
    // El poller vivo ya tiene su consulta en vuelo; la pulsación se suma a ella (AA, «durante la gracia»).
    expect(pending.length).toBe(1);
    const { click } = await pressAsync(verificar(container));
    expect(html(container)).toContain('Verificando...');
    // La gracia vence ANTES de que el banco responda...
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    // ...y entonces responde `paid`.
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    // La consulta que el cajero pidió a mano se honra: onPaid una vez y «Pago confirmado».
    expect(onPaid).toHaveBeenCalledTimes(1);
    const out = html(container);
    expect(out).toContain('Pago confirmado');
    expect(out).not.toContain('No se pudo verificar');
    expect(out).not.toContain('Verificando...');
  });

  it('AC · corregido: una SOLA pulsación durante la gracia basta (no hace falta la segunda); con `pending` el poller queda parado (Z se cumple) y sin timers', async () => {
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid }));
    await expireLocally(container, 5000);
    const { click } = await pressAsync(verificar(container));
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    // Primera pulsación → confirmado. No hay segunda consulta ni segunda pulsación.
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(buttons(container)).toEqual(['Cerrar']);
    expect(html(container)).toContain('Pago confirmado');
    // Variante: la respuesta en vuelo es `pending` → la consulta única termina y el poller queda parado (Z), sin reanudar ~24 min.
    const onPaid2 = jest.fn();
    const { container: c2 } = await mountDialog(baseProps({ reference: 'POS-120-t11-ac', expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid: onPaid2 }));
    await expireLocally(c2, 5000);
    const { click: click2 } = await pressAsync(verificar(c2));
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    const calls2 = fetchMock.mock.calls.length;
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click2;
      await flush();
    });
    expect(onPaid2).not.toHaveBeenCalled();
    expect(buttons(c2)).toEqual(['Cancelar', 'Verificar pago']);
    expect(html(c2)).not.toContain('No se pudo verificar');
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls2);
    expect(pending.length).toBe(0);
    // Recuperable como antes: la siguiente pulsación es otra consulta única y el `paid` de la sesión sigue ahí.
    const { click: click3 } = await pressAsync(verificar(c2));
    expect(pending.length).toBe(1);
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click3;
      await flush();
    });
    expect(onPaid2).toHaveBeenCalledTimes(1);
    expect(html(c2)).toContain('Pago confirmado');
  });

  it('Cancelar con la consulta única en vuelo: el `paid` tardío se descarta (F2C-R7-1, segunda red) y al reabrir con otro QR el poller nuevo consulta la referencia nueva sin que el finally viejo lo pare', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const { container, rerender } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onPaid, onClose }));
    await expireLocally(container, 5000);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    pending = [];
    const { click } = await pressAsync(verificar(container));
    expect(pending.length).toBe(1);
    const inFlight = pending.shift()!;
    // Cancelar: el padre cierra.
    await rerender(baseProps({ open: false, expiresAt: new Date(Date.now() - 60_000).toISOString(), onPaid, onClose }));
    // Reabre para un QR nuevo antes de que el banco conteste al viejo.
    await rerender(baseProps({ open: true, reference: 'POS-120-t11-b', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), onPaid, onClose }));
    expect(pending.length).toBe(1);
    expect(pending[0].url).toContain('POS-120-t11-b');
    // Llega el `paid` del QR abandonado.
    await act(async () => {
      inFlight.resolve('paid');
      await click;
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    const out = html(container);
    expect(out).not.toContain('Pago confirmado');
    expect(out).not.toContain('El tiempo ha expirado');
    expect(yaPague(container)).not.toBeNull();
    // El poller NUEVO sigue vivo: responde pending y reprograma; luego paga.
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
      jest.advanceTimersByTime(3000);
      await flush();
    });
    expect(pending.length).toBe(1);
    expect(pending[0].url).toContain('POS-120-t11-b');
    await act(async () => {
      pending.shift()!.resolve('paid');
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it('AB · reabrir tras un `paid` (el padre cierra en onPaid, antes de los 3 s): el QR nuevo pinta «Ya pague», no «Pago confirmado»/«Cerrar», y el cierre automático del anterior NO dispara onClose', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const { container, rerender } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 60_000).toISOString(), onPaid, onClose }));
    await act(async () => {
      pending.shift()!.resolve('paid');
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(buttons(container)).toEqual(['Cerrar']);
    // El padre cierra en onPaid (CheckoutDialog: setShowQrDialog(false)) y reabre para otro código.
    await rerender(baseProps({ open: false, onPaid, onClose }));
    await rerender(baseProps({ open: true, reference: 'POS-120-t11-c', expiresAt: new Date(Date.now() + 60_000).toISOString(), onPaid, onClose }));
    const out = html(container);
    expect(out).not.toContain('Pago confirmado');
    expect(out).toContain('<img');
    expect(buttons(container)).toEqual(['Cancelar', 'Ya pague']);
    await act(async () => {
      jest.advanceTimersByTime(3500);
      await flush();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(buttons(container)).toEqual(['Cancelar', 'Ya pague']);
  });

  it('AB · en StrictMode el reinicio derivado no deja un frame vencido al reabrir y el poller vivo es UNO (dos fetch: el desechado y el vivo)', async () => {
    const { container, rerender } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 2000).toISOString() }), true);
    // StrictMode: dos pollers en la apertura, uno muere en el cleanup.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      while (pending.length > 0) pending.shift()!.resolve('pending');
      await flush();
    });
    await act(async () => {
      jest.advanceTimersByTime(2100);
      await flush();
    });
    expect(html(container)).toContain('El tiempo ha expirado');
    await rerender(baseProps({ open: false }));
    pending = [];
    const before = fetchMock.mock.calls.length;
    await rerender(baseProps({ open: true, reference: 'POS-120-t11-d', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() }));
    const out = html(container);
    expect(out).not.toContain('El tiempo ha expirado');
    expect(out).toMatch(/Expira en (10:00|09:5\d)/);
    expect(buttons(container)).toEqual(['Cancelar', 'Ya pague']);
    // StrictMode solo dobla los efectos al MONTAR; en la reapertura (update) hay UNA consulta nueva, para la referencia nueva.
    expect(fetchMock.mock.calls.length - before).toBe(1);
    expect(pending.every((p) => p.url.includes('POS-120-t11-d'))).toBe(true);
  });

  it('vencimiento a menos de 1 s al abrir (floor a 0): el diálogo se declara vencido de inmediato con «Verificar pago», el padre recibe onTerminal UNA vez en el primer tic y la pantalla lo retira a la vez', async () => {
    const onTerminal = jest.fn();
    const expiresAt = new Date(Date.now() + 500).toISOString();
    const { container } = await mountDialog(baseProps({ expiresAt, onTerminal }));
    // Primer render: `remaining` = floor(0.5) = 0 → «expirado» aunque el reloj no llegó. Evidencia (no regresión).
    expect(html(container)).toContain('El tiempo ha expirado');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    // Todavía no se avisó al padre: eso lo hace el tic de 1 s.
    expect(onTerminal).not.toHaveBeenCalled();
    await act(async () => {
      pending.shift()!.resolve('pending');
      await flush();
      jest.advanceTimersByTime(1000);
      await flush();
    });
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith('expired');
    // La caja proyecta qrDead ⇒ la pantalla dice «venció»: coherentes al segundo.
    const p = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: null, expiresAt: 0 })) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveQrPresentation(p, { now: Date.now(), online: true })).toMatchObject({ kind: 'fallback', expired: true });
    // Pasada la gracia: parado, y «Verificar pago» sigue disponible.
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    const calls = fetchMock.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(60_000);
      await flush();
    });
    expect(fetchMock.mock.calls.length).toBe(calls);
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
  });

  it('sin `expiresAt` NUNCA hay «Verificar pago»: el único vencido posible es el del proveedor (rejected/cancelled/expired) y con él solo queda «Cancelar»', async () => {
    const onTerminal = jest.fn();
    const { container } = await mountDialog(baseProps({ onTerminal }));
    expect(buttons(container)).toEqual(['Cancelar', 'Ya pague']);
    await act(async () => {
      pending.shift()!.resolve('cancelled');
      await flush();
    });
    expect(onTerminal).toHaveBeenCalledWith('cancelled');
    expect(buttons(container)).toEqual(['Cancelar']);
    expect(html(container)).toContain('Solicita un nuevo codigo QR');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('«Verificar pago» → `rejected` del proveedor: el botón desaparece, onTerminal NO se repite (ya avisó el vencimiento local) y no queda ningún timer', async () => {
    const onTerminal = jest.fn();
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString(), onTerminal, onPaid }));
    await expireLocally(container, 5000);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    pending = [];
    const { click } = await pressAsync(verificar(container));
    await act(async () => {
      pending.shift()!.resolve('rejected');
      await click;
      await flush();
    });
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(buttons(container)).toEqual(['Cancelar']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('«Verificar pago» → HTTP 401 (la sesión de la caja caducó): aviso «No se pudo verificar», parado, y la siguiente pulsación vuelve a consultar', async () => {
    const { container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString() }));
    await expireLocally(container, 5000);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    pending = [];
    const { click } = await pressAsync(verificar(container));
    await act(async () => {
      pending.shift()!.resolveHttp(401);
      await click;
      await flush();
    });
    expect(html(container)).toContain('No se pudo verificar el pago; pulse «Verificar pago»');
    expect(jest.getTimerCount()).toBe(0);
    const { click: click2 } = await pressAsync(verificar(container));
    expect(pending.length).toBe(1);
    // Al pulsar se limpia el aviso mientras dura la consulta.
    expect(html(container)).not.toContain('No se pudo verificar');
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click2;
      await flush();
    });
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
  });

  it('el aviso de una «Verificar pago» fallida se limpia al Cancelar y reabrir (AB también reinicia verifyFailed)', async () => {
    const { container, rerender } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5000).toISOString() }));
    await expireLocally(container, 5000);
    await act(async () => {
      jest.advanceTimersByTime(graceMs() + 1000);
      await flush();
    });
    pending = [];
    const { click } = await pressAsync(verificar(container));
    await act(async () => {
      pending.shift()!.reject(new Error('red'));
      await click;
      await flush();
    });
    expect(html(container)).toContain('No se pudo verificar');
    await rerender(baseProps({ open: false }));
    await rerender(baseProps({ open: true, reference: 'POS-120-t11-e', expiresAt: new Date(Date.now() + 60_000).toISOString() }));
    expect(html(container)).not.toContain('No se pudo verificar');
    expect(buttons(container)).toEqual(['Cancelar', 'Ya pague']);
  });
});

// ---------------------------------------------------------------------------
// Lado caja · el claim de la pantalla solo avisa y se filtra por carrito
// ---------------------------------------------------------------------------

describe('qr_paid_claim · lado caja (estático sobre CheckoutDialog) y guard', () => {
  it('CheckoutDialog descarta el claim de OTRO carrito (msg.cartId !== cart.id) y no toca ningún estado: solo toast.info', () => {
    const block = CHECKOUT.slice(CHECKOUT.indexOf("msg.t !== 'qr_paid_claim'"), CHECKOUT.indexOf("msg.t !== 'qr_paid_claim'") + 400);
    expect(block).toContain('msg.cartId !== cart.id) return;');
    expect(block).toContain("toast.info('El cliente indica que ya pagó'");
    // Nada de setPayments / setShowQrDialog / confirmQrPaymentEntry dentro del oyente.
    const listener = CHECKOUT.slice(CHECKOUT.indexOf("msg.t !== 'qr_paid_claim'"), CHECKOUT.indexOf('}, [open, cart.id]);'));
    expect(listener).not.toMatch(/setPayments|setShowQrDialog|confirmQrPaymentEntry|setTouchedIds|handleQrPayment/);
  });

  it('el oyente vive en [open, cart.id]: al cambiar de carrito se re-suscribe con el id nuevo (un claim del carrito anterior ya no avisa)', () => {
    expect(CHECKOUT).toContain('}, [open, cart.id]);');
  });

  it('guard: un claim con `toInstanceId` vacío o numérico no pasa; con cartId de otro carrito pasa el guard (lo filtra la caja, no el protocolo)', () => {
    const claim = { v: PROTOCOL_VERSION, t: 'qr_paid_claim', seq: 1, instanceId: 'pantalla', terminalId: 'term-1', cartId: 'otro-carrito' };
    expect(isUpMessage(claim)).toBe(true);
    expect(isUpMessage({ ...claim, toInstanceId: '' })).toBe(false);
    expect(isUpMessage({ ...claim, toInstanceId: 7 })).toBe(false);
    expect(isUpMessage({ ...claim, v: PROTOCOL_VERSION + 1 })).toBe(false);
  });

  it('QrPaymentDialog (estático): el claim de la pantalla no llega al diálogo; la única confirmación sigue siendo onPaid del poller', () => {
    expect(QR_DIALOG).not.toContain('qr_paid_claim');
    expect(QR_DIALOG).not.toContain('onUp(');
    const onPaidCalls = QR_DIALOG.match(/onPaid\?\.\(\)/g) ?? [];
    expect(onPaidCalls.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Regresión · bordes pedidos por el orquestador (variantes nuevas)
// ---------------------------------------------------------------------------

describe('Regresión · ajustes, presets, subtotal 0, no táctil, terminal, dos cajas (variantes nuevas)', () => {
  it('presets con 15.0 (entero en JS) valen; con -0, 1e3, Infinity, NaN o de longitud 4 no; touch con espacios o null cae en auto', () => {
    expect(isValidTipPresets([5, 10, 15.0])).toBe(true);
    expect(isValidTipPresets([1, 50, 100])).toBe(true);
    expect(isValidTipPresets([-0, 10, 15])).toBe(false);
    expect(isValidTipPresets([5, 10, 1e3])).toBe(false);
    expect(isValidTipPresets([5, 10, Number.POSITIVE_INFINITY])).toBe(false);
    expect(isValidTipPresets([5, 10, Number.NaN])).toBe(false);
    expect(isValidTipPresets([5, 10, 15, 20])).toBe(false);
    for (const touch of ['auto ', ' touch', null, ['touch'], { touch: 'touch' }, 1]) {
      const parsed = parseCustomerDisplaySettings({ enabled: true, touch });
      expect(toDisplayPresentationSettings(parsed).touch).toBe('auto');
    }
    // Un preset inválido no arrastra `enabled` ni `allowCustom` de las propinas.
    const parsed = parseCustomerDisplaySettings({ enabled: true, tips: { enabled: true, presets: [5, 10, 1e3], allowCustom: false } });
    expect(parsed.tips.enabled).toBe(true);
    expect(parsed.tips.allowCustom).toBe(false);
    expect(parsed.tips.presets).toEqual([5, 10, 15]);
  });

  it('presets desordenados válidos se guardan ordenados y la pantalla los pinta en ese orden (tipOptions)', () => {
    const parsed = parseCustomerDisplaySettings({ tips: { enabled: true, presets: [20, 5, 10] } });
    expect(parsed.tips.presets).toEqual([5, 10, 20]);
    expect(tipOptions(10_000, parsed.tips.presets).map((o) => o.amount)).toEqual([500, 1000, 2000]);
  });

  it('subtotal 0 con propina: ni la caja genera QR (pendiente 0 corta antes del fetch) ni viaja `amount`; la pantalla no pinta «Este pago»', () => {
    expect(resolveQrChargeAmount({ entryAmount: 5000, othersTotal: 0, total: 0 })).toBe(0);
    expect(isAmountWithinTotal(0, 0)).toBe(false);
    const p = toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 0, amount: 0, qr: { kind: 'image', value: IMG }, expiresAt: null });
    expect(p.method === 'qr' && 'amount' in p).toBe(false);
    expect(computeTipAmount(0, 100)).toBe(0);
    expect(resolveTipSelection('c', 0, { kind: 'percent', value: 100 }).amount).toBe(0);
    // La guarda de la caja existe tal cual (HALLAZGO R).
    expect(CHECKOUT).toContain("toast.error('No hay saldo pendiente para cobrar con QR')");
  });

  it('pantalla NO táctil con propinas activadas y presets válidos: se muestra la propina (el cajero la aplica desde la caja); sin presets cae al cobro QR con instrucciones', () => {
    const cart = { id: 'c1', currency: 'COP', lines: [{ id: 'l1', name: 'x', qty: 1, unitPrice: 25_000, lineTotal: 25_000, modifiers: [], note: null }], subtotal: 25_000, discountTotal: 0, discountLabel: null, taxTotal: 0, taxIncluded: true, total: 25_000, lastChangedLineId: null };
    const payment = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 25_000, qr: null, expiresAt: null }));
    const withPresets = sanitizeDisplayTip({ cartId: 'c1', base: 25_000, presets: [5, 10, 15], allowCustom: true });
    expect(withPresets).not.toBeNull();
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: { mode: 'tip', cart, payment, thanks: null, tip: withPresets } as never })).toBe('tip');
    const noPresets = sanitizeDisplayTip({ cartId: 'c1', base: 25_000, presets: [], allowCustom: true });
    expect(resolveView({ connected: true, updateRequired: false, touch: false, state: { mode: 'tip', cart, payment, thanks: null, tip: noPresets } as never })).toBe('payment_qr');
    expect(resolveView({ connected: true, updateRequired: false, touch: true, state: { mode: 'tip', cart, payment, thanks: null, tip: noPresets } as never })).toBe('tip');
    // resolveTouch: hardware sin táctil + ajuste 'touch' fuerza los botones; y al revés.
    expect(resolveTouch(false, 'touch')).toBe(true);
    expect(resolveTouch(true, 'no-touch')).toBe(false);
  });

  it('QR expirado con `expires_at` en otro huso (ISO con offset -05:00): la caja y la pantalla lo convierten al mismo instante y coinciden en «vencido»', () => {
    const iso = '2026-09-22T10:00:00.000-05:00';
    const epoch = Date.UTC(2026, 8, 22, 15, 0, 0);
    expect(parseExpiresAt(iso)).toBe(epoch);
    const dead = resolveDisplayQr({ imageUrl: IMG, expiresAt: iso, now: epoch + 1 });
    expect(dead.qr).toBeNull();
    expect(dead.expiresAt).toBe(epoch);
    const alive = resolveDisplayQr({ imageUrl: IMG, expiresAt: iso, now: epoch - 1 });
    expect(alive.qr).toEqual({ kind: 'image', value: IMG });
    const p = sanitizeDisplayPayment(toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 1000, qr: alive.qr, expiresAt: alive.expiresAt })) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveQrPresentation(p, { now: epoch - 1, online: true })).toMatchObject({ kind: 'image', expired: false, remainingMs: 1 });
    expect(resolveQrPresentation(p, { now: epoch, online: true })).toMatchObject({ kind: 'fallback', expired: true, remainingMs: null });
  });

  it('QR expirado en un `state` completo: el guard del protocolo lo acepta, la vista es payment_qr y la presentación fallback+expired (no idle ni tip)', () => {
    const now = Date.now();
    const payment = toDisplayPayment({ methodCode: 'bancolombia_qr', methodName: 'Bancolombia QR', total: 1000, qr: null, expiresAt: now - 1 });
    const msg = { v: PROTOCOL_VERSION, t: 'state', seq: 9, instanceId: 'caja', terminalId: 'term', state: { mode: 'payment', cart: null, payment, thanks: null, tip: null } };
    expect(isDownMessage(msg)).toBe(true);
    const sane = sanitizeDisplayPayment(payment) as Extract<DisplayPayment, { method: 'qr' }>;
    expect(resolveView({ connected: true, updateRequired: false, state: { mode: 'payment', cart: null, payment: sane, thanks: null, tip: null } as never })).toBe('payment_qr');
    expect(resolveQrPresentation(sane, { now, online: false })).toMatchObject({ kind: 'fallback', expired: true });
  });

  it('terminal sin vincular: un UUID en MAYÚSCULAS vale como id; con llaves, con espacios o urn:uuid no, y setLocalTerminalId no pisa el storage con ellos', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    const id = getOrCreateLocalTerminalId(storage as never);
    expect(isTerminalId(id)).toBe(true);
    expect(isTerminalId(id.toUpperCase())).toBe(true);
    expect(setLocalTerminalId(`{${id}}`, storage as never)).toBe(false);
    expect(setLocalTerminalId(` ${id}`, storage as never)).toBe(false);
    expect(setLocalTerminalId(`urn:uuid:${id}`, storage as never)).toBe(false);
    expect(readLocalTerminalId(storage as never)).toBe(id);
    // Vincular a una fila de pos_terminals: el id de la fila reemplaza al local.
    const rowId = '0b6f7c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e';
    expect(setLocalTerminalId(rowId, storage as never)).toBe(true);
    expect(readLocalTerminalId(storage as never)).toBe(rowId);
  });

  it('dos cajas con la misma terminal: el mismo terminalId con instanceId distinto produce sobres distintos y un claim dirigido a una no vale para la otra (regla del transporte, protocolo intacto)', () => {
    const base = { v: PROTOCOL_VERSION, t: 'qr_paid_claim', seq: 1, instanceId: 'pantalla', terminalId: 'term-1', cartId: 'cart-1' };
    const toA = { ...base, toInstanceId: 'caja-A' };
    const toB = { ...base, toInstanceId: 'caja-B' };
    expect(isUpMessage(toA) && isUpMessage(toB)).toBe(true);
    // La regla que aplica el transporte al recibir (transport.ts): destinatario distinto → se descarta.
    const TRANSPORT = readSrc('lib/pos/display/transport.ts');
    expect(TRANSPORT).toContain('if (data.toInstanceId !== undefined && data.toInstanceId !== this.instanceId) return;');
    expect(TRANSPORT).toContain('if (data.terminalId !== this.terminalId) return;');
  });
});
