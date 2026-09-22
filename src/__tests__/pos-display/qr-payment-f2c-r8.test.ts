/**
 * Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 8 (corrección
 * de la lista QA/tester de la ronda 7).
 *
 * Cubre, en Node y sin DOM:
 *  1. QA-1 (F2C-R7-2) · guard de en-vuelo de «Generar QR de pago»: con el
 *     MISMO cableado que handleQrPayment (ref síncrono + estado + finally)
 *     ejecutado en React 19 real, dos pulsaciones consecutivas hacen UN solo
 *     fetch y el botón queda deshabilitado («Generando…») hasta que responde.
 *  2. QA-2 (F2C-R7-1) · QrPaymentDialog + QrPoller reales en React 19: el
 *     cajero cancela (open → false) con la consulta en vuelo y el `paid`
 *     tardío NO llega a onPaid. Y la segunda red (openRef) sola: si un
 *     poller «viejo» entregara el callback con el diálogo cerrado, se ignora.
 *  3. QA-6 · dependencia de orden entre los updaters de `payments` y
 *     `touchedIds` (confirmedQrEntryIdRef): guard estático que falla si se
 *     declara `touchedIds` antes que `payments`, y la demostración en React
 *     real de POR QUÉ: con el orden invertido el ref llega null y se marca el
 *     respaldo aunque la entrada de origen exista.
 *  4. QA-4 · fin de línea: los archivos que toca esta ronda están en LF en el
 *     árbol (con `.gitattributes` vigente, `w/crlf` significa que una
 *     herramienta los reescribió en CRLF).
 *
 * Helpers copiados a propósito (un test no importa de otro). Organización
 * ficticia (org 120), sin nombres reales.
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { confirmQrPaymentEntry, type CashReceivedEntry } from '@/lib/pos/display/payment';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const CHECKOUT = readSrc('components/pos/CheckoutDialog.tsx');

type Entry = CashReceivedEntry;
const TOTAL = 25_000;

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
type ReactNs = typeof import('react');
type RootApi = { render: (el: unknown) => void; unmount: () => void };

/** Contenedor mínimo para react-dom/client sin jsdom (mismo que tester-f2c-r7 › A). */
function fakeContainer(): unknown {
  return { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', ownerDocument: null, addEventListener() {}, removeEventListener() {} };
}

let React: ReactNs;
let createRoot: (c: unknown) => RootApi;
let act: (cb: () => Promise<void> | void) => Promise<void>;

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  class HTMLIFrameElement {}
  (globalThis as any).window = {
    event: undefined,
    HTMLIFrameElement,
    document: { activeElement: null, body: null },
    addEventListener() {},
    removeEventListener() {},
  };
  React = require('react');
  createRoot = require('react-dom/client').createRoot;
  act = React.act as unknown as typeof act;
});

afterAll(() => {
  delete (globalThis as any).window;
  delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT;
});

const flush = async () => {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
};

// ---------------------------------------------------------------------------
// 1 · QA-1 (F2C-R7-2): guard de en-vuelo ejecutado en React 19
// ---------------------------------------------------------------------------

describe('QA-1 · «Generar QR de pago»: dos pulsaciones ⇒ un solo fetch (React 19 real, mismo cableado que handleQrPayment)', () => {
  interface Caja {
    isCreatingQr: boolean;
    label: string;
    disabled: boolean;
    generar: () => Promise<void>;
  }
  let caja: Caja | null = null;
  let fetches: Array<(v: unknown) => void> = [];
  let fetchMock: jest.Mock;

  function CajaQr({ othersCoverTotal }: { othersCoverTotal: boolean }) {
    const { useState, useRef } = React;
    const qrRequestInFlightRef = useRef(false);
    const [isCreatingQr, setIsCreatingQr] = useState(false);
    const handleQrPayment = async (): Promise<void> => {
      if (qrRequestInFlightRef.current) return;
      qrRequestInFlightRef.current = true;
      setIsCreatingQr(true);
      try {
        await fetchMock();
      } finally {
        qrRequestInFlightRef.current = false;
        setIsCreatingQr(false);
      }
    };
    caja = {
      isCreatingQr,
      label: isCreatingQr ? 'Generando…' : 'Generar QR de pago',
      disabled: othersCoverTotal || isCreatingQr,
      generar: handleQrPayment,
    };
    return null;
  }

  beforeEach(() => {
    fetches = [];
    fetchMock = jest.fn(() => new Promise<unknown>((resolve) => { fetches.push(resolve); }));
    caja = null;
  });

  const c = (): Caja => {
    if (!caja) throw new Error('sin render');
    return caja;
  };

  async function mount(othersCoverTotal = false): Promise<RootApi> {
    const root = createRoot(fakeContainer());
    await act(async () => {
      root.render(React.createElement(CajaQr, { othersCoverTotal }));
    });
    return root;
  }

  it('doble tap en el mismo tick: un fetch, botón deshabilitado y «Generando…» mientras vuela; al responder vuelve a «Generar QR de pago»', async () => {
    const root = await mount();
    expect(c().disabled).toBe(false);
    expect(c().label).toBe('Generar QR de pago');
    let p1: Promise<void> = Promise.resolve();
    let p2: Promise<void> = Promise.resolve();
    await act(async () => {
      p1 = c().generar();
      p2 = c().generar();
      await p2;
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(c().isCreatingQr).toBe(true);
    expect(c().disabled).toBe(true);
    expect(c().label).toBe('Generando…');
    await act(async () => {
      fetches[0]({ ok: true });
      await p1;
    });
    expect(c().isCreatingQr).toBe(false);
    expect(c().disabled).toBe(false);
    expect(c().label).toBe('Generar QR de pago');
    await act(async () => root.unmount());
  });

  it('pulsación en OTRO render con la primera aún en vuelo: sigue siendo un fetch; tras responder, la siguiente sí genera', async () => {
    const root = await mount();
    let p1: Promise<void> = Promise.resolve();
    await act(async () => {
      p1 = c().generar();
      await flush();
    });
    // Ya re-renderizó con isCreatingQr=true: el botón está deshabilitado y, aunque se llame, el ref corta.
    expect(c().disabled).toBe(true);
    await act(async () => c().generar());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      fetches[0]({ ok: true });
      await p1;
    });
    let p3: Promise<void> = Promise.resolve();
    await act(async () => {
      p3 = c().generar();
      await flush();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      fetches[1]({ ok: true });
      await p3;
    });
    await act(async () => root.unmount());
  });

  it('el fetch rechaza: el guard se suelta (finally) y el botón vuelve a estar disponible', async () => {
    fetchMock = jest.fn(() => Promise.reject(new Error('red caída')));
    const root = await mount();
    await act(async () => {
      await c().generar().catch(() => undefined);
    });
    expect(c().isCreatingQr).toBe(false);
    expect(c().disabled).toBe(false);
    await act(async () => {
      await c().generar().catch(() => undefined);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => root.unmount());
  });

  it('othersCoverTotal sigue mandando: deshabilitado aunque no haya nada en vuelo', async () => {
    const root = await mount(true);
    expect(c().disabled).toBe(true);
    expect(c().label).toBe('Generar QR de pago');
    await act(async () => root.unmount());
  });

  it('CheckoutDialog (estático): el guard está en handleQrPayment y en el botón', () => {
    const start = CHECKOUT.indexOf('const handleQrPayment = async (');
    const handler = CHECKOUT.slice(start, CHECKOUT.indexOf('const loadTaxData = async', start));
    expect(handler).toContain('if (qrRequestInFlightRef.current) return;');
    expect(handler).toContain('qrRequestInFlightRef.current = true;');
    expect(handler).toContain('setIsCreatingQr(true);');
    expect(handler).toMatch(/\} finally \{\s*(\/\/[^\n]*\n\s*)*qrRequestInFlightRef\.current = false;\s*setIsCreatingQr\(false\);\s*\}/);
    expect(CHECKOUT).toContain('disabled={othersCoverTotal || isCreatingQr}');
    expect(CHECKOUT).toContain("{isCreatingQr ? 'Generando…' : 'Generar QR de pago'}");
  });
});

// ---------------------------------------------------------------------------
// 2 · QA-2 (F2C-R7-1): cancelar con la consulta en vuelo
// ---------------------------------------------------------------------------

describe('QA-2 · QrPaymentDialog + QrPoller en React 19: un `paid` que llega tras cancelar no confirma nada', () => {
  type Deferred = { resolve: (v: unknown) => void };
  let deferred: Deferred[] = [];
  const originalFetch = (globalThis as { fetch?: unknown }).fetch;

  beforeEach(() => {
    deferred = [];
    (globalThis as { fetch?: unknown }).fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          deferred.push({ resolve });
        }),
    );
  });
  afterEach(() => {
    (globalThis as { fetch?: unknown }).fetch = originalFetch;
  });

  const okJson = (body: unknown) => ({ ok: true, json: async () => body });

  /**
   * Mismo cableado que QrPaymentDialog (ronda 8): openRef sincronizado en un
   * efecto declarado ANTES del efecto del poller; el poller vive en [open] y
   * su cleanup llama a stop(); onPaid del poller se ignora con open=false.
   * `injectPaid` simula un poller «viejo» (sin la corrección) que entrega el
   * callback igualmente: prueba la segunda red por separado.
   */
  function Dialogo({ open, onPaid, reference }: { open: boolean; onPaid: () => void; reference: string }) {
    const { useEffect, useRef } = React;
    const openRef = useRef<boolean>(open);
    const paidHandledRef = useRef(false);
    const callbackRef = useRef<(() => void) | null>(null);
    useEffect(() => {
      openRef.current = open;
    }, [open]);
    useEffect(() => {
      if (!open) return;
      paidHandledRef.current = false;
      const cb = () => {
        if (!openRef.current) return;
        if (!paidHandledRef.current) {
          paidHandledRef.current = true;
          onPaid();
        }
      };
      callbackRef.current = cb;
      const poller = new QrPoller({ reference, organizationId: 120, onPaid: cb });
      poller.start();
      return () => {
        poller.stop();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);
    injectPaid = () => callbackRef.current?.();
    return null;
  }
  let injectPaid: () => void = () => undefined;

  async function render(root: RootApi, open: boolean, onPaid: () => void) {
    await act(async () => {
      root.render(React.createElement(Dialogo, { open, onPaid, reference: 'POS-120-r8' }));
    });
  }

  it('Cancelar (open → false) con el fetch en vuelo; la respuesta `paid` llega después: onPaid NO se llama', async () => {
    const onPaid = jest.fn();
    const root = createRoot(fakeContainer());
    await render(root, true, onPaid);
    expect(deferred).toHaveLength(1);
    await render(root, false, onPaid); // cleanup → poller.stop(); openRef → false
    await act(async () => {
      deferred[0].resolve(okJson({ status: 'paid' }));
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    // Ni siquiera hubo un segundo fetch.
    expect(deferred).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it('segunda red sola: un poller «viejo» que entregara onPaid con el diálogo cerrado se ignora (openRef)', async () => {
    const onPaid = jest.fn();
    const root = createRoot(fakeContainer());
    await render(root, true, onPaid);
    await render(root, false, onPaid);
    await act(async () => {
      injectPaid();
    });
    expect(onPaid).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('control: con el diálogo abierto el `paid` sí confirma (una sola vez)', async () => {
    const onPaid = jest.fn();
    const root = createRoot(fakeContainer());
    await render(root, true, onPaid);
    await act(async () => {
      deferred[0].resolve(okJson({ status: 'paid' }));
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    await act(async () => {
      injectPaid();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('reabrir para OTRO código con la consulta vieja en vuelo: la respuesta vieja no confirma el nuevo', async () => {
    const onPaid = jest.fn();
    const root = createRoot(fakeContainer());
    await render(root, true, onPaid);
    await render(root, false, onPaid);
    await render(root, true, onPaid); // nuevo QrPoller (nuevo QR)
    expect(deferred).toHaveLength(2);
    await act(async () => {
      deferred[0].resolve(okJson({ status: 'paid' })); // la vieja
      await flush();
    });
    expect(onPaid).not.toHaveBeenCalled();
    await act(async () => {
      deferred[1].resolve(okJson({ status: 'paid' })); // la vigente
      await flush();
    });
    expect(onPaid).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });
});

// ---------------------------------------------------------------------------
// 3 · QA-6: dependencia de orden entre updaters (guard + demostración)
// ---------------------------------------------------------------------------

describe('QA-6 · confirmedQrEntryIdRef: el hook de `payments` DEBE declararse antes que el de `touchedIds`', () => {
  it('guard estático: en CheckoutDialog `payments` va antes que `touchedIds`, y ambos antes que el ref y que onPaid', () => {
    const payments = CHECKOUT.indexOf('const [payments, setPayments] = useState<PaymentEntry[]>([]);');
    const touched = CHECKOUT.indexOf('const [touchedIds, setTouchedIds] = useState<Set<string>>(() => new Set());');
    const ref = CHECKOUT.indexOf('const confirmedQrEntryIdRef = useRef<string | null>(null);');
    const onPaid = CHECKOUT.indexOf('onPaid={() => {');
    expect(payments).toBeGreaterThan(0);
    expect(touched).toBeGreaterThan(payments);
    expect(ref).toBeGreaterThan(payments);
    expect(onPaid).toBeGreaterThan(touched);
    // Solo hay UNA declaración de cada uno (no hay un segundo `touchedIds` más arriba).
    expect(CHECKOUT.split('const [touchedIds, setTouchedIds]').length).toBe(2);
    expect(CHECKOUT.split('const [payments, setPayments]').length).toBe(2);
    // El comentario del ref documenta la dependencia y apunta a este guard.
    const refComment = CHECKOUT.slice(CHECKOUT.lastIndexOf('\n  //', ref) - 800, ref);
    expect(refComment).toContain('DEPENDENCIA DE ORDEN');
    expect(refComment).toContain('qr-payment-f2c-r8');
  });

  type Harness = { payments: Entry[]; touched: Set<string>; onPaid: (id: string) => void };
  type SetPayments = (u: (p: Entry[]) => Entry[]) => void;
  type SetTouched = (u: (p: Set<string>) => Set<string>) => void;

  /**
   * Mismo cableado que onPaid: setShowQrDialog(false) PRIMERO con el diálogo
   * abierto (así hay trabajo pendiente y React ya no calcula el updater de
   * payments en el dispatch, sino en el render y en orden de hooks), luego
   * el updater de payments fija el ref y el de touched lo lee.
   */
  function wireOnPaid(setDialog: (v: boolean) => void, setPayments: SetPayments, setTouched: SetTouched, ref: { current: string | null }) {
    return (qrEntryId: string) => {
      setDialog(false);
      const newPayment: Entry = { id: 'respaldo', method: 'breb_qr', amount: TOTAL };
      ref.current = null;
      setPayments((prev) => {
        const confirmed = confirmQrPaymentEntry({ payments: prev, qrEntryId, method: 'breb_qr', amount: TOTAL, fallback: newPayment });
        ref.current = confirmed.confirmedId;
        return confirmed.payments;
      });
      setTouched((prev) => {
        const id = ref.current ?? newPayment.id;
        return prev.has(id) ? prev : new Set(prev).add(id);
      });
    };
  }

  /** Dos componentes distintos (no hooks condicionales): el orden de declaración es lo que se prueba. */
  function makeCaja(invertido: boolean) {
    let harness: Harness | null = null;
    function CajaOrdenada() {
      const { useState, useRef } = React;
      const [payments, setPayments] = useState<Entry[]>([{ id: 'q1', method: 'qr', amount: TOTAL }]);
      const [touched, setTouched] = useState<Set<string>>(() => new Set());
      const [, setDialog] = useState<boolean>(true);
      const confirmedQrEntryIdRef = useRef<string | null>(null);
      harness = { payments, touched, onPaid: wireOnPaid(setDialog, setPayments, setTouched, confirmedQrEntryIdRef) };
      return null;
    }
    function CajaInvertida() {
      const { useState, useRef } = React;
      const [touched, setTouched] = useState<Set<string>>(() => new Set());
      const [payments, setPayments] = useState<Entry[]>([{ id: 'q1', method: 'qr', amount: TOTAL }]);
      const [, setDialog] = useState<boolean>(true);
      const confirmedQrEntryIdRef = useRef<string | null>(null);
      harness = { payments, touched, onPaid: wireOnPaid(setDialog, setPayments, setTouched, confirmedQrEntryIdRef) };
      return null;
    }
    return { Caja: invertido ? CajaInvertida : CajaOrdenada, h: () => { if (!harness) throw new Error('sin render'); return harness; } };
  }

  it('orden correcto (payments < touchedIds): se confirma q1 y ES la tocada', async () => {
    const { Caja, h } = makeCaja(false);
    const root = createRoot(fakeContainer());
    await act(async () => root.render(React.createElement(Caja)));
    await act(async () => h().onPaid('q1'));
    expect(h().payments).toEqual([{ id: 'q1', method: 'breb_qr', amount: TOTAL }]);
    expect([...h().touched]).toEqual(['q1']);
    await act(async () => root.unmount());
  });

  it('orden INVERTIDO (touchedIds < payments): el ref llega null y se marca el respaldo aunque q1 exista — por eso existe el guard', async () => {
    const { Caja, h } = makeCaja(true);
    const root = createRoot(fakeContainer());
    await act(async () => root.render(React.createElement(Caja)));
    await act(async () => h().onPaid('q1'));
    // La lista sí confirma q1 …
    expect(h().payments).toEqual([{ id: 'q1', method: 'breb_qr', amount: TOTAL }]);
    // … pero el tocado es un id que NO está en la lista: el invariante se rompe.
    expect([...h().touched]).toEqual(['respaldo']);
    expect(h().payments.some((p) => p.id === 'respaldo')).toBe(false);
    await act(async () => root.unmount());
  });
});

// ---------------------------------------------------------------------------
// 4 · QA-4: fin de línea de los archivos tocados en esta ronda
// ---------------------------------------------------------------------------

describe('QA-4 · los archivos que toca la ronda 8 están en LF en el árbol', () => {
  const files = [
    'src/components/pos/CheckoutDialog.tsx',
    'src/components/shared/QrPaymentDialog.tsx',
    'src/lib/services/integrations/qrShared/qrPoller.ts',
    'src/lib/pos/display/payment.ts',
    'src/__tests__/pos-display/tester-f2c-r7.test.ts',
    'src/__tests__/pos-display/qr-payment-f2c-r8.test.ts',
  ];
  const attrsPath = join(ROOT, '.gitattributes');
  const attrsEnforceLf = existsSync(attrsPath) && /^\* text=auto eol=lf$/m.test(readFileSync(attrsPath, 'utf8').replace(/\r\n/g, '\n'));

  function worktreeEol(rel: string): string | null {
    let out = '';
    try {
      out = execFileSync('git', ['ls-files', '--eol', '--', rel], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
    const m = out.match(/\bw\/(\S+)/);
    return m ? m[1] : null;
  }

  it.each(files)('%s: sin \\r en el árbol (con .gitattributes vigente, w/crlf = una herramienta lo reescribió)', (rel) => {
    const bytes = readFileSync(join(ROOT, rel), 'utf8');
    if (!attrsEnforceLf) return; // sin la regla, el checkout en Windows con autocrlf=true puede venir en CRLF: no es un defecto del código
    expect(bytes.includes('\r')).toBe(false);
    const eol = worktreeEol(rel);
    if (eol !== null) expect(['lf', 'none']).toContain(eol);
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
