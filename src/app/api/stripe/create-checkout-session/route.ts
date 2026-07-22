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
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe no está configurado. Verifica STRIPE_SECRET_KEY.' },
        { status: 500 }
      )
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

    const { 
      organizationId, 
      planCode, 
      billingPeriod,
      successUrl,
      cancelUrl,
      enterpriseConfig,
      couponCode
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

    // Buscar suscripción existente (incluyendo canceled/past_due para reutilizar stripe_customer_id)
    const { data: currentSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id, stripe_subscription_id, plan_id, status')
      .eq('organization_id', organizationId)
      .not('stripe_customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    let customerId = currentSub?.stripe_customer_id

    if (customerId) {
      // Verificar que el customer existe en el entorno actual de Stripe (test vs live)
      try {
        await stripe.customers.retrieve(customerId)
      } catch (retrieveErr: any) {
        // El customer no existe en este entorno (ej: creado en test, ahora usamos live)
        console.warn('⚠️ Stripe customer no encontrado, creando uno nuevo:', retrieveErr.message)
        customerId = undefined
      }
    }

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

      // Actualizar el stripe_customer_id en la suscripción existente
      if (currentSub) {
        await supabase
          .from('subscriptions')
          .update({ stripe_customer_id: customerId })
          .eq('organization_id', organizationId)
          .eq('stripe_customer_id', currentSub.stripe_customer_id)
      }
    }

    // Solo cancelar suscripción anterior si está activa o past_due (no si ya está canceled)
    if (currentSub?.stripe_subscription_id && currentSub.status !== 'canceled') {
      try {
        await stripe.subscriptions.update(currentSub.stripe_subscription_id, {
          cancel_at_period_end: true,
        })
      } catch (e: any) {
        console.warn('⚠️ No se pudo marcar suscripción anterior (puede no existir en este entorno):', e.message)
      }
    }

    // Buscar cupón si se proporcionó un código
    let stripeCouponId: string | undefined
    if (couponCode) {
      const { data: couponData, error: couponError } = await supabase
        .from('subscription_coupons')
        .select('stripe_coupon_id, is_active, max_redemptions, redemption_count, valid_until')
        .eq('code', couponCode.toUpperCase())
        .eq('is_active', true)
        .single();

      if (couponError || !couponData) {
        console.warn('⚠️ Cupón no encontrado o inactivo:', couponCode);
      } else if (couponData.max_redemptions && couponData.redemption_count >= couponData.max_redemptions) {
        console.warn('⚠️ Cupón alcanzó límite de redenciones:', couponCode);
      } else if (couponData.valid_until && new Date(couponData.valid_until) < new Date()) {
        console.warn('⚠️ Cupón expirado:', couponCode);
      } else if (!couponData.stripe_coupon_id) {
        console.warn('⚠️ Cupón sin stripe_coupon_id:', couponCode);
      } else {
        stripeCouponId = couponData.stripe_coupon_id;
        console.log('✅ Cupón válido para checkout:', stripeCouponId);
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
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      subscription_data: {
        metadata: {
          organizationId: organizationId.toString(),
          planCode: planCode,
          billingPeriod: billingPeriod,
          previousPlanId: currentSub?.plan_id?.toString() || '',
          ...(couponCode ? { couponCode: couponCode.toUpperCase() } : {}),
        },
        ...(currentSub?.stripe_subscription_id ? {} : { trial_period_days: 15 }),
      },
      metadata: {
        organizationId: organizationId.toString(),
        planCode: planCode,
        billingPeriod: billingPeriod,
        userId: effectiveUserId || 'unknown',
        ...(couponCode ? { couponCode: couponCode.toUpperCase() } : {}),
      },
      success_url: successUrl || defaultSuccessUrl,
      cancel_url: cancelUrl || defaultCancelUrl,
      ...(stripeCouponId ? {} : { allow_promotion_codes: true }),
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      payment_method_collection: 'always',
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionConfig)

    // Incrementar redemption_count del cupón
    if (stripeCouponId && couponCode) {
      try {
        const { data: couponRow } = await supabase
          .from('subscription_coupons')
          .select('redemption_count')
          .eq('code', couponCode.toUpperCase())
          .single();
        if (couponRow) {
          await supabase
            .from('subscription_coupons')
            .update({ redemption_count: (couponRow.redemption_count || 0) + 1 })
            .eq('code', couponCode.toUpperCase());
        }
      } catch (e) {
        console.warn('⚠️ No se pudo incrementar redemption_count del cupón:', e);
      }
    }

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
