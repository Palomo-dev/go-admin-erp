/**
 * POST /api/subscriptions/billing-portal — sesión del portal de facturación
 * de Stripe de la organización.
 *
 * GO-sec (auditoría 2026-09-24): tenía un «BYPASS activado» sin comprobar
 * pertenencia y con service role: cualquier usuario con sesión abría el portal
 * de Stripe de CUALQUIER organización (facturas, tarjetas, cancelar la
 * suscripción). Ahora exige membresía activa y permiso de facturación en esa
 * organización (`contextoDeFacturacion`) antes de leer nada.
 */

import { NextResponse } from 'next/server';
import { createBillingPortalSession } from '@/lib/stripe/subscriptionService';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { getServiceClient } from '@/lib/supabase/server-service';

const RUTA = 'subscriptions/billing-portal';

export async function POST(request: Request) {
  try {
    let body: { organizationId?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const ctx = await contextoDeFacturacion(body.organizationId, RUTA);

    // Service role solo tras validar la organización: la RLS de
    // `subscriptions` no se ha revisado para este flujo.
    const { data: subscription, error: subError } = await getServiceClient()
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', ctx.organizationId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No hay información de facturación disponible para esta organización' },
        { status: 404 }
      );
    }

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io'}/app/plan`;
    const result = await createBillingPortalSession(subscription.stripe_customer_id, returnUrl);

    if (!result.success) {
      console.error(`[${RUTA}] no se pudo crear la sesión del portal:`, result.error);
      return NextResponse.json({ error: 'Error creando sesión del portal' }, { status: 500 });
    }

    return NextResponse.json({ success: true, url: result.url });
  } catch (err) {
    return routeErrorResponse(RUTA, err);
  }
}
