/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 8 (QA de la ronda
 * de corrección de los tres bajos: presetsCount, getter congelado y reloj
 * manual en el test de bye + start()).
 *
 * Lo que se ataca aquí, siempre por la API pública y el camino de producción
 * (BroadcastChannel real + displayLink + emisor):
 *
 *  A. Hallazgo lateral del builder («si el hello llega en un milisegundo
 *     POSTERIOR al bye, la caja nueva no conoce el táctil hasta el latido y
 *     el aviso asume esperando»): se reproduce DETERMINISTA con el reloj
 *     manual y se demuestra que NO es observable en el aviso de la caja:
 *     `lastDisplaySeenAt` viaja en el mismo transporte que las capacidades,
 *     así que la presencia (readDisplayPresence) también es «sin pantalla»
 *     durante esa ventana y resolveTipWaitingNotice devuelve null, nunca
 *     «esperando». Al primer `display_alive` las dos cosas llegan juntas y
 *     el aviso pasa a informativo (pantalla no táctil).
 *  B. Getter `tipSelection` congelado: misma referencia que recibió el
 *     oyente; sobrevive a cambiar de método y a mover la base; se olvida con
 *     stop(), con cambio de organización, con `thanks` y con `order`. Nació
 *     documentando (bajo) que era una referencia COMPARTIDA y mutable; desde
 *     la ronda 4 de cierre el emisor la entrega con `Object.freeze` y el test
 *     exige `Object.isFrozen(...) === true`.
 *  C. Invariante caja ↔ pantalla del aviso: para TODAS las combinaciones de
 *     presets ([], [5], [5, 10, 15], [10, 10]) × «Otro» × táctil, el aviso
 *     de la caja (con `presetsCount` tomado igual que TipFromDisplayNotice)
 *     es distinto de null EXACTAMENTE cuando la pantalla pinta 'tip'
 *     (resolveView sobre el state publicado y saneado). Es la propiedad que
 *     cerró F2B-R7-1 generalizada.
 *  D. Robustez de `presetsCount`: ausente, NaN o negativo conservan el
 *     comportamiento previo (informativo); solo el 0 estricto anula.
 *  E. Cableado del componente (fuente): TipFromDisplayNotice pasa
 *     `presetsCount` desde `getState().tip?.presets.length`; y lee
 *     `emitter.tipSelection` al abrir (nació como it.failing, bajo: el
 *     getter no tenía consumidor en producción y un remontaje perdía la
 *     elección; corregido en la ronda 4 de cierre).
 *  F. Pureza: el núcleo de la propina (emitter, tip, tipNotice, TipView,
 *     TipFromDisplayNotice) no importa Supabase ni posTerminalsService: la
 *     fase funciona con la terminal SIN vincular (en la BD `pos_terminals`
 *     tiene 0 filas a 2026-09-22: es el caso real de todas las organizaciones).
 *
 * Organización ficticia (org 120), sin nombres reales.
 */

jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter, type TipPhase } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import { readDisplayPresence } from '@/lib/pos/display/presence';
import {
  PROTOCOL_VERSION,
  type DisplayCapabilities,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import type { TipSelection } from '@/lib/pos/display/tip';
import { BroadcastChannelReceiver, BroadcastChannelTransport, displayChannelName, type DisplayTransport, type HelloDraft } from '@/lib/pos/display/transport';
import { INITIAL_LINK_SNAPSHOT, startDisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import { resolveTouch, resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';
import { resolveNoticeTouch, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';

// ---------------------------------------------------------------------------
// Utilidades (mismas que las rondas anteriores)
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee8';
const INSTANCE_A = '11111111-1111-4111-8111-111111111118';

async function flush(rounds = 3): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
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
    if (msg.t === 'display_alive' || msg.t === 'need_snapshot') {
      this.lastDisplayCapabilities = { ...msg.capabilities };
      this.lastDisplaySeenAt = Date.now();
    } else if (msg.t === 'display_bye') {
      this.lastDisplayCapabilities = null;
      this.lastDisplaySeenAt = null;
    }
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

function harness(opts: { settings?: DisplayPresentationSettings } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings ?? settings() };
  const selections: TipSelection[] = [];
  const phases: TipPhase[] = [];
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
    schedule: sched.schedule,
    getSettings: () => current.settings,
  });
  emitter.onTipSelected((s) => selections.push(s));
  emitter.onTipPhaseChange((p) => phases.push(p));
  return { emitter, transport, flush: sched.flush, current, selections, phases };
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
const cardPayment = (total = 5000) => toDisplayPayment({ methodCode: 'card', methodName: 'Tarjeta', total });
const tipSelected = (kind: string, value: number, cartId = 'cart-1'): UpMessage =>
  ({ v: PROTOCOL_VERSION, t: 'tip_selected', terminalId: TERMINAL, cartId, kind, value }) as unknown as UpMessage;

const realScheduler = (fn: () => void) => {
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

function cajaReal(instanceId: string, opts: { settings?: DisplayPresentationSettings; heartbeatIntervalMs?: number } = {}) {
  const current = { settings: opts.settings ?? settings() };
  const emitter = new DisplayEmitter({
    createTransport: () =>
      track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, heartbeatIntervalMs: opts.heartbeatIntervalMs })), // reloj real: lastDisplaySeenAt se compara con Date.now() en readDisplayPresence
    isEnabled: () => true,
    getSettings: () => current.settings,
    isVisible: () => true,
    schedule: realScheduler,
  });
  emitter.start({ ...START, sessionOpen: false });
  track({ close: () => emitter.stop() });
  return { emitter, current };
}

/** Pantalla real (receptor + enlace) con reloj manual compartido. */
function pantallaReal(hardwareTouch: boolean, presenceIntervalMs: number, now: () => number) {
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
    resnapshotIntervalMs: 30,
    now,
  });
  track({ close: () => link.stop() });
  return { receiver, link, snap: () => snap };
}

/** Escucha cruda del canal: qué sobres de subida salen. */
function espiaCanal() {
  const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
  const ups: string[] = [];
  raw.onmessage = (ev: MessageEvent<unknown>) => {
    const m = ev.data as { t?: unknown };
    if (typeof m.t === 'string') ups.push(m.t);
  };
  return ups;
}

const SRC = (rel: string) => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

// ---------------------------------------------------------------------------
// A. Hallazgo lateral: hello en un milisegundo POSTERIOR al bye
// ---------------------------------------------------------------------------

describe('A. bye + start() con el hello en un instante POSTERIOR (reloj manual): la ventana sin capacidades no se ve en el aviso', () => {
  it('reconecta sin need_snapshot; la caja no conoce el táctil PERO tampoco ve la pantalla (mismo transporte) → aviso null, nunca «esperando»; el primer display_alive trae las dos cosas y el aviso pasa a informativo', async () => {
    let clock = 1000;
    const ups = espiaCanal();
    const caja = cajaReal(INSTANCE_A, { settings: settings({}, { touch: 'no-touch' }), heartbeatIntervalMs: 40 });
    await flush(3);
    const pantalla = pantallaReal(true, 300, () => clock);
    await waitFor(() => pantalla.snap().connected && pantalla.snap().hello !== null);
    await waitFor(() => caja.emitter.lastDisplayCapabilities?.touch === false);

    // La caja entra en cobro con propina: fase pendiente.
    caja.emitter.setActiveCart(cart());
    caja.emitter.setPayment(cashPayment());
    caja.emitter.setTipBase(5000);
    await flush(3);
    expect(caja.emitter.tipPhase).toBe('pending');

    // Reinicio: bye en t, hello en t + 1 (milisegundos DISTINTOS).
    caja.emitter.stop();
    await flush(3);
    expect(pantalla.snap().connected).toBe(false);
    const snapshotsAntes = ups.filter((t) => t === 'need_snapshot').length;
    clock += 1;
    caja.emitter.start({ ...START, sessionOpen: true });
    await flush(3);

    // Reconectó por el hello, sin pedir snapshot (byeAt < receivedAt).
    expect(pantalla.snap().connected).toBe(true);
    expect(pantalla.snap().hello?.sessionOpen).toBe(true);
    expect(ups.filter((t) => t === 'need_snapshot').length).toBe(snapshotsAntes);

    // Ventana del hallazgo: el transporte nuevo no conoce las capacidades…
    expect(caja.emitter.lastDisplayCapabilities).toBeNull();
    // …pero tampoco ha visto a la pantalla: la presencia es «sin pantalla» en el MISMO instante.
    expect(caja.emitter.lastDisplaySeenAt).toBeNull();
    const presencia = readDisplayPresence(caja.emitter, Date.now());
    expect(presencia.connected).toBe(false);
    // Lo que calcularía TipFromDisplayNotice en esa ventana (la fase la reabre el cobro siguiente; aquí se fuerza el peor caso: pendiente).
    caja.emitter.setActiveCart(cart());
    caja.emitter.setPayment(cashPayment());
    await flush(3);
    expect(caja.emitter.tipPhase).toBe('pending');
    const enVentana = resolveTipWaitingNotice({
      phase: caja.emitter.tipPhase,
      displayMode: caja.emitter.getState().mode,
      connected: presencia.connected,
      touch: resolveNoticeTouch(caja.emitter.lastDisplayCapabilities, caja.emitter.presentationSettings?.touch),
      presetsCount: caja.emitter.getState().tip?.presets.length ?? 0,
    });
    expect(enVentana).toBeNull();

    // Primer latido de la pantalla: capacidades y presencia llegan JUNTAS.
    await waitFor(() => caja.emitter.lastDisplayCapabilities !== null, 5000);
    expect(caja.emitter.lastDisplayCapabilities?.touch).toBe(false);
    expect(caja.emitter.lastDisplaySeenAt).not.toBeNull();
    const despues = resolveTipWaitingNotice({
      phase: caja.emitter.tipPhase,
      displayMode: caja.emitter.getState().mode,
      connected: readDisplayPresence(caja.emitter, Date.now()).connected,
      touch: resolveNoticeTouch(caja.emitter.lastDisplayCapabilities, caja.emitter.presentationSettings?.touch),
      presetsCount: caja.emitter.getState().tip?.presets.length ?? 0,
    });
    expect(despues?.kind).toBe('informational');
  });

  it('el emisor avisa por onDisplayCapabilitiesChange en cuanto llega ese primer display_alive (sin sondeo): null → { touch: false }', async () => {
    let clock = 1000;
    const caja = cajaReal(INSTANCE_A, { settings: settings({}, { touch: 'no-touch' }), heartbeatIntervalMs: 40 });
    await flush(3);
    const pantalla = pantallaReal(true, 300, () => clock);
    await waitFor(() => pantalla.snap().connected && caja.emitter.lastDisplayCapabilities?.touch === false);
    const avisos: Array<boolean | null> = [];
    caja.emitter.onDisplayCapabilitiesChange((c) => avisos.push(c === null ? null : c.touch));
    caja.emitter.stop();
    await flush(3);
    clock += 1;
    caja.emitter.start(START);
    await flush(3);
    expect(avisos).toEqual([null]); // el cierre del transporte ya avisó «sin pantalla»
    await waitFor(() => avisos.length >= 2, 5000);
    expect(avisos).toEqual([null, false]);
  });
});

// ---------------------------------------------------------------------------
// B. Getter tipSelection congelado
// ---------------------------------------------------------------------------

describe('B. getter tipSelection: congelado, misma referencia, y cuándo se olvida', () => {
  function elegir(h: ReturnType<typeof harness>) {
    h.emitter.start(START);
    h.emitter.setActiveCart(cart({ total: 20250 }));
    h.flush();
    h.emitter.setPayment(cashPayment(20250));
    h.emitter.setTipBase(20250);
    h.flush();
    h.transport.emitUp(tipSelected('percent', 10));
    h.flush();
    expect(h.selections).toHaveLength(1);
    expect(h.emitter.tipSelection).toBe(h.selections[0]);
  }

  it('sobrevive a cambiar de método (cash → card) y a mover la base: misma referencia, 2.025', () => {
    const h = harness();
    elegir(h);
    h.emitter.setPayment(cardPayment(20250));
    h.flush();
    h.emitter.setTipBase(30000);
    h.flush();
    expect(h.emitter.tipPhase).toBe('done');
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipSelection).toBe(h.selections[0]);
    expect(h.emitter.tipSelection?.amount).toBe(2025);
  });

  it('skipTip() tras la elección no la borra (la fase ya estaba «done»)', () => {
    const h = harness();
    elegir(h);
    h.emitter.skipTip();
    expect(h.emitter.tipSelection?.amount).toBe(2025);
    expect(h.phases).toEqual(['pending', 'done']);
  });

  it.each([
    ['stop()', (e: DisplayEmitter) => e.stop()],
    ['setMode(thanks)', (e: DisplayEmitter) => e.setMode('thanks', { total: 22275 })],
    ['setMode(order)', (e: DisplayEmitter) => e.setMode('order')],
    ['setMode(idle)', (e: DisplayEmitter) => e.setMode('idle')],
    ['setPayment(null)', (e: DisplayEmitter) => e.setPayment(null)],
    ['start() con OTRA organización', (e: DisplayEmitter) => e.start({ organizationId: 121, currency: 'COP' })],
  ])('%s olvida la elección congelada', (_label, act) => {
    const h = harness();
    elegir(h);
    act(h.emitter);
    expect(h.emitter.tipSelection).toBeNull();
    expect(h.emitter.tipPhase).toBeNull();
  });

  it('start() repetido con la MISMA organización conserva la elección (es un cambio de datos de esta caja, no una venta nueva)', () => {
    const h = harness();
    elegir(h);
    h.emitter.start({ ...START, sessionOpen: true });
    expect(h.emitter.tipSelection?.amount).toBe(2025);
    expect(h.emitter.tipPhase).toBe('done');
  });

  it('un segundo tip_selected con la fase «done» se descarta y no sustituye la congelada', () => {
    const h = harness();
    elegir(h);
    h.transport.emitUp(tipSelected('percent', 15));
    expect(h.selections).toHaveLength(1);
    expect(h.emitter.tipSelection?.percent).toBe(10);
  });

  it('corregido (ronda 4 de cierre): la referencia compartida está CONGELADA; un oyente descuidado que intente mutarla no cambia lo que ve el getter ni los oyentes siguientes', () => {
    const h = harness();
    const vistoPorElSegundo: number[] = [];
    let intentoFallido = false;
    h.emitter.onTipSelected((s) => {
      try {
        (s as { amount: number }).amount = 999_999; // un consumidor descuidado
      } catch {
        intentoFallido = true; // en modo estricto, escribir sobre un objeto congelado lanza
      }
    });
    h.emitter.onTipSelected((s) => vistoPorElSegundo.push(s.amount));
    elegir(h);
    expect(Object.isFrozen(h.emitter.tipSelection)).toBe(true);
    expect(intentoFallido).toBe(true);
    expect(h.emitter.tipSelection?.amount).toBe(2025);
    expect(vistoPorElSegundo).toEqual([2025]);
    expect(h.selections[0]).toBe(h.emitter.tipSelection);
  });
});

// ---------------------------------------------------------------------------
// C. Invariante caja ↔ pantalla del aviso (F2B-R7-1 generalizado)
// ---------------------------------------------------------------------------

describe('C. el aviso de la caja existe EXACTAMENTE cuando la pantalla pinta «Propina»', () => {
  const presetsCases: number[][] = [[], [5], [5, 10, 15], [10, 10], [0, 101, 7.5]];
  const combos: Array<[string, number[], boolean, boolean]> = [];
  for (const presets of presetsCases) {
    for (const allowCustom of [true, false]) {
      for (const touch of [true, false]) {
        combos.push([`presets ${JSON.stringify(presets)} · Otro ${allowCustom} · táctil ${touch}`, presets, allowCustom, touch]);
      }
    }
  }

  it.each(combos)('%s', (_label, presets, allowCustom, touch) => {
    const h = harness({ settings: settings({ presets, allowCustom }, { touch: touch ? 'touch' : 'no-touch' }) });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setPayment(cashPayment());
    h.emitter.setTipBase(5000);
    h.flush();
    // Lo que la pantalla pinta: state publicado, saneado, con el táctil resuelto por el mismo forzado.
    const published = h.transport.lastState;
    const clean = sanitizeDisplayState(published);
    const resolvedTouch = resolveTouch(false, h.emitter.presentationSettings?.touch);
    expect(resolvedTouch).toBe(touch);
    const view = resolveView({ connected: true, disconnectedTooLong: false, updateRequired: false, thanksExpired: false, touch: resolvedTouch, state: clean });
    // Lo que la caja avisa (mismo cableado que TipFromDisplayNotice).
    const notice = resolveTipWaitingNotice({
      phase: h.emitter.tipPhase,
      displayMode: h.emitter.getState().mode,
      connected: true,
      touch: resolveNoticeTouch({ touch: resolvedTouch }, h.emitter.presentationSettings?.touch),
      presetsCount: h.emitter.getState().tip?.presets.length ?? 0,
    });
    expect(notice !== null).toBe(view === 'tip');
    if (notice) expect(notice.kind).toBe(touch ? 'waiting' : 'informational');
    // Y los presets que la caja cuenta son los que la pantalla pinta (deduplicados y filtrados por igual).
    if (clean?.tip) expect(clean.tip.presets).toEqual(h.emitter.getState().tip?.presets);
  });
});

// ---------------------------------------------------------------------------
// D. Robustez de presetsCount
// ---------------------------------------------------------------------------

describe('D. presetsCount: solo el 0 estricto anula el aviso informativo', () => {
  const base = { phase: 'pending' as const, displayMode: 'tip' as const, connected: true, touch: false as boolean | null };
  it.each([
    ['ausente', undefined],
    ['NaN', Number.NaN],
    ['negativo', -1],
    ['1', 1],
    ['decimal 0.5', 0.5],
  ])('presetsCount %s → informativo', (_l, presetsCount) => {
    expect(resolveTipWaitingNotice({ ...base, presetsCount })?.kind).toBe('informational');
  });
  it('0 estricto (y -0) → null sin táctil; con táctil o táctil desconocido → esperando', () => {
    expect(resolveTipWaitingNotice({ ...base, presetsCount: 0 })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, presetsCount: -0 })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, touch: true, presetsCount: 0 })?.kind).toBe('waiting');
    expect(resolveTipWaitingNotice({ ...base, touch: null, presetsCount: 0 })?.kind).toBe('waiting');
  });
  it('fuera de la fase o sin pantalla o sin pintar «tip», presetsCount no cambia nada', () => {
    expect(resolveTipWaitingNotice({ ...base, phase: 'done', presetsCount: 3 })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, connected: false, presetsCount: 3 })).toBeNull();
    expect(resolveTipWaitingNotice({ ...base, displayMode: 'payment', presetsCount: 3 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// E. Cableado del componente (fuente)
// ---------------------------------------------------------------------------

describe('E. TipFromDisplayNotice (fuente)', () => {
  const src = SRC('components/pos/display/TipFromDisplayNotice.tsx');

  it('pasa presetsCount desde getState().tip?.presets.length ?? 0 (el mismo origen que el invariante C)', () => {
    expect(src).toMatch(/presetsCount:\s*getPosDisplayEmitter\(\)\.getState\(\)\.tip\?\.presets\.length \?\? 0/);
  });

  it('corregido (ronda 4 de cierre): al abrir lee la elección ya recibida (setSelection(emitter.tipSelection)), así el getter congelado es la fuente de verdad y un remontaje no la pierde', () => {
    expect(src).toMatch(/setSelection\(\s*emitter\.tipSelection\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// F. Pureza del núcleo de la propina: terminal sin vincular
// ---------------------------------------------------------------------------

describe('F. la fase de propina no depende de la BD ni de pos_terminals', () => {
  it.each([
    'lib/pos/display/emitter.ts',
    'lib/pos/display/tip.ts',
    'components/pos/display/tipNotice.ts',
    'components/pos-display/TipView.tsx',
    'components/pos/display/TipFromDisplayNotice.tsx',
  ])('%s no importa supabase ni posTerminalsService', (rel) => {
    const src = SRC(rel);
    expect(src).not.toMatch(/from ['"]@\/lib\/supabase/);
    expect(src).not.toMatch(/posTerminalsService/);
  });

  it('el emisor funciona con el UUID local sin fila en pos_terminals: hello + tip con la terminal que le den', async () => {
    const caja = cajaReal(INSTANCE_A);
    await flush(3);
    let clock = 5000;
    const pantalla = pantallaReal(true, 60_000, () => clock);
    await waitFor(() => pantalla.snap().connected && pantalla.snap().hello !== null);
    caja.emitter.setActiveCart(cart());
    caja.emitter.setPayment(cashPayment());
    await flush(3);
    await waitFor(() => pantalla.snap().state?.mode === 'tip');
    expect(pantalla.snap().state?.tip?.presets).toEqual([5, 10, 15]);
    clock += 1;
  });
});
