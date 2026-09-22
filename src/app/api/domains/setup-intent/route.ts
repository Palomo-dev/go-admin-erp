import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import {
  getServerOrgContext,
  OrgContextError,
  requireOrgAdminOrPermission,
} from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';

interface SetupIntentRequest {
  email?: unknown;
  name?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    await requireOrgAdminOrPermission(ctx);
    const body = await readOrgBody<SetupIntentRequest>(ctx, request, {
      route: 'domains/setup-intent',
    });
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ success: false, error: 'El correo no es válido.' }, { status: 400 });
    }
    if (!stripe) {
      return NextResponse.json({
        success: false,
        error: 'La verificación de pagos no está disponible temporalmente.',
      }, { status: 503 });
    }

    const existingCustomers = await stripe.customers.list({ email, limit: 100 });
    let customer = existingCustomers.data.find((item) =>
      item.metadata.organization_id === String(ctx.organizationId) &&
      item.metadata.user_id === ctx.userId
    );

    customer ??= await stripe.customers.create({
      email,
      name: name || undefined,
      metadata: {
        source: 'domain_purchase',
        organization_id: String(ctx.organizationId),
        user_id: ctx.userId,
      },
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata: {
        purpose: 'domain_purchase',
        organization_id: String(ctx.organizationId),
        user_id: ctx.userId,
      },
    });

    return NextResponse.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
    });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[domains/setup-intent] Error inesperado', error);
    return NextResponse.json({
      success: false,
      error: 'No pudimos iniciar la verificación del método de pago.',
    }, { status: 500 });
  }
}

