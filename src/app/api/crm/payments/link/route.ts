import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  createPaymentLinkForQuotation,
  getStripeReadiness,
  publicStripeReadiness,
  InvoiceRequiredError,
  PaymentNotConfiguredError,
  stripeAdapter,
} from '@/lib/services/crm/stripePaymentLinkService';
import { failResponse, foreignOrgResponse, isSafeId, readJson } from '@/lib/services/crm/f10RouteHelpers';

export const runtime = 'nodejs';

/**
 * GET /api/crm/payments/link?quotation_id=… — estado del pago en línea para la
 * propuesta: proveedor configurado (sin claves), enlace existente, factura.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const quotationId = new URL(request.url).searchParams.get('quotation_id');
    if (!isSafeId(quotationId)) return NextResponse.json({ success: false, error: 'Falta quotation_id' }, { status: 400 });
    const { data: quot } = await ctx.supabase
      .from('quotations')
      .select('id, payment_link_url, converted_invoice_id')
      .eq('id', quotationId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!quot) return NextResponse.json({ success: false, error: 'Propuesta no encontrada' }, { status: 404 });
    const q = quot as { payment_link_url: string | null; converted_invoice_id: string | null };
    let invoice: { id: string; number: string; balance: number; status: string; currency: string } | null = null;
    if (q.converted_invoice_id) {
      const { data: inv } = await ctx.supabase.from('invoice_sales').select('id, number, balance, status, currency').eq('id', q.converted_invoice_id).eq('organization_id', ctx.organizationId).maybeSingle();
      invoice = (inv as typeof invoice) ?? null;
    }
    const readiness = await getStripeReadiness(ctx.organizationId, getServiceClient());
    return NextResponse.json({ success: true, data: { ...publicStripeReadiness(readiness), payment_link_url: q.payment_link_url, invoice } });
  } catch (error) {
    return failResponse('CRM Payments link GET', error);
  }
}

/**
 * POST /api/crm/payments/link — crea (o reutiliza) el Payment Link de Stripe.
 * Body: { quotation_id }. 409 `{configured:false, missing[]}` sin proveedor;
 * 422 si la propuesta no tiene factura o la factura no tiene saldo.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await readJson(request);
    const forbidden = foreignOrgResponse('CRM Payments link POST', body, ctx.organizationId);
    if (forbidden) return forbidden;
    if (!isSafeId(body?.quotation_id)) return NextResponse.json({ success: false, error: 'Falta quotation_id' }, { status: 400 });
    const result = await createPaymentLinkForQuotation(ctx.organizationId, body!.quotation_id as string, ctx.supabase, { serviceClient: getServiceClient(), adapter: stripeAdapter });
    if (!result) return NextResponse.json({ success: false, error: 'Propuesta no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, data: result }, { status: result.reused ? 200 : 201 });
  } catch (error) {
    if (error instanceof PaymentNotConfiguredError) {
      return NextResponse.json({ success: false, error: error.message, configured: false, missing: error.missing }, { status: 409 });
    }
    if (error instanceof InvoiceRequiredError || (error instanceof Error && /saldo pendiente/.test(error.message))) {
      return NextResponse.json({ success: false, error: error.message }, { status: 422 });
    }
    return failResponse('CRM Payments link POST', error);
  }
}
