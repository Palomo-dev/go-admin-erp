/**
 * API Endpoint: Crear Stripe Checkout Session
 * GO Admin ERP - Checkout Session para upgrades de plan
 * 
 * Crea una sesión de checkout de Stripe para que el usuario
 * pueda pagar y guardar su método de pago para cobros recurrentes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe/server'
import { getEnterprisePricing } from '@/lib/services/pricingService'

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

export async function POST(request: NextRequest) {
  try {
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

    const { 
      organizationId, 
      planCode, 
      billingPeriod,
      successUrl,
      cancelUrl,
      enterpriseConfig
    } = await request.json()

    if (!organizationId || !planCode || !billingPeriod) {
      return NextResponse.json(
        { error: 'Parámetros faltantes: organizationId, planCode, billingPeriod son requeridos' },
        { status: 400 }
      )
    }

    let priceId: string

    if (planCode === 'enterprise' && enterpriseConfig) {
      const pricing = await getEnterprisePricing();
      
      const additionalModules = Math.max(0, enterpriseConfig.modulesCount - 6);
      const modulesPrice = additionalModules * pricing.moduleUnitPrice;
      const branchesPrice = enterpriseConfig.branchesCount * pricing.branchUnitPrice;
      const usersPrice = enterpriseConfig.usersCount * pricing.userUnitPrice;
      const aiCreditsPrice = (enterpriseConfig.aiCredits || 0) * (pricing.aiCreditUnitPrice / 100);
      
      const monthlyPrice = pricing.basePrice + modulesPrice + branchesPrice + usersPrice + aiCreditsPrice;
      const isYearly = billingPeriod === 'yearly';
      const calculatedPrice = isYearly ? Math.round(monthlyPrice * 10) : Math.round(monthlyPrice);
      
      const product = await stripe.products.create({
        name: `Enterprise ${isYearly ? 'Anual' : 'Mensual'} - Org ${organizationId}`,
        description: `${enterpriseConfig.modulesCount} módulos, ${enterpriseConfig.branchesCount} sucursales, ${enterpriseConfig.usersCount} usuarios, ${enterpriseConfig.aiCredits || 0} créditos IA`,
        metadata: {
          organization_id: String(organizationId),
          modules_count: String(enterpriseConfig.modulesCount),
          branches_count: String(enterpriseConfig.branchesCount),
          users_count: String(enterpriseConfig.usersCount),
          ai_credits: String(enterpriseConfig.aiCredits || 0),
          billing_period: billingPeriod,
          is_dynamic: 'true',
        },
      });
      
      const stripePrice = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(calculatedPrice * 100),
        currency: 'usd',
        recurring: { 
          interval: isYearly ? 'year' : 'month',
          interval_count: 1 
        },
      });
      
      priceId = stripePrice.id;
    } else {
      const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('code', planCode)
        .eq('is_active', true)
        .single()

      if (planError || !plan) {
        return NextResponse.json(
          { error: 'Plan no encontrado' },
          { status: 404 }
        )
      }

      priceId = billingPeriod === 'yearly' 
        ? plan.stripe_price_yearly_id 
        : plan.stripe_price_monthly_id

      if (!priceId) {
        return NextResponse.json(
          { error: `Plan ${planCode} no tiene precio configurado en Stripe para ${billingPeriod}` },
          { status: 400 }
        )
      }
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('name, email')
      .eq('id', organizationId)
      .single()

    if (orgError || !org) {
      return NextResponse.json(
        { error: 'Organización no encontrada' },
        { status: 404 }
      )
    }

    const { data: currentSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, plan_id')
      .eq('organization_id', organizationId)
      .eq('status', 'active')
      .single()

    let customerId = currentSub?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: org.email || `org-${organizationId}@placeholder.com`,
        name: org.name,
        metadata: {
          organizationId: organizationId.toString(),
          userId: effectiveUserId || 'unknown',
        },
      })
      customerId = customer.id
    }

    if (currentSub?.stripe_subscription_id) {
      try {
        await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
          cancel_at_period_end: true,
        })
      } catch (e) {
        console.warn('⚠️ No se pudo marcar suscripción anterior:', e)
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const defaultSuccessUrl = `${baseUrl}/app/organizacion/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    const defaultCancelUrl = `${baseUrl}/app/organizacion/plan?checkout=canceled`

    const sessionConfig: any = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: {
          organizationId: organizationId.toString(),
          planCode: planCode,
          billingPeriod: billingPeriod,
          previousPlanId: currentSub?.plan_id?.toString() || '',
        },
        ...(currentSub?.stripe_subscription_id ? {} : { trial_period_days: 15 }),
      },
      metadata: {
        organizationId: organizationId.toString(),
        planCode: planCode,
        billingPeriod: billingPeriod,
        userId: effectiveUserId || 'unknown',
      },
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      payment_method_collection: 'always',
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionConfig)

    return NextResponse.json({
      success: true,
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    })

  } catch (error: any) {
    console.error('❌ Error creando checkout session:', error)
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
