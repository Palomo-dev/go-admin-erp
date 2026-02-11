/**
 * API para comprar dominios usando Vercel Registrar + Stripe para cobro
 */

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@supabase/supabase-js';

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_frIu9xHSNGKf7olF1x4Fsvfh';

// Supabase admin client (lazy init para evitar error en build time)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PurchaseRequest {
  domain: string;
  organizationId: number;
  expectedPrice: number;
  stripePaymentMethodId: string;
  stripeCustomerId: string;
  contactInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: PurchaseRequest = await request.json();
    const { 
      domain, 
      organizationId, 
      expectedPrice, 
      stripePaymentMethodId, 
      stripeCustomerId,
      contactInfo 
    } = body;

    // Validaciones
    if (!domain || !organizationId) {
      return NextResponse.json(
        { success: false, error: 'Dominio y organizationId son requeridos' },
        { status: 400 }
      );
    }

    if (!stripePaymentMethodId || !stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: 'Método de pago requerido' },
        { status: 400 }
      );
    }

    if (!VERCEL_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'VERCEL_API_TOKEN no configurado' },
        { status: 500 }
      );
    }

    if (!stripe) {
      return NextResponse.json(
        { success: false, error: 'Stripe no configurado' },
        { status: 500 }
      );
    }

    const normalizedDomain = domain.toLowerCase().trim();

    // PASO 1: Cobrar con Stripe
    console.log('💳 Procesando pago con Stripe...');
    
    const priceInCents = Math.round(expectedPrice * 100);
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount: priceInCents,
      currency: 'usd',
      customer: stripeCustomerId,
      payment_method: stripePaymentMethodId,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never',
      },
      metadata: {
        type: 'domain_purchase',
        domain: normalizedDomain,
        organization_id: organizationId.toString(),
      },
      description: `Compra de dominio: ${normalizedDomain}`,
    });

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({
        success: false,
        error: 'El pago no pudo ser procesado',
        paymentStatus: paymentIntent.status,
      }, { status: 400 });
    }

    console.log('✅ Pago exitoso:', paymentIntent.id);

    // PASO 2: Comprar dominio con Vercel
    console.log('🌐 Comprando dominio con Vercel...');

    const vercelResponse = await fetch(
      `https://api.vercel.com/v1/registrar/domains/${normalizedDomain}/buy?teamId=${VERCEL_TEAM_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${VERCEL_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          autoRenew: true,
          years: 1,
          expectedPrice: expectedPrice,
          contactInformation: {
            firstName: contactInfo.firstName,
            lastName: contactInfo.lastName,
            email: contactInfo.email,
            phone: contactInfo.phone,
            address1: contactInfo.address1,
            city: contactInfo.city,
            state: contactInfo.state,
            zip: contactInfo.zip,
            country: contactInfo.country,
          },
        }),
      }
    );

    if (!vercelResponse.ok) {
      const errorData = await vercelResponse.json().catch(() => ({}));
      console.error('❌ Error de Vercel:', errorData);
      
      // Si falla Vercel, reembolsar Stripe
      console.log('💰 Reembolsando pago...');
      await stripe.refunds.create({
        payment_intent: paymentIntent.id,
        reason: 'requested_by_customer',
      });
      
      return NextResponse.json({
        success: false,
        error: errorData.message || 'Error al registrar el dominio con Vercel',
        refunded: true,
      }, { status: 400 });
    }

    const vercelData = await vercelResponse.json();
    console.log('✅ Dominio comprado en Vercel:', vercelData);

    // PASO 3: Registrar en Supabase
    console.log('💾 Registrando en base de datos...');

    const supabaseAdmin = getSupabaseAdmin();
    const { data: domainRecord, error: dbError } = await supabaseAdmin
      .from('organization_domains')
      .insert({
        organization_id: organizationId,
        host: normalizedDomain,
        domain_type: 'custom_domain',
        status: 'verified',
        is_primary: false,
        is_active: true,
        verified_at: new Date().toISOString(),
        vercel_domain_id: vercelData.id || null,
        metadata: {
          purchase_date: new Date().toISOString(),
          stripe_payment_intent: paymentIntent.id,
          price_paid: expectedPrice,
          auto_renew: true,
          expires_at: vercelData.expiresAt || null,
        },
      })
      .select()
      .single();

    if (dbError) {
      console.error('⚠️ Error guardando en DB (dominio ya comprado):', dbError);
    }

    // Registrar transacción de compra (ignorar si la tabla no existe)
    try {
      await getSupabaseAdmin()
        .from('domain_purchases')
        .insert({
          organization_id: organizationId,
          domain: normalizedDomain,
          amount: expectedPrice,
          currency: 'USD',
          stripe_payment_intent_id: paymentIntent.id,
          vercel_order_id: vercelData.orderId || null,
          status: 'completed',
        });
    } catch (purchaseLogError) {
      console.log('Tabla domain_purchases no existe o error:', purchaseLogError);
    }

    return NextResponse.json({
      success: true,
      domain: normalizedDomain,
      message: 'Dominio comprado exitosamente',
      paymentIntentId: paymentIntent.id,
      domainId: domainRecord?.id,
      expiresAt: vercelData.expiresAt,
    });

  } catch (error: unknown) {
    console.error('❌ Error en purchase domain:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
