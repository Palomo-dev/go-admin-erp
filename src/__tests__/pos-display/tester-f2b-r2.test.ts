/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 2.
 *
 * Casos borde sobre lo que cambió en la ronda 2 (base de la venta, tolerancia
 * de tip_selected, base 0, onTipPhaseChange / onStatePublished,
 * lastDisplayCapabilities, aviso de espera según lo que pinta la pantalla,
 * «Aplicar» sobre la entrada pre-rellenada, resolveView con `touch`):
 *
 *  A. Coherencia táctil caja ↔ pantalla con el FORZADO de los ajustes
 *     (`settings.touch`). Ronda 2: la pantalla decidía sus botones con
 *     resolveTouch (detección + forzado) pero declaraba en
 *     `capabilities.touch` solo la detección, y la caja leía esa detección
 *     cruda para el aviso (DEFECTO F2B-R2-1, `it.failing`). Ronda 3: la
 *     pantalla declara el táctil RESUELTO y reemite `display_alive` al
 *     conocer el hello (displayLink.ts); la caja lo sigue por
 *     `onDisplayCapabilitiesChange` y aplica el mismo forzado de respaldo
 *     (resolveNoticeTouch). Los `it.failing` quedaron invertidos y se añadió
 *     el caso «forzado cambia en caliente».
 *  B. emitter.ts — base inválida tras una válida, cobro y omisión en la
 *     misma vuelta, doble pulsación, carrera QR-con-código ↔ tip_selected,
 *     tip_selected sobre base 0, deduplicación de onStatePublished,
 *     interruptor apagado en caliente durante la fase, stop() con fase
 *     pendiente, carrito vaciado durante la pregunta, venta confirmada con la
 *     pregunta pendiente.
 *  C. tipNotice.ts — applyTipToPrefilledPayment también BAJA el importe (en
 *     la ronda 2 CheckoutDialog solo lo llamaba al subir; en la ronda 3 lo
 *     llama también desde los controles de propina del modal: tip-f2b),
 *     resolveTipWaitingNotice y describeTipSelection en sus bordes.
 *  D. logic.ts / protocol.ts — resolveView 'tip' sin cobro en pantalla no
 *     táctil; `hello.visible` con tipo inválido; compatibilidad e2e de un
 *     hello sin `visible` frente a uno con `visible:false`.
 *  E. Invariantes: ningún state `tip` sale sin bloque `tip`, sin líneas o con
 *     base ≤ 0, en secuencias aleatorias de la caja.
 *
 * Los `it.failing` documentan DEFECTOS: pasan mientras el defecto exista y
 * fallarán (para quitarles el `.failing`) cuando se corrija; los del bloque A
 * ya se invirtieron en la ronda 3. Organización ficticia (org 120), sin
 * nombres reales.
 */

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter, type TipPhase } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessage,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { isValidTipPercent, type TipSelection } from '@/lib/pos/display/tip';
import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  displayChannelName,
  type DisplayTransport,
  type HelloDraft,
} from '@/lib/pos/display/transport';
import { resolveTouch, resolveView } from '@/components/pos-display/logic';
import { INITIAL_LINK_SNAPSHOT, startDisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import {
  TIP_INFORMATIONAL_ACTION,
  TIP_WAITING_ACTION,
  applyTipToPrefilledPayment,
  describeTipSelection,
  isInformativeTipSelection,
  resolveNoticeTouch,
  resolveTipWaitingNotice,
} from '@/components/pos/display/tipNotice';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await flush(1);
  }
}

const opened: Array<{ close(): void }> = [];
function track<T extends { close(): void }>(x: T): T {
  opened.push(x);
  return x;
}
afterEach(() => {
  while (opened.length > 0) opened.pop()?.close();
  jest.restoreAllMocks();
});

class FakeTransport implements DisplayTransport {
  published: DownMessageDraft[] = [];
  lastDisplaySeenAt: number | null = null;
  lastDisplayCapabilities: { touch: boolean; width: number; height: number } | null = null;
  closedCount = 0;
  private handlers = new Set<(msg: UpMessage) => void>();
  publish(msg: DownMessageDraft): void {
    this.published.push(msg);
  }
  announce(hello: HelloDraft, state: DisplayState): void {
    this.publish(hello);
    this.publish({ t: 'state', state });
  }
  onUp(handler: (msg: UpMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
  startHeartbeat(): void {}
  stopHeartbeat(): void {}
  close(): void {
    this.closedCount += 1;
  }
  emitUp(msg: UpMessage): void {
    for (const handler of Array.from(this.handlers)) handler(msg);
  }
  get states(): DisplayState[] {
    return this.published.filter((m): m is Extract<DownMessageDraft, { t: 'state' }> => m.t === 'state').map((m) => m.state);
  }
  get lastState(): DisplayState {
    const states = this.states;
    if (states.length === 0) throw new Error('sin state emitido');
    return states[states.length - 1];
  }
  get modes(): string[] {
    return this.states.map((s) => s.mode);
  }
}

function manualScheduler() {
  let queued: (() => void) | null = null;
  return {
    schedule: (fn: () => void) => {
      queued = fn;
      return () => {
        queued = null;
      };
    },
    flush: () => {
      const fn = queued;
      queued = null;
      fn?.();
    },
    get pending(): boolean {
      return queued !== null;
    },
  };
}

function settings(tips: Partial<DisplayPresentationSettings['tips']> = {}, extra: Partial<DisplayPresentationSettings> = {}): DisplayPresentationSettings {
  return {
    tips: { enabled: true, presets: [5, 10, 15], allowCustom: true, ...tips },
    rating: { enabled: false },
    showTaxBreakdown: false,
    showCustomerName: false,
    locale: null,
    touch: 'auto',
    ...extra,
  };
}

function harness(opts: { settings?: DisplayPresentationSettings | null; enabled?: { value: boolean } } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings === undefined ? settings() : opts.settings };
  const enabled = opts.enabled ?? { value: true };
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => enabled.value,
    schedule: sched.schedule,
    ...(current.settings === null ? {} : { getSettings: () => current.settings as DisplayPresentationSettings }),
  });
  return { emitter, transport, flush: sched.flush, sched, current, enabled };
}

function item(overrides: Partial<CartItem> & { id: string }): CartItem {
  return {
    product_id: 1,
    product: { id: 1, name: 'Café' } as CartItem['product'],
    quantity: 1,
    unit_price: 5000,
    discount_amount: 0,
    tax_amount: 0,
    total: 5000,
    tax_included: false,
    ...overrides,
  } as CartItem;
}

function cart(overrides: Partial<Cart> = {}): Cart {
  return {
    id: 'cart-1',
    organization_id: 120,
    branch_id: 1,
    status: 'active',
    items: [item({ id: 'l1' })],
    subtotal: 5000,
    tax_amount: 0,
    tax_total: 0,
    discount_amount: 0,
    discount_total: 0,
    total: 5000,
    created_at: '2026-09-16T10:00:00.000Z',
    updated_at: '2026-09-16T10:00:00.000Z',
    ...overrides,
  };
}

const START = { organizationId: 120, currency: 'COP' };
const cashPayment = (total = 5000) => toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total });
const qrPayment = (qr: string | null, expiresAt: number | null = null) =>
  toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: qr === null ? null : { kind: 'image', value: qr }, expiresAt });
const tipSelected = (kind: 'percent' | 'amount' | 'none', value: number, cartId = 'cart-1'): UpMessage => ({
  v: PROTOCOL_VERSION,
  t: 'tip_selected',
  terminalId: TERMINAL,
  cartId,
  kind,
  value,
});

/** Caja arrancada, con carrito y en fase de propina pendiente (state «tip» ya emitido). */
function enTip(opts: Parameters<typeof harness>[0] = {}) {
  const h = harness(opts);
  h.emitter.start(START);
  h.emitter.setActiveCart(cart());
  h.flush();
  h.emitter.setTipBase(20250);
  h.emitter.setPayment(cashPayment());
  h.flush();
  expect(h.emitter.tipPhase).toBe('pending');
  expect(h.transport.lastState.mode).toBe('tip');
  return h;
}

// ---------------------------------------------------------------------------
// A. Coherencia táctil caja ↔ pantalla con el forzado de los ajustes
// ---------------------------------------------------------------------------

describe('A. táctil: lo que la pantalla PINTA (resolveTouch) es lo que la caja CREE (capabilities.touch resuelto)', () => {
  /**
   * Caja real (BroadcastChannelTransport) + pantalla real por el camino de
   * producción (BroadcastChannelReceiver + displayLink.ts): la pantalla
   * declara en `capabilities.touch` el táctil RESUELTO
   * (resolveTouch(detección, hello.settings.touch)) y, al conocer el hello,
   * reemite `display_alive` con él; la caja lo lee por
   * `lastDisplayCapabilities` / `onDisplayCapabilitiesChange` y, como
   * respaldo, aplica el mismo forzado (resolveNoticeTouch), exactamente lo
   * que hace TipFromDisplayNotice. Ronda 3: corregido F2B-R2-1.
   */
  async function escenario(override: 'auto' | 'touch' | 'no-touch', hardwareTouch: boolean) {
    const current = { settings: settings({}, { touch: override }) };
    const emitter = new DisplayEmitter({
      createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: INSTANCE_A, now: () => 0 })),
      isEnabled: () => true,
      getSettings: () => current.settings,
      schedule: (fn) => {
        const id = setTimeout(fn, 0);
        return () => clearTimeout(id);
      },
    });
    emitter.start({ ...START, sessionOpen: true });
    emitter.setActiveCart(cart());
    emitter.setTipBase(20250);
    emitter.setPayment(cashPayment());
    await flush(4);

    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    let snap: DisplayLinkSnapshot = INITIAL_LINK_SNAPSHOT;
    const link = startDisplayLink({
      receiver: display,
      capabilities: () => ({ touch: hardwareTouch, width: 1280, height: 800 }),
      onChange: (next) => {
        snap = next;
      },
    });
    track({ close: () => link.stop() });
    await waitFor(() => snap.hello !== null && snap.state?.mode === 'tip');
    await flush(4); // el display_alive con el táctil resuelto sale en el acto tras el hello; se le da la vuelta del canal

    const lado = () => {
      // Lado pantalla: lo que CustomerDisplay hace con el hello y su detección.
      const touchEnPantalla = resolveTouch(hardwareTouch, snap.hello?.settings?.touch);
      const view = resolveView({ connected: true, disconnectedTooLong: false, updateRequired: false, thanksExpired: false, touch: touchEnPantalla, state: snap.state });
      // Lado caja: lo que TipFromDisplayNotice hace con las capacidades declaradas + el forzado de respaldo.
      const caps = emitter.lastDisplayCapabilities;
      const aviso = resolveTipWaitingNotice({
        phase: emitter.tipPhase,
        displayMode: emitter.getState().mode,
        connected: true,
        touch: resolveNoticeTouch(caps, emitter.presentationSettings?.touch),
      });
      return { touchEnPantalla, view, caps, aviso };
    };
    return { emitter, display, link, current, lado, ...lado() };
  }

  it('sin forzado (auto) los dos lados coinciden: táctil → «esperando la propina…» + Omitir; no táctil → «registre…» + Continuar', async () => {
    const tactil = await escenario('auto', true);
    expect(tactil.touchEnPantalla).toBe(true);
    expect(tactil.view).toBe('tip');
    expect(tactil.caps?.touch).toBe(true);
    expect(tactil.aviso?.kind).toBe('waiting');
    expect(tactil.aviso?.action).toBe(TIP_WAITING_ACTION);
    tactil.emitter.stop();

    const noTactil = await escenario('auto', false);
    expect(noTactil.touchEnPantalla).toBe(false);
    expect(noTactil.caps?.touch).toBe(false);
    expect(noTactil.aviso?.kind).toBe('informational');
    expect(noTactil.aviso?.action).toBe(TIP_INFORMATIONAL_ACTION);
    noTactil.emitter.stop();
  });

  it('CORREGIDO F2B-R2-1: forzado «no-touch» sobre hardware táctil: la pantalla NO pinta botones y la caja dice «registre lo que indique el cliente» + Continuar', async () => {
    const s = await escenario('no-touch', true);
    try {
      expect(s.touchEnPantalla).toBe(false); // la pantalla obedece el forzado: informativa, sin botones
      expect(s.caps?.touch).toBe(false); // …y declara el táctil RESUELTO, no la detección cruda
      expect(s.aviso?.kind).toBe('informational');
      expect(s.aviso?.action).toBe(TIP_INFORMATIONAL_ACTION);
    } finally {
      s.emitter.stop();
    }
  });

  it('CORREGIDO F2B-R2-1 (inverso): forzado «touch» sobre hardware sin táctil: la pantalla SÍ pinta botones y la caja espera «esperando la propina…» + Omitir', async () => {
    const s = await escenario('touch', false);
    try {
      expect(s.touchEnPantalla).toBe(true); // el cliente ve botones y puede pulsar
      expect(s.caps?.touch).toBe(true);
      expect(s.aviso?.kind).toBe('waiting');
      expect(s.aviso?.action).toBe(TIP_WAITING_ACTION);
    } finally {
      s.emitter.stop();
    }
  });

  it('respaldo en la caja: una pantalla ANTERIOR que declare la detección cruda también se lee con el forzado (resolveNoticeTouch es idempotente)', () => {
    expect(resolveNoticeTouch({ touch: true }, 'no-touch')).toBe(false);
    expect(resolveNoticeTouch({ touch: false }, 'touch')).toBe(true);
    expect(resolveNoticeTouch({ touch: true }, 'auto')).toBe(true);
    expect(resolveNoticeTouch({ touch: false }, undefined)).toBe(false);
    // Aplicar dos veces el mismo forzado no cambia el resultado (la pantalla ya lo resolvió).
    expect(resolveNoticeTouch({ touch: resolveTouch(true, 'no-touch') }, 'no-touch')).toBe(false);
    expect(resolveNoticeTouch({ touch: resolveTouch(false, 'touch') }, 'touch')).toBe(true);
    // Sin capacidades conocidas: null (el aviso asume que contestará).
    expect(resolveNoticeTouch(null, 'no-touch')).toBeNull();
    expect(resolveNoticeTouch(undefined, 'touch')).toBeNull();
  });

  it('forzado cambia en caliente: la caja resaluda (refresh) → la pantalla reemite display_alive con el táctil nuevo → onDisplayCapabilitiesChange avisa y el aviso cambia de texto', async () => {
    const s = await escenario('auto', true);
    try {
      expect(s.aviso?.kind).toBe('waiting');
      const avisos: Array<boolean | null> = [];
      const off = s.emitter.onDisplayCapabilitiesChange((caps) => avisos.push(caps?.touch ?? null));
      // La tarjeta guarda touch = 'no-touch' en otra ventana; la caja relee la caché y resaluda (hello nuevo).
      s.current.settings = settings({}, { touch: 'no-touch' });
      s.emitter.refresh();
      await waitFor(() => s.emitter.lastDisplayCapabilities?.touch === false);
      expect(avisos).toEqual([false]); // un solo aviso, con el táctil resuelto nuevo
      const despues = s.lado();
      expect(despues.touchEnPantalla).toBe(false);
      expect(despues.aviso?.kind).toBe('informational');
      expect(despues.aviso?.action).toBe(TIP_INFORMATIONAL_ACTION);
      // Vuelta a 'auto': la pantalla vuelve a declarar la detección y la caja vuelve a esperar.
      s.current.settings = settings({}, { touch: 'auto' });
      s.emitter.refresh();
      await waitFor(() => s.emitter.lastDisplayCapabilities?.touch === true);
      expect(avisos).toEqual([false, true]);
      expect(s.lado().aviso?.kind).toBe('waiting');
      off();
    } finally {
      s.emitter.stop();
    }
  });

  it('con la caja en espera («esperando la propina…»), tras «Omitir» (skipTip) una elección del cliente que llega tarde se DESCARTA sin avisar a la caja', async () => {
    const s = await escenario('touch', false);
    try {
      const got: TipSelection[] = [];
      s.emitter.onTipSelected((sel) => got.push(sel));
      s.emitter.skipTip(); // el cajero pulsó «Omitir»
      await flush(3);
      s.display.send({ t: 'tip_selected', cartId: 'cart-1', kind: 'percent', value: 10 });
      await flush(4);
      expect(got).toEqual([]);
      expect(s.emitter.tipPhase).toBe('done');
      expect(s.emitter.tipSelection).toBeNull();
    } finally {
      s.emitter.stop();
    }
  });

  it('lógica pura: resolveTouch (pantalla) y resolveNoticeTouch (caja) coinciden con cualquier forzado', () => {
    const base = { phase: 'pending' as TipPhase, displayMode: 'tip' as const, connected: true };
    for (const override of ['auto', 'touch', 'no-touch'] as const) {
      for (const detected of [true, false]) {
        const pantalla = resolveTouch(detected, override);
        const caja = resolveNoticeTouch({ touch: pantalla }, override);
        expect(caja).toBe(pantalla);
        expect(resolveTipWaitingNotice({ ...base, touch: caja })?.kind).toBe(pantalla ? 'waiting' : 'informational');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// B. emitter.ts · bordes de la ronda 2
// ---------------------------------------------------------------------------

describe('B. emitter.ts · bordes de la ronda 2', () => {
  it('setTipBase inválida (NaN, −1, Infinity) tras una válida: la base vuelve al total proyectado y se reemite', () => {
    const h = enTip();
    expect(h.transport.lastState.tip?.base).toBe(20250);
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      h.emitter.setTipBase(20250);
      h.flush();
      const before = h.transport.states.length;
      h.emitter.setTipBase(bad);
      h.flush();
      expect(h.transport.states.length).toBe(before + 1);
      expect(h.transport.lastState.mode).toBe('tip');
      expect(h.transport.lastState.tip?.base).toBe(5000); // total del carrito
    }
    // Y una base 0 explícita (válida) apaga la pregunta sin cerrar la fase.
    h.emitter.setTipBase(0);
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipPhase).toBe('pending');
  });

  it('setPayment + skipTip en la MISMA vuelta: la pantalla nunca ve «tip» (un solo state, «payment»); las fases avisan [pending, done]', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    const before = h.transport.states.length;
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.emitter.skipTip();
    h.flush();
    expect(h.transport.states.length).toBe(before + 1);
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.lastState.tip).toBeNull();
    expect(phases).toEqual(['pending', 'done']);
  });

  it('doble pulsación: dos tip_selected seguidos → onTipSelected UNA vez y tipSelection es la primera; el segundo no reemite', () => {
    const h = enTip();
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    h.transport.emitUp(tipSelected('percent', 15));
    h.flush();
    expect(got.map((s) => s.percent)).toEqual([10]);
    expect(h.emitter.tipSelection?.percent).toBe(10);
    expect(h.emitter.tipSelection?.amount).toBe(2025);
    const before = h.transport.states.length;
    h.transport.emitUp(tipSelected('none', 0));
    h.flush();
    expect(h.transport.states.length).toBe(before);
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('carrera QR-con-código ↔ tip_selected: la elección que llega mientras el QR tapa la pregunta se ACEPTA (fase done) y al retirar el QR se pinta cobro, no propina', () => {
    const h = enTip();
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.emitter.setPayment(qrPayment('data:image/png;base64,QUJD', Date.now() + 60_000));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    // El código viajó de verdad: es él quien tapa la pregunta (la unión DisplayPayment se estrecha por `method` antes de leer `qr`).
    const tapado = h.transport.lastState.payment;
    expect(tapado?.method).toBe('qr');
    expect(tapado && tapado.method === 'qr' ? tapado.qr : null).not.toBeNull();
    expect(h.emitter.tipPhase).toBe('pending');
    // El cliente pulsó justo antes de que el QR apareciera; el mensaje llega ahora.
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(got.map((s) => s.amount)).toEqual([2025]);
    expect(h.emitter.tipPhase).toBe('done');
    // QR retirado (vuelve a efectivo): la pregunta NO reaparece.
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipSelection?.percent).toBe(10);
  });

  it('base 0 (la pantalla pinta cobro) y llega tip_selected percent de una pantalla rezagada: se acepta con importe 0, cierra la fase y la caja lo describe como «10 % ($0)» informativo', () => {
    const h = enTip();
    h.emitter.setTipBase(0);
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(got).toHaveLength(1);
    expect(got[0].amount).toBe(0);
    expect(h.emitter.tipPhase).toBe('done');
    expect(isInformativeTipSelection(got[0])).toBe(true);
    expect(describeTipSelection(got[0], 'COP')).toMatch(/^Cliente eligió 10 % \(/);
    expect(describeTipSelection(got[0], 'COP')).not.toMatch(/no dejar propina/);
  });

  it('onStatePublished NO avisa cuando el flush deduplica (misma base, mismo cobro) ni cuando el planificador no llega a correr', () => {
    const h = enTip();
    const published: string[] = [];
    h.emitter.onStatePublished((s) => published.push(s.mode));
    h.emitter.setTipBase(20250); // igual → ni siquiera planifica
    expect(h.sched.pending).toBe(false);
    h.emitter.setPayment(cashPayment()); // cobro idéntico → planifica, pero el JSON es el mismo
    expect(h.sched.pending).toBe(true);
    h.flush();
    expect(published).toEqual([]);
    h.emitter.setTipBase(30000); // cambio real
    h.flush();
    expect(published).toEqual(['tip']);
  });

  it('interruptor apagado en caliente durante la fase: el flush cierra el transporte, lastDisplayCapabilities pasa a null y la fase SIGUE pendiente; al reencender + refresh el hello+state vuelve en «tip»', () => {
    const enabled = { value: true };
    const h = enTip({ enabled });
    h.transport.lastDisplayCapabilities = { touch: true, width: 1, height: 1 };
    expect(h.emitter.lastDisplayCapabilities?.touch).toBe(true);
    enabled.value = false;
    h.emitter.setTipBase(30000);
    h.flush();
    expect(h.emitter.isEmitting).toBe(false);
    expect(h.transport.closedCount).toBe(1);
    expect(h.emitter.lastDisplayCapabilities).toBeNull();
    expect(h.emitter.tipPhase).toBe('pending');
    // Un tip_selected que llegara por el transporte cerrado ya no se escucha (se dio de baja onUp).
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    expect(got).toEqual([]);
    expect(h.emitter.tipPhase).toBe('pending');
    // Reencendido: refresh() reabre y saluda (ventana visible por defecto) con la pregunta en pie y la base nueva.
    enabled.value = true;
    const before = h.transport.states.length;
    h.emitter.refresh();
    expect(h.transport.states.length).toBe(before + 1);
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(30000);
  });

  it('stop() con la fase pendiente avisa null a onTipPhaseChange (y no más); start() + cobro nuevo vuelve a preguntar con presets recongelados', () => {
    const h = enTip();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    h.emitter.stop();
    expect(phases).toEqual([null]);
    h.emitter.stop(); // repetido: no avisa
    expect(phases).toEqual([null]);
    h.current.settings = settings({ presets: [20, 25, 30] });
    h.emitter.start(START);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(phases).toEqual([null, 'pending']);
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.presets).toEqual([20, 25, 30]);
    expect(h.transport.lastState.tip?.base).toBe(5000); // la base 20250 NO sobrevivió al stop()
  });

  it('el carrito se vacía durante la pregunta (onCartsSaved con 0 líneas): se pinta cobro sin preguntar; al volver una línea la pregunta reaparece sin reabrir la fase', () => {
    const h = enTip();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    h.emitter.onCartsSaved([cart({ items: [], subtotal: 0, total: 0 })]);
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.lastState.tip).toBeNull();
    expect(h.emitter.tipPhase).toBe('pending');
    h.emitter.onCartsSaved([cart()]);
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(20250);
    expect(phases).toEqual([]);
  });

  it('venta confirmada con la pregunta pendiente (thanks sin Omitir): la fase se olvida ([pending→null]), la pantalla pasa a Gracias y un tip_selected tardío se descarta', () => {
    const h = enTip();
    const phases: TipPhase[] = [];
    h.emitter.onTipPhaseChange((p) => phases.push(p));
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.emitter.setMode('thanks', { total: 5000 });
    h.flush();
    expect(h.transport.lastState.mode).toBe('thanks');
    expect(phases).toEqual([null]);
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(got).toEqual([]);
    expect(h.emitter.tipSelection).toBeNull();
    expect(h.transport.lastState.mode).toBe('thanks');
  });

  it('tip_selected con cartId de otro carrito durante la fase no cierra nada ni avisa; luego el correcto sí', () => {
    const h = enTip();
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.transport.emitUp(tipSelected('percent', 10, 'cart-otro'));
    h.flush();
    expect(got).toEqual([]);
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.transport.lastState.mode).toBe('tip');
    h.transport.emitUp(tipSelected('amount', 3000));
    h.flush();
    expect(got.map((s) => [s.kind, s.amount])).toEqual([['amount', 3000]]);
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('un oyente de onStatePublished que se da de baja dentro del propio aviso no rompe la emisión ni a los demás', () => {
    const h = enTip();
    const seen: string[] = [];
    const off = h.emitter.onStatePublished(() => {
      seen.push('a');
      off();
    });
    h.emitter.onStatePublished(() => seen.push('b'));
    h.emitter.setTipBase(30000);
    h.flush();
    h.emitter.setTipBase(40000);
    h.flush();
    expect(seen).toEqual(['a', 'b', 'b']);
  });
});

// ---------------------------------------------------------------------------
// C. tipNotice.ts · bordes
// ---------------------------------------------------------------------------

describe('C. tipNotice.ts · bordes de la ronda 2', () => {
  it('applyTipToPrefilledPayment también BAJA el importe (5.500 → 5.000): la función es simétrica; el cableado de CheckoutDialog solo la llama al pulsar «Aplicar» (ver informe)', () => {
    const none = new Set<string>();
    const subida = applyTipToPrefilledPayment([{ id: 'p1', amount: 5000, method: 'card' }], none, 5500);
    expect(subida[0].amount).toBe(5500);
    const bajada = applyTipToPrefilledPayment(subida, none, 5000);
    expect(bajada[0].amount).toBe(5000);
    // Con importe 0 (total 0) también se ajusta: no es un valor «inválido».
    expect(applyTipToPrefilledPayment([{ id: 'p1', amount: 5000 }], none, 0)[0].amount).toBe(0);
    // Sin entradas: misma referencia.
    const vacio: Array<{ id: string; amount: number }> = [];
    expect(applyTipToPrefilledPayment(vacio, none, 5500)).toBe(vacio);
  });

  it('applyTipToPrefilledPayment conserva el resto de campos de la entrada (método, referencia) y no muta la original', () => {
    const original = { id: 'p1', amount: 5000, method: 'breb_qr', reference: 'ABC' };
    const out = applyTipToPrefilledPayment([original], new Set<string>(), 5500);
    expect(out[0]).toEqual({ id: 'p1', amount: 5500, method: 'breb_qr', reference: 'ABC' });
    expect(original.amount).toBe(5000);
    expect(out[0]).not.toBe(original);
  });

  it('resolveTipWaitingNotice: fase done / sin pantalla / modo distinto de tip → null; touch null → se asume que contestará (waiting)', () => {
    const ok = { phase: 'pending' as TipPhase, displayMode: 'tip' as const, connected: true, touch: null };
    expect(resolveTipWaitingNotice(ok)?.kind).toBe('waiting');
    expect(resolveTipWaitingNotice({ ...ok, phase: 'done' })).toBeNull();
    expect(resolveTipWaitingNotice({ ...ok, phase: null })).toBeNull();
    expect(resolveTipWaitingNotice({ ...ok, connected: false })).toBeNull();
    for (const mode of ['idle', 'order', 'payment', 'thanks', 'closed'] as const) {
      expect(resolveTipWaitingNotice({ ...ok, displayMode: mode })).toBeNull();
    }
    expect(resolveTipWaitingNotice({ ...ok, displayMode: null })).toBeNull();
    // touch false manda sobre todo lo demás (no promete respuesta) pero sigue exigiendo mode tip.
    expect(resolveTipWaitingNotice({ ...ok, touch: false })?.kind).toBe('informational');
    expect(resolveTipWaitingNotice({ ...ok, touch: false, displayMode: 'payment' })).toBeNull();
  });

  it('describeTipSelection: amount 0 → «no dejar propina»; importe libre con USD; percent con base grande no pierde el importe', () => {
    const amount0: TipSelection = { cartId: 'c', kind: 'amount', value: 0, amount: 0, percent: null };
    expect(describeTipSelection(amount0, 'COP')).toBe('Cliente eligió no dejar propina');
    expect(isInformativeTipSelection(amount0)).toBe(true);
    const usd: TipSelection = { cartId: 'c', kind: 'amount', value: 3, amount: 3, percent: null };
    expect(describeTipSelection(usd, 'USD')).toMatch(/^Cliente eligió una propina de /);
    expect(describeTipSelection(usd, 'USD')).toMatch(/3/);
    const grande: TipSelection = { cartId: 'c', kind: 'percent', value: 15, amount: 149_999_999, percent: 15 };
    expect(describeTipSelection(grande, 'COP')).toMatch(/^Cliente eligió 15 % \(/);
    expect(describeTipSelection(grande, 'COP')).toMatch(/149[.,]999[.,]999/);
    expect(isInformativeTipSelection(grande)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D. logic.ts / protocol.ts
// ---------------------------------------------------------------------------

describe('D. logic.ts · resolveView tip con `touch`; protocol.ts · hello.visible', () => {
  const lines: NonNullable<DisplayState['cart']> = {
    id: 'c1',
    currency: 'COP',
    lines: [{ id: 'l1', name: 'Café', variant: null, qty: 1, unitPrice: 5000, total: 5000, modifiers: [], discount: null, note: null, taxExcluded: false, taxIncluded: false }],
    subtotal: 5000,
    discountTotal: 0,
    discountLabel: null,
    taxTotal: 0,
    taxIncluded: false,
    total: 5000,
    lastChangedLineId: null,
  };
  const base = { connected: true, disconnectedTooLong: false, updateRequired: false, thanksExpired: false };

  it('mode tip sin presets en pantalla NO táctil y SIN cobro en el state (fabricado) → pedido; con cobro → la vista de ese cobro', () => {
    const sinCobro: DisplayState = { mode: 'tip', cart: lines, payment: null, tip: { presets: [], allowCustom: true, selected: null, base: 5000 }, thanks: null };
    expect(resolveView({ ...base, touch: false, state: sinCobro })).toBe('order');
    const conCobro: DisplayState = { ...sinCobro, payment: cashPayment() };
    expect(resolveView({ ...base, touch: false, state: conCobro })).toBe('payment_cash');
    const conQr: DisplayState = { ...sinCobro, payment: qrPayment('abc') };
    expect(resolveView({ ...base, touch: false, state: conQr })).toBe('payment_qr');
    // Táctil o sin `touch`: sigue en tip (el cliente puede usar «Otro»).
    expect(resolveView({ ...base, touch: true, state: sinCobro })).toBe('tip');
    expect(resolveView({ ...base, state: sinCobro })).toBe('tip');
  });

  it('isDownMessage: hello.visible con string/number/null se rechaza; ausente o booleano se acepta', () => {
    const hello = (visible: unknown): unknown => ({
      v: PROTOCOL_VERSION,
      t: 'hello',
      seq: 1,
      terminalId: TERMINAL,
      instanceId: INSTANCE_A,
      cashier: null,
      sessionOpen: true,
      organizationId: 120,
      ...(visible === undefined ? {} : { visible }),
    });
    expect(isDownMessage(hello(undefined))).toBe(true);
    expect(isDownMessage(hello(true))).toBe(true);
    expect(isDownMessage(hello(false))).toBe(true);
    for (const bad of ['true', 1, 0, null, {}]) expect(isDownMessage(hello(bad))).toBe(false);
  });

  it('e2e: hello SIN `visible` (emisor anterior) frente a hello con visible:false y seq mayor → gana el seq mayor (compatibilidad)', async () => {
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1, height: 1 } });
    await flush();
    const hello = (seq: number, instanceId: string, visible?: boolean): DownMessage => ({
      v: 1,
      t: 'hello',
      seq,
      terminalId: TERMINAL,
      instanceId,
      cashier: null,
      sessionOpen: true,
      organizationId: 120,
      ...(visible === undefined ? {} : { visible }),
    });
    raw.postMessage(hello(2, INSTANCE_A)); // sin el campo
    raw.postMessage(hello(50, INSTANCE_B, false)); // oculta pero con seq mayor
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    clock += 1;
    // Y al revés (la oculta primero, la sin-campo después con seq menor): se queda la oculta.
    raw.postMessage(hello(3, INSTANCE_A));
    await flush(4);
    expect(display.activeInstanceId).toBe(INSTANCE_B);
  });
});

// ---------------------------------------------------------------------------
// E. Invariantes del state «tip» en secuencias aleatorias
// ---------------------------------------------------------------------------

describe('E. invariantes: ningún state «tip» sale sin bloque, sin líneas o con base ≤ 0', () => {
  function prng(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  it('200 secuencias aleatorias de la caja: cada «tip» lleva presets válidos, base > 0 y líneas; y nunca hay «tip» con la fase cerrada', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rnd = prng(seed);
      const h = harness({ settings: settings({ allowCustom: rnd() < 0.5, presets: rnd() < 0.2 ? [] : [5, 10, 15] }) });
      h.emitter.start(START);
      h.emitter.setActiveCart(cart());
      h.flush();
      const ops: Array<() => void> = [
        () => h.emitter.setPayment(cashPayment()),
        () => h.emitter.setPayment(qrPayment(rnd() < 0.5 ? 'abc' : null)),
        () => h.emitter.setPayment(null),
        () => h.emitter.setTipBase(rnd() < 0.3 ? 0 : Math.floor(rnd() * 100000)),
        () => h.emitter.setTipBase(null),
        () => h.emitter.skipTip(),
        () => h.transport.emitUp(tipSelected('percent', [5, 10, 15][Math.floor(rnd() * 3)])),
        () => h.emitter.setMode('order'),
        () => h.emitter.setMode('thanks', { total: 5000 }),
        () => h.emitter.onCartsSaved([cart({ items: rnd() < 0.3 ? [] : [item({ id: 'l1' }), item({ id: 'l2' })], total: 10000 })]),
        () => h.flush(),
      ];
      for (let i = 0; i < 25; i += 1) ops[Math.floor(rnd() * ops.length)]();
      h.flush();
      for (const st of h.transport.states) {
        if (st.mode !== 'tip') {
          expect(st.tip).toBeNull();
          continue;
        }
        expect(st.tip).not.toBeNull();
        expect(st.cart?.lines.length ?? 0).toBeGreaterThan(0);
        expect(st.payment).not.toBeNull();
        expect(st.tip!.base).toBeGreaterThan(0);
        expect(st.tip!.presets.every(isValidTipPercent)).toBe(true);
        expect(st.tip!.presets.length > 0 || st.tip!.allowCustom).toBe(true);
      }
      // El último state emitido es coherente con la fase actual.
      const last = h.transport.states.at(-1);
      if (last?.mode === 'tip') expect(h.emitter.tipPhase).toBe('pending');
      if (h.emitter.tipPhase !== 'pending' && last) expect(last.mode).not.toBe('tip');
      h.emitter.stop();
    }
  });
});
