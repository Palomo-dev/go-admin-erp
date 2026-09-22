/**
 * Outbox de caja del Desktop (fase 4F — operar la caja sin internet).
 *
 * Sin conexión real, `CajasService` no intenta escribir en Supabase: la
 * apertura de caja, los movimientos de efectivo (ingresos/retiros) y el
 * cierre se guardan aquí como operaciones de negocio completas y
 * `cashSync.ts` las reproduce en orden (apertura → movimientos → cierre)
 * cuando vuelve la red. Mismo patrón que `salesOutbox.ts` y
 * `customersOutbox.ts`:
 *  - Un registro NUNCA se borra por fallos: tras `MAX_ATTEMPTS` pasa a
 *    `needs_review` con `last_error` y el payload íntegro.
 *  - Los `synced` se conservan `SYNCED_RETENTION_DAYS` días y luego se purgan.
 *  - No importa Supabase: solo IndexedDB y localStorage (`fake-indexeddb`
 *    en tests).
 *
 * Ids (verificado por MCP el 2026-09-21):
 *  - `cash_sessions.id` y `cash_movements.id` son `serial`: no se pueden
 *    generar en el cliente. Cada tabla tiene además `uuid` NOT NULL con
 *    `gen_random_uuid()` y un índice UNIQUE (`idx_cash_sessions_uuid`,
 *    `idx_cash_movements_uuid`): ESE es el id que genera el cliente y el
 *    que da idempotencia al sincronizar (SELECT por uuid antes de insertar,
 *    23505 → releer).
 *  - Mientras la apertura no se sincroniza, la sesión vive con un **id local
 *    negativo** (`nextLocalCashSessionId`). Al insertar, `cashSync` guarda el
 *    id real en `server_id` del registro `open`, y los movimientos y el
 *    cierre de esa sesión lo resuelven por `session_uuid` (`resolveSessionServerId`).
 *  - `sales` no tiene `cash_session_id` (solo `cash_counts` y `folio_items`
 *    la referencian): las ventas del outbox no necesitan remapeo; el cierre
 *    las suma por fecha/sucursal/cajero igual que `getCashSummary` en línea.
 *
 * Base IndexedDB propia (`goadmin-outbox-cash`, store `cash`): el archivo
 * `goadmin-outbox` lo abre `salesOutbox.openOutbox` con versión y
 * `onupgradeneeded` fijos, y ese módulo lo edita otro agente en paralelo.
 * Cuando se libere, basta subir `OUTBOX_DB_VERSION` a 3, crear el store
 * `cash` allí y cambiar `openCashOutbox()` por `openOutbox()`.
 *
 * Estado local de «caja abierta»: además del registro del outbox, la sesión
 * se escribe como entrada genérica del `meta` del catálogo local
 * (`catalogStore.putCatalogMeta`, kind `cash_session`) para que
 * `CajasService.getActiveSession` la encuentre sin red aunque la réplica
 * (`cash_sessions`, fase 4C) no la conozca todavía, y para saber que una
 * sesión de la réplica ya se cerró localmente.
 */

import type { CashMovement, CashSession, CashSummary } from '@/components/pos/cajas/types';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import { deleteCatalogMeta, listCatalogMeta, putCatalogMeta } from './catalogStore';
import { closeIdb, openIdb, requestToPromise, txDone } from './offlineDb';
import type { OutboxSaleRecord } from './salesOutbox';

export const CASH_OUTBOX_DB_NAME = 'goadmin-outbox-cash';
export const CASH_OUTBOX_DB_VERSION = 1;
export const CASH_OUTBOX_STORE = 'cash';
/** Intentos de reproducción antes de pasar el registro a revisión. */
export const MAX_ATTEMPTS = 5;
/** Días que se conserva un registro ya sincronizado. */
export const SYNCED_RETENTION_DAYS = 7;
/** Evento de `window` que se emite cada vez que cambia el outbox de caja o el estado local de la sesión. */
export const CASH_OUTBOX_CHANGED_EVENT = 'goadmin:cash-outbox-changed';
const LOCAL_SESSION_SEQ_KEY = 'goadmin-outbox-cash:session-seq';
const LOCAL_MOVEMENT_SEQ_KEY = 'goadmin-outbox-cash:movement-seq';
const OUTBOX_SEQ_KEY = 'goadmin-outbox-cash:seq';
const LOCAL_SESSION_META_KIND = 'cash_session';

export type CashOutboxStatus = 'pending' | 'syncing' | 'synced' | 'needs_review';
export type CashOutboxKind = 'open' | 'movement' | 'close';

/** Columnas escribibles de `cash_sessions` al abrir. */
export interface CashOpenPayload {
  opened_by: string;
  opened_at: string;
  initial_amount: number;
  notes: string | null;
}

/** Columnas escribibles de `cash_movements`. */
export interface CashMovementPayload {
  type: 'in' | 'out';
  concept: string;
  amount: number;
  user_id: string;
  notes: string | null;
  created_at: string;
}

/** Columnas de `cash_sessions` que escribe el cierre, más el resumen con el que se contó. */
export interface CashClosePayload {
  closed_by: string;
  closed_at: string;
  final_amount: number;
  difference: number;
  notes: string | null;
  /** Resumen calculado sin red (réplica + outbox) en el momento del cierre. Solo auditoría. */
  summary: CashSummary;
  /** true si el resumen no pudo leer la réplica y solo cuenta el outbox (ver `CajasService`). */
  summary_partial: boolean;
}

interface CashOutboxBase {
  /**
   * `open`/`movement`: el `uuid` generado en el cliente (será
   * `cash_sessions.uuid` / `cash_movements.uuid`). `close`: `close:<session_uuid>`.
   */
  id: string;
  kind: CashOutboxKind;
  organization_id: number;
  branch_id: number | null;
  /** `cash_sessions.uuid` de la sesión a la que pertenece la operación. */
  session_uuid: string;
  /** Id de la sesión visto por el POS: negativo si se abrió sin red, real si ya existía. */
  session_local_id: number;
  /** Orden de reproducción (monótono por equipo). */
  seq: number;
  created_at: string;
  updated_at: string;
  status: CashOutboxStatus;
  attempts: number;
  last_error: string | null;
  next_attempt_at: number | null;
  synced_at: string | null;
  /** Id real en Supabase (`cash_sessions.id` en `open`/`close`, `cash_movements.id` en `movement`). */
  server_id: number | null;
}

export interface CashOpenRecord extends CashOutboxBase {
  kind: 'open';
  payload: CashOpenPayload;
}

export interface CashMovementRecord extends CashOutboxBase {
  kind: 'movement';
  /** Id local negativo del movimiento mientras no se sincroniza. */
  movement_local_id: number;
  payload: CashMovementPayload;
}

export interface CashCloseRecord extends CashOutboxBase {
  kind: 'close';
  payload: CashClosePayload;
}

export type CashOutboxRecord = CashOpenRecord | CashMovementRecord | CashCloseRecord;

/** Sesión tal como la ve el POS mientras vive (también) en local. */
export interface LocalCashSession {
  session: CashSession;
  /** true cuando el cierre está en el outbox: la sesión ya no está abierta aunque la réplica diga `open`. */
  closed_locally: boolean;
}

// ── IndexedDB ────────────────────────────────────────────────────────────────

function openCashOutbox(): Promise<IDBDatabase> {
  return openIdb(CASH_OUTBOX_DB_NAME, CASH_OUTBOX_DB_VERSION, {
    [CASH_OUTBOX_STORE]: {
      keyPath: 'id',
      indexes: [
        { name: 'by_status', keyPath: 'status' },
        { name: 'by_session', keyPath: 'session_uuid' },
        { name: 'by_org', keyPath: 'organization_id' },
      ],
    },
  });
}

/** Solo para tests: cierra la conexión para que el siguiente acceso reabra la BD. */
export async function __resetCashOutboxForTests(): Promise<void> {
  await closeIdb(CASH_OUTBOX_DB_NAME);
}

function notifyChanged(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(CASH_OUTBOX_CHANGED_EVENT));
  } catch {
    // Sin CustomEvent (tests sin DOM).
  }
}

function nextCounter(key: string): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const parsed = raw ? Number(raw) : 0;
    const next = Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1;
    localStorage.setItem(key, String(next));
    return next;
  } catch {
    return Date.now() % 1_000_000_000;
  }
}

/** Id local negativo para una sesión abierta sin red. Persistente por equipo. */
export function nextLocalCashSessionId(): number {
  return -nextCounter(LOCAL_SESSION_SEQ_KEY);
}

/** Id local negativo para un movimiento registrado sin red. */
export function nextLocalCashMovementId(): number {
  return -nextCounter(LOCAL_MOVEMENT_SEQ_KEY);
}

function nextSeq(): number {
  return nextCounter(OUTBOX_SEQ_KEY);
}

/** UUID v4 generado en el cliente (mismo respaldo que `salesOutbox.newLocalUuid`). */
export function newCashUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** true solo dentro de Go Admin Desktop y sin conectividad real. En navegador siempre false. */
export function shouldOperateCashOffline(): boolean {
  return isDesktop() && !isAppOnline();
}

// ── Lectura / escritura del outbox ──────────────────────────────────────────

export async function putCashOutboxRecord(record: CashOutboxRecord): Promise<void> {
  const db = await openCashOutbox();
  const tx = db.transaction(CASH_OUTBOX_STORE, 'readwrite');
  tx.objectStore(CASH_OUTBOX_STORE).put(record);
  await txDone(tx);
  notifyChanged();
}

export async function getCashOutboxRecord(id: string): Promise<CashOutboxRecord | null> {
  const db = await openCashOutbox();
  const tx = db.transaction(CASH_OUTBOX_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(CASH_OUTBOX_STORE).get(id));
  return (result as CashOutboxRecord | undefined) ?? null;
}

function bySeq(a: CashOutboxRecord, b: CashOutboxRecord): number {
  return a.seq - b.seq || (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);
}

/** Todos los registros (o los de esos estados/tipos), en orden de reproducción. */
export async function listCashOutbox(filter: { statuses?: CashOutboxStatus[]; kinds?: CashOutboxKind[] } = {}): Promise<CashOutboxRecord[]> {
  const db = await openCashOutbox();
  const tx = db.transaction(CASH_OUTBOX_STORE, 'readonly');
  const all = (await requestToPromise(tx.objectStore(CASH_OUTBOX_STORE).getAll())) as CashOutboxRecord[];
  return all
    .filter((r) => (!filter.statuses || filter.statuses.includes(r.status)) && (!filter.kinds || filter.kinds.includes(r.kind)))
    .sort(bySeq);
}

export async function updateCashOutboxRecord(
  id: string,
  patch: Partial<Pick<CashOutboxBase, 'status' | 'attempts' | 'last_error' | 'next_attempt_at' | 'synced_at' | 'server_id' | 'session_local_id'>>,
): Promise<CashOutboxRecord | null> {
  const db = await openCashOutbox();
  const tx = db.transaction(CASH_OUTBOX_STORE, 'readwrite');
  const store = tx.objectStore(CASH_OUTBOX_STORE);
  const current = (await requestToPromise(store.get(id))) as CashOutboxRecord | undefined;
  if (!current) return null;
  const next = { ...current, ...patch, updated_at: new Date().toISOString() } as CashOutboxRecord;
  store.put(next);
  await txDone(tx);
  notifyChanged();
  return next;
}

/** Operaciones de caja que aún no llegaron a Supabase (`pending` + `syncing`). */
export async function countPendingCash(): Promise<number> {
  return (await listCashOutbox({ statuses: ['pending', 'syncing'] })).length;
}

export async function countCashNeedingReview(): Promise<number> {
  return (await listCashOutbox({ statuses: ['needs_review'] })).length;
}

/** Borra SOLO registros `synced` con más de `retentionDays` días. Nunca otro estado. */
export async function pruneSyncedCash(retentionDays: number = SYNCED_RETENTION_DAYS, now: number = Date.now()): Promise<number> {
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const stale = (await listCashOutbox({ statuses: ['synced'] })).filter((r) => {
    const at = r.synced_at ? Date.parse(r.synced_at) : NaN;
    return Number.isFinite(at) && at < cutoff;
  });
  if (stale.length === 0) return 0;
  const db = await openCashOutbox();
  const tx = db.transaction(CASH_OUTBOX_STORE, 'readwrite');
  const store = tx.objectStore(CASH_OUTBOX_STORE);
  for (const r of stale) store.delete(r.id);
  await txDone(tx);
  notifyChanged();
  return stale.length;
}

/** JSON legible del registro, para «Exportar» en la bandeja de revisión. */
export function exportCashOutboxRecord(record: CashOutboxRecord): string {
  return JSON.stringify(record, null, 2);
}

/** Etiqueta corta del registro para la bandeja y el banner. */
export function cashRecordLabel(record: CashOutboxRecord): string {
  if (record.kind === 'open') return `Apertura de caja · inicial ${record.payload.initial_amount}`;
  if (record.kind === 'close') return `Cierre de caja · contado ${record.payload.final_amount}`;
  return `${record.payload.type === 'in' ? 'Ingreso' : 'Retiro'} · ${record.payload.concept} · ${record.payload.amount}`;
}

// ── Estado local de la sesión (meta del catálogo) ───────────────────────────

function localSessionKey(organizationId: number, sessionUuid: string): string {
  return `${LOCAL_SESSION_META_KIND}:${organizationId}:${sessionUuid}`;
}

export async function putLocalCashSession(state: LocalCashSession): Promise<void> {
  const { session } = state;
  await putCatalogMeta<LocalCashSession>({
    key: localSessionKey(session.organization_id, session.uuid),
    kind: LOCAL_SESSION_META_KIND,
    organization_id: session.organization_id,
    value: JSON.parse(JSON.stringify(state)),
  });
  notifyChanged();
}

export async function listLocalCashSessions(organizationId: number): Promise<LocalCashSession[]> {
  const entries = await listCatalogMeta<LocalCashSession>(LOCAL_SESSION_META_KIND, organizationId);
  return entries.map((e) => e.value).sort((a, b) => (a.session.opened_at < b.session.opened_at ? 1 : -1));
}

export async function getLocalCashSessionByUuid(organizationId: number, sessionUuid: string): Promise<LocalCashSession | null> {
  const all = await listLocalCashSessions(organizationId);
  return all.find((s) => s.session.uuid === sessionUuid) ?? null;
}

export async function getLocalCashSessionById(organizationId: number, sessionId: number): Promise<LocalCashSession | null> {
  const all = await listLocalCashSessions(organizationId);
  return all.find((s) => s.session.id === sessionId) ?? null;
}

export async function removeLocalCashSession(organizationId: number, sessionUuid: string): Promise<void> {
  await deleteCatalogMeta(localSessionKey(organizationId, sessionUuid));
  notifyChanged();
}

/** true si el cierre de esa sesión está en el outbox (la réplica todavía la ve `open`). */
export async function isCashSessionClosedLocally(organizationId: number, sessionUuid: string): Promise<boolean> {
  const local = await getLocalCashSessionByUuid(organizationId, sessionUuid);
  return !!local?.closed_locally;
}

export interface LocalActiveSessionQuery {
  organizationId: number;
  /** Sucursal actual del POS; null = sin sucursal. */
  branchId: number | null;
  /** Modo de cajas de la organización (`CajasService.getCashSessionMode`). */
  mode: 'branch' | 'user';
  /** Cajero actual; obligatorio en modo `user`. */
  userId: string | null;
}

/**
 * Sesión abierta según el estado local, con las mismas reglas de alcance que
 * `CajasService.getActiveSession`: en modo `user`, la del cajero en la
 * sucursal; en modo `branch`, la de la sucursal y, si no hay, la global
 * (`branch_id` null). Nunca devuelve una cerrada localmente.
 */
export async function getLocalOpenCashSession(q: LocalActiveSessionQuery): Promise<CashSession | null> {
  const open = (await listLocalCashSessions(q.organizationId)).filter((s) => !s.closed_locally && s.session.status === 'open').map((s) => s.session);
  if (q.mode === 'user') {
    if (!q.userId || !q.branchId) return null;
    return open.find((s) => s.branch_id === q.branchId && s.opened_by === q.userId) ?? null;
  }
  const branch = q.branchId ? open.find((s) => s.branch_id === q.branchId) : undefined;
  if (branch) return branch;
  return open.find((s) => s.branch_id === null) ?? null;
}

// ── Encolado ────────────────────────────────────────────────────────────────

export interface EnqueueCashOpenInput {
  organizationId: number;
  branchId: number | null;
  openedBy: string;
  initialAmount: number;
  notes: string | null;
  openedAt?: string;
  /** Solo para la UI (`opened_by_name`, `branch_name`). */
  openedByName?: string;
  branchName?: string;
}

/**
 * Guarda la apertura en el outbox y la sesión (con id local negativo) en el
 * estado local. No toca Supabase. Devuelve la sesión provisional.
 */
export async function enqueueCashSessionOpen(input: EnqueueCashOpenInput): Promise<CashSession> {
  const openedAt = input.openedAt ?? new Date().toISOString();
  const uuid = newCashUuid();
  const localId = nextLocalCashSessionId();
  const payload: CashOpenPayload = {
    opened_by: input.openedBy,
    opened_at: openedAt,
    initial_amount: Number(input.initialAmount) || 0,
    notes: input.notes ?? null,
  };
  const record: CashOpenRecord = {
    id: uuid,
    kind: 'open',
    organization_id: input.organizationId,
    branch_id: input.branchId,
    session_uuid: uuid,
    session_local_id: localId,
    seq: nextSeq(),
    created_at: openedAt,
    updated_at: openedAt,
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    synced_at: null,
    server_id: null,
    payload,
  };
  const session: CashSession = {
    id: localId,
    uuid,
    organization_id: input.organizationId,
    branch_id: input.branchId,
    opened_by: input.openedBy,
    opened_at: openedAt,
    initial_amount: payload.initial_amount,
    status: 'open',
    notes: payload.notes ?? undefined,
    created_at: openedAt,
    updated_at: openedAt,
    opened_by_name: input.openedByName,
    branch_name: input.branchName,
    pending_sync: true,
  };
  await putCashOutboxRecord(record);
  await putLocalCashSession({ session, closed_locally: false });
  return session;
}

export interface EnqueueCashMovementInput {
  session: Pick<CashSession, 'id' | 'uuid' | 'organization_id' | 'branch_id'>;
  type: 'in' | 'out';
  concept: string;
  amount: number;
  userId: string;
  notes: string | null;
  createdAt?: string;
}

/** Guarda un ingreso/retiro en el outbox. Devuelve el movimiento provisional (id negativo). */
export async function enqueueCashMovement(input: EnqueueCashMovementInput): Promise<CashMovement> {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const uuid = newCashUuid();
  const localId = nextLocalCashMovementId();
  const payload: CashMovementPayload = {
    type: input.type,
    concept: input.concept,
    amount: Number(input.amount) || 0,
    user_id: input.userId,
    notes: input.notes ?? null,
    created_at: createdAt,
  };
  const record: CashMovementRecord = {
    id: uuid,
    kind: 'movement',
    organization_id: input.session.organization_id,
    branch_id: input.session.branch_id,
    session_uuid: input.session.uuid,
    session_local_id: input.session.id,
    movement_local_id: localId,
    seq: nextSeq(),
    created_at: createdAt,
    updated_at: createdAt,
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    synced_at: null,
    server_id: null,
    payload,
  };
  await putCashOutboxRecord(record);
  return movementRecordToRow(record);
}

/** Movimiento con la forma de `cash_movements` para la UI y el resumen. */
export function movementRecordToRow(record: CashMovementRecord): CashMovement {
  return {
    id: record.server_id ?? record.movement_local_id,
    uuid: record.id,
    organization_id: record.organization_id,
    cash_session_id: record.session_local_id,
    type: record.payload.type,
    concept: record.payload.concept,
    amount: record.payload.amount,
    user_id: record.payload.user_id,
    notes: record.payload.notes ?? undefined,
    created_at: record.payload.created_at,
    updated_at: record.updated_at,
    pending_sync: record.status !== 'synced',
  };
}

/**
 * Movimientos del outbox de una sesión que aún no están en Supabase
 * (`pending`/`syncing`/`needs_review`), por uuid o por id local/real.
 */
export async function listPendingOutboxMovements(session: { uuid?: string | null; id?: number | null }): Promise<CashMovement[]> {
  const records = (await listCashOutbox({ statuses: ['pending', 'syncing', 'needs_review'], kinds: ['movement'] })) as CashMovementRecord[];
  return records
    .filter((r) => (session.uuid && r.session_uuid === session.uuid) || (session.id !== undefined && session.id !== null && r.session_local_id === session.id))
    .map(movementRecordToRow);
}

export interface EnqueueCashCloseInput {
  session: CashSession;
  closedBy: string;
  finalAmount: number;
  difference: number;
  notes: string | null;
  summary: CashSummary;
  summaryPartial: boolean;
  closedAt?: string;
}

/**
 * Guarda el cierre en el outbox y marca la sesión cerrada en el estado local.
 * Devuelve la sesión cerrada provisional («pendiente de sincronizar»).
 */
export async function enqueueCashSessionClose(input: EnqueueCashCloseInput): Promise<CashSession> {
  const closedAt = input.closedAt ?? new Date().toISOString();
  const { session } = input;
  const payload: CashClosePayload = {
    closed_by: input.closedBy,
    closed_at: closedAt,
    final_amount: Number(input.finalAmount) || 0,
    difference: Number(input.difference) || 0,
    notes: input.notes ?? null,
    summary: JSON.parse(JSON.stringify(input.summary)),
    summary_partial: input.summaryPartial,
  };
  const record: CashCloseRecord = {
    id: `close:${session.uuid}`,
    kind: 'close',
    organization_id: session.organization_id,
    branch_id: session.branch_id,
    session_uuid: session.uuid,
    session_local_id: session.id,
    seq: nextSeq(),
    created_at: closedAt,
    updated_at: closedAt,
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    synced_at: null,
    server_id: session.id > 0 ? session.id : null,
    payload,
  };
  const closed: CashSession = {
    ...session,
    closed_at: closedAt,
    closed_by: input.closedBy,
    final_amount: payload.final_amount,
    difference: payload.difference,
    notes: payload.notes ?? session.notes,
    status: 'closed',
    updated_at: closedAt,
    pending_sync: true,
  };
  await putCashOutboxRecord(record);
  await putLocalCashSession({ session: closed, closed_locally: true });
  return closed;
}

// ── Resumen de caja con las ventas del outbox ───────────────────────────────

export interface OutboxSalesDeltas {
  /** Efectivo de ventas del outbox menos el vuelto entregado. */
  sales_cash: number;
  change_total: number;
  /** Ventas por método (sin vuelto). */
  sales_by_method: Record<string, number>;
  /** Cuántas ventas del outbox entran en la sesión. */
  sales_count: number;
}

/**
 * Aporte de las ventas hechas sin red (outbox, aún sin `payments` en
 * Supabase ni en la réplica) al resumen de una sesión: mismas reglas de
 * alcance que `getCashSummary` (organización, sucursal de la sesión si no es
 * global, desde `opened_at` hasta `closed_at`/ahora y, en modo `user`, solo
 * las del cajero que abrió). Puro: no toca IndexedDB.
 */
export function outboxSalesDeltas(
  session: Pick<CashSession, 'organization_id' | 'branch_id' | 'opened_at' | 'closed_at' | 'opened_by'>,
  sales: OutboxSaleRecord[],
  opts: { filterByCashier: boolean; now?: string } = { filterByCashier: false },
): OutboxSalesDeltas {
  const from = session.opened_at;
  const to = session.closed_at || opts.now || new Date().toISOString();
  const deltas: OutboxSalesDeltas = { sales_cash: 0, change_total: 0, sales_by_method: {}, sales_count: 0 };
  for (const record of sales) {
    if (record.status === 'synced') continue;
    const { envelope } = record;
    if (envelope.organization_id !== session.organization_id) continue;
    if (session.branch_id && envelope.branch_id !== session.branch_id) continue;
    const at = envelope.checkout.createdAt ?? record.created_at;
    if (at < from || at > to) continue;
    if (opts.filterByCashier && (envelope.user_id ?? envelope.checkout.userId) !== session.opened_by) continue;
    deltas.sales_count++;
    const change = Number(envelope.checkout.change) || 0;
    deltas.change_total += change;
    for (const p of envelope.checkout.payments) {
      const method = p.method || 'other';
      const amount = Number(p.amount) || 0;
      deltas.sales_by_method[method] = (deltas.sales_by_method[method] || 0) + amount;
      if (method === 'cash') deltas.sales_cash += amount;
    }
    deltas.sales_cash -= change;
  }
  return deltas;
}

/** Aplica los aportes del outbox a un `CashSummary` ya calculado (réplica o Supabase). Devuelve uno nuevo. */
export function applyOutboxSalesToSummary(summary: CashSummary, deltas: OutboxSalesDeltas): CashSummary {
  if (deltas.sales_count === 0) return summary;
  const merge = (base: Record<string, number> | undefined) => {
    const out: Record<string, number> = { ...(base ?? {}) };
    for (const [method, amount] of Object.entries(deltas.sales_by_method)) out[method] = (out[method] || 0) + amount;
    return out;
  };
  const salesGross = Object.values(deltas.sales_by_method).reduce((s, v) => s + v, 0);
  return {
    ...summary,
    sales_cash: summary.sales_cash + deltas.sales_cash,
    expected_amount: summary.expected_amount + deltas.sales_cash,
    change_total: summary.change_total + deltas.change_total,
    payments_by_method: merge(summary.payments_by_method),
    income_by_method: merge(summary.income_by_method),
    sales_total: (summary.sales_total ?? 0) + salesGross - deltas.change_total,
    sales_by_method: merge(summary.sales_by_method),
  };
}
