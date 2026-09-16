import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Servicio CRM - Registro atómico de pagos (Fase 10).
 *
 * Reusa tablas financieras existentes sin duplicar lógica:
 *   - payments (con source, source_id, amount, reference, status, payment_date, currency)
 *   - invoice_sales (con balance, status)
 *   - accounts_receivable (con balance, status)
 *   - commissions (con source_type, source_id, status)
 *
 * Operación atómica con idempotencia por `reference`:
 *   1. Verifica idempotencia (si ya existe un payment con la misma reference, no re-procesa).
 *      La comprobación previa no cubre dos webhooks simultáneos: para
 *      `reference LIKE 'stripe:%'` el índice único parcial
 *      `uq_payments_org_stripe_reference` (organization_id, reference) corta la
 *      carrera y el 23505 se devuelve como `idempotent: true, duplicate: true`
 *      sin tocar factura ni cartera (el primer webhook ya lo hizo).
 *   2. Deuda A4 (2026-09-16): la lectura del saldo, la validación, el INSERT en
 *      payments y los UPDATE de invoice_sales y accounts_receivable van en UNA
 *      transacción: RPC `fn_register_crm_payment` (migración 20260916050000),
 *      que bloquea la factura con `SELECT … FOR UPDATE` por id y organización.
 *      Antes eran cuatro llamadas desde Node y dos pagos simultáneos leían el
 *      mismo saldo: ambos pasaban la validación y la factura quedaba en negativo.
 *      La RPC es SECURITY INVOKER: corre con la sesión (RLS) o el service role,
 *      según el cliente que reciba esta función, igual que antes.
 *   3. Si pago completo: devenga comisión si no estaba devengada (sigue en Node).
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface RegisterPaymentInput {
  invoice_id: string;
  amount: number;
  currency: string;
  method?: string;
  reference: string; // Idempotencia: si ya existe un payment con esta reference, se ignora
  payment_date?: string;
  processor_response?: Record<string, unknown>;
  created_by?: string | null;
  branch_id?: number | null;
}

export interface RegisterPaymentResult {
  success: boolean;
  payment_id: string | null;
  invoice_status: string | null;
  commission_created: boolean;
  idempotent: boolean;
  /** true solo cuando el INSERT chocó con el índice único (carrera): nada se recalculó en esta llamada. */
  duplicate?: boolean;
  /** Rechazo de validación (r4): la ruta responde con `http_status` (400) y `code`. */
  code?: 'INVALID_AMOUNT' | 'CURRENCY_MISMATCH';
  http_status?: number;
  message: string;
}

function rejectInput(code: NonNullable<RegisterPaymentResult['code']>, message: string): RegisterPaymentResult {
  return { success: false, payment_id: null, invoice_status: null, commission_created: false, idempotent: false, code, http_status: 400, message };
}

/** Postgres `unique_violation` sobre el índice parcial de referencias de Stripe. */
export function isStripeReferenceDuplicate(error: { code?: string; message?: string } | null | undefined, reference: string): boolean {
  if (!error || error.code !== '23505') return false;
  if (!reference.startsWith('stripe:')) return false;
  return typeof error.message !== 'string' || error.message.includes('uq_payments_org_stripe_reference') || /payments/.test(error.message);
}

/** Fila de la factura que la comisión necesita (la RPC no la devuelve; se lee solo cuando queda pagada). */
interface InvoiceForCommission {
  total: number;
  currency: string;
  opportunity_id: string | null;
  salesperson_id: string | null;
  commission_rate: number | null;
  commission_type: string | null;
}

async function readInvoiceForCommission(supabase: SupabaseClient, orgId: number, invoiceId: string): Promise<InvoiceForCommission | null> {
  const { data } = await supabase
    .from('invoice_sales')
    .select('total, currency, opportunity_id, salesperson_id, commission_rate, commission_type')
    .eq('id', invoiceId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return (data as InvoiceForCommission | null) ?? null;
}

/** Resultado `jsonb` de `fn_register_crm_payment`. */
interface RpcRow {
  payment_id: string | null;
  new_balance: number | string;
  invoice_status: string;
  duplicate: boolean;
}

interface RpcError { code?: string; message?: string; details?: string | null }

function duplicateResult(): RegisterPaymentResult {
  return {
    success: true,
    payment_id: null,
    invoice_status: null,
    commission_created: false,
    idempotent: true,
    duplicate: true,
    message: 'Pago ya registrado por otro proceso (índice único de referencia Stripe)',
  };
}

function parseDetail(details: string | null | undefined): Record<string, unknown> {
  if (typeof details !== 'string' || details === '') return {};
  try {
    const parsed: unknown = JSON.parse(details);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Errores propios de la RPC (ERRCODE P0001, MESSAGE distinguible, DETAIL en JSON)
 * → mismo contrato que devolvía la versión de N llamadas desde Node.
 */
function mapRpcError(error: RpcError, paymentAmount: number, paymentCurrency: string): RegisterPaymentResult {
  const detail = parseDetail(error.details);
  const base = { success: false as const, payment_id: null, invoice_status: null, commission_created: false, idempotent: false };
  if (error.code === 'P0001') {
    switch (error.message) {
      case 'invoice_not_found':
        return { ...base, message: 'Factura no encontrada' };
      case 'invalid_amount':
        return rejectInput('INVALID_AMOUNT', `El importe del pago debe ser un número mayor que cero (recibido: ${String(detail.amount ?? paymentAmount)})`);
      case 'currency_mismatch': {
        const invoiceCurrency = String(detail.invoice_currency ?? '');
        return rejectInput('CURRENCY_MISMATCH', invoiceCurrency
          ? `La moneda del pago (${String(detail.payment_currency ?? paymentCurrency)}) no coincide con la de la factura (${invoiceCurrency})`
          : `Moneda inválida: ${String(detail.payment_currency ?? paymentCurrency)}`);
      }
      case 'amount_exceeds_balance': {
        const balance = detail.balance ?? 'desconocido';
        return {
          ...base,
          invoice_status: typeof detail.status === 'string' ? detail.status : null,
          message: `El monto del pago (${String(detail.amount ?? paymentAmount)}) excede el balance pendiente (${String(balance)})`,
        };
      }
      default:
        break;
    }
  }
  return { ...base, message: `Error registrando pago: ${error.message ?? 'desconocido'}` };
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Registra un pago CRM atómicamente con idempotencia por reference.
 *
 * Pasos:
 * 1. Verifica idempotencia (reference duplicada → retorna idempotent=true).
 * 2. RPC `fn_register_crm_payment` (una transacción): bloquea la factura,
 *    valida importe/moneda/saldo, inserta en payments y actualiza
 *    invoice_sales y accounts_receivable.
 * 3. Si pago completo y no había comisión devengada, la crea.
 */
export async function registerCrmPayment(
  orgId: number,
  data: RegisterPaymentInput,
  supabase: SupabaseClient
): Promise<RegisterPaymentResult> {
  // ─── 0. Validación del importe (r4): `payments` no tiene CHECK y un abono negativo SUBÍA el saldo ──
  const paymentAmount = typeof data.amount === 'number' ? data.amount : Number.NaN;
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return rejectInput('INVALID_AMOUNT', `El importe del pago debe ser un número mayor que cero (recibido: ${String(data.amount)})`);
  }
  const paymentCurrency = String(data.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(paymentCurrency)) {
    return rejectInput('CURRENCY_MISMATCH', `Moneda inválida: ${String(data.currency)}`);
  }

  // ─── 1. Idempotencia: verificar si ya existe un pago con la misma reference ──
  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id, status')
    .eq('organization_id', orgId)
    .eq('reference', data.reference)
    .maybeSingle();

  if (existingPayment) {
    return {
      success: true,
      payment_id: (existingPayment as { id: string }).id,
      invoice_status: null,
      commission_created: false,
      idempotent: true,
      message: 'Pago ya registrado previamente (idempotencia por reference)',
    };
  }

  // ─── 2. RPC transaccional: bloqueo de la factura + validación + payments + factura + cartera ──
  const { data: rpcData, error: payError } = await supabase.rpc('fn_register_crm_payment', {
    p_organization_id: orgId,
    p_invoice_id: data.invoice_id,
    p_amount: paymentAmount,
    p_currency: paymentCurrency,
    p_reference: data.reference,
    p_method: data.method ?? null,
    p_payment_date: data.payment_date || new Date().toISOString(),
    p_processor_response: data.processor_response ?? null,
    p_created_by: data.created_by ?? null,
    p_branch_id: data.branch_id ?? null,
  });

  if (payError) {
    if (isStripeReferenceDuplicate(payError, data.reference)) {
      // La RPC ya convierte el 23505 del índice en `duplicate: true`; esto cubre el caso
      // de que llegue como error (p. ej. función antigua): mismo contrato.
      return duplicateResult();
    }
    return mapRpcError(payError as RpcError, paymentAmount, paymentCurrency);
  }

  const rpcRow = (rpcData ?? null) as RpcRow | null;
  if (!rpcRow || typeof rpcRow !== 'object') {
    return {
      success: false,
      payment_id: null,
      invoice_status: null,
      commission_created: false,
      idempotent: false,
      message: 'Error registrando pago: la función fn_register_crm_payment no devolvió resultado',
    };
  }

  if (rpcRow.duplicate === true) {
    // Otro proceso insertó la misma reference entre la comprobación y el INSERT: ya está registrado.
    return duplicateResult();
  }

  const paymentId = String(rpcRow.payment_id);
  // Estado REAL releído por la RPC tras el INSERT (lo fijan los triggers de la BD); no se recalcula aquí.
  const newInvoiceStatus = typeof rpcRow.invoice_status === 'string' && rpcRow.invoice_status !== '' ? rpcRow.invoice_status : 'partial';

  // ─── 3. Si pago completo, devengar comisión si no estaba devengada ─────────
  let commissionCreated = false;

  if (newInvoiceStatus === 'paid') {
    const invoiceRow = await readInvoiceForCommission(supabase, orgId, data.invoice_id);
    if (invoiceRow?.opportunity_id) {
      // ¿Ya existe una comisión para esta oportunidad? En CUALQUIER estado (r3):
      // misma regla que el trigger de BD y que commissionService.accrueCommission;
      // una cancelada (rechazo/clawback) no se vuelve a devengar sola.
      const { data: existingComm } = await supabase
        .from('commissions')
        .select('id')
        .eq('organization_id', orgId)
        .eq('source_type', 'opportunity')
        .eq('source_id', invoiceRow.opportunity_id)
        .limit(1)
        .maybeSingle();

      if (!existingComm && invoiceRow.salesperson_id) {
        // Devengar comisión
        const baseAmount = Number(invoiceRow.total);
        const rate = Number(invoiceRow.commission_rate) || 0;
        const commissionAmount = (baseAmount * rate) / 100;

        if (commissionAmount > 0) {
          const { error: commError } = await supabase
            .from('commissions')
            .insert({
              organization_id: orgId,
              commission_type: invoiceRow.commission_type || 'salesperson',
              source_type: 'opportunity',
              source_id: invoiceRow.opportunity_id,
              payee_type: 'employee',
              payee_id: invoiceRow.salesperson_id,
              base_amount: baseAmount,
              commission_rate: rate,
              commission_amount: commissionAmount,
              currency: invoiceRow.currency,
              status: 'accrued',
              accrued_at: new Date().toISOString(),
              metadata: {
                invoice_id: data.invoice_id,
                payment_id: paymentId,
                auto_generated: true,
              },
            });

          if (!commError) {
            commissionCreated = true;
          } else {
            console.warn('paymentService.registerCrmPayment - commission error:', commError.message);
          }
        }
      }
    }
  }

  return {
    success: true,
    payment_id: paymentId,
    invoice_status: newInvoiceStatus,
    commission_created: commissionCreated,
    idempotent: false,
    message: 'Pago registrado exitosamente',
  };
}
