import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { 
  getCustomerPaymentMethods, 
  createSetupIntent, 
  deletePaymentMethod,
  updateSubscriptionPaymentMethod 
} from '@/lib/stripe/subscriptionService';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 }
      );
    }

    // Verificar permisos
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('role_id, is_super_admin')
      .eq('organization_id', organizationId)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!memberData) {
      return NextResponse.json(
        { error: 'No tienes permisos para acceder a esta organización' },
        { status: 403 }
      );
    }

    // Obtener stripe_customer_id
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .not('stripe_customer_id', 'is', null)
      .single();

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({
        success: true,
        paymentMethods: []
      });
    }

    const result = await getCustomerPaymentMethods(subscription.stripe_customer_id);

    return NextResponse.json({
      success: true,
      paymentMethods: result.paymentMethods || []
    });

  } catch (error: any) {
    console.error('Error fetching payment methods:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { organizationId, action, paymentMethodId } = await request.json();

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 }
      );
    }

    // Verificar permisos (solo admin)
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('role_id, is_super_admin')
      .eq('organization_id', organizationId)
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (!memberData || (memberData.role_id !== 2 && !memberData.is_super_admin)) {
      return NextResponse.json(
        { error: 'Solo los administradores pueden gestionar métodos de pago' },
        { status: 403 }
      );
    }

    // Obtener suscripción
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id')
      .eq('organization_id', organizationId)
      .not('stripe_customer_id', 'is', null)
      .single();

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No hay información de facturación disponible' },
        { status: 404 }
      );
    }

    let result;

    switch (action) {
      case 'create-setup-intent':
        result = await createSetupIntent(subscription.stripe_customer_id);
        break;
      
      case 'delete':
        if (!paymentMethodId) {
          return NextResponse.json(
            { error: 'paymentMethodId es requerido para eliminar' },
            { status: 400 }
          );
        }
        result = await deletePaymentMethod(paymentMethodId);
        break;
      
      case 'set-default':
        if (!paymentMethodId || !subscription.stripe_subscription_id) {
          return NextResponse.json(
            { error: 'paymentMethodId y suscripción son requeridos' },
            { status: 400 }
          );
        }
        result = await updateSubscriptionPaymentMethod(
          subscription.stripe_subscription_id,
          paymentMethodId
        );
        break;
      
      default:
        return NextResponse.json(
          { error: 'Acción no válida' },
          { status: 400 }
        );
    }

    if (!result?.success) {
      return NextResponse.json(
        { error: result?.error || 'Error procesando la solicitud' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error managing payment methods:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
