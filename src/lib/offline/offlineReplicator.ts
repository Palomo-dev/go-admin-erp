/**
 * Replicador genérico de la lectura offline del Desktop (fase 4C).
 *
 * Recorre el manifiesto (`replicationManifest.ts`) tabla por tabla y copia
 * las filas de la organización al IndexedDB `goadmin-replica`
 * (`offlineDb.ts`):
 *
 *  - Lotes de `OFFLINE_BATCH_SIZE` (500) con `.range()`, escribiendo cada
 *    lote al llegar y cediendo el hilo entre lotes: no bloquea la UI.
 *  - Pasada **completa** (con poda de lo que ya no existe o salió de la
 *    ventana) la primera vez y como máximo cada `FULL_REFRESH_INTERVAL_MS`
 *    (2 h); entre medias, pasada **incremental** por la columna monótona del
 *    manifiesto (`updated_at > cursor`, estrictamente mayor: los lotes
 *    importados comparten `updated_at` y con `>=` se volverían a bajar cada
 *    10 min) en las tablas que la tienen; las que no, se recorren completas
 *    siempre (son pequeñas).
 *  - Ámbito por organización de la sesión (o por el padre, con
 *    `padre!inner(organization_id)`), ventana de 12 meses en las
 *    transaccionales y tope de filas por tabla.
 *  - Estado por tabla en `meta` (`getOfflineDbStatus()`): filas, última
 *    replicación, último error. Un error en una tabla no detiene el resto.
 *
 * Cadencia única para todo el offline del Desktop:
 * `startOfflineReplication()` programa, con red, la replicación del catálogo
 * del POS (fase 4A, `catalogReplicator.ts`) y la genérica en el mismo tick,
 * al arrancar y cada 10 minutos. Fuera del Desktop no hace nada.
 */

import { supabase } from '@/lib/supabase/config';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { replicateCatalog, isCatalogReplicating } from './catalogReplicator';
import {
  ensureOfflineDbOrganization,
  getOfflineDbStatus,
  getOfflineKeysByOrg,
  getOfflineTableMeta,
  isIndexedDbAvailable,
  pruneOfflineRows,
  putOfflineRows,
  rowKeyOf,
  setOfflineTableMeta,
  type OfflineDbStatus,
  type OfflineRow,
  type OfflineTableMeta,
} from './offlineDb';
import { FULL_REFRESH_INTERVAL_MS, REPLICATION_MANIFEST, pkColumns, type TableManifest } from './replicationManifest';

export const OFFLINE_BATCH_SIZE = 500;
export const OFFLINE_REPLICATION_INTERVAL_MS = 10 * 60 * 1000;
/** Evento de `window` al terminar una pasada (detail: OfflineDbStatus). */
export const OFFLINE_REPLICATED_EVENT = 'goadmin:offline-replicated';

/**
 * Subconjunto del cliente de Supabase que usa el replicador (por parámetro
 * para probarlo con un cliente falso).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OfflineClient = Pick<typeof supabase, 'from'> | { from: (table: string) => any };

export interface ReplicateOfflineOptions {
  organizationId: number;
  client?: OfflineClient;
  /** Forzar pasada completa (con poda) en todas las tablas. */
  full?: boolean;
  /** Replicar solo estas tablas (por defecto todo el manifiesto). */
  tables?: string[];
  onProgress?: (table: string, count: number) => void;
  /** Reloj inyectable (tests). */
  now?: () => number;
}

interface PageResult {
  data: OfflineRow[] | null;
  error: { message: string } | null;
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function windowStartIso(months: number, now: number): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = any;

/**
 * Construye la consulta PostgREST de una pasada: columnas, ámbito, filtros
 * extra, ventana, cursor incremental y orden estable. Sin `.range()`.
 */
function buildQuery(client: OfflineClient, m: TableManifest, organizationId: number, parentIndex: number, cursor: string | null, now: number): AnyBuilder {
  const db = client as { from: (t: string) => AnyBuilder };
  let select = m.columns.join(',');
  let q: AnyBuilder;
  switch (m.scope.kind) {
    case 'org':
      q = db.from(m.table).select(select).eq('organization_id', organizationId);
      break;
    case 'self':
      q = db.from(m.table).select(select).eq('id', organizationId);
      break;
    case 'global':
      q = db.from(m.table).select(select);
      break;
    case 'parent': {
      const parent = m.scope.parents[parentIndex];
      const column = parent.column ?? 'organization_id';
      select = `${select},${parent.embed}!inner(${column})`;
      q = db.from(m.table).select(select).eq(`${parent.embed}.${column}`, organizationId);
      break;
    }
  }
  for (const [col, raw] of Object.entries(m.extraFilters ?? {})) {
    const dot = raw.indexOf('.');
    q = q.filter(col, raw.slice(0, dot), raw.slice(dot + 1));
  }
  if (m.window) q = q.gte(m.window.column, windowStartIso(m.window.months, now));
  if (cursor && m.incremental) {
    q = q.gt(m.incremental, cursor).order(m.incremental, { ascending: true });
  } else if (m.window) {
    q = q.order(m.window.column, { ascending: false });
  }
  for (const col of pkColumns(m)) q = q.order(col, { ascending: true });
  return q;
}

/** Retira el embed del padre y añade `organization_id` a las filas que no lo tienen. */
function normalizeRow(row: OfflineRow, m: TableManifest, organizationId: number): OfflineRow {
  const out: OfflineRow = { ...row };
  if (m.scope.kind === 'parent') for (const p of m.scope.parents) delete out[p.embed];
  if (!m.hasOrganizationId) out.organization_id = organizationId;
  return out;
}

interface PassResult {
  written: number;
  bytes: number;
  keys: Set<string>;
  cursor: string | null;
  truncated: boolean;
}

async function runPass(client: OfflineClient, m: TableManifest, organizationId: number, cursor: string | null, now: number, onBatch?: () => void): Promise<PassResult> {
  const result: PassResult = { written: 0, bytes: 0, keys: new Set(), cursor, truncated: false };
  const passes = m.scope.kind === 'parent' ? m.scope.parents.length : 1;
  for (let p = 0; p < passes; p++) {
    let from = 0;
    for (;;) {
      const to = Math.min(from + OFFLINE_BATCH_SIZE, m.maxRows) - 1;
      if (to < from) {
        result.truncated = true;
        break;
      }
      const page = (await buildQuery(client, m, organizationId, p, cursor, now).range(from, to)) as PageResult;
      if (page.error) throw new Error(`[offline] ${m.table}: ${page.error.message}`);
      const rows = (page.data ?? []).map((r) => normalizeRow(r, m, organizationId));
      if (rows.length > 0) {
        await putOfflineRows(m.table, rows);
        for (const r of rows) {
          result.keys.add(rowKeyOf(m.pk, r));
          result.bytes += JSON.stringify(r).length;
          if (m.incremental) {
            const v = r[m.incremental];
            if (typeof v === 'string' && (result.cursor === null || v > result.cursor)) result.cursor = v;
          }
        }
        result.written += rows.length;
        onBatch?.();
      }
      if (rows.length < to - from + 1) break;
      from = to + 1;
      await yieldToUi();
    }
  }
  return result;
}

let replicationInFlight: Promise<OfflineDbStatus> | null = null;

export function isOfflineReplicating(): boolean {
  return replicationInFlight !== null;
}

/**
 * Replica las tablas del manifiesto. Reentrante: una llamada concurrente
 * comparte la promesa en curso. Nunca lanza por una tabla concreta (el
 * error queda en su `meta.error`); lanza solo si no hay IndexedDB u
 * organización.
 */
export function replicateOfflineDb(options: ReplicateOfflineOptions): Promise<OfflineDbStatus> {
  if (replicationInFlight) return replicationInFlight;
  replicationInFlight = runReplication(options).finally(() => {
    replicationInFlight = null;
  });
  return replicationInFlight;
}

async function runReplication({ organizationId, client = supabase, full = false, tables, onProgress, now = Date.now }: ReplicateOfflineOptions): Promise<OfflineDbStatus> {
  if (!isIndexedDbAvailable()) throw new Error('IndexedDB no disponible: no se pueden replicar los datos sin conexión');
  if (!organizationId) throw new Error('Sin organización activa: no se pueden replicar los datos sin conexión');
  await ensureOfflineDbOrganization(organizationId);

  const wanted = tables ? REPLICATION_MANIFEST.filter((m) => tables.includes(m.table)) : REPLICATION_MANIFEST;
  for (const m of wanted) {
    const startedAt = now();
    const previous = await getOfflineTableMeta(m.table, organizationId);
    const needsFull = full || !previous || previous.full_at === 0 || startedAt - previous.full_at >= FULL_REFRESH_INTERVAL_MS || !m.incremental;
    const cursor = needsFull ? null : previous?.cursor ?? null;
    const base: OfflineTableMeta = previous ?? {
      key: `${m.table}:${organizationId}`, table: m.table, organization_id: organizationId, replicated_at: 0, full_at: 0, count: 0, bytes: 0, cursor: null, error: null, attempted_at: 0,
    };
    try {
      const pass = await runPass(client, m, organizationId, cursor, startedAt);
      if (needsFull) await pruneOfflineRows(m.table, organizationId, pass.keys);
      const count = (await getOfflineKeysByOrg(m.table, organizationId)).length;
      const avg = needsFull ? (pass.written > 0 ? pass.bytes / pass.written : 0) : base.count > 0 ? base.bytes / base.count : pass.written > 0 ? pass.bytes / pass.written : 0;
      const finishedAt = now();
      await setOfflineTableMeta({
        ...base,
        replicated_at: finishedAt,
        full_at: needsFull ? finishedAt : base.full_at,
        count,
        bytes: Math.round(avg * count),
        cursor: m.incremental ? pass.cursor ?? base.cursor : null,
        error: pass.truncated ? `Tope de ${m.maxRows} filas alcanzado: se conservan las más recientes` : null,
        attempted_at: finishedAt,
      });
      onProgress?.(m.table, count);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await setOfflineTableMeta({ ...base, error: message, attempted_at: now() });
      if (typeof console !== 'undefined') console.warn(`[offline] Replicación de ${m.table} fallida:`, message);
    }
    await yieldToUi();
  }

  const status = await getOfflineDbStatus(organizationId);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_REPLICATED_EVENT, { detail: status }));
  }
  return status;
}

/**
 * Replica TODO lo offline del Desktop: primero el catálogo del POS (4A) y
 * después la réplica genérica (4C). Es lo que ejecutan el botón
 * «Sincronizar ahora» y el planificador.
 */
export async function replicateAllOffline(options: ReplicateOfflineOptions): Promise<OfflineDbStatus> {
  const catalogClient = options.client as Parameters<typeof replicateCatalog>[0]['client'] | undefined;
  try {
    await replicateCatalog({ organizationId: options.organizationId, client: catalogClient });
  } catch (err) {
    if (typeof console !== 'undefined') console.warn('[offline] Replicación del catálogo del POS fallida:', err);
  }
  return replicateOfflineDb(options);
}

// ── Planificador único (solo Desktop) ──

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let scheduledOrgId: number | null = null;
let subscribers = 0;

/**
 * Arranca (o reprograma) la replicación periódica de catálogo + réplica
 * genérica para la organización: ya mismo si hay red y luego cada 10 min.
 * Devuelve la baja; el intervalo para con el último suscriptor. Fuera del
 * Desktop no hace nada.
 */
export function startOfflineReplication(organizationId: number, client?: OfflineClient): () => void {
  if (!isDesktop() || !organizationId) return () => {};
  if (!intervalHandle || scheduledOrgId !== organizationId) {
    if (intervalHandle) clearInterval(intervalHandle);
    scheduledOrgId = organizationId;
    const tick = () => {
      if (!isAppOnline() || isOfflineReplicating() || isCatalogReplicating()) return;
      replicateAllOffline({ organizationId, client }).catch((err) => {
        console.warn('[offline] Replicación en background fallida:', err);
      });
    };
    tick();
    intervalHandle = setInterval(tick, OFFLINE_REPLICATION_INTERVAL_MS);
  }
  subscribers++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscribers = Math.max(0, subscribers - 1);
    if (subscribers === 0) stopOfflineReplication();
  };
}

export function stopOfflineReplication(): void {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
  scheduledOrgId = null;
  subscribers = 0;
}
