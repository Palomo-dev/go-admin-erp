import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripeClientService } from '@/lib/services/integrations/stripe';
import type { CreateCheckoutSessionParams } from '@/lib/services/integrations/stripe';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, ...checkoutParams } = body as {
      connection_id: string;
    } & CreateCheckoutSessionParams;

    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id es requerido' }, { status: 400 });
    }

    if (!checkoutParams.lineItems || !checkoutParams.successUrl || !checkoutParams.cancelUrl) {
      return NextResponse.json(
        { error: 'lineItems, successUrl y cancelUrl son requeridos' },
        { status: 400 }
      );
    }

    const credentials = await stripeClientService.getCredentials(connection_id);
    if (!credentials?.secretKey) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de Stripe para esta conexión' },
        { status: 404 }
      );
    }

    const result = await stripeClientService.createCheckoutSession(
      credentials.secretKey,
      checkoutParams
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating Stripe checkout session:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear la sesión de checkout' },
      { status: 500 }
    );
  }
}
