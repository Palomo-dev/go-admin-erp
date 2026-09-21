/**
 * Orquestador de sincronización del Desktop (fase 4F).
 *
 * Cada outbox (clientes, caja, ventas) sabe reproducirse solo; lo que no
 * sabe es en qué orden respecto a los demás. Aquí cada módulo registra una
 * etapa con un `order` y el orquestador las ejecuta **en serie y en orden**
 * cuando vuelve la red o se pulsa «Sincronizar ahora»:
 *
 *   10 clientes            (`customersSync.syncPendingCustomers`)
 *   20 caja: aperturas     (`cashSync.syncCashOpenings`)
 *   30 ventas              (`salesSync.syncPendingSales`)
 *   40 caja: movimientos y cierres (`cashSync.syncCashMovementsAndClosings`)
 *
 * Las etapas se registran en `syncStages.ts` (`registerDefaultSyncStages`).
 * Registrar dos veces el mismo `name` sustituye la etapa (idempotente).
 *
 * Reglas:
 *  - Una etapa que lanza no detiene a las demás: el error queda en el
 *    resultado y se sigue con la siguiente.
 *  - Una sola ejecución a la vez: las llamadas concurrentes comparten la
 *    promesa. Si llega una petición mientras corre, se marca `rerun` y al
 *    terminar se vuelve a ejecutar una vez (algo pudo entrar al outbox).
 *  - No importa Supabase ni los outboxes: solo funciones registradas.
 */

import { isDesktop, isDesktopOnline, onDesktopConnectivity } from '@/lib/utils/desktop';

export interface SyncStageOptions {
  /** Ignora el backoff (botón «Sincronizar ahora»). */
  force?: boolean;
  now?: () => number;
}

export type SyncStageRunner = (options: SyncStageOptions) => Promise<unknown>;

export interface SyncStage {
  name: string;
  order: number;
  run: SyncStageRunner;
}

export interface SyncStageOutcome {
  name: string;
  order: number;
  ok: boolean;
  /** Lo que devolvió la etapa (p. ej. `{ synced, failed, ... }`). */
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface SyncRunResult {
  stages: SyncStageOutcome[];
  startedAt: number;
  finishedAt: number;
}

const stages = new Map<string, SyncStage>();
let inFlight: Promise<SyncRunResult> | null = null;
let rerunRequested = false;

/**
 * Registra (o sustituye) una etapa. `order` menor corre antes; a igual
 * `order`, el orden alfabético del nombre. Devuelve la baja.
 */
export function registerSyncStage(name: string, run: SyncStageRunner, order: number): () => void {
  stages.set(name, { name, order, run });
  return () => {
    if (stages.get(name)?.run === run) stages.delete(name);
  };
}

export function unregisterSyncStage(name: string): void {
  stages.delete(name);
}

/** Etapas registradas, en el orden en que se ejecutarán. */
export function listSyncStages(): Array<Pick<SyncStage, 'name' | 'order'>> {
  return Array.from(stages.values())
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map(({ name, order }) => ({ name, order }));
}

function errorMessage(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  const e = err as { message?: string };
  return typeof e.message === 'string' && e.message.length > 0 ? e.message : JSON.stringify(err);
}

async function runOnce(options: SyncStageOptions): Promise<SyncRunResult> {
  const startedAt = options.now ? options.now() : Date.now();
  const ordered = Array.from(stages.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const outcomes: SyncStageOutcome[] = [];
  for (const stage of ordered) {
    const t0 = Date.now();
    try {
      const result = await stage.run(options);
      outcomes.push({ name: stage.name, order: stage.order, ok: true, result, durationMs: Date.now() - t0 });
    } catch (err) {
      const message = errorMessage(err);
      console.error(`[syncOrchestrator] La etapa «${stage.name}» falló:`, message);
      outcomes.push({ name: stage.name, order: stage.order, ok: false, error: message, durationMs: Date.now() - t0 });
    }
  }
  const result: SyncRunResult = { stages: outcomes, startedAt, finishedAt: Date.now() };
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('goadmin:sync-stages-finished', { detail: result }));
    } catch {
      // sin CustomEvent
    }
  }
  return result;
}

/**
 * Ejecuta todas las etapas en orden. Si ya hay una ejecución en curso,
 * devuelve esa promesa y pide una nueva pasada al terminar.
 */
export function runSyncStages(options: SyncStageOptions = {}): Promise<SyncRunResult> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  inFlight = (async () => {
    let result = await runOnce(options);
    while (rerunRequested) {
      rerunRequested = false;
      result = await runOnce(options);
    }
    return result;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function isSyncRunning(): boolean {
  return inFlight !== null;
}

let started = false;
let stopStarted: (() => void) | null = null;

/**
 * Arranque desde el layout o el POS: ejecuta las etapas si hay red ahora y
 * cada vez que el Desktop recupere la conectividad real. Idempotente;
 * devuelve la baja. Fuera del Desktop no hace nada.
 */
export function startSyncOrchestrator(): () => void {
  if (!isDesktop()) return () => {};
  if (started) return stopStarted ?? (() => {});
  started = true;
  const unsubscribe = onDesktopConnectivity((online) => {
    if (online) void runSyncStages();
  });
  isDesktopOnline()
    .then((online) => {
      if (online) void runSyncStages();
    })
    .catch(() => {
      // sin respuesta del bridge: se espera al evento de conectividad
    });
  stopStarted = () => {
    unsubscribe();
    started = false;
    stopStarted = null;
  };
  return stopStarted;
}

/** Solo para tests. */
export function __resetSyncOrchestratorForTests(): void {
  stages.clear();
  inFlight = null;
  rerunRequested = false;
  if (stopStarted) stopStarted();
  started = false;
}
