/**
 * Checkout atómico del POS por RPC (Desktop fase 4E; ROADMAP-DESKTOP §Fase 4,
 * punto 4). Construye el sobre que espera `public.pos_checkout_v1` a partir
 * de los valores que `POSService.checkout` YA calculó (promociones, impuestos,
 * totales) y lo envía en una sola llamada: o entra todo o no entra nada.
 *
 * La RPC se detecta una vez por sesión: si Supabase responde que la función
 * no existe (`PGRST202`), `POSService.checkout` cae al camino de N inserts
 * de la fase 4B (respaldo temporal hasta que la migración
 * `20260921100000_pos_checkout_v1_rpc_atomica` esté en producción) y lo
 * avisa una sola vez por consola.
 *
 * Este módulo no importa Supabase: recibe el cliente por parámetro para que
 * los tests lo ejerzan con el cliente de mentira.
 */

import type { CheckoutData, Sale } from '@/components/pos/types';

export const POS_CHECKOUT_RPC = 'pos_checkout_v1';

/** Cálculo por línea que hace `POSService.checkout` antes de escribir. */
export interface CheckoutItemCalc {
  lineNet: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxIncluded: boolean;
  discount: number;
}

export interface CheckoutEnvelopeInput {
  checkout: CheckoutData;
  saleId: string;
  createdAt: string;
  organizationId: number;
  branchId: number;
  /** Cajero (`sales.user_id`). Null → la RPC usa `auth.uid()`. */
  userId: string | null;
  currency: string;
  itemCalcs: CheckoutItemCalc[];
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  /** Total final: ítems + flete + propina. */
  total: number;
  promotionIds: string[];
  /** `commission_amount` de la factura, calculado como hasta ahora. */
  invoiceCommissionAmount: number;
}

export interface CheckoutEnvelopeItem {
  product_id: number | null;
  product_name: string | null;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  tax_included: boolean;
  notes: Record<string, unknown>;
  modifiers: Array<{ name: string }>;
  serial_ids: number[];
}

/** Sobre que recibe `pos_checkout_v1` (ver contrato en la migración). */
export interface CheckoutEnvelope {
  version: 1;
  sale_id: string;
  created_at: string;
  organization_id: number;
  branch_id: number;
  user_id: string | null;
  customer_id: string | null;
  currency: string;
  tax_included: boolean;
  tax_breakdown: unknown;
  totals: {
    subtotal: number;
    tax_total: number;
    discount_total: number;
    total: number;
    total_paid: number;
    change: number;
    shipping_fee: number;
    tip_amount: number;
  };
  items: CheckoutEnvelopeItem[];
  payments: Array<{ method: string; amount: number }>;
  tip: { server_id: string | null } | null;
  salesperson: {
    id: string;
    commission_rate: number;
    commission_type: string;
    commission_method: string;
    commission_amount: number;
    base_amount: number;
  } | null;
  invoice: { prefix: string; commission_amount: number };
  promotion_ids: string[];
}

export interface CheckoutRpcResult {
  sale: Sale;
  invoice: Record<string, unknown> | null;
  payments: Array<Record<string, unknown>>;
  replayed: boolean;
  completed: string[];
  warnings: string[];
}

/** Subconjunto del cliente Supabase que usa este módulo. */
export interface CheckoutRpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

export function buildCheckoutEnvelope(input: CheckoutEnvelopeInput): CheckoutEnvelope {
  const { checkout, itemCalcs } = input;
  const { cart, payments } = checkout;
  const shipping = checkout.shipping_fee || 0;
  const tip = checkout.tip_amount || 0;
  const hasSalesperson = !!(
    checkout.salesperson_id
    && checkout.commission_rate
    && checkout.commission_rate > 0
    && checkout.commission_type !== 'none'
  );

  const items: CheckoutEnvelopeItem[] = cart.items.map((item, idx) => {
    const calc = itemCalcs[idx];
    const notes: Record<string, unknown> = { product_name: item.product?.name };
    if (item.notes) notes.extra = item.notes;
    if (item.modifiers && item.modifiers.length > 0) notes.modifiers = item.modifiers;
    const fallbackNet = (item.unit_price || 0) * (item.quantity || 1) - (item.discount_amount || 0);
    const serialIds = checkout.serial_selections?.[item.product_id] ?? [];
    return {
      product_id: item.product_id ?? null,
      product_name: item.product?.name ?? null,
      quantity: item.quantity,
      unit_price: item.unit_price || 0,
      discount_amount: calc ? calc.discount : (item.discount_amount || 0),
      tax_rate: calc ? calc.taxRate : (item.tax_rate || 0),
      tax_amount: calc ? calc.taxAmount : 0,
      total: calc ? calc.total : fallbackNet,
      tax_included: calc ? calc.taxIncluded : (item.tax_included ?? (checkout.tax_included || false)),
      notes,
      modifiers: (item.modifiers ?? []).map((m) => ({ name: m.name })),
      serial_ids: serialIds,
    };
  });

  return {
    version: 1,
    sale_id: input.saleId,
    created_at: input.createdAt,
    organization_id: input.organizationId,
    branch_id: input.branchId,
    user_id: input.userId,
    customer_id: cart.customer_id ?? null,
    currency: input.currency,
    tax_included: checkout.tax_included || false,
    tax_breakdown: checkout.tax_breakdown ?? null,
    totals: {
      subtotal: input.subtotal,
      tax_total: input.taxTotal,
      discount_total: input.discountTotal,
      total: input.total,
      total_paid: checkout.total_paid,
      change: checkout.change || 0,
      shipping_fee: shipping,
      tip_amount: tip,
    },
    items,
    payments: payments.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount })),
    tip: tip > 0 ? { server_id: checkout.tip_server_id ?? null } : null,
    salesperson: hasSalesperson
      ? {
          id: checkout.salesperson_id as string,
          commission_rate: checkout.commission_rate as number,
          commission_type: checkout.commission_type || 'salesperson',
          commission_method: checkout.commission_method || 'percentage',
          commission_amount: checkout.commission_amount || 0,
          base_amount: Number(cart.subtotal) || 0,
        }
      : null,
    invoice: { prefix: 'FACT', commission_amount: input.invoiceCommissionAmount },
    promotion_ids: input.promotionIds,
  };
}

/** true si el error de Supabase dice que la función no existe (PostgREST). */
export function isRpcMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  if (e.code === 'PGRST202') return true;
  const msg = (e.message || '').toLowerCase();
  return msg.includes('could not find the function') && msg.includes(POS_CHECKOUT_RPC);
}

// ── Detección una vez por sesión ─────────────────────────────────────────────

let rpcAvailable: boolean | null = null;
let warnedMissing = false;

/** null = aún no se sabe; false = Supabase respondió que no existe. */
export function isCheckoutRpcAvailable(): boolean | null {
  return rpcAvailable;
}

function markRpcMissing(): void {
  rpcAvailable = false;
  if (!warnedMissing) {
    warnedMissing = true;
    console.warn(
      `[checkoutRpc] La RPC ${POS_CHECKOUT_RPC} no existe en este entorno; el checkout usa el respaldo `
      + 'de N inserts desde el cliente (fase 4B) hasta que la migración 20260921100000_pos_checkout_v1_rpc_atomica esté aplicada.',
    );
  }
}

export class CheckoutRpcError extends Error {
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
  constructor(error: { code?: string; message?: string; details?: string; hint?: string }) {
    super(error.message || 'Error en pos_checkout_v1');
    this.name = 'CheckoutRpcError';
    this.code = error.code;
    this.details = error.details;
    this.hint = error.hint;
  }
}

/**
 * Llama a la RPC. Devuelve `null` si la función no existe (respaldo del
 * llamador); lanza `CheckoutRpcError` con el código de Postgres en cualquier
 * otro error. Como la RPC es una transacción, un error significa que NO se
 * escribió nada.
 */
export async function callCheckoutRpc(
  client: CheckoutRpcClient,
  envelope: CheckoutEnvelope,
): Promise<CheckoutRpcResult | null> {
  if (rpcAvailable === false) return null;
  const { data, error } = await client.rpc(POS_CHECKOUT_RPC, { p_envelope: envelope });
  if (error) {
    if (isRpcMissingError(error)) {
      markRpcMissing();
      return null;
    }
    throw new CheckoutRpcError(error as { code?: string; message?: string });
  }
  rpcAvailable = true;
  const result = data as Partial<CheckoutRpcResult> | null;
  if (!result || !result.sale) {
    throw new CheckoutRpcError({ message: 'La RPC pos_checkout_v1 no devolvió la venta' });
  }
  return {
    sale: result.sale,
    invoice: result.invoice ?? null,
    payments: result.payments ?? [],
    replayed: result.replayed === true,
    completed: result.completed ?? [],
    warnings: result.warnings ?? [],
  };
}

/** Solo para tests. */
export function __resetCheckoutRpcForTests(): void {
  rpcAvailable = null;
  warnedMissing = false;
}
