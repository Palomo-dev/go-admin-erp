import type { SupabaseClient } from '@supabase/supabase-js';
import { readF12Money, summarizeF12Money } from './f12ReadService';
import type { ResumenMonedaBase } from '@/components/crm/kit/monedaCrm';
import { normalizarCodigoMoneda } from '@/lib/utils/moneda';

export interface CustomerFolio {
  id: string;
  status: string;
  balance: number;
  created_at: string | null;
  reservation_id: string | null;
  reservation_code?: string;
  space_label?: string;
  pending_total: number;
  paid_total: number;
  items_count: number;
}

export interface CustomerInvoiceDebt {
  id: string;
  number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: number;
  balance: number;
  status: string;
  currency: string | null;
}

type Embedded<T> = T | T[] | null;
interface ReservationDetails {
  metadata: Record<string, unknown> | null;
  spaces: Embedded<{ label: string }>;
}
interface FolioRow {
  id: string;
  status: string;
  balance: number | string;
  created_at: string | null;
  reservation_id: string | null;
  reservations: Embedded<ReservationDetails>;
  folio_items: Array<{ amount: number | string; payment_status: string | null }>;
}
type InvoiceRow = Omit<CustomerInvoiceDebt, 'total' | 'balance'> & {
  total: number | string | null;
  balance: number | string | null;
};
export interface CustomerFoliosSummary {
  base: string | null;
  date: string;
  total: ResumenMonedaBase | null;
  folios: ResumenMonedaBase | null;
  invoices: ResumenMonedaBase | null;
}

function first<T>(value: Embedded<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
function amount(value: number | string | null): number {
  if (value === null || value === '' || !Number.isFinite(Number(value))) {
    throw new Error('Importe financiero inválido.');
  }
  return Number(value);
}
async function readAll<T>(
  page: (offset: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await page(offset);
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error('Lectura financiera incompleta.');
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}

/** Lectura del cliente con RLS: el tenant de folios se resuelve por su reserva. */
export async function getCustomerFolios(
  db: SupabaseClient,
  organizationId: number,
  customerId: string,
): Promise<{
  folios: CustomerFolio[];
  invoices: CustomerInvoiceDebt[];
  summary: CustomerFoliosSummary;
}> {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0 || !customerId) {
    throw new Error('Selecciona una organización y un cliente.');
  }
  const [folioRows, invoiceRows, money] = await Promise.all([
    readAll((offset) =>
      db
        .from('folios')
        .select(
          `id,status,balance,created_at,reservation_id,
        reservations!inner(metadata,spaces(label)),folio_items(amount,payment_status)`,
        )
        .eq('reservations.organization_id', organizationId)
        .eq('reservations.customer_id', customerId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + 499)
        .returns<FolioRow[]>(),
    ),
    readAll((offset) =>
      db
        .from('invoice_sales')
        .select('id,number,issue_date,due_date,total,balance,status,currency')
        .eq('organization_id', organizationId)
        .eq('customer_id', customerId)
        .gt('balance', 0)
        .order('issue_date', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + 499)
        .returns<InvoiceRow[]>(),
    ),
    readF12Money(organizationId, db, new Date()),
  ]);
  const folios = folioRows.map((row) => {
    const reservation = first(row.reservations);
    const items = row.folio_items;
    const code = reservation?.metadata?.code;
    return {
      id: row.id,
      status: row.status,
      balance: amount(row.balance),
      created_at: row.created_at,
      reservation_id: row.reservation_id,
      reservation_code: typeof code === 'string' ? code : undefined,
      space_label: first(reservation?.spaces ?? null)?.label,
      pending_total: items
        .filter((item) => item.payment_status === 'pending')
        .reduce((sum, item) => sum + amount(item.amount), 0),
      paid_total: items
        .filter((item) => item.payment_status === 'paid')
        .reduce((sum, item) => sum + amount(item.amount), 0),
      items_count: items.length,
    };
  });
  const invoices = invoiceRows.map((row) => ({
    ...row,
    currency: normalizarCodigoMoneda(row.currency),
    total: amount(row.total),
    balance: amount(row.balance),
  }));
  const pending = folios
    .filter((row) => row.status === 'open')
    .map((row) => ({ monto: row.pending_total, moneda: money.base }));
  const invoiceAmounts = invoices.map((row) => ({ monto: row.balance, moneda: row.currency }));
  return {
    folios,
    invoices,
    summary: {
      base: money.base,
      date: money.date,
      total: summarizeF12Money([...pending, ...invoiceAmounts], money),
      folios: summarizeF12Money(pending, money),
      invoices: summarizeF12Money(invoiceAmounts, money),
    },
  };
}
