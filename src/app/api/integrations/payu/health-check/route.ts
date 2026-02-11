import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { payuService } from '@/lib/services/integrations/payu';

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
    const { api_key, api_login, merchant_id, is_test } = body as {
      api_key: string;
      api_login: string;
      merchant_id: string;
      is_test?: boolean;
    };

    if (!api_key || !api_login) {
      return NextResponse.json({ error: 'api_key y api_login son requeridos' }, { status: 400 });
    }

    const result = await payuService.healthCheck(
      { apiKey: api_key, apiLogin: api_login, merchantId: merchant_id || '', accountId: '' },
      is_test ?? false
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in PayU health check:', error);
    return NextResponse.json(
      { valid: false, message: error instanceof Error ? error.message : 'Error al verificar' },
      { status: 500 }
    );
  }
}
