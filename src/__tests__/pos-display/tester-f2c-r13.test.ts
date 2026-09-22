/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · TESTER, ronda 13
 * (revisión de la ronda de cierre: AD, QA-5, QA-6).
 *
 * Rompe, no defiende. Lo que se prueba aquí y no estaba en rondas previas:
 *
 *  HALLAZGO AE (defecto, `it.failing`): `manualChecksInFlightRef` NO se
 *      reinicia por apertura (el efecto [open] reinicia paidHandledRef,
 *      terminalNotifiedRef, oneShotCheckRef, providerTerminalRef y
 *      stopAfterManualRef, pero no el contador). Secuencia real: el cajero
 *      pulsa «Ya pague», la respuesta tarda (red lenta), pulsa «Cancelar»
 *      con la consulta en vuelo y genera OTRO QR (reapertura). El contador
 *      sigue en 1 con el QR nuevo; cuando vence su reloj local y la gracia
 *      de Z, el temporizador ve «consulta manual en vuelo», NO para el
 *      poller nuevo y marca `stopAfterManualRef`. Cuando la respuesta vieja
 *      llega, el finally de handleManualCheck aplica el stop() diferido
 *      sobre la constante `poller` de SU clausura: el poller VIEJO (ya
 *      parado). El poller nuevo sigue consultando ~24 min (maxAttempts):
 *      la regresión exacta que Z retiró, por una vía nueva. Si la respuesta
 *      vieja no llega nunca (fetch colgado), el contador queda en 1 para
 *      todas las aperturas siguientes del componente.
 *  Guarda (pasa): en esa misma secuencia, un `paid` TARDÍO del poller
 *      abandonado que llega con el diálogo REABIERTO no dispara onPaid
 *      aunque `openRef` vuelva a ser true: lo corta `alive()` del poller
 *      (F2C-R7-1 sigue valiendo a través de una reapertura).
 *  QA-5 por la vía de «Verificar pago» (pasa): tras el vencimiento local, la
 *      consulta única responde `rejected` → el texto pasa de «El tiempo ha
 *      expirado» a «Pago rechazado por el proveedor», solo queda «Cancelar»,
 *      0 timers y onTerminal una sola vez (la del reloj local).
 *  Estático: el reinicio por apertura del contador (`it.failing` hasta que
 *      se corrija) y que el stop() diferido se aplique sobre el poller
 *      VIGENTE (pollerRef), no sobre la constante de la clausura.
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

type Deferred = { resolve: (status: string) => void; reject: (e: Error) => void; url: string; settled: boolean };
let pending: Deferred[] = [];
let fetchMock: jest.Mock;
const realFetch = globalThis.fetch;

beforeEach(() => {
  pending = [];
  fetchMock = jest.fn((url: string) => new Promise((res, rej) => {
    const d: Deferred = {
      url,
      settled: false,
      resolve: (status) => { d.settled = true; res({ ok: true, status: 200, json: async () => ({ status }) }); },
      reject: (e) => { d.settled = true; rej(e); },
    };
    pending.push(d);
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
  reference: 'POS-120-t13',
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

/** Monta el diálogo y devuelve `rerender` para cambiar props (cerrar/reabrir con otro QR) sin desmontar. */
async function mountDialog(props: Record<string, unknown>): Promise<{ container: FakeNode; rerender: (p: Record<string, unknown>) => Promise<void> }> {
  const container = document.createElement('div');
  const root = createRoot(container);
  mounted.push(root);
  const Dialog = QrDialog();
  const rerender = async (p: Record<string, unknown>): Promise<void> => {
    await act(async () => {
      root.render(React.createElement(Dialog, p));
      await flush();
    });
  };
  await rerender(props);
  return { container, rerender };
}

/** Resuelve la consulta en vuelo número `index` (0 = la más antigua sin resolver). */
async function respondAt(index: number, status: string): Promise<void> {
  const open = pending.filter((d) => !d.settled);
  const target = open[index];
  if (!target) throw new Error(`no hay consulta en vuelo #${index} (hay ${open.length})`);
  await act(async () => {
    target.resolve(status);
    await flush();
  });
}

/** Resuelve la consulta en vuelo MÁS RECIENTE (la que abrió la última pulsación o el último tic del poller). */
async function respondLast(status: string): Promise<void> {
  const open = pending.filter((d) => !d.settled);
  if (open.length === 0) throw new Error('no hay consultas en vuelo');
  await act(async () => {
    open[open.length - 1].resolve(status);
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

async function press(btn: FakeNode): Promise<void> {
  await act(async () => {
    void (reactProps(btn).onClick as () => Promise<void>)();
    await flush();
  });
}

const isoIn = (ms: number): string => new Date(Date.now() + ms).toISOString();

// ---------------------------------------------------------------------------
// AE · el contador de consultas manuales sobrevive a la reapertura
// ---------------------------------------------------------------------------

describe('AE · «Ya pague» en vuelo + Cancelar + QR nuevo: el contador de consultas manuales sobrevive a la reapertura', () => {
  /**
   * Prepara la secuencia común: QR viejo abierto, «Ya pague» con la respuesta
   * en vuelo, Cancelar (open:false) y reapertura con OTRO QR (open:true).
   * Deja: consulta #0 = la del poller viejo (sin resolver), #1 = la primera
   * del poller nuevo (sin resolver).
   */
  async function reopenWithManualInFlight(onPaid: jest.Mock, onClose: jest.Mock, onTerminal: jest.Mock) {
    const oldProps = baseProps({ onPaid, onClose, onTerminal, reference: 'POS-120-viejo', expiresAt: isoIn(60_000) });
    const { container, rerender } = await mountDialog(oldProps);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // «Ya pague» con la primera consulta automática en vuelo: se suma a ella (V), sin fetch nuevo.
    await press(button(container, 'Ya pague')!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(buttons(container)).toContain('Verificando...');
    // Cancelar con la consulta en vuelo (el padre cierra: open:false).
    await rerender({ ...oldProps, open: false });
    // El cajero genera otro código: reapertura con OTRA referencia y OTRO vencimiento.
    const newProps = baseProps({ onPaid, onClose, onTerminal, reference: 'POS-120-nuevo', expiresAt: isoIn(60_000) });
    await rerender(newProps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(pending.filter((d) => !d.settled)).toHaveLength(2);
    return { container, rerender };
  }

  it.failing('AE · la gracia del QR NUEVO vence con la consulta VIEJA aún en vuelo: el poller nuevo debe pararse igual (Z), pero el contador heredado lo deja vivo y el stop() diferido cae sobre el poller viejo', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const onTerminal = jest.fn();
    const { container } = await reopenWithManualInFlight(onPaid, onClose, onTerminal);

    // Vence el reloj local del QR nuevo → «El tiempo ha expirado» + «Verificar pago», gracia armada.
    await advance(60_000);
    expect(container.textContent).toContain('El tiempo ha expirado');
    expect(buttons(container)).toContain('Verificar pago');
    expect(onTerminal).toHaveBeenCalledTimes(1);

    // Vence la gracia. Z: el poller nuevo se para; ninguna respuesta suya cuenta ya.
    await advance(graceMs());

    // Llega por fin la respuesta VIEJA (pending): el poller viejo la descarta
    // (generación muerta) y el finally de la pulsación vieja termina.
    await respondAt(0, 'pending');
    // Llega la respuesta del poller NUEVO: con Z cumplido, se descarta y NO se
    // programa otra consulta.
    await respondAt(0, 'pending');
    await advance(20_000);

    // Esperado: 2 consultas en total (una por poller) y 0 temporizadores: el
    // poller nuevo quedó parado por la gracia. Con el contador heredado, el
    // poller nuevo sigue vivo y aparece una TERCERA consulta (y seguirán
    // llegando hasta maxAttempts, ~24 min).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('guarda · un `paid` TARDÍO del poller abandonado que llega con el diálogo ya REABIERTO no dispara onPaid ni cierra: `alive()` del poller lo corta aunque openRef vuelva a ser true (F2C-R7-1 a través de la reapertura)', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const onTerminal = jest.fn();
    const { container } = await reopenWithManualInFlight(onPaid, onClose, onTerminal);

    // La respuesta VIEJA dice `paid` (el cliente pagó el QR abandonado) con el diálogo abierto para el QR NUEVO.
    await respondAt(0, 'paid');
    expect(onPaid).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('Pago confirmado');
    expect(buttons(container)).toContain('Cancelar');
    await advance(3_000);
    expect(onClose).not.toHaveBeenCalled();
    // El poller nuevo sigue esperando su propia respuesta.
    expect(pending.filter((d) => !d.settled)).toHaveLength(1);
    // El nuevo responde `pending`: sigue el ciclo normal (timer de 3 s armado, además del reloj de 1 s).
    await respondAt(0, 'pending');
    expect(container.textContent).toContain('Expira en');
    expect(jest.getTimerCount()).toBeGreaterThanOrEqual(1);
  });

  it('control · la misma secuencia pero la respuesta vieja llega ANTES de reabrir: el contador vuelve a 0, la gracia del QR nuevo para su poller (2 consultas, 0 timers)', async () => {
    const onPaid = jest.fn();
    const onClose = jest.fn();
    const oldProps = baseProps({ onPaid, onClose, reference: 'POS-120-viejo', expiresAt: isoIn(60_000) });
    const { container, rerender } = await mountDialog(oldProps);
    await press(button(container, 'Ya pague')!);
    await rerender({ ...oldProps, open: false });
    // Respuesta vieja ANTES de reabrir: se descarta y el finally baja el contador.
    await respondAt(0, 'pending');
    const newProps = baseProps({ onPaid, onClose, reference: 'POS-120-nuevo', expiresAt: isoIn(60_000) });
    await rerender(newProps);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(60_000);
    expect(buttons(container)).toContain('Verificar pago');
    await advance(graceMs());
    await respondAt(0, 'pending');
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
    expect(onPaid).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// QA-5 por la vía de «Verificar pago»
// ---------------------------------------------------------------------------

describe('QA-5 · veredicto del proveedor que llega por «Verificar pago» tras el vencimiento local', () => {
  it.each([
    ['rejected', 'Pago rechazado por el proveedor'],
    ['cancelled', 'Pago cancelado'],
  ] as const)('«Verificar pago» → `%s`: el texto pasa de «El tiempo ha expirado» a «%s», solo queda «Cancelar», onTerminal UNA vez (la del reloj local) y 0 timers', async (status, text) => {
    const onTerminal = jest.fn();
    const onPaid = jest.fn();
    const { container } = await mountDialog(baseProps({ onTerminal, onPaid, expiresAt: isoIn(30_000) }));
    await respondAt(0, 'pending');
    await advance(30_000);
    expect(container.textContent).toContain('El tiempo ha expirado');
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await advance(graceMs());
    // Poller parado por la gracia; la pulsación abre UNA consulta.
    const before = fetchMock.mock.calls.length;
    await press(button(container, 'Verificar pago')!);
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
    // Las consultas automáticas de los 30 s previos quedaron sin respuesta (generación muerta): se responde a la de la pulsación.
    await respondLast(status);
    expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain('El tiempo ha expirado');
    expect(container.textContent).toContain('Solicita un nuevo codigo QR');
    expect(buttons(container)).toEqual(['Cancelar']);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    // Nadie vuelve a consultar.
    await advance(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(before + 1);
  });
});

// ---------------------------------------------------------------------------
// QR ya vencido al abrir (reloj adelantado o sesión vieja del proveedor)
// ---------------------------------------------------------------------------

describe('borde · `expiresAt` ya en el pasado al abrir', () => {
  it('se abre directamente en «El tiempo ha expirado» con «Verificar pago»; al primer tic avisa onTerminal una vez, arma la gracia y la gracia para el poller (una sola consulta automática, 0 timers después)', async () => {
    const onTerminal = jest.fn();
    const { container } = await mountDialog(baseProps({ onTerminal, expiresAt: isoIn(-5_000) }));
    expect(container.textContent).toContain('El tiempo ha expirado');
    expect(buttons(container)).toEqual(['Cancelar', 'Verificar pago']);
    // Antes del primer tic no se ha avisado al padre (el aviso vive en el intervalo).
    expect(onTerminal).toHaveBeenCalledTimes(0);
    await advance(1_000);
    expect(onTerminal).toHaveBeenCalledTimes(1);
    await advance(graceMs());
    await respondAt(0, 'pending');
    await advance(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Estático
// ---------------------------------------------------------------------------

describe('Estático · QrPaymentDialog (AE)', () => {
  it('el bloque de reinicio por apertura del efecto [open] reinicia las cinco banderas conocidas', () => {
    const resetBlock = QR_DIALOG.slice(QR_DIALOG.indexOf('paidHandledRef.current = false;'), QR_DIALOG.indexOf('const poller = new QrPoller'));
    for (const ref of ['paidHandledRef', 'terminalNotifiedRef', 'oneShotCheckRef', 'providerTerminalRef', 'stopAfterManualRef']) {
      expect(resetBlock).toContain(`${ref}.current = false;`);
    }
  });

  it.failing('AE · el contador `manualChecksInFlightRef` también se reinicia por apertura (hoy no: hereda las consultas en vuelo del QR anterior)', () => {
    const resetBlock = QR_DIALOG.slice(QR_DIALOG.indexOf('paidHandledRef.current = false;'), QR_DIALOG.indexOf('const poller = new QrPoller'));
    expect(resetBlock).toMatch(/manualChecksInFlightRef\.current = 0;/);
  });

  it.failing('AE · el stop() diferido de la gracia se aplica sobre el poller VIGENTE (pollerRef.current), no sobre la constante `poller` de la clausura de la pulsación', () => {
    const finallyBlock = QR_DIALOG.slice(QR_DIALOG.indexOf('const stopAfterManual = '), QR_DIALOG.indexOf('setChecking(false);', QR_DIALOG.indexOf('const stopAfterManual = ')));
    expect(finallyBlock).toMatch(/pollerRef\.current\?\.stop\(\)/);
    expect(finallyBlock).not.toMatch(/\bpoller\.stop\(\)/);
  });
});
