/**
 * API Endpoint: Crear suscripción de addon (usuarios/sucursales extra)
 * GO Admin ERP - Addons recurrentes mensuales
 *
 * Crea una sesión de Stripe Checkout (mode: subscription) para que
 * el usuario compre usuarios o sucursales adicionales.
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

const FALLBACK_PRICES: Record<string, number> = {
  extra_users: 1000,
  extra_branches: 800,
};

export async function POST(request: NextRequest) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe no está configurado. Verifica STRIPE_SECRET_KEY.' },
        { status: 500 }
      );
    }

    const cookieHeader = request.headers.get('cookie') || '';
    let userId: string | null = null;

    const userIdMatch = cookieHeader.match(/sb-user-id=([^;]+)/);
    if (userIdMatch) {
      try {
        userId = decodeURIComponent(userIdMatch[1]);
      } catch {
        userId = userIdMatch[1];
      }
    }

    const effectiveUserId = userId || '00000000-0000-0000-0000-000000000000';
    const supabase = createSupabaseClient();

    const { organizationId, addonType, quantity } = await request.json();

    if (!organizationId || !addonType || !quantity || quantity < 1) {
      return NextResponse.json(
        { error: 'Parámetros inválidos: organizationId, addonType y quantity (min 1) son requeridos' },
        { status: 400 }
      );
    }

    if (!['extra_users', 'extra_branches'].includes(addonType)) {
      return NextResponse.json(
        { error: 'addonType debe ser "extra_users" o "extra_branches"' },
        { status: 400 }
      );
    }

    // Obtener el plan actual de la organización
    const { data: planData } = await supabase
      .rpc('get_current_plan', { org_id: organizationId });

    const planCode = planData?.[0]?.plan_code || planData?.[0]?.code || 'free';

    // Obtener precio del addon desde addon_pricing
    const { data: addonPricing } = await supabase
      .from('addon_pricing')
      .select('unit_price_monthly_cents, currency, min_quantity, max_quantity')
      .eq('plan_code', planCode)
      .eq('addon_type', addonType)
      .eq('is_active', true)
      .single();

    const unitPriceCents = addonPricing?.unit_price_monthly_cents || FALLBACK_PRICES[addonType];
    const currency = addonPricing?.currency || 'usd';
    const maxQty = addonPricing?.max_quantity;

    if (maxQty && quantity > maxQty) {
      return NextResponse.json(
        { error: `La cantidad máxima para este addon es ${maxQty}` },
        { status: 400 }
      );
    }

    if (quantity < (addonPricing?.min_quantity || 1)) {
      return NextResponse.json(
        { error: `La cantidad mínima es ${addonPricing?.min_quantity || 1}` },
        { status: 400 }
      );
    }

    const totalPriceCents = unitPriceCents * quantity;

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
      } catch {
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

    // Crear producto y precio recurrente (mensual) para el addon
    const addonLabel = addonType === 'extra_users' ? 'Usuarios Extra' : 'Sucursales Extra';

    const product = await stripe.products.create({
      name: `${addonLabel} - ${quantity} unidad(es)`,
      description: `Suscripción mensual de ${quantity} ${addonLabel.toLowerCase()} para GO Admin ERP`,
      metadata: {
        organization_id: String(organizationId),
        addon_type: addonType,
        quantity: String(quantity),
        type: 'addon_subscription',
      },
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: totalPriceCents,
      currency: currency,
      recurring: {
        interval: 'month',
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const successUrl = `${baseUrl}/app/organizacion/plan?addon=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/app/organizacion/plan?addon=canceled`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: {
        organizationId: organizationId.toString(),
        addonType,
        quantity: quantity.toString(),
        unitPriceCents: unitPriceCents.toString(),
        totalPriceCents: totalPriceCents.toString(),
        type: 'addon_subscription',
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

    // Registrar el addon como pendiente en la BD
    await supabase.from('subscription_addons').insert({
      organization_id: organizationId,
      addon_type: addonType,
      quantity,
      unit_price_cents: unitPriceCents,
      currency,
      stripe_price_id: price.id,
      stripe_checkout_session_id: session.id,
      status: 'pending',
      created_by: effectiveUserId,
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error: any) {
    console.error('❌ Error creando checkout session para addon:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
