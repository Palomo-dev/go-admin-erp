import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { stripeClientService } from '@/lib/services/integrations/stripe';

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
    const { secret_key } = body as { secret_key: string };

    if (!secret_key) {
      return NextResponse.json({ error: 'secret_key es requerido' }, { status: 400 });
    }

    const result = await stripeClientService.healthCheck(secret_key);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in Stripe health check:', error);
    return NextResponse.json(
      { valid: false, message: error instanceof Error ? error.message : 'Error al verificar' },
      { status: 500 }
    );
  }
}
