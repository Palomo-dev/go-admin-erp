import { NextRequest, NextResponse } from 'next/server';
import { cancelSubscription, reactivateSubscription } from '@/lib/stripe/subscriptionService';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { getServiceClient } from '@/lib/supabase/server-service';

/**
 * GO-sec (2026-09-24): sesión verificada (`auth.getUser`, no `getSession`),
 * membresía activa y permiso de facturación resuelto en el servidor
 * (`contextoDeFacturacion`: admin o `billing_management`), en lugar de
 * `role_id !== 2`, que dejaba fuera al rol 1 y a los cargos con permiso.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { organizationId?: unknown; immediate?: unknown; action?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    const ctx = await contextoDeFacturacion(body.organizationId, 'subscriptions/cancel');
    const supabase = ctx.supabase;
    const organizationId = ctx.organizationId;
    const immediate = body.immediate === true;
    const action = body.action === 'reactivate' ? 'reactivate' : 'cancel';

    // Obtener suscripción actual (incluir past_due para permitir reactivar/cancelar)
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('organization_id', organizationId)
      .in('status', ['active', 'past_due', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { error: 'No se encontró una suscripción activa o con pago pendiente' },
        { status: 404 }
      );
    }

    let result;
    let message;

    if (action === 'reactivate') {
      // Reactivar suscripción
      if (!subscription.stripe_subscription_id) {
        return NextResponse.json(
          { error: 'No hay suscripción de Stripe para reactivar' },
          { status: 400 }
        );
      }

      result = await reactivateSubscription(subscription.stripe_subscription_id);
      
      if (result.success) {
        await getServiceClient()
          .from('subscriptions')
          .update({
            cancel_at_period_end: false,
            cancel_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);
        
        message = 'Suscripción reactivada exitosamente';
      }
    } else {
      // Cancelar suscripción
      if (subscription.stripe_subscription_id) {
        result = await cancelSubscription(subscription.stripe_subscription_id, immediate);
        
        if (result.success) {
          await getServiceClient()
            .from('subscriptions')
            .update({
              status: immediate ? 'canceled' : 'active',
              cancel_at_period_end: !immediate,
              cancel_at: immediate ? new Date().toISOString() : null,
              canceled_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', subscription.id);
        }
      } else {
        // Sin Stripe, solo actualizar Supabase
        await getServiceClient()
          .from('subscriptions')
          .update({
            status: immediate ? 'canceled' : 'active',
            cancel_at_period_end: !immediate,
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);
        
        result = { success: true };
      }

      message = immediate 
        ? 'Suscripción cancelada inmediatamente' 
        : 'Suscripción se cancelará al final del período actual';
    }

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || 'Error procesando la solicitud' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message,
      action
    });

  } catch (error: unknown) {
    return routeErrorResponse('subscriptions/cancel', error);
  }
}
