import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { paypalService } from '@/lib/services/integrations/paypal';

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
    const { connection_id, order_id, is_sandbox } = body as {
      connection_id: string;
      order_id: string;
      is_sandbox?: boolean;
    };

    if (!connection_id || !order_id) {
      return NextResponse.json(
        { error: 'connection_id y order_id son requeridos' },
        { status: 400 }
      );
    }

    const credentials = await paypalService.getCredentials(connection_id);
    if (!credentials?.clientId || !credentials?.clientSecret) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de PayPal para esta conexión' },
        { status: 404 }
      );
    }

    const result = await paypalService.captureOrder(credentials, order_id, is_sandbox ?? true);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error capturing PayPal order:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al capturar la orden' },
      { status: 500 }
    );
  }
}
