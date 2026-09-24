import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Falta STRIPE_SECRET_KEY');
  return new Stripe(key, { apiVersion: '2025-09-30.clover' });
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Faltan credenciales Supabase');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface EnterpriseConfig {
  modules_count: number;
  branches_count: number;
  users_count: number;
  ai_credits?: number;
  selected_modules?: string[];
  billing_period?: 'monthly' | 'yearly';
}

const PRICING = {
  basePrice: 199,
  moduleUnitPrice: 49,
  branchUnitPrice: 59,
  userUnitPrice: 19,
  aiCreditUnitPrice: 1,
};

function calculateEnterprisePrice(config: EnterpriseConfig): { monthly: number; yearly: number } {
  const additionalModules = Math.max(0, config.modules_count - 6);
  const modulesPrice = additionalModules * PRICING.moduleUnitPrice;
  const branchesPrice = config.branches_count * PRICING.branchUnitPrice;
  const usersPrice = config.users_count * PRICING.userUnitPrice;
  const aiCreditsPrice = (config.ai_credits || 0) * (PRICING.aiCreditUnitPrice / 100);
  
  const monthly = PRICING.basePrice + modulesPrice + branchesPrice + usersPrice + aiCreditsPrice;
  const yearly = Math.round(monthly * 10);
  
  return { monthly, yearly };
}

/**
 * GO-sec (2026-09-24): antes la organización salía del body sin comprobar
 * pertenencia y se escribía con service role (y se creaban productos en
 * Stripe) para cualquier organización. Ahora `contextoDeFacturacion`: sesión,
 * membresía activa y admin o `billing_management` en ESA organización.
 */
export async function POST(request: NextRequest) {
  try {
    let body: { organizationId?: unknown; config?: EnterpriseConfig };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }
    const ctx = await contextoDeFacturacion(body.organizationId, 'organization/enterprise');
    const organizationId = ctx.organizationId;
    const config = body.config;

    if (!config) {
      return NextResponse.json(
        { error: 'config requerido' },
        { status: 400 }
      );
    }

    if (config.modules_count < 1 || config.branches_count < 1 || config.users_count < 1) {
      return NextResponse.json(
        { error: 'Los valores deben ser al menos 1' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    const stripe = getStripe();

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('id, stripe_customer_id, plans(is_custom_enterprise)')
      .eq('organization_id', organizationId)
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        { error: 'No se encontró suscripción para esta organización' },
        { status: 404 }
      );
    }

    const plans = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
    if (!plans?.is_custom_enterprise) {
      return NextResponse.json(
        { error: 'Esta organización no tiene un plan Enterprise' },
        { status: 403 }
      );
    }

    const prices = calculateEnterprisePrice(config);
    const isYearly = config.billing_period === 'yearly';
    const calculatedPrice = isYearly ? prices.yearly : prices.monthly;

    const product = await stripe.products.create({
      name: `Enterprise ${isYearly ? 'Anual' : 'Mensual'} - Org ${organizationId}`,
      description: `${config.modules_count} módulos, ${config.branches_count} sucursales, ${config.users_count} usuarios, ${config.ai_credits || 0} créditos IA`,
      metadata: {
        organization_id: String(organizationId),
        modules_count: String(config.modules_count),
        branches_count: String(config.branches_count),
        users_count: String(config.users_count),
        ai_credits: String(config.ai_credits || 0),
        billing_period: config.billing_period || 'monthly',
      },
    });

    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(calculatedPrice * 100),
      currency: 'usd',
      recurring: { interval: isYearly ? 'year' : 'month' },
    });

    const { error: updateError } = await supabase
      .from('subscriptions')
      .update({
        metadata: {
          custom_config: config,
          calculated_price_monthly: prices.monthly,
          calculated_price_yearly: prices.yearly,
          stripe_product_id: product.id,
          stripe_price_id: stripePrice.id,
          updated_at: new Date().toISOString(),
        },
        billing_period: config.billing_period || 'monthly',
      })
      .eq('id', subscription.id);

    if (updateError) {
      console.error('Error saving enterprise config:', updateError);
      return NextResponse.json(
        { error: 'Error al guardar configuración' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      config,
      calculated_price_monthly: prices.monthly,
      calculated_price_yearly: prices.yearly,
      stripe_product_id: product.id,
      stripe_price_id: stripePrice.id,
    });
  } catch (error: unknown) {
    return routeErrorResponse('organization/enterprise', error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await contextoDeFacturacion(searchParams.get('organizationId'), 'organization/enterprise');
    const organizationId = ctx.organizationId;

    const supabase = getSupabase();

    const { data: subscription, error } = await supabase
      .from('subscriptions')
      .select('metadata, plans(is_custom_enterprise)')
      .eq('organization_id', organizationId)
      .single();

    if (error || !subscription) {
      return NextResponse.json(
        { error: 'Suscripción no encontrada' },
        { status: 404 }
      );
    }

    const plans = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
    if (!plans?.is_custom_enterprise) {
      return NextResponse.json(
        { error: 'No es un plan Enterprise' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      config: subscription.metadata?.custom_config || null,
      calculated_price_monthly: subscription.metadata?.calculated_price_monthly || null,
      calculated_price_yearly: subscription.metadata?.calculated_price_yearly || null,
      stripe_price_id: subscription.metadata?.stripe_price_id || null,
    });
  } catch (error: unknown) {
    return routeErrorResponse('organization/enterprise', error);
  }
}
