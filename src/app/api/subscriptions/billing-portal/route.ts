import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createBillingPortalSession } from '@/lib/stripe/subscriptionService';

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Variables de entorno faltantes:', { supabaseUrl: !!supabaseUrl, supabaseServiceKey: !!supabaseServiceKey });
      return NextResponse.json(
        { error: 'Configuración del servidor incompleta. Reinicia el servidor.' },
        { status: 500 }
      );
    }
    
    // Crear cliente con service role para bypass de RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { organizationId } = await request.json();

    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId es requerido' },
        { status: 400 }
      );
    }

    console.log('🔍 API billing-portal - orgId:', organizationId);

    // Bypass temporal: permitir acceso sin verificar membership
    console.log('🔍 API billing-portal - BYPASS activado');

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
