/**
 * Checkout atómico del POS por RPC (Desktop fase 4E; ROADMAP-DESKTOP §Fase 4,
 * punto 4). Construye el sobre que espera `public.pos_checkout_v1` a partir
 * de los valores que `POSService.checkout` YA calculó (promociones, impuestos,
 * totales) y lo envía en una sola llamada: o entra todo o no entra nada.
 *
 * La RPC se detecta una vez por sesión: si Supabase responde que la función
 * no existe (`PGRST202`), `POSService.checkout` rechaza la venta con un error
 * visible —ya no hay respaldo de N inserts (F-48, ADR-CC-002)— y lo avisa una
 * sola vez por consola.
 *
 * Este módulo no importa Supabase: recibe el cliente por parámetro para que
 * los tests lo ejerzan con el cliente de mentira.
 */

import type { CheckoutData, CobroVentaExistente, Sale } from '@/components/pos/types';
import { leerMembresiasVendidas, type MembresiaVendida } from '@/lib/pos/venta/membresias';
import { esMedido } from '@/lib/pos/peso/modoVenta';
import { pagosConRedondeo } from '@/lib/pos/peso/cobroRedondeo';

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
  /**
   * 'sale' (por omisión): venta nueva. 'debt': venta nueva a crédito (sin
   * pagos). 'settle': cobrar una venta que ya existe (deuda, mesa).
   */
  mode?: CheckoutMode;
  /** settle: llave del intento de cobro (idempotencia de pagos y propina). */
  paymentKey?: string;
  /** debt: motivo, plazo en días y notas de la factura a crédito. */
  debt?: { reason: string; payment_terms: number; notes?: string | null };
  /** settle: datos del cobro de una venta existente (mesa). */
  settle?: CobroVentaExistente;
  /**
   * settle de una mesa con la cuenta dividida: líneas sin pagar que NO cobra
   * este intento. Viajan solo para que el servidor conozca su tasa de impuesto
   * (recalcula y valida la cuenta entera); no suman al cobro.
   */
  lineasMesa?: LineaMesaSinCobrar[];
}

export interface LineaMesaSinCobrar {
  sale_item_id: string;
  product_id: number | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  tax_included: boolean;
}

export type CheckoutMode = 'sale' | 'debt' | 'settle';

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
  /** Modificadores con su id: pos_checkout_v1 suma sus extras configurados al validar el precio. */
  modifiers: Array<{ name: string; modifier_id: number | null }>;
  serial_ids: number[];
  /**
   * Momento en que la línea entró al carrito (`CartItem.created_at`): el
   * servidor acepta el precio vigente entonces (últimos 30 días) además del
   * vigente ahora, para no rechazar un carrito armado antes de un cambio de precio.
   */
  priced_at: string | null;
  /**
   * Cobro de una mesa: la línea de `sale_items` a la que corresponde. El
   * servidor toma de aquí solo la tasa y el modo de impuesto; cantidad,
   * precio y descuento salen de la base.
   */
  sale_item_id?: string;
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
  /** Ausente = 'sale' (sobres anteriores al 2026-09-24, p. ej. en el outbox). */
  mode?: CheckoutMode;
  payment_key?: string;
  debt?: { reason: string; payment_terms: number; notes: string | null };
  /** settle de una mesa: sesión, líneas que paga este cobro y parte de la cuenta dividida. */
  table_session_id?: string;
  paid_sale_item_ids?: string[];
  split_id?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CheckoutRpcResult {
  sale: Sale;
  invoice: Record<string, unknown> | null;
  payments: Array<Record<string, unknown>>;
  replayed: boolean;
  completed: string[];
  warnings: string[];
  /**
   * Membresías que creó, activó o renovó el cobro en la misma transacción
   * (`fn_membresias_activar_venta`, docs/design/MEMBRESIAS-FASE-1-2.md §4).
   * `[]` si la venta no lleva membresías o la base es anterior.
   */
  membresias: MembresiaVendida[];
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
  const mesa = input.mode === 'settle' && input.settle?.table_session_id ? input.settle : null;
  // Con líneas por peso o medida el cobro se redondea a la moneda y la línea
  // guarda el importe exacto: el faltante de redondeo (< media unidad) se suma
  // al último pago para que la venta no quede pendiente (cobroRedondeo.ts).
  const pagosBase = payments.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: p.amount }));
  const conMedidas = cart.items.some((i) => esMedido(i.product) || !!i.pesaje);
  const pagosDelCobro = conMedidas && input.mode !== 'debt'
    ? pagosConRedondeo({ pagos: pagosBase, totalPagado: checkout.total_paid, cambio: checkout.change || 0, totalExacto: input.total })
    : { pagos: pagosBase, totalPagado: checkout.total_paid };

  const items: CheckoutEnvelopeItem[] = cart.items.map((item, idx) => {
    const calc = itemCalcs[idx];
    const notes: Record<string, unknown> = { product_name: item.product?.name };
    // `extra` = nota de COCINA (nunca va al cliente); `customer_note` = nota
    // para el cliente: pos_checkout_v1 la copia a invoice_items.note (factura).
    if (item.notes) notes.extra = item.notes;
    if (item.notes && item.is_allergy) notes.is_allergy = true;
    if (item.customer_note) notes.customer_note = item.customer_note;
    if (item.modifiers && item.modifiers.length > 0) notes.modifiers = item.modifiers;
    // Pesada de la línea por peso: origen, neto, unidad (fn_pos_validar_pesaje la revisa).
    if (item.pesaje) notes.pesaje = item.pesaje;
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
      modifiers: (item.modifiers ?? []).map((m) => ({ name: m.name, modifier_id: m.modifierId ?? null })),
      serial_ids: serialIds,
      priced_at: item.created_at ?? null,
      ...(mesa && UUID_RE.test(String(item.id ?? '')) ? { sale_item_id: String(item.id) } : {}),
    };
  });
  if (mesa) {
    const yaEnviadas = new Set(items.map((i) => i.sale_item_id).filter(Boolean));
    for (const l of input.lineasMesa ?? []) {
      if (!UUID_RE.test(l.sale_item_id) || yaEnviadas.has(l.sale_item_id) || !(l.quantity > 0)) continue;
      items.push({
        product_id: l.product_id,
        product_name: null,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: 0,
        tax_rate: l.tax_rate,
        tax_amount: 0,
        total: 0,
        tax_included: l.tax_included,
        notes: {},
        modifiers: [],
        serial_ids: [],
        priced_at: null,
        sale_item_id: l.sale_item_id,
      });
    }
  }

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
      total_paid: pagosDelCobro.totalPagado,
      change: checkout.change || 0,
      shipping_fee: shipping,
      tip_amount: tip,
    },
    items,
    payments: pagosDelCobro.pagos,
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
    ...(input.mode && input.mode !== 'sale' ? { mode: input.mode } : {}),
    ...(input.mode === 'settle' ? { payment_key: input.paymentKey } : {}),
    ...(input.mode === 'debt' && input.debt
      ? { debt: { reason: input.debt.reason, payment_terms: input.debt.payment_terms, notes: input.debt.notes ?? null } }
      : {}),
    ...(mesa
      ? {
          table_session_id: mesa.table_session_id,
          ...(mesa.paid_sale_item_ids && mesa.paid_sale_item_ids.length > 0
            ? { paid_sale_item_ids: mesa.paid_sale_item_ids.filter((id) => UUID_RE.test(id)) }
            : {}),
          ...(mesa.split_id ? { split_id: mesa.split_id } : {}),
        }
      : {}),
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
      `[checkoutRpc] La RPC ${POS_CHECKOUT_RPC} no existe en este entorno; las ventas nuevas no se pueden `
      + 'guardar hasta que la migración 20260921100000_pos_checkout_v1_rpc_atomica esté aplicada.',
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
 * Llama a la RPC. Devuelve `null` si la función no existe (el llamador
 * rechaza la venta); lanza `CheckoutRpcError` con el código de Postgres en cualquier
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
    membresias: leerMembresiasVendidas((data as { membresias?: unknown }).membresias),
  };
}

/** Solo para tests. */
export function __resetCheckoutRpcForTests(): void {
  rpcAvailable = null;
  warnedMissing = false;
}
