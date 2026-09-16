/**
 * Sincronización del outbox de clientes (Desktop fase 4D).
 *
 * Reproduce los registros `pending` en orden de `created_at`, uno a uno:
 *
 *   1. `SELECT id FROM customers WHERE id = <local> AND organization_id = <org>`
 *      → si existe, ya se sincronizó en un intento anterior (idempotente por id).
 *   2. `INSERT` con el id generado en el cliente.
 *   3. Si el insert choca con un UNIQUE (`23505`: mismo documento o email en la
 *      organización), el cliente ya existía: se busca su id real, se guarda en
 *      `server_id` y las ventas pendientes que lo referencian se remapean con
 *      `remapOutboxSalesCustomer`. Nunca se crea un duplicado.
 *
 *  - Éxito → `synced`, y la fila del catálogo local pierde `pending_sync`.
 *  - Error → `attempts++`, backoff, y a los `MAX_ATTEMPTS` → `needs_review`.
 *    Nunca se borra un registro.
 *  - Una sola sincronización a la vez (llamadas concurrentes comparten la
 *    promesa).
 *
 * `salesSync` la llama ANTES de reproducir ventas, y además comprueba por
 * venta que su cliente ya esté sincronizado (`ensureCustomerSynced`).
 *
 * El cliente de Supabase se recibe por parámetro (tests) o se carga bajo
 * demanda desde `@/lib/supabase/config` solo cuando hay algo que enviar, para
 * que importar este módulo no arrastre el cliente del navegador.
 */

import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import {
  MAX_ATTEMPTS,
  getOutboxCustomer,
  listOutboxCustomers,
  markCustomerSyncedInCatalog,
  pruneSyncedCustomers,
  updateOutboxCustomer,
  type OutboxCustomerRecord,
} from './customersOutbox';
import { remapOutboxSalesCustomer } from './salesOutbox';
import { backoffMs } from './salesSync';

/** Subconjunto del cliente de Supabase que usa la sincronización. */
export interface CustomersSyncClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
}

export interface CustomersSyncResult {
  synced: number;
  /** Sincronizados sobre un cliente que ya existía (id remapeado). */
  remapped: number;
  failed: number;
  needsReview: number;
  skipped: number;
}

export interface CustomersSyncOptions {
  client?: CustomersSyncClient;
  /** Ignora el backoff (botón «Reintentar»). */
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

function errorMessage(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  const e = err as PgError;
  const parts = [e.code, e.message, e.details, e.hint].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' — ') : JSON.stringify(err);
}

async function defaultClient(): Promise<CustomersSyncClient> {
  const mod = await import('@/lib/supabase/config');
  return mod.supabase as unknown as CustomersSyncClient;
}

/** Busca el cliente que ya existía por documento o email dentro de la organización. */
async function findExistingByUniqueKeys(client: CustomersSyncClient, record: OutboxCustomerRecord): Promise<string | null> {
  const { organization_id: org, identification_number: doc, email } = record.payload;
  if (doc) {
    const { data } = await client.from('customers').select('id').eq('organization_id', org).eq('identification_number', doc).limit(1).maybeSingle();
    if (data?.id) return String(data.id);
  }
  if (email) {
    const { data } = await client.from('customers').select('id').eq('organization_id', org).eq('email', email).limit(1).maybeSingle();
    if (data?.id) return String(data.id);
  }
  return null;
}

async function finishSynced(record: OutboxCustomerRecord, serverId: string, now: number): Promise<void> {
  if (serverId !== record.id) await remapOutboxSalesCustomer(record.id, serverId);
  try {
    await markCustomerSyncedInCatalog(record, serverId);
  } catch (err) {
    console.warn('[customersSync] No se pudo actualizar el catálogo local:', err);
  }
  await updateOutboxCustomer(record.id, {
    status: 'synced',
    server_id: serverId,
    synced_at: new Date(now).toISOString(),
    last_error: null,
    next_attempt_at: null,
  });
}

async function replayOne(client: CustomersSyncClient, record: OutboxCustomerRecord, now: number): Promise<'synced' | 'remapped' | 'failed' | 'needs_review'> {
  await updateOutboxCustomer(record.id, { status: 'syncing' });
  try {
    const org = record.organization_id;
    const existing = await client.from('customers').select('id').eq('id', record.id).eq('organization_id', org).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.id) {
      await finishSynced(record, record.id, now);
      return 'synced';
    }

    const { error } = await client.from('customers').insert({ id: record.id, ...record.payload });
    if (!error) {
      await finishSynced(record, record.id, now);
      return 'synced';
    }
    if ((error as PgError).code === '23505') {
      // Carrera: otro equipo insertó este mismo id, o el cliente ya existía por documento/email.
      const again = await client.from('customers').select('id').eq('id', record.id).eq('organization_id', org).maybeSingle();
      if (again.data?.id) {
        await finishSynced(record, record.id, now);
        return 'synced';
      }
      const serverId = await findExistingByUniqueKeys(client, record);
      if (serverId) {
        await finishSynced(record, serverId, now);
        return 'remapped';
      }
    }
    throw error;
  } catch (err) {
    const attempts = record.attempts + 1;
    const message = errorMessage(err);
    console.error(`[customersSync] Fallo sincronizando el cliente ${record.id} (intento ${attempts}):`, message);
    if (attempts >= MAX_ATTEMPTS) {
      await updateOutboxCustomer(record.id, { status: 'needs_review', attempts, last_error: message, next_attempt_at: null });
      return 'needs_review';
    }
    await updateOutboxCustomer(record.id, { status: 'pending', attempts, last_error: message, next_attempt_at: now + backoffMs(attempts) });
    return 'failed';
  }
}

let inFlight: Promise<CustomersSyncResult> | null = null;

async function runSync(options: CustomersSyncOptions): Promise<CustomersSyncResult> {
  const now = options.now ? options.now() : Date.now();
  const result: CustomersSyncResult = { synced: 0, remapped: 0, failed: 0, needsReview: 0, skipped: 0 };

  // `syncing` huérfanos (app cerrada a mitad): el insert es idempotente por id.
  let records = await listOutboxCustomers(['pending', 'syncing']);
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
    else if (outcome === 'remapped') {
      result.synced++;
      result.remapped++;
    } else if (outcome === 'failed') result.failed++;
    else result.needsReview++;
  }

  try {
    await pruneSyncedCustomers();
  } catch (err) {
    console.warn('[customersSync] No se pudo purgar registros antiguos:', err);
  }
  return result;
}

/**
 * Sincroniza los clientes pendientes. Si ya hay una sincronización en curso,
 * devuelve esa misma promesa.
 */
export function syncPendingCustomers(options: CustomersSyncOptions = {}): Promise<CustomersSyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync(options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** «Reintentar» desde la bandeja: a `pending`, intentos a cero, y ya. */
export async function retryOutboxCustomer(id: string, client?: CustomersSyncClient): Promise<CustomersSyncResult> {
  await updateOutboxCustomer(id, { status: 'pending', attempts: 0, next_attempt_at: null });
  return syncPendingCustomers({ force: true, onlyId: id, client });
}

export type CustomerSyncState =
  | { kind: 'not_in_outbox' }
  | { kind: 'synced'; serverId: string }
  | { kind: 'pending'; attempts: number; lastError: string | null }
  | { kind: 'needs_review'; lastError: string | null };

/**
 * Para `salesSync`: garantiza que el cliente de una venta ya esté en Supabase
 * antes de reproducirla. Si está pendiente lo intenta ahora mismo (sin
 * esperar su backoff) y devuelve el estado resultante.
 */
export async function ensureCustomerSynced(customerId: string | null | undefined, client?: CustomersSyncClient): Promise<CustomerSyncState> {
  if (!customerId) return { kind: 'not_in_outbox' };
  let record = await getOutboxCustomer(customerId);
  if (!record) return { kind: 'not_in_outbox' };
  if (record.status === 'pending' || record.status === 'syncing') {
    await syncPendingCustomers({ force: true, onlyId: customerId, client });
    record = (await getOutboxCustomer(customerId)) ?? record;
  }
  if (record.status === 'synced') return { kind: 'synced', serverId: record.server_id ?? record.id };
  if (record.status === 'needs_review') return { kind: 'needs_review', lastError: record.last_error };
  return { kind: 'pending', attempts: record.attempts, lastError: record.last_error };
}

/** Solo para tests. */
export function __resetCustomersSyncForTests(): void {
  inFlight = null;
}
