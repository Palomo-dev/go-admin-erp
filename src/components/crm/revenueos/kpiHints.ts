/**
 * F14 — textos de apoyo de las tarjetas KPI (puro, sin JSX, testeable).
 *
 * Cada hint dice de dónde sale la cifra. En la ronda 1 el del cobrado
 * prometía «facturas ligadas a oportunidades» mientras la cifra era 0; ahora
 * `revenue_collected` suma los pagos completados de TODAS las facturas de la
 * organización y, si ninguna está enlazada a una oportunidad, se dice tal cual.
 */

import type { RevenueSummary } from '@/lib/services/crm/revenueOsService';
import { fmtMoney, plural } from './formatters';

export function collectedHint(summary: Pick<RevenueSummary, 'revenue_collected' | 'revenue_collected_linked'>, currency: string | null): string {
  const { revenue_collected: total, revenue_collected_linked: linked } = summary;
  if (total <= 0) return 'Sin pagos completados de facturas en el periodo';
  if (linked <= 0) return 'Ninguna factura enlazada a una oportunidad; cobrado total de la organización';
  if (linked >= total) return 'Pagos completados de facturas enlazadas a oportunidades';
  return `Cobrado total de la organización; ${fmtMoney(linked, currency)} de facturas enlazadas a oportunidades`;
}

export function wonHint(summary: Pick<RevenueSummary, 'deals_won'>): string {
  return summary.deals_won > 0 ? plural(summary.deals_won, 'oportunidad ganada', 'oportunidades ganadas') : 'Sin oportunidades ganadas en el periodo';
}

export function winRateHint(summary: Pick<RevenueSummary, 'deals_won' | 'deals_lost'>): string {
  const closed = summary.deals_won + summary.deals_lost;
  return closed > 0 ? `${plural(summary.deals_won, 'ganada', 'ganadas')} de ${plural(closed, 'cerrada', 'cerradas')}` : 'Sin cierres en el periodo';
}

export function arpaHint(summary: Pick<RevenueSummary, 'arpa' | 'invoices_paid'>): string {
  return summary.arpa === null ? 'Sin facturas pagadas en el periodo' : `Ticket medio por factura pagada (${plural(summary.invoices_paid, 'factura', 'facturas')})`;
}
