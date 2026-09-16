/**
 * Tester · Parte D (indicador en el POS y tarjeta de Configuración › POS),
 * ronda 2. Casos que las suites del builder no cubren tras las correcciones:
 *
 * - Anti-bloqueo de emergentes: `window.open` debe ejecutarse en el tramo
 *   SÍNCRONO de `openCustomerDisplay` (antes de cualquier `await`), o el
 *   navegador pierde la activación del gesto y bloquea la ventana.
 * - Doble clic en «Abrir»: dos llamadas sin esperar abren UNA ventana.
 * - Puente nativo cuyo `open()` falla y cuyo `close()` triunfa: la ventana
 *   web de respaldo se cierra también (corregido en ronda 3).
 * - Servicio: la marca `pos_customer_display_changed` solo se escribe tras un
 *   upsert exitoso; filas con `settings` no-objeto; `enabled: undefined` se
 *   ignora y conserva el valor de la fila (corregido en ronda 3).
 * - Canal de ajustes: arranques concurrentes (StrictMode), stop con la carga
 *   en vuelo, evento `storage` que llega mientras el arranque carga (se
 *   relee al terminar: corregido en ronda 3), relectura que falla en el
 *   evento `storage` (conserva el valor anterior y sigue emitiendo:
 *   corregido en ronda 3), refresh sin organización.
 *
 * Fixtures ficticios (org 120). Sin Supabase real: el cliente se simula.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  __resetCustomerDisplayWindowForTests,
  closeCustomerDisplay,
  getOpenedCustomerDisplayWindow,
  openCustomerDisplay,
  type DisplayWindowHandle,
  type DisplayWindowOpener,
  type HintStorage,
} from '@/lib/pos/display/openDisplay';
import { clearCustomerDisplaySettingsCache, primeCustomerDisplaySettings } from '@/lib/pos/display/settings';
import * as settingsModule from '@/lib/pos/display/settings';

// ---------------------------------------------------------------------------
// Supabase simulado (organization_settings) con lectura demorable
// ---------------------------------------------------------------------------

type Row = { settings: unknown } | null;
const db: {
  row: Row;
  readError: { message: string } | null;
  readThrows: boolean;
  upsertError: { message: string } | null;
  upserts: Array<{ payload: Record<string, unknown>; options: Record<string, unknown> }>;
  reads: number;
  /** Si está definido, cada lectura espera a que se resuelva antes de responder. */
  gate: Promise<void> | null;
} = { row: null, readError: null, readThrows: false, upsertError: null, upserts: [], reads: 0, gate: null };

const marks: Array<[string, string]> = [];

jest.mock('@/lib/supabase/config', () => ({
  supabase: {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => {
          db.reads += 1;
          // Instantánea al ejecutar la consulta (como una BD real): lo que se
          // escriba mientras la respuesta viaja no cambia lo que se devuelve.
          const snapshot = db.row;
          if (db.gate) await db.gate;
          if (db.readThrows) throw new Error('red caída');
          return db.readError ? { data: null, error: db.readError } : { data: snapshot, error: null };
        },
        upsert: async (payload: Record<string, unknown>, options: Record<string, unknown>) => {
          db.upserts.push({ payload, options });
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
    setItem: (k: string, v: string) => void marks.push([k, v]),
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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function fakeHandle(): DisplayWindowHandle & { focus: jest.Mock; close: jest.Mock } {
  const handle = {
    closed: false,
    focus: jest.fn(),
    close: jest.fn(() => {
      handle.closed = true;
    }),
  };
  return handle;
}
function fakeOpener(handle: DisplayWindowHandle | null): DisplayWindowOpener & { open: jest.Mock } {
  return { open: jest.fn(() => handle) };
}
function memoryStorage(): HintStorage {
  const data: Record<string, string> = {};
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = v) };
}

beforeEach(() => {
  g.window = fakeWindow;
  fakeWindow.listeners = [];
  marks.length = 0;
  orgId = 120;
  db.row = null;
  db.readError = null;
  db.readThrows = false;
  db.upsertError = null;
  db.upserts = [];
  db.reads = 0;
  db.gate = null;
  clearCustomerDisplaySettingsCache();
  __resetCustomerDisplayWindowForTests();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  posDisplay.stopPosDisplay();
  delete g.window;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// openDisplay · gesto del usuario y concurrencia
// ---------------------------------------------------------------------------

describe('openCustomerDisplay · gesto del usuario (anti-bloqueo de emergentes)', () => {
  it('sin puente nativo, window.open corre en el tramo síncrono: antes de que el llamador llegue a await', () => {
    const win = fakeOpener(fakeHandle());
    const pending = openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: null });
    // Sin ceder al bucle de eventos: si esto fallara, Chrome/Edge bloquearían la emergente.
    expect(win.open).toHaveBeenCalledTimes(1);
    return pending;
  });

  it('doble clic en «Abrir» (dos llamadas sin esperar): una sola ventana y la segunda solo enfoca', async () => {
    const handle = fakeHandle();
    const win = fakeOpener(handle);
    const storage = memoryStorage();
    const [a, b] = await Promise.all([
      openCustomerDisplay({ win, storage, nativeApi: null }),
      openCustomerDisplay({ win, storage, nativeApi: null }),
    ]);
    expect(a).toEqual({ via: 'web', firstTime: true });
    expect(b).toEqual({ via: 'focused' });
    expect(win.open).toHaveBeenCalledTimes(1);
    expect(handle.focus).toHaveBeenCalledTimes(1);
  });

  it('puente nativo lento: dos clics esperan al puente y NO abren emergente web mientras tanto', async () => {
    const gate = deferred();
    const api = { open: jest.fn(() => gate.promise) };
    const win = fakeOpener(fakeHandle());
    const p1 = openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api });
    const p2 = openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api });
    await flush();
    expect(win.open).not.toHaveBeenCalled();
    gate.resolve();
    expect(await p1).toEqual({ via: 'electron' });
    expect(await p2).toEqual({ via: 'electron' });
    expect(win.open).not.toHaveBeenCalled();
  });
});

describe('closeCustomerDisplay · puente parcial (hallazgo r2, corregido r3)', () => {
  // Escenario F1: el puente existe pero open() falló (monitor ausente) y se
  // abrió la ventana web de respaldo. Al cerrar, el puente responde OK a
  // close() (no tenía nada que cerrar); closeCustomerDisplay devuelve
  // 'electron' Y cierra además la referencia propia: nada queda huérfano.
  it('tras caer al camino web, «Cerrar» con puente que sí cierra cierra TAMBIÉN la ventana web de respaldo', async () => {
    const handle = fakeHandle();
    const win = fakeOpener(handle);
    const api = { open: () => Promise.reject(new Error('monitor no disponible')), close: jest.fn(() => Promise.resolve()) };
    expect(await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api })).toEqual({ via: 'web', firstTime: true });
    expect(getOpenedCustomerDisplayWindow()).toBe(handle);

    await closeCustomerDisplay({ nativeApi: api });
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(getOpenedCustomerDisplayWindow()).toBeNull();
  });

  it('sigue devolviendo "electron" (el puente cerró) y la referencia web queda olvidada', async () => {
    const handle = fakeHandle();
    const win = fakeOpener(handle);
    const api = { open: () => Promise.reject(new Error('monitor no disponible')), close: jest.fn(() => Promise.resolve()) };
    await openCustomerDisplay({ win, storage: memoryStorage(), nativeApi: api });
    expect(await closeCustomerDisplay({ nativeApi: api })).toBe('electron');
    expect(api.close).toHaveBeenCalledTimes(1);
    expect(handle.close).toHaveBeenCalledTimes(1);
    expect(getOpenedCustomerDisplayWindow()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Servicio · marca de cambio y filas raras
// ---------------------------------------------------------------------------

describe('ConfiguracionService.saveCustomerDisplayConfig · marca de cambio', () => {
  it('escribe la marca pos_customer_display_changed UNA vez y solo DESPUÉS del upsert exitoso', async () => {
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    expect(db.upserts).toHaveLength(1);
    expect(marks).toHaveLength(1);
    expect(marks[0][0]).toBe(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    expect(Number(marks[0][1])).toBeGreaterThan(0);
  });

  it('upsert con error: no se escribe la marca (las otras cajas no releen un valor que no cambió)', async () => {
    db.upsertError = { message: 'RLS' };
    await expect(ConfiguracionService.saveCustomerDisplayConfig({ enabled: true })).rejects.toEqual({ message: 'RLS' });
    expect(marks).toHaveLength(0);
  });

  it('lectura previa con error: no se escribe la marca ni hay upsert', async () => {
    db.readError = { message: 'timeout' };
    await expect(ConfiguracionService.saveCustomerDisplayConfig({ enabled: false })).rejects.toEqual({ message: 'timeout' });
    expect(db.upserts).toHaveLength(0);
    expect(marks).toHaveLength(0);
  });

  it('dos guardados seguidos escriben dos marcas distintas (Date.now avanza) para que el evento storage dispare ambas veces', async () => {
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    await new Promise<void>((r) => setTimeout(r, 2));
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: false });
    expect(marks).toHaveLength(2);
    expect(marks[0][1]).not.toBe(marks[1][1]);
  });
});

describe('ConfiguracionService · filas con settings no-objeto', () => {
  it.each([
    ['array', []],
    ['string', 'true'],
    ['number', 1],
    ['null', null],
  ])('settings = %s: la carga devuelve apagado y raw {}', async (_label, settings) => {
    db.row = { settings };
    const { settings: parsed, raw } = await ConfiguracionService.getCustomerDisplayConfig();
    expect(parsed).toEqual({ enabled: false });
    expect(raw).toEqual({});
  });

  it('settings = array: el guardado no esparce índices ni claves raras en el upsert', async () => {
    db.row = { settings: ['a', 'b'] };
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    expect(db.upserts[0].payload.settings).toEqual({ enabled: true });
  });

  it('config con enabled: undefined (Partial): se ignora la clave y se conserva el true de la fila', async () => {
    db.row = { settings: { enabled: true, tips: { enabled: true } } };
    const saved = await ConfiguracionService.saveCustomerDisplayConfig({ enabled: undefined });
    // Ningún llamador de la Fase 0 pasa undefined (la tarjeta pasa siempre
    // booleano), pero la Fase 2 amplía el Partial y el merge debe filtrarlo.
    const payload = db.upserts[0].payload.settings as Record<string, unknown>;
    expect(payload).toEqual({ enabled: true, tips: { enabled: true } });
    expect(saved).toEqual({ enabled: true });
  });
});

// ---------------------------------------------------------------------------
// Canal de ajustes entre ventanas · carreras
// ---------------------------------------------------------------------------

describe('startPosDisplay · carreras del arranque', () => {
  it('dos arranques concurrentes (StrictMode) comparten la consulta, dejan UN listener y el emisor arranca una vez', async () => {
    db.row = { settings: { enabled: true } };
    const gate = deferred();
    db.gate = gate.promise;
    const p1 = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    const p2 = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    expect(db.reads).toBe(1);
    // Ronda 3: el listener se registra ANTES de la carga (para no perder un
    // guardado en vuelo); el segundo arranque sustituye al primero: sigue siendo uno.
    expect(fakeWindow.listeners).toHaveLength(1);
    gate.resolve();
    const [e1, e2] = await Promise.all([p1, p2]);
    expect(e1).toBe(e2);
    expect(fakeWindow.listeners).toHaveLength(1);
    expect(e1.isEmitting).toBe(true);
  });

  it('stopPosDisplay con la carga en vuelo: al resolverse no registra listener ni abre transporte', async () => {
    db.row = { settings: { enabled: true } };
    const gate = deferred();
    db.gate = gate.promise;
    const p = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    posDisplay.stopPosDisplay();
    gate.resolve();
    const emitter = await p;
    expect(fakeWindow.listeners).toHaveLength(0);
    expect(emitter.isEmitting).toBe(false);
  });

  // Hallazgo r2 (corregido r3): el listener de `storage` se registra ANTES
  // de la carga. Si Configuración guarda «encendido» en otra ventana mientras
  // la caja aún carga el interruptor (que responde con el valor viejo), se
  // anota y al terminar la carga se relee una vez: la caja acaba emitiendo.
  it('evento storage que llega mientras el arranque carga el interruptor: la caja acaba emitiendo', async () => {
    db.row = { settings: { enabled: false } };
    const gate = deferred();
    db.gate = gate.promise;
    const p = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    // Otra ventana guarda «encendido» y escribe la marca mientras la lectura está en vuelo.
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    gate.resolve();
    const emitter = await p;
    await flush();
    expect(emitter.isEmitting).toBe(true);
  });

  it('el evento en vuelo produce exactamente UNA relectura extra, después de la carga (2 lecturas en total)', async () => {
    db.row = { settings: { enabled: false } };
    const gate = deferred();
    db.gate = gate.promise;
    const p = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY); // dos guardados seguidos: una sola relectura al terminar
    await flush();
    expect(db.reads).toBe(1); // durante la carga no se dispara ninguna consulta extra
    gate.resolve();
    const emitter = await p;
    await flush();
    expect(db.reads).toBe(2);
    expect(emitter.isEmitting).toBe(true);
  });

  it('el evento en vuelo NO relee si la caja se detuvo antes de que la carga terminara', async () => {
    db.row = { settings: { enabled: false } };
    const gate = deferred();
    db.gate = gate.promise;
    const p = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    await flush();
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    posDisplay.stopPosDisplay();
    gate.resolve();
    const emitter = await p;
    await flush();
    expect(db.reads).toBe(1);
    expect(fakeWindow.listeners).toHaveLength(0);
    expect(emitter.isEmitting).toBe(false);
  });

  it('isCancelled true al terminar la carga: retira el listener registrado antes de la carga', async () => {
    db.row = { settings: { enabled: true } };
    let cancelled = false;
    const gate = deferred();
    db.gate = gate.promise;
    const p = posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP', isCancelled: () => cancelled });
    await flush();
    expect(fakeWindow.listeners).toHaveLength(1);
    cancelled = true;
    gate.resolve();
    const emitter = await p;
    expect(fakeWindow.listeners).toHaveLength(0);
    expect(emitter.isEmitting).toBe(false);
  });
});

describe('evento storage · relectura que falla (hallazgo r2, corregido r3)', () => {
  it('caja encendida, la relectura lanza: se conserva el valor anterior y el emisor SIGUE emitiendo', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);

    db.readThrows = true;
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    // Un fallo transitorio de red en el instante en que otra ventana guarda no
    // apaga una caja en plena venta: la caché conserva «encendido».
    expect(db.reads).toBe(1);
    expect(emitter.isEmitting).toBe(true);
    expect(settingsModule.isCustomerDisplayEnabled(120)).toBe(true);
  });

  it('caja encendida, la relectura devuelve error de Supabase (no lanza): mismo resultado, sigue encendida', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    db.readError = { message: 'timeout' };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(emitter.isEmitting).toBe(true);
  });

  it('caja apagada, la relectura falla: sigue apagada (no se enciende sola)', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    db.readError = { message: 'timeout' };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(emitter.isEmitting).toBe(false);
  });

  it('relectura que falla y luego otra que triunfa: aplica el valor nuevo', async () => {
    primeCustomerDisplaySettings(120, { enabled: true });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    db.readError = { message: 'timeout' };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(emitter.isEmitting).toBe(true);
    db.readError = null;
    db.row = { settings: { enabled: false } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush();
    expect(emitter.isEmitting).toBe(false);
  });

  it('un evento por cada guardado: 3 marcas seguidas producen 3 relecturas (sin deduplicar) y el estado final manda', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    db.row = { settings: { enabled: true } };
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    fakeWindow.fire(posDisplay.CUSTOMER_DISPLAY_SETTINGS_CHANGED_KEY);
    await flush(8);
    expect(db.reads).toBeGreaterThanOrEqual(1);
    expect(db.reads).toBeLessThanOrEqual(3);
    expect(emitter.isEmitting).toBe(true);
  });
});

describe('refreshPosDisplay · sin organización o sin caja arrancada', () => {
  it('sin organización en sesión (0): no consulta y no lanza', async () => {
    orgId = 0;
    await expect(posDisplay.refreshPosDisplay()).resolves.toBeUndefined();
    expect(db.reads).toBe(0);
  });

  it('en la ventana de Configuración (emisor nunca arrancado): relee una vez y no abre transporte', async () => {
    db.row = { settings: { enabled: true } };
    await posDisplay.refreshPosDisplay(120);
    expect(db.reads).toBe(1);
    expect(posDisplay.getPosDisplayEmitter().isEmitting).toBe(false);
  });

  it('guardar desde la tarjeta en la MISMA ventana que la caja: save + refreshPosDisplay enciende sin evento storage', async () => {
    primeCustomerDisplaySettings(120, { enabled: false });
    const emitter = await posDisplay.startPosDisplay({ organizationId: 120, currency: 'COP' });
    expect(emitter.isEmitting).toBe(false);
    db.row = { settings: { enabled: false } };
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: true });
    db.row = { settings: { enabled: true } }; // lo que quedó en la BD
    await posDisplay.refreshPosDisplay();
    expect(emitter.isEmitting).toBe(true);
    // Y apagar de nuevo:
    await ConfiguracionService.saveCustomerDisplayConfig({ enabled: false });
    db.row = { settings: { enabled: false } };
    await posDisplay.refreshPosDisplay();
    expect(emitter.isEmitting).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Comprobaciones estáticas de los .tsx (fuera de testMatch: no se renderizan)
// ---------------------------------------------------------------------------

describe('estático · indicador y tarjeta', () => {
  const root = path.resolve(__dirname, '../../..');
  const indicator = fs.readFileSync(path.join(root, 'src/components/pos/display/CustomerDisplayIndicator.tsx'), 'utf8');
  const card = fs.readFileSync(path.join(root, 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'src/app/app/pos/page.tsx'), 'utf8');

  it('el indicador espera (await) a open/close, que ahora son asíncronas', () => {
    expect(indicator).toMatch(/await openCustomerDisplay\(\)/);
    expect(indicator).toMatch(/await closeCustomerDisplay\(\)/);
    expect(card).toMatch(/await openCustomerDisplay\(\)/);
  });

  it('«Cerrar» se deshabilita solo cuando no hay presencia, ni ventana propia, ni puente que SEPA cerrar (mismo criterio que closeCustomerDisplay)', () => {
    expect(indicator).toMatch(/!connected\s*&&\s*!hasOwnWindow\s*&&\s*!canCloseViaNativeBridge\(\)/);
    expect(indicator).not.toMatch(/resolveNativePosDisplayApi/);
    expect(indicator).toMatch(/disabled=\{nothingToClose\}/);
  });

  it('el menú es controlado (relee la referencia propia al abrirse)', () => {
    expect(indicator).toMatch(/<DropdownMenu open=\{menuOpen\} onOpenChange=\{setMenuOpen\}>/);
  });

  it('el aviso closeFromOpener se muestra cuando el cierre devuelve "none"', () => {
    expect(indicator).toMatch(/result === 'none'/);
    expect(indicator).toMatch(/t\('toast\.closeFromOpener'\)/);
  });

  it('la tarjeta revierte el interruptor si el guardado falla y lo deshabilita mientras guarda', () => {
    expect(card).toMatch(/setSettings\(previous\)/);
    expect(card).toMatch(/disabled=\{saving\}/);
  });

  it('la tarjeta aplica la caché que fijó el servicio (applyPosDisplaySettings) y NO relee la BD tras guardar', () => {
    // La caché la fija el servicio tras el upsert (primeCustomerDisplaySettings), no la tarjeta.
    expect(card).not.toMatch(/primeCustomerDisplaySettings/);
    expect(card).not.toMatch(/refreshPosDisplay/);
    expect(card).toMatch(/applyPosDisplaySettings\(\)/);
  });

  it('el texto de closeFromOpener es neutro: no afirma quién abrió la pantalla, no cita atajos de un SO y no promete que «Abrir» siempre la recupera', () => {
    for (const lang of ['es', 'en', 'fr', 'pt']) {
      const messages = JSON.parse(fs.readFileSync(path.join(root, `messages/${lang}.json`), 'utf8')) as {
        posCustomerDisplay: { toast: { closeFromOpener: string } };
      };
      const text = messages.posCustomerDisplay.toast.closeFromOpener;
      // Alt+F4 es de Windows; en macOS no hace nada. Cmd+W/Cmd+Q tampoco: la salida es «desde su propia ventana».
      expect(text).not.toMatch(/Alt\s*\+\s*F4|Cmd\s*\+/i);
      expect(text).not.toMatch(/otra ventana|another window|autre fenêtre|outra janela/i);
      // «Abrir» solo recupera la ventana si la abrió esta misma caja antes de recargar (openDisplay.ts): el texto lo condiciona.
      expect(text).toMatch(/recargar|reloading|recharger|recarregar/i);
    }
  });

  it('la página del POS no arranca el emisor sin organización y limpia con cancelled + stopPosDisplay', () => {
    expect(page).toMatch(/if \(!orgId\) return;/);
    expect(page).toMatch(/isCancelled: \(\) => cancelled/);
    expect(page).toMatch(/cancelled = true;[\s\S]{0,300}stopPosDisplay\(\);/);
  });

  it('el toast del aviso de arrastrar dura 8 s y el de emergente bloqueada es destructive (ambos por useToast de shadcn)', () => {
    for (const src of [indicator, card]) {
      expect(src).toMatch(/from '@\/components\/ui\/use-toast'/);
      expect(src).toMatch(/duration: 8000/);
      expect(src).toMatch(/variant: 'destructive'/);
      expect(src).not.toMatch(/from 'sonner'/);
    }
  });

  it('el Toaster del layout deja que `duration` del toast pise el valor por defecto (props después de duration)', () => {
    const toaster = fs.readFileSync(path.join(root, 'src/components/ui/toaster.tsx'), 'utf8');
    expect(toaster).toMatch(/duration=\{[^}]+\}\s*\{\.\.\.props\}/);
  });
});
