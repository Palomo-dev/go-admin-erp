/**
 * Filas virtuales del outbox de ventas (fase 4B) para la réplica local
 * (fase 4C): una venta hecha sin red vive en `goadmin-outbox` como un sobre
 * completo, no en `sales`. Para que el historial de ventas y cualquier
 * pantalla que lea `sales`/`sale_items` la muestre mientras está pendiente,
 * la fuente de datos local se envuelve con `withOutboxRows()`, que añade
 * esas ventas con la forma de la tabla y `status = 'pending_sync'`.
 *
 * Solo lectura: al sincronizarse el sobre, la fila real llega por la
 * replicación y la virtual desaparece (los sobres `synced` no se listan).
 */

import type { CheckoutData } from '@/components/pos/types';
import type { LocalDataSource, OfflineRow } from './offlineDb';
import { listOutboxSales, type OutboxSaleRecord } from './salesOutbox';

/** Estado que ven las pantallas para una venta aún no sincronizada. */
export const PENDING_SYNC_STATUS = 'pending_sync';

const VIRTUAL_TABLES = new Set(['sales', 'sale_items']);

export function outboxSaleToRows(record: OutboxSaleRecord): { sale: OfflineRow; items: OfflineRow[] } {
  const { envelope } = record;
  const checkout = envelope.checkout as CheckoutData;
  const cart = checkout.cart;
  const totals = envelope.totals;
  const createdAt = checkout.createdAt ?? record.created_at;
  const sale: OfflineRow = {
    id: record.id,
    organization_id: envelope.organization_id,
    branch_id: envelope.branch_id,
    customer_id: cart?.customer_id ?? null,
    user_id: envelope.user_id ?? checkout.userId ?? null,
    total: totals.total,
    balance: Math.max(0, totals.total - totals.total_paid),
    status: PENDING_SYNC_STATUS,
    sale_date: createdAt,
    notes: cart?.notes ?? null,
    created_at: createdAt,
    updated_at: record.updated_at,
    payment_status: totals.total_paid >= totals.total ? 'paid' : totals.total_paid > 0 ? 'partial' : 'pending',
    tax_total: totals.tax_total,
    subtotal: totals.subtotal,
    discount_total: totals.discount_total,
    reservation_id: null,
    tax_included: checkout.tax_included ?? cart?.tax_included ?? false,
    tax_breakdown: checkout.tax_breakdown ?? null,
    salesperson_id: checkout.salesperson_id ?? null,
    commission_rate: checkout.commission_rate ?? null,
    commission_type: checkout.commission_type ?? null,
    tip_amount: checkout.tip_amount ?? null,
    tip_server_id: checkout.tip_server_id ?? null,
    driver_id: checkout.driver_id ?? null,
    table_session_id: null,
    delivery_fee: checkout.shipping_fee ?? null,
    opportunity_id: null,
    source: 'pos',
    include_in_cash_register: true,
    /** Extras locales (no existen en la tabla): número local y estado del sobre. */
    receipt_number_local: record.receipt_number_local,
    pending_sync: true,
    outbox_status: record.status,
    outbox_error: record.last_error,
  };
  const items: OfflineRow[] = (cart?.items ?? []).map((item, index) => ({
    id: item.id || `${record.id}:${index}`,
    organization_id: envelope.organization_id,
    sale_id: record.id,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    total: item.total,
    notes: item.notes ? { note: item.notes, modifiers: item.modifiers ?? [] } : null,
    created_at: createdAt,
    updated_at: record.updated_at,
    tax_amount: item.tax_amount ?? null,
    tax_rate: item.tax_rate ?? null,
    discount_amount: item.discount_amount ?? null,
    paid_at: null,
    paid_by_split_id: null,
    serial_ids: null,
  }));
  return { sale, items };
}

/** Lector del outbox inyectable (tests). */
export type OutboxReader = () => Promise<OutboxSaleRecord[]>;

const defaultReader: OutboxReader = () => listOutboxSales(['pending', 'syncing', 'needs_review']);

async function virtualRows(table: string, organizationId: number, read: OutboxReader): Promise<OfflineRow[]> {
  if (!VIRTUAL_TABLES.has(table)) return [];
  let records: OutboxSaleRecord[];
  try {
    records = await read();
  } catch {
    return [];
  }
  const out: OfflineRow[] = [];
  for (const record of records) {
    if (record.envelope?.organization_id !== organizationId) continue;
    const { sale, items } = outboxSaleToRows(record);
    if (table === 'sales') out.push(sale);
    else out.push(...items);
  }
  return out;
}

/**
 * Envuelve una fuente local para que `sales` y `sale_items` incluyan las
 * ventas del outbox aún no sincronizadas. Las filas reales ganan si
 * coinciden en id (la venta ya llegó al servidor y se replicó).
 */
export function withOutboxRows(source: LocalDataSource, read: OutboxReader = defaultReader): LocalDataSource {
  const merge = (real: OfflineRow[], virtual: OfflineRow[]) => {
    if (virtual.length === 0) return real;
    const ids = new Set(real.map((r) => String(r.id)));
    return [...real, ...virtual.filter((v) => !ids.has(String(v.id)))];
  };
  return {
    async getAll(table, organizationId) {
      const real = await source.getAll(table, organizationId);
      return merge(real, await virtualRows(table, organizationId, read));
    },
    async getByIndex(table, column, values) {
      const real = await source.getByIndex(table, column, values);
      if (!VIRTUAL_TABLES.has(table)) return real;
      const wanted = new Set(values.map(String));
      // El outbox es pequeño: se filtra en memoria por la columna pedida. El
      // evaluador vuelve a filtrar por organización sobre el resultado.
      const candidates: OfflineRow[] = [];
      for (const record of await read().catch(() => [] as OutboxSaleRecord[])) {
        const { sale, items } = outboxSaleToRows(record);
        for (const row of table === 'sales' ? [sale] : items) {
          const v = row[column];
          if (v !== null && v !== undefined && wanted.has(String(v))) candidates.push(row);
        }
      }
      return merge(real, candidates);
    },
    isReplicated: (table, organizationId) => source.isReplicated(table, organizationId),
  };
}
