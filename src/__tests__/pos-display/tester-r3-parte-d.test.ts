/**
 * Tester · Parte D (indicador en el POS y tarjeta de Configuración › POS),
 * ronda 3. Casos que las suites del builder y de las rondas 1-2 no cubren:
 *
 * - Relecturas concurrentes que RESPONDEN fuera de orden: dos guardados
 *   seguidos en la ventana de Configuración (encender, apagar) producen dos
 *   relecturas en la caja; si la primera respuesta (encendido) llega después
 *   de la segunda (apagado), la caché se queda con el valor viejo y la caja
 *   sigue emitiendo aunque la organización la apagó. Desde la ronda 4,
 *   `refreshCustomerDisplaySettings` descarta respuestas superadas (época por
 *   organización en settings.ts).
 * - Carga inicial en vuelo que sobrevive a `stopPosDisplay` y pisaba un
 *   `primeCustomerDisplaySettings` posterior (navegación SPA POS → Configuración
 *   con la consulta lenta, se enciende el interruptor, se vuelve al POS).
 *   Desde la ronda 4 el prime prevalece y la caja arranca ENCENDIDA.
 * - StrictMode real (efecto → limpieza → efecto): start, stop, start con la
 *   consulta en vuelo deja UN listener y la caja emitiendo.
 * - Cambio de organización en caliente: el listener del arranque anterior
 *   se retira; el evento `storage` relee solo la organización nueva.
 * - `localStorage.clear()` (evento con key null) y claves ajenas no releen.
 * - `notifyCustomerDisplaySettingsChanged` con storage que lanza no rompe el guardado.
 * - `applyPosDisplaySettings` tras `stopPosDisplay` no reabre transporte.
 * - Persistencia: el upsert no lleva `branch_id` (el ajuste es de la
 *   organización) y `settings` es un objeto plano.
 * - i18n: el texto de `closeFromOpener` cita la palabra con la que empieza
 *   `menu.open` en cada idioma («Abrir»/“Open”/« Ouvrir »/“Abrir”).
 *
 * Fixtures ficticios (org 120 / org 121). Sin Supabase real: el cliente se simula
 * con una cola de lecturas demorables UNA a UNA (a diferencia del `gate`
 * único de la ronda 2), para poder resolverlas fuera de orden.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  clearCustomerDisplaySettingsCache,
  getCachedCustomerDisplaySettings,
  primeCustomerDisplaySettings,
} from '@/lib/pos/display/settings';

// ---------------------------------------------------------------------------
// Supabase simulado con lecturas demorables una a una
// ---------------------------------------------------------------------------

type Row = { settings: unknown } | null;

interface PendingRead {
  /** Instantánea de la fila en el instante de la consulta (como una BD real). */
  snapshot: Row;
  resolve: () => void;
}

const db: {
  row: Row;
  upsertError: { message: string } | null;
  upserts: Array<{ payload: Record<string, unknown>; options: Record<string, unknown> }>;
  reads: number;
  /** true: cada lectura se encola y solo responde cuando se llama a `release(i)`. */
  hold: boolean;
  pending: PendingRead[];
} = { row: null, upsertError: null, upserts: [], reads: 0, hold: false, pending: [] };

const marks: Array<[string, string]> = [];
let markStorageThrows = false;

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          db.reads += 1;
          const snapshot = db.row;
          if (db.hold) {
            await new Promise<void>((resolve) => {
              db.pending.push({ snapshot, resolve });
            });
          }
          return { data: snapshot, error: null };
        },
        upsert: async (payload: Record<string, unknown>, options: Record<string, unknown>) => {
          db.upserts.push({ payload, options });
          if (!db.upsertError) db.row = { settings: payload.settings };
          return { error: db.upsertError };
        },
      };
      return chain;
    },
  },
}));

let orgId = 120;
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => orgId,
  getCurrentBranchId: () => 7,
}));

type StorageListener = (event: { key: string | null }) => void;
const fakeWindow = {
  listeners: [] as StorageListener[],
  addEventListener(_type: 'storage', listener: StorageListener) {
    this.listeners.push(listener);
  },
  removeEventListener(_type: 'storage', listener: StorageListener) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  },
  fire(key: string | null) {
    for (const l of [...this.listeners]) l({ key });
  },
  localStorage: {
    setItem: (k: string, v: string) => {
      if (markStorageThrows) throw new Error('QuotaExceededError');
      marks.push([k, v]);
    },
    getItem: () => null,
  },
};
const g = globalThis as unknown as { window?: unknown };

// eslint-disable-next-line @typescript-eslint/no-require-imports
const posDisplay = require('@/lib/pos/display/posDisplay') as typeof import('@/lib/pos/display/posDisplay');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConfiguracionService } = require('@/components/pos/configuracion/configuracionService') as typeof import('@/components/pos/configuracion/configuracionService');

async function flush(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await new Promise<void>((r) => setImmediate(r));
}

/** Responde la lectura encolada en la posición `index` (orden de llegada). */
function release(index: number): void {
  const read = db.pending[index];
  if (!read) throw new Error(`no hay lectura pendiente #${index}`);
  read.resolve();
}

beforeEach(() => {
  g.window = fakeWindow;
  fakeWindow.listeners = [];
  marks.length = 0;
  markStorageThrows = false;
  orgId = 120;
  db.row = null;
  db.upsertError = null;
  db.upserts = [];
  db.reads = 0;
  db.hold = false;
  db.pending = [];
  clearCustomerDisplaySettingsCache();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  posDisplay.stopPosDisplay();
  // Cualquier lectura que quede encolada se libera para no dejar promesas colgadas.
  for (const read of db.pending) read.resolve();
  delete g.window;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Relecturas fuera de orden
// ---------------------------------------------------------------------------

describe('evento storage · dos relecturas que responden fuera de orden', () => {
  it('encender y apagar seguidos en Configuración: si la respuesta «encendido» llega la última, la caja queda APAGADA (estado real de la BD)', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(false);

    db.hold = true;
    // Configuración (otra ventana) enciende: la caja relee → lectura #0 con instantánea `true`.
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    // Configuración apaga acto seguido: la caja relee → lectura #1 con instantánea `false`.
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(db.pending).toHaveLength(2);

    // La respuesta más reciente (apagado) llega primero; la vieja (encendido) después.
    release(1);
    await flush();
    release(0);
    await flush();

    // La BD dice apagado: la caja no debería emitir.
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(false);
    expect(emitter.isEmitting).toBe(false);
  });

  it('la respuesta superada se descarta: la caja NO abre transporte con la respuesta vieja (la BD está en false)', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    db.hold = true;
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    release(1);
    await flush();
    expect(emitter.isEmitting).toBe(false);
    release(0);
    await flush();
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(false);
    expect(emitter.isEmitting).toBe(false);
  });

  it('en orden (lo habitual) el último guardado manda: apagado', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    db.hold = true;
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    release(0);
    await flush();
    expect(emitter.isEmitting).toBe(true);
    release(1);
    await flush();
    expect(emitter.isEmitting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Carga inicial en vuelo que pisa un prime posterior
// ---------------------------------------------------------------------------

describe('carga inicial lenta que sobrevive a stopPosDisplay (navegación SPA POS → Configuración → POS)', () => {
  it('se enciende en Configuración mientras la carga del POS sigue en vuelo: al volver al POS la caja arranca ENCENDIDA', async () => {
    // Fila ausente (apagado) y consulta lenta.
    db.hold = true;
    const first = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    expect(db.pending).toHaveLength(1);

    // El cajero sale del POS (la consulta sigue viajando) y entra a Configuración.
    posDisplay.stopPosDisplay();

    // Guarda «encendido»: el servicio lee la fila (lectura #1) y hace upsert; fija la caché en true.
    const save = ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    await flush();
    release(1);
    await save;
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);

    // Ahora responde la consulta vieja del POS con su instantánea «sin fila».
    release(0);
    await first;
    await flush();

    // La caché debería seguir reflejando lo recién guardado…
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    // …y al volver al POS la caja arranca encendida sin consultar.
    db.hold = false;
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
  });

  it('la carga vieja NO pisa el prime: el POS arranca encendido sin volver a consultar', async () => {
    db.hold = true;
    const first = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    posDisplay.stopPosDisplay();
    const save = ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    await flush();
    release(1);
    await save;
    release(0);
    await first;
    await flush();
    expect(db.row).toEqual({ settings: { enabled: true } });
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    db.hold = false;
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    expect(db.reads).toBe(2); // no volvió a consultar: la caché ya tenía el valor recién guardado
  });
});

// ---------------------------------------------------------------------------
// StrictMode y cambio de organización
// ---------------------------------------------------------------------------

describe('startPosDisplay · secuencias reales de React', () => {
  it('StrictMode (efecto → limpieza → efecto) con la consulta en vuelo: un listener y la caja emitiendo', async () => {
    db.row = { settings: { enabled: true } };
    db.hold = true;
    let cancelled1 = false;
    const p1 = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP', isCancelled: () => cancelled1 });
    // Limpieza del primer efecto.
    cancelled1 = true;
    posDisplay.stopPosDisplay();
    // Segundo efecto.
    const p2 = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP', isCancelled: () => false });
    await flush();
    // La carga está compartida (inflight): una sola lectura.
    expect(db.reads).toBe(1);
    expect(fakeWindow.listeners).toHaveLength(1);
    release(0);
    const [e1, e2] = await Promise.all([p1, p2]);
    expect(e1).toBe(e2);
    expect(fakeWindow.listeners).toHaveLength(1);
    expect(e2.isEmitting).toBe(true);
  });

  it('cambio de organización en caliente: el listener del arranque anterior se retira y el evento storage relee solo la nueva', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    primeCustomerDisplaySettings(121, { enabled: false });
    const e1 = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(e1.isEmitting).toBe(true);
    // La página para y vuelve a arrancar con la organización nueva.
    posDisplay.stopPosDisplay();
    orgId = 121;
    const e2 = await posDisplay.startPosDisplay({ organizationId: 121, currency: 'USD' });
    expect(e2).toBe(e1);
    expect(e2.isEmitting).toBe(false);
    expect(fakeWindow.listeners).toHaveLength(1);
    // Otra ventana enciende la 121.
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(db.reads).toBe(1);
    expect(e2.isEmitting).toBe(true);
    // La caché de la 120 no se tocó.
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
  });

  it('localStorage.clear() (evento con key null) y claves ajenas no releen', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    fakeWindow.fire(null);
    fakeWindow.fire('pos_carts_120');
    fakeWindow.fire('pos_terminal_id');
    fakeWindow.fire('pos_display_hint_shown');
    await flush();
    expect(db.reads).toBe(0);
    expect(emitter.isEmitting).toBe(true);
  });

  it('applyPosDisplaySettings tras stopPosDisplay no reabre transporte (la página ya no existe)', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    posDisplay.stopPosDisplay();
    expect(emitter.isEmitting).toBe(false);
    posDisplay.applyPosDisplaySettings();
    expect(emitter.isEmitting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Servicio de persistencia
// ---------------------------------------------------------------------------

describe('ConfiguracionService.saveCustomerDisplayConfig · bordes', () => {
  it('storage que lanza al escribir la marca: el guardado NO falla y devuelve lo guardado', async () => {
    markStorageThrows = true;
    await expect(ConfiguracionService.saveCustomerDisplayConfig({ enabled: true })).resolves.toEqual({ enabled: true });
    expect(db.upserts).toHaveLength(1);
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
  });

  it('el ajuste es de la organización: el upsert no lleva branch_id y settings es un objeto plano con enabled booleano', async () => {
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    const [{ payload, options }] = db.upserts;
    expect(Object.keys(payload).sort()).toEqual(['key', 'organization_id', 'settings', 'updated_at']);
    expect(payload.organization_id).toBe(120);
    expect(payload.key).toBe('pos_customer_display');
    expect(options).toEqual({ onConflict: 'organization_id,key' });
    expect(payload.settings).toEqual({ enabled: true });
    expect(typeof payload.updated_at).toBe('string');
    expect(Number.isNaN(Date.parse(payload.updated_at as string))).toBe(false);
  });

  it('la organización cambia entre dos guardados: cada upsert va a la organización de SU sesión y cada caché a la suya', async () => {
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    orgId = 121;
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: false });
    expect(db.upserts.map((u) => u.payload.organization_id)).toEqual([120, 121]);
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(true);
    expect(getCachedCustomerDisplaySettings(121).enabled).toBe(false);
  });

  it('upsert con error: la caché NO se fija con el valor no guardado', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    db.upsertError = { message: 'RLS' };
    await expect(ConfiguracionService.saveCustomerDisplayConfig({ enabled: true })).rejects.toBeDefined();
    expect(getCachedCustomerDisplaySettings(120).enabled).toBe(false);
    expect(marks).toHaveLength(0);
  });

  it('config vacío ({}) no cambia el valor de la fila y sigue escribiendo la marca (idempotente)', async () => {
    db.row = { settings: { enabled: true, tips: { enabled: true } } };
    const saved = await ConfiguracionService.saveCustomerDisplayConfig({});
    expect(saved).toEqual({ enabled: true });
    expect(db.upserts[0].payload.settings).toEqual({ enabled: true, tips: { enabled: true } });
  });
});

// ---------------------------------------------------------------------------
// i18n y comprobaciones estáticas
// ---------------------------------------------------------------------------

describe('i18n · coherencia entre el aviso closeFromOpener y el ítem «Abrir»', () => {
  const root = path.resolve(__dirname, '../../..');
  const locales = ['es', 'en', 'fr', 'pt'] as const;

  it.each(locales)('%s: closeFromOpener cita la primera palabra de menu.open', (locale) => {
    const messages = JSON.parse(fs.readFileSync(path.join(root, 'messages', `${locale}.json`), 'utf8')) as {
      posCustomerDisplay: { menu: { open: string }; toast: { closeFromOpener: string } };
    };
    const firstWord = messages.posCustomerDisplay.menu.open.split(/\s+/)[0];
    expect(messages.posCustomerDisplay.toast.closeFromOpener).toContain(firstWord);
  });

  it('ningún componente de la Parte D importa resolveNativePosDisplayApi (criterio único: canCloseViaNativeBridge)', () => {
    const indicator = fs.readFileSync(path.join(root, 'src/components/pos/display/CustomerDisplayIndicator.tsx'), 'utf8');
    const card = fs.readFileSync(path.join(root, 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');
    expect(indicator).not.toContain('resolveNativePosDisplayApi');
    expect(card).not.toContain('resolveNativePosDisplayApi');
    expect(indicator).toContain('canCloseViaNativeBridge()');
  });

  it('la tarjeta deja anotado que propina y calificación llegan en F2 y no pinta controles de ellas', () => {
    const card = fs.readFileSync(path.join(root, 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');
    expect(card).toMatch(/Fase 2/);
    expect(card).not.toMatch(/tips\.enabled|rating\.enabled/);
    // Un solo interruptor: el maestro.
    expect(card.match(/<Switch/g)).toHaveLength(1);
  });

  it('la tarjeta lee el valor al montar (getCustomerDisplayConfig) y aplica la caché tras guardar (applyPosDisplaySettings, sin refreshPosDisplay)', () => {
    const card = fs.readFileSync(path.join(root, 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');
    expect(card).toContain('ConfiguracionService.getCustomerDisplayConfig()');
    expect(card).toContain('applyPosDisplaySettings()');
    expect(card).not.toContain('refreshPosDisplay');
  });

  it('el modal de la tarjeta sigue el patrón de ConfigModals (PantallaClienteModal → ConfigModal) y la página lo abre como al resto', () => {
    const modals = fs.readFileSync(path.join(root, 'src/components/pos/configuracion/ConfigModals.tsx'), 'utf8');
    const page = fs.readFileSync(path.join(root, 'src/components/pos/configuracion/ConfiguracionPage.tsx'), 'utf8');
    expect(modals).toMatch(/export function PantallaClienteModal[\s\S]*<ConfigModal[\s\S]*<PantallaClienteContent embedded \/>/);
    expect(page).toContain('setShowPantallaCliente(true)');
    expect(page).toMatch(/<PantallaClienteModal open=\{showPantallaCliente\} onOpenChange=\{setShowPantallaCliente\} \/>/);
    // Sin textos cableados en la tarjeta de la página: título y subtítulo por i18n.
    expect(page).toContain("tPantallaCliente('title')");
    expect(page).toContain("tPantallaCliente('subtitle')");
  });
});
