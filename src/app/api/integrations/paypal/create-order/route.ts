import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { paypalService } from '@/lib/services/integrations/paypal';
import type { CreateOrderParams } from '@/lib/services/integrations/paypal';

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
    const { connection_id, is_sandbox, ...orderParams } = body as {
      connection_id: string;
      is_sandbox?: boolean;
    } & CreateOrderParams;

    if (!connection_id) {
      return NextResponse.json({ error: 'connection_id es requerido' }, { status: 400 });
    }

    if (!orderParams.purchaseUnits || orderParams.purchaseUnits.length === 0) {
      return NextResponse.json({ error: 'purchaseUnits es requerido' }, { status: 400 });
    }

    const credentials = await paypalService.getCredentials(connection_id);
    if (!credentials?.clientId || !credentials?.clientSecret) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de PayPal para esta conexión' },
        { status: 404 }
      );
    }

    const result = await paypalService.createOrder(
      credentials,
      { intent: orderParams.intent || 'CAPTURE', ...orderParams },
      is_sandbox ?? true
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating PayPal order:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear la orden' },
      { status: 500 }
    );
  }
}
