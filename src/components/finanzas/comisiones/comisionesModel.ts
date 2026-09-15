/**
 * F13 — modelo puro de `/app/finanzas/comisiones`: filtros → query, enlace
 * al origen, acciones que admite una selección y presentación de estado.
 * Sin React ni I/O: probado en `__tests__/comisionesModel.test.ts`.
 */

import { cancellationKind } from '@/lib/services/crm/commissionTransitions';
import { formatCurrency } from '@/utils/Utils';

export interface ComisionesFiltersState {
  status: 'all' | 'accrued' | 'paid' | 'cancelled';
  source_type: 'all' | 'sale' | 'invoice_sale' | 'invoice_purchase' | 'opportunity';
  payee_id: string;
  /** Días calendario YYYY-MM-DD (zona de la organización); vacíos = sin acotar. */
  from: string;
  to: string;
  search: string;
}

export function emptyFilters(): ComisionesFiltersState {
  return { status: 'all', source_type: 'all', payee_id: '', from: '', to: '', search: '' };
}

export function buildCommissionsQuery(f: ComisionesFiltersState): string {
  const p = new URLSearchParams();
  if (f.status !== 'all') p.set('status', f.status);
  if (f.source_type !== 'all') p.set('source_type', f.source_type);
  if (f.payee_id) p.set('payee_id', f.payee_id);
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  const search = f.search.trim();
  if (search) p.set('search', search);
  return p.toString();
}

export function activeFilterCount(f: ComisionesFiltersState): number {
  return [f.status !== 'all', f.source_type !== 'all', !!f.payee_id, !!f.from || !!f.to, !!f.search.trim()].filter(Boolean).length;
}

const SOURCE_ROUTES: Record<string, string> = {
  invoice_sale: '/app/finanzas/facturas-venta/',
  invoice_purchase: '/app/finanzas/facturas-compra/',
  opportunity: '/app/crm/oportunidades/',
  sale: '/app/pos/ventas/',
};

export const SOURCE_LABELS: Record<string, string> = {
  sale: 'Venta POS',
  invoice_sale: 'Factura de venta',
  invoice_purchase: 'Factura de compra',
  opportunity: 'Oportunidad',
};

export function sourceHref(row: { source_type: string; source_id: string | null }): string | null {
  const base = SOURCE_ROUTES[row.source_type];
  if (!base || !row.source_id) return null;
  return `${base}${encodeURIComponent(row.source_id)}`;
}

export interface SelectionActions {
  pay: boolean;
  reject: boolean;
  clawback: boolean;
}

/** Una selección solo admite acciones si TODAS sus filas parten del mismo estado. */
export function actionsForSelection(rows: readonly { status: string }[]): SelectionActions {
  if (rows.length === 0) return { pay: false, reject: false, clawback: false };
  const allAccrued = rows.every((r) => r.status === 'accrued');
  const allPaid = rows.every((r) => r.status === 'paid');
  return { pay: allAccrued, reject: allAccrued, clawback: allPaid };
}

export interface SelectionSummary {
  count: number;
  total: number;
  totalLabel: string;
  payee: string;
}

/** Texto para los diálogos: «$250 de Beto» o «$150 de 2 vendedores». */
export function describeSelection(rows: readonly { commission_amount: number | string | null; payee_name: string | null }[], currency: string): SelectionSummary {
  const total = rows.reduce((s, r) => s + (Number(r.commission_amount) || 0), 0);
  const names = Array.from(new Set(rows.map((r) => r.payee_name || 'Sin nombre')));
  const payee = names.length === 1 ? names[0] : `${names.length} vendedores`;
  return { count: rows.length, total, totalLabel: formatCurrency(total, currency), payee };
}

export type StatusTone = 'pending' | 'paid' | 'cancelled';

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

export function statusPresentation(row: { status: string; metadata: Record<string, unknown> | null }): StatusPresentation {
  if (row.status === 'accrued') return { label: 'Pendiente', tone: 'pending' };
  if (row.status === 'paid') return { label: 'Pagada', tone: 'paid' };
  const kind = cancellationKind(row.metadata);
  if (kind === 'clawback') return { label: 'Clawback', tone: 'cancelled' };
  if (kind === 'rejected') return { label: 'Rechazada', tone: 'cancelled' };
  return { label: 'Cancelada', tone: 'cancelled' };
}

// ─── Plural y mensajes (ronda 2: «comisiónes» nunca más) ─────────────────────

/** «1 comisión» / «2 comisiones», con participio concordado si se pasa («pagada» → «pagadas»). */
export function pluralComisiones(n: number, participle?: string): string {
  const noun = n === 1 ? 'comisión' : 'comisiones';
  if (!participle) return `${n} ${noun}`;
  return `${n} ${noun} ${n === 1 ? participle : `${participle}s`}`;
}

const ACTION_WORDS: Record<'pagar' | 'rechazar', { done: string; infinitive: string }> = {
  pagar: { done: 'pagada', infinitive: 'pagar' },
  rechazar: { done: 'rechazada', infinitive: 'rechazar' },
};

/** «2 comisiones pagadas · 1 no se pudo pagar (motivo)». */
export function commissionActionMessage(action: 'pagar' | 'rechazar', ok: number, failed: number, firstReason?: string): string {
  const w = ACTION_WORDS[action];
  const head = pluralComisiones(ok, w.done);
  if (failed === 0) return head;
  const verb = failed === 1 ? 'no se pudo' : 'no se pudieron';
  return `${head} · ${failed} ${verb} ${w.infinitive}${firstReason ? ` (${firstReason})` : ''}`;
}

// ─── Foco tras confirmar (brief §4) ──────────────────────────────────────────

/**
 * A dónde vuelve el foco cuando el disparador ya no existe (la fila cambió de
 * estado; la barra de selección se desmontó): el primer candidato que siga en
 * el DOM, en el orden que pase quien llama (fila siguiente → «Actualizar» →
 * «Seleccionar todas»). `null` si no queda nada: nunca se enfoca el `body`.
 */
export function focusAfterCommissionAction<T extends { isConnected: boolean }>(
  opener: T | null,
  candidates: readonly (T | null | undefined)[]
): T | null {
  if (opener && opener.isConnected) return opener;
  for (const c of candidates) if (c && c.isConnected) return c;
  return null;
}
