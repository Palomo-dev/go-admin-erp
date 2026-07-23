/**
 * API Endpoint: Comprar Créditos de IA via Stripe Checkout
 * GO Admin ERP - Compra one-time de créditos IA
 *
 * Crea una sesión de Stripe Checkout (mode: payment) para que
 * el usuario compre créditos IA adicionales. Los créditos comprados
 * no expiran y se suman al saldo de la organización.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const DEFAULT_UNIT_PRICE_CENTS = 4;

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe no está configurado. Verifica STRIPE_SECRET_KEY.' },
        { status: 500 }
      );
    }

    const cookieHeader = request.headers.get('cookie') || '';
    let userId = null;

    const userIdMatch = cookieHeader.match(/sb-user-id=([^;]+)/);
    if (userIdMatch) {
      try {
        userId = decodeURIComponent(userIdMatch[1]);
      } catch (e) {
        userId = userIdMatch[1];
      }
    }

    const effectiveUserId = userId || '00000000-0000-0000-0000-000000000000';
    const supabase = createSupabaseClient();

    const { organizationId, creditsAmount } = await request.json();

    if (!organizationId || !creditsAmount || creditsAmount < 100) {
      return NextResponse.json(
        { error: 'Parámetros inválidos: organizationId y creditsAmount (min 100) son requeridos' },
        { status: 400 }
      );
    }

    // Obtener precio unitario desde pricing_config
    const { data: pricingConfig } = await supabase
      .from('pricing_config')
      .select('ai_credit_unit_price, currency')
      .eq('config_key', 'enterprise_default')
      .eq('is_active', true)
      .single();

    const unitPriceCents = pricingConfig?.ai_credit_unit_price || DEFAULT_UNIT_PRICE_CENTS;
    const currency = pricingConfig?.currency || 'usd';
    const totalPriceCents = creditsAmount * unitPriceCents;

    // Validar monto mínimo de Stripe (50 centavos para USD)
    if (totalPriceCents < 50) {
      return NextResponse.json(
        { error: `El monto mínimo de compra es de $0.50 USD (${Math.ceil(50 / unitPriceCents)} créditos)` },
        { status: 400 }
      );
    }

    // Obtener datos de la organización
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('name, email')
      .eq('id', organizationId)
      .single();

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organización no encontrada' },
        { status: 404 }
      );
    }

    // Buscar customer_id existente en Stripe
    const { data: currentSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('organization_id', organizationId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let customerId = currentSub?.stripe_customer_id;

    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (retrieveErr: any) {
        console.warn('⚠️ Stripe customer no encontrado, creando uno nuevo:', retrieveErr.message);
        customerId = undefined;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.email || `org-${organizationId}@placeholder.com`,
        name: org.name,
        metadata: {
          organizationId: organizationId.toString(),
          userId: effectiveUserId,
        },
      });
      customerId = customer.id;
    }

    // Crear producto y precio one-time para esta compra
    const product = await stripe.products.create({
      name: `Créditos IA - ${creditsAmount.toLocaleString()} créditos`,
      description: `Compra de ${creditsAmount.toLocaleString()} créditos de IA para GO Admin ERP`,
      metadata: {
        organization_id: String(organizationId),
        credits_amount: String(creditsAmount),
        type: 'ai_credit_purchase',
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: totalPriceCents,
      currency: currency,
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/app/organizacion/plan?ai_credits=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/app/organizacion/plan?ai_credits=canceled`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: {
        organizationId: organizationId.toString(),
        creditsAmount: creditsAmount.toString(),
        unitPriceCents: unitPriceCents.toString(),
        totalPriceCents: totalPriceCents.toString(),
        type: 'ai_credit_purchase',
        userId: effectiveUserId,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
    });

    // Registrar la compra como pendiente en la BD
    await supabase.from('ai_credit_purchases').insert({
      organization_id: organizationId,
      credits_amount: creditsAmount,
      unit_price_cents: unitPriceCents,
      total_price_cents: totalPriceCents,
      currency: currency,
      stripe_checkout_session_id: session.id,
      status: 'pending',
      purchased_by: effectiveUserId,
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('❌ Error creando checkout session para créditos IA:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
