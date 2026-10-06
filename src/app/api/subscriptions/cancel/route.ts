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
      // Cancelar suscripción. Al programarla para el final del periodo el
      // estado NO cambia (auditoría 2026-10, P1-1): antes se escribía 'active'
      // fijo, así que cancelar una PRUEBA la convertía en suscripción activa
      // sin pago. En prueba, el final es el de la prueba.
      const estadoAlProgramar: string = subscription.status;
      const finProgramado: string | null =
        subscription.status === 'trialing'
          ? subscription.trial_end ?? subscription.current_period_end ?? null
          : subscription.current_period_end ?? null;
      if (subscription.stripe_subscription_id) {
        result = await cancelSubscription(subscription.stripe_subscription_id, immediate);
        
        if (result.success) {
          await getServiceClient()
            .from('subscriptions')
            .update({
              status: immediate ? 'canceled' : estadoAlProgramar,
              cancel_at_period_end: !immediate,
              cancel_at: immediate ? new Date().toISOString() : finProgramado,
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
            status: immediate ? 'canceled' : estadoAlProgramar,
            cancel_at_period_end: !immediate,
            cancel_at: immediate ? new Date().toISOString() : finProgramado,
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);
        
        result = { success: true };
      }

      message = immediate
        ? 'Suscripción cancelada inmediatamente'
        : subscription.status === 'trialing'
          ? 'La prueba se cancelará al terminar'
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
