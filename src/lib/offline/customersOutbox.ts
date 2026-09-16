/**
 * Outbox de clientes del Desktop (fase 4D — clientes e imágenes sin red).
 *
 * Cuando Go Admin Desktop no tiene conexión, «Crear nuevo cliente» en el POS
 * no intenta escribir en Supabase: genera el id en el cliente
 * (`customers.id` es `uuid` con `gen_random_uuid()` por defecto, verificado
 * por MCP el 2026-09-16), guarda la fila en el catálogo local
 * (`goadmin-catalog › customers`, con `pending_sync: true`) para que el
 * selector y el carrito la vean al instante, y encola aquí el payload que
 * `customersSync.ts` insertará al volver la red.
 *
 * Mismo patrón que `salesOutbox.ts` (y mismo archivo IndexedDB
 * `goadmin-outbox`, store `customers`):
 *  - Un registro NUNCA se borra por fallos: tras `MAX_ATTEMPTS` pasa a
 *    `needs_review` con `last_error` y el payload íntegro.
 *  - Los `synced` se conservan `SYNCED_RETENTION_DAYS` días y luego se purgan.
 *  - No importa Supabase: solo IndexedDB, probable con `fake-indexeddb`.
 *
 * Idempotencia al sincronizar: por id. Si Supabase rechaza el insert por los
 * UNIQUE `(organization_id, identification_number)` o
 * `(organization_id, email)`, el cliente ya existía: se busca su id real, se
 * guarda en `server_id` y las ventas pendientes que lo referencian se
 * remapean (`remapOutboxSalesCustomer`). Nunca se duplica.
 *
 * Columnas de `customers` escritas (las generadas `full_name`, `doc_type` y
 * `doc_number` NO se escriben; salen de `first_name`/`last_name` e
 * `identification_*`).
 */

import { deleteCatalogRow, getCatalogRowsByOrg, putCatalogRows, type CatalogCustomer } from './catalogStore';
import {
  MAX_ATTEMPTS,
  OUTBOX_CUSTOMERS_STORE,
  SYNCED_RETENTION_DAYS,
  newLocalUuid,
  openOutbox,
  requestToPromise,
  type OutboxSaleStatus,
} from './salesOutbox';

export { MAX_ATTEMPTS, SYNCED_RETENTION_DAYS };

/** Evento de `window` que se emite cada vez que cambia el outbox de clientes. */
export const CUSTOMERS_OUTBOX_CHANGED_EVENT = 'goadmin:customers-outbox-changed';

export type OutboxCustomerStatus = OutboxSaleStatus;

/** Columnas escribibles de `customers` que el POS rellena sin red. */
export interface OfflineCustomerPayload {
  organization_id: number;
  branch_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  identification_type: string | null;
  identification_number: string | null;
  address: string | null;
  customer_type: 'person' | 'company';
  company_name: string | null;
  roles: string[];
  tags: string[];
  preferences: Record<string, unknown>;
  fiscal_responsibilities: string[] | null;
  fiscal_municipality_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OutboxCustomerRecord {
  /** UUID generado en el cliente; será `customers.id` salvo remapeo. */
  id: string;
  organization_id: number;
  payload: OfflineCustomerPayload;
  /** ISO. Orden de reproducción. */
  created_at: string;
  updated_at: string;
  status: OutboxCustomerStatus;
  attempts: number;
  last_error: string | null;
  next_attempt_at: number | null;
  synced_at: string | null;
  /**
   * Id definitivo en Supabase. Igual a `id` salvo que el cliente ya existiera
   * (mismo documento o email en la organización): entonces es el id de esa
   * fila y las ventas pendientes se remapean.
   */
  server_id: string | null;
}

function notifyChanged(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(CUSTOMERS_OUTBOX_CHANGED_EVENT));
  } catch {
    // Sin CustomEvent (tests sin DOM).
  }
}

// ── Lectura / escritura del outbox ──────────────────────────────────────────

export async function putOutboxCustomer(record: OutboxCustomerRecord): Promise<void> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_CUSTOMERS_STORE, 'readwrite');
  await requestToPromise(tx.objectStore(OUTBOX_CUSTOMERS_STORE).put(record));
  notifyChanged();
}

export async function getOutboxCustomer(id: string): Promise<OutboxCustomerRecord | null> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_CUSTOMERS_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(OUTBOX_CUSTOMERS_STORE).get(id));
  return (result as OutboxCustomerRecord | undefined) ?? null;
}

/** Todos los registros, ordenados por `created_at` ascendente. */
export async function listOutboxCustomers(statuses?: OutboxCustomerStatus[]): Promise<OutboxCustomerRecord[]> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_CUSTOMERS_STORE, 'readonly');
  const all = (await requestToPromise(tx.objectStore(OUTBOX_CUSTOMERS_STORE).getAll())) as OutboxCustomerRecord[];
  const filtered = statuses ? all.filter((r) => statuses.includes(r.status)) : all;
  return filtered.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

export async function updateOutboxCustomer(
  id: string,
  patch: Partial<Omit<OutboxCustomerRecord, 'id' | 'payload' | 'organization_id' | 'created_at'>>,
): Promise<OutboxCustomerRecord | null> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_CUSTOMERS_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_CUSTOMERS_STORE);
  const current = (await requestToPromise(store.get(id))) as OutboxCustomerRecord | undefined;
  if (!current) return null;
  const next: OutboxCustomerRecord = { ...current, ...patch, updated_at: new Date().toISOString() };
  await requestToPromise(store.put(next));
  notifyChanged();
  return next;
}

/** Clientes que aún no llegaron a Supabase (`pending` + `syncing`). */
export async function countPendingCustomers(): Promise<number> {
  return (await listOutboxCustomers(['pending', 'syncing'])).length;
}

export async function countCustomersNeedingReview(): Promise<number> {
  return (await listOutboxCustomers(['needs_review'])).length;
}

/** Borra SOLO registros `synced` con más de `retentionDays` días. Nunca otro estado. */
export async function pruneSyncedCustomers(retentionDays: number = SYNCED_RETENTION_DAYS, now: number = Date.now()): Promise<number> {
  const db = await openOutbox();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const stale = (await listOutboxCustomers(['synced'])).filter((r) => {
    const at = r.synced_at ? Date.parse(r.synced_at) : NaN;
    return Number.isFinite(at) && at < cutoff;
  });
  if (stale.length === 0) return 0;
  const tx = db.transaction(OUTBOX_CUSTOMERS_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_CUSTOMERS_STORE);
  for (const r of stale) await requestToPromise(store.delete(r.id));
  notifyChanged();
  return stale.length;
}

/**
 * Id que debe llevar una venta para este cliente: el del servidor si el
 * registro se remapeó, o el mismo id si no está en el outbox (cliente
 * replicado normal).
 */
export async function resolveCustomerId(customerId: string): Promise<string> {
  const record = await getOutboxCustomer(customerId);
  return record?.server_id ?? customerId;
}

// ── Fila del catálogo local ─────────────────────────────────────────────────

/** Reproduce la expresión de la columna generada `customers.full_name`. */
export function computeFullName(p: Pick<OfflineCustomerPayload, 'customer_type' | 'company_name' | 'first_name' | 'last_name'>): string | null {
  const person = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null;
  if (p.customer_type === 'company') return (p.company_name ?? '').trim() || person || 'Empresa sin nombre';
  return person;
}

/** Misma forma que una fila replicada de `customers`, marcada `pending_sync`. */
export function toCatalogCustomer(record: Pick<OutboxCustomerRecord, 'id' | 'payload'>, pendingSync = true): CatalogCustomer {
  const p = record.payload;
  return {
    id: record.id,
    organization_id: p.organization_id,
    branch_id: p.branch_id,
    first_name: p.first_name,
    last_name: p.last_name,
    full_name: computeFullName(p),
    email: p.email,
    phone: p.phone,
    doc_type: p.identification_type,
    doc_number: p.identification_number,
    identification_type: p.identification_type,
    identification_number: p.identification_number,
    company_name: p.company_name,
    trade_name: null,
    address: p.address,
    city: null,
    customer_type: p.customer_type,
    avatar_url: null,
    roles: p.roles,
    tags: p.tags,
    preferences: p.preferences,
    fiscal_municipality_id: p.fiscal_municipality_id,
    created_at: p.created_at,
    updated_at: p.created_at,
    pending_sync: pendingSync,
  };
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase();
}

/**
 * Comprueba en el catálogo local si ya hay un cliente con el mismo documento
 * o email en la organización (mismos UNIQUE que Postgres). Devuelve la fila
 * si existe, para que el POS la ofrezca en vez de crear un duplicado que la
 * sincronización remapearía después.
 */
export async function findLocalCustomerDuplicate(
  organizationId: number,
  keys: { identification_number?: string | null; email?: string | null },
): Promise<CatalogCustomer | null> {
  const doc = normalizeKey(keys.identification_number);
  const email = normalizeKey(keys.email);
  if (!doc && !email) return null;
  const rows = await getCatalogRowsByOrg('customers', organizationId);
  return (
    rows.find((c) => (doc && normalizeKey(c.identification_number) === doc) || (email && normalizeKey(c.email) === email)) ?? null
  );
}

// ── Encolado ────────────────────────────────────────────────────────────────

/**
 * Guarda el cliente en el outbox y en el catálogo local. No toca Supabase.
 * Devuelve la fila con la forma del catálogo (`pending_sync: true`).
 */
export async function enqueueOfflineCustomer(payload: OfflineCustomerPayload, id: string = newLocalUuid()): Promise<CatalogCustomer> {
  const createdAt = payload.created_at || new Date().toISOString();
  const clean: OfflineCustomerPayload = JSON.parse(JSON.stringify({ ...payload, created_at: createdAt }));
  const record: OutboxCustomerRecord = {
    id,
    organization_id: clean.organization_id,
    payload: clean,
    created_at: createdAt,
    updated_at: createdAt,
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    synced_at: null,
    server_id: null,
  };
  const row = toCatalogCustomer(record);
  await putCatalogRows('customers', [row]);
  await putOutboxCustomer(record);
  return row;
}

/**
 * Tras una replicación del catálogo (que poda lo que no está en el servidor)
 * vuelve a poner en `goadmin-catalog › customers` los clientes locales que
 * aún no se sincronizaron, para que el selector los siga mostrando.
 */
export async function restorePendingCustomersToCatalog(organizationId: number): Promise<number> {
  const pending = (await listOutboxCustomers(['pending', 'syncing', 'needs_review'])).filter((r) => r.organization_id === organizationId);
  if (pending.length === 0) return 0;
  await putCatalogRows(
    'customers',
    pending.map((r) => toCatalogCustomer(r)),
  );
  return pending.length;
}

/**
 * El cliente ya está en Supabase: quita la marca `pending_sync` del catálogo.
 * Si el id del servidor es otro (cliente que ya existía), la fila local se
 * retira y se deja una copia bajo el id real hasta la próxima replicación.
 */
export async function markCustomerSyncedInCatalog(record: OutboxCustomerRecord, serverId: string): Promise<void> {
  const row = toCatalogCustomer({ id: serverId, payload: record.payload }, false);
  if (serverId !== record.id) await deleteCatalogRow('customers', record.id);
  await putCatalogRows('customers', [row]);
}

/** JSON legible del registro, para «Exportar» en la bandeja de revisión. */
export function exportOutboxCustomer(record: OutboxCustomerRecord): string {
  return JSON.stringify(record, null, 2);
}
