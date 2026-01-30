import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createBillingPortalSession } from '@/lib/stripe/subscriptionService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { organizationId } = await request.json();

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
        { error: 'No tienes permisos para acceder a esta organización' },
        { status: 403 }
      );
    }

    // Obtener suscripción con stripe_customer_id
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .not('stripe_customer_id', 'is', null)
      .single();

    if (subError || !subscription?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No hay información de facturación disponible para esta organización' },
        { status: 404 }
      );
    }

    // Crear sesión del portal de facturación
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.goadmin.io'}/app/plan`;
    const result = await createBillingPortalSession(subscription.stripe_customer_id, returnUrl);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Error creando sesión del portal' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      url: result.url
    });

  } catch (error: any) {
    console.error('Error creating billing portal session:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
