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
    const { client_id, client_secret, is_sandbox } = body as {
      client_id: string;
      client_secret: string;
      is_sandbox?: boolean;
    };

    if (!client_id || !client_secret) {
      return NextResponse.json(
        { error: 'client_id y client_secret son requeridos' },
        { status: 400 }
      );
    }

    const result = await paypalService.healthCheck(
      client_id,
      client_secret,
      is_sandbox ?? true
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in PayPal health check:', error);
    return NextResponse.json(
      { valid: false, message: error instanceof Error ? error.message : 'Error al verificar' },
      { status: 500 }
    );
  }
}
