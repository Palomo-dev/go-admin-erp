/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 9 (corrección
 * de los hallazgos T/U/V/W del tester y QA de la ronda 8).
 *
 * QrPaymentDialog REAL (cargado con esbuild y stubs de la UI compartida) +
 * QrPoller REAL montados con react-dom/client (React 19) sobre un DOM
 * mínimo (sin jsdom en el proyecto): lo justo para que React cree nodos,
 * atributos y texto y para invocar los `onClick` que deja en cada nodo.
 *
 *  T · un estado terminal del proveedor distinto de `paid` (`rejected`,
 *      `cancelled`, `expired` antes del vencimiento local) sube al padre por
 *      `onTerminal` UNA vez; con el MISMO cableado que CheckoutDialog
 *      (`qrDead` → resolved {qr:null, expiresAt:0}) el emisor recibe un cobro
 *      QR SIN código y vencido → la pantalla dice «El código venció».
 *  U · sin `expiresAt` el diálogo pinta el código y «Ya pague», sin cuenta
 *      atrás, igual que la pantalla del cliente.
 *  W · al agotar `maxAttempts` el diálogo avisa («No se pudo verificar el
 *      pago…») y «Ya pague» reinicia el poller (vuelve a consultar).
 *  V · (qrPoller) queda en tester-f2c-r8 › A; aquí solo se comprueba que
 *      «Ya pague» con la consulta en vuelo no duplica el fetch desde el
 *      diálogo real.
 *
 * Helpers copiados a propósito (un test no importa de otro). Organización
 * ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { transformSync } from 'esbuild';
import { resolveDisplayQr, toDisplayPayment } from '@/lib/pos/display/payment';
import type { DisplayPayment } from '@/lib/pos/display/protocol';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const CHECKOUT = readSrc('components/pos/CheckoutDialog.tsx');

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
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

function QrDialog(): React.ComponentType<Record<string, unknown>> {
  return (loadTsx(join(SRC, 'components/shared/QrPaymentDialog.tsx')) as { QrPaymentDialog: React.ComponentType<Record<string, unknown>> }).QrPaymentDialog;
}

const baseProps = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  open: true,
  onClose: () => {},
  reference: 'POS-120-r9',
  organizationId: 120,
  amount: 25_000,
  providerLabel: 'Redeban QR',
  qrImageUrl: IMG,
  ...over,
});

async function mountDialog(props: Record<string, unknown>): Promise<{ root: RootApi; container: FakeNode; rerender: (p: Record<string, unknown>) => Promise<void> }> {
  const container = document.createElement('div');
  const root = createRoot(container);
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

// ---------------------------------------------------------------------------
// T · estados terminales del proveedor ≠ paid suben al padre y retiran el código
// ---------------------------------------------------------------------------

describe('T · QrPaymentDialog real + QrPoller real: `rejected`/`cancelled`/`expired` del proveedor avisan al padre (onTerminal) una sola vez', () => {
  const future = () => new Date(Date.now() + 5 * 60_000).toISOString();

  it('`rejected` ⇒ onTerminal("rejected") una vez; el diálogo deja de pintar el código y «Ya pague», y dice «Pago rechazado por el proveedor» (ronda de cierre, QA-5: no «El tiempo ha expirado»)', async () => {
    const onTerminal = jest.fn();
    const onPaid = jest.fn();
    const { root, container } = await mountDialog(baseProps({ expiresAt: future(), onTerminal, onPaid }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('<img');
    expect(html(container)).toContain('Ya pague');
    await respond('rejected');
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith('rejected');
    expect(onPaid).not.toHaveBeenCalled();
    const out = html(container);
    expect(out).toContain('Pago rechazado por el proveedor');
    expect(out).not.toContain('El tiempo ha expirado');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('Ya pague');
    await act(async () => root.unmount());
  });

  it('`expired` del proveedor ANTES del vencimiento local ⇒ onTerminal("expired") exactamente una vez (onStatusChange + onExpired no duplican)', async () => {
    const onTerminal = jest.fn();
    const { root, container } = await mountDialog(baseProps({ expiresAt: future(), onTerminal }));
    await respond('expired');
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onTerminal).toHaveBeenCalledWith('expired');
    expect(html(container)).toContain('El tiempo ha expirado');
    await act(async () => root.unmount());
  });

  it('`cancelled` ⇒ onTerminal("cancelled"); `paid` ⇒ onPaid y NUNCA onTerminal', async () => {
    const onTerminal = jest.fn();
    const a = await mountDialog(baseProps({ expiresAt: future(), onTerminal }));
    await respond('cancelled');
    expect(onTerminal).toHaveBeenCalledWith('cancelled');
    await act(async () => a.root.unmount());

    const onTerminal2 = jest.fn();
    const onPaid = jest.fn();
    const b = await mountDialog(baseProps({ expiresAt: future(), onTerminal: onTerminal2, onPaid }));
    await respond('paid');
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onTerminal2).not.toHaveBeenCalled();
    expect(html(b.container)).toContain('Pago confirmado');
    await act(async () => b.root.unmount());
  });

  it('Cancelar (open → false) con la consulta en vuelo y un `rejected` tardío: onTerminal NO se llama (la respuesta se descarta)', async () => {
    const onTerminal = jest.fn();
    const { root, rerender } = await mountDialog(baseProps({ expiresAt: future(), onTerminal }));
    await rerender(baseProps({ open: false, expiresAt: future(), onTerminal }));
    await respond('rejected');
    expect(onTerminal).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('onTerminal se lee por ref: la arrow nueva de cada render es la que recibe el aviso', async () => {
    const first = jest.fn();
    const second = jest.fn();
    const { root, rerender } = await mountDialog(baseProps({ expiresAt: future(), onTerminal: first }));
    await rerender(baseProps({ expiresAt: future(), onTerminal: second }));
    await respond('rejected');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('rejected');
    await act(async () => root.unmount());
  });

  it('sin onTerminal (uso fuera del POS) un `rejected` no rompe nada', async () => {
    const { root, container } = await mountDialog(baseProps({ expiresAt: future() }));
    await respond('rejected');
    expect(html(container)).toContain('Pago rechazado por el proveedor');
    await act(async () => root.unmount());
  });

  /**
   * Mismo cableado que CheckoutDialog (ronda 9): `qrDead` en estado, reset al
   * generar, `onTerminal={() => setQrDead(true)}` y el efecto de proyección
   * con `qrDead` en sus dependencias. El emisor es un mock: solo interesa QUÉ
   * cobro recibe. resolveDisplayQr/toDisplayPayment son los reales.
   */
  it('con el cableado de CheckoutDialog, el `rejected` del poller hace que el emisor reciba un cobro QR SIN código y vencido', async () => {
    const setPayment = jest.fn();
    const Dialog = QrDialog();
    function CajaQr({ showQrOnDisplay }: { showQrOnDisplay: boolean }) {
      const { useEffect, useState } = React;
      const [qrDead, setQrDead] = useState(false);
      const qrExpiresAt = future();
      useEffect(() => {
        const resolved = qrDead
          ? { qr: null, expiresAt: 0 }
          : showQrOnDisplay
            ? resolveDisplayQr({ imageUrl: IMG, data: undefined, expiresAt: qrExpiresAt })
            : { qr: null, expiresAt: null };
        setPayment(toDisplayPayment({ methodCode: 'redeban_qr', methodName: 'Redeban QR', total: 25_000, qr: resolved.qr, expiresAt: resolved.expiresAt, amount: 25_000 }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [qrDead, showQrOnDisplay]);
      return React.createElement(Dialog, baseProps({ expiresAt: qrExpiresAt, onTerminal: () => setQrDead(true) }));
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(CajaQr, { showQrOnDisplay: true }));
    });
    const before = setPayment.mock.calls.at(-1)![0] as Extract<DisplayPayment, { method: 'qr' }>;
    expect(before).toMatchObject({ method: 'qr', qr: { kind: 'image', value: IMG } });
    expect(before.expiresAt).toBeGreaterThan(Date.now());

    await respond('rejected');
    const after = setPayment.mock.calls.at(-1)![0] as Extract<DisplayPayment, { method: 'qr' }>;
    expect(after).toMatchObject({ method: 'qr', provider: 'Redeban QR', qr: null, expiresAt: 0 });
    expect(after.expiresAt).toBeLessThanOrEqual(Date.now());
    await act(async () => root.unmount());
  });

  it('CheckoutDialog (estático): onTerminal cableado, `qrDead` en las deps del efecto y reseteado al generar y al cerrar el cobro', () => {
    expect(CHECKOUT).toContain('const [qrDead, setQrDead] = useState(false);');
    expect(CHECKOUT).toContain('onTerminal={() => setQrDead(true)}');
    const gen = CHECKOUT.slice(CHECKOUT.indexOf('const handleQrPayment = async'), CHECKOUT.indexOf('const loadTaxData'));
    expect(gen.indexOf('setQrDead(false);')).toBeGreaterThan(0);
    expect(gen.indexOf('setQrDead(false);')).toBeLessThan(gen.indexOf('setShowQrDialog(true);'));
    const reset = CHECKOUT.slice(CHECKOUT.indexOf('setShowQrDialog(false);\n      setQrData(undefined);'), CHECKOUT.indexOf('setShowQrOnDisplay(false);\n    }\n  }, [open]);'));
    expect(reset).toContain('setQrDead(false);');
  });
});

// ---------------------------------------------------------------------------
// U · sin expiresAt no hay vencimiento
// ---------------------------------------------------------------------------

describe('U · QrPaymentDialog real sin `expiresAt`', () => {
  it('pinta el código y «Ya pague», sin cuenta atrás ni «El tiempo ha expirado»; el poller sigue vivo', async () => {
    const { root, container } = await mountDialog(baseProps());
    const out = html(container);
    expect(out).toContain('<img');
    expect(out).toContain('Ya pague');
    expect(out).not.toContain('Expira en');
    expect(out).not.toContain('El tiempo ha expirado');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Y un `paid` del proveedor sigue confirmando.
    await respond('paid');
    expect(html(container)).toContain('Pago confirmado');
    await act(async () => root.unmount());
  });

  it('con `expiresAt` en el futuro sí hay cuenta atrás (control)', async () => {
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 90_000).toISOString() }));
    expect(html(container)).toMatch(/Expira en \d\d:\d\d/);
    await act(async () => root.unmount());
  });
});

// ---------------------------------------------------------------------------
// W · el poller muere (maxAttempts) → aviso y reinicio con «Ya pague»
// V · «Ya pague» con la consulta en vuelo no duplica el fetch
// ---------------------------------------------------------------------------

describe('W/V · «Ya pague» en el diálogo real', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] }));
  afterEach(() => jest.useRealTimers());

  const yaPague = (container: FakeNode): FakeNode | null =>
    findNode(container, (n) => n.tagName === 'BUTTON' && n.textContent === 'Ya pague');

  it('V · pulsar «Ya pague» con la consulta en vuelo no lanza un segundo fetch; al responder `paid` confirma una vez', async () => {
    const onPaid = jest.fn();
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), onPaid }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const btn = yaPague(container);
    expect(btn).not.toBeNull();
    let click: Promise<unknown> = Promise.resolve();
    await act(async () => {
      click = (reactProps(btn).onClick as () => Promise<void>)();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(html(container)).toContain('Verificando...');
    await act(async () => {
      pending.shift()!.resolve('paid');
      await click;
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('W · tras maxAttempts (100) el diálogo avisa y «Ya pague» reinicia el poller (fetch nuevo) en vez de ser un no-op', async () => {
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }));
    // 100 consultas `pending`; la 101.ª ya no sale: el poller muere y avisa.
    for (let i = 0; i < 100; i += 1) {
      expect(fetchMock).toHaveBeenCalledTimes(i + 1);
      await act(async () => {
        pending.shift()!.resolve('pending');
        await flush();
      });
      await act(async () => {
        jest.advanceTimersByTime(15_000);
        await flush();
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(100);
    expect(pending).toHaveLength(0);
    const out = html(container);
    expect(out).toContain('No se pudo verificar el pago; pulse «Ya pague» para reintentar.');
    // Sigue en espera (no «expirado»): el código y el botón siguen ahí.
    expect(out).toContain('<img');
    const btn = yaPague(container);
    expect(btn).not.toBeNull();
    let click: Promise<unknown> = Promise.resolve();
    await act(async () => {
      click = (reactProps(btn).onClick as () => Promise<void>)();
      await flush();
    });
    // Reinició: una consulta nueva (y solo una) y el aviso desapareció.
    expect(fetchMock).toHaveBeenCalledTimes(101);
    expect(html(container)).not.toContain('No se pudo verificar el pago');
    await act(async () => {
      pending.shift()!.resolve('pending');
      await click;
      await flush();
    });
    expect(html(container)).toContain('Ya pague');
    // Y la cadena reiniciada sigue sola: un intervalo → una consulta.
    await act(async () => {
      jest.advanceTimersByTime(15_000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(102);
    await act(async () => root.unmount());
  });

  it('W · un error transitorio (HTTP 500) NO muestra el aviso: el poller sigue reintentando', async () => {
    const { root, container } = await mountDialog(baseProps({ expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }));
    await act(async () => {
      pending.shift()!.reject(new Error('Respuesta HTTP 500'));
      await flush();
    });
    expect(html(container)).not.toContain('No se pudo verificar el pago');
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });
});
