import { NextRequest, NextResponse } from 'next/server';
import { getCustomerInvoices } from '@/lib/stripe/subscriptionService';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';

/**
 * GET /api/subscriptions/invoices?organizationId=…&limit=…
 *
 * GO-sec (2026-09-24): sesión verificada (`auth.getUser`, no `getSession`),
 * membresía activa y permiso de facturación (`contextoDeFacturacion`). Antes
 * bastaba ser miembro de la organización con cualquier rol.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await contextoDeFacturacion(searchParams.get('organizationId'), 'subscriptions/invoices');
    const limit = Math.min(Math.max(Number.parseInt(searchParams.get('limit') || '10', 10) || 10, 1), 100);

    const { data: subscription, error: subError } = await ctx.supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', ctx.organizationId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription?.stripe_customer_id) {
      return NextResponse.json({
        success: true,
        invoices: [],
        message: 'No hay información de facturación disponible',
      });
    }

    const result = await getCustomerInvoices(subscription.stripe_customer_id, limit);

    return NextResponse.json({ success: true, invoices: result.invoices || [] });
  } catch (err) {
    return routeErrorResponse('subscriptions/invoices', err);
  }
}
