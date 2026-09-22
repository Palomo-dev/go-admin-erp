/**
 * Conteos de los tres outboxes del Desktop (ventas 4B, clientes 4D, caja 4F)
 * y el texto que muestra el banner `OfflineIndicator`:
 *
 *   «2 ventas · 1 cliente · 3 movimientos de caja pendientes de sincronizar»
 *
 * Puro salvo `getOutboxCounts()`, que lee IndexedDB. Sin React.
 */

import { countCashNeedingReview, countPendingCash } from './cashOutbox';
import { countCustomersNeedingReview, countPendingCustomers } from './customersOutbox';
import { countPendingSales, countSalesNeedingReview } from './salesOutbox';

export interface OutboxCounts {
  sales: number;
  customers: number;
  cash: number;
}

export interface OutboxCountsSnapshot {
  pending: OutboxCounts;
  needsReview: OutboxCounts;
}

/** Eventos de `window` tras los que hay que volver a contar. */
export const OUTBOX_CHANGED_EVENTS: readonly string[] = [
  'goadmin:sales-outbox-changed',
  'goadmin:customers-outbox-changed',
  'goadmin:cash-outbox-changed',
];

export function totalOf(counts: OutboxCounts): number {
  return counts.sales + counts.customers + counts.cash;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** «2 ventas · 1 cliente · 3 movimientos de caja» (solo los tipos con algo). Vacío si no hay nada. */
export function formatOutboxCounts(counts: OutboxCounts): string {
  return [
    counts.sales > 0 ? plural(counts.sales, 'venta', 'ventas') : null,
    counts.customers > 0 ? plural(counts.customers, 'cliente', 'clientes') : null,
    counts.cash > 0 ? plural(counts.cash, 'movimiento de caja', 'movimientos de caja') : null,
  ]
    .filter((p): p is string => p !== null)
    .join(' · ');
}

/** Frase completa del banner para lo pendiente, o null si no hay nada. */
export function pendingLabel(counts: OutboxCounts): string | null {
  const total = totalOf(counts);
  if (total === 0) return null;
  return `${formatOutboxCounts(counts)} pendiente${total !== 1 ? 's' : ''} de sincronizar`;
}

/** Frase completa del banner para lo que requiere revisión, o null si no hay nada. */
export function reviewLabel(counts: OutboxCounts): string | null {
  const total = totalOf(counts);
  if (total === 0) return null;
  return `${formatOutboxCounts(counts)} requiere${total !== 1 ? 'n' : ''} revisión (detalle en el POS)`;
}

/** Lee los tres outboxes. Cualquier fallo de un outbox cuenta como 0 en ese tipo. */
export async function getOutboxCounts(): Promise<OutboxCountsSnapshot> {
  const safe = (fn: () => Promise<number>) => fn().catch(() => 0);
  const [ps, pc, pk, rs, rc, rk] = await Promise.all([
    safe(countPendingSales),
    safe(countPendingCustomers),
    safe(countPendingCash),
    safe(countSalesNeedingReview),
    safe(countCustomersNeedingReview),
    safe(countCashNeedingReview),
  ]);
  return { pending: { sales: ps, customers: pc, cash: pk }, needsReview: { sales: rs, customers: rc, cash: rk } };
}
