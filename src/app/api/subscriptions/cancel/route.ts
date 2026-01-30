import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { cancelSubscription, reactivateSubscription } from '@/lib/stripe/subscriptionService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { organizationId, immediate = false, action = 'cancel' } = await request.json();

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 }
      );
    }

    // Verificar permisos
    const { data: memberData, error: memberError } = await supabase
      .from('organization_members')
      .select('role_id, is_super_admin')
      .eq('organization_id', organizationId)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (memberError || !memberData) {
      return NextResponse.json(
        { error: 'No tienes permisos para modificar esta organización' },
        { status: 403 }
      );
    }

    if (memberData.role_id !== 2 && !memberData.is_super_admin) {
      return NextResponse.json(
        { error: 'Solo los administradores pueden gestionar la suscripción' },
        { status: 403 }
      );
    }

    // Obtener suscripción actual
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { error: 'No se encontró una suscripción activa' },
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
        await supabase
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
          await supabase
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
        await supabase
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

  } catch (error: any) {
    console.error('Error en cancel/reactivate subscription:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
