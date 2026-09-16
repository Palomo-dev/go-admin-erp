/**
 * Outbox de ventas del Desktop (ROADMAP-DESKTOP §Fase 4, puntos 3, 4 y 5).
 *
 * Cuando Go Admin Desktop no tiene conexión real con Supabase, el POS no
 * intenta escribir la venta: guarda aquí el sobre completo (`CheckoutData`
 * + totales + organización/sucursal/usuario) con un id generado en el
 * cliente y devuelve una venta provisional para cerrar el carrito e imprimir
 * el ticket. `salesSync.ts` reproduce los sobres con `POSService.checkout`
 * cuando vuelve la red.
 *
 * Reglas:
 *  - Un sobre NUNCA se borra por fallos: tras `MAX_ATTEMPTS` pasa a
 *    `needs_review` con `last_error` y el sobre íntegro.
 *  - Los sobres `synced` se conservan `SYNCED_RETENTION_DAYS` días para
 *    auditoría y luego se purgan.
 *  - Este módulo no importa Supabase: solo IndexedDB y localStorage, para
 *    que se pueda probar con `fake-indexeddb` sin mocks.
 */

import type { CheckoutData, Sale } from '@/components/pos/types';
import { isDesktop } from '@/lib/utils/desktop';
import { isAppOnline } from '@/lib/utils/offlineCache';

export const OUTBOX_DB_NAME = 'goadmin-outbox';
/** v2 (fase 4D): store `customers` para los clientes creados sin red. */
export const OUTBOX_DB_VERSION = 2;
export const OUTBOX_SALES_STORE = 'sales';
export const OUTBOX_CUSTOMERS_STORE = 'customers';
/** Intentos de reproducción antes de pasar el sobre a revisión. */
export const MAX_ATTEMPTS = 5;
/** Días que se conserva un sobre ya sincronizado. */
export const SYNCED_RETENTION_DAYS = 7;
/** Evento de `window` que se emite cada vez que cambia el outbox. */
export const OUTBOX_CHANGED_EVENT = 'goadmin:sales-outbox-changed';
/** Prefijo del número local de recibo: `OFF-<sucursal>-<n>`. */
export const LOCAL_RECEIPT_PREFIX = 'OFF';
const LOCAL_SEQ_KEY_PREFIX = 'goadmin-outbox:receipt-seq';

export type OutboxSaleStatus = 'pending' | 'syncing' | 'synced' | 'needs_review';

/** Totales calculados en el cliente en el momento de la venta. */
export interface OutboxSaleTotals {
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  total_paid: number;
  change: number;
}

/** Sobre serializable de una venta hecha sin conexión. */
export interface OfflineSaleEnvelope {
  /** `CheckoutData` tal cual lo construyó el POS (con `saleId`/`createdAt`/`userId`). */
  checkout: CheckoutData;
  totals: OutboxSaleTotals;
  organization_id: number;
  branch_id: number;
  user_id: string | null;
}

export interface OutboxSaleRecord {
  /** = `checkout.saleId` (UUID generado en el cliente). */
  id: string;
  envelope: OfflineSaleEnvelope;
  /** ISO. Orden de reproducción. */
  created_at: string;
  updated_at: string;
  status: OutboxSaleStatus;
  attempts: number;
  last_error: string | null;
  /** No reintentar antes de este instante (ms epoch). Backoff entre intentos. */
  next_attempt_at: number | null;
  receipt_number_local: string;
  synced_at: string | null;
}

export interface OfflineSaleContext {
  organizationId: number;
  branchId: number;
  userId: string | null;
}

// ── IndexedDB ────────────────────────────────────────────────────────────────

let dbInstance: IDBDatabase | null = null;

/**
 * Conexión compartida a `goadmin-outbox`. La usa también `customersOutbox.ts`
 * (mismo archivo IndexedDB, store distinto): una sola versión y un solo
 * `onupgradeneeded` para los dos stores.
 */
export function openOutbox(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible'));
      return;
    }
    const request = indexedDB.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      dbInstance.onclose = () => {
        dbInstance = null;
      };
      resolve(dbInstance);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_SALES_STORE)) {
        const store = db.createObjectStore(OUTBOX_SALES_STORE, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(OUTBOX_CUSTOMERS_STORE)) {
        const store = db.createObjectStore(OUTBOX_CUSTOMERS_STORE, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('created_at', 'created_at', { unique: false });
      }
    };
  });
}

/** Solo para tests: cierra la conexión para que el siguiente acceso reabra la BD. */
export function __resetOutboxForTests(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignorar
    }
  }
  dbInstance = null;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function notifyChanged(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
  } catch {
    // Sin CustomEvent (entorno de tests sin DOM): no pasa nada.
  }
}

export async function putOutboxSale(record: OutboxSaleRecord): Promise<void> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_SALES_STORE, 'readwrite');
  await requestToPromise(tx.objectStore(OUTBOX_SALES_STORE).put(record));
  notifyChanged();
}

export async function getOutboxSale(id: string): Promise<OutboxSaleRecord | null> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_SALES_STORE, 'readonly');
  const result = await requestToPromise(tx.objectStore(OUTBOX_SALES_STORE).get(id));
  return (result as OutboxSaleRecord | undefined) ?? null;
}

/** Todos los sobres, ordenados por `created_at` ascendente (orden de venta). */
export async function listOutboxSales(statuses?: OutboxSaleStatus[]): Promise<OutboxSaleRecord[]> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_SALES_STORE, 'readonly');
  const all = (await requestToPromise(tx.objectStore(OUTBOX_SALES_STORE).getAll())) as OutboxSaleRecord[];
  const filtered = statuses ? all.filter((r) => statuses.includes(r.status)) : all;
  return filtered.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/**
 * Actualiza un sobre en una sola transacción de lectura+escritura. Devuelve
 * el registro actualizado, o null si ya no existe.
 */
export async function updateOutboxSale(
  id: string,
  patch: Partial<Omit<OutboxSaleRecord, 'id' | 'envelope' | 'created_at'>>,
): Promise<OutboxSaleRecord | null> {
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_SALES_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_SALES_STORE);
  const current = (await requestToPromise(store.get(id))) as OutboxSaleRecord | undefined;
  if (!current) return null;
  const next: OutboxSaleRecord = { ...current, ...patch, updated_at: new Date().toISOString() };
  await requestToPromise(store.put(next));
  notifyChanged();
  return next;
}

/**
 * Fase 4D: un cliente creado sin red resultó existir ya en Supabase (mismo
 * documento o email en la organización), así que su id local se sustituye
 * por el del servidor en todos los sobres que aún no se reprodujeron.
 * Devuelve cuántos sobres cambiaron. Los `synced` no se tocan.
 */
export async function remapOutboxSalesCustomer(localCustomerId: string, serverCustomerId: string): Promise<number> {
  if (localCustomerId === serverCustomerId) return 0;
  const db = await openOutbox();
  const tx = db.transaction(OUTBOX_SALES_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_SALES_STORE);
  const all = (await requestToPromise(store.getAll())) as OutboxSaleRecord[];
  let changed = 0;
  for (const record of all) {
    if (record.status === 'synced') continue;
    const cart = record.envelope.checkout.cart;
    if (cart.customer_id !== localCustomerId) continue;
    cart.customer_id = serverCustomerId;
    if (cart.customer) cart.customer = { ...cart.customer, id: serverCustomerId, pending_sync: false };
    await requestToPromise(store.put({ ...record, updated_at: new Date().toISOString() }));
    changed++;
  }
  if (changed > 0) notifyChanged();
  return changed;
}

/** Ventas que aún no llegaron a Supabase (`pending` + `syncing`). */
export async function countPendingSales(): Promise<number> {
  const rows = await listOutboxSales(['pending', 'syncing']);
  return rows.length;
}

export async function countSalesNeedingReview(): Promise<number> {
  const rows = await listOutboxSales(['needs_review']);
  return rows.length;
}

/** Borra SOLO sobres `synced` con más de `retentionDays` días. Nunca otro estado. */
export async function pruneSyncedSales(retentionDays: number = SYNCED_RETENTION_DAYS, now: number = Date.now()): Promise<number> {
  const db = await openOutbox();
  const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
  const synced = await listOutboxSales(['synced']);
  const stale = synced.filter((r) => {
    const at = r.synced_at ? Date.parse(r.synced_at) : NaN;
    return Number.isFinite(at) && at < cutoff;
  });
  if (stale.length === 0) return 0;
  const tx = db.transaction(OUTBOX_SALES_STORE, 'readwrite');
  const store = tx.objectStore(OUTBOX_SALES_STORE);
  for (const r of stale) await requestToPromise(store.delete(r.id));
  notifyChanged();
  return stale.length;
}

// ── Número local de recibo ───────────────────────────────────────────────────

/**
 * Siguiente número local `OFF-<sucursal>-<n>`. El contador vive en
 * localStorage por organización y sucursal: sobrevive a cerrar la app y no
 * depende de la red. No es el consecutivo fiscal: ese lo asigna
 * `generateInvoiceNumber` al reproducir la venta.
 */
export function nextLocalReceiptNumber(organizationId: number, branchId: number): string {
  const key = `${LOCAL_SEQ_KEY_PREFIX}:${organizationId}:${branchId}`;
  let next = 1;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    const parsed = raw ? Number(raw) : 0;
    next = Number.isFinite(parsed) && parsed > 0 ? parsed + 1 : 1;
    localStorage.setItem(key, String(next));
  } catch {
    // Sin localStorage: número no persistente, pero único en esta sesión.
    next = Date.now() % 100000;
  }
  return `${LOCAL_RECEIPT_PREFIX}-${branchId}-${next}`;
}

/** Texto del número de venta para el ticket físico de una venta pendiente. */
export function ticketSaleNumber(sale: Pick<Sale, 'pending_sync' | 'receipt_number_local' | 'sale_number'>): string | undefined {
  if (sale.pending_sync && sale.receipt_number_local) {
    return `${sale.receipt_number_local} (Pendiente de sincronizar)`;
  }
  return sale.sale_number;
}

// ── Decisión y encolado ──────────────────────────────────────────────────────

/**
 * true solo dentro de Go Admin Desktop y sin conectividad real. En navegador
 * devuelve siempre false: fuera del Desktop nada cambia.
 */
export function shouldCheckoutOffline(): boolean {
  return isDesktop() && !isAppOnline();
}

export function newSaleId(): string {
  return newLocalUuid();
}

/** UUID v4 generado en el cliente (ventas y, desde la fase 4D, clientes). */
export function newLocalUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Respaldo (Desktop muy antiguo sin crypto.randomUUID): UUID v4 con Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function computeTotals(checkout: CheckoutData): OutboxSaleTotals {
  const { cart } = checkout;
  const shipping = checkout.shipping_fee || 0;
  const tip = checkout.tip_amount || 0;
  const subtotal = Number(cart.subtotal) || 0;
  const taxTotal = Number(cart.tax_total) || 0;
  const discount = Number(cart.discount_total) || 0;
  const total = (Number(cart.total) || 0) + shipping + tip;
  return {
    subtotal,
    tax_total: taxTotal,
    discount_total: discount,
    total,
    total_paid: checkout.total_paid,
    change: checkout.change || 0,
  };
}

/**
 * Venta provisional que ve el POS mientras el sobre está en el outbox. Mismo
 * `id` que tendrá en Supabase; `status: 'pending_sync'` y número local.
 */
export function buildProvisionalSale(envelope: OfflineSaleEnvelope, receiptNumberLocal: string): Sale {
  const { checkout, totals } = envelope;
  const createdAt = checkout.createdAt ?? new Date().toISOString();
  return {
    id: checkout.saleId as string,
    organization_id: envelope.organization_id,
    branch_id: envelope.branch_id,
    customer_id: checkout.cart.customer_id,
    user_id: envelope.user_id ?? '',
    total: totals.total,
    subtotal: totals.subtotal,
    tax_total: totals.tax_total,
    discount_total: totals.discount_total,
    balance: Math.max(0, totals.total - totals.total_paid),
    status: 'pending_sync',
    payment_status: totals.total_paid >= totals.total ? 'paid' : 'partial',
    sale_date: createdAt,
    created_at: createdAt,
    updated_at: createdAt,
    delivery_fee: checkout.shipping_fee || 0,
    tip_amount: checkout.tip_amount || 0,
    tax_included: checkout.tax_included || false,
    tax_breakdown: checkout.tax_breakdown,
    salesperson_id: checkout.salesperson_id,
    commission_rate: checkout.commission_rate,
    commission_type: checkout.commission_type,
    commission_method: checkout.commission_method,
    commission_amount: checkout.commission_amount,
    sale_number: receiptNumberLocal,
    pending_sync: true,
    receipt_number_local: receiptNumberLocal,
  };
}

/**
 * Guarda la venta en el outbox y devuelve la venta provisional. No toca
 * Supabase. `checkoutData.saleId` se genera aquí si el POS no lo trajo.
 */
export async function enqueueOfflineSale(checkoutData: CheckoutData, ctx: OfflineSaleContext): Promise<Sale> {
  const saleId = checkoutData.saleId ?? newSaleId();
  const createdAt = checkoutData.createdAt ?? new Date().toISOString();
  // Serializable: el sobre se guarda tal cual en IndexedDB (structured clone).
  const checkout: CheckoutData = JSON.parse(
    JSON.stringify({ ...checkoutData, saleId, createdAt, userId: checkoutData.userId ?? ctx.userId ?? undefined }),
  );
  delete checkout.replayFromOutbox;

  const envelope: OfflineSaleEnvelope = {
    checkout,
    totals: computeTotals(checkout),
    organization_id: ctx.organizationId,
    branch_id: ctx.branchId,
    user_id: ctx.userId,
  };
  const receiptNumberLocal = nextLocalReceiptNumber(ctx.organizationId, ctx.branchId);
  const record: OutboxSaleRecord = {
    id: saleId,
    envelope,
    created_at: createdAt,
    updated_at: createdAt,
    status: 'pending',
    attempts: 0,
    last_error: null,
    next_attempt_at: null,
    receipt_number_local: receiptNumberLocal,
    synced_at: null,
  };
  await putOutboxSale(record);
  return buildProvisionalSale(envelope, receiptNumberLocal);
}

/** JSON legible del sobre, para «Exportar sobre» en la bandeja de revisión. */
export function exportOutboxSale(record: OutboxSaleRecord): string {
  return JSON.stringify(record, null, 2);
}
