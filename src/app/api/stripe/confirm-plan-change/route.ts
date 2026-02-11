/**
 * API Endpoint: Confirmar cambio de plan después de checkout
 * GO Admin ERP - Endpoint para actualizar plan sin depender del webhook
 * 
 * Este endpoint se llama desde el frontend después de un checkout exitoso
 * para actualizar inmediatamente el plan en la base de datos.
 * 
 * POST /api/stripe/confirm-plan-change
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId, organizationId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId es requerido' },
        { status: 400 }
      );
    }

    const supabase = createSupabaseClient();

    // Obtener la sesión de checkout de Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
    
    if (!checkoutSession) {
      return NextResponse.json(
        { error: 'Checkout session no encontrado' },
        { status: 404 }
      );
    }

    // Verificar que el pago fue exitoso
    if (checkoutSession.payment_status !== 'paid' && checkoutSession.status !== 'complete') {
      return NextResponse.json(
        { error: 'Checkout no completado', status: checkoutSession.status },
        { status: 400 }
      );
    }

    const metadata = checkoutSession.metadata || {};
    const orgId = organizationId || parseInt(metadata.organizationId || '0');
    const planCode = metadata.planCode;
    const billingPeriod = metadata.billingPeriod;
    const subscriptionId = checkoutSession.subscription as string;
    const customerId = checkoutSession.customer as string;

    if (!orgId || !planCode) {
      return NextResponse.json(
        { error: 'Falta metadata necesaria', metadata },
        { status: 400 }
      );
    }

    // Obtener el plan de la base de datos
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('id, code, name, max_modules, max_branches')
      .eq('code', planCode)
      .single();

    if (planError || !plan) {
      return NextResponse.json(
        { error: 'Plan no encontrado', planCode },
        { status: 404 }
      );
    }

    // Obtener detalles de la suscripción de Stripe
    let stripeSubscription: any = null;
    if (subscriptionId) {
      stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
    }

    // Buscar suscripción existente
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('id, metadata')
      .eq('organization_id', orgId)
      .single();

    // Preparar datos de actualización
    const updateData: any = {
      plan_id: plan.id,
      stripe_subscription_id: subscriptionId,
      stripe_customer_id: customerId,
      status: stripeSubscription?.status || 'active',
      billing_period: billingPeriod,
      current_period_start: stripeSubscription 
        ? new Date(stripeSubscription.current_period_start * 1000).toISOString()
        : new Date().toISOString(),
      current_period_end: stripeSubscription
        ? new Date(stripeSubscription.current_period_end * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      trial_start: stripeSubscription?.trial_start 
        ? new Date(stripeSubscription.trial_start * 1000).toISOString()
        : null,
      trial_end: stripeSubscription?.trial_end
        ? new Date(stripeSubscription.trial_end * 1000).toISOString()
        : null,
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    };

    // Si hay configuración Enterprise en metadata, preservarla
    if (metadata.enterpriseConfig) {
      try {
        const enterpriseConfig = JSON.parse(metadata.enterpriseConfig);
        updateData.metadata = {
          ...(existingSub?.metadata || {}),
          custom_config: {
            ...enterpriseConfig,
            billing_period: billingPeriod
          },
          is_enterprise_custom: true
        };
      } catch (e) {
        console.warn('Error parsing enterpriseConfig:', e);
      }
    }

    // Actualizar o crear suscripción
    let result;
    if (existingSub) {
      result = await supabase
        .from('subscriptions')
        .update(updateData)
        .eq('id', existingSub.id)
        .select();
    } else {
      result = await supabase
        .from('subscriptions')
        .insert({
          ...updateData,
          organization_id: orgId,
          created_at: new Date().toISOString(),
        })
        .select();
    }

    if (result.error) {
      return NextResponse.json(
        { error: 'Error actualizando suscripción', details: result.error },
        { status: 500 }
      );
    }

    // Actualizar plan_id en la organización
    await supabase
      .from('organizations')
      .update({
        plan_id: plan.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);

    return NextResponse.json({
      success: true,
      message: 'Plan actualizado exitosamente',
      plan: {
        id: plan.id,
        code: plan.code,
        name: plan.name
      },
      subscription: result.data?.[0]
    });

  } catch (error: any) {
    console.error('Error en confirm-plan-change:', error);
    return NextResponse.json(
      { error: 'Error interno', message: error.message },
      { status: 500 }
    );
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
