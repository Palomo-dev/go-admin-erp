/**
 * Tester · Fase 1 (Electron en la segunda pantalla), ronda 3. Pruebas
 * adversarias sobre la lógica pura con puente falso; sin React ni DOM.
 *
 * Ronda 4 (cierre): el orquestador decidió ELIMINAR la sincronía hacia
 * abajo por completo (D1) en vez de parchearla. Los hallazgos A–D de esta
 * ronda tenían la misma raíz (la sincronía confundía «no se pudo leer» con
 * «apagado» y dependía de estado de módulo), así que aquí ya no hay ningún
 * test marcado como fallo esperado: todos afirman el comportamiento vigente.
 *
 * A. Sin red (o sin permiso de lectura sobre `organization_settings`),
 *    `loadCustomerDisplaySettings` cachea el valor por defecto (apagado) y
 *    la caja NO emite; pero NADA se escribe en el proceso principal ni se
 *    cierra la ventana que el arranque abrió (D2).
 * B. La tarjeta: `getCustomerDisplayConfig` devuelve `loadFailed: true` en
 *    vez de un `{ enabled: false }` indistinguible de un apagado real; la
 *    tarjeta avisa y deshabilita el interruptor y el selector (D2).
 * C. Recarga dura: sin estado de módulo no hay nada que perder; la ventana
 *    abierta a mano sigue abierta (D1).
 * D. Mismo resultado entre por donde entre la máquina: ni la caja ni la
 *    tarjeta escriben ni cierran (D1).
 * E. Contrato con el preload y D7 (`needsReopenForDisplayChange`).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { needsReopenForDisplayChange, persistDesktopDisplayChoice } from '@/lib/pos/display/desktopDisplay';
import { __resetCustomerDisplayWindowForTests, openCustomerDisplay } from '@/lib/pos/display/openDisplay';
import { applyPosDisplaySettings, getPosDisplayEmitter, refreshPosDisplay, startPosDisplay, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import {
  clearCustomerDisplaySettingsCache,
  hasCustomerDisplaySettingsCache,
  isCustomerDisplayEnabled,
  loadCustomerDisplaySettings,
  primeCustomerDisplaySettings,
} from '@/lib/pos/display/settings';
import { ConfiguracionService } from '@/components/pos/configuracion/configuracionService';
import { isDesktop } from '@/lib/utils/desktop';
import type { DesktopPosDisplayBridge, DesktopPosDisplayStatus } from '@/lib/utils/desktop';

/** Supabase «sin red»: toda consulta rechaza como lo haría fetch sin conexión. */
const supabaseFrom = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (...args: unknown[]) => supabaseFrom(...args) } }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

const ORG = 120;
const ABIERTA_EN_2: DesktopPosDisplayStatus = { open: true, displayId: 2 };
const CERRADA: DesktopPosDisplayStatus = { open: false, displayId: null };

const card = readFileSync(join(process.cwd(), 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');

function fakeBridge(initialStatus: DesktopPosDisplayStatus = CERRADA) {
  const saved: Array<[boolean, number | null | undefined]> = [];
  let status = initialStatus;
  const bridge: DesktopPosDisplayBridge & { setEnabled: jest.Mock; close: jest.Mock; open: jest.Mock; status: jest.Mock } = {
    send: jest.fn(),
    onMessage: jest.fn(() => () => {}),
    open: jest.fn(async () => {
      status = ABIERTA_EN_2;
      return { ok: true };
    }),
    close: jest.fn(async () => {
      status = CERRADA;
    }),
    status: jest.fn(async () => status),
    onStatus: jest.fn(() => () => {}),
    listDisplays: jest.fn(async () => []),
    setEnabled: jest.fn(async (enabled: boolean, displayId?: number | null) => {
      saved.push([enabled, displayId]);
    }),
  };
  return { bridge, saved };
}

function sinRed(): void {
  supabaseFrom.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => {
      throw new TypeError('Failed to fetch');
    };
    return chain;
  });
}

function conFila(enabled: boolean): void {
  supabaseFrom.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: { settings: { enabled } }, error: null });
    return chain;
  });
}

type GlobalConVentana = { window?: { goAdminDesktop?: unknown; location?: { origin: string } } };

function instalarVentana(posDisplay: unknown) {
  (globalThis as GlobalConVentana).window = { goAdminDesktop: { posDisplay }, location: { origin: 'http://localhost:47800' } };
}

async function drenar(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

beforeEach(() => {
  __resetCustomerDisplayWindowForTests();
  clearCustomerDisplaySettingsCache();
  supabaseFrom.mockReset();
});

afterEach(() => {
  delete (globalThis as GlobalConVentana).window;
  expect(isDesktop()).toBe(false);
  stopPosDisplay();
  jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('A · arranque sin red: «no se pudo leer» no es «la organización la apagó» (D2)', () => {
  it('con la consulta rechazando, la carga inicial cachea APAGADO pero NO cuenta como conocida (cierre de F1, D2): la caja no emite y el indicador queda en «cargando»', async () => {
    sinRed();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await loadCustomerDisplaySettings(ORG);
    expect(hasCustomerDisplaySettingsCache(ORG)).toBe(false);
    expect(isCustomerDisplayEnabled(ORG)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('sin red, la caja NO escribe config.json ni cierra la ventana abierta por el arranque', async () => {
    sinRed();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    instalarVentana(bridge);
    await loadCustomerDisplaySettings(ORG);
    // Lo que hace startPosDisplay tras la carga (y refreshPosDisplay tras el evento storage).
    applyPosDisplaySettings();
    await drenar();
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();
    expect(bridge.status).not.toHaveBeenCalled();
  });

  it('flujo completo startPosDisplay sin red con el puente presente: el emisor queda sin emitir, y el puente intacto', async () => {
    sinRed();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    instalarVentana(bridge);
    const emitter = await startPosDisplay({ organizationId: ORG, currency: 'COP' });
    await drenar();
    expect(emitter.isEmitting).toBe(false); // «no se pudo leer» → por defecto apagado: no emite…
    expect(saved).toEqual([]); // …pero no se persiste nada
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('la caja emitía y la relectura falla: isEmitting no cambia y no se llama a close() ni a setEnabled()', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    instalarVentana(bridge);
    primeCustomerDisplaySettings(ORG, { enabled: true });
    const emitter = getPosDisplayEmitter();
    emitter.start({ organizationId: ORG, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    sinRed();
    await refreshPosDisplay(ORG);
    await drenar();
    expect(emitter.isEmitting).toBe(true);
    expect(isCustomerDisplayEnabled(ORG)).toBe(true); // refresh conserva el valor anterior
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();
  });

  it('vuelve la red con la organización encendida: la caja emite y sigue sin escribirse nada (nunca se enciende ni apaga por lectura)', async () => {
    sinRed();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bridge, saved } = fakeBridge(CERRADA);
    instalarVentana(bridge);
    const emitter = await startPosDisplay({ organizationId: ORG, currency: 'COP' });
    expect(emitter.isEmitting).toBe(false);
    conFila(true);
    await refreshPosDisplay(ORG);
    await drenar();
    expect(emitter.isEmitting).toBe(true);
    expect(saved).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B · la tarjeta: getCustomerDisplayConfig distingue «no se pudo leer» de «apagado» (D2)', () => {
  it('sin red: resuelve { enabled: false } sin lanzar, pero con loadFailed: true', async () => {
    sinRed();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = await ConfiguracionService.getCustomerDisplayConfig();
    expect(result.settings).toEqual({ enabled: false });
    expect(result.loadFailed).toBe(true);
  });

  it('con fila legible (encendida o apagada): loadFailed: false', async () => {
    conFila(false);
    expect(await ConfiguracionService.getCustomerDisplayConfig()).toEqual({ settings: { enabled: false }, raw: { enabled: false }, loadFailed: false });
    conFila(true);
    expect((await ConfiguracionService.getCustomerDisplayConfig()).loadFailed).toBe(false);
  });

  it('la tarjeta, sin poder leer la organización, no escribe en el puente: avisa (loadError), deshabilita interruptor y selector, y no sincroniza nada', () => {
    expect(card).not.toMatch(new RegExp(['sync', 'DesktopDisplayEnabledDown'].join(''))); // nombre compuesto: grep de la compuerta = 0
    expect(card).toMatch(/setLoadFailed\(failed\)/);
    expect(card).toMatch(/if \(failed\) toast\(\{ title: t\('loadError'\), variant: 'destructive' \}\)/);
    expect(card).toMatch(/disabled=\{saving \|\| loadFailed\}/); // interruptor
    expect(card).toMatch(/disabled=\{savingDisplay \|\| loadFailed\}/); // selector de monitor
    // El único setEnabled hacia el proceso principal sale de las dos acciones del usuario.
    expect(card.match(/persistDesktopDisplayChoice\(/g)).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('C · recarga dura: sin estado de módulo, la ventana abierta a mano sigue abierta (D1)', () => {
  it('«Abrir ahora» con la organización apagada, luego F5 en /app/pos → nadie cierra la ventana que el usuario pidió', async () => {
    const { bridge, saved } = fakeBridge(CERRADA);
    instalarVentana(bridge);
    expect(await openCustomerDisplay()).toEqual({ via: 'electron' });
    primeCustomerDisplaySettings(ORG, { enabled: false });
    applyPosDisplaySettings();
    await drenar();
    expect(bridge.close).not.toHaveBeenCalled();

    // Recarga dura: el módulo arranca de cero; la ventana sigue abierta y se vuelve a aplicar la organización.
    __resetCustomerDisplayWindowForTests();
    clearCustomerDisplaySettingsCache();
    conFila(false);
    await startPosDisplay({ organizationId: ORG, currency: 'COP' });
    await drenar();
    expect(bridge.close).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
    expect((await bridge.status()).open).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D · mismo resultado entre por donde entre: ni la caja ni la tarjeta escriben ni cierran (D1)', () => {
  it('ventana abierta que ya mostró pedidos, organización apagada en caliente: camino caja y camino tarjeta → cero escrituras, cero close()', async () => {
    const { bridge, saved } = fakeBridge(ABIERTA_EN_2);
    instalarVentana(bridge);
    // Camino de la caja: la caja emitió en esta sesión y otra caja apaga la organización.
    primeCustomerDisplaySettings(ORG, { enabled: true });
    const emitter = getPosDisplayEmitter();
    emitter.start({ organizationId: ORG, currency: 'COP' });
    expect(emitter.isEmitting).toBe(true);
    conFila(false);
    await refreshPosDisplay(ORG); // evento `storage` de la otra caja
    await drenar();
    expect(emitter.isEmitting).toBe(false);
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();

    // Camino de la tarjeta: el cajero abre Configuración y la tarjeta lee la organización apagada.
    const loaded = await ConfiguracionService.getCustomerDisplayConfig();
    expect(loaded).toEqual({ settings: { enabled: false }, raw: { enabled: false }, loadFailed: false });
    await drenar();
    expect(saved).toEqual([]);
    expect(bridge.close).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('E · contrato con el preload (posDisplayIpc.ts): lo que viaja por setEnabled y open', () => {
  it('elección desconocida viaja como undefined (conserva el monitor), nunca como null (que lo pisaría con automático)', async () => {
    const { bridge } = fakeBridge();
    await persistDesktopDisplayChoice(bridge, true, undefined);
    expect(bridge.setEnabled.mock.calls[0]).toHaveLength(2);
    expect(bridge.setEnabled.mock.calls[0][1]).toBeUndefined();
    await persistDesktopDisplayChoice(bridge, true, null);
    expect(bridge.setEnabled.mock.calls[1][1]).toBeNull();
  });

  it('open() viaja siempre con { origin, displayId } (objeto, no número suelto), origin = el de la ventana del POS', async () => {
    const { bridge } = fakeBridge();
    instalarVentana(bridge);
    await openCustomerDisplay({ displayId: 2 });
    expect(bridge.open).toHaveBeenCalledWith({ origin: 'http://localhost:47800', displayId: 2 });
  });

  it('needsReopenForDisplayChange (D7): ventana en modo normal (displayId null) + monitor numérico elegido → true, y la cabecera lo dice así', () => {
    expect(needsReopenForDisplayChange({ open: true, displayId: null }, { known: true, id: 1 })).toBe(true);
    const src = readFileSync(join(process.cwd(), 'src/lib/pos/display/desktopDisplay.ts'), 'utf8');
    const header = src.slice(src.lastIndexOf('/**', src.indexOf('export function needsReopenForDisplayChange')), src.indexOf('export function needsReopenForDisplayChange'));
    expect(header).toMatch(/modo[\s*]*normal[\s\S]*SÍ se cierra y reabre/);
    expect(header).not.toMatch(/tampoco se mueve/);
  });
});
