import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { registerCrmPayment } from '@/lib/services/crm/paymentService';

/**
 * POST /api/crm/payments/register — Registra un pago CRM atómicamente.
 *
 * Body: {
 *   invoice_id, amount, currency, method?, reference,
 *   payment_date?, processor_response?, branch_id?
 * }
 *
 * Operación atómica con idempotencia por reference:
 *   1. Verifica idempotencia (reference duplicada → no re-procesa).
 *   2. Inserta en payments con source='invoice_sales'.
 *   3. Actualiza invoice_sales.balance y status (paid/partial).
 *   4. Actualiza accounts_receivable.balance.
 *   5. Si pago completo: devenga comisión si no estaba devengada.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.invoice_id || !body?.amount || !body?.currency || !body?.reference) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: invoice_id, amount, currency, reference' },
        { status: 400 }
      );
    }

    const result = await registerCrmPayment(
      ctx.organizationId,
      {
        invoice_id: body.invoice_id,
        amount: Number(body.amount),
        currency: body.currency,
        method: body.method ?? null,
        reference: body.reference,
        payment_date: body.payment_date,
        processor_response: body.processor_response,
        created_by: ctx.userId,
        branch_id: body.branch_id ?? null,
      },
      ctx.supabase
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.message, data: result },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Payments Register] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
