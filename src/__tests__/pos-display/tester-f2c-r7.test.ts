/**
 * Tester · Fase 2 · Parte C (Cobro con QR a pantalla completa) · ronda 7
 * (cierre del builder: confirmQrPaymentEntry + confirmedQrEntryIdRef,
 * .gitattributes, guards C5/D6 sobre el índice).
 *
 * Qué se intenta romper aquí y no en las rondas previas:
 *
 *  A. El patrón «ref entre dos updaters» de onPaid depende de que React
 *     ejecute el updater de `payments` ANTES que el de `touchedIds`. El
 *     builder lo fija con un test estático (orden de hooks); aquí se EJECUTA
 *     React 19 de verdad (react-dom/client sobre un contenedor mínimo, sin
 *     jsdom) con el mismo cableado que CheckoutDialog y se afirma el
 *     invariante «el id tocado existe en la lista» en: entrada viva, entrada
 *     quitada antes, entrada quitada en el MISMO lote, diálogo ya cerrado
 *     (setShowQrDialog(false) sin cambio ⇒ bail-out eager, el updater de
 *     payments se calcula en el dispatch) y StrictMode (updaters dos veces).
 *  B. confirmQrPaymentEntry: contrato en los bordes que el builder no
 *     enumeró (ids duplicados, importe no validado, método con espacios,
 *     respaldo cuyo id ya existe).
 *  C. QrPoller: `stop()` no cancelaba una consulta EN VUELO; si esa consulta
 *     volvía `paid`, onPaid se disparaba con el diálogo ya cerrado (Cancelar)
 *     y CheckoutDialog registraba el pago del QR ABANDONADO (DEFECTO
 *     F2C-R7-1, bajo). RESUELTO en la ronda 8: poll() relee `running` (y la
 *     generación del start) tras cada await y QrPaymentDialog ignora onPaid
 *     con `open` ya en false (openRef). Aquí se afirma el comportamiento
 *     corregido.
 *  D. «Generar QR de pago» no tenía guard de en-vuelo: dos pulsaciones (doble
 *     tap en pantalla táctil) creaban DOS sesiones/cobros reales en el
 *     proveedor y el diálogo, cuyo poller queda fijado a la referencia del
 *     primer `open` (efecto con deps `[open]`), mostraba el segundo QR
 *     mientras sondeaba el primero (DEFECTO F2C-R7-2, alto, PREEXISTENTE).
 *     RESUELTO en la ronda 8: `qrRequestInFlightRef` corta en el handler,
 *     `isCreatingQr` deshabilita el botón («Generando…»). Se afirma el guard
 *     y que dos pulsaciones consecutivas hacen UN solo fetch.
 *  E. .gitattributes: `* text=auto eol=lf` alcanzaba a los `.bat` (gradlew.bat
 *     y print-agent/*.bat); cmd.exe quiere CRLF y el upstream de Gradle fija
 *     `*.bat text eol=crlf` (DEFECTO F2C-R7-3, bajo). RESUELTO: `*.bat`,
 *     `*.cmd` y `*.ps1` en CRLF; el test ya es un `it` normal.
 *  F. Bordes de esta parte con las funciones puras reales: QR vencido en
 *     onPaid no impide confirmar la entrada; importe 0 (cortesía) nunca viaja.
 *
 * Ronda 8: ya no queda ningún `it.failing` en este archivo; los tres
 * defectos que documentaba están corregidos y sus tests afirman la
 * corrección. Organización ficticia (org 120), sin nombres reales.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { confirmQrPaymentEntry, resolveDisplayQr, toDisplayPayment, type CashReceivedEntry } from '@/lib/pos/display/payment';
import { QrPoller } from '@/lib/services/integrations/qrShared/qrPoller';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const readSrc = (rel: string): string => readFileSync(join(SRC, rel), 'utf8').replace(/\r\n/g, '\n');
const CHECKOUT = readSrc('components/pos/CheckoutDialog.tsx');
const QR_DIALOG = readSrc('components/shared/QrPaymentDialog.tsx');
const ON_PAID = CHECKOUT.slice(CHECKOUT.indexOf('onPaid={() => {'), CHECKOUT.indexOf('<SerialSelectorDialog'));

type Entry = CashReceivedEntry;
const TOTAL = 25_000;

// ---------------------------------------------------------------------------
// A · React 19 de verdad: el ref viaja del updater de payments al de touchedIds
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
type ReactNs = typeof import('react');
type RootApi = { render: (el: unknown) => void; unmount: () => void };

interface Harness {
  payments: Entry[];
  touched: Set<string>;
  dialog: boolean;
  log: string[];
  onPaid: (qrEntryId: string | undefined) => void;
  remove: (id: string) => void;
}

/**
 * Contenedor mínimo para react-dom/client sin jsdom: React solo necesita
 * nodeType, addEventListener y ownerDocument (null ⇒ no engancha
 * selectionchange). El componente devuelve null: no se crean nodos host.
 */
function fakeContainer(): unknown {
  return { nodeType: 1, nodeName: 'DIV', tagName: 'DIV', ownerDocument: null, addEventListener() {}, removeEventListener() {} };
}

describe('A · React 19 ejecutado: confirmedQrEntryIdRef entre setPayments y setTouchedIds', () => {
  let React: ReactNs;
  let createRoot: (c: unknown) => RootApi;
  let act: (cb: () => Promise<void> | void) => Promise<void>;
  let harness: Harness | null = null;

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

  /** Mismo cableado que onPaid de CheckoutDialog (ronda 7): hooks en el mismo orden (payments < touchedIds). */
  function Caja({ dialogInit }: { dialogInit: boolean }) {
    const { useState, useRef } = React;
    const [payments, setPayments] = useState<Entry[]>([{ id: 'q1', method: 'qr', amount: TOTAL }]);
    const [dialog, setDialog] = useState<boolean>(dialogInit);
    const [touched, setTouched] = useState<Set<string>>(() => new Set());
    const confirmedQrEntryIdRef = useRef<string | null>(null);
    const log = useRef<string[]>([]);
    harness = {
      payments,
      touched,
      dialog,
      log: log.current,
      onPaid(qrEntryId) {
        setDialog(false);
        const newPayment: Entry = { id: 'respaldo', method: 'breb_qr', amount: TOTAL };
        confirmedQrEntryIdRef.current = null;
        setPayments((prev) => {
          log.current.push('payments');
          const confirmed = confirmQrPaymentEntry({ payments: prev, qrEntryId, method: 'breb_qr', amount: TOTAL, fallback: newPayment });
          confirmedQrEntryIdRef.current = confirmed.confirmedId;
          return confirmed.payments;
        });
        setTouched((prev) => {
          log.current.push(`touched:${confirmedQrEntryIdRef.current ?? 'NULL'}`);
          const id = confirmedQrEntryIdRef.current ?? newPayment.id;
          return prev.has(id) ? prev : new Set(prev).add(id);
        });
      },
      remove(id) {
        setPayments((prev) => prev.filter((p) => p.id !== id));
      },
    };
    return null;
  }

  async function mount(dialogInit: boolean, strict: boolean): Promise<RootApi> {
    const root = createRoot(fakeContainer());
    const el = React.createElement(Caja, { dialogInit });
    await act(async () => {
      root.render(strict ? React.createElement(React.StrictMode, null, el) : el);
    });
    return root;
  }

  const h = (): Harness => {
    if (!harness) throw new Error('sin render');
    return harness;
  };

  it.each([
    [false, true],
    [false, false],
    [true, true],
    [true, false],
  ])('entrada viva (strict=%s, diálogo abierto=%s): se confirma q1 y ES la tocada; el updater de payments corre antes', async (strict, dialogInit) => {
    const root = await mount(dialogInit, strict);
    await act(async () => h().onPaid('q1'));
    expect(h().payments).toEqual([{ id: 'q1', method: 'breb_qr', amount: TOTAL }]);
    expect([...h().touched]).toEqual(['q1']);
    expect(h().dialog).toBe(false);
    // Orden real de ejecución: payments antes que touched, y el ref ya fijado al leerlo.
    const log = h().log;
    expect(log[0]).toBe('payments');
    expect(log.filter((l) => l.startsWith('touched:')).every((l) => l === 'touched:q1')).toBe(true);
    expect(log.some((l) => l === 'touched:NULL')).toBe(false);
    if (strict) expect(log.filter((l) => l === 'payments').length).toBeGreaterThanOrEqual(2);
    await act(async () => root.unmount());
  });

  it.each([true, false])('el cajero quitó q1 ANTES de confirmar (strict=%s): se añade el respaldo y ESE queda tocado (nunca un id inexistente)', async (strict) => {
    const root = await mount(true, strict);
    await act(async () => h().remove('q1'));
    expect(h().payments).toEqual([]);
    await act(async () => h().onPaid('q1'));
    expect(h().payments).toEqual([{ id: 'respaldo', method: 'breb_qr', amount: TOTAL }]);
    expect([...h().touched]).toEqual(['respaldo']);
    await act(async () => root.unmount());
  });

  it('quitar q1 y confirmar en el MISMO lote (la clausura aún ve q1): la lista y el tocado siguen de acuerdo', async () => {
    const root = await mount(true, false);
    await act(async () => {
      h().remove('q1');
      h().onPaid('q1');
    });
    expect(h().payments).toEqual([{ id: 'respaldo', method: 'breb_qr', amount: TOTAL }]);
    expect([...h().touched]).toEqual(['respaldo']);
    await act(async () => root.unmount());
  });

  it('diálogo YA cerrado (bail-out eager de setShowQrDialog(false)): el updater de payments se calcula en el dispatch y el ref sigue llegando al de touchedIds', async () => {
    const root = await mount(false, false);
    await act(async () => h().onPaid('q1'));
    expect([...h().touched]).toEqual(['q1']);
    expect(h().payments.some((p) => p.id === 'q1' && p.method === 'breb_qr')).toBe(true);
    await act(async () => root.unmount());
  });

  it('onPaid dos veces (poller + «Ya pagué» antes de cerrar): idempotente, ni entradas ni tocados duplicados', async () => {
    const root = await mount(true, true);
    await act(async () => h().onPaid('q1'));
    await act(async () => h().onPaid('q1'));
    expect(h().payments).toHaveLength(1);
    expect([...h().touched]).toEqual(['q1']);
    await act(async () => root.unmount());
  });

  it('invariante en todos los escenarios: touched ⊆ ids de payments', async () => {
    for (const strict of [true, false]) {
      for (const removeFirst of [true, false]) {
        const root = await mount(true, strict);
        if (removeFirst) await act(async () => h().remove('q1'));
        await act(async () => h().onPaid('q1'));
        const ids = new Set(h().payments.map((p) => p.id));
        for (const t of h().touched) expect(ids.has(t)).toBe(true);
        await act(async () => root.unmount());
      }
    }
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------------------
// B · confirmQrPaymentEntry en los bordes
// ---------------------------------------------------------------------------

describe('B · confirmQrPaymentEntry: bordes del contrato', () => {
  const fallback: Entry = { id: 'respaldo', method: 'breb_qr', amount: 10_000 };

  it('ids duplicados en la lista (no debería pasar con randomUUID): reescribe TODAS las coincidencias, no añade', () => {
    const prev: Entry[] = [
      { id: 'q1', method: 'qr', amount: 5_000 },
      { id: 'q1', method: 'qr', amount: 5_000 },
    ];
    const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: 'breb_qr', amount: 10_000, fallback });
    expect(r.payments).toHaveLength(2);
    expect(r.payments.every((p) => p.method === 'breb_qr' && p.amount === 10_000)).toBe(true);
    expect(r.confirmedId).toBe('q1');
  });

  it('el importe NO se valida (NaN, negativo, Infinity pasan tal cual): la garantía viene de resolveQrChargeAmount en la caja', () => {
    const prev: Entry[] = [{ id: 'q1', method: 'qr', amount: TOTAL }];
    for (const amount of [Number.NaN, -1, Number.POSITIVE_INFINITY, 0]) {
      const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: 'breb_qr', amount, fallback });
      expect(Object.is(r.payments[0].amount, amount)).toBe(true);
    }
    // En CheckoutDialog el importe confirmado es SIEMPRE qrAmount (setQrAmount(amount) tras resolveQrChargeAmount) …
    expect(CHECKOUT).toContain('const amount = resolveQrChargeAmount({ entryAmount, othersTotal, total: cartTotal });');
    expect(CHECKOUT).toContain('setQrAmount(amount);');
    expect(ON_PAID).toContain('const qrPaymentAmount = qrAmount ?? (remaining > 0 ? remaining : cartTotal);');
    // … y con saldo pendiente 0 ni siquiera se llega al fetch.
    expect(CHECKOUT).toContain('if (Math.max(0, cartTotal - othersTotal) <= 0) {');
  });

  it('método con espacios alrededor NO se recorta (viaja tal cual a la venta); solo el vacío conserva el de la entrada', () => {
    const prev: Entry[] = [{ id: 'q1', method: 'qr', amount: TOTAL }];
    const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: ' breb_qr ', amount: TOTAL, fallback });
    expect(r.payments[0].method).toBe(' breb_qr ');
    const blank = confirmQrPaymentEntry({ payments: prev, qrEntryId: 'q1', method: '   ', amount: TOTAL, fallback });
    expect(blank.payments[0].method).toBe('qr');
    // En la caja el método viene de payment_methods.code, nunca con espacios: se documenta, no se exige.
  });

  it('el respaldo cuyo id ya está en la lista (colisión imposible con UUID): se añadiría duplicado; confirmedId apunta al último', () => {
    const prev: Entry[] = [{ id: 'respaldo', method: 'cash', amount: 1 }];
    const r = confirmQrPaymentEntry({ payments: prev, qrEntryId: undefined, method: 'breb_qr', amount: TOTAL, fallback });
    expect(r.payments).toHaveLength(2);
    expect(r.payments.filter((p) => p.id === 'respaldo')).toHaveLength(2);
    expect(r.confirmedId).toBe('respaldo');
  });

  it('no muta: ni la lista ni la entrada de origen ni el respaldo', () => {
    const origin: Entry = { id: 'q1', method: 'qr', amount: 1 };
    const prev: Entry[] = [origin];
    const frozenFallback = Object.freeze({ ...fallback });
    const r = confirmQrPaymentEntry({ payments: Object.freeze(prev) as Entry[], qrEntryId: 'q1', method: 'breb_qr', amount: TOTAL, fallback: frozenFallback });
    expect(origin).toEqual({ id: 'q1', method: 'qr', amount: 1 });
    expect(r.payments[0]).not.toBe(origin);
    const r2 = confirmQrPaymentEntry({ payments: Object.freeze([] as Entry[]), qrEntryId: 'q1', method: 'breb_qr', amount: TOTAL, fallback: frozenFallback });
    expect(r2.payments[0]).toBe(frozenFallback);
  });
});

// ---------------------------------------------------------------------------
// C · QrPoller: stop() descarta la consulta en vuelo (F2C-R7-1 resuelto)
// ---------------------------------------------------------------------------

describe('C · QrPoller: una consulta en vuelo NO sobrevive a stop() (F2C-R7-1 resuelto en r8)', () => {
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
  const flush = async () => {
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  };

  it('stop() antes de que responda el fetch: la respuesta `paid` NO dispara onPaid ni onStatusChange (el cajero canceló; la caja no registra el pago del QR abandonado)', async () => {
    const onPaid = jest.fn();
    const onStatusChange = jest.fn();
    const poller = new QrPoller({ reference: 'POS-1-120', organizationId: 120, onPaid, onStatusChange });
    poller.start();
    expect(deferred).toHaveLength(1);
    poller.stop(); // = Cancelar → onClose → cleanup del efecto
    expect(poller.isRunning).toBe(false);
    deferred[0].resolve(okJson({ status: 'paid' }));
    await flush();
    expect(onPaid).not.toHaveBeenCalled();
    expect(onStatusChange).not.toHaveBeenCalled();
    // Y no programa otra consulta: sigue habiendo UN solo fetch.
    await new Promise((r) => setTimeout(r, 10));
    expect(deferred).toHaveLength(1);
  });

  it('stop() entre la respuesta y el cuerpo (segundo await, res.json()): también se descarta', async () => {
    const onPaid = jest.fn();
    const poller = new QrPoller({ reference: 'POS-2-120', organizationId: 120, onPaid });
    poller.start();
    let resolveBody: ((v: unknown) => void) | null = null;
    deferred[0].resolve({ ok: true, json: () => new Promise((r) => { resolveBody = r; }) });
    await flush();
    poller.stop();
    expect(resolveBody).not.toBeNull();
    (resolveBody as unknown as (v: unknown) => void)({ status: 'paid' });
    await flush();
    expect(onPaid).not.toHaveBeenCalled();
  });

  it('stop() con el fetch en vuelo que luego FALLA: ni onError ni reintento', async () => {
    const onError = jest.fn();
    const poller = new QrPoller({ reference: 'POS-2b-120', organizationId: 120, onError, intervalMs: 1 });
    poller.start();
    poller.stop();
    deferred[0].resolve({ ok: false, status: 500, json: async () => ({}) });
    await flush();
    await new Promise((r) => setTimeout(r, 10));
    expect(onError).not.toHaveBeenCalled();
    expect(deferred).toHaveLength(1);
  });

  it('stop() + start() con la consulta vieja en vuelo: la respuesta de la generación anterior no se entrega a la nueva', async () => {
    const onPaid = jest.fn();
    const poller = new QrPoller({ reference: 'POS-2c-120', organizationId: 120, onPaid });
    poller.start();
    poller.stop();
    poller.start(); // segunda generación: su propio fetch
    expect(deferred).toHaveLength(2);
    deferred[0].resolve(okJson({ status: 'paid' })); // la vieja
    await flush();
    expect(onPaid).not.toHaveBeenCalled();
    expect(poller.isRunning).toBe(true);
    deferred[1].resolve(okJson({ status: 'paid' })); // la vigente
    await flush();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(false);
  });

  it('tras `paid` el poller se para solo y no vuelve a consultar', async () => {
    const onPaid = jest.fn();
    const poller = new QrPoller({ reference: 'POS-3-120', organizationId: 120, onPaid, intervalMs: 1 });
    poller.start();
    deferred[0].resolve(okJson({ status: 'paid' }));
    await flush();
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(deferred).toHaveLength(1);
  });

  it('QrPaymentDialog (estático): el efecto del poller depende solo de [open] y captura reference/onPaid al abrir; paidHandledRef evita el doble onPaid; openRef ignora un onPaid con el diálogo ya cerrado', () => {
    // Desde la ronda 8 hay DOS efectos con deps [open] (openRef y el poller): se corta desde el poller.
    const pollerStart = QR_DIALOG.indexOf('const poller = new QrPoller({');
    const effect = QR_DIALOG.slice(pollerStart, QR_DIALOG.indexOf('}, [open]);', pollerStart));
    expect(effect.length).toBeGreaterThan(0);
    expect(effect).toContain('reference,');
    expect(effect).toContain('if (!paidHandledRef.current) {');
    expect(effect).toContain('poller.stop();');
    expect(QR_DIALOG).toContain('}, [open]);');
    // Segunda red (ronda 8): onPaid del poller se ignora si `open` ya es false.
    expect(QR_DIALOG).toContain('const openRef = useRef<boolean>(open);');
    expect(effect).toMatch(/onPaid: \(\) => \{\s*if \(!openRef\.current\) return;/);
    // El ref se sincroniza ANTES del efecto del poller (orden de declaración).
    expect(QR_DIALOG.indexOf('openRef.current = open;')).toBeLessThan(QR_DIALOG.indexOf('const poller = new QrPoller({'));
  });

  it('QrPoller (estático): relee la vigencia tras CADA await de poll() y en el catch', () => {
    const src = readSrc('lib/services/integrations/qrShared/qrPoller.ts');
    const poll = src.slice(src.indexOf('private async poll(): Promise<void> {'));
    const afterFetch = poll.slice(poll.indexOf('const res = await fetch(url);'), poll.indexOf('if (!res.ok) {'));
    expect(afterFetch).toContain('if (!alive()) return;');
    const afterJson = poll.slice(poll.indexOf('const payload = (await res.json())'), poll.indexOf('const rawStatus'));
    expect(afterJson).toContain('if (!alive()) return;');
    const inCatch = poll.slice(poll.indexOf('} catch (err) {'), poll.indexOf('this.onError?.(err'));
    expect(inCatch).toContain('if (!alive()) return;');
  });
});

// ---------------------------------------------------------------------------
// D · «Generar QR de pago» con guard de en-vuelo (F2C-R7-2 resuelto en r8)
// ---------------------------------------------------------------------------

describe('D · doble pulsación de «Generar QR de pago» (F2C-R7-2, resuelto en r8)', () => {
  const START = CHECKOUT.indexOf('const handleQrPayment = async (');
  const HANDLER = CHECKOUT.slice(START, CHECKOUT.indexOf('const loadTaxData = async', START));

  it('estático: el handler corta si hay una generación en vuelo, marca el ref ANTES del fetch y lo suelta en finally', () => {
    expect(START).toBeGreaterThan(0);
    expect(CHECKOUT).toContain('const qrRequestInFlightRef = useRef(false);');
    expect(CHECKOUT).toContain('const [isCreatingQr, setIsCreatingQr] = useState(false);');
    // El corte es lo PRIMERO del handler: antes de toasts, cálculos y setState.
    const head = HANDLER.slice(0, HANDLER.indexOf('try {'));
    expect(head).toContain('if (qrRequestInFlightRef.current) return;');
    expect(head).toContain('qrRequestInFlightRef.current = true;');
    expect(head).toContain('setIsCreatingQr(true);');
    expect(head.indexOf('if (qrRequestInFlightRef.current) return;')).toBeLessThan(head.indexOf("toast.error('Se requiere una sucursal para procesar');"));
    expect(head.indexOf('qrRequestInFlightRef.current = true;')).toBeLessThan(HANDLER.indexOf('const response = await fetch(endpoint, {'));
    // Se suelta en finally: cubre éxito, los `return` tempranos y el catch.
    const fin = HANDLER.slice(HANDLER.indexOf('} finally {'));
    expect(fin).toContain('qrRequestInFlightRef.current = false;');
    expect(fin).toContain('setIsCreatingQr(false);');
    expect(HANDLER.indexOf('} finally {')).toBeGreaterThan(HANDLER.indexOf('} catch (err) {'));
  });

  it('estático: el botón se deshabilita también con isCreatingQr y dice «Generando…» mientras tanto', () => {
    expect(CHECKOUT).toContain('disabled={othersCoverTotal || isCreatingQr}');
    expect(CHECKOUT).not.toContain('disabled={othersCoverTotal}');
    expect(CHECKOUT).toContain("{isCreatingQr ? 'Generando…' : 'Generar QR de pago'}");
    expect(CHECKOUT).toContain('aria-busy={isCreatingQr}');
  });

  /**
   * Mismo cableado que handleQrPayment (ref síncrono + finally) sobre un
   * fetch que no responde hasta que el test lo decide: dos pulsaciones
   * consecutivas (doble tap) hacen UN solo fetch; tras responder, la
   * siguiente pulsación vuelve a generar.
   */
  function cajaConGuard() {
    const inFlight = { current: false };
    const fetches: Array<(v: unknown) => void> = [];
    const fetchMock = jest.fn(() => new Promise<unknown>((resolve) => { fetches.push(resolve); }));
    const generar = async (): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await fetchMock();
      } finally {
        inFlight.current = false;
      }
    };
    return { inFlight, fetches, fetchMock, generar };
  }

  it('dos pulsaciones consecutivas ⇒ un solo fetch; la segunda no hace nada', async () => {
    const caja = cajaConGuard();
    const p1 = caja.generar();
    const p2 = caja.generar(); // doble tap, mismo tick
    expect(caja.fetchMock).toHaveBeenCalledTimes(1);
    expect(caja.inFlight.current).toBe(true);
    await p2; // la segunda ya volvió (sin fetch)
    expect(caja.fetchMock).toHaveBeenCalledTimes(1);
    caja.fetches[0]({ ok: true });
    await p1;
    expect(caja.inFlight.current).toBe(false);
  });

  it('pulsación mientras la primera sigue en vuelo (otro tick) ⇒ sigue siendo un solo fetch; tras responder, la siguiente sí genera', async () => {
    const caja = cajaConGuard();
    const p1 = caja.generar();
    await new Promise((r) => setImmediate(r));
    await caja.generar();
    expect(caja.fetchMock).toHaveBeenCalledTimes(1);
    caja.fetches[0]({ ok: true });
    await p1;
    const p3 = caja.generar();
    expect(caja.fetchMock).toHaveBeenCalledTimes(2);
    caja.fetches[1]({ ok: true });
    await p3;
  });

  it('el fetch FALLA (rechazo): el guard se suelta igual (finally) y se puede reintentar', async () => {
    const rejecting = jest.fn(() => Promise.reject(new Error('red caída')));
    const inFlight = { current: false };
    const generar = async (): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await rejecting();
      } catch {
        // toast.error en la caja
      } finally {
        inFlight.current = false;
      }
    };
    await generar();
    expect(inFlight.current).toBe(false);
    await generar();
    expect(rejecting).toHaveBeenCalledTimes(2);
  });

  it('simulación: dos respuestas en orden → el diálogo enseña la referencia B pero el poller nació con A', () => {
    // Modelo mínimo del efecto [open] de QrPaymentDialog: solo re-arranca cuando open cambia.
    let open = false;
    let polling: string | null = null;
    let shown: string | null = null;
    const render = (reference: string, nextOpen: boolean) => {
      shown = reference;
      if (nextOpen && !open) polling = reference; // efecto: se dispara solo al pasar a open
      open = nextOpen;
    };
    render('POS-A', true); // respuesta A
    render('POS-B', true); // respuesta B, diálogo ya abierto
    expect(shown).toBe('POS-B');
    expect(polling).toBe('POS-A');
    expect(shown).not.toBe(polling);
  });
});

// ---------------------------------------------------------------------------
// E · .gitattributes y los .bat
// ---------------------------------------------------------------------------

describe('E · .gitattributes', () => {
  const attrs = readFileSync(join(ROOT, '.gitattributes'), 'utf8').replace(/\r\n/g, '\n');

  it('fija LF para todo y binarios explícitos', () => {
    expect(attrs).toMatch(/^\* text=auto eol=lf$/m);
    expect(attrs).toMatch(/^\*\.png binary$/m);
    expect(attrs).toMatch(/^\*\.woff2 binary$/m);
  });

  it('los .bat, .cmd y .ps1 quedan en CRLF (`*.bat text eol=crlf`, como el upstream de Gradle): F2C-R7-3 resuelto', () => {
    expect(attrs).toMatch(/^\*\.bat text eol=crlf$/m);
    expect(attrs).toMatch(/^\*\.cmd text eol=crlf$/m);
    expect(attrs).toMatch(/^\*\.ps1 text eol=crlf$/m);
    // Y las reglas específicas van DESPUÉS de la general: en .gitattributes gana la última coincidencia.
    expect(attrs.indexOf('* text=auto eol=lf')).toBeLessThan(attrs.indexOf('*.bat text eol=crlf'));
  });

  it('ningún .failing queda en este archivo: los tres defectos que documentaba (F2C-R7-1/2/3) están corregidos', () => {
    const self = readSrc('__tests__/pos-display/tester-f2c-r7.test.ts');
    expect(self).not.toMatch(/\bit\.failing\(/);
  });
});

// ---------------------------------------------------------------------------
// F · bordes de la parte con las funciones puras reales
// ---------------------------------------------------------------------------

describe('F · bordes', () => {
  const NOW = Date.UTC(2026, 8, 21, 16, 0, 0);

  it('QR vencido cuando llega onPaid: la pantalla ya no pinta código (qr null, expiresAt conservado) pero la entrada se confirma igual', () => {
    const resolved = resolveDisplayQr({ data: '000201010212', expiresAt: NOW - 1, now: NOW });
    expect(resolved.qr).toBeNull();
    expect(resolved.expiresAt).toBe(NOW - 1);
    const shown = toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: TOTAL, qr: resolved.qr, expiresAt: resolved.expiresAt, amount: TOTAL });
    expect(shown).toMatchObject({ method: 'qr', qr: null, expiresAt: NOW - 1, amount: TOTAL });
    const r = confirmQrPaymentEntry({ payments: [{ id: 'q1', method: 'qr', amount: TOTAL }], qrEntryId: 'q1', method: 'breb_qr', amount: TOTAL, fallback: { id: 'x', method: 'breb_qr', amount: TOTAL } });
    expect(r.confirmedId).toBe('q1');
  });

  it('total 0 (cortesía): `amount` nunca viaja a la pantalla y la caja no genera QR', () => {
    const shown = toDisplayPayment({ methodCode: 'breb_qr', methodName: null, total: 0, qr: null, expiresAt: null, amount: 0 });
    expect('amount' in shown).toBe(false);
    expect(CHECKOUT).toContain("toast.error('No hay saldo pendiente para cobrar con QR');");
  });
});
