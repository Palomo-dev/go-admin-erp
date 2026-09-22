/** Compra de dominios con Vercel Registrar y cobro en Stripe. */
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { getServiceClient } from '@/lib/supabase/server-service';
import {
  getServerOrgContext,
  OrgContextError,
  requireOrgAdminOrPermission,
} from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { normalizePhoneToE164 } from '@/lib/domains/phone';

const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'team_frIu9xHSNGKf7olF1x4Fsvfh';
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

interface PurchaseRequest {
  domain?: unknown;
  setupIntentId?: unknown;
  contactInfo?: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address1: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  }>;
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function getCurrentDomainPrice(domain: string): Promise<number | null> {
  const response = await fetch(
    `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(domain)}/price?years=1&teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`,
    { headers: { Authorization: `Bearer ${VERCEL_API_TOKEN}` } }
  );
  if (!response.ok) return null;
  const data = (await response.json()) as { purchasePrice?: unknown };
  const price = Number(data.purchasePrice);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx);
    const body = await readOrgBody<PurchaseRequest>(ctx, request, { route: 'domains/purchase' });
    const normalizedDomain = safeString(body.domain).toLowerCase();
    const setupIntentId = safeString(body.setupIntentId);
    const rawContact = body.contactInfo ?? {};
    const contactInfo = {
      firstName: safeString(rawContact.firstName),
      lastName: safeString(rawContact.lastName),
      email: safeString(rawContact.email),
      phone: normalizePhoneToE164(safeString(rawContact.phone)),
      address1: safeString(rawContact.address1),
      city: safeString(rawContact.city),
      state: safeString(rawContact.state),
      zip: safeString(rawContact.zip),
      country: safeString(rawContact.country).toUpperCase(),
    };

    if (!DOMAIN_PATTERN.test(normalizedDomain)) {
      return NextResponse.json({ success: false, error: 'El dominio no es válido.' }, { status: 400 });
    }
    if (!setupIntentId) {
      return NextResponse.json({ success: false, error: 'Debes verificar un método de pago.' }, { status: 400 });
    }
    if (!contactInfo.phone) {
      return NextResponse.json({
        success: false,
        code: 'INVALID_PHONE',
        error: 'Escribe el teléfono con código de país, por ejemplo +57 300 123 4567.',
      }, { status: 400 });
    }
    if (!contactInfo.firstName || !contactInfo.lastName || !contactInfo.email ||
        !contactInfo.address1 || !contactInfo.city || !contactInfo.state ||
        !contactInfo.zip || !/^[A-Z]{2}$/.test(contactInfo.country)) {
      return NextResponse.json({
        success: false,
        error: 'Completa correctamente todos los datos de contacto.',
      }, { status: 400 });
    }
    if (!VERCEL_API_TOKEN || !stripe) {
      console.error('[domains/purchase] Stripe o Vercel no están configurados');
      return NextResponse.json({
        success: false,
        error: 'La compra de dominios no está disponible temporalmente.',
      }, { status: 503 });
    }

    // Un reenvío tras una compra exitosa reutiliza el mismo PaymentIntent (clave
    // de idempotencia), Vercel rechaza el registro y se reembolsaría el pago
    // legítimo. Se corta antes de cobrar si el dominio ya está registrado.
    const supabaseAdmin = getServiceClient();
    const { data: existingDomain } = await supabaseAdmin
      .from('organization_domains')
      .select('id')
      .eq('host', normalizedDomain)
      .limit(1)
      .maybeSingle();
    if (existingDomain) {
      return NextResponse.json({
        success: false,
        code: 'DOMAIN_ALREADY_REGISTERED',
        error: 'Ese dominio ya está registrado.',
      }, { status: 409 });
    }

    // El precio se vuelve a consultar antes del cobro; nunca se confía en el navegador.
    const currentPrice = await getCurrentDomainPrice(normalizedDomain);
    if (currentPrice === null) {
      return NextResponse.json({
        success: false,
        error: 'No pudimos confirmar el precio actual del dominio. Intenta buscarlo de nuevo.',
      }, { status: 409 });
    }

    // Customer y método de pago salen del SetupIntent confirmado, no del body.
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const setupMetadata = setupIntent.metadata ?? {};
    if (
      setupIntent.status !== 'succeeded' || !setupIntent.customer || !setupIntent.payment_method ||
      setupMetadata.purpose !== 'domain_purchase' ||
      setupMetadata.organization_id !== String(ctx.organizationId) ||
      setupMetadata.user_id !== ctx.userId
    ) {
      return NextResponse.json({
        success: false,
        error: 'No pudimos verificar el método de pago.',
      }, { status: 400 });
    }
    const customerId = typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer.id;
    const paymentMethodId = typeof setupIntent.payment_method === 'string'
      ? setupIntent.payment_method
      : setupIntent.payment_method.id;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(currentPrice * 100),
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        type: 'domain_purchase',
        domain: normalizedDomain,
        organization_id: String(ctx.organizationId),
      },
      description: `Compra de dominio: ${normalizedDomain}`,
    }, { idempotencyKey: `domain:${ctx.organizationId}:${normalizedDomain}:${setupIntentId}` });

    if (paymentIntent.status !== 'succeeded') {
      return NextResponse.json({ success: false, error: 'El pago no pudo ser procesado.' }, { status: 400 });
    }

    const vercelResponse = await fetch(
      `https://api.vercel.com/v1/registrar/domains/${encodeURIComponent(normalizedDomain)}/buy?teamId=${encodeURIComponent(VERCEL_TEAM_ID)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${VERCEL_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoRenew: true,
          years: 1,
          expectedPrice: currentPrice,
          contactInformation: contactInfo,
        }),
      }
    );

    if (!vercelResponse.ok) {
      const errorData = await vercelResponse.json().catch(() => ({}));
      console.error('[domains/purchase] Vercel rechazó el registro', {
        status: vercelResponse.status,
        domain: normalizedDomain,
        error: errorData,
      });
      try {
        await stripe.refunds.create(
          { payment_intent: paymentIntent.id, reason: 'requested_by_customer' },
          { idempotencyKey: `domain-refund:${paymentIntent.id}` }
        );
      } catch (refundError) {
        console.error('[domains/purchase] Falló el reembolso automático', {
          paymentIntentId: paymentIntent.id,
          error: refundError,
        });
        return NextResponse.json({
          success: false,
          code: 'REFUND_PENDING',
          error: 'El dominio no se registró y el reembolso requiere revisión. Comunícate con soporte.',
          refundPending: true,
        }, { status: 502 });
      }
      return NextResponse.json({
        success: false,
        code: 'DOMAIN_REGISTRATION_FAILED',
        error: 'El dominio no se registró. El pago fue reembolsado automáticamente.',
        refunded: true,
      }, { status: 400 });
    }

    const vercelData = await vercelResponse.json();
    const { data: domainRecord, error: dbError } = await supabaseAdmin
      .from('organization_domains')
      .insert({
        organization_id: ctx.organizationId,
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
          price_paid: currentPrice,
          auto_renew: true,
          expires_at: vercelData.expiresAt || null,
        },
      }).select().single();
    if (dbError) console.error('[domains/purchase] Dominio comprado pero no guardado', dbError);

    const { error: purchaseLogError } = await supabaseAdmin.from('domain_purchases').insert({
      organization_id: ctx.organizationId,
      domain: normalizedDomain,
      amount: currentPrice,
      currency: 'USD',
      stripe_payment_intent_id: paymentIntent.id,
      vercel_order_id: vercelData.orderId || null,
      status: 'completed',
    });
    if (purchaseLogError) console.error('[domains/purchase] No se guardó el comprobante', purchaseLogError);

    return NextResponse.json({
      success: true,
      domain: normalizedDomain,
      message: 'Dominio comprado exitosamente',
      paymentIntentId: paymentIntent.id,
      domainId: domainRecord?.id,
      expiresAt: vercelData.expiresAt,
    });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[domains/purchase] Error inesperado', error);
    return NextResponse.json({
      success: false,
      error: 'No pudimos completar la compra. Intenta nuevamente.',
    }, { status: 500 });
  }
}
