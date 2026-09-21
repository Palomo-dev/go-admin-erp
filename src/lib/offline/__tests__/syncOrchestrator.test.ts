/**
 * Orquestador de sincronización (fase 4F).
 *
 * Contrato:
 *  - las etapas corren en serie y por `order` ascendente (a igual orden, por
 *    nombre); las etapas por defecto quedan clientes → caja: aperturas →
 *    ventas → caja: movimientos y cierres;
 *  - una etapa que lanza no detiene a las demás y queda en el resultado;
 *  - una sola ejecución a la vez; una petición que llega en medio provoca
 *    una pasada más al terminar;
 *  - registrar el mismo nombre sustituye; fuera del Desktop no arranca.
 */

jest.mock('@/lib/utils/offlineCache', () => ({ isAppOnline: jest.fn(() => true) }));
jest.mock('@/lib/services/posService', () => ({ POSService: { checkout: jest.fn() } }));
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: () => { throw new Error('no'); } } }));

const connectivityListeners: Array<(online: boolean) => void> = [];
let desktop = true;
let desktopOnline = true;
jest.mock('@/lib/utils/desktop', () => ({
  isDesktop: jest.fn(() => desktop),
  isDesktopOnline: jest.fn(async () => desktopOnline),
  onDesktopConnectivity: jest.fn((l: (online: boolean) => void) => {
    connectivityListeners.push(l);
    return () => {
      const i = connectivityListeners.indexOf(l);
      if (i >= 0) connectivityListeners.splice(i, 1);
    };
  }),
}));

jest.spyOn(console, 'error').mockImplementation(() => {});

import { installWindow, uninstallWindow, freshIndexedDb } from './testEnv';
import {
  __resetSyncOrchestratorForTests,
  isSyncRunning,
  listSyncStages,
  registerSyncStage,
  runSyncStages,
  startSyncOrchestrator,
  unregisterSyncStage,
} from '../syncOrchestrator';
import { SYNC_STAGE_ORDER, __resetSyncStagesForTests, registerDefaultSyncStages, startOfflineSync } from '../syncStages';

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  desktop = true;
  desktopOnline = true;
  freshIndexedDb();
  installWindow({ desktop: true });
  __resetSyncOrchestratorForTests();
  __resetSyncStagesForTests();
  connectivityListeners.length = 0;
});

afterEach(() => {
  uninstallWindow();
});

describe('orden y resultado', () => {
  it('ejecuta las etapas en serie por order ascendente y devuelve el resultado de cada una', async () => {
    const calls: string[] = [];
    const stage = (name: string, delay = 0, result: unknown = name) => async () => {
      calls.push(`${name}:start`);
      if (delay) await new Promise((r) => setTimeout(r, delay));
      calls.push(`${name}:end`);
      return result;
    };
    registerSyncStage('sales', stage('sales', 5), 30);
    registerSyncStage('cash:movements-closings', stage('cash-close'), 40);
    registerSyncStage('customers', stage('customers', 5, { synced: 2 }), 10);
    registerSyncStage('cash:openings', stage('cash-open'), 20);

    expect(listSyncStages().map((s) => s.name)).toEqual(['customers', 'cash:openings', 'sales', 'cash:movements-closings']);
    const run = await runSyncStages({ force: true });
    expect(calls).toEqual(['customers:start', 'customers:end', 'cash-open:start', 'cash-open:end', 'sales:start', 'sales:end', 'cash-close:start', 'cash-close:end']);
    expect(run.stages.map((s) => [s.name, s.ok])).toEqual([
      ['customers', true],
      ['cash:openings', true],
      ['sales', true],
      ['cash:movements-closings', true],
    ]);
    expect(run.stages[0].result).toEqual({ synced: 2 });
    expect(run.finishedAt).toBeGreaterThanOrEqual(run.startedAt);
  });

  it('pasa las opciones (force/now) a cada etapa', async () => {
    const seen: unknown[] = [];
    registerSyncStage('a', async (o) => void seen.push(o), 1);
    const now = () => 123;
    await runSyncStages({ force: true, now });
    expect(seen).toEqual([{ force: true, now }]);
  });

  it('una etapa que lanza no detiene a las siguientes y queda con su error', async () => {
    const calls: string[] = [];
    registerSyncStage('a', async () => void calls.push('a'), 1);
    registerSyncStage('b', async () => {
      throw new Error('se rompió b');
    }, 2);
    registerSyncStage('c', async () => void calls.push('c'), 3);
    const run = await runSyncStages();
    expect(calls).toEqual(['a', 'c']);
    expect(run.stages[1]).toMatchObject({ name: 'b', ok: false, error: 'se rompió b' });
  });

  it('registrar el mismo nombre sustituye; unregister lo quita; la baja solo quita la propia', async () => {
    const first = async () => 'first';
    const second = async () => 'second';
    const offFirst = registerSyncStage('x', first, 5);
    registerSyncStage('x', second, 5);
    expect(listSyncStages()).toEqual([{ name: 'x', order: 5 }]);
    expect((await runSyncStages()).stages[0].result).toBe('second');
    offFirst(); // ya no es la registrada: no toca nada
    expect(listSyncStages()).toHaveLength(1);
    unregisterSyncStage('x');
    expect(listSyncStages()).toHaveLength(0);
  });
});

describe('concurrencia', () => {
  it('una sola ejecución a la vez; una llamada en medio provoca una pasada más', async () => {
    let runs = 0;
    let release: () => void = () => {};
    registerSyncStage('slow', async () => {
      runs++;
      if (runs === 1) await new Promise<void>((r) => (release = r));
    }, 1);
    const p1 = runSyncStages();
    await tick();
    expect(isSyncRunning()).toBe(true);
    const p2 = runSyncStages();
    expect(p2).toBe(p1);
    release();
    const result = await p1;
    expect(runs).toBe(2);
    expect(result.stages).toHaveLength(1);
    expect(isSyncRunning()).toBe(false);
  });
});

describe('arranque', () => {
  it('en Desktop con red ejecuta al arrancar y en cada reconexión; fuera del Desktop no hace nada', async () => {
    let runs = 0;
    registerSyncStage('count', async () => void runs++, 1);
    const stop = startSyncOrchestrator();
    await tick();
    await tick();
    expect(runs).toBe(1);
    expect(connectivityListeners).toHaveLength(1);
    connectivityListeners[0](false);
    connectivityListeners[0](true);
    await tick();
    await tick();
    expect(runs).toBe(2);
    expect(startSyncOrchestrator()).toBe(stop); // idempotente
    stop();
    expect(connectivityListeners).toHaveLength(0);

    desktop = false;
    startSyncOrchestrator();
    await tick();
    expect(connectivityListeners).toHaveLength(0);
    expect(runs).toBe(2);
  });

  it('las etapas por defecto quedan clientes → caja: aperturas → ventas → caja: movimientos y cierres', () => {
    registerDefaultSyncStages();
    registerDefaultSyncStages(); // idempotente
    expect(listSyncStages()).toEqual([
      { name: 'customers', order: SYNC_STAGE_ORDER.customers },
      { name: 'cash:openings', order: SYNC_STAGE_ORDER.cashOpenings },
      { name: 'sales', order: SYNC_STAGE_ORDER.sales },
      { name: 'cash:movements-closings', order: SYNC_STAGE_ORDER.cashMovementsAndClosings },
    ]);
    expect(SYNC_STAGE_ORDER.customers < SYNC_STAGE_ORDER.cashOpenings).toBe(true);
    expect(SYNC_STAGE_ORDER.cashOpenings < SYNC_STAGE_ORDER.sales).toBe(true);
    expect(SYNC_STAGE_ORDER.sales < SYNC_STAGE_ORDER.cashMovementsAndClosings).toBe(true);
  });

  it('startOfflineSync registra las etapas y arranca; con los outboxes vacíos no toca Supabase', async () => {
    const stop = startOfflineSync();
    await tick();
    await tick();
    await tick();
    expect(listSyncStages()).toHaveLength(4);
    const run = await runSyncStages();
    expect(run.stages.every((s) => s.ok)).toBe(true);
    stop();
  });
});
