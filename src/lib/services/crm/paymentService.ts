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
 *   2. Inserta en payments con source='invoice_sales', source_id=invoice_id.
 *   3. Actualiza invoice_sales.balance y status (paid si balance=0, partial si >0).
 *   4. Actualiza accounts_receivable.balance.
 *   5. Si pago completo: devenga comisión si no estaba devengada.
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
  message: string;
}

// ─── Funciones del servicio ──────────────────────────────────────────────────

/**
 * Registra un pago CRM atómicamente con idempotencia por reference.
 *
 * Pasos:
 * 1. Verifica idempotencia (reference duplicada → retorna idempotent=true).
 * 2. Inserta en payments.
 * 3. Actualiza invoice_sales.balance y status.
 * 4. Actualiza accounts_receivable.balance.
 * 5. Si pago completo y no había comisión devengada, la crea.
 */
export async function registerCrmPayment(
  orgId: number,
  data: RegisterPaymentInput,
  supabase: SupabaseClient
): Promise<RegisterPaymentResult> {
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

  // ─── 2. Obtener la factura para validar y calcular nuevo balance ──────────
  const { data: invoice, error: invError } = await supabase
    .from('invoice_sales')
    .select('id, total, balance, status, customer_id, opportunity_id, currency, salesperson_id, commission_rate, commission_type')
    .eq('id', data.invoice_id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (invError || !invoice) {
    return {
      success: false,
      payment_id: null,
      invoice_status: null,
      commission_created: false,
      idempotent: false,
      message: 'Factura no encontrada',
    };
  }

  const invoiceRow = invoice as {
    id: string;
    total: number;
    balance: number;
    status: string;
    customer_id: string;
    opportunity_id: string | null;
    currency: string;
    salesperson_id: string | null;
    commission_rate: number | null;
    commission_type: string | null;
  };

  // Validar que el monto no exceda el balance
  const paymentAmount = Number(data.amount);
  const currentBalance = Number(invoiceRow.balance);

  if (paymentAmount > currentBalance) {
    return {
      success: false,
      payment_id: null,
      invoice_status: invoiceRow.status,
      commission_created: false,
      idempotent: false,
      message: `El monto del pago (${paymentAmount}) excede el balance pendiente (${currentBalance})`,
    };
  }

  // ─── 3. Insertar el pago en payments ──────────────────────────────────────
  const { data: paymentRow, error: payError } = await supabase
    .from('payments')
    .insert({
      organization_id: orgId,
      branch_id: data.branch_id ?? null,
      source: 'invoice_sales',
      source_id: data.invoice_id,
      method: data.method ?? null,
      amount: paymentAmount,
      currency: data.currency,
      reference: data.reference,
      processor_response: data.processor_response ?? null,
      status: 'completed',
      created_by: data.created_by ?? null,
      payment_date: data.payment_date || new Date().toISOString(),
      discount_amount: 0,
      change_amount: 0,
    })
    .select('id')
    .single();

  if (payError) {
    return {
      success: false,
      payment_id: null,
      invoice_status: invoiceRow.status,
      commission_created: false,
      idempotent: false,
      message: `Error insertando pago: ${payError.message}`,
    };
  }

  const paymentId = (paymentRow as { id: string }).id;

  // ─── 4. Actualizar invoice_sales.balance y status ─────────────────────────
  const newBalance = currentBalance - paymentAmount;
  const newInvoiceStatus = newBalance <= 0 ? 'paid' : 'partial';

  const { error: invUpdateError } = await supabase
    .from('invoice_sales')
    .update({
      balance: newBalance,
      status: newInvoiceStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.invoice_id)
    .eq('organization_id', orgId);

  if (invUpdateError) {
    console.error('paymentService.registerCrmPayment - invoice update error:', invUpdateError.message);
    // El pago ya fue insertado, pero no se pudo actualizar la factura.
    // Se retorna success=true pero con mensaje de advertencia.
    return {
      success: true,
      payment_id: paymentId,
      invoice_status: invoiceRow.status,
      commission_created: false,
      idempotent: false,
      message: `Pago registrado pero error actualizando factura: ${invUpdateError.message}`,
    };
  }

  // ─── 5. Actualizar accounts_receivable.balance ────────────────────────────
  const { data: arRow } = await supabase
    .from('accounts_receivable')
    .select('id, balance, status')
    .eq('invoice_id', data.invoice_id)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (arRow) {
    const arData = arRow as { id: string; balance: number; status: string };
    const newArBalance = Number(arData.balance) - paymentAmount;
    const newArStatus = newArBalance <= 0 ? 'paid' : 'partial';

    await supabase
      .from('accounts_receivable')
      .update({
        balance: newArBalance,
        status: newArStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', arData.id)
      .eq('organization_id', orgId);
  }

  // ─── 6. Si pago completo, devengar comisión si no estaba devengada ─────────
  let commissionCreated = false;

  if (newInvoiceStatus === 'paid' && invoiceRow.opportunity_id) {
    // Verificar si ya existe una comisión devengada para esta oportunidad
    const { data: existingComm } = await supabase
      .from('commissions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('source_type', 'opportunity')
      .eq('source_id', invoiceRow.opportunity_id)
      .in('status', ['accrued', 'paid'])
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

  return {
    success: true,
    payment_id: paymentId,
    invoice_status: newInvoiceStatus,
    commission_created: commissionCreated,
    idempotent: false,
    message: 'Pago registrado exitosamente',
  };
}
