/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 6 (QA de la ronda
 * 4 de cierre del builder).
 *
 * La ronda 4 del builder cerró QA-1 (etiqueta «Base de la propina») y QA-4
 * (displayLink publica la caída antes del primer need_snapshot). Esta ronda
 * ataca lo que queda alrededor, extremo a extremo por el camino de
 * producción (BroadcastChannel real + displayLink + emisor):
 *
 *  A. Dos cajas con la MISMA terminal y la MISMA venta en cobro (misma
 *     `pos_carts_<org>`): la elección del cliente llega SOLO a la caja que
 *     la pantalla sigue (toInstanceId); la otra ni la ve ni cierra su fase.
 *     Y una tercera caja ANTERIOR (hello sin `visible`) con caja abierta
 *     sigue relevando dentro de la ventana de elección (compatibilidad
 *     declarada; se documenta como comportamiento y no como defecto).
 *  B. Pantalla NO táctil con propina activada, extremo a extremo: el
 *     `display_alive` que recibe la caja lleva touch:false y el aviso de la
 *     caja es informativo; con forzado `touch` sobre hardware sin táctil la
 *     pantalla declara true y la caja espera (PLAN §4.4 «si el hardware
 *     miente»).
 *  C. QA-4 simétrico: caída sin bye con forzado `touch` sobre hardware NO
 *     táctil → el primer need_snapshot tras el silencio declara false (cruda).
 *     Y `bye` + rearranque INMEDIATO de la caja (antes del tick de salud):
 *     la presencia no se queda con un táctil distinto del que la pantalla
 *     pinta.
 *  D. Ajustes inválidos tal como pueden venir de `organization_settings`
 *     (verificado con el MCP: las tres filas reales solo traen `enabled`):
 *     sin bloque `tips`, presets como texto, `enabled` como texto, `touch`
 *     en mayúsculas… nunca se pregunta propina con ajustes rotos y nunca se
 *     lanza.
 *  E. Aritmética de bordes: presets que dan importe 0 sobre bases pequeñas
 *     (la opción se pinta con «$0»; se anota, no se corrige aquí), «Otro» con
 *     decimales, y subtotal 0 con propina activada en pantalla táctil (no se
 *     pregunta, la fase queda pendiente y `Aplicar` nunca aparece).
 *  F. QR vencido con propina pendiente: el vencimiento se impone; cambiar a
 *     efectivo devuelve la pregunta; un `tip_selected` que llegue MIENTRAS el
 *     QR tapa la pregunta se acepta (pulsación en carrera): se documenta.
 *  G. Terminal sin vincular: el emisor y la pantalla funcionan con el UUID
 *     local; un id no UUID en localStorage se regenera y vincular a otra
 *     terminal NO recablea el transporte abierto (documentado en la tarjeta:
 *     «recárguelo»).
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));

import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter, type TipPhase } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  isDownMessage,
  type DisplayCapabilities,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessage,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { computeTipAmount, resolveTipSelection, sanitizeDisplayTip, tipOptions, type TipSelection } from '@/lib/pos/display/tip';
import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  displayChannelName,
  isBetterHello,
  type DisplayTransport,
  type HelloDraft,
} from '@/lib/pos/display/transport';
import { INITIAL_LINK_SNAPSHOT, startDisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import { resolveTouch, resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';
import { describeTipSelection, isInformativeTipSelection, resolveNoticeTouch, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings } from '@/lib/pos/display/settings';
import { getOrCreateLocalTerminalId, isTerminalId, readLocalTerminalId, setLocalTerminalId, type TerminalIdStorage } from '@/lib/pos/display/terminal';

// ---------------------------------------------------------------------------
// Utilidades (mismas que las rondas anteriores)
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee6';
const INSTANCE_A = '11111111-1111-4111-8111-111111111116';
const INSTANCE_B = '22222222-2222-4222-8222-222222222226';
const INSTANCE_C = '33333333-3333-4333-8333-333333333336';
const CAPS: DisplayCapabilities = { touch: true, width: 1280, height: 800 };

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
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  lastDisplayCapabilities: DisplayCapabilities | null = null;
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
  close(): void {}
  emitUp(msg: UpMessage): void {
    if (msg.t === 'display_alive' || msg.t === 'need_snapshot') this.lastDisplayCapabilities = { ...msg.capabilities };
    else if (msg.t === 'display_bye') this.lastDisplayCapabilities = null;
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

function harness(opts: { settings?: DisplayPresentationSettings | null; enabled?: () => boolean; visible?: () => boolean } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings === undefined ? settings() : opts.settings };
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: opts.enabled ?? (() => true),
    isVisible: opts.visible,
    schedule: sched.schedule,
    ...(current.settings === null ? {} : { getSettings: () => current.settings as DisplayPresentationSettings }),
  });
  return { emitter, transport, flush: sched.flush, current };
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
const tipSelected = (kind: string, value: number, cartId = 'cart-1'): UpMessage =>
  ({ v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, cartId, kind, value }) as unknown as UpMessage;

const realScheduler = (fn: () => void) => {
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

function cajaReal(
  instanceId: string,
  opts: { visible?: () => boolean; sessionOpen?: boolean; settings?: DisplayPresentationSettings; heartbeatIntervalMs?: number } = {},
) {
  const current = { settings: opts.settings ?? settings() };
  const selections: TipSelection[] = [];
  const phases: TipPhase[] = [];
  const emitter = new DisplayEmitter({
    createTransport: () =>
      track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0, heartbeatIntervalMs: opts.heartbeatIntervalMs })),
    isEnabled: () => true,
    getSettings: () => current.settings,
    isVisible: opts.visible ?? (() => true),
    schedule: realScheduler,
  });
  emitter.onTipSelected((s) => selections.push(s));
  emitter.onTipPhaseChange((p) => phases.push(p));
  emitter.start({ ...START, sessionOpen: opts.sessionOpen ?? false });
  track({ close: () => emitter.stop() });
  return { emitter, current, selections, phases };
}

function matarSinBye(emitter: DisplayEmitter): void {
  const transport = (emitter as unknown as { transport: { close(sayBye?: boolean): void } | null }).transport;
  if (!transport) throw new Error('la caja no tenía transporte abierto');
  transport.close(false);
}

/**
 * Pantalla real por el camino de producción (receptor + displayLink). `now`
 * (opcional, ronda 8) es un reloj manual compartido por el receptor y el
 * enlace: con él la prueba decide si dos mensajes «llegan en el mismo
 * instante» en vez de dejarlo al azar del milisegundo real.
 */
function pantallaReal(hardwareTouch: boolean, presenceIntervalMs = 60_000, resnapshotIntervalMs = 30, now?: () => number) {
  const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs, adoptionWindowMs: 60, now }));
  let snap: DisplayLinkSnapshot = INITIAL_LINK_SNAPSHOT;
  const link = startDisplayLink({
    receiver,
    capabilities: () => ({ touch: hardwareTouch, width: 1280, height: 800 }),
    onChange: (next) => {
      snap = next;
    },
    staleAfterMs: 200,
    healthIntervalMs: 20,
    resnapshotIntervalMs,
    now,
  });
  track({ close: () => link.stop() });
  /** Lo que pintaría CustomerDisplay: táctil resuelto + vista. */
  const vista = () => {
    const s = snap;
    const touch = resolveTouch(hardwareTouch, s.hello?.settings?.touch);
    return { touch, view: resolveView({ connected: s.connected, disconnectedTooLong: s.disconnectedTooLong, updateRequired: s.updateRequired, thanksExpired: false, touch, state: s.state }) };
  };
  return { receiver, link, snap: () => snap, vista };
}

/** Escucha cruda del canal: qué sobres de subida salen y con qué táctil / destinatario. */
function espiaCanal() {
  const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
  const ups: Array<{ t: string; touch?: unknown; toInstanceId?: unknown; cartId?: unknown }> = [];
  raw.onmessage = (ev: MessageEvent<unknown>) => {
    const m = ev.data as { t?: unknown; capabilities?: { touch?: unknown }; toInstanceId?: unknown; cartId?: unknown };
    if (m.t === 'need_snapshot' || m.t === 'display_alive' || m.t === 'display_bye' || m.t === 'tip_selected') {
      ups.push({ t: String(m.t), touch: m.capabilities?.touch, toInstanceId: m.toInstanceId, cartId: m.cartId });
    }
  };
  return ups;
}

function enCobro(caja: ReturnType<typeof cajaReal>, base = 20250): void {
  caja.emitter.setActiveCart(cart());
  caja.emitter.setTipBase(base);
  caja.emitter.setPayment(cashPayment());
}

// ---------------------------------------------------------------------------
// A. Dos cajas, misma terminal, misma venta en cobro
// ---------------------------------------------------------------------------

describe('A. dos cajas con la misma terminal y la misma venta en cobro', () => {
  it('la elección del cliente va SOLO a la caja que la pantalla sigue (toInstanceId): la otra ni la ve ni cierra su fase', async () => {
    const oculta = cajaReal(INSTANCE_B, { visible: () => false, sessionOpen: true });
    const visible = cajaReal(INSTANCE_A, { visible: () => true, sessionOpen: true });
    // Las dos pestañas comparten pos_carts_<org>: mismo carrito, las dos con el cobro abierto.
    enCobro(oculta);
    enCobro(visible);
    await flush(4);
    expect(oculta.emitter.tipPhase).toBe('pending');
    expect(visible.emitter.tipPhase).toBe('pending');

    const ups = espiaCanal();
    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A && pantalla.snap().state?.mode === 'tip');
    expect(pantalla.vista()).toEqual({ touch: true, view: 'tip' });

    // El cliente pulsa 10 % en la pantalla (por el camino de CustomerDisplay: link.send).
    pantalla.link.send({ t: 'tip_selected', cartId: 'cart-1', kind: 'percent', value: 10 });
    await waitFor(() => visible.selections.length === 1);
    expect(visible.selections[0]).toMatchObject({ cartId: 'cart-1', kind: 'percent', percent: 10, amount: 2025 });
    expect(visible.emitter.tipPhase).toBe('done');
    // La oculta no recibió nada: el sobre iba dirigido a la instancia A.
    await flush(4);
    expect(ups.filter((u) => u.t === 'tip_selected').map((u) => u.toInstanceId)).toEqual([INSTANCE_A]);
    expect(oculta.selections).toEqual([]);
    expect(oculta.emitter.tipPhase).toBe('pending');
    // Y la pantalla pasa a Cobro con la caja visible.
    await waitFor(() => pantalla.snap().state?.mode === 'payment');
  });

  it('hello SIN `visible` (emisor anterior) con caja abierta releva al visible dentro de la ventana de elección: compatibilidad declarada, se documenta', async () => {
    const hello = (seq: number, instanceId: string, visible: boolean | undefined, sessionOpen: boolean): DownMessage => ({
      v: 1,
      t: 'hello',
      seq,
      terminalId: TERMINAL,
      instanceId,
      cashier: null,
      sessionOpen,
      organizationId: 120,
      ...(visible === undefined ? {} : { visible }),
    });
    let clock = 100_000;
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock }));
    const got: DownMessage[] = [];
    display.onDown((m) => got.push(m));
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    display.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush();
    raw.postMessage(hello(500, INSTANCE_B, false, true)); // oculta, caja abierta
    raw.postMessage(hello(2, INSTANCE_A, true, false)); // visible, caja cerrada → releva por visible
    await waitFor(() => got.length === 2);
    expect(display.activeInstanceId).toBe(INSTANCE_A);
    raw.postMessage(hello(7, INSTANCE_C, undefined, true)); // emisor anterior con caja abierta: no se puede comparar visibilidad → sessionOpen gana
    await waitFor(() => got.length === 3);
    expect(display.activeInstanceId).toBe(INSTANCE_C);
    // Tabla de verdad de isBetterHello con un lado sin el campo: solo sessionOpen/seq.
    expect(isBetterHello({ visible: null, sessionOpen: true, seq: 7 }, { visible: true, sessionOpen: false, seq: 2 })).toBe(true);
    expect(isBetterHello({ visible: null, sessionOpen: false, seq: 700 }, { visible: true, sessionOpen: false, seq: 2 })).toBe(true);
    expect(isBetterHello({ visible: null, sessionOpen: false, seq: 1 }, { visible: true, sessionOpen: false, seq: 2 })).toBe(false);
    clock += 1;
  });

  it('la caja visible se cierra (stop → bye) con la elección ya recibida: la oculta que releva sigue con SU fase pendiente y vuelve a preguntar (limitación B3, documentada)', async () => {
    const oculta = cajaReal(INSTANCE_B, { visible: () => false, sessionOpen: true });
    const visible = cajaReal(INSTANCE_A, { visible: () => true, sessionOpen: true });
    enCobro(oculta);
    enCobro(visible);
    await flush(4);
    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_A && pantalla.snap().state?.mode === 'tip');
    pantalla.link.send({ t: 'tip_selected', cartId: 'cart-1', kind: 'none', value: 0 });
    await waitFor(() => visible.selections.length === 1);
    await waitFor(() => pantalla.snap().state?.mode === 'payment');
    visible.emitter.stop(); // bye
    await waitFor(() => pantalla.snap().connected === false);
    // El siguiente need_snapshot lo responde la oculta: se adopta (no hay visible a quien respetar) y su estado es «tip» otra vez.
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B && pantalla.snap().state?.mode === 'tip', 3000);
    expect(oculta.emitter.tipPhase).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// B. Pantalla NO táctil con propina activada, extremo a extremo
// ---------------------------------------------------------------------------

describe('B. pantalla NO táctil con propina activada (extremo a extremo)', () => {
  it('hardware sin táctil: la caja recibe touch:false por display_alive/need_snapshot y el aviso es informativo; la pantalla pinta «tip» sin botones', async () => {
    const caja = cajaReal(INSTANCE_A, { heartbeatIntervalMs: 30 });
    enCobro(caja);
    await flush(4);
    const pantalla = pantallaReal(false);
    await waitFor(() => pantalla.snap().state?.mode === 'tip');
    await waitFor(() => caja.emitter.lastDisplayCapabilities?.touch === false);
    expect(pantalla.vista()).toEqual({ touch: false, view: 'tip' });
    const notice = resolveTipWaitingNotice({
      phase: caja.emitter.tipPhase,
      displayMode: caja.emitter.getState().mode,
      connected: true,
      touch: resolveNoticeTouch(caja.emitter.lastDisplayCapabilities, caja.emitter.presentationSettings?.touch),
    });
    expect(notice?.kind).toBe('informational');
    // Nadie pulsa: el cajero teclea (skipTip) y la pantalla pasa a Cobro.
    caja.emitter.skipTip();
    await waitFor(() => pantalla.snap().state?.mode === 'payment');
  });

  it('forzado `touch` sobre hardware sin táctil: la pantalla declara true (resuelto), pinta botones y la caja espera («waiting»)', async () => {
    const caja = cajaReal(INSTANCE_A, { settings: settings({}, { touch: 'touch' }), heartbeatIntervalMs: 30 });
    enCobro(caja);
    await flush(4);
    const ups = espiaCanal();
    const pantalla = pantallaReal(false);
    await waitFor(() => pantalla.snap().state?.mode === 'tip');
    await waitFor(() => caja.emitter.lastDisplayCapabilities?.touch === true);
    expect(pantalla.vista()).toEqual({ touch: true, view: 'tip' });
    const notice = resolveTipWaitingNotice({
      phase: 'pending',
      displayMode: 'tip',
      connected: true,
      touch: resolveNoticeTouch(caja.emitter.lastDisplayCapabilities, caja.emitter.presentationSettings?.touch),
    });
    expect(notice?.kind).toBe('waiting');
    // Lo que salió al canal: primero la detección cruda (false), luego el resuelto (true) tras el hello.
    const touches = ups.filter((u) => u.t === 'display_alive' || u.t === 'need_snapshot').map((u) => u.touch);
    expect(touches[0]).toBe(false);
    expect(touches).toContain(true);
    // Y una pulsación del cliente llega (la pantalla sí tiene botones).
    pantalla.link.send({ t: 'tip_selected', cartId: 'cart-1', kind: 'percent', value: 15 });
    await waitFor(() => caja.selections.length === 1);
    expect(caja.selections[0].amount).toBe(computeTipAmount(20250, 15));
  });

  it('forzado `no-touch` sobre hardware táctil con presets vacíos y solo «Otro»: la pantalla cae al cobro y la caja no promete espera', async () => {
    const caja = cajaReal(INSTANCE_A, { settings: settings({ presets: [], allowCustom: true }, { touch: 'no-touch' }), heartbeatIntervalMs: 30 });
    enCobro(caja);
    await flush(4);
    expect(caja.emitter.tipPhase).toBe('pending');
    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.snap().state?.mode === 'tip');
    await waitFor(() => caja.emitter.lastDisplayCapabilities?.touch === false);
    expect(pantalla.vista()).toEqual({ touch: false, view: 'payment_cash' });
    const notice = resolveTipWaitingNotice({
      phase: 'pending',
      displayMode: caja.emitter.getState().mode,
      connected: true,
      touch: resolveNoticeTouch(caja.emitter.lastDisplayCapabilities, 'no-touch'),
      presetsCount: caja.emitter.getState().tip?.presets.length ?? 0,
    });
    // Ronda 8 (F2B-R7-1): sin táctil ni presets la pantalla pinta el cobro y el aviso es null (antes: «informativo» con importes que el cliente no veía).
    expect(notice).toBeNull();
    // Sin `presetsCount` (llamador anterior) se conserva el comportamiento previo: informativo.
    expect(
      resolveTipWaitingNotice({ phase: 'pending', displayMode: caja.emitter.getState().mode, connected: true, touch: false })?.kind,
    ).toBe('informational');
  });
});

// ---------------------------------------------------------------------------
// C. QA-4 simétrico y bye + rearranque inmediato
// ---------------------------------------------------------------------------

describe('C. displayLink · presencia y táctil tras caídas', () => {
  it('QA-4 simétrico: hardware NO táctil + forzado `touch`; caída sin bye → el PRIMER need_snapshot declara false (cruda) y la presencia se realinea', async () => {
    const caja = cajaReal(INSTANCE_A, { settings: settings({}, { touch: 'touch' }) });
    await flush(3);
    const ups = espiaCanal();
    const pantalla = pantallaReal(false);
    await waitFor(() => pantalla.snap().connected && pantalla.snap().hello !== null);
    await waitFor(() => ups.some((u) => u.t === 'display_alive' && u.touch === true));
    ups.length = 0;
    matarSinBye(caja.emitter);
    await waitFor(() => pantalla.snap().connected === false, 3000);
    await waitFor(() => ups.some((u) => u.t === 'need_snapshot'));
    const first = ups.find((u) => u.t === 'need_snapshot');
    expect(first?.touch).toBe(false);
    expect(ups.filter((u) => u.t === 'display_alive').map((u) => u.touch)).toEqual([false]);
  });

  it('bye + start() inmediato (misma vuelta) con forzado no-touch: la caja nueva conoce touch:false sin esperar al latido largo', async () => {
    // Reloj manual de la pantalla (ronda 8, QA bajo 3): `bye`, `hello` y `state`
    // de la caja reiniciada llegan «en el mismo instante» (byeAt === receivedAt:
    // el enlace no da la caja por viva) y la reconexión pasa por el need_snapshot
    // que la prueba provoca avanzando el reloj. Antes dependía del milisegundo
    // real en que el canal entregaba cada sobre: si `bye` y `hello` caían en
    // milisegundos distintos, el hello reconectaba sin need_snapshot y el
    // transporte nuevo se quedaba sin capacidades hasta el latido (60 s aquí).
    let clock = 1000;
    const caja = cajaReal(INSTANCE_A, { settings: settings({}, { touch: 'no-touch' }), heartbeatIntervalMs: 40 });
    await flush(3);
    const pantalla = pantallaReal(true, 60_000, 30, () => clock);
    await waitFor(() => pantalla.snap().connected && pantalla.snap().hello !== null);
    await waitFor(() => caja.emitter.lastDisplayCapabilities?.touch === false);
    caja.emitter.stop();
    caja.emitter.start({ ...START, sessionOpen: true }); // sin dar tiempo al tick de salud
    await flush(3);
    // Mismo instante que el bye: la pantalla no da por viva a la caja nueva todavía.
    expect(pantalla.snap().connected).toBe(false);
    expect(caja.emitter.lastDisplayCapabilities).toBeNull();
    // Pasa el intervalo de re-pregunta: el tick de salud manda need_snapshot con el táctil resuelto (false) y la caja contesta.
    clock += 50;
    await waitFor(() => pantalla.snap().connected && pantalla.snap().hello?.sessionOpen === true, 5000);
    // El transporte nuevo arranca sin capacidades; el need_snapshot debe ponerlas en false, nunca en true.
    await waitFor(() => caja.emitter.lastDisplayCapabilities !== null, 5000);
    expect(caja.emitter.lastDisplayCapabilities?.touch).toBe(false);
    await sleep(120);
    expect(caja.emitter.lastDisplayCapabilities?.touch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D. Ajustes inválidos tal como pueden venir de organization_settings
// ---------------------------------------------------------------------------

describe('D. ajustes rotos en organization_settings.pos_customer_display', () => {
  const casos: Array<[string, unknown, { enabled: boolean; presets: number[]; allowCustom: boolean }]> = [
    ['fila real: solo enabled', { enabled: true }, { enabled: false, presets: [5, 10, 15], allowCustom: true }],
    ['tips: null', { enabled: true, tips: null }, { enabled: false, presets: [5, 10, 15], allowCustom: true }],
    ['presets como texto', { enabled: true, tips: { enabled: true, presets: '5,10,15' } }, { enabled: true, presets: [5, 10, 15], allowCustom: true }],
    ['enabled como texto', { enabled: true, tips: { enabled: 'true', presets: [5, 10, 15] } }, { enabled: false, presets: [5, 10, 15], allowCustom: true }],
    ['dos presets', { enabled: true, tips: { enabled: true, presets: [5, 10] } }, { enabled: true, presets: [5, 10, 15], allowCustom: true }],
    ['presets repetidos', { enabled: true, tips: { enabled: true, presets: [10, 10, 15] } }, { enabled: true, presets: [5, 10, 15], allowCustom: true }],
    ['preset 0 y 101', { enabled: true, tips: { enabled: true, presets: [0, 50, 101] } }, { enabled: true, presets: [5, 10, 15], allowCustom: true }],
    ['presets desordenados válidos', { enabled: true, tips: { enabled: true, presets: [20, 8, 12], allowCustom: 'no' } }, { enabled: true, presets: [8, 12, 20], allowCustom: true }],
    ['presets decimales', { enabled: true, tips: { enabled: true, presets: [7.5, 10, 15] } }, { enabled: true, presets: [5, 10, 15], allowCustom: true }],
  ];
  it.each(casos)('%s → nunca lanza y degrada a valores por defecto campo a campo', (_n, raw, expected) => {
    const parsed = parseCustomerDisplaySettings(raw);
    expect(parsed.tips).toEqual(expected);
    const presentation = toDisplayPresentationSettings(parsed);
    // Lo que viaja en hello.settings pasa el guard del protocolo.
    expect(
      isDownMessage({ v: 1, t: 'hello', seq: 1, terminalId: TERMINAL, instanceId: INSTANCE_A, organizationId: 120, cashier: null, sessionOpen: true, settings: presentation }),
    ).toBe(true);
  });

  it('touch en mayúsculas o desconocido → auto; la pantalla usa la detección', () => {
    expect(parseCustomerDisplaySettings({ touch: 'TOUCH' }).touch).toBe('auto');
    expect(parseCustomerDisplaySettings({ touch: 'tactil' }).touch).toBe('auto');
    expect(resolveTouch(true, 'TOUCH')).toBe(true);
    expect(resolveTouch(false, 'TOUCH')).toBe(false);
  });

  it('el emisor con los ajustes degradados de una fila real (solo enabled) NO pregunta propina: el cobro va directo a payment', () => {
    const presentation = toDisplayPresentationSettings(parseCustomerDisplaySettings({ enabled: true }));
    const h = harness({ settings: presentation });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setTipBase(5000);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.emitter.tipPhase).toBeNull();
    expect(h.transport.lastState.mode).toBe('payment');
  });

  it('getSettings que devuelve basura (string, array, null) en plena entrada al cobro: no lanza, no pregunta, el hello sale sin settings', () => {
    for (const basura of ['x', [1, 2], null, 42]) {
      const sched = manualScheduler();
      const transport = new FakeTransport();
      const emitter = new DisplayEmitter({
        createTransport: () => transport,
        isEnabled: () => true,
        schedule: sched.schedule,
        getSettings: () => basura as unknown as DisplayPresentationSettings,
      });
      emitter.start(START);
      emitter.setActiveCart(cart());
      sched.flush();
      expect(() => emitter.setPayment(cashPayment())).not.toThrow();
      sched.flush();
      expect(emitter.tipPhase).toBeNull();
      expect(transport.lastState.mode).toBe('payment');
      const hello = transport.published.find((m): m is HelloDraft => m.t === 'hello');
      expect(hello && 'settings' in hello ? hello.settings : undefined).toBeUndefined();
      expect(emitter.presentationSettings).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// E. Aritmética de bordes y subtotal 0
// ---------------------------------------------------------------------------

describe('E. aritmética de bordes', () => {
  it('base pequeña con preset bajo: la opción se pinta con importe 0 («1 % · $0») y la caja la acepta como 10 % → $0 (informativa). Se anota como deuda de presentación', () => {
    const options = tipOptions(30, [1, 10, 15]);
    expect(options).toEqual([
      { percent: 1, amount: 0 },
      { percent: 10, amount: 3 },
      { percent: 15, amount: 5 },
    ]);
    const sel = resolveTipSelection('cart-1', 30, { kind: 'percent', value: 1 });
    expect(sel.amount).toBe(0);
    expect(isInformativeTipSelection(sel)).toBe(true);
    expect(describeTipSelection(sel, 'COP')).toMatch(/1 %/);
  });

  it('subtotal 0 con propina activada y pantalla táctil: no se pregunta, la fase queda pendiente, y una elección fabricada resuelve $0 (nada que aplicar)', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ items: [item({ id: 'l1', unit_price: 0, total: 0 })], subtotal: 0, total: 0 }));
    h.flush();
    h.emitter.setTipBase(0);
    h.emitter.setPayment(cashPayment(0));
    h.flush();
    expect(h.emitter.tipPhase).toBe('pending');
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.lastState.tip).toBeNull();
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    expect(got).toHaveLength(1);
    expect(got[0].amount).toBe(0);
    expect(isInformativeTipSelection(got[0])).toBe(true);
    expect(h.emitter.tipPhase).toBe('done');
  });

  it('importe libre con decimales o -0 llega saneado: 2.5 → 3; -0 → 0 (none); 0.4 → 0 informativa', () => {
    expect(resolveTipSelection('c', 1000, { kind: 'amount', value: 2.5 })).toMatchObject({ kind: 'amount', amount: 3 });
    expect(resolveTipSelection('c', 1000, { kind: 'amount', value: 0.4 })).toMatchObject({ kind: 'amount', amount: 0 });
    expect(resolveTipSelection('c', 1000, { kind: 'none', value: -0 })).toMatchObject({ kind: 'none', amount: 0 });
    expect(Object.is(resolveTipSelection('c', 1000, { kind: 'none', value: -0 }).value, -0)).toBe(false);
    // percent -0 no es un porcentaje válido: cae a «Sin propina».
    expect(resolveTipSelection('c', 1000, { kind: 'percent', value: -0 }).kind).toBe('none');
  });

  it('el estado que sale con presets > 3 (emisor sin recorte) y base decimal se sanea en la pantalla sin perder presets y con importes enteros', () => {
    const state: DisplayState = {
      mode: 'tip',
      cart: sanitizeDisplayState({ mode: 'order', cart: { id: 'c', currency: 'COP', lines: [{ id: 'l', name: 'x', qty: 1, unitPrice: 33.33, total: 33.33 }], subtotal: 33.33, discountTotal: 0, taxTotal: 0, taxIncluded: false, total: 33.33, lastChangedLineId: null }, payment: null, tip: null, thanks: null } as unknown as DisplayState).cart,
      payment: { method: 'cash', total: 33.33, received: null, change: null },
      tip: { presets: [1, 5, 10, 15, 20, 33], allowCustom: false, selected: null, base: 33.33 },
      thanks: null,
    };
    const clean = sanitizeDisplayState(state);
    expect(clean.tip?.presets).toEqual([1, 5, 10, 15, 20, 33]);
    const options = tipOptions(clean.tip?.base, clean.tip?.presets);
    for (const o of options) expect(Number.isInteger(o.amount)).toBe(true);
    expect(options.map((o) => o.amount)).toEqual([0, 2, 3, 5, 7, 11]);
    expect(sanitizeDisplayTip({ presets: [], allowCustom: false })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F. QR vencido con propina pendiente
// ---------------------------------------------------------------------------

describe('F. QR vencido y propina pendiente', () => {
  const qrPayment = (opts: { qr?: { kind: 'image'; value: string } | null; expiresAt: number | null }) =>
    toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: opts.qr ?? null, expiresAt: opts.expiresAt });

  it('el QR vencido se impone a la pregunta; cambiar a efectivo devuelve la pregunta con la misma base; el vencimiento no cierra la fase', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(qrPayment({ qr: null, expiresAt: null })); // interruptor apagado: sin código
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    h.emitter.setPayment(qrPayment({ qr: { kind: 'image', value: 'data:image/png;base64,AAA' }, expiresAt: Date.now() + 60_000 }));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    h.emitter.setPayment(qrPayment({ qr: null, expiresAt: 0 })); // vencido
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipPhase).toBe('pending');
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    expect(h.transport.lastState.tip?.base).toBe(20250);
  });

  it('un tip_selected que llega MIENTRAS el QR con código tapa la pregunta (pulsación en carrera) se acepta y cierra la fase: se documenta, no bloquea', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(qrPayment({ qr: { kind: 'image', value: 'data:image/png;base64,AAA' }, expiresAt: Date.now() + 60_000 }));
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    const got: TipSelection[] = [];
    h.emitter.onTipSelected((s) => got.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    expect(got).toHaveLength(1);
    expect(h.emitter.tipPhase).toBe('done');
    // Y el aviso de la caja pasa a «Cliente eligió»; el de espera no aplicaba (mode payment).
    expect(resolveTipWaitingNotice({ phase: 'done', displayMode: 'payment', connected: true, touch: true })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// G. Terminal sin vincular
// ---------------------------------------------------------------------------

describe('G. terminal sin vincular (pos_terminals vacía en producción)', () => {
  function memoria(initial: Record<string, string> = {}): TerminalIdStorage & { data: Record<string, string> } {
    const data = { ...initial };
    return {
      data,
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => {
        data[k] = v;
      },
    };
  }

  it('sin fila en pos_terminals la caja crea un UUID v4 local y lo reutiliza; un valor no UUID heredado se regenera', () => {
    const s = memoria();
    const id = getOrCreateLocalTerminalId(s);
    expect(isTerminalId(id)).toBe(true);
    expect(getOrCreateLocalTerminalId(s)).toBe(id);
    const roto = memoria({ pos_terminal_id: 'caja-1' });
    const nuevo = getOrCreateLocalTerminalId(roto);
    expect(isTerminalId(nuevo)).toBe(true);
    expect(readLocalTerminalId(memoria({ pos_terminal_id: 'caja-1' }))).toBeNull();
  });

  it('vincular a una terminal de la BD cambia la clave local pero NO recablea un transporte ya abierto (la tarjeta pide recargar: documentado)', async () => {
    const s = memoria();
    const local = getOrCreateLocalTerminalId(s);
    const emitter = new DisplayEmitter({
      createTransport: () => track(new BroadcastChannelTransport({ terminalId: getOrCreateLocalTerminalId(s), __testInstanceId: INSTANCE_A, now: () => 0 })),
      isEnabled: () => true,
      isVisible: () => true,
      schedule: realScheduler,
    });
    emitter.start(START);
    track({ close: () => emitter.stop() });
    const vinculada = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
    expect(setLocalTerminalId(vinculada, s)).toBe(true);
    expect(readLocalTerminalId(s)).toBe(vinculada);
    emitter.refresh();
    emitter.reannounce();
    await flush(3);
    // La pantalla abierta con el id NUEVO no oye a la caja vieja (sigue en el canal del id local).
    const receiverNuevo = track(new BroadcastChannelReceiver({ terminalId: vinculada, presenceIntervalMs: 60_000 }));
    const gotNuevo: DownMessage[] = [];
    receiverNuevo.onDown((m) => gotNuevo.push(m));
    receiverNuevo.send({ t: 'need_snapshot', capabilities: CAPS });
    await flush(5);
    expect(gotNuevo).toEqual([]);
    // Y la del id VIEJO sí.
    const receiverViejo = track(new BroadcastChannelReceiver({ terminalId: local, presenceIntervalMs: 60_000 }));
    const gotViejo: DownMessage[] = [];
    receiverViejo.onDown((m) => gotViejo.push(m));
    receiverViejo.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => gotViejo.some((m) => m.t === 'hello'));
  });
});

// ---------------------------------------------------------------------------
// H. Defectos encontrados en esta ronda (it.failing: pasan mientras el defecto
// exista y fallan cuando se corrija, para que quien lo arregle los promueva a
// `it` normal, como se hizo en r3)
// ---------------------------------------------------------------------------

describe('H. defectos de la ronda 6', () => {
  it.failing('F2B-R6-1 (bajo): bye + hello en el MISMO milisegundo (stop()+start() síncronos, cambio de organización en caliente) dejan la pantalla en «Conectando» con el estado nuevo ya aceptado, hasta el siguiente latido', async () => {
    const clock = 1_000_000;
    const emitter = new DisplayEmitter({
      createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, now: () => clock, heartbeatIntervalMs: 60_000 })),
      isEnabled: () => true,
      isVisible: () => true,
      schedule: realScheduler,
    });
    emitter.start(START);
    track({ close: () => emitter.stop() });
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => clock, presenceIntervalMs: 60_000 }));
    let snap: DisplayLinkSnapshot = INITIAL_LINK_SNAPSHOT;
    const link = startDisplayLink({
      receiver,
      capabilities: () => CAPS,
      onChange: (s) => {
        snap = s;
      },
      now: () => clock,
      staleAfterMs: 3000,
      healthIntervalMs: 20,
      resnapshotIntervalMs: 30,
    });
    track({ close: () => link.stop() });
    await waitFor(() => snap.connected && snap.state !== null);
    emitter.stop();
    emitter.start({ organizationId: 121, currency: 'COP' }); // misma vuelta: bye y hello con el mismo Date.now()
    await flush(6);
    // La pantalla ya tiene el hello y el state de la organización nueva…
    expect(snap.hello?.organizationId).toBe(121);
    expect(snap.state?.mode).toBe('idle');
    // …pero `alive` usa `byeAt >= receivedAt` y con el mismo ms cuenta el bye como posterior: Conectando (y link.send descarta) hasta el próximo mensaje.
    expect(snap.connected).toBe(true);
  });

  it.failing('F2B-R6-2 (bajo, hoy inalcanzable desde la UI): setActiveCart(null) con el cobro abierto (sin mutación) emite «Cobro» con cart:null; y cambiar de carrito activo arrastra la base de propina del carrito anterior', () => {
    const h = harness();
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setTipBase(5000);
    h.emitter.setPayment(cashPayment());
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
    h.emitter.setActiveCart(null);
    h.flush();
    const sinCarrito = h.transport.lastState;
    h.emitter.setActiveCart(cart({ id: 'cart-2', items: [item({ id: 'l9', unit_price: 999, total: 999 })], subtotal: 999, total: 999 }));
    h.flush();
    const otroCarrito = h.transport.lastState;
    // Lo que debería pasar: sin carrito no hay cobro que describir (reposo), y la base de propina es de UN carrito.
    expect(sinCarrito.mode === 'payment' && sinCarrito.cart === null).toBe(false);
    expect(otroCarrito.tip?.base).toBe(999);
  });
});
