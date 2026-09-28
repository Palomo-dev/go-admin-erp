/**
 * Tester de INTEGRACIÓN · Fase 0 del POS de doble pantalla.
 *
 * Las cuatro partes (A protocolo/transporte, B emisión desde posService y
 * el cobro, C pantalla /pos-display, D interruptor maestro y presencia) ya
 * pasaron QA por separado. Aquí se prueban JUNTAS, en Node, con el
 * BroadcastChannel real y el mismo camino de código que la caja:
 *
 *   POSService.addItemToCart → saveCartsToStorage → getPosDisplayEmitter()
 *   → DisplayEmitter (posDisplay.ts, cableado real) → BroadcastChannelTransport
 *   → BroadcastChannelReceiver → startDisplayLink (displayLink.ts) → resolveView
 *
 * Dobles: solo Supabase (`@/lib/supabase/config`), la organización activa
 * (`@/lib/hooks/useOrganization`) y el motor de promociones (consulta la BD).
 * `window` y `localStorage` se simulan con un shim en memoria porque
 * posDisplay.ts y posService.ts los exigen para abrir el transporte y
 * guardar el carrito.
 *
 * Lo que aquí se prueba y NO puede probarse en Node: CustomerDisplay.tsx
 * (React), CheckoutDialog.tsx (React). Sus llamadas al emisor
 * (`setPayment(toDisplayPayment(...))`, `setMode('thanks')`) se reproducen
 * tal cual las hace el componente (CheckoutDialog.tsx:223 y :985).
 */

import type { Cart, Product } from '@/components/pos/types';

// ---------------------------------------------------------------------------
// Dobles
// ---------------------------------------------------------------------------

/** Estado que controla lo que «responde» Supabase. */
const db = {
  displayEnabled: false,
  price: '9000',
  /** Cuántas veces se leyó `pos_customer_display`. */
  settingsReads: 0,
};

jest.mock('@/lib/supabase/config', () => {
  const makeChain = (table: string) => {
    const respond = () => {
      if (table === 'organization_settings') {
        db.settingsReads += 1;
        return { data: { settings: { enabled: db.displayEnabled } }, error: null };
      }
      if (table === 'product_prices') return { data: { price: db.price }, error: null };
      return { data: [], error: null };
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'neq', 'gte', 'lte', 'or', 'not']) {
      chain[m] = () => chain;
    }
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

// Se importan DESPUÉS de los dobles (jest.mock se iza; los imports normales no leen window al cargar).
import { POSService } from '@/lib/services/posService';
import {
  applyPosDisplaySettings,
  getPosDisplayEmitter,
  refreshPosDisplay,
  startPosDisplay,
  stopPosDisplay,
} from '@/lib/pos/display/posDisplay';
import { clearCustomerDisplaySettingsCache, primeCustomerDisplaySettings } from '@/lib/pos/display/settings';
import { readLocalTerminalId } from '@/lib/pos/display/terminal';
import { BroadcastChannelReceiver, displayChannelName, HEARTBEAT_INTERVAL_MS, STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { projectCartForDisplay } from '@/lib/pos/display/projection';
import { toDisplayPayment } from '@/lib/pos/display/payment';
import { isDownMessage, type DownMessage } from '@/lib/pos/display/protocol';
import { startDisplayLink, type DisplayLink, type DisplayLinkSnapshot } from '@/components/pos-display/displayLink';
import { resolveView, sanitizeDisplayState } from '@/components/pos-display/logic';
import { readDisplayPresence } from '@/lib/pos/display/presence';
import { getPosDisplayEnvironment } from '@/lib/pos/display/posDisplay';
import { THANKS_DURATION_MS } from '@/lib/pos/display/emitter';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CustomerDisplay.tsx es JSX (no se carga en jest con testEnvironment node):
 * su THANKS_MS se lee del fuente para comprobar que coincide con el plazo del
 * emisor (THANKS_DURATION_MS). Si se desalinean, la pantalla y la caja
 * cerrarían «Gracias» en momentos distintos.
 */
function readCustomerDisplayThanksMs(): number {
  const src = readFileSync(join(process.cwd(), 'src/components/pos-display/CustomerDisplay.tsx'), 'utf8');
  const m = /export const THANKS_MS = ([0-9_]+);/.exec(src);
  if (!m) throw new Error('THANKS_MS no encontrado en CustomerDisplay.tsx');
  return Number(m[1].replace(/_/g, ''));
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const ORG = 120;
const BRANCH = 7;
const CAPS = { touch: false, width: 1366, height: 768 };

/** Deja correr el bucle de eventos (entrega de BroadcastChannel + setTimeout(0) del emisor). */
async function drain(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

/** Solo setImmediate (para cuando setTimeout está falseado). */
async function drainImmediates(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/**
 * Tope del archivo holgado: ningún `waitFor` de aquí mide latencia (para eso
 * está el caso de aceptación de abajo, que mide con `performance.now`), solo
 * acotan un cuelgue. Con ocho workers de jest compitiendo, un tope corto
 * convierte el gate de cierre de fase en una tirada de dados
 * (F3-B ronda 2 · 11).
 */
jest.setTimeout(60_000);

async function waitFor(pred: () => boolean, timeoutMs = 20_000, label = 'condición'): Promise<void> {
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

/** Lado pantalla: receptor real + enlace real (displayLink.ts), más un registro crudo de todo lo aceptado. */
interface DisplaySide {
  receiver: BroadcastChannelReceiver;
  link: DisplayLink;
  accepted: DownMessage[];
  snapshots: DisplayLinkSnapshot[];
  stateMessages: () => Extract<DownMessage, { t: 'state' }>[];
  hellos: () => Extract<DownMessage, { t: 'hello' }>[];
  heartbeats: () => Extract<DownMessage, { t: 'heartbeat' }>[];
  byes: () => Extract<DownMessage, { t: 'bye' }>[];
  view: () => ReturnType<typeof resolveView>;
  close: () => void;
}

function openDisplay(terminalId: string, opts: { staleAfterMs?: number } = {}): DisplaySide {
  const receiver = new BroadcastChannelReceiver({ terminalId, staleAfterMs: opts.staleAfterMs });
  const accepted: DownMessage[] = [];
  const snapshots: DisplayLinkSnapshot[] = [];
  receiver.onDown((m) => accepted.push(m));
  const link = startDisplayLink({
    receiver,
    capabilities: () => CAPS,
    onChange: (s) => snapshots.push(s),
    staleAfterMs: opts.staleAfterMs,
  });
  const side: DisplaySide = {
    receiver,
    link,
    accepted,
    snapshots,
    stateMessages: () => accepted.filter((m): m is Extract<DownMessage, { t: 'state' }> => m.t === 'state'),
    hellos: () => accepted.filter((m): m is Extract<DownMessage, { t: 'hello' }> => m.t === 'hello'),
    heartbeats: () => accepted.filter((m): m is Extract<DownMessage, { t: 'heartbeat' }> => m.t === 'heartbeat'),
    byes: () => accepted.filter((m): m is Extract<DownMessage, { t: 'bye' }> => m.t === 'bye'),
    view: () =>
      resolveView({
        connected: link.snapshot.connected,
        disconnectedTooLong: link.snapshot.disconnectedTooLong,
        updateRequired: link.snapshot.updateRequired,
        state: link.snapshot.state,
      }),
    close: () => link.stop(),
  };
  openDisplays.push(side);
  return side;
}

/** Escucha cruda del canal (sin receptor): para afirmar que NADA se emite con el interruptor apagado. */
function rawListener(terminalId: string): { messages: unknown[]; close: () => void } {
  const ch = new BroadcastChannel(displayChannelName(terminalId));
  const messages: unknown[] = [];
  ch.onmessage = (ev) => messages.push(ev.data);
  (ch as unknown as { unref?: () => void }).unref?.();
  return { messages, close: () => ch.close() };
}

/** Arranque de la caja como lo hace /app/pos/page.tsx (startPosDisplay + setSession + setActiveCart). */
async function bootCashier(enabled: boolean): Promise<string> {
  db.displayEnabled = enabled;
  await startPosDisplay({ organizationId: ORG, currency: 'COP', cashier: { name: 'Andrea' }, sessionOpen: true });
  const terminalId = readLocalTerminalId(storage);
  if (!terminalId) throw new Error('startPosDisplay no creó pos_terminal_id');
  return terminalId;
}

/** Pantallas abiertas en el test en curso: se cierran en afterEach aunque una aserción falle (si no, sus intervalos dejan jest colgado). */
const openDisplays: DisplaySide[] = [];

beforeEach(() => {
  jest.useRealTimers();
  storage.clear();
  clearCustomerDisplaySettingsCache();
  db.displayEnabled = false;
  db.settingsReads = 0;
  stopPosDisplay();
  // El emisor es un singleton por ventana y stop() conserva el carrito a
  // propósito (mismo org → vuelve a arrancar con él). La página real lo
  // vacía en su primer efecto (`setActiveCart(activeCart ?? null)` con
  // carts=[] al montar, page.tsx:497); aquí se hace lo mismo entre pruebas.
  getPosDisplayEmitter().setActiveCart(null);
  jest.spyOn(console, 'log').mockImplementation(() => undefined); // posService es muy hablador
});

afterEach(async () => {
  jest.useRealTimers(); // antes de drenar: drain() usa setTimeout y con reloj falso no volvería
  for (const d of openDisplays.splice(0)) d.close();
  stopPosDisplay();
  await drain(2);
  jest.restoreAllMocks();
});


// ---------------------------------------------------------------------------
// Caso 1 · Extremo a extremo: posService → emisor → canal → receptor → vista
// ---------------------------------------------------------------------------

describe('Caso 1 · extremo a extremo con POSService, transporte y receptor reales', () => {
  it('la pantalla recién abierta pide need_snapshot y recibe hello + state (Reposo) con la marca de la caja', async () => {
    const terminalId = await bootCashier(true);
    expect(getPosDisplayEmitter().isEmitting).toBe(true);

    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'primer state tras need_snapshot');

    // Contrato hello → state: el hello precede al state en el registro de aceptados.
    expect(display.accepted[0].t).toBe('hello');
    expect(display.accepted[1].t).toBe('state');
    expect(display.hellos()[0]).toMatchObject({
      v: 1,
      organizationId: ORG,
      currency: 'COP',
      sessionOpen: true,
      cashier: { name: 'Andrea' },
      terminalId,
    });
    expect(display.stateMessages()[0].state).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    expect(display.link.snapshot.connected).toBe(true);
    expect(display.view()).toBe('idle');
    // La caja ve a la pantalla (need_snapshot cuenta como presencia).
    expect(readDisplayPresence(getPosDisplayEmitter(), Date.now(), STALE_AFTER_MS, getPosDisplayEnvironment())).toMatchObject({
      connected: true,
      emitting: true,
      reason: null,
    });
    display.close();
  });

  it('POSService.createCart + addItemToCart → un `state` con la proyección exacta de projectCartForDisplay', async () => {
    const terminalId = await bootCashier(true);
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot inicial');
    const before = display.stateMessages().length;

    // Camino real de la caja: crear el carrito (posService), la página lo fija como activo.
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await drain();
    // Un carrito vacío sigue siendo Reposo: misma proyección (idle) → no se repite el state.
    expect(display.stateMessages().length).toBe(before);
    expect(display.view()).toBe('idle');

    // Teclear una venta: 2 × Café americano a 9.000 (precio de product_prices).
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 2);
    await waitFor(() => display.stateMessages().length >= before + 1, 2000, 'state del pedido');

    const msg = display.stateMessages()[display.stateMessages().length - 1];
    const saved = readCarts().find((c) => c.id === cart.id)!;
    expect(saved.items).toHaveLength(1);
    const expected = projectCartForDisplay(saved, { currency: 'COP', totals: null, lastChangedLineId: saved.items[0].id });
    expect(msg.state.mode).toBe('order');
    expect(msg.state.cart).toEqual(expected);
    expect(msg.state.cart).toMatchObject({
      id: cart.id,
      currency: 'COP',
      subtotal: 18000,
      total: 18000,
      discountTotal: 0,
      taxTotal: 0,
      lastChangedLineId: saved.items[0].id,
      lines: [{ name: 'Café americano', qty: 2, unitPrice: 9000, total: 18000, modifiers: [], discount: null, note: null }],
    });
    // La pantalla lo acepta tal cual (saneado = idéntico: el emisor ya manda datos completos).
    expect(display.link.snapshot.state).toEqual(sanitizeDisplayState(msg.state));
    expect(display.view()).toBe('order');
    // Reposo → primera línea: resalta (PLAN §4.1).
    expect(display.link.snapshot.highlightUntil).toBeGreaterThan(0);
    display.close();
  });

  it('need_snapshot desde el receptor → la caja responde hello + state COMPLETO (el pedido en curso)', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 2);
    await POSService.addItemToCart(cart.id, product(2, 'Croissant de jamón'), 1);
    await drain();

    // La pantalla se abre TARDE (o se recarga): debe recuperar la venta completa (PLAN §12 aceptación).
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'respuesta al need_snapshot');
    expect(display.accepted.map((m) => m.t).slice(0, 2)).toEqual(['hello', 'state']);
    const state = display.stateMessages()[0].state;
    expect(state.mode).toBe('order');
    expect(state.cart?.lines.map((l) => [l.name, l.qty])).toEqual([
      ['Café americano', 2],
      ['Croissant de jamón', 1],
    ]);
    expect(state.cart?.subtotal).toBe(27000);
    expect(state.cart?.total).toBe(27000);
    // Un snapshot NO es una línea nueva: no resalta (decisión ronda 4 de la Parte C).
    expect(display.link.snapshot.highlightUntil).toBe(0);
    expect(display.view()).toBe('order');

    // Segundo need_snapshot explícito (la pantalla vuelve a preguntar): otra pareja hello+state, mismo contenido.
    const n = display.stateMessages().length;
    display.receiver.send({ t: 'need_snapshot', capabilities: CAPS });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'segundo snapshot');
    expect(display.stateMessages()[n].state).toEqual(state);
    expect(display.hellos().length).toBeGreaterThanOrEqual(2);
    display.close();
  });

  it('heartbeat: la caja late cada 1 s y la pantalla sigue conectada; al cerrar la caja pasa a Conectando en el acto', async () => {
    const terminalId = await bootCashier(true);
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    expect(display.heartbeats().length).toBe(0);

    await waitFor(() => display.heartbeats().length >= 1, HEARTBEAT_INTERVAL_MS + 800, 'primer latido');
    const hb = display.heartbeats()[0];
    expect(typeof hb.at).toBe('number');
    expect(hb.seq).toBeGreaterThan(display.hellos()[0].seq);
    display.link.evaluateHealth();
    expect(display.link.snapshot.connected).toBe(true);
    expect(display.view()).toBe('idle');

    // La caja se cierra (stopPosDisplay → bye): Conectando en el acto, sin esperar los 3 s.
    stopPosDisplay();
    await waitFor(() => display.byes().length >= 1, 1000, 'bye');
    expect(display.link.snapshot.connected).toBe(false);
    expect(display.link.snapshot.state).toBeNull();
    expect(display.view()).toBe('connecting');
    // Y la caja ya no lo ve tampoco (sin transporte → sin presencia).
    expect(readDisplayPresence(getPosDisplayEmitter()).connected).toBe(false);
    display.close();
  }, 8000);

  it('silencio (caja que muere sin bye): la pantalla pasa a Conectando a los 3 s y olvida el pedido', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await drain();
    const display = openDisplay(terminalId);
    await waitFor(() => display.view() === 'order', 2000, 'pedido');

    // Matar la caja sin despedirse: se corta el transporte por debajo (close sin bye).
    const transport = (getPosDisplayEmitter() as unknown as { transport: { close: (sayBye?: boolean) => void } }).transport;
    transport.close(false);

    await waitFor(() => display.link.snapshot.connected === false, STALE_AFTER_MS + 1500, 'Conectando por silencio');
    expect(display.view()).toBe('connecting');
    expect(display.link.snapshot.state).toBeNull();
    expect(display.receiver.lastStaleAt).not.toBeNull();
    display.close();
  }, 8000);
});

// ---------------------------------------------------------------------------
// Caso 2 · Coalescencia real
// ---------------------------------------------------------------------------

describe('Caso 2 · coalescencia: N mutaciones rápidas → un solo state', () => {
  it('teclear cantidad «1» → «12» → «123» y añadir dos productos en la misma vuelta emite UN state final', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await drain();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const before = display.stateMessages().length;
    const emittedBefore = getPosDisplayEmitter().emittedStateCount;

    const itemId = readCarts()[0].items[0].id;
    // Cinco mutaciones encadenadas SIN ceder al bucle de macrotareas: cada
    // await de posService resuelve en microtareas (dobles en memoria), así
    // que todas caen antes del setTimeout(0) del planificador del emisor.
    await POSService.updateCartItemQuantity(cart.id, itemId, 1);
    await POSService.updateCartItemQuantity(cart.id, itemId, 12);
    await POSService.updateCartItemQuantity(cart.id, itemId, 123);
    await POSService.addItemToCart(cart.id, product(2, 'Croissant de jamón'), 1);
    await POSService.addItemToCart(cart.id, product(3, 'Jugo de naranja'), 1);

    // Antes de ceder: nada publicado todavía (todo pendiente en el planificador).
    expect(getPosDisplayEmitter().emittedStateCount).toBe(emittedBefore);
    await drain();
    expect(getPosDisplayEmitter().emittedStateCount).toBe(emittedBefore + 1);
    await waitFor(() => display.stateMessages().length >= before + 1, 2000, 'state coalescido');
    await drain(3);
    expect(display.stateMessages().length).toBe(before + 1);

    const state = display.stateMessages()[before].state;
    expect(state.mode).toBe('order');
    expect(state.cart?.lines.map((l) => [l.name, l.qty])).toEqual([
      ['Café americano', 123],
      ['Croissant de jamón', 1],
      ['Jugo de naranja', 1],
    ]);
    expect(state.cart?.subtotal).toBe(123 * 9000 + 9000 + 9000);
    // Resaltado en un frame coalescido: el emisor compara proyección a
    // proyección en CADA setCart (findChangedLineId) y conserva la última
    // línea única que cambió hasta publicar. Con tres mutaciones de tres
    // líneas distintas en la misma vuelta, viaja la ÚLTIMA (el jugo), no
    // null. Se documenta tal cual: en la caja real cada tecla espera a la
    // red y cae en su propia vuelta, así que el caso es raro.
    const jugo = state.cart?.lines.find((l) => l.name === 'Jugo de naranja');
    expect(state.cart?.lastChangedLineId).toBe(jugo?.id);
    display.close();
  });

  it('la misma proyección informada dos veces (posService y la página) no repite el state', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await drain();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const before = display.stateMessages().length;

    // La página reenvía el carrito que acaba de guardar posService (otro objeto, mismo contenido).
    getPosDisplayEmitter().setActiveCart(readCarts()[0]);
    getPosDisplayEmitter().setActiveCart(JSON.parse(JSON.stringify(readCarts()[0])));
    await drain(4);
    expect(display.stateMessages().length).toBe(before);
    display.close();
  });
});

// ---------------------------------------------------------------------------
// Caso 3 · Interruptor maestro
// ---------------------------------------------------------------------------

describe('Caso 3 · interruptor maestro (pos_customer_display.enabled)', () => {
  it('enabled=false: la caja no abre transporte, nada viaja por el canal aunque el cajero venda', async () => {
    const terminalId = await bootCashier(false);
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
    expect(getPosDisplayEnvironment()).toEqual({ settingsLoaded: true, enabled: false, transportSupported: true });
    expect(readDisplayPresence(getPosDisplayEmitter(), Date.now(), STALE_AFTER_MS, getPosDisplayEnvironment())).toMatchObject({
      emitting: false,
      reason: 'disabled',
      connected: false,
    });

    const raw = rawListener(terminalId);
    const display = openDisplay(terminalId);
    const emittedBefore = getPosDisplayEmitter().emittedStateCount; // el contador es del singleton: cuenta desde el arranque del módulo
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 3);
    await drain(8);

    // Lo único en el canal son los mensajes de SUBIDA de la propia pantalla (need_snapshot, display_alive).
    const down = raw.messages.filter((m) => isDownMessage(m));
    expect(down).toEqual([]);
    expect(raw.messages.length).toBeGreaterThan(0);
    expect(raw.messages.every((m) => (m as { t: string }).t === 'need_snapshot' || (m as { t: string }).t === 'display_alive')).toBe(true);
    expect(display.accepted).toEqual([]);
    expect(display.view()).toBe('connecting');
    expect(getPosDisplayEmitter().emittedStateCount).toBe(emittedBefore);

    raw.close();
    display.close();
  });

  it('refresh() con enabled=true (guardado desde OTRA ventana → evento storage → refreshPosDisplay): empieza a emitir con el pedido en curso', async () => {
    const terminalId = await bootCashier(false);
    const display = openDisplay(terminalId);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 3);
    await drain(4);
    expect(display.accepted).toEqual([]);

    // La tarjeta se guarda en otra ventana: la fila cambia y llega el aviso `storage`.
    db.displayEnabled = true;
    const reads = db.settingsReads;
    await refreshPosDisplay(ORG);
    expect(db.settingsReads).toBe(reads + 1); // releyó la BD
    expect(getPosDisplayEmitter().isEmitting).toBe(true);

    // Al abrir el transporte saluda con hello + state del pedido que ya había.
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'hello+state tras encender');
    expect(display.accepted.map((m) => m.t).slice(0, 2)).toEqual(['hello', 'state']);
    expect(display.stateMessages()[0].state.mode).toBe('order');
    expect(display.stateMessages()[0].state.cart?.lines[0]).toMatchObject({ name: 'Café americano', qty: 3 });
    expect(display.view()).toBe('order');

    // Y a partir de ahí cada mutación se refleja.
    const n = display.stateMessages().length;
    await POSService.addItemToCart(cart.id, product(2, 'Croissant de jamón'), 1);
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'mutación tras encender');
    expect(display.stateMessages()[n].state.cart?.lines).toHaveLength(2);
    display.close();
  });

  it('guardado en la MISMA ventana (prime + applyPosDisplaySettings): enciende sin releer la BD; apagar emite bye y silencia', async () => {
    const terminalId = await bootCashier(false);
    const display = openDisplay(terminalId);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await drain(4);

    const reads = db.settingsReads;
    primeCustomerDisplaySettings(ORG, { enabled: true });
    applyPosDisplaySettings();
    expect(db.settingsReads).toBe(reads);
    expect(getPosDisplayEmitter().isEmitting).toBe(true);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'hello+state tras prime');
    expect(display.view()).toBe('order');

    // Apagar: bye inmediato → Conectando; las mutaciones posteriores no salen.
    const raw = rawListener(terminalId);
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
    await waitFor(() => display.byes().length >= 1, 1000, 'bye al apagar');
    expect(display.link.snapshot.connected).toBe(false);
    expect(display.view()).toBe('connecting');
    const rawBefore = raw.messages.filter((m) => isDownMessage(m)).length;
    await POSService.addItemToCart(cart.id, product(2, 'Croissant'), 1);
    await drain(6);
    expect(raw.messages.filter((m) => isDownMessage(m)).length).toBe(rawBefore);
    raw.close();
    display.close();
  });

  it('opción A de la Parte B: la caché pasa a apagado SIN refresh() → la siguiente publicación no sale y cierra el transporte', async () => {
    const terminalId = await bootCashier(true);
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);

    // Cierre de sesión: se vacía la caché sin avisar al emisor.
    clearCustomerDisplaySettingsCache();
    expect(getPosDisplayEmitter().isEmitting).toBe(true); // aún no se ha enterado
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await drain(6);
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
    expect(display.stateMessages().every((m) => m.state.mode === 'idle')).toBe(true); // el pedido nunca salió
    await waitFor(() => display.byes().length >= 1, 1000, 'bye');
    expect(display.view()).toBe('connecting');
    display.close();
  });
});

// ---------------------------------------------------------------------------
// Caso 4 · Cobro: efectivo / tarjeta / QR → Gracias → Reposo a los 8 s
// ---------------------------------------------------------------------------

/** Lo que CheckoutDialog.tsx:223 hace en su efecto, sin React. */
function checkoutDialogEmits(input: { methodCode: string; methodName: string | null; total: number; received?: number | null; change?: number | null }) {
  getPosDisplayEmitter().setPayment(toDisplayPayment(input));
}

type RemoveCart = (id: string) => Promise<void>;
/** `POSService.checkout` → `removeCart` (privado): el único camino que guarda la lista sin el carrito activo. */
const removeCartViaService = (id: string) => (POSService as unknown as { removeCart: RemoveCart }).removeCart.call(POSService, id);

describe('Caso 4 · cobro y Gracias', () => {
  it('efectivo con recibido/cambio, tarjeta y QR → estados correctos en la pantalla', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 2);
    await drain();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const total = 18000;
    let n = display.stateMessages().length;

    // El cajero abre el cobro: la primera entrada se pre-rellena con el total y NO cuenta como recibido.
    checkoutDialogEmits({ methodCode: 'cash', methodName: 'Efectivo', total, received: null, change: null });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'cobro efectivo sin recibido');
    let state = display.stateMessages()[n].state;
    expect(state.mode).toBe('payment');
    expect(state.payment).toEqual({ method: 'cash', total, received: null, change: null });
    expect(state.cart?.lines).toHaveLength(1); // el pedido sigue viajando con el cobro
    expect(display.view()).toBe('payment_cash');

    // Teclea 50.000: recibido y cambio en vivo.
    n = display.stateMessages().length;
    checkoutDialogEmits({ methodCode: 'cash', methodName: 'Efectivo', total, received: 50000, change: 50000 - total });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'recibido/cambio');
    state = display.stateMessages()[n].state;
    expect(state.payment).toEqual({ method: 'cash', total, received: 50000, change: 32000 });
    expect(display.view()).toBe('payment_cash');

    // Cambia a tarjeta.
    n = display.stateMessages().length;
    checkoutDialogEmits({ methodCode: 'card', methodName: 'Tarjeta', total });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'tarjeta');
    state = display.stateMessages()[n].state;
    expect(state.payment).toEqual({ method: 'card', total, provider: null });
    expect(display.view()).toBe('payment_card');

    // Datáfono Bold: también tarjeta, con el nombre del medio.
    n = display.stateMessages().length;
    checkoutDialogEmits({ methodCode: 'bold_card', methodName: 'Bold datáfono', total });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'bold_card');
    expect(display.stateMessages()[n].state.payment).toEqual({ method: 'card', total, provider: 'Bold datáfono' });
    expect(display.view()).toBe('payment_card');

    // QR (Bre-B): sin imagen en F0.
    n = display.stateMessages().length;
    checkoutDialogEmits({ methodCode: 'breb_qr', methodName: 'Bre-B', total });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'qr');
    state = display.stateMessages()[n].state;
    expect(state.payment).toEqual({ method: 'qr', total, provider: 'Bre-B', qr: null, expiresAt: null });
    expect(display.view()).toBe('payment_qr');

    // Nequi también es QR aunque no termine en _qr.
    n = display.stateMessages().length;
    checkoutDialogEmits({ methodCode: 'nequi', methodName: 'Nequi', total });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'nequi');
    expect(display.stateMessages()[n].state.payment).toMatchObject({ method: 'qr', provider: 'Nequi' });

    // Cancelar el cobro (CheckoutDialog efecto [open] → setMode('order')): vuelve al pedido.
    n = display.stateMessages().length;
    getPosDisplayEmitter().setMode('order');
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'vuelta al pedido');
    expect(display.stateMessages()[n].state.mode).toBe('order');
    expect(display.stateMessages()[n].state.payment).toBeNull();
    expect(display.view()).toBe('order');
    display.close();
  });

  it('confirmar la venta (removeCart + setMode thanks en la misma vuelta) → UN solo frame «Gracias»; a los 8 s → Reposo', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 2);
    await drain();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const total = 18000;
    checkoutDialogEmits({ methodCode: 'cash', methodName: 'Efectivo', total, received: 20000, change: 2000 });
    await waitFor(() => display.view() === 'payment_cash', 2000, 'cobro');
    const n = display.stateMessages().length;

    // A partir de aquí, reloj falso: temporizador de «Gracias» (8 s), latidos,
    // watchdog e intervalo de salud avanzan a la vez y en pasos cortos para
    // que la entrega del canal (setImmediate real) intercale como en vivo.
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

    // Flujo real de CheckoutDialog.handleCompleteSale → POSService.checkout:
    // checkout() quita el carrito de pos_carts (removeCart → saveCartsToStorage)
    // y, al volver, el modal pide «Gracias» en la misma vuelta de microtareas.
    await removeCartViaService(cart.id);
    getPosDisplayEmitter().setMode('thanks', { total });
    expect(getPosDisplayEmitter().getState().mode).toBe('thanks');
    await step(0);
    await drainImmediates(4);
    expect(display.stateMessages().length).toBe(n + 1); // ni «Cobro sin líneas» ni «Reposo» intermedios
    const thanks = display.stateMessages()[n].state;
    expect(thanks).toEqual({ mode: 'thanks', cart: null, payment: null, tip: null, thanks: { total, askRating: false } });
    expect(display.view()).toBe('thanks');
    expect(readCarts()).toEqual([]);

    // 7,5 s: sigue en Gracias y la conexión sigue viva (los latidos siguen llegando bajo el reloj falso).
    await step(THANKS_DURATION_MS - 500);
    expect(display.link.snapshot.connected).toBe(true);
    expect(display.view()).toBe('thanks');
    expect(display.stateMessages().length).toBe(n + 1);

    // 8 s: el emisor vuelve al modo derivado; sin carrito → Reposo. La venta cobrada NUNCA vuelve a verse.
    await step(1000);
    expect(display.stateMessages().length).toBe(n + 2);
    expect(display.stateMessages()[n + 1].state).toEqual({ mode: 'idle', cart: null, payment: null, tip: null, thanks: null });
    expect(display.link.snapshot.connected).toBe(true);
    expect(display.view()).toBe('idle');
    // Coherencia entre partes: la pantalla (CustomerDisplay.THANKS_MS) y la caja (THANKS_DURATION_MS) usan el mismo plazo.
    expect(readCustomerDisplayThanksMs()).toBe(THANKS_DURATION_MS);
    // Y la propia pantalla, si su temporizador venciera antes que el de la caja, también cae a Reposo.
    expect(resolveView({ connected: true, updateRequired: false, thanksExpired: true, state: thanks })).toBe('idle');

    display.close();
    jest.useRealTimers();
  });

  it('«Gracias» se corta con la siguiente venta (nueva línea en el carrito activo), no con el cambio de pestaña', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await drain();
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');

    await removeCartViaService(cart.id);
    getPosDisplayEmitter().setMode('thanks', { total: 9000 });
    await waitFor(() => display.view() === 'thanks', 2000, 'gracias');

    // La página activa un carrito en espera de OTRO cliente: no debe cerrar «Gracias».
    const other = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(other);
    await drain(4);
    expect(display.view()).toBe('thanks');

    // El cajero teclea la siguiente venta: se cierra «Gracias» y se ve el pedido nuevo.
    const n = display.stateMessages().length;
    await POSService.addItemToCart(other.id, product(2, 'Croissant de jamón'), 1);
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'siguiente venta');
    expect(display.view()).toBe('order');
    expect(display.link.snapshot.state?.cart?.lines[0]).toMatchObject({ name: 'Croissant de jamón' });
    display.close();
  });
});

// ---------------------------------------------------------------------------
// Integración Parte D · presencia vista desde la caja con pantalla real
// ---------------------------------------------------------------------------

describe('Integración D · el indicador de la caja ve a la pantalla real', () => {
  it('display_alive cada 1 s mantiene el indicador en verde; display_bye lo pone en gris en el acto', async () => {
    const terminalId = await bootCashier(true);
    const emitter = getPosDisplayEmitter();
    expect(readDisplayPresence(emitter, Date.now(), STALE_AFTER_MS, getPosDisplayEnvironment())).toMatchObject({ connected: false, emitting: true, reason: null });

    const display = openDisplay(terminalId);
    await waitFor(() => emitter.lastDisplaySeenAt !== null, 2000, 'presencia de la pantalla');
    expect(readDisplayPresence(emitter, Date.now(), STALE_AFTER_MS, getPosDisplayEnvironment()).connected).toBe(true);

    const seen = emitter.lastDisplaySeenAt as number;
    await waitFor(() => (emitter.lastDisplaySeenAt ?? 0) > seen, HEARTBEAT_INTERVAL_MS + 800, 'segundo display_alive');

    display.close(); // startDisplayLink.stop → receiver.close → display_bye
    await waitFor(() => emitter.lastDisplaySeenAt === null, 1000, 'display_bye');
    expect(readDisplayPresence(emitter, Date.now(), STALE_AFTER_MS, getPosDisplayEnvironment()).connected).toBe(false);
  }, 8000);
});

// ---------------------------------------------------------------------------
// Casos adicionales entre partes
// ---------------------------------------------------------------------------

describe('Integración · casos cruzados', () => {
  it('pantalla abierta ANTES que la caja: queda en Conectando y adopta el hello+state del arranque sin esperar al re-snapshot', async () => {
    // Con el interruptor encendido en la BD pero la caja aún sin arrancar.
    db.displayEnabled = true;
    storage.setItem('pos_terminal_id', '11111111-2222-4333-8444-555555555555');
    const display = openDisplay('11111111-2222-4333-8444-555555555555');
    await drain(3);
    expect(display.view()).toBe('connecting');
    expect(display.accepted).toEqual([]);

    // cashier: null explícito. El emisor es un singleton y conserva la sesión
    // (cajero, caja abierta) entre stop() y start(); la página real la
    // vuelve a fijar en sus efectos (setSession) al montar.
    await startPosDisplay({ organizationId: ORG, currency: 'USD', sessionOpen: false, cashier: null });
    await waitFor(() => display.stateMessages().length >= 1, 1500, 'announce del arranque');
    expect(display.accepted.map((m) => m.t).slice(0, 2)).toEqual(['hello', 'state']);
    expect(display.hellos()[0]).toMatchObject({ currency: 'USD', sessionOpen: false, cashier: null });
    expect(display.link.snapshot.hello?.currency).toBe('USD');
    expect(display.view()).toBe('idle');

    // Y el carrito viaja en la moneda de la caja.
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await waitFor(() => display.view() === 'order', 2000, 'pedido en USD');
    expect(display.link.snapshot.state?.cart?.currency).toBe('USD');
  });

  it('setSession (caja abierta/cerrada, nombre del cajero) vuelve a saludar sin repetir el state', async () => {
    const terminalId = await bootCashier(true);
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const hellos = display.hellos().length;
    const states = display.stateMessages().length;

    getPosDisplayEmitter().setSession({ sessionOpen: false });
    await waitFor(() => display.hellos().length >= hellos + 1, 1500, 'hello por cierre de caja');
    expect(display.hellos()[hellos].sessionOpen).toBe(false);
    expect(display.link.snapshot.hello?.sessionOpen).toBe(false);
    // announce = hello + state: el state acompaña al hello (contrato del transporte), no es una repetición gratuita.
    expect(display.stateMessages().length).toBe(states + 1);

    getPosDisplayEmitter().setSession({ cashier: { name: 'Carlos' } });
    await waitFor(() => display.hellos().length >= hellos + 2, 1500, 'hello por cambio de cajero');
    expect(display.link.snapshot.hello?.cashier).toEqual({ name: 'Carlos' });

    // Mismo valor: no saluda otra vez.
    getPosDisplayEmitter().setSession({ cashier: { name: 'Carlos' }, sessionOpen: false });
    await drain(4);
    expect(display.hellos().length).toBe(hellos + 2);
  });

  it('totales del recibo (CartView/TaxSummary → setTotals) sustituyen a los del carrito y caducan con la siguiente mutación', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 2);
    await drain();
    const display = openDisplay(terminalId);
    await waitFor(() => display.view() === 'order', 2000, 'pedido');
    let n = display.stateMessages().length;

    // TaxSummary calcula IVA incluido 19 % sobre 18.000: impuesto 2.874, total 18.000 (CartView.tsx:79).
    getPosDisplayEmitter().setTotals(cart.id, { discountTotal: 0, taxTotal: 2874, total: 18000 });
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'override');
    expect(display.stateMessages()[n].state.cart).toMatchObject({ subtotal: 18000, taxTotal: 2874, total: 18000 });
    // Mismo override otra vez: no se repite.
    getPosDisplayEmitter().setTotals(cart.id, { discountTotal: 0, taxTotal: 2874, total: 18000 });
    await drain(4);
    expect(display.stateMessages().length).toBe(n + 1);

    // El cajero cambia la cantidad: el override caduca y el frame lleva los totales del propio Cart (sin impuestos en este doble).
    n = display.stateMessages().length;
    const itemId = readCarts()[0].items[0].id;
    await POSService.updateCartItemQuantity(cart.id, itemId, 3);
    await waitFor(() => display.stateMessages().length >= n + 1, 2000, 'mutación tras override');
    const after = display.stateMessages()[n].state.cart;
    expect(after).toMatchObject({ subtotal: 27000, taxTotal: 0, total: 27000 });
    expect(after?.lines[0].qty).toBe(3);
  });

  it('basura y sobres de otra versión en el canal no rompen ni descolocan a la pantalla mientras la caja habla', async () => {
    const terminalId = await bootCashier(true);
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');
    const n = display.accepted.length;

    const rogue = new BroadcastChannel(displayChannelName(terminalId));
    rogue.postMessage('hola');
    rogue.postMessage({ v: 1, t: 'state', seq: 999, terminalId, instanceId: 'otra', state: { mode: 'thanks' } }); // forma inválida (faltan bloques)
    rogue.postMessage({ v: 2, t: 'state', seq: 1, terminalId, instanceId: 'futuro', state: null }); // otra versión
    rogue.postMessage({ v: 1, t: 'hello', seq: 1, terminalId: 'otra-terminal', instanceId: 'x', organizationId: 1, cashier: null, sessionOpen: true });
    await drain(4);
    rogue.close();

    expect(display.accepted.length).toBe(n);
    expect(display.receiver.incompatibleVersionCount).toBe(1);
    display.link.evaluateHealth();
    // El sobre v:2 es lo último que llegó, así que `updateRequired` se marca
    // de forma transitoria; con la caja CONECTADA la vista no lo muestra
    // (resolveView solo pide actualizar cuando no hay caja) y el siguiente
    // latido lo limpia.
    expect(display.link.snapshot.connected).toBe(true);
    expect(display.view()).toBe('idle');
    const hb = display.heartbeats().length;
    await waitFor(() => display.heartbeats().length > hb, HEARTBEAT_INTERVAL_MS + 800, 'latido tras la basura');
    display.link.evaluateHealth();
    expect(display.link.snapshot.updateRequired).toBe(false);

    // La caja sigue funcionando después.
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    await POSService.addItemToCart(cart.id, product(1, 'Café americano'), 1);
    await waitFor(() => display.view() === 'order', 2000, 'pedido tras basura');
  });

  it('aceptación F0: una tecla en la caja se refleja en la pantalla en < 100 ms (medido en Node)', async () => {
    const terminalId = await bootCashier(true);
    const cart = await POSService.createCart(BRANCH);
    getPosDisplayEmitter().setActiveCart(cart);
    const display = openDisplay(terminalId);
    await waitFor(() => display.stateMessages().length >= 1, 2000, 'snapshot');

    const samples: number[] = [];
    for (let i = 1; i <= 9; i += 1) {
      const n = display.stateMessages().length;
      const t0 = performance.now();
      await POSService.addItemToCart(cart.id, product(i, `Producto ${i}`), 1);
      await waitFor(() => display.stateMessages().length >= n + 1, 20_000, `state ${i}`);
      samples.push(performance.now() - t0);
    }
    const ordenadas = [...samples].sort((a, b) => a - b);
    const mediana = ordenadas[Math.floor(ordenadas.length / 2)];
    const worst = Math.max(...samples);
    // eslint-disable-next-line no-console
    console.info('[integración] latencia tecla → pantalla (ms):', samples.map((s) => s.toFixed(1)).join(', '));
    /**
     * El criterio del PLAN (< 100 ms de la tecla a la pantalla) se mide sobre
     * la MEDIANA de nueve muestras, no sobre la peor: esto corre en Node con
     * ocho workers de jest compitiendo y una pausa del recolector de basura en
     * una sola muestra no dice nada del camino que se está midiendo
     * (F3-B ronda 2 · 11). La peor muestra se sigue vigilando con un margen
     * amplio, que es lo que detectaría una regresión de verdad: un cambio que
     * meta una espera en el camino sube TODAS las muestras, no una.
     */
    expect(mediana).toBeLessThan(100);
    expect(worst).toBeLessThan(2_000);
  });
});
