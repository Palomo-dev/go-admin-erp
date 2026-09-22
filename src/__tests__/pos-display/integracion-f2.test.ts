/**
 * Tester de INTEGRACIÓN · Fase 2 del POS de doble pantalla (terminal,
 * ajustes, propina y QR). Las tres partes (A ajustes + emisor, B propina,
 * C cobro·QR) pasaron QA por separado; aquí se prueban JUNTAS en Node, con
 * el BroadcastChannel real y el mismo camino de código que la caja:
 *
 *   saveCustomerDisplaySettings (settings.ts, upsert real sobre Supabase
 *   doble) → primeCustomerDisplaySettings → applyPosDisplaySettings
 *   (posDisplay.ts) → DisplayEmitter.refresh → announce(hello.settings)
 *   → BroadcastChannelTransport → BroadcastChannelReceiver → startDisplayLink
 *   → resolveTouch / resolveView (logic.ts)
 *
 *   CheckoutDialog (reproducido tal cual: setTipBase + setPayment(toDisplayPayment))
 *   → mode 'tip' solo si tips.enabled → tip_selected desde la pantalla →
 *   onTipSelected (caja decide, nada se aplica solo) → payment QR con imagen
 *   (resolveDisplayQr) → qr_paid_claim (solo avisa) → onPaid: skipTip →
 *   setMode('thanks') → Reposo a los 8 s.
 *
 * Dobles: solo Supabase (`@/lib/supabase/config`, con una fila de
 * `organization_settings` en memoria que los upserts sí escriben), la
 * organización activa y el motor de promociones. `window` y `localStorage`
 * se simulan en memoria (posDisplay.ts y posService.ts los exigen).
 *
 * Lo que NO se puede probar en Node y se comprueba por CONTRATO ESTÁTICO
 * (lectura del fuente): CheckoutDialog.tsx (React) — que «Aplicar» fija
 * `tipAmount = selection.amount` y que `tip_amount` viaja al checkout —, y
 * posService.checkout — que inserta en `tips` con `sale_id` y `amount`.
 * Ver el bloque «Contratos estáticos».
 */

import type { Cart, Product } from '@/components/pos/types';

// ---------------------------------------------------------------------------
// Dobles
// ---------------------------------------------------------------------------

interface UpsertCall {
  table: string;
  payload: Record<string, unknown>;
  options: Record<string, unknown> | undefined;
}

/** Estado que controla lo que «responde» Supabase. `settingsRow` es la fila `pos_customer_display` en memoria. */
const db: {
  settingsRow: Record<string, unknown> | null;
  price: string;
  settingsReads: number;
  upserts: UpsertCall[];
} = {
  settingsRow: null,
  price: '9000',
  settingsReads: 0,
  upserts: [],
};

jest.mock('@/lib/supabase/config', () => {
  const makeChain = (table: string) => {
    let op: 'select' | 'upsert' = 'select';
    const respond = () => {
      if (table === 'organization_settings') {
        if (op === 'upsert') return { data: null, error: null };
        db.settingsReads += 1;
        return { data: db.settingsRow === null ? null : { settings: db.settingsRow }, error: null };
      }
      if (table === 'product_prices') return { data: { price: db.price }, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) {
      chain[m] = () => chain;
    }
    chain.upsert = (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
      op = 'upsert';
      db.upserts.push({ table, payload, options });
      if (table === 'organization_settings' && payload && typeof payload.settings === 'object' && payload.settings !== null) {
        db.settingsRow = payload.settings as Record<string, unknown>;
      }
      return chain;
    };
    chain.maybeSingle = () => Promise.resolve(respond());
    chain.single = () => Promise.resolve(respond());
    chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      Promise.resolve(respond()).then(onFulfilled, onRejected);
    return chain;
  };
  return { supabase: { from: (table: string) => makeChain(table) } };
});

jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
  getCurrentBranchIdWithFallback: () => 7,
  getCurrentUserId: () => 'user-1',
}));

jest.mock('@/lib/services/promotionEngine', () => ({
  promotionEngine: {
    evaluate: async () => ({ discountTotal: 0, itemDiscounts: {}, applied: [] }),
  },
}));

// ---------------------------------------------------------------------------
// Entorno de navegador mínimo (window + localStorage en memoria)
// ---------------------------------------------------------------------------

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
}

const storage = new MemoryStorage();
const g = globalThis as unknown as Record<string, unknown>;
g.window = globalThis;
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
if (typeof g.addEventListener !== 'function') {
  g.addEventListener = () => undefined;
  g.removeEventListener = () => undefined;
}

// Se importan DESPUÉS de los dobles.
import { POSService } from '@/lib/services/posService';
import { applyPosDisplaySettings, getPosDisplayEmitter, refreshPosDisplay, startPosDisplay, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import {
  clearCustomerDisplaySettingsCache,
  getCachedCustomerDisplaySettings,
  saveCustomerDisplaySettings,
  toDisplayPresentationSettings,
  type CustomerDisplaySettings,
} from '@/lib/pos/display/settings';
import { readLocalTerminalId, setLocalTerminalId } from '@/lib/pos/display/terminal';
import { BroadcastChannelReceiver } from '@/lib/pos/display/transport';
import { resolveDisplayQr, toDisplayPayment } from '@/lib/pos/display/payment';
import { computeTipAmount, type TipSelection } from '@/lib/pos/display/tip';
import { THANKS_DURATION_MS, type TipPhase } from '@/lib/pos/display/emitter';
import type { DisplayCapabilities, DisplayState, DownMessage, UpMessage } from '@/lib/pos/display/protocol';
import { startDisplayLink, type DisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import { resolveQrPresentation, resolveTouch, resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';
import { applyTipToPrefilledPayment, describeTipSelection, resolveNoticeTouch, resolveTipWaitingNotice } from '@/components/pos/display/tipNotice';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const ORG = 120;
const BRANCH = 7;

/** Deja correr el bucle de eventos (entrega de BroadcastChannel + setTimeout(0) del emisor). */
async function drain(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

async function drainImmediates(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function waitFor(pred: () => boolean, timeoutMs = 2000, label = 'condición'): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Tiempo agotado esperando: ${label}`);
    await drain(1);
  }
}

function product(id: number, name: string): Product {
  return {
    id,
    organization_id: ORG,
    sku: `SKU-${id}`,
    name,
    unit_code: 'UN',
    status: 'active',
    created_at: '2026-09-16T00:00:00.000Z',
    updated_at: '2026-09-16T00:00:00.000Z',
  };
}

function readCarts(): Cart[] {
  return JSON.parse(storage.getItem(`pos_carts_${ORG}`) ?? '[]') as Cart[];
}

/** Lado pantalla: receptor real + enlace real (displayLink.ts), con la detección táctil configurable. */
interface DisplaySide {
  receiver: BroadcastChannelReceiver;
  link: DisplayLink;
  accepted: DownMessage[];
  snapshots: DisplayLinkSnapshot[];
  /** Detección cruda (`navigator.maxTouchPoints > 0`); se puede cambiar entre pasos. */
  caps: DisplayCapabilities;
  stateMessages: () => Extract<DownMessage, { t: 'state' }>[];
  hellos: () => Extract<DownMessage, { t: 'hello' }>[];
  byes: () => Extract<DownMessage, { t: 'bye' }>[];
  lastState: () => DisplayState | null;
  /** Táctil RESUELTO como lo calcula CustomerDisplay.tsx (detección + hello.settings.touch). */
  touch: () => boolean;
  /** Vista como la resuelve CustomerDisplay.tsx (con `touch`). */
  view: () => ReturnType<typeof resolveView>;
  close: () => void;
}

function openDisplay(terminalId: string, opts: { touchDetected?: boolean } = {}): DisplaySide {
  const receiver = new BroadcastChannelReceiver({ terminalId });
  const accepted: DownMessage[] = [];
  const snapshots: DisplayLinkSnapshot[] = [];
  const caps: DisplayCapabilities = { touch: opts.touchDetected === true, width: 1366, height: 768 };
  receiver.onDown((m) => accepted.push(m));
  const link = startDisplayLink({
    receiver,
    capabilities: () => caps,
    onChange: (s) => snapshots.push(s),
  });
  const touch = () => resolveTouch(caps.touch, link.snapshot.hello?.settings?.touch);
  const side: DisplaySide = {
    receiver,
    link,
    accepted,
    snapshots,
    caps,
    stateMessages: () => accepted.filter((m): m is Extract<DownMessage, { t: 'state' }> => m.t === 'state'),
    hellos: () => accepted.filter((m): m is Extract<DownMessage, { t: 'hello' }> => m.t === 'hello'),
    byes: () => accepted.filter((m): m is Extract<DownMessage, { t: 'bye' }> => m.t === 'bye'),
    lastState: () => link.snapshot.state,
    touch,
    view: () =>
      resolveView({
        connected: link.snapshot.connected,
        disconnectedTooLong: link.snapshot.disconnectedTooLong,
        updateRequired: link.snapshot.updateRequired,
        touch: touch(),
        state: link.snapshot.state,
      }),
    close: () => link.stop(),
  };
  openDisplays.push(side);
  return side;
}

/** Arranque de la caja como lo hace /app/pos/page.tsx. La fila de ajustes ya debe estar en `db.settingsRow`. */
async function bootCashier(): Promise<string> {
  await startPosDisplay({ organizationId: ORG, currency: 'COP', cashier: { name: 'Andrea' }, sessionOpen: true });
  const terminalId = readLocalTerminalId(storage);
  if (!terminalId) throw new Error('startPosDisplay no creó pos_terminal_id');
  return terminalId;
}

/** Carrito activo con dos líneas (2 × 9.000 + 1 × 9.000 = 27.000). */
async function cartWithLines(): Promise<Cart> {
  const cart = await POSService.createCart(BRANCH);
  getPosDisplayEmitter().setActiveCart(cart);
  await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 2);
  await POSService.addItemToCart(cart.id, product(2, 'Croissant de jamón'), 1);
  await drain();
  return readCarts().find((c) => c.id === cart.id)!;
}

/**
 * La tarjeta guarda (AjustesPantallaSection.handleSave →
 * ConfiguracionService.saveCustomerDisplayConfig → saveCustomerDisplaySettings)
 * y después aplica en ESTA ventana (applyPosDisplaySettings). La marca de
 * `storage` para otras ventanas no aplica aquí (una sola ventana).
 */
async function cardSaves(patch: Partial<CustomerDisplaySettings>): Promise<CustomerDisplaySettings> {
  const saved = await saveCustomerDisplaySettings(ORG, patch);
  applyPosDisplaySettings();
  return saved;
}

/** Lo que hace CheckoutDialog al abrirse con un método (efecto [open, payments…] + efecto [baseTotal]). */
function checkoutOpens(input: { methodCode: string; methodName: string | null; total: number; baseTotal?: number }) {
  getPosDisplayEmitter().setTipBase(input.baseTotal ?? input.total);
  getPosDisplayEmitter().setPayment(toDisplayPayment({ methodCode: input.methodCode, methodName: input.methodName, total: input.total }));
}

type RemoveCart = (id: string) => Promise<void>;
const removeCartViaService = (id: string) => (POSService as unknown as { removeCart: RemoveCart }).removeCart.call(POSService, id);

const TIPS_ON: CustomerDisplaySettings['tips'] = { enabled: true, presets: [5, 10, 15], allowCustom: true };

const openDisplays: DisplaySide[] = [];
const subscriptions: Array<() => void> = [];

beforeEach(() => {
  jest.useRealTimers();
  storage.clear();
  clearCustomerDisplaySettingsCache();
  db.settingsRow = { enabled: true };
  db.settingsReads = 0;
  db.upserts = [];
  stopPosDisplay();
  getPosDisplayEmitter().setActiveCart(null);
  jest.spyOn(console, 'log').mockImplementation(() => undefined); // posService es muy hablador
});

afterEach(async () => {
  jest.useRealTimers();
  for (const off of subscriptions.splice(0)) off();
  for (const d of openDisplays.splice(0)) d.close();
  stopPosDisplay();
  await drain(2);
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1 · Ajustes guardados → el emisor los aplica sin recargar la pantalla
// ---------------------------------------------------------------------------

describe('1 · ajustes guardados en la tarjeta → hello.settings nuevo sin recargar', () => {
  it('el primer hello lleva los valores por defecto de PLAN §5.2 (propina y calificación apagadas, touch auto)', async () => {
    const terminalId = await bootCashier();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');

    const hello = display.hellos()[0];
    expect(hello.settings).toEqual({
      tips: { enabled: false, presets: [5, 10, 15], allowCustom: true },
      rating: { enabled: false },
      showTaxBreakdown: false,
      showCustomerName: false,
      locale: null,
      touch: 'auto',
      // F4: el reposo viaja en el saludo (la pantalla local no tiene otra
      // fuente de ajustes); por defecto, la marca de siempre a los 90 s.
      idle: { mode: 'brand', mediaUrls: [], idleAfterSeconds: 90 },
    });
    // `enabled` (interruptor maestro) nunca viaja (PLAN §8).
    expect(hello.settings).not.toHaveProperty('enabled');
    expect(display.link.snapshot.hello?.settings).toEqual(hello.settings);
  });

  it('guardar propina + touch → upsert real, caché fijada, resaludo por la MISMA instancia (sin bye) y la pantalla lo aplica', async () => {
    const terminalId = await bootCashier();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const hellosBefore = display.hellos().length;
    const statesBefore = display.stateMessages().length;
    const instanceBefore = display.receiver.activeInstanceId;
    const readsBefore = db.settingsReads;

    const saved = await cardSaves({ tips: TIPS_ON, touch: 'touch', showTaxBreakdown: true });

    // El upsert es el de organization_settings con la clave y el onConflict de PLAN §5.2.
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toMatchObject({
      table: 'organization_settings',
      payload: { organization_id: ORG, key: 'pos_customer_display' },
      options: { onConflict: 'organization_id,key' },
    });
    expect((db.upserts[0].payload.settings as Record<string, unknown>).enabled).toBe(true); // el interruptor no se pierde
    expect(saved.tips).toEqual(TIPS_ON);
    // La ventana que guarda NO relee: la caché queda fijada con lo escrito (settings.ts).
    expect(db.settingsReads).toBe(readsBefore + 1); // solo la lectura previa al merge
    expect(getCachedCustomerDisplaySettings(ORG).tips.enabled).toBe(true);

    // La caja resaluda con hello + state en la misma instancia; la pantalla no pasa por Conectando.
    await waitFor(() => display.hellos().length >= hellosBefore + 1, 2000, 'resaludo');
    await drain(2);
    expect(display.byes()).toHaveLength(0);
    expect(display.receiver.activeInstanceId).toBe(instanceBefore);
    expect(display.link.snapshot.connected).toBe(true);
    expect(display.stateMessages().length).toBe(statesBefore + 1); // announce = hello + state
    const hello = display.hellos()[display.hellos().length - 1];
    expect(hello.settings).toEqual(toDisplayPresentationSettings(saved));
    expect(hello.settings?.tips).toEqual(TIPS_ON);
    expect(hello.settings?.touch).toBe('touch');
    expect(hello.settings?.showTaxBreakdown).toBe(true);
    expect(display.link.snapshot.hello?.settings).toEqual(hello.settings);
    // Y el emisor expone la misma caché a la UI de la caja (TipFromDisplayNotice).
    expect(getPosDisplayEmitter().presentationSettings).toEqual(hello.settings);
  });

  it('apagar el interruptor desde la tarjeta cierra el transporte (bye) y volver a encenderlo resaluda con los ajustes vigentes', async () => {
    const terminalId = await bootCashier();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');

    await cardSaves({ enabled: false });
    await waitFor(() => display.byes().length >= 1, 2000, 'bye');
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
    expect(display.view()).toBe('connecting');

    await cardSaves({ enabled: true, tips: TIPS_ON });
    await waitFor(() => display.link.snapshot.connected && display.link.snapshot.hello?.settings?.tips.enabled === true, 3000, 'reencendido');
    expect(getPosDisplayEmitter().isEmitting).toBe(true);
    expect(display.view()).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// 2 · La propina aparece SOLO si tips.enabled
// ---------------------------------------------------------------------------

describe('2 · el estado Propina solo entra con tips.enabled', () => {
  it('propina apagada: abrir el cobro proyecta «Cobro» directamente y la fase no se abre', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    const display = openDisplay(terminalId);
    await waitFor(() => display.view() === 'order', 2000, 'pedido');

    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
    await waitFor(() => display.view() === 'payment_cash', 2000, 'cobro');
    expect(getPosDisplayEmitter().tipPhase).toBeNull();
    const state = display.lastState()!;
    expect(state.mode).toBe('payment');
    expect(state.tip).toBeNull();
    expect(state.cart?.id).toBe(cart.id);
    expect(resolveTipWaitingNotice({ phase: null, displayMode: 'payment', connected: true, touch: false })).toBeNull();
  });

  it('propina encendida (guardada en caliente): el MISMO cobro proyecta «Propina» con presets, Otro y la base del modal', async () => {
    const terminalId = await bootCashier();
    await cartWithLines();
    const display = openDisplay(terminalId);
    await waitFor(() => display.view() === 'order', 2000, 'pedido');

    await cardSaves({ tips: { enabled: true, presets: [10, 5, 20], allowCustom: false } });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true, 2000, 'ajustes aplicados');

    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000, baseTotal: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    expect(getPosDisplayEmitter().tipPhase).toBe('pending');
    const state = display.lastState()!;
    expect(state.mode).toBe('tip');
    // Presets ordenados por settings.ts (5/10/20), allowCustom respetado, base = la del modal.
    expect(state.tip).toEqual({ presets: [5, 10, 20], allowCustom: false, selected: null, base: 27000 });
    expect(state.payment).toMatchObject({ method: 'cash', total: 27000 });
    expect(state.cart?.lines).toHaveLength(2);
  });

  it('un cambio de ajustes a mitad de cobro NO cambia la pregunta que el cliente ya ve (presets congelados al entrar)', async () => {
    const terminalId = await bootCashier();
    await cartWithLines();
    const display = openDisplay(terminalId);
    await waitFor(() => display.view() === 'order', 2000, 'pedido');
    await cardSaves({ tips: TIPS_ON });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true, 2000, 'ajustes');
    checkoutOpens({ methodCode: 'card', methodName: 'Tarjeta', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');

    const n = display.stateMessages().length;
    await cardSaves({ tips: { enabled: true, presets: [1, 2, 3], allowCustom: false } });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'resaludo con state');
    expect(display.lastState()?.mode).toBe('tip');
    expect(display.lastState()?.tip?.presets).toEqual([5, 10, 15]); // los de la fase, no los nuevos
    expect(display.link.snapshot.hello?.settings?.tips.presets).toEqual([1, 2, 3]); // pero el hello sí lleva los nuevos
  });
});

// ---------------------------------------------------------------------------
// 3 · tip_selected desde la pantalla → confirmación en caja (nada se aplica solo)
// ---------------------------------------------------------------------------

describe('3 · tip_selected → onTipSelected en la caja → Aplicar (la caja decide)', () => {
  it('pantalla táctil: el cliente elige 10 % → la caja recibe 2.700, la fase se cierra, la pantalla pasa a Cobro y el total NO cambia solo', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: TIPS_ON });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');

    const emitter = getPosDisplayEmitter();
    const selections: TipSelection[] = [];
    const phases: TipPhase[] = [];
    subscriptions.push(emitter.onTipSelected((s) => selections.push(s)));
    subscriptions.push(emitter.onTipPhaseChange((p) => phases.push(p)));

    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000, baseTotal: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    expect(display.touch()).toBe(true);
    // La caja sabe que la pantalla es táctil (need_snapshot/display_alive) y muestra «esperando la propina…».
    await waitFor(() => emitter.lastDisplayCapabilities?.touch === true, 2000, 'capabilities táctil');
    expect(
      resolveTipWaitingNotice({
        phase: emitter.tipPhase,
        displayMode: emitter.getState().mode,
        connected: true,
        touch: resolveNoticeTouch(emitter.lastDisplayCapabilities, emitter.presentationSettings?.touch),
        presetsCount: emitter.getState().tip?.presets.length,
      }),
    ).toMatchObject({ kind: 'waiting' });

    // El cliente pulsa «10 %» (CustomerDisplay.onTipSelect → link.send).
    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'percent', value: 10 });
    await waitFor(() => selections.length === 1, 2000, 'onTipSelected');
    const selection = selections[0];
    expect(selection).toEqual({ cartId: cart.id, kind: 'percent', value: 10, amount: computeTipAmount(27000, 10), percent: 10 });
    expect(selection.amount).toBe(2700);
    expect(Object.isFrozen(selection)).toBe(true);
    expect(emitter.tipSelection).toBe(selection);
    expect(emitter.tipPhase).toBe('done');
    expect(phases).toEqual(['pending', 'done']);

    // La pantalla pasa a Cobro; el total proyectado sigue siendo 27.000: nada se aplicó solo.
    await waitFor(() => display.view() === 'payment_cash', 2000, 'cobro tras la elección');
    expect(display.lastState()?.payment).toMatchObject({ method: 'cash', total: 27000 });
    expect(display.lastState()?.tip).toBeNull();

    // La caja: aviso «Cliente eligió 10 % ($2.700)» con Aplicar / Cambiar.
    expect(describeTipSelection(selection, 'COP')).toMatch(/^Cliente eligió 10 % \(/);
    // «Aplicar» (CheckoutDialog.onApply): tipAmount = selection.amount y la entrada
    // pre-rellenada sigue al total nuevo; el efecto de cobro reproyecta.
    const payments = applyTipToPrefilledPayment([{ id: 'p1', amount: 27000 }], new Set(), 27000 + selection.amount);
    expect(payments).toEqual([{ id: 'p1', amount: 29700 }]);
    emitter.setPayment(toDisplayPayment({ methodCode: 'cash', methodName: 'Efectivo', total: 29700 }));
    await waitFor(() => display.lastState()?.payment?.total === 29700, 2000, 'total con propina');
    expect(display.view()).toBe('payment_cash');
    expect(emitter.tipPhase).toBe('done'); // no se vuelve a preguntar
  });

  it('una elección que no se ofreció (importe libre con allowCustom=false, porcentaje fuera de presets) se descarta sin cerrar la fase', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: { enabled: true, presets: [5, 10, 15], allowCustom: false } });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();
    const selections: TipSelection[] = [];
    subscriptions.push(emitter.onTipSelected((s) => selections.push(s)));
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');

    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'amount', value: 5000 });
    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'percent', value: 20 });
    display.link.send({ t: 'tip_selected', cartId: 'otro-carrito', kind: 'percent', value: 10 });
    await drain(4);
    expect(selections).toHaveLength(0);
    expect(emitter.tipPhase).toBe('pending');
    expect(display.view()).toBe('tip');

    // «Sin propina» siempre se ofrece: cierra la fase con importe 0 (solo informa).
    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'none', value: 0 });
    await waitFor(() => selections.length === 1, 2000, 'sin propina');
    expect(selections[0]).toMatchObject({ kind: 'none', amount: 0, percent: null });
    expect(describeTipSelection(selections[0], 'COP')).toBe('Cliente eligió no dejar propina');
    await waitFor(() => display.view() === 'payment_cash', 2000, 'cobro');
  });
});

// ---------------------------------------------------------------------------
// 4 · Táctil vs no táctil con el override de ajustes
// ---------------------------------------------------------------------------

describe('4 · táctil / no táctil: detección + override `touch` de los ajustes, en las DOS puntas', () => {
  it('auto + hardware no táctil: la pregunta se pinta informativa, la caja lo sabe y el cajero la cierra con skipTip', async () => {
    const terminalId = await bootCashier();
    await cartWithLines();
    await cardSaves({ tips: TIPS_ON, touch: 'auto' });
    const display = openDisplay(terminalId, { touchDetected: false });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();
    await waitFor(() => emitter.lastDisplayCapabilities !== null, 2000, 'capabilities');
    expect(emitter.lastDisplayCapabilities?.touch).toBe(false);
    expect(display.touch()).toBe(false);

    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina informativa');
    // Con presets, la pantalla NO táctil sigue mostrando los importes (PLAN §4.4: informativo).
    expect(display.lastState()?.tip?.presets).toEqual([5, 10, 15]);
    const notice = resolveTipWaitingNotice({
      phase: emitter.tipPhase,
      displayMode: emitter.getState().mode,
      connected: true,
      touch: resolveNoticeTouch(emitter.lastDisplayCapabilities, emitter.presentationSettings?.touch),
      presetsCount: emitter.getState().tip?.presets.length,
    });
    expect(notice).toMatchObject({ kind: 'informational', action: 'Continuar' });

    // El cajero registra lo que dijo el cliente y pulsa «Continuar» (skipTip): la pantalla pasa a Cobro.
    emitter.skipTip();
    await waitFor(() => display.view() === 'payment_cash', 2000, 'cobro');
    expect(emitter.tipPhase).toBe('done');
    expect(emitter.tipSelection).toBeNull();
  });

  it('override "touch" con hardware NO táctil: la pantalla declara táctil resuelto (display_alive inmediato) y la caja pasa a «esperando»', async () => {
    const terminalId = await bootCashier();
    await cartWithLines();
    const display = openDisplay(terminalId, { touchDetected: false });
    await waitFor(() => display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();
    const capsSeen: Array<boolean | null> = [];
    subscriptions.push(emitter.onDisplayCapabilitiesChange((c) => capsSeen.push(c?.touch ?? null)));
    await waitFor(() => emitter.lastDisplayCapabilities?.touch === false, 2000, 'detección cruda');

    await cardSaves({ tips: TIPS_ON, touch: 'touch' });
    // La pantalla reemite display_alive con touch:true en cuanto acepta el hello con el forzado.
    await waitFor(() => emitter.lastDisplayCapabilities?.touch === true, 2000, 'táctil forzado declarado');
    expect(display.touch()).toBe(true);
    expect(capsSeen).toContain(true);
    // Y la caja aplica el mismo forzado como respaldo aunque la pantalla declarara la detección cruda.
    expect(resolveNoticeTouch({ touch: false }, emitter.presentationSettings?.touch)).toBe(true);

    checkoutOpens({ methodCode: 'card', methodName: 'Tarjeta', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    expect(
      resolveTipWaitingNotice({
        phase: emitter.tipPhase,
        displayMode: emitter.getState().mode,
        connected: true,
        touch: resolveNoticeTouch(emitter.lastDisplayCapabilities, emitter.presentationSettings?.touch),
        presetsCount: 3,
      }),
    ).toMatchObject({ kind: 'waiting', action: 'Omitir' });
  });

  it('override "no-touch" con hardware táctil: la pantalla declara NO táctil y la caja pasa a «registre lo que indique el cliente»', async () => {
    const terminalId = await bootCashier();
    await cartWithLines();
    await cardSaves({ tips: TIPS_ON, touch: 'no-touch' });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.touch === 'no-touch' && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();
    await waitFor(() => emitter.lastDisplayCapabilities?.touch === false, 2000, 'no táctil declarado');
    expect(display.touch()).toBe(false);

    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    expect(
      resolveTipWaitingNotice({
        phase: emitter.tipPhase,
        displayMode: emitter.getState().mode,
        connected: true,
        touch: resolveNoticeTouch(emitter.lastDisplayCapabilities, emitter.presentationSettings?.touch),
        presetsCount: 3,
      }),
    ).toMatchObject({ kind: 'informational' });

    // Volver a "auto" en caliente: la pantalla vuelve a declarar la detección (táctil) y la caja lo sigue.
    await cardSaves({ touch: 'auto' });
    await waitFor(() => emitter.lastDisplayCapabilities?.touch === true, 2000, 'vuelta a auto');
    expect(display.touch()).toBe(true);
    // La fase sigue pendiente: el cliente ahora sí puede pulsar.
    expect(emitter.tipPhase).toBe('pending');
    expect(display.view()).toBe('tip');
  });

  it('«Ya pagué» solo existe en pantalla táctil (contrato de views.tsx) y la pantalla no táctil nunca lo manda; un qr_paid_claim fabricado igual solo avisa', async () => {
    const src = readFileSync(join(process.cwd(), 'src/components/pos-display/views.tsx'), 'utf8');
    expect(src).toMatch(/\{touch && onQrPaidClaim && view\.kind !== 'fallback' &&/);
    const cd = readFileSync(join(process.cwd(), 'src/components/pos-display/CustomerDisplay.tsx'), 'utf8');
    expect(cd).toMatch(/const touch = resolveTouch\(link\.touchDetected, link\.hello\?\.settings\?\.touch\)/);
    expect(cd).toMatch(/touch=\{touch\}\s+onQrPaidClaim=/);
  });
});

// ---------------------------------------------------------------------------
// 5 · Cobro·QR con imagen → qr_paid_claim no cambia nada → onPaid → Gracias
// ---------------------------------------------------------------------------

describe('5 · Cobro·QR con imagen, «Ya pagué» y Gracias', () => {
  const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const EMVCO = '00020101021226580014CO.COM.BREB0136f0d3e1f6-1c2a-4f1b-9c3a-5f5b1e9d2a7c5204000053031705802CO5910COMERCIO X6006BOGOTA62070503***6304ABCD';

  it('el QR ya generado por el POS viaja como imagen a pantalla completa, se impone a la propina pendiente y la pantalla lo pinta', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: TIPS_ON });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();

    // CheckoutDialog: el cobro se abre con el método QR elegido (sin código aún) → Propina.
    checkoutOpens({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    expect(emitter.tipPhase).toBe('pending');

    // El POS genera el QR (create-qr respondió): qrImageUrl + qrData + expires_at, y «Mostrar en pantalla» va marcado.
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const resolved = resolveDisplayQr({ imageUrl: PNG_DATA_URL, data: EMVCO, expiresAt });
    expect(resolved.qr).toEqual({ kind: 'image', value: PNG_DATA_URL }); // imagen embebida gana al texto
    emitter.setPayment(
      toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000, qr: resolved.qr, expiresAt: resolved.expiresAt, amount: 27000 }),
    );
    await waitFor(() => display.view() === 'payment_qr', 2000, 'QR en pantalla');
    const state = display.lastState()!;
    expect(state.mode).toBe('payment');
    expect(state.payment).toEqual({
      method: 'qr',
      total: 27000,
      provider: 'Bre-B',
      qr: { kind: 'image', value: PNG_DATA_URL },
      expiresAt: resolved.expiresAt,
      amount: 27000,
    });
    expect(state.cart?.id).toBe(cart.id);
    // La pantalla lo pinta como imagen, con cuenta atrás y sin red.
    const presentation = resolveQrPresentation(state.payment as Extract<DisplayState['payment'], { method: 'qr' }>, { now: Date.now(), online: false });
    expect(presentation.kind).toBe('image');
    expect(presentation.value).toBe(PNG_DATA_URL);
    expect(presentation.remainingMs).toBeGreaterThan(100_000);
    // La fase de propina NO se cierra: solo queda tapada por el código.
    expect(emitter.tipPhase).toBe('pending');
    expect(state.tip).toBeNull();
    // Y el aviso de la caja no dice «esperando la propina…» sobre un QR (displayMode ≠ tip).
    expect(
      resolveTipWaitingNotice({ phase: emitter.tipPhase, displayMode: emitter.getState().mode, connected: true, touch: true, presetsCount: 3 }),
    ).toBeNull();
  });

  it('qr_paid_claim desde la pantalla: llega a la UI de la caja (onUp) y NO cambia el estado ni emite nada', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: TIPS_ON });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();
    const ups: UpMessage[] = [];
    subscriptions.push(emitter.onUp((m) => ups.push(m)));

    checkoutOpens({ methodCode: 'nequi', methodName: 'Nequi', total: 27000 });
    const resolved = resolveDisplayQr({ imageUrl: PNG_DATA_URL, data: null, expiresAt: Date.now() + 60_000 });
    emitter.setPayment(toDisplayPayment({ methodCode: 'nequi', methodName: 'Nequi', total: 27000, qr: resolved.qr, expiresAt: resolved.expiresAt }));
    await waitFor(() => display.view() === 'payment_qr', 2000, 'QR');
    const stateBefore = JSON.stringify(emitter.getState());
    const emitted = emitter.emittedStateCount;
    const messages = display.stateMessages().length;
    const phase = emitter.tipPhase;

    // El cliente pulsa «Ya pagué» (CustomerDisplay.onQrPaidClaim → link.send).
    display.link.send({ t: 'qr_paid_claim', cartId: cart.id });
    await waitFor(() => ups.length === 1, 2000, 'onUp');
    expect(ups[0]).toMatchObject({ t: 'qr_paid_claim', cartId: cart.id, terminalId, toInstanceId: display.receiver.activeInstanceId });
    await drain(4);
    // Solo avisa (toast en CheckoutDialog): nada cambia en la caja ni en la pantalla.
    expect(JSON.stringify(emitter.getState())).toBe(stateBefore);
    expect(emitter.emittedStateCount).toBe(emitted);
    expect(display.stateMessages().length).toBe(messages);
    expect(emitter.tipPhase).toBe(phase);
    expect(display.view()).toBe('payment_qr');
    // Un qr_paid_claim de OTRO carrito también llega (el filtro por cart.id es de CheckoutDialog).
    display.link.send({ t: 'qr_paid_claim', cartId: 'otro' });
    await waitFor(() => ups.length === 2, 2000, 'segundo onUp');
    expect(JSON.stringify(emitter.getState())).toBe(stateBefore);
  });

  it('onPaid (QrPaymentDialog): skipTip + reproyección sin código → Cobro (nunca vuelve a Propina) → checkout quita el carrito → Gracias → Reposo a los 8 s', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: TIPS_ON });
    const display = openDisplay(terminalId, { touchDetected: false });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();

    checkoutOpens({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    const resolved = resolveDisplayQr({ imageUrl: PNG_DATA_URL, data: EMVCO, expiresAt: Date.now() + 90_000 });
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000, qr: resolved.qr, expiresAt: resolved.expiresAt, amount: 27000 }));
    await waitFor(() => display.view() === 'payment_qr', 2000, 'QR');

    // Webhook/poller: pagado → QrPaymentDialog.onPaid → CheckoutDialog: setShowQrDialog(false) + skipTip().
    emitter.skipTip();
    expect(emitter.tipPhase).toBe('done');
    // El efecto de cobro reproyecta el medio SIN código (showQrDialog=false): Cobro, no Propina.
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000 }));
    await waitFor(() => display.lastState()?.payment?.method === 'qr' && (display.lastState()?.payment as { qr: unknown }).qr === null, 2000, 'cobro sin código');
    expect(display.lastState()?.mode).toBe('payment');
    expect(display.view()).toBe('payment_qr');

    const n = display.stateMessages().length;
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
    const step = async (ms: number) => {
      if (ms === 0) {
        jest.advanceTimersByTime(0);
        await drainImmediates(3);
        return;
      }
      for (let t = 0; t < ms; t += 250) {
        jest.advanceTimersByTime(Math.min(250, ms - t));
        await drainImmediates(3);
      }
    };

    // handleCompleteSale → POSService.checkout (removeCart) → setMode('thanks') en la misma vuelta.
    await removeCartViaService(cart.id);
    emitter.setMode('thanks', { total: 27000 });
    await step(0);
    await drainImmediates(4);
    expect(display.stateMessages().length).toBe(n + 1);
    expect(display.lastState()).toEqual({ mode: 'thanks', cart: null, payment: null, tip: null, thanks: { total: 27000, askRating: false } });
    expect(display.view()).toBe('thanks');
    expect(emitter.tipPhase).toBeNull(); // la venta terminó: la fase y la base se olvidan
    expect(readCarts()).toEqual([]);

    await step(THANKS_DURATION_MS - 500);
    expect(display.view()).toBe('thanks');
    await step(1000);
    expect(display.lastState()).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    expect(display.view()).toBe('idle');
    expect(display.link.snapshot.connected).toBe(true);
    jest.useRealTimers();
  });

  it('el QR VENCIDO se impone igual (qr null + expiresAt) y al retirarlo (interruptor apagado) vuelve la pregunta de propina', async () => {
    const terminalId = await bootCashier();
    await cartWithLines();
    await cardSaves({ tips: TIPS_ON });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();

    checkoutOpens({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    // Código muerto por el proveedor (qrDead): sin código y vencido.
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000, qr: null, expiresAt: 0 }));
    await waitFor(() => display.view() === 'payment_qr', 2000, 'QR vencido');
    const qrState = display.lastState()!.payment as Extract<DisplayState['payment'], { method: 'qr' }>;
    expect(resolveQrPresentation(qrState, { now: Date.now(), online: true })).toMatchObject({ kind: 'fallback', expired: true });
    expect(emitter.tipPhase).toBe('pending');

    // «Mostrar en pantalla» desmarcado / QR retirado sin cobrar: la pregunta vuelve.
    emitter.setPayment(toDisplayPayment({ methodCode: 'breb_qr', methodName: 'Bre-B', total: 27000, qr: null, expiresAt: null }));
    await waitFor(() => display.view() === 'tip', 2000, 'propina de vuelta');
    expect(display.lastState()?.tip?.presets).toEqual([5, 10, 15]);
  });
});

// ---------------------------------------------------------------------------
// 5b · Casos cruzados: otra ventana guarda, pantalla tardía, doble pulsación, cancelar y reabrir
// ---------------------------------------------------------------------------

describe('5b · casos cruzados entre partes', () => {
  it('OTRA ventana guarda (evento storage → refreshPosDisplay): la caja relee la BD y resaluda con los ajustes nuevos', async () => {
    const terminalId = await bootCashier();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const hellos = display.hellos().length;
    const reads = db.settingsReads;

    // La otra ventana escribió la fila (su upsert) y avisó por `storage`; esta caja relee.
    db.settingsRow = { enabled: true, tips: TIPS_ON, touch: 'no-touch' };
    await refreshPosDisplay(ORG);
    expect(db.settingsReads).toBe(reads + 1);
    await waitFor(() => display.hellos().length >= hellos + 1, 2000, 'resaludo');
    expect(display.link.snapshot.hello?.settings?.tips).toEqual(TIPS_ON);
    expect(display.link.snapshot.hello?.settings?.touch).toBe('no-touch');
    expect(display.byes()).toHaveLength(0);
  });

  it('caja en pestaña OCULTA cuando otra ventana guarda: no resaluda (no roba la pantalla), pero la fase de propina ya usa los ajustes nuevos; al volver a verse, reannounce lleva el hello', async () => {
    const terminalId = await bootCashier();
    await cartWithLines();
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.view() === 'order', 2000, 'pedido');
    const hellos = display.hellos().length;

    // La pestaña del POS queda detrás de la de Configuración (document.visibilityState = 'hidden').
    const fakeDocument = { visibilityState: 'hidden' as 'hidden' | 'visible' };
    Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true, writable: true });
    try {
      db.settingsRow = { enabled: true, tips: TIPS_ON };
      await refreshPosDisplay(ORG);
      await drain(4);
      expect(display.hellos().length).toBe(hellos); // ni un hello desde la oculta
      expect(display.link.snapshot.hello?.settings?.tips.enabled).toBe(false);

      // Pero la caja YA pregunta la propina si se abre un cobro (getSettings lee la caché).
      checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
      await waitFor(() => display.view() === 'tip', 2000, 'propina con ajustes nuevos');
      expect(display.lastState()?.tip?.presets).toEqual([5, 10, 15]);

      // El cajero vuelve a la pestaña: visibilitychange → reannounce → hello con los ajustes.
      fakeDocument.visibilityState = 'visible';
      getPosDisplayEmitter().reannounce();
      await waitFor(() => display.hellos().length >= hellos + 1, 2000, 'reannounce');
      expect(display.link.snapshot.hello?.settings?.tips).toEqual(TIPS_ON);
      expect(display.hellos()[display.hellos().length - 1].visible).toBe(true);
    } finally {
      delete (globalThis as { document?: unknown }).document;
    }
  });

  it('pantalla abierta TARDE con la propina ya preguntándose: need_snapshot → hello (con settings) + state mode tip; el táctil se resuelve antes de pintar', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: TIPS_ON, touch: 'touch' });
    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
    await drain();
    expect(getPosDisplayEmitter().tipPhase).toBe('pending');

    const display = openDisplay(terminalId, { touchDetected: false });
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    expect(display.accepted.map((m) => m.t).slice(0, 2)).toEqual(['hello', 'state']);
    expect(display.lastState()?.mode).toBe('tip');
    expect(display.lastState()?.tip).toEqual({ presets: [5, 10, 15], allowCustom: true, selected: null, base: 27000 });
    expect(display.touch()).toBe(true); // forzado por el hello que precede al state
    expect(display.view()).toBe('tip');
    await waitFor(() => getPosDisplayEmitter().lastDisplayCapabilities?.touch === true, 2000, 'caja enterada');
    // Y responde igual que una pantalla que estuvo desde el principio.
    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'percent', value: 15 });
    await waitFor(() => getPosDisplayEmitter().tipPhase === 'done', 2000, 'elección');
    expect(getPosDisplayEmitter().tipSelection?.amount).toBe(4050);
  });

  it('doble pulsación (dos tip_selected seguidos): solo la primera cuenta; la segunda no reabre ni cambia la elección', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: TIPS_ON });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();
    const selections: TipSelection[] = [];
    subscriptions.push(emitter.onTipSelected((s) => selections.push(s)));
    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');

    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'percent', value: 5 });
    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'percent', value: 15 });
    await drain(6);
    expect(selections).toHaveLength(1);
    expect(selections[0]).toMatchObject({ percent: 5, amount: 1350 });
    expect(emitter.tipSelection).toBe(selections[0]);
    expect(display.view()).toBe('payment_cash');
  });

  it('cerrar el cobro sin vender (setMode order) olvida la fase y la base; reabrir vuelve a preguntar con la base nueva', async () => {
    const terminalId = await bootCashier();
    const cart = await cartWithLines();
    await cardSaves({ tips: TIPS_ON });
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
    const emitter = getPosDisplayEmitter();
    const phases: TipPhase[] = [];
    subscriptions.push(emitter.onTipPhaseChange((p) => phases.push(p)));

    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000, baseTotal: 27000 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina');
    display.link.send({ t: 'tip_selected', cartId: cart.id, kind: 'percent', value: 10 });
    await waitFor(() => emitter.tipPhase === 'done', 2000, 'elección');

    // El cajero cierra el modal sin vender (efecto [open] de CheckoutDialog).
    emitter.setMode('order');
    await waitFor(() => display.view() === 'order', 2000, 'pedido de vuelta');
    expect(emitter.tipPhase).toBeNull();
    expect(emitter.tipSelection).toBeNull();

    // Reabre con un descuento aplicado (base distinta): se pregunta de nuevo sobre la base nueva.
    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 24300, baseTotal: 24300 });
    await waitFor(() => display.view() === 'tip', 2000, 'propina de nuevo');
    expect(display.lastState()?.tip?.base).toBe(24300);
    expect(phases).toEqual(['pending', 'done', null, 'pending']);
  });

  it('con propina activada pero SIN líneas (cobro de un carrito vacío) no se pregunta: Cobro directo', async () => {
    const terminalId = await bootCashier();
    await cardSaves({ tips: TIPS_ON });
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    const display = openDisplay(terminalId, { touchDetected: true });
    await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true, 2000, 'ajustes');
    checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 0 });
    await drain(4);
    expect(getPosDisplayEmitter().tipPhase).toBeNull();
    expect(getPosDisplayEmitter().getState().mode).toBe('payment');
    expect(display.view()).toBe('payment_cash');
  });
});

// ---------------------------------------------------------------------------
// 6 · Terminal local: identidad creada al arrancar, estable, la misma en las dos puntas
// ---------------------------------------------------------------------------

describe('6 · terminal local (pos_terminal_id) en las dos puntas', () => {
  it('la caja crea pos_terminal_id al arrancar aunque el interruptor esté apagado y la pantalla usa el mismo id', async () => {
    db.settingsRow = { enabled: false };
    await startPosDisplay({ organizationId: ORG, currency: 'COP' });
    const id = readLocalTerminalId(storage);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
    // Encender desde la tarjeta: el transporte se abre con ESE id y la pantalla que ya escuchaba lo adopta.
    const display = openDisplay(id!);
    await cardSaves({ enabled: true });
    await waitFor(() => display.link.snapshot.connected, 3000, 'conectada');
    expect(display.hellos()[0].terminalId).toBe(id);
    expect(readLocalTerminalId(storage)).toBe(id); // estable: no se regenera al abrir el transporte
  });

  it('HALLAZGO (bajo) · vincular esta caja a una fila de pos_terminals (setLocalTerminalId) con el POS ya emitiendo en OTRA pestaña: la pantalla sigue el id nuevo (storage/sondeo) pero el emisor sigue en el canal viejo hasta reiniciar', async () => {
    const oldId = await bootCashier();
    const displayOld = openDisplay(oldId);
    await waitFor(() => displayOld.link.snapshot.connected, 2000, 'conectada al id local');

    // EstaCajaSection → PosTerminalsService.linkThisTerminal → setLocalTerminalId(fila de pos_terminals).
    const linkedId = '0f0f0f0f-1111-4222-8333-444444444444';
    expect(setLocalTerminalId(linkedId, storage)).toBe(true);
    // useDisplayReceiver relee pos_terminal_id (evento storage + sondeo de 1 s) y reabre el receptor con el id nuevo.
    displayOld.close();
    const displayNew = openDisplay(linkedId);
    await drain(8);
    // El emisor de la pestaña del POS abrió su transporte con el id ANTERIOR y no escucha pos_terminal_id:
    expect(displayNew.link.snapshot.connected).toBe(false);
    expect(displayNew.view()).toBe('connecting');
    expect(getPosDisplayEmitter().isEmitting).toBe(true); // sigue emitiendo… al canal viejo
    // Solo al reiniciar la caja (salir y volver a /app/pos, recarga) se habla por el id vinculado.
    stopPosDisplay();
    await startPosDisplay({ organizationId: ORG, currency: 'COP', cashier: { name: 'Andrea' }, sessionOpen: true });
    await waitFor(() => displayNew.link.snapshot.connected, 3000, 'conectada al id vinculado');
    expect(displayNew.hellos()[0].terminalId).toBe(linkedId);
  });
});

// ---------------------------------------------------------------------------
// 7 · Contratos estáticos (React no se carga en Node): la propina elegida llega a `tips` por el flujo existente
// ---------------------------------------------------------------------------

describe('7 · contratos estáticos: Aplicar → tip_amount → tabla tips; QR → skipTip en onPaid', () => {
  const checkout = readFileSync(join(process.cwd(), 'src/components/pos/CheckoutDialog.tsx'), 'utf8');
  const service = readFileSync(join(process.cwd(), 'src/lib/services/posService.ts'), 'utf8');

  it('CheckoutDialog: «Aplicar» fija tipAmount = selection.amount y tip_amount viaja al checkout', () => {
    expect(checkout).toMatch(/onApply=\{\(selection\) => \{\s*setTipPercentage\(selection\.percent\);\s*setTipAmount\(selection\.amount\);/);
    expect(checkout).toMatch(/tip_amount: tipAmount,/);
    // La misma aritmética que la pantalla (tip.ts): sin fórmula duplicada.
    expect(checkout).toMatch(/const calculatedTip = computeTipAmount\(baseTotal, percentage\);/);
    expect(checkout).not.toMatch(/Math\.round\(baseTotal \* \(percentage \/ 100\)\)/);
  });

  it('posService.checkout inserta en `tips` con sale_id y amount = tip_amount, sin implementación paralela', () => {
    expect(service).toMatch(/checkoutData\.tip_amount && checkoutData\.tip_amount > 0/);
    expect(service).toMatch(/sale_id: saleData\.id,\s*server_id: checkoutData\.tip_server_id \|\| userId,\s*amount: checkoutData\.tip_amount,/);
    expect(service).toMatch(/\.from\('tips'\)\s*\.insert\(tipData\)/);
  });

  it('CheckoutDialog: onPaid del QR cierra la fase de propina (skipTip) y el efecto de cobro pasa la imagen por resolveDisplayQr', () => {
    expect(checkout).toMatch(/onPaid=\{\(\) => \{\s*setShowQrDialog\(false\);\s*toast\.success\('Pago QR confirmado'\);[\s\S]*?getPosDisplayEmitter\(\)\.skipTip\(\);/);
    expect(checkout).toMatch(/resolveDisplayQr\(\{ imageUrl: qrImageUrl, data: qrData, expiresAt: qrExpiresAt \}\)/);
    expect(checkout).toMatch(/getPosDisplayEmitter\(\)\.onUp\(\(msg\) => \{\s*if \(msg\.t !== 'qr_paid_claim' \|\| msg\.cartId !== cart\.id\) return;/);
    expect(checkout).toMatch(/getPosDisplayEmitter\(\)\.setTipBase\(baseTotal\);/);
  });

  it('la tarjeta aplica los ajustes guardados en la caja de esta ventana sin recargar (applyPosDisplaySettings) y avisa a las otras', () => {
    const card = readFileSync(join(process.cwd(), 'src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx'), 'utf8');
    expect(card).toMatch(/const saved = await ConfiguracionService\.saveCustomerDisplayConfig\(toSave\);[\s\S]*?applyPosDisplaySettings\(\);/);
    const svc = readFileSync(join(process.cwd(), 'src/components/pos/configuracion/configuracionService.ts'), 'utf8');
    expect(svc).toMatch(/await saveCustomerDisplaySettings\(getOrganizationId\(\), config\);\s*notifyCustomerDisplaySettingsChanged\(\);/);
  });
});

// Un state saneado por la pantalla es idéntico al emitido: el emisor nunca manda datos incompletos.
it('coherencia: cada state emitido en esta suite pasa sanitizeDisplayState sin cambios', async () => {
  const terminalId = await bootCashier();
  await cartWithLines();
  await cardSaves({ tips: TIPS_ON });
  const display = openDisplay(terminalId, { touchDetected: true });
  await waitFor(() => display.link.snapshot.hello?.settings?.tips.enabled === true && display.view() === 'order', 2000, 'pedido');
  checkoutOpens({ methodCode: 'cash', methodName: 'Efectivo', total: 27000 });
  await waitFor(() => display.view() === 'tip', 2000, 'propina');
  for (const m of display.stateMessages()) {
    expect(sanitizeDisplayState(m.state)).toEqual(m.state);
  }
});
