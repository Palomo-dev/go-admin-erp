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
import { contextoDeFacturacion } from '@/lib/stripe/contextoFacturacion';
import { routeErrorResponse } from '@/lib/security/orgGuards';
import { precioComplemento, type TipoComplemento } from '@/lib/stripe/preciosCompras';

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
      );
    }

    let body: { organizationId?: unknown; addonType?: unknown; quantity?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    // GO-sec (2026-09-24): sesión + membresía + permiso de facturación. Antes
    // no había autenticación (`/api/stripe/` está fuera del middleware) y el
    // usuario salía de una cookie `sb-user-id` que controla el navegador.
    const ctx = await contextoDeFacturacion(body.organizationId, 'stripe/create-addon-subscription');
    const organizationId = ctx.organizationId;
    const effectiveUserId = ctx.userId;
    const addonType = typeof body.addonType === 'string' ? body.addonType : '';
    const quantity = Number(body.quantity);

    // Service role SOLO después de la comprobación.
    const supabase = createSupabaseClient();

    if (!addonType || !Number.isInteger(quantity) || quantity < 1) {
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

    // Precio: la misma función que muestra el desglose del diálogo de compra
    // (`/api/organizacion/compras/precio`), para no cobrar otro número.
    const precio = await precioComplemento(supabase, organizationId, addonType as TipoComplemento);
    const unitPriceCents = precio.unitarioCentavos;
    const currency = precio.moneda;
    const maxQty = precio.maximo;

    if (maxQty && quantity > maxQty) {
      return NextResponse.json(
        { error: `La cantidad máxima para este addon es ${maxQty}` },
        { status: 400 }
      );
    }

    if (quantity < precio.minimo) {
      return NextResponse.json(
        { error: `La cantidad mínima es ${precio.minimo}` },
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
  } catch (error: unknown) {
    return routeErrorResponse('stripe/create-addon-subscription', error);
  }
}
