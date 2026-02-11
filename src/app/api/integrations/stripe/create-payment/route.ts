import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripeClientService } from '@/lib/services/integrations/stripe';
import type { CreatePaymentIntentParams } from '@/lib/services/integrations/stripe';

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
    const { connection_id, ...paymentParams } = body as {
      connection_id: string;
    } & CreatePaymentIntentParams;

    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id es requerido' }, { status: 400 });
    }

    if (!paymentParams.amount || !paymentParams.currency) {
      return NextResponse.json({ error: 'amount y currency son requeridos' }, { status: 400 });
    }

    const credentials = await stripeClientService.getCredentials(connection_id);
    if (!credentials?.secretKey) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de Stripe para esta conexión' },
        { status: 404 }
      );
    }

    const result = await stripeClientService.createPaymentIntent(
      credentials.secretKey,
      paymentParams
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating Stripe payment intent:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear el pago' },
      { status: 500 }
    );
  }
}
