/**
 * Sincronización del outbox de caja (Desktop fase 4F).
 *
 * Reproduce los registros en orden de `seq`, uno a uno, en dos etapas que
 * el orquestador (`syncOrchestrator.ts`) intercala con las ventas:
 *
 *   `syncCashOpenings()`               aperturas          (antes de las ventas)
 *   `syncCashMovementsAndClosings()`   movimientos y cierres (después de las ventas)
 *
 * Por registro:
 *  - `open`: `SELECT id FROM cash_sessions WHERE uuid = <uuid>` → si existe,
 *    ya se insertó (idempotente por uuid). Si no, `INSERT` con el uuid del
 *    cliente; `23505` → releer por uuid. El id real queda en `server_id` y
 *    la sesión local pasa a tener ese id.
 *  - `movement`: necesita el id real de su sesión (`resolveSessionServerId`):
 *    si la apertura aún no se sincronizó, se deja `pending` SIN consumir
 *    intentos. Idempotente por `cash_movements.uuid`.
 *  - `close`: mismo requisito; `UPDATE cash_sessions SET status='closed', …
 *    WHERE id = <real>`. Si la fila ya está `closed`, se da por hecha.
 *  - Éxito → `synced`; error → `attempts++`, backoff, y a los `MAX_ATTEMPTS`
 *    → `needs_review`. Nunca se borra un registro.
 *  - Una sola sincronización a la vez (llamadas concurrentes comparten la
 *    promesa).
 *
 * El cliente de Supabase se recibe por parámetro (tests) o se carga bajo
 * demanda desde `@/lib/supabase/config`.
 */

import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import {
  MAX_ATTEMPTS,
  getCashOutboxRecord,
  getLocalCashSessionByUuid,
  listCashOutbox,
  pruneSyncedCash,
  putLocalCashSession,
  removeLocalCashSession,
  updateCashOutboxRecord,
  type CashCloseRecord,
  type CashMovementRecord,
  type CashOpenRecord,
  type CashOutboxRecord,
} from './cashOutbox';

/** Subconjunto del cliente de Supabase que usa la sincronización. */
export interface CashSyncClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface CashSyncResult {
  synced: number;
  failed: number;
  needsReview: number;
  /** Sin intentar: backoff, sin red, o esperando a la apertura de su sesión. */
  skipped: number;
}

export interface CashSyncOptions {
  client?: CashSyncClient;
  /** Ignora el backoff (botón «Reintentar» / «Sincronizar ahora»). */
  force?: boolean;
  /** Solo este registro. */
  onlyId?: string;
  now?: () => number;
}

interface PgError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/** Backoff entre intentos: 30 s, 1 min, 2 min, 4 min (tope 10 min). Igual que ventas. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}

function errorMessage(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  const e = err as PgError;
  const parts = [e.code, e.message, e.details, e.hint].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' — ') : JSON.stringify(err);
}

async function defaultClient(): Promise<CashSyncClient> {
  const mod = await import('@/lib/supabase/config');
  return mod.supabase as unknown as CashSyncClient;
}

/** Mensaje que ve la bandeja cuando un movimiento/cierre espera a su apertura. */
export const WAITING_FOR_OPENING_MESSAGE = 'Esperando a que se sincronice la apertura de la caja';

/**
 * Id real de `cash_sessions` para un movimiento o cierre: el id local si la
 * sesión ya existía en Supabase (positivo), o el `server_id` del registro
 * `open` de la misma `session_uuid`. Null si la apertura aún no entró.
 */
export async function resolveSessionServerId(record: CashMovementRecord | CashCloseRecord): Promise<number | null> {
  if (record.session_local_id > 0) return record.session_local_id;
  const opening = await getCashOutboxRecord(record.session_uuid);
  if (opening && opening.kind === 'open' && opening.server_id) return opening.server_id;
  const local = await getLocalCashSessionByUuid(record.organization_id, record.session_uuid);
  if (local && local.session.id > 0) return local.session.id;
  return null;
}

async function findSessionByUuid(client: CashSyncClient, org: number, uuid: string): Promise<{ id: number; status: string } | null> {
  const { data, error } = await client.from('cash_sessions').select('id, status').eq('organization_id', org).eq('uuid', uuid).maybeSingle();
  if (error) throw error;
  return data ? { id: Number(data.id), status: String(data.status) } : null;
}

async function replayOpen(client: CashSyncClient, record: CashOpenRecord): Promise<number> {
  const org = record.organization_id;
  let existing = await findSessionByUuid(client, org, record.session_uuid);
  if (!existing) {
    const { data, error } = await client
      .from('cash_sessions')
      .insert({
        uuid: record.session_uuid,
        organization_id: org,
        branch_id: record.branch_id,
        opened_by: record.payload.opened_by,
        opened_at: record.payload.opened_at,
        initial_amount: record.payload.initial_amount,
        notes: record.payload.notes ?? 'Apertura de caja',
        status: 'open',
      })
      .select('id, status')
      .single();
    if (error && (error as PgError).code !== '23505') throw error;
    existing = data ? { id: Number(data.id), status: String(data.status) } : await findSessionByUuid(client, org, record.session_uuid);
    if (!existing) throw error ?? new Error('La apertura no devolvió id');
  }
  // La sesión local pasa a tener el id real: movimientos y cierre lo resuelven por uuid.
  const local = await getLocalCashSessionByUuid(org, record.session_uuid);
  if (local) {
    await putLocalCashSession({ ...local, session: { ...local.session, id: existing.id, pending_sync: local.closed_locally } });
  }
  return existing.id;
}

async function replayMovement(client: CashSyncClient, record: CashMovementRecord, sessionId: number): Promise<number> {
  const org = record.organization_id;
  const { data: found, error: findError } = await client.from('cash_movements').select('id').eq('organization_id', org).eq('uuid', record.id).maybeSingle();
  if (findError) throw findError;
  if (found?.id) return Number(found.id);
  const { data, error } = await client
    .from('cash_movements')
    .insert({
      uuid: record.id,
      organization_id: org,
      cash_session_id: sessionId,
      branch_id: record.branch_id,
      type: record.payload.type,
      concept: record.payload.concept,
      amount: record.payload.amount,
      user_id: record.payload.user_id,
      notes: record.payload.notes,
      created_at: record.payload.created_at,
    })
    .select('id')
    .single();
  if (error && (error as PgError).code !== '23505') throw error;
  if (data?.id) return Number(data.id);
  const again = await client.from('cash_movements').select('id').eq('organization_id', org).eq('uuid', record.id).maybeSingle();
  if (again.data?.id) return Number(again.data.id);
  throw error ?? new Error('El movimiento no devolvió id');
}

async function replayClose(client: CashSyncClient, record: CashCloseRecord, sessionId: number): Promise<number> {
  const org = record.organization_id;
  const { data: current, error: findError } = await client.from('cash_sessions').select('id, status').eq('organization_id', org).eq('id', sessionId).maybeSingle();
  if (findError) throw findError;
  if (!current) throw new Error(`La sesión de caja ${sessionId} no existe en el servidor`);
  if (String(current.status) !== 'closed') {
    const { error } = await client
      .from('cash_sessions')
      .update({
        closed_at: record.payload.closed_at,
        closed_by: record.payload.closed_by,
        final_amount: record.payload.final_amount,
        difference: record.payload.difference,
        notes: record.payload.notes ?? undefined,
        status: 'closed',
      })
      .eq('organization_id', org)
      .eq('id', sessionId);
    if (error) throw error;
  }
  // La réplica ya puede mandar: el estado local de la sesión sobra.
  await removeLocalCashSession(org, record.session_uuid);
  return sessionId;
}

async function markFailure(record: CashOutboxRecord, err: unknown, now: number): Promise<'failed' | 'needs_review'> {
  const attempts = record.attempts + 1;
  const message = errorMessage(err);
  console.error(`[cashSync] Fallo sincronizando ${record.kind} ${record.id} (intento ${attempts}):`, message);
  if (attempts >= MAX_ATTEMPTS) {
    await updateCashOutboxRecord(record.id, { status: 'needs_review', attempts, last_error: message, next_attempt_at: null });
    return 'needs_review';
  }
  await updateCashOutboxRecord(record.id, { status: 'pending', attempts, last_error: message, next_attempt_at: now + backoffMs(attempts) });
  return 'failed';
}

async function replayOne(client: CashSyncClient, record: CashOutboxRecord, now: number): Promise<'synced' | 'failed' | 'needs_review' | 'skipped'> {
  let sessionId: number | null = null;
  if (record.kind !== 'open') {
    sessionId = await resolveSessionServerId(record);
    if (sessionId === null) {
      // Sin consumir intentos: se reintenta cuando entre la apertura.
      await updateCashOutboxRecord(record.id, { status: 'pending', last_error: WAITING_FOR_OPENING_MESSAGE });
      return 'skipped';
    }
  }
  await updateCashOutboxRecord(record.id, { status: 'syncing' });
  try {
    let serverId: number;
    if (record.kind === 'open') serverId = await replayOpen(client, record);
    else if (record.kind === 'movement') serverId = await replayMovement(client, record, sessionId as number);
    else serverId = await replayClose(client, record, sessionId as number);
    await updateCashOutboxRecord(record.id, {
      status: 'synced',
      server_id: serverId,
      session_local_id: record.kind === 'movement' ? (sessionId as number) : serverId,
      synced_at: new Date(now).toISOString(),
      last_error: null,
      next_attempt_at: null,
    });
    return 'synced';
  } catch (err) {
    return markFailure(record, err, now);
  }
}

let inFlight: Promise<CashSyncResult> | null = null;

async function runSync(kinds: Array<CashOutboxRecord['kind']>, options: CashSyncOptions): Promise<CashSyncResult> {
  const now = options.now ? options.now() : Date.now();
  const result: CashSyncResult = { synced: 0, failed: 0, needsReview: 0, skipped: 0 };

  // `syncing` huérfanos (app cerrada a mitad): todo es idempotente por uuid.
  let records = await listCashOutbox({ statuses: ['pending', 'syncing'], kinds });
  if (options.onlyId) records = records.filter((r) => r.id === options.onlyId);
  if (records.length === 0) return result;

  const client = options.client ?? (await defaultClient());
  for (const record of records) {
    if (!options.force && record.next_attempt_at && record.next_attempt_at > now) {
      result.skipped++;
      continue;
    }
    if (isDesktop() && !isAppOnline()) {
      result.skipped++;
      continue;
    }
    const outcome = await replayOne(client, record, now);
    if (outcome === 'synced') result.synced++;
    else if (outcome === 'failed') result.failed++;
    else if (outcome === 'needs_review') result.needsReview++;
    else result.skipped++;
  }

  try {
    await pruneSyncedCash();
  } catch (err) {
    console.warn('[cashSync] No se pudo purgar registros antiguos:', err);
  }
  return result;
}

function share(run: () => Promise<CashSyncResult>): Promise<CashSyncResult> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Etapa 20 del orquestador: aperturas de caja (antes de las ventas). */
export function syncCashOpenings(options: CashSyncOptions = {}): Promise<CashSyncResult> {
  return share(() => runSync(['open'], options));
}

/** Etapa 40 del orquestador: movimientos y cierres (después de las ventas). */
export function syncCashMovementsAndClosings(options: CashSyncOptions = {}): Promise<CashSyncResult> {
  return share(() => runSync(['movement', 'close'], options));
}

/**
 * Todo el outbox de caja en orden (apertura → movimientos → cierre). Uso
 * directo (bandeja, tests); el orquestador prefiere las dos etapas.
 */
export function syncPendingCash(options: CashSyncOptions = {}): Promise<CashSyncResult> {
  return share(() => runSync(['open', 'movement', 'close'], options));
}

/**
 * «Reintentar» desde la bandeja: el registro vuelve a `pending` con los
 * intentos a cero y se reproduce TODO el outbox de caja en orden y sin
 * backoff (un movimiento no puede entrar antes que su apertura).
 */
export async function retryCashOutboxRecord(id: string, client?: CashSyncClient): Promise<CashSyncResult> {
  await updateCashOutboxRecord(id, { status: 'pending', attempts: 0, next_attempt_at: null });
  return syncPendingCash({ force: true, client });
}

/** Solo para tests. */
export function __resetCashSyncForTests(): void {
  inFlight = null;
}
