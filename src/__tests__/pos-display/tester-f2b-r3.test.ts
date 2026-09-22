/**
 * Tester · Fase 2 · Parte B (Propina en pantalla) · ronda 3.
 *
 * Casos borde sobre lo que cambió en la ronda 3 (táctil RESUELTO declarado
 * por la pantalla y reemitido en el acto, onDisplayCapabilitiesChange,
 * followTipOnPrefilledPayment en ambos sentidos, «Aplicar» que respeta una
 * entrada QR ya cobrada, hello.visible en la elección del receptor):
 *
 *  A. Reconexión de la caja con forzado activo: la pantalla vuelve a
 *     declarar la detección CRUDA en el need_snapshot sin hello, y al
 *     reaceptar el hello el receptor no reemitía `display_alive` porque su
 *     `presenceCapabilities` ya tenía el táctil resuelto de antes. La caja
 *     quedaba con `lastDisplayCapabilities.touch` crudo hasta el siguiente
 *     latido (DEFECTO F2B-R3-1). CORREGIDO en la ronda 5: askSnapshot
 *     realinea la presencia cuando cambia lo declarado, y el hello que
 *     vuelve dispara el `display_alive` resuelto en el acto. El aviso del
 *     modal nunca se vio afectado porque resolveNoticeTouch aplica el
 *     forzado de respaldo (se comprueba en el mismo bloque).
 *  B. Aritmética de porcentajes: `computeTipAmount` (pantalla y «Aplicar»)
 *     y la fórmula que tenía `handleTipPercentage` del modal
 *     (`Math.round(base * (pct / 100))`) coincidían para 5/10/15/20 (los
 *     botones del modal) pero NO para cualquier preset en [1, 100] (25 × 58 %
 *     → 14 en el modal, 15 en la pantalla) (DEFECTO F2B-R3-2, bajo).
 *     CORREGIDO en la ronda 5: el modal llama a computeTipAmount (una sola
 *     implementación, regla dura 7); la prueba lo comprueba en el fuente.
 *  C. Ajustes inválidos en `organization_settings` → parse → emisor: nunca
 *     sale un «tip» con presets inválidos; tips basura = sin pregunta.
 *  D. Dos cajas con la misma terminal, ambas en fase de propina: la elección
 *     del cliente solo cierra la fase de la caja que la pantalla sigue (la
 *     visible); la oculta sigue pendiente. Y con tres hellos en la ventana
 *     de elección (oculta/visible/oculta) la visible se queda.
 *  E. onDisplayCapabilitiesChange: un oyente que para el emisor desde
 *     dentro del aviso no rompe nada y el estado final es coherente (null).
 *  F. QR vencido durante la pregunta: el vencimiento se impone, un
 *     tip_selected tardío se acepta (fase done) y al cancelar el QR se pinta
 *     cobro, nunca la pregunta otra vez.
 *  G. followTipOnPrefilledPayment (lógica pura): con la entrada QR cobrada
 *     marcada, ni «Aplicar» ni deseleccionar el porcentaje la tocan; y con
 *     shippingFee la entrada sigue a base + propina + domicilio.
 *
 * Sin `it.failing` desde la ronda 5: F2B-R3-1 y F2B-R3-2 están corregidos y
 * sus pruebas exigen el comportamiento nuevo. Organización ficticia (org
 * 120), sin nombres reales.
 */

// settings.ts importa el cliente de navegador; aquí solo se usan sus funciones puras (parse / toDisplay...).
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => ({}) } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import type { Cart, CartItem } from '@/components/pos/types';
import { DisplayEmitter } from '@/lib/pos/display/emitter';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import {
  PROTOCOL_VERSION,
  type DisplayCapabilities,
  type DisplayPresentationSettings,
  type DisplayState,
  type DownMessageDraft,
  type UpMessage,
} from '@/lib/pos/display/protocol';
import { parseCustomerDisplaySettings, toDisplayPresentationSettings } from '@/lib/pos/display/settings';
import { computeTipAmount, type TipSelection } from '@/lib/pos/display/tip';
import {
  BroadcastChannelReceiver,
  BroadcastChannelTransport,
  displayChannelName,
  isBetterHello,
  type DisplayTransport,
  type HelloDraft,
} from '@/lib/pos/display/transport';
import { resolveTouch } from '@/components/pos-display/logic';
import { INITIAL_LINK_SNAPSHOT, startDisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import { applyTipToPrefilledPayment, resolveNoticeTouch, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee3';
const INSTANCE_A = '11111111-1111-4111-8111-111111111113';
const INSTANCE_B = '22222222-2222-4222-8222-222222222223';

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
  lastDisplayCapabilities: DisplayCapabilities | null = null;
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
  /** Como el transporte real: anota las capacidades antes de entregar el sobre. */
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

function harness(opts: { settings?: DisplayPresentationSettings | null } = {}) {
  const sched = manualScheduler();
  const transport = new FakeTransport();
  const current = { settings: opts.settings === undefined ? settings() : opts.settings };
  const emitter = new DisplayEmitter({
    createTransport: () => transport,
    isEnabled: () => true,
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
const qrPayment = (qr: string | null, expiresAt: number | null = null) =>
  toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 5000, qr: qr === null ? null : { kind: 'image', value: qr }, expiresAt });
const tipSelected = (kind: 'percent' | 'amount' | 'none', value: number, cartId = 'cart-1', toInstanceId?: string): UpMessage => ({
  v: PROTOCOL_VERSION,
  t: 'tip_selected',
  terminalId: TERMINAL,
  cartId,
  kind,
  value,
  ...(toInstanceId ? { toInstanceId } : {}),
});
const alive = (touch: boolean, at = 0): UpMessage => ({
  v: PROTOCOL_VERSION,
  t: 'display_alive',
  terminalId: TERMINAL,
  at,
  capabilities: { touch, width: 1280, height: 800 },
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

const realScheduler = (fn: () => void) => {
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
};

/** Caja real por BroadcastChannel con instancia fija y visibilidad inyectable. */
function cajaReal(
  instanceId: string,
  opts: { visible?: () => boolean; settings?: DisplayPresentationSettings; sessionOpen?: boolean; heartbeatIntervalMs?: number } = {},
) {
  const current = { settings: opts.settings ?? settings() };
  const emitter = new DisplayEmitter({
    createTransport: () =>
      track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceId, now: () => 0, heartbeatIntervalMs: opts.heartbeatIntervalMs })),
    isEnabled: () => true,
    getSettings: () => current.settings,
    isVisible: opts.visible ?? (() => true),
    schedule: realScheduler,
  });
  emitter.start({ ...START, sessionOpen: opts.sessionOpen ?? true });
  track({ close: () => emitter.stop() });
  return { emitter, current };
}

/** Simula una pestaña de caja matada: cierra el canal del transporte SIN `bye` (el emisor no se entera). */
function matarSinBye(emitter: DisplayEmitter): void {
  const transport = (emitter as unknown as { transport: { close(sayBye?: boolean): void } | null }).transport;
  if (!transport) throw new Error('la caja no tenía transporte abierto');
  transport.close(false);
}

/** Pantalla real por el camino de producción (receptor + displayLink). */
function pantallaReal(hardwareTouch: boolean, presenceIntervalMs = 60_000, resnapshotIntervalMs = 30) {
  const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, presenceIntervalMs }));
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
  });
  track({ close: () => link.stop() });
  return { receiver, link, snap: () => snap };
}

// ---------------------------------------------------------------------------
// A. Reconexión con forzado activo
// ---------------------------------------------------------------------------

describe('A. reconexión de la caja con forzado táctil: lo que la caja CREE tras volver', () => {
  /**
   * Hardware táctil + forzado «no-touch». La pantalla resuelve false y lo
   * declara; la caja lo ve. La caja MUERE SIN `bye` (pestaña matada: el canal
   * se cierra sin despedirse) y la pantalla, tras staleAfterMs, la olvida
   * (hello: null) y pide snapshot sin destinatario con la detección CRUDA
   * (true) cada resnapshotIntervalMs. La caja vuelve a arrancar: recibe ese
   * need_snapshot (anota touch:true), saluda con el forzado, y la pantalla,
   * al aceptar el hello, llama a startPresence(touch:false)… pero el
   * receptor ya tenía presenceCapabilities.touch = false de antes y NO
   * reemite. La caja se queda con true hasta el siguiente latido (1 s en
   * producción; aquí el latido está a 60 s para que se vea).
   */
  async function reconectarTrasCaida(presenceIntervalMs = 60_000) {
    const caja = cajaReal(INSTANCE_A, { settings: settings({}, { touch: 'no-touch' }), heartbeatIntervalMs: 50 });
    caja.emitter.setActiveCart(cart());
    caja.emitter.setTipBase(20250);
    caja.emitter.setPayment(cashPayment());
    await flush(4);

    const pantalla = pantallaReal(true, presenceIntervalMs, 0);
    await waitFor(() => pantalla.snap().hello !== null && pantalla.snap().state?.mode === 'tip');
    await flush(4);
    expect(caja.emitter.lastDisplayCapabilities?.touch).toBe(false); // resuelto, ronda 3

    // Caída sin bye: el canal de la caja se cierra sin despedirse; la pantalla la olvida por silencio.
    matarSinBye(caja.emitter);
    await waitFor(() => pantalla.snap().connected === false && pantalla.snap().hello === null, 3000);
    await flush(4);

    // La caja vuelve (misma instancia): oye el need_snapshot crudo de la pantalla y saluda con el forzado.
    caja.emitter.stop();
    caja.emitter.start({ ...START, sessionOpen: true });
    // El canal de la caja ya existe y su hello aún no ha llegado (asíncrono): el tick de salud de la
    // pantalla, todavía «sin caja», pide snapshot sin destinatario con la detección cruda. En producción
    // es el tick de 250 ms / 2 s que cae en esa ventana.
    pantalla.link.evaluateHealth();
    caja.emitter.setActiveCart(cart());
    caja.emitter.setPayment(cashPayment());
    await waitFor(() => pantalla.snap().connected && pantalla.snap().hello !== null, 3000);
    await waitFor(() => caja.emitter.lastDisplayCapabilities !== null, 3000);
    await flush(8);
    return { caja, pantalla };
  }

  it('F2B-R3-1 corregido (ronda 5): tras volver, lastDisplayCapabilities.touch es el RESUELTO (false) en el acto, sin esperar al latido', async () => {
    const { caja, pantalla } = await reconectarTrasCaida();
    expect(resolveTouch(true, pantalla.snap().hello?.settings?.touch)).toBe(false); // la pantalla NO pinta botones
    expect(caja.emitter.lastDisplayCapabilities?.touch).toBe(false); // y la caja lo sabe ya (display_alive reemitido al reaceptar el hello)
  });

  it('evidencia de la corrección: el need_snapshot sin hello declaró la detección cruda (true) y el display_alive posterior la corrigió a false', async () => {
    const raw = track(new BroadcastChannel(displayChannelName(TERMINAL)));
    const touches: string[] = [];
    raw.onmessage = (ev: MessageEvent<unknown>) => {
      const m = ev.data as { t?: unknown; capabilities?: { touch?: unknown } };
      if (m.t === 'need_snapshot' || m.t === 'display_alive') touches.push(`${m.t}:${String(m.capabilities?.touch)}`);
    };
    const { pantalla } = await reconectarTrasCaida();
    expect(resolveTouch(true, pantalla.snap().hello?.settings?.touch)).toBe(false);
    expect(touches).toContain('need_snapshot:true');
    expect(touches[touches.length - 1]).toBe('display_alive:false');
  });

  it('el aviso del modal no lo sufre: resolveNoticeTouch aplica el forzado de respaldo y dice «registre lo que indique el cliente»', async () => {
    const { caja } = await reconectarTrasCaida();
    const touch = resolveNoticeTouch(caja.emitter.lastDisplayCapabilities, caja.emitter.presentationSettings?.touch);
    expect(touch).toBe(false);
    const aviso = resolveTipWaitingNotice({ phase: caja.emitter.tipPhase, displayMode: caja.emitter.getState().mode, connected: true, touch });
    expect(aviso?.kind).toBe('informational');
  });

  it('con el latido de la pantalla corriendo la caja acaba viendo el táctil resuelto sin intervención (≤ un latido)', async () => {
    const { caja } = await reconectarTrasCaida(40);
    await waitFor(() => caja.emitter.lastDisplayCapabilities?.touch === false, 2000);
  });
});

// ---------------------------------------------------------------------------
// B. Aritmética: pantalla/«Aplicar» (tip.ts) frente a los botones del modal
// ---------------------------------------------------------------------------

describe('B. computeTipAmount frente a handleTipPercentage del modal', () => {
  /** Lo que hacía CheckoutDialog.handleTipPercentage hasta la ronda 5: `Math.round(baseTotal * (percentage / 100))`. */
  const modalAntes = (base: number, pct: number) => Math.round(base * (pct / 100));

  it('para los botones del modal (5/10/15/20) la fórmula anterior y computeTipAmount coinciden en toda base entera hasta 2.000.000 (por eso no se notó)', () => {
    let diffs = 0;
    for (let base = 1; base <= 2_000_000; base += 1) {
      for (const pct of [5, 10, 15, 20]) if (modalAntes(base, pct) !== computeTipAmount(base, pct)) diffs += 1;
    }
    expect(diffs).toBe(0);
  });

  it('F2B-R3-2 corregido (ronda 5): handleTipPercentage usa computeTipAmount de tip.ts (regla dura 7); la fórmula anterior difería en 1 con presets arbitrarios', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/pos/CheckoutDialog.tsx'), 'utf8');
    expect(src).toContain("import { computeTipAmount } from '@/lib/pos/display/tip';");
    expect(src).toContain('const calculatedTip = computeTipAmount(baseTotal, percentage);');
    expect(src).not.toContain('Math.round(baseTotal * (percentage / 100))');
    // Evidencia de por qué importaba: 25 × 58 % → 14 antes, 15 en la pantalla; 50 × 29 % → 14 / 15.
    expect(modalAntes(25, 58)).toBe(14);
    expect(computeTipAmount(25, 58)).toBe(15);
    expect(modalAntes(50, 29)).toBe(14);
    expect(computeTipAmount(50, 29)).toBe(15);
    expect(modalAntes(150, 41)).not.toBe(computeTipAmount(150, 41));
  });

  it('lo que se APLICA es lo que el cliente vio: tip_selected percent 58 sobre base 25 llega a la caja con 15 (tip.ts), igual que la pantalla', () => {
    const h = enTip({ settings: settings({ presets: [29, 58, 87] }) });
    h.emitter.setTipBase(25);
    h.flush();
    const seen: TipSelection[] = [];
    h.emitter.onTipSelected((s) => seen.push(s));
    h.transport.emitUp(tipSelected('percent', 58));
    expect(seen).toHaveLength(1);
    expect(seen[0].amount).toBe(15);
    expect(computeTipAmount(25, 58)).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// C. Ajustes inválidos en organization_settings → emisor
// ---------------------------------------------------------------------------

describe('C. ajustes basura en organization_settings nunca producen un «tip» inválido', () => {
  function conAjustes(raw: unknown) {
    const parsed = toDisplayPresentationSettings(parseCustomerDisplaySettings(raw));
    const h = harness({ settings: parsed });
    h.emitter.start(START);
    h.emitter.setActiveCart(cart());
    h.flush();
    h.emitter.setTipBase(20250);
    h.emitter.setPayment(cashPayment());
    h.flush();
    return { h, parsed };
  }

  it('presets repetidos / vacíos / no numéricos / fuera de rango con tips.enabled → pregunta con 5/10/15 (defaults), nunca presets inválidos', () => {
    for (const presets of [[5, 5, 5], [], ['a', 'b', 'c'], [0, 150, 10], [5, 10], null, 'x']) {
      const { h } = conAjustes({ enabled: true, tips: { enabled: true, presets, allowCustom: true } });
      expect(h.transport.lastState.mode).toBe('tip');
      expect(h.transport.lastState.tip?.presets).toEqual([5, 10, 15]);
    }
  });

  it('tips no objeto, enabled como string o raíz no objeto → sin pregunta (payment)', () => {
    for (const raw of [{ enabled: true, tips: 'si' }, { enabled: true, tips: { enabled: 'true', presets: [5, 10, 15] } }, 'basura', null, [1, 2]]) {
      const { h } = conAjustes(raw);
      expect(h.emitter.tipPhase).toBeNull();
      expect(h.transport.lastState.mode).toBe('payment');
    }
  });

  it('presets desordenados válidos se ordenan y allowCustom no booleano cae a true', () => {
    const { h, parsed } = conAjustes({ enabled: true, tips: { enabled: true, presets: [20, 5, 10], allowCustom: 'nope' } });
    expect(parsed.tips.allowCustom).toBe(true);
    expect(h.transport.lastState.tip?.presets).toEqual([5, 10, 20]);
    expect(h.transport.lastState.tip?.allowCustom).toBe(true);
  });

  it('touch inválido cae a auto: la pantalla usa su detección', () => {
    const parsed = toDisplayPresentationSettings(parseCustomerDisplaySettings({ enabled: true, touch: 'maybe' }));
    expect(parsed.touch).toBe('auto');
    expect(resolveTouch(true, parsed.touch)).toBe(true);
    expect(resolveTouch(false, parsed.touch)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// D. Dos cajas con la misma terminal
// ---------------------------------------------------------------------------

describe('D. dos cajas con la misma terminal, las dos en fase de propina', () => {
  it('la elección del cliente cierra SOLO la fase de la caja visible (la que la pantalla sigue); la oculta sigue pendiente', async () => {
    const oculta = cajaReal(INSTANCE_A, { visible: () => false, sessionOpen: true });
    const visible = cajaReal(INSTANCE_B, { visible: () => true, sessionOpen: false });
    for (const c of [oculta, visible]) {
      c.emitter.setActiveCart(cart());
      c.emitter.setTipBase(20250);
      c.emitter.setPayment(cashPayment());
    }
    await flush(4);
    expect(oculta.emitter.tipPhase).toBe('pending');
    expect(visible.emitter.tipPhase).toBe('pending');

    const pantalla = pantallaReal(true);
    await waitFor(() => pantalla.receiver.activeInstanceId === INSTANCE_B && pantalla.snap().state?.mode === 'tip');
    await flush(4);

    const enVisible: TipSelection[] = [];
    const enOculta: TipSelection[] = [];
    visible.emitter.onTipSelected((s) => enVisible.push(s));
    oculta.emitter.onTipSelected((s) => enOculta.push(s));
    pantalla.link.send({ t: 'tip_selected', cartId: 'cart-1', kind: 'percent', value: 10 });
    await waitFor(() => enVisible.length === 1);
    await flush(4);
    expect(enVisible[0].amount).toBe(2025);
    expect(enOculta).toHaveLength(0);
    expect(visible.emitter.tipPhase).toBe('done');
    expect(oculta.emitter.tipPhase).toBe('pending');
  });

  it('LIMITACIÓN (bajo): dos cajas VISIBLES (dos monitores) en fase pendiente: las dos creen que la pantalla espera su propina, aunque solo sigue a una', async () => {
    const a = cajaReal(INSTANCE_A, { visible: () => true, sessionOpen: true });
    const b = cajaReal(INSTANCE_B, { visible: () => true, sessionOpen: true });
    for (const c of [a, b]) {
      c.emitter.setActiveCart(cart());
      c.emitter.setTipBase(20250);
      c.emitter.setPayment(cashPayment());
    }
    await flush(4);
    const pantalla = pantallaReal(true, 40);
    await waitFor(() => pantalla.receiver.activeInstanceId !== null && pantalla.snap().state?.mode === 'tip');
    await waitFor(() => a.emitter.lastDisplayCapabilities !== null && b.emitter.lastDisplayCapabilities !== null, 2000);
    const seguida = pantalla.receiver.activeInstanceId;
    const noSeguida = seguida === INSTANCE_A ? b : a;
    // El emisor no sabe si la pantalla lo sigue: el aviso «esperando la propina…» sale en las dos.
    const aviso = resolveTipWaitingNotice({
      phase: noSeguida.emitter.tipPhase,
      displayMode: noSeguida.emitter.getState().mode,
      connected: noSeguida.emitter.lastDisplaySeenAt !== null,
      touch: resolveNoticeTouch(noSeguida.emitter.lastDisplayCapabilities, 'auto'),
    });
    expect(aviso?.kind).toBe('waiting');
  });

  it('tres hellos en la ventana de elección (oculta seq alto, visible seq bajo, oculta seq más alto): la visible se queda', () => {
    const now = { t: 1000 };
    const receiver = track(new BroadcastChannelReceiver({ terminalId: TERMINAL, now: () => now.t, staleAfterMs: 0 }));
    const hello = (instanceId: string, seq: number, visible: boolean) => ({
      v: PROTOCOL_VERSION,
      t: 'hello' as const,
      seq,
      terminalId: TERMINAL,
      instanceId,
      organizationId: 120,
      cashier: null,
      sessionOpen: true,
      visible,
    });
    receiver.send({ t: 'need_snapshot', capabilities: { touch: true, width: 1, height: 1 } }); // abre la ventana
    const feed = (msg: unknown) => (receiver as unknown as { receive(data: unknown): void }).receive(msg);
    feed(hello(INSTANCE_A, 90, false));
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
    feed(hello(INSTANCE_B, 2, true));
    expect(receiver.activeInstanceId).toBe(INSTANCE_B);
    feed(hello('33333333-3333-4333-8333-333333333333', 100, false));
    expect(receiver.activeInstanceId).toBe(INSTANCE_B);
    // Fuera de la ventana vuelve «gana la última que saluda»… salvo que la que
    // saluda sea OCULTA y la activa se adoptara VISIBLE (ronda 5, F2B-R4-1).
    now.t += 10_000;
    feed(hello(INSTANCE_A, 91, false));
    expect(receiver.activeInstanceId).toBe(INSTANCE_B);
    // Otra visible sí releva fuera de la ventana (la última que saluda entre visibles).
    feed(hello(INSTANCE_A, 92, true));
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
    // Y con la activa OCULTA, cualquier hello (oculto incluido) releva como antes.
    feed(hello(INSTANCE_B, 3, false));
    expect(receiver.activeInstanceId).toBe(INSTANCE_A); // B es visible:false frente a A visible:true: no releva
    feed(hello('33333333-3333-4333-8333-333333333333', 101, false));
    expect(receiver.activeInstanceId).toBe(INSTANCE_A);
    feed(hello(INSTANCE_B, 4, true)); // B vuelve a verse: releva
    expect(receiver.activeInstanceId).toBe(INSTANCE_B);
  });

  it('isBetterHello: dos visibles (o dos ocultas) se deciden por sessionOpen y seq; visible:false nunca releva a visible:true', () => {
    expect(isBetterHello({ sessionOpen: false, seq: 99, visible: true }, { sessionOpen: true, seq: 1, visible: true })).toBe(false);
    expect(isBetterHello({ sessionOpen: true, seq: 2, visible: false }, { sessionOpen: true, seq: 1, visible: false })).toBe(true);
    expect(isBetterHello({ sessionOpen: true, seq: 999, visible: false }, { sessionOpen: false, seq: 0, visible: true })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// E. onDisplayCapabilitiesChange reentrante
// ---------------------------------------------------------------------------

describe('E. onDisplayCapabilitiesChange · reentrancia', () => {
  it('un oyente que llama a stop() dentro del aviso: no lanza, el aviso final es null y no se repite', () => {
    const h = enTip();
    const seen: Array<DisplayCapabilities | null> = [];
    h.emitter.onDisplayCapabilitiesChange((caps) => {
      seen.push(caps);
      if (caps?.touch === true) h.emitter.stop();
    });
    expect(() => h.transport.emitUp(alive(true))).not.toThrow();
    expect(h.emitter.isEmitting).toBe(false);
    expect(seen.map((c) => (c === null ? null : c.touch))).toEqual([true, null]);
    // Sin transporte, otro alive rezagado ya no llega al emisor: nada nuevo.
    h.transport.emitUp(alive(true));
    expect(seen).toHaveLength(2);
  });

  it('un oyente que se da de baja dentro del aviso no rompe a los demás', () => {
    const h = enTip();
    const seen: string[] = [];
    const off = h.emitter.onDisplayCapabilitiesChange(() => {
      seen.push('a');
      off();
    });
    h.emitter.onDisplayCapabilitiesChange(() => seen.push('b'));
    h.transport.emitUp(alive(false));
    h.transport.emitUp(alive(true));
    expect(seen).toEqual(['a', 'b', 'b']);
  });
});

// ---------------------------------------------------------------------------
// F. QR vencido durante la pregunta
// ---------------------------------------------------------------------------

describe('F. QR vencido durante la pregunta de propina', () => {
  it('el vencimiento se impone (payment con expiresAt), un tip_selected tardío se acepta y al cancelar el QR se pinta cobro, no la pregunta', () => {
    const h = enTip();
    h.emitter.setPayment(qrPayment('data:image/png;base64,AAAA', 5_000)); // código vivo
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.emitter.tipPhase).toBe('pending');
    h.emitter.setPayment(qrPayment(null, 5_000)); // vencido: resolveDisplayQr deja qr null y conserva expiresAt
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    const seen: TipSelection[] = [];
    h.emitter.onTipSelected((s) => seen.push(s));
    h.transport.emitUp(tipSelected('percent', 10));
    expect(seen).toHaveLength(1);
    expect(h.emitter.tipPhase).toBe('done');
    h.emitter.setPayment(cashPayment()); // el cajero cierra el QR y vuelve a efectivo
    h.flush();
    expect(h.transport.lastState.mode).toBe('payment');
    expect(h.transport.modes.filter((m) => m === 'tip')).toHaveLength(1);
  });

  it('QR sin código ni vencimiento (interruptor «Mostrar en pantalla» apagado) NO tapa la pregunta', () => {
    const h = enTip();
    h.emitter.setPayment(qrPayment(null, null));
    h.flush();
    expect(h.transport.lastState.mode).toBe('tip');
  });
});

// ---------------------------------------------------------------------------
// G. followTipOnPrefilledPayment (lógica pura sobre applyTipToPrefilledPayment)
// ---------------------------------------------------------------------------

describe('G. la entrada pre-rellenada y la propina', () => {
  const follow = (payments: Array<{ id: string; amount: number }>, touched: Set<string>, base: number, tip: number, shipping: number) =>
    applyTipToPrefilledPayment(payments, touched, base + tip + shipping);

  it('con domicilio: la entrada sigue a base + propina + domicilio, y al quitar la propina vuelve a base + domicilio', () => {
    let payments = [{ id: 'p1', amount: 25_000 + 3_000 }];
    payments = follow(payments, new Set(), 25_000, 2_500, 3_000);
    expect(payments[0].amount).toBe(30_500);
    payments = follow(payments, new Set(), 25_000, 0, 3_000);
    expect(payments[0].amount).toBe(28_000);
  });

  it('entrada QR cobrada (tocada): ni «Aplicar» ni deseleccionar el porcentaje la mueven', () => {
    const touched = new Set(['qr']);
    const qr = [{ id: 'qr', amount: 25_000 }];
    expect(follow(qr, touched, 25_000, 2_500, 0)).toBe(qr);
    expect(follow(qr, touched, 25_000, 0, 0)).toBe(qr);
  });

  it('propina 0 sobre una entrada con importe 0 (venta de cortesía) no la toca; propina > 0 sí la fija', () => {
    const zero = [{ id: 'p1', amount: 0 }];
    expect(follow(zero, new Set(), 0, 0, 0)).toBe(zero);
    expect(follow(zero, new Set(), 0, 500, 0)[0].amount).toBe(500);
  });
});
