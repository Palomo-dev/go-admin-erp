import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { mercadopagoService } from '@/lib/services/integrations/mercadopago';
import type { CreatePaymentRequest } from '@/lib/services/integrations/mercadopago';

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
    const { connection_id, payment_data } = body as {
      connection_id: string;
      payment_data: CreatePaymentRequest;
    };

    if (!connection_id || !payment_data) {
      return NextResponse.json(
        { error: 'connection_id y payment_data son requeridos' },
        { status: 400 }
      );
    }

    // Obtener credenciales
    const credentials = await mercadopagoService.getCredentials(connection_id);
    if (!credentials?.accessToken) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de MercadoPago para esta conexión' },
        { status: 404 }
      );
    }

    // Crear pago
    const payment = await mercadopagoService.createPayment(
      credentials.accessToken,
      payment_data
    );

    return NextResponse.json({ success: true, data: payment });
  } catch (error) {
    console.error('Error creating MercadoPago payment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear el pago' },
      { status: 500 }
    );
  }
}
