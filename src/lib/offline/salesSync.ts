/**
 * Sincronización del outbox de ventas (Desktop fase 4B).
 *
 * Reproduce los sobres `pending` en orden de `created_at` llamando a
 * `POSService.checkout({ ...sobre, saleId, createdAt, replayFromOutbox })`
 * de uno en uno. La idempotencia la da el id generado en el cliente: si la
 * venta ya existe en Supabase, `checkout` completa solo lo que falte.
 *
 *  - Éxito → `synced` (se conserva 7 días).
 *  - Error → `attempts++`, backoff, y a los `MAX_ATTEMPTS` → `needs_review`.
 *    Nunca se borra un sobre; `last_error` y el sobre íntegro quedan para el
 *    administrador.
 *  - Nunca corren dos sincronizaciones a la vez: las llamadas concurrentes
 *    comparten la misma promesa.
 *
 * Se dispara al volver la conectividad real del Desktop
 * (`onDesktopConnectivity`) y al abrir el POS con red (`startSalesSync`).
 *
 * Fase 4D: los clientes creados sin red (`customersOutbox`) se sincronizan
 * ANTES que las ventas, y una venta cuyo cliente aún no esté en Supabase se
 * salta (sin consumir intentos) hasta que lo esté; si el cliente quedó en
 * `needs_review`, la venta falla con ese motivo.
 */

import { POSService } from '@/lib/services/posService';
import { isDesktop, isDesktopOnline, onDesktopConnectivity } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';
import {
  MAX_ATTEMPTS,
  listOutboxSales,
  pruneSyncedSales,
  updateOutboxSale,
  type OutboxSaleRecord,
} from './salesOutbox';
import { ensureCustomerSynced, syncPendingCustomers } from './customersSync';

export interface SalesSyncResult {
  synced: number;
  failed: number;
  needsReview: number;
  skipped: number;
}

export interface SalesSyncOptions {
  /** Ignora el backoff (botón «Reintentar»). */
  force?: boolean;
  /** Solo este sobre (botón «Reintentar» de una fila). */
  onlyId?: string;
  now?: () => number;
}

/** Backoff entre intentos: 30 s, 1 min, 2 min, 4 min. */
export function backoffMs(attempts: number): number {
  const base = 30_000;
  return Math.min(base * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}

let inFlight: Promise<SalesSyncResult> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function errorMessage(err: unknown): string {
  if (!err) return 'Error desconocido';
  if (typeof err === 'string') return err;
  const e = err as { message?: string; details?: string; code?: string; hint?: string };
  const parts = [e.code, e.message, e.details, e.hint].filter((p): p is string => typeof p === 'string' && p.length > 0);
  return parts.length > 0 ? parts.join(' — ') : JSON.stringify(err);
}

async function replayOne(record: OutboxSaleRecord, now: number): Promise<'synced' | 'failed' | 'needs_review'> {
  await updateOutboxSale(record.id, { status: 'syncing' });
  try {
    const { checkout } = record.envelope;
    // Fase 4D: el cliente creado sin red debe existir antes que la venta.
    const customerState = await ensureCustomerSynced(checkout.cart.customer_id);
    if (customerState.kind === 'needs_review') {
      throw new Error(`El cliente de la venta requiere revisión y no se pudo crear: ${customerState.lastError ?? 'sin detalle'}`);
    }
    if (customerState.kind === 'pending') {
      // Sin consumir intentos de la venta: se reintenta cuando el cliente entre.
      await updateOutboxSale(record.id, { status: 'pending', last_error: `Esperando al cliente pendiente de sincronizar (${customerState.lastError ?? 'reintentando'})` });
      return 'failed';
    }
    if (customerState.kind === 'synced' && customerState.serverId !== checkout.cart.customer_id) {
      // Remapeado por `customersSync`; el sobre en disco ya cambió, aquí solo esta copia.
      checkout.cart.customer_id = customerState.serverId;
    }
    await POSService.checkout({
      ...checkout,
      saleId: record.id,
      createdAt: checkout.createdAt ?? record.created_at,
      userId: checkout.userId ?? record.envelope.user_id ?? undefined,
      replayFromOutbox: true,
    });
    await updateOutboxSale(record.id, {
      status: 'synced',
      synced_at: new Date(now).toISOString(),
      last_error: null,
      next_attempt_at: null,
    });
    return 'synced';
  } catch (err) {
    const attempts = record.attempts + 1;
    const message = errorMessage(err);
    console.error(`[salesSync] Fallo reproduciendo la venta ${record.id} (intento ${attempts}):`, message);
    if (attempts >= MAX_ATTEMPTS) {
      await updateOutboxSale(record.id, {
        status: 'needs_review',
        attempts,
        last_error: message,
        next_attempt_at: null,
      });
      return 'needs_review';
    }
    await updateOutboxSale(record.id, {
      status: 'pending',
      attempts,
      last_error: message,
      next_attempt_at: now + backoffMs(attempts),
    });
    return 'failed';
  }
}

async function runSync(options: SalesSyncOptions): Promise<SalesSyncResult> {
  const now = options.now ? options.now() : Date.now();
  const result: SalesSyncResult = { synced: 0, failed: 0, needsReview: 0, skipped: 0 };

  // Fase 4D: primero los clientes creados sin red; las ventas los referencian.
  try {
    await syncPendingCustomers({ now: () => now });
  } catch (err) {
    console.warn('[salesSync] No se pudieron sincronizar los clientes pendientes:', err);
  }

  // `syncing` huérfanos: la app se cerró a mitad de una reproducción anterior.
  // El checkout es idempotente por id, así que se vuelven a intentar.
  let records = await listOutboxSales(['pending', 'syncing']);
  if (options.onlyId) records = records.filter((r) => r.id === options.onlyId);

  let earliestRetry: number | null = null;
  for (const record of records) {
    if (!options.force && record.next_attempt_at && record.next_attempt_at > now) {
      result.skipped++;
      earliestRetry = earliestRetry === null ? record.next_attempt_at : Math.min(earliestRetry, record.next_attempt_at);
      continue;
    }
    // Si la red se cayó a mitad de la cola, no se sigue quemando intentos.
    if (isDesktop() && !isAppOnline()) {
      result.skipped++;
      continue;
    }
    const outcome = await replayOne(record, now);
    if (outcome === 'synced') result.synced++;
    else if (outcome === 'failed') {
      result.failed++;
      const updated = record.attempts + 1;
      const at = now + backoffMs(updated);
      earliestRetry = earliestRetry === null ? at : Math.min(earliestRetry, at);
    } else result.needsReview++;
  }

  try {
    await pruneSyncedSales();
  } catch (err) {
    console.warn('[salesSync] No se pudo purgar sobres antiguos:', err);
  }

  scheduleRetry(earliestRetry, now);

  if (typeof window !== 'undefined' && (result.synced > 0 || result.needsReview > 0)) {
    try {
      window.dispatchEvent(new CustomEvent('goadmin:sales-synced', { detail: result }));
    } catch {
      // sin CustomEvent
    }
  }
  return result;
}

function scheduleRetry(at: number | null, now: number): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (at === null) return;
  const delay = Math.max(1_000, at - now);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void syncPendingSales();
  }, delay);
  // No mantener vivo el proceso de Node en tests.
  const t = retryTimer as { unref?: () => void };
  if (typeof t.unref === 'function') t.unref();
}

/**
 * Reproduce los sobres pendientes. Si ya hay una sincronización en curso,
 * devuelve esa misma promesa: nunca dos a la vez.
 */
export function syncPendingSales(options: SalesSyncOptions = {}): Promise<SalesSyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync(options).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function isSalesSyncInFlight(): boolean {
  return inFlight !== null;
}

/**
 * «Reintentar» desde la bandeja: vuelve el sobre a `pending` con los
 * intentos a cero y lo reproduce ya, sin esperar el backoff.
 */
export async function retryOutboxSale(id: string): Promise<SalesSyncResult> {
  await updateOutboxSale(id, { status: 'pending', attempts: 0, next_attempt_at: null });
  return syncPendingSales({ force: true, onlyId: id });
}

let started = false;
let stopStarted: (() => void) | null = null;

/**
 * Arranque desde el POS: sincroniza si hay red ahora y cada vez que el
 * Desktop recupere la conectividad real. Idempotente; devuelve la baja.
 * Fuera del Desktop no hace nada.
 */
export function startSalesSync(): () => void {
  if (!isDesktop()) return () => {};
  if (started) return stopStarted ?? (() => {});
  started = true;

  const unsubscribe = onDesktopConnectivity((online) => {
    if (online) void syncPendingSales();
  });
  isDesktopOnline()
    .then((online) => {
      if (online) void syncPendingSales();
    })
    .catch(() => {
      // sin respuesta del bridge: se espera al evento de conectividad
    });

  stopStarted = () => {
    unsubscribe();
    started = false;
    stopStarted = null;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
  return stopStarted;
}

/** Solo para tests. */
export function __resetSalesSyncForTests(): void {
  inFlight = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (stopStarted) stopStarted();
  started = false;
}
