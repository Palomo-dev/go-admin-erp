/**
 * TESTER · Fase 2, parte A (terminales y ajustes completos), RONDA 3.
 *
 * Complementa tester-f2a-r1 y tester-f2a-r2 (no repite lo que ya cubren).
 * Cada bloque nace de un intento de romper lo entregado en la ronda 3:
 *
 * 1. Emisor · la regla «solo resaluda desde una ventana visible» cubre la
 *    rama de `refresh()` con el transporte YA abierto. La rama que ABRE el
 *    transporte no la consulta: si el administrador apaga y vuelve a
 *    encender el interruptor desde otra ventana (o lo enciende por primera
 *    vez) con dos pestañas de /app/pos, las dos abren transporte y saludan,
 *    y «gana la última que saluda» aunque sea la OCULTA. La pestaña visible
 *    no recibe `focus` ni `visibilitychange` (ya los tenía), así que no se
 *    vuelve a presentar y la pantalla se queda con el carrito de la pestaña
 *    de fondo hasta que el cajero cambie de ventana y vuelva. HALLAZGO
 *    (medio) de la ronda 3, CORREGIDO en la ronda 4: la rama de apertura
 *    abre el transporte siempre (latido incluido) pero solo saluda si la
 *    ventana está visible; la aserción ya afirma el contrato nuevo
 *    (activeInstanceId sigue siendo la del cajero) y se añade el caso de
 *    una única pestaña oculta que responde al need_snapshot.
 *    También se documenta que `setSession` y `start()` repetidos desde una
 *    pestaña oculta sí resaludan (decisión del builder: son datos de ESTA
 *    caja), con el mismo efecto colateral.
 * 2. settings.ts · entradas raras que llegan de `organization_settings`:
 *    `settings` guardado como STRING JSON (fila escrita a mano), presets
 *    como cadenas («5»), `touch` en mayúsculas, `locale` con espacios,
 *    tips.enabled=true con presets rotos (el bloque no se cae entero), 25
 *    URLs válidas (se recortan a 20 sin avisar), un `hello.settings` con
 *    basura pasa `isDownMessage` (la pantalla tendrá que sanear campo a
 *    campo: hoy nadie lo consume, parte B/C).
 * 3. Servicio · `branchId` explícito inválido (0, -1, NaN) lanza antes de
 *    consultar; `getLinkedTerminal` devuelve una terminal INACTIVA de otra
 *    sucursal y la tarjeta la pinta como «vinculada a X (otra sucursal), y
 *    está desactivada» (hallazgo bajo de la ronda 3, corregido en la 4 con
 *    la clave linkedToOtherBranchInactive; contrato estático);
 *    `resolveLinkedTerminal` con la lista de OTRA sucursal → `unlinked`
 *    (es lo que dispara la consulta por id).
 * 4. Contratos estáticos de la ronda 3: el Select cierra «Renombrar»,
 *    `getLinkedTerminal` solo se consulta con `linked.unlinked`, la rama de
 *    apertura del transporte en `applySwitch` SÍ consulta la visibilidad
 *    salvo desde start() (ronda 4).
 *
 * Verificado además contra la base (MCP, solo lectura + DO/RAISE con
 * rollback) el 2026-09-21: `pos_terminals_update` en pg_policies exige
 * `role_id = ANY(ARRAY[1,2,5])` o `is_super_admin` o
 * `check_user_permission(uid, organization_id, 'admin.full_access')`
 * (SECURITY DEFINER, existe con esa firma) en `using` y `with_check`, y el
 * `with_check` conserva la sucursal de la misma organización; índice único
 * `pos_terminals_code_unico_ci (organization_id, branch_id, upper(code))` y
 * CHECK `pos_terminals_code_mayusculas (code = upper(code))` validada;
 * `qa-x` junto a `QA-X` → 23514 (rollback). RLS activa, sin política DELETE,
 * 0 filas: no hay forma de ejecutar el servicio del navegador contra la
 * base desde aquí (ver noProbado del informe).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Cart, CartItem } from '@/components/pos/types';

// ---------------------------------------------------------------------------
// Dobles compartidos (mismo patrón que tester-f2a-r2)
// ---------------------------------------------------------------------------

interface Call {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert';
  columns?: string;
  payload?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
}

const db: { calls: Call[]; settingsRow: { settings: unknown } | null; terminalRows: unknown; error: { code?: string; message: string } | null } = {
  calls: [],
  settingsRow: null,
  terminalRows: [],
  error: null,
};

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: (table: string) => {
      const call: Call = { table, op: 'select', filters: [] };
      db.calls.push(call);
      const result = () => {
        if (db.error) return { data: null, error: db.error };
        if (table === 'organization_settings') return { data: db.settingsRow, error: null };
        return { data: db.terminalRows, error: null };
      };
      const chain = {
        select: (columns: string) => {
          call.columns = columns;
          return chain;
        },
        insert: (payload: Record<string, unknown>) => {
          call.op = 'insert';
          call.payload = payload;
          return chain;
        },
        upsert: (payload: Record<string, unknown>) => {
          call.op = 'upsert';
          call.payload = payload;
          return chain;
        },
        eq: (col: string, value: unknown) => {
          call.filters.push([col, value]);
          return chain;
        },
        order: () => chain,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
      };
      return chain;
    },
  },
}));

const ctx = { orgId: 120, branchId: 7 as number | null };
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => ctx.orgId,
  getCurrentBranchId: () => ctx.branchId,
}));

const store = new Map<string, string>();
beforeAll(() => {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } },
    configurable: true,
    writable: true,
  });
});

/* eslint-disable @typescript-eslint/no-require-imports */
const settingsMod = require('@/lib/pos/display/settings') as typeof import('@/lib/pos/display/settings');
const svcMod = require('@/lib/services/posTerminalsService') as typeof import('@/lib/services/posTerminalsService');
const emitterMod = require('@/lib/pos/display/emitter') as typeof import('@/lib/pos/display/emitter');
const protocolMod = require('@/lib/pos/display/protocol') as typeof import('@/lib/pos/display/protocol');
const transportMod = require('@/lib/pos/display/transport') as typeof import('@/lib/pos/display/transport');
/* eslint-enable @typescript-eslint/no-require-imports */

const { parseCustomerDisplaySettings, toDisplayPresentationSettings, fetchCustomerDisplaySettings, IDLE_MEDIA_URLS_MAX } = settingsMod;
const { PosTerminalsService } = svcMod;
const { DisplayEmitter } = emitterMod;
const { isDownMessage } = protocolMod;
const { BroadcastChannelReceiver, BroadcastChannelTransport } = transportMod;

type PosTerminal = import('@/lib/pos/display/terminalIdentity').PosTerminal;

const TERMINAL = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T_OTRA = 'cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const INSTANCE_A = '11111111-1111-4111-8111-111111111111';
const INSTANCE_B = '22222222-2222-4222-8222-222222222222';
const INSTANCE_A2 = '33333333-3333-4333-8333-333333333333';
const INSTANCE_B2 = '44444444-4444-4444-8444-444444444444';
const TS = '2026-09-21T10:00:00.000Z';

function item(over: Partial<CartItem> & { id: string; product_id: number }): CartItem {
  const quantity = over.quantity ?? 1;
  const unit_price = over.unit_price ?? 1000;
  return {
    cart_id: 'c1',
    product: { id: over.product_id, organization_id: 120, sku: `SKU-${over.product_id}`, name: `Producto ${over.product_id}`, unit_code: 'UND', status: 'active', created_at: TS, updated_at: TS },
    quantity,
    unit_price,
    total: quantity * unit_price,
    discount_amount: 0,
    tax_amount: 0,
    tax_rate: 0,
    created_at: TS,
    updated_at: TS,
    ...over,
  };
}
function cart(over: Partial<Cart> = {}): Cart {
  const items = over.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  return {
    id: 'c1', organization_id: 120, branch_id: 7, status: 'active', items,
    subtotal, tax_amount: 0, tax_total: 0, discount_amount: 0, discount_total: 0, total: subtotal,
    created_at: TS, updated_at: TS, ...over,
  };
}
function terminal(over: Partial<PosTerminal> = {}): PosTerminal {
  return { id: TERMINAL, organization_id: 120, branch_id: 7, name: 'Caja 1', code: 'CAJA-1', is_active: true, display_last_seen_at: null, created_at: TS, updated_at: TS, ...over };
}

async function tick(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}
async function waitFor(pred: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: se agotó el tiempo');
    await tick(1);
  }
}

beforeEach(() => {
  db.calls = [];
  db.settingsRow = null;
  db.terminalRows = [];
  db.error = null;
  ctx.orgId = 120;
  ctx.branchId = 7;
  store.clear();
  settingsMod.clearCustomerDisplaySettingsCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ---------------------------------------------------------------------------
// 1. Emisor · la visibilidad no cubre la rama que ABRE el transporte
// ---------------------------------------------------------------------------

describe('emitter.ts · visibilidad y dos pestañas de /app/pos con la MISMA terminal (BroadcastChannel real)', () => {
  const opened: Array<{ close(): void }> = [];
  const track = <T extends { close(): void }>(x: T): T => {
    opened.push(x);
    return x;
  };
  afterEach(() => {
    while (opened.length > 0) opened.pop()?.close();
  });

  const presentation = () => toDisplayPresentationSettings(parseCustomerDisplaySettings({ tips: { enabled: true } }));

  /** Una pestaña de caja: cada apertura del transporte crea una instancia NUEVA (como createBrowserTransport en posDisplay.ts). */
  function caja(instanceIds: string[], cartId: string, visible: { value: boolean }, enabled: { value: boolean }) {
    let n = 0;
    const emitter = new DisplayEmitter({
      createTransport: () => track(new BroadcastChannelTransport({ terminalId: TERMINAL, __testInstanceId: instanceIds[n++] ?? instanceIds[instanceIds.length - 1], now: () => 0 })),
      isEnabled: () => enabled.value,
      getSettings: presentation,
      isVisible: () => visible.value,
      schedule: (fn) => {
        const id = setTimeout(fn, 0);
        return () => clearTimeout(id);
      },
    });
    emitter.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    emitter.setActiveCart(cart({ id: cartId, items: [item({ id: `${cartId}-l1`, product_id: 1 })] }));
    return emitter;
  }

  it('ronda 4 (era HALLAZGO medio): apagar y ENCENDER el interruptor desde otra ventana → las dos pestañas reabren el transporte pero solo saluda la VISIBLE; la pantalla sigue a la del cajero aunque la oculta procese su refresh() la última', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const seen: Array<{ instanceId: string; cartId: string | null }> = [];
    display.onDown((m) => {
      if (m.t === 'state') seen.push({ instanceId: m.instanceId, cartId: m.state.cart?.id ?? null });
    });

    const enabled = { value: true };
    const fondoVisible = { value: false };
    const fondo = caja([INSTANCE_B, INSTANCE_B2], 'cart-fondo', fondoVisible, enabled);
    await tick();
    const cajero = caja([INSTANCE_A, INSTANCE_A2], 'cart-cajero', { value: true }, enabled);
    await waitFor(() => display.activeInstanceId === INSTANCE_A && seen[seen.length - 1]?.cartId === 'cart-cajero');

    // Otra ventana APAGA: evento storage en las dos → refresh() → ambas cierran (bye).
    enabled.value = false;
    cajero.refresh();
    fondo.refresh();
    await waitFor(() => display.activeInstanceId === null);
    expect(cajero.isEmitting).toBe(false);
    expect(fondo.isEmitting).toBe(false);

    // Otra ventana ENCIENDE: las dos reabren el transporte; la de fondo procesa su refresh() la última.
    enabled.value = true;
    const antes = seen.length;
    cajero.refresh();
    fondo.refresh();
    await waitFor(() => seen.length >= antes + 1);
    await tick(6);

    // Contrato nuevo: solo saludó la visible; la pantalla sigue a la pestaña del cajero.
    expect(cajero.isEmitting).toBe(true);
    expect(fondo.isEmitting).toBe(true); // abrió el transporte (latido) aunque no saludara
    expect(display.activeInstanceId).toBe(INSTANCE_A2);
    expect(seen.slice(antes)).toEqual([{ instanceId: INSTANCE_A2, cartId: 'cart-cajero' }]);

    // Y las teclas del cajero siguen llegando a la pantalla.
    cajero.setActiveCart(cart({ id: 'cart-cajero', items: [item({ id: 'cart-cajero-l1', product_id: 1 }), item({ id: 'cart-cajero-l2', product_id: 2 })] }));
    await waitFor(() => seen.length >= antes + 2);
    expect(seen[seen.length - 1]).toEqual({ instanceId: INSTANCE_A2, cartId: 'cart-cajero' });

    // La oculta se presenta cuando vuelve a verse (reannounce), como siempre.
    fondoVisible.value = true;
    fondo.reannounce();
    await waitFor(() => display.activeInstanceId === INSTANCE_B2);
    cajero.stop();
    fondo.stop();
  });

  it('ronda 4: una ÚNICA pestaña de POS OCULTA encendida desde Configuración abre el transporte sin saludar; la pantalla la adopta por latido, pide snapshot y el hello llega igual (handleUp no mira la visibilidad)', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const types: string[] = [];
    display.onDown((m) => types.push(m.t));
    const enabled = { value: false };
    const visible = { value: false };
    // Arranca con el interruptor APAGADO: sin transporte.
    const sola = caja([INSTANCE_B], 'cart-sola', visible, enabled);
    await tick();
    expect(sola.isEmitting).toBe(false);

    // Otra ventana ENCIENDE: abre el transporte pero, oculta, no saluda.
    enabled.value = true;
    sola.refresh();
    await tick(6);
    expect(sola.isEmitting).toBe(true);
    expect(types).toEqual([]);
    expect(display.activeInstanceId).toBeNull();

    // La pantalla pregunta (sin activa: va a todas) y la caja responde hello + state aunque siga oculta.
    display.send({ t: 'need_snapshot', capabilities: { touch: false, width: 1280, height: 800 } });
    await waitFor(() => types.includes('hello') && types.includes('state'));
    expect(types.indexOf('hello')).toBeLessThan(types.indexOf('state'));
    expect(display.activeInstanceId).toBe(INSTANCE_B);
    sola.stop();
  });

  it('documentado (decisión del builder): setSession con cambio de cajero desde la pestaña OCULTA resaluda y releva a la visible', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const enabled = { value: true };
    const fondo = caja([INSTANCE_B], 'cart-fondo', { value: false }, enabled);
    await tick();
    const cajero = caja([INSTANCE_A], 'cart-cajero', { value: true }, enabled);
    await waitFor(() => display.activeInstanceId === INSTANCE_A);

    fondo.setSession({ cashier: { name: 'Otro cajero' } });
    await waitFor(() => display.activeInstanceId === INSTANCE_B);
    expect(display.activeInstanceId).toBe(INSTANCE_B);

    // start() repetido (misma organización) desde la visible la recupera sin depender de la visibilidad.
    cajero.start({ organizationId: 120, currency: 'COP', sessionOpen: true });
    await waitFor(() => display.activeInstanceId === INSTANCE_A);
    cajero.stop();
    fondo.stop();
  });

  it('refresh() con la ventana oculta y el transporte abierto no publica NADA (ni hello ni state), pero el carrito sigue emitiéndose por flush', async () => {
    const display = track(new BroadcastChannelReceiver({ terminalId: TERMINAL }));
    const types: string[] = [];
    display.onDown((m) => types.push(m.t));
    const enabled = { value: true };
    const visible = { value: false };
    const sola = caja([INSTANCE_B], 'cart-sola', visible, enabled);
    await waitFor(() => types.includes('state'));
    const antes = types.length;
    sola.refresh();
    sola.refresh();
    await tick(6);
    expect(types.slice(antes).filter((t) => t === 'hello')).toHaveLength(0);
    // Una mutación real sí viaja como state aunque la ventana esté oculta (Chrome pausa rAF, no BroadcastChannel).
    sola.setActiveCart(cart({ id: 'cart-sola', items: [item({ id: 'cart-sola-l1', product_id: 1 }), item({ id: 'cart-sola-l2', product_id: 2 })] }));
    await waitFor(() => types.length > antes);
    expect(types[types.length - 1]).toBe('state');
    sola.stop();
  });
});

// ---------------------------------------------------------------------------
// 2. settings.ts · entradas raras desde organization_settings
// ---------------------------------------------------------------------------

describe('settings.ts · entradas raras de organization_settings (ronda 3)', () => {
  it('settings guardado como STRING JSON (fila escrita a mano) → fetch devuelve defaults (apagado), sin lanzar', async () => {
    db.settingsRow = { settings: JSON.stringify({ enabled: true, tips: { enabled: true } }) };
    const parsed = await fetchCustomerDisplaySettings(120);
    expect(parsed).toEqual(settingsMod.DEFAULT_CUSTOMER_DISPLAY_SETTINGS);
    expect(parsed.enabled).toBe(false);
  });

  it('presets como cadenas («5», «10», «15») NO se coercionan: presets → 5/10/15 numéricos y tips.enabled se conserva (degradación por campo)', () => {
    const parsed = parseCustomerDisplaySettings({ tips: { enabled: true, presets: ['5', '10', '15'], allowCustom: false } });
    expect(parsed.tips).toEqual({ enabled: true, presets: [5, 10, 15], allowCustom: false });
  });

  it('touch «TOUCH» / «Touch» / 1 → auto (enum estricto); «no-touch» pasa tal cual', () => {
    expect(parseCustomerDisplaySettings({ touch: 'TOUCH' }).touch).toBe('auto');
    expect(parseCustomerDisplaySettings({ touch: 'Touch' }).touch).toBe('auto');
    expect(parseCustomerDisplaySettings({ touch: 1 }).touch).toBe('auto');
    expect(parseCustomerDisplaySettings({ touch: 'no-touch' }).touch).toBe('no-touch');
  });

  it('locale con espacios alrededor («  es-CO ») se recorta; con espacio DENTRO («es CO») → null', () => {
    expect(parseCustomerDisplaySettings({ locale: '  es-CO ' }).locale).toBe('es-CO');
    expect(parseCustomerDisplaySettings({ locale: 'es CO' }).locale).toBeNull();
  });

  it('25 URLs válidas se recortan a IDLE_MEDIA_URLS_MAX (20) en silencio; una inválida en medio no arrastra a las demás', () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
    expect(parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: urls } }).idle.mediaUrls).toHaveLength(IDLE_MEDIA_URLS_MAX);
    const mixed = parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: ['https://a.com/1.jpg', 'javascript:alert(1)', 'https://a.com/2.jpg'] } });
    expect(mixed.idle.mediaUrls).toEqual(['https://a.com/1.jpg', 'https://a.com/2.jpg']);
    expect(mixed.idle.mode).toBe('media');
  });

  it('idle.idleAfterSeconds 9 (por debajo del mínimo) → 90; 3601 → 90; 10 y 3600 se aceptan; el modo no se ve afectado', () => {
    expect(parseCustomerDisplaySettings({ idle: { mode: 'promotions', idleAfterSeconds: 9 } }).idle).toEqual({ mode: 'promotions', mediaUrls: [], idleAfterSeconds: 90 });
    expect(parseCustomerDisplaySettings({ idle: { mode: 'promotions', idleAfterSeconds: 3601 } }).idle.idleAfterSeconds).toBe(90);
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 10 } }).idle.idleAfterSeconds).toBe(10);
    expect(parseCustomerDisplaySettings({ idle: { idleAfterSeconds: 3600 } }).idle.idleAfterSeconds).toBe(3600);
  });

  it('ronda 4 (era HALLAZGO bajo): «https://%» y «http://[» pasan el patrón pero isValidMediaUrl (patrón + new URL) las rechaza; la tarjeta usa ese mismo predicado, así que ya no llegan al guardado', () => {
    for (const u of ['https://%', 'http://[']) {
      expect(settingsMod.MEDIA_URL_PATTERN.test(u)).toBe(true); // el patrón solo no basta
      expect(settingsMod.isValidMediaUrl(u)).toBe(false); // el predicado único las rechaza
      expect(parseCustomerDisplaySettings({ idle: { mode: 'media', mediaUrls: [u] } }).idle.mediaUrls).toEqual([]); // y el esquema también
    }
    const tarjeta = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'src/components/pos/configuracion/pantalla-cliente/AjustesPantallaSection.tsx'), 'utf8');
    expect(tarjeta).not.toContain('MEDIA_URL_PATTERN');
    expect(tarjeta).toMatch(/isValidMediaUrl/);
    expect(tarjeta).toContain("invalid === 'mediaUrls' ? firstInvalidMediaUrl(toSave) : null");
  });

  it('toDisplayPresentationSettings copia los presets (mutar el resultado no toca los ajustes cacheados)', () => {
    const settings = parseCustomerDisplaySettings({ tips: { enabled: true, presets: [10, 20, 30] } });
    const pres = toDisplayPresentationSettings(settings);
    pres.tips.presets.push(99);
    expect(settings.tips.presets).toEqual([10, 20, 30]);
  });

  it('un hello.settings con BASURA (presets «abc», touch 7, rating null) pasa isDownMessage: la pantalla (parte B/C) deberá sanear campo a campo', () => {
    const hello = {
      v: 1,
      terminalId: TERMINAL,
      instanceId: INSTANCE_A,
      seq: 1,
      t: 'hello',
      organizationId: 120,
      cashier: null,
      sessionOpen: true,
      currency: 'COP',
      settings: { tips: { enabled: true, presets: 'abc' }, touch: 7, rating: null },
    };
    expect(isDownMessage(hello)).toBe(true);
    // Y una pantalla que reutilice el parser de la caja la deja en valores seguros.
    const safe = parseCustomerDisplaySettings(hello.settings);
    expect(safe.tips.presets).toEqual([5, 10, 15]);
    expect(safe.touch).toBe('auto');
    expect(safe.rating.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Servicio · sucursal explícita inválida y vínculo en otra sucursal
// ---------------------------------------------------------------------------

describe('posTerminalsService · sucursal explícita inválida y vínculo en otra sucursal', () => {
  it('branchId explícito 0, -1, NaN o 7.5 → lanza ANTES de consultar (no cae a la del contexto en silencio)', async () => {
    for (const bad of [0, -1, Number.NaN, 7.5]) {
      await expect(PosTerminalsService.listTerminals(bad)).rejects.toThrow(/sucursal/);
      await expect(PosTerminalsService.createTerminal({ name: 'Caja', code: 'C1' }, bad)).rejects.toThrow(/sucursal/);
    }
    expect(db.calls).toHaveLength(0);
  });

  it('branchId null explícito cae a la del contexto (la tarjeta pasa selectedBranchId, que puede ser null mientras carga)', async () => {
    ctx.branchId = 9;
    await PosTerminalsService.listTerminals(null);
    expect(db.calls[0].filters).toEqual(expect.arrayContaining([['organization_id', 120], ['branch_id', 9]]));
  });

  it('createTerminal: la fila viaja con organization_id de la sesión y branch_id explícito, nunca con id, created_at ni display_last_seen_at', async () => {
    db.terminalRows = terminal({ branch_id: 3 });
    await PosTerminalsService.createTerminal({ name: '  Caja 2 ', code: ' caja-2 ' }, 3);
    const insert = db.calls.find((c) => c.op === 'insert');
    expect(insert?.payload).toEqual({ organization_id: 120, branch_id: 3, name: 'Caja 2', code: 'CAJA-2', is_active: true });
    expect(Object.keys(insert?.payload ?? {})).not.toEqual(expect.arrayContaining(['id', 'created_at', 'display_last_seen_at', 'updated_at']));
  });

  it('id local vinculado a una terminal de OTRA sucursal: resolveLinkedTerminal → unlinked; getLinkedTerminal la devuelve aunque esté INACTIVA (la tarjeta la rotula como desactivada, ronda 4)', async () => {
    store.set('pos_terminal_id', T_OTRA);
    const listaSucursal = [terminal({ id: TERMINAL, branch_id: 7 })];
    const view = PosTerminalsService.resolveLinkedTerminal(listaSucursal);
    expect(view).toEqual({ localTerminalId: T_OTRA, terminal: null, unlinked: true });

    db.terminalRows = terminal({ id: T_OTRA, branch_id: 12, is_active: false, name: 'Caja vieja', code: 'VIEJA' });
    const linked = await PosTerminalsService.getLinkedTerminal();
    expect(linked?.id).toBe(T_OTRA);
    expect(linked?.is_active).toBe(false);
    const q = db.calls.find((c) => c.table === 'pos_terminals' && c.op === 'select');
    expect(q?.filters).toEqual(expect.arrayContaining([['id', T_OTRA], ['organization_id', 120]]));
    expect(q?.filters.some(([col]) => col === 'branch_id')).toBe(false);
  });

  it('dos cajas con la misma terminal: vincular en una máquina NO toca la BD (solo localStorage); la otra máquina conserva su vínculo', () => {
    const ok = PosTerminalsService.linkThisTerminal({ id: TERMINAL });
    expect(ok).toBe(true);
    expect(db.calls).toHaveLength(0);
    expect(store.get('pos_terminal_id')).toBe(TERMINAL);
    // Vincular de nuevo a otra fila sobrescribe (una máquina = una caja).
    PosTerminalsService.linkThisTerminal({ id: T_OTRA });
    expect(PosTerminalsService.getLocalTerminalId()).toBe(T_OTRA);
  });
});

// ---------------------------------------------------------------------------
// 4. Contratos estáticos de la ronda 3
// ---------------------------------------------------------------------------

describe('contratos estáticos · ronda 3', () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

  it('EstaCajaSection: el Select cierra «Renombrar» al cambiar; getLinkedTerminal solo con linked.unlinked; el rótulo de otra sucursal distingue is_active (ronda 4)', () => {
    const src = read('src/components/pos/configuracion/pantalla-cliente/EstaCajaSection.tsx');
    expect(src).toMatch(/onValueChange=\{\(value\) => \{\s*setSelectedId\(value\);\s*setShowRename\(false\)/);
    expect(src).toMatch(/if \(loading \|\| !linked\.unlinked \|\| !localId\)/);
    expect(src).toContain("t('linkedToOtherBranch', { name: otherBranchTerminal.name, code: otherBranchTerminal.code })");
    // Ronda 4: variante «otra sucursal + inactiva», elegida por is_active y con el mismo punto ámbar.
    expect(src).toMatch(/otherBranchTerminal\.is_active\s*\?\s*t\('linkedToOtherBranch'[\s\S]*?:\s*t\('linkedToOtherBranchInactive', \{ name: otherBranchTerminal\.name, code: otherBranchTerminal\.code \}\)/);
    expect(src).toMatch(/otherBranchTerminal \? 'bg-amber-500'/);
    expect(src).toContain('isOrgMismatchError(err) ? t(\'orgChanged\')');
  });

  it('emitter.ts (ronda 4): la rama que ABRE el transporte en applySwitch abre siempre y solo saluda si la ventana está visible o viene de start(); la respuesta a need_snapshot no mira la visibilidad', () => {
    const src = read('src/lib/pos/display/emitter.ts');
    const body = src.slice(src.indexOf('private applySwitch(fromStart = false): boolean {'), src.indexOf('private windowVisible(): boolean {'));
    const openBranch = body.slice(body.indexOf('if (enabled && !this.transport) {'), body.indexOf('if (!enabled && this.transport) {'));
    expect(openBranch).toMatch(/this\.openTransport\(\);[\s\S]*if \(!fromStart && !this\.windowVisible\(\)\) return false;[\s\S]*this\.announce\(\);/);
    const reHelloBranch = body.slice(body.indexOf('if (enabled && this.transport && this.getSettings'));
    expect(reHelloBranch).toContain('this.windowVisible()');
    expect(src).toContain('const announced = this.applySwitch(true);');
    const handleUp = src.slice(src.indexOf('private handleUp(msg: UpMessage): void {'), src.indexOf('private requestFlush(): void {'));
    expect(handleUp).toContain("if (msg.t === 'need_snapshot') this.announce();");
    expect(handleUp).not.toContain('windowVisible');
  });

  it('las claves i18n nuevas (incluida linkedToOtherBranchInactive de la ronda 4) existen en es/en/pt/fr con los mismos placeholders', () => {
    for (const lang of ['es', 'en', 'pt', 'fr']) {
      const msgs = JSON.parse(read(`messages/${lang}.json`)) as { posCustomerDisplay: { terminals: Record<string, string> } };
      const t = msgs.posCustomerDisplay.terminals;
      expect(typeof t.orgChanged).toBe('string');
      expect(t.linkedToOtherBranch).toMatch(/\{name\}/);
      expect(t.linkedToOtherBranch).toMatch(/\{code\}/);
      // Ronda 4: variante «otra sucursal + desactivada», con los mismos placeholders.
      expect(t.linkedToOtherBranchInactive).toMatch(/\{name\}/);
      expect(t.linkedToOtherBranchInactive).toMatch(/\{code\}/);
      expect(t.linkedToOtherBranchInactive).not.toBe(t.linkedToOtherBranch);
    }
  });

  it('la política del archivo de migración coincide con lo verificado en la base: role_id in (1, 2, 5), is_super_admin, check_user_permission y sucursal de la misma organización en with check', () => {
    const sql = read('supabase/migrations/20260921150000_pos_terminals_update_rol_admin_manager.sql');
    expect(sql).toContain('om.role_id in (1, 2, 5)');
    expect(sql).toContain('om.is_super_admin = true');
    expect((sql.match(/check_user_permission\(\(select auth\.uid\(\)\), pos_terminals\.organization_id, 'admin\.full_access'\)/g) ?? []).length).toBe(2);
    expect(sql).toMatch(/with check \(\s*\([\s\S]*and branch_id in \(/);
    const rollback = read('supabase/rollbacks/20260921150000_pos_terminals_update_rol_admin_manager_rollback.sql');
    expect(rollback).not.toContain('role_id in');
    expect(rollback).toContain('create policy pos_terminals_update');
  });
});
