/**
 * Tester · Fase 1 (Electron en la segunda pantalla), ronda 4 (cierre).
 * Pruebas adversarias sobre la lógica pura con puente falso FIEL al IPC
 * real (`electron/src/main/posDisplayIpc.ts`); sin React ni DOM.
 *
 * Ronda de cierre: los tres `it.failing` de esta ronda se corrigieron
 * (D5 >= 0, D2 en el indicador, «Cerrar» sin status) y ahora son `it`;
 * lo verificado del builder va como `it` normal.
 *
 * A. D5 contra el IPC: `parseDisplayId` del proceso principal rechaza todo
 *    entero negativo (`value >= 0`). Tras el cierre de F1 la web trata '-1'
 *    como DESCONOCIDO: «Abrir ahora» abre por el puente sin monitor (auto)
 *    y «Activar y abrir» persiste enabled=true con displayId null.
 * B. D2 también en el indicador: sin red, settings.ts cachea APAGADO pero la
 *    caché NO cuenta como conocida: el indicador se queda en «cargando» en
 *    vez de afirmar «Pantalla desactivada», y sigue sin escribir config.json.
 * C. Degradación sin puente / con Desktop < 0.2.1 y contrato del puente.
 * D. D3, D4, D6, D7: lo que el builder dice que hizo, comprobado.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UNKNOWN_DISPLAY_CHOICE,
  describeWindowStatus,
  enableDesktopDisplayHere,
  listDesktopDisplays,
  needsReopenForDisplayChange,
  nextOpenedAt,
  persistDesktopDisplayChoice,
  readDesktopDisplayStatus,
  readSavedDisplayChoice,
  resolveDesktopWindowSignal,
  resolveIndicatorState,
  resolveNothingToClose,
  subscribeDesktopDisplayStatus,
  supportsDesktopDisplayPicker,
  supportsDesktopDisplayStatus,
  type DisplayIdStorage,
} from '@/lib/pos/display/desktopDisplay';
import { STALE_AFTER_MS } from '@/lib/pos/display/transport';
import { __resetCustomerDisplayWindowForTests, closeCustomerDisplay, openCustomerDisplay, resolveNativePosDisplayApi } from '@/lib/pos/display/openDisplay';
import { readDisplayPresence } from '@/lib/pos/display/presence';
import { getPosDisplayEmitter, getPosDisplayEnvironment, startPosDisplay, stopPosDisplay } from '@/lib/pos/display/posDisplay';
import { clearCustomerDisplaySettingsCache, hasCustomerDisplaySettingsCache } from '@/lib/pos/display/settings';
import { isDesktop } from '@/lib/utils/desktop';
import type { DesktopPosDisplayBridge, DesktopPosDisplayStatus, GoAdminDesktopBridge } from '@/lib/utils/desktop';

const supabaseFrom = jest.fn();
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: (...args: unknown[]) => supabaseFrom(...args) } }));
jest.mock('@/lib/hooks/useOrganization', () => ({
  getOrganizationId: () => 120,
  getCurrentBranchId: () => 7,
}));

const ORG = 120;
const CERRADA: DesktopPosDisplayStatus = { open: false, displayId: null };
const ABIERTA_EN_2: DesktopPosDisplayStatus = { open: true, displayId: 2 };

const ipcSrc = readFileSync(join(process.cwd(), 'electron/src/main/posDisplayIpc.ts'), 'utf8');
const desktopDisplaySrc = readFileSync(join(process.cwd(), 'src/lib/pos/display/desktopDisplay.ts'), 'utf8');

/** Réplica de `parseDisplayId` del IPC real: `undefined` conserva, `null` automático, entero >= 0, si no TypeError. */
function parseDisplayIdComoElIpc(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  throw new TypeError('displayId debe ser un entero');
}

/** Puente falso con la MISMA validación que `posDisplayIpc.ts` (el que la web va a encontrarse de verdad). */
function puenteFielAlIpc(initialStatus: DesktopPosDisplayStatus = CERRADA) {
  const saved: Array<[boolean, number | null | undefined]> = [];
  let status = initialStatus;
  const bridge = {
    send: jest.fn(),
    onMessage: jest.fn(() => () => {}),
    open: jest.fn(async (opts?: { origin?: string; displayId?: number | null }) => {
      try {
        parseDisplayIdComoElIpc(opts?.displayId);
      } catch (err) {
        return { ok: false, reason: (err as Error).message };
      }
      status = { open: true, displayId: opts?.displayId ?? 2 };
      return { ok: true };
    }),
    close: jest.fn(async () => {
      status = CERRADA;
    }),
    status: jest.fn(async () => status),
    onStatus: jest.fn(() => () => {}),
    listDisplays: jest.fn(async () => [{ id: 2, label: 'DELL U2412M', isPrimary: false, bounds: { x: 1920, y: 0, width: 1920, height: 1200 } }]),
    setEnabled: jest.fn(async (enabled: boolean, displayId?: number | null) => {
      if (typeof enabled !== 'boolean') throw new TypeError('enabled debe ser booleano');
      parseDisplayIdComoElIpc(displayId); // lanza con negativos, igual que el invoke real rechaza
      saved.push([enabled, displayId]);
    }),
  };
  return { bridge: bridge as DesktopPosDisplayBridge & typeof bridge, saved };
}

function storageCon(valor: string | null): DisplayIdStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (valor !== null) data.set('pos_display_desktop_display_id', valor);
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

type GlobalConVentana = typeof globalThis & { window?: unknown };
/** window falso: puente + origin + localStorage + window.open (camino web) que registra si se usó. */
function instalarVentana(posDisplay: unknown, savedDisplayId: string | null = null) {
  const opened: string[] = [];
  const ls = storageCon(savedDisplayId);
  (globalThis as GlobalConVentana).window = {
    goAdminDesktop: { posDisplay },
    location: { origin: 'http://localhost:47800' },
    localStorage: ls,
    open: (url: string) => {
      opened.push(url);
      return { closed: false, focus() {}, close() {} };
    },
  };
  return { opened, ls };
}

function sinRed(): void {
  supabaseFrom.mockImplementation(() => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit', 'upsert', 'insert', 'update', 'delete']) {
      chain[m] = () => chain;
    }
    chain.maybeSingle = () => Promise.reject(new TypeError('Failed to fetch'));
    chain.single = () => Promise.reject(new TypeError('Failed to fetch'));
    chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => Promise.reject(new TypeError('Failed to fetch')).then(resolve, reject);
    return chain;
  });
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
describe('A · D5 contra el IPC congelado: la web admite un monitor negativo que el proceso principal rechaza', () => {
  it('parseDisplayId del IPC exige `value >= 0` y la web trata -1 como desconocido (alineados)', () => {
    expect(ipcSrc).toMatch(/Number\.isInteger\(value\) && value >= 0/);
    expect(readSavedDisplayChoice(storageCon('-1'))).toEqual(UNKNOWN_DISPLAY_CHOICE);
    // La cabecera ya remite al IPC.
    expect(desktopDisplaySrc).not.toMatch(/entero cualquiera, no necesariamente positivo/);
    expect(desktopDisplaySrc).toMatch(/parseDisplayId/);
  });

  it('con -1 guardado (desconocido), «Abrir ahora» abre por el puente sin monitor y no cae a la emergente web', async () => {
    const { bridge } = puenteFielAlIpc();
    const { opened } = instalarVentana(bridge, '-1');
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await openCustomerDisplay();
    expect(bridge.open).toHaveBeenCalledTimes(1);
    const opts = (bridge.open as jest.Mock).mock.calls[0][0] as { origin: string; displayId?: number | null };
    expect(opts.origin).toBe('http://localhost:47800');
    expect(opts.displayId ?? null).toBeNull();
    expect(result.via).toBe('electron');
    expect(opened).toHaveLength(0);
  });

  it('con -1 guardado (desconocido), «Activar y abrir» persiste enabled=true en config.json con monitor automático', async () => {
    const { bridge, saved } = puenteFielAlIpc();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const ok = await enableDesktopDisplayHere(bridge, storageCon('-1'));
    expect(ok).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toBe(true);
    expect(saved[0][1] ?? null).toBeNull();
  });

  it('con un id válido (>= 0) el mismo puente fiel al IPC sí abre por el puente y sí persiste', async () => {
    const { bridge, saved } = puenteFielAlIpc();
    const { opened } = instalarVentana(bridge, '2');
    const result = await openCustomerDisplay();
    expect(result.via).toBe('electron');
    expect(opened).toHaveLength(0);
    expect(await enableDesktopDisplayHere(bridge, storageCon('2'))).toBe(true);
    expect(saved).toEqual([[true, 2]]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B · D2 solo llegó a la tarjeta: sin red el indicador del POS afirma «desactivada»', () => {
  it('la carga fallida cachea APAGADO (la caja no emite) pero NO cuenta como conocida', async () => {
    sinRed();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await startPosDisplay({ organizationId: ORG, currency: 'COP' });
    expect(hasCustomerDisplaySettingsCache(ORG)).toBe(false);
    expect(getPosDisplayEmitter().isEmitting).toBe(false);
  });

  it('sin red, el indicador no afirma «Pantalla desactivada» ni ofrece «Activar y abrir»: se queda en «cargando»', async () => {
    sinRed();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    instalarVentana(puenteFielAlIpc(ABIERTA_EN_2).bridge); // hay transporte (puente): el motivo no puede ser «sin soporte»
    await startPosDisplay({ organizationId: ORG, currency: 'COP' });
    const env = getPosDisplayEnvironment();
    const presence = readDisplayPresence(getPosDisplayEmitter(), Date.now(), STALE_AFTER_MS, env);
    expect(presence.reason).toBe('loading');
    expect(resolveIndicatorState({ connected: false, reason: presence.reason, signal: 'open' })).toBe('disconnected');
  });

  it('lo que sí garantiza D2 desde el indicador: sin red nada viaja al puente aunque la ventana esté abierta', async () => {
    sinRed();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { bridge, saved } = puenteFielAlIpc(ABIERTA_EN_2);
    instalarVentana(bridge);
    await startPosDisplay({ organizationId: ORG, currency: 'COP' });
    const presence = readDisplayPresence(getPosDisplayEmitter(), Date.now(), STALE_AFTER_MS, getPosDisplayEnvironment());
    // Queda en «cargando» y, además, ni escribe ni cierra.
    expect(resolveIndicatorState({ connected: false, reason: presence.reason, signal: 'open' })).toBe('disconnected');
    expect(saved).toHaveLength(0);
    expect(bridge.close).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('C · degradación: navegador (sin puente) y Desktop < 0.2.1 (puente sin listDisplays)', () => {
  it('sin puente: ni selector, ni estado, ni persistencia; abrir va por window.open y cerrar por la referencia propia', async () => {
    const { opened } = instalarVentana(undefined);
    delete ((globalThis as GlobalConVentana).window as { goAdminDesktop?: unknown }).goAdminDesktop;
    expect(resolveNativePosDisplayApi()).toBeNull();
    expect(supportsDesktopDisplayPicker(null)).toBe(false);
    expect(supportsDesktopDisplayStatus(null)).toBe(false);
    expect(await listDesktopDisplays(null)).toEqual([]);
    expect(await readDesktopDisplayStatus(null)).toBeNull();
    expect(typeof subscribeDesktopDisplayStatus(null, () => {})).toBe('function');
    expect(await persistDesktopDisplayChoice(null, true, 2)).toBe(false);
    const result = await openCustomerDisplay();
    expect(result.via).toBe('web');
    expect(opened).toEqual(['/pos-display']);
    expect(await closeCustomerDisplay()).toBe('handle');
  });

  it('Desktop < 0.2.1 (solo send/onMessage): no hay selector ni estado, abrir cae al camino web sin lanzar, y nada se persiste', async () => {
    const viejo: DesktopPosDisplayBridge = { send: jest.fn(), onMessage: jest.fn(() => () => {}) };
    const { opened } = instalarVentana(viejo);
    expect(supportsDesktopDisplayPicker(viejo)).toBe(false);
    expect(supportsDesktopDisplayStatus(viejo)).toBe(false);
    expect(await listDesktopDisplays(viejo)).toEqual([]);
    expect(await readDesktopDisplayStatus(viejo)).toBeNull();
    expect(await persistDesktopDisplayChoice(viejo, false, null)).toBe(false);
    expect(await enableDesktopDisplayHere(viejo, storageCon('2'))).toBe(false);
    const result = await openCustomerDisplay();
    expect(result.via).toBe('web');
    expect(opened).toEqual(['/pos-display']);
    expect(resolveNothingToClose({ connected: false, hasOwnWindow: true, bridgeCanClose: false, windowOpen: undefined })).toBe(false);
    expect(await closeCustomerDisplay()).toBe('handle');
  });

  it('puente que lista monitores pero devuelve basura o lanza: lista vacía, estado null, sin excepción', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const roto: DesktopPosDisplayBridge = {
      listDisplays: jest.fn(async () => [{ id: 'x' }, null, 42] as unknown as never),
      status: jest.fn(async () => {
        throw new Error('ipc roto');
      }),
      onStatus: jest.fn(() => {
        throw new Error('ipc roto');
      }),
    };
    expect(await listDesktopDisplays(roto)).toEqual([]);
    expect(await readDesktopDisplayStatus(roto)).toBeNull();
    expect(typeof subscribeDesktopDisplayStatus(roto, () => {})).toBe('function');
  });

  it('el tipo GoAdminDesktopBridge incluye posDisplay con el contrato completo (compila con ts-jest)', () => {
    const { bridge } = puenteFielAlIpc();
    const tipado: GoAdminDesktopBridge = { posDisplay: bridge };
    expect(typeof tipado.posDisplay?.open).toBe('function');
    expect(typeof tipado.posDisplay?.onStatus).toBe('function');
    expect(typeof tipado.posDisplay?.setEnabled).toBe('function');
    expect(typeof tipado.posDisplay?.listDisplays).toBe('function');
  });

  it('el interruptor de la organización manda: la elección local viaja solo como segundo argumento de setEnabled y el apagado se persiste como false', async () => {
    const { bridge, saved } = puenteFielAlIpc();
    await persistDesktopDisplayChoice(bridge, false, 2);
    await persistDesktopDisplayChoice(bridge, true, undefined);
    expect(saved).toEqual([
      [false, 2],
      [true, undefined],
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('D · D3, D4, D6, D7: afirmaciones del builder', () => {
  it('D3: orden conectada → desactivada → abierta sin señal → sin pantalla; «sin señal» solo con reason === null', () => {
    expect(resolveIndicatorState({ connected: true, reason: null, signal: 'open-no-signal' })).toBe('connected');
    expect(resolveIndicatorState({ connected: false, reason: 'disabled', signal: 'open-no-signal' })).toBe('disabled');
    expect(resolveIndicatorState({ connected: false, reason: 'loading', signal: 'open-no-signal' })).toBe('disconnected');
    expect(resolveIndicatorState({ connected: false, reason: 'unsupported', signal: 'open-no-signal' })).toBe('disconnected');
    expect(resolveIndicatorState({ connected: false, reason: null, signal: 'open-no-signal' })).toBe('open-no-signal');
    expect(resolveIndicatorState({ connected: false, reason: null, signal: 'open' })).toBe('disconnected');
  });

  it('D3: cerrar + reabrir en otro monitor reinicia la gracia (open→open con displayId distinto, y cualquier onStatus abierto)', () => {
    const t0 = 1_000_000;
    const abierta1: DesktopPosDisplayStatus = { open: true, displayId: 1 };
    const abierta2: DesktopPosDisplayStatus = { open: true, displayId: 2 };
    expect(nextOpenedAt(null, abierta1, null, t0, 'read')).toBe(t0);
    expect(nextOpenedAt(abierta1, abierta1, t0, t0 + 10_000, 'read')).toBe(t0);
    expect(nextOpenedAt(abierta1, abierta2, t0, t0 + 10_000, 'read')).toBe(t0 + 10_000);
    expect(nextOpenedAt(abierta1, abierta1, t0, t0 + 10_000, 'event')).toBe(t0 + 10_000);
    expect(nextOpenedAt(abierta1, CERRADA, t0, t0 + 10_000, 'event')).toBeNull();
    // Con la gracia reiniciada, no se pinta ámbar mientras la ventana nueva carga.
    expect(resolveDesktopWindowSignal(abierta2, false, t0 + 10_000, t0 + 10_000 + STALE_AFTER_MS - 1, STALE_AFTER_MS, true, t0)).toBe('open');
    expect(resolveDesktopWindowSignal(abierta2, false, t0 + 10_000, t0 + 10_000 + STALE_AFTER_MS, STALE_AFTER_MS, true, t0)).toBe('open-no-signal');
    // El proceso principal solo emite status al abrir y cerrar (traer al frente no emite): la premisa de 'event'.
    const winSrc = readFileSync(join(process.cwd(), 'electron/src/main/windows/posDisplayWindow.ts'), 'utf8');
    const bringToFront = winSrc.slice(winSrc.indexOf('function bringToFront'), winSrc.indexOf('function buildDisplayUrl'));
    expect(bringToFront).not.toMatch(/emitStatus/);
  });

  it('D4: sin ventana del puente ni propia, closeCustomerDisplay → none sin llamar a close(), y «Cerrar» deshabilitado', async () => {
    const { bridge } = puenteFielAlIpc(CERRADA);
    instalarVentana(bridge);
    expect(await closeCustomerDisplay({ bridgeWindowOpen: false })).toBe('none');
    expect(await closeCustomerDisplay()).toBe('none'); // consulta status() del puente
    expect(bridge.close).not.toHaveBeenCalled();
    expect(resolveNothingToClose({ connected: false, hasOwnWindow: false, bridgeCanClose: true, windowOpen: false })).toBe(true);
  });

  it('antes de que status() responda, «Cerrar» está deshabilitado (nada confirmado que cerrar); pulsarlo igualmente devuelve none', async () => {
    const { bridge } = puenteFielAlIpc(CERRADA);
    instalarVentana(bridge);
    expect(resolveNothingToClose({ connected: false, hasOwnWindow: false, bridgeCanClose: true, windowOpen: undefined })).toBe(true);
    expect(await closeCustomerDisplay({ bridgeWindowOpen: undefined })).toBe('none');
  });

  it('D7: needsReopenForDisplayChange — solo automático o desconocida no mueven; ventana normal + monitor numérico sí', () => {
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { known: true, id: 2 })).toBe(false);
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { known: true, id: 3 })).toBe(true);
    expect(needsReopenForDisplayChange({ open: true, displayId: null }, { known: true, id: 3 })).toBe(true);
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { known: true, id: null })).toBe(false);
    expect(needsReopenForDisplayChange(ABIERTA_EN_2, { ...UNKNOWN_DISPLAY_CHOICE })).toBe(false);
    expect(needsReopenForDisplayChange(CERRADA, { known: true, id: 3 })).toBe(false);
  });

  it('D1: ningún símbolo de la sincronía hacia abajo sobrevive en src/lib/pos/display ni en los componentes', () => {
    const files = [
      'src/lib/pos/display/desktopDisplay.ts',
      'src/lib/pos/display/posDisplay.ts',
      'src/lib/pos/display/openDisplay.ts',
      'src/lib/pos/display/index.ts',
      'src/components/pos/display/useDesktopDisplayWindow.ts',
      'src/components/pos/display/CustomerDisplayIndicator.tsx',
      'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx',
    ];
    const prohibidos = ['sync' + 'DesktopDisplayEnabledDown', 'last' + 'PersistedEnabled', 'opened' + 'ManuallyHere', 'shouldClose' + 'OrphanDesktopWindow', 'electron' + 'API'];
    for (const f of files) {
      const src = readFileSync(join(process.cwd(), f), 'utf8');
      for (const p of prohibidos) expect({ file: f, symbol: p, present: src.includes(p) }).toEqual({ file: f, symbol: p, present: false });
    }
  });

  it('observación (bajo, fuera del alcance congelado): apagar el interruptor desde la tarjeta persiste enabled=false pero NO cierra la ventana abierta en el segundo monitor', () => {
    const card = readFileSync(join(process.cwd(), 'src/components/pos/configuracion/pantalla-cliente/PantallaClienteContent.tsx'), 'utf8');
    const toggle = card.slice(card.indexOf('const handleToggleEnabled'), card.indexOf('const handleOpenNow'));
    expect(toggle).toMatch(/persistDesktopDisplayChoice\(desktopBridge, saved\.enabled/);
    expect(toggle).not.toMatch(/closeCustomerDisplay|\.close\(/);
    // y la tarjeta no ofrece «Cerrar»: el estado pinta «abierta en <monitor>» con punto verde aunque la organización esté apagada.
    expect(card).not.toMatch(/closeCustomerDisplay\(\{ bridgeWindowOpen: windowStatus/);
    expect(describeWindowStatus(ABIERTA_EN_2, [{ id: 2, label: 'DELL', isPrimary: false, bounds: { x: 0, y: 0, width: 1, height: 1 } }]).kind).toBe('on-listed');
  });

  it('FullscreenButton: se oculta en escritorio (isDesktop) antes de tocar document', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/pos-display/FullscreenButton.tsx'), 'utf8');
    expect(src).toMatch(/if \(isDesktop\(\) \|\| typeof document === 'undefined'/);
    expect(src).not.toMatch(/electron/i);
  });
});
