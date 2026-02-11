import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { payuService } from '@/lib/services/integrations/payu';
import type { PayUTransaction } from '@/lib/services/integrations/payu';
import { detectEnvironment } from '@/lib/services/integrations/payu/payuConfig';

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
    const { connection_id, transaction } = body as {
      connection_id: string;
      transaction: PayUTransaction;
    };

    if (!connection_id || !transaction) {
      return NextResponse.json(
        { error: 'connection_id y transaction son requeridos' },
        { status: 400 }
      );
    }

    const credentials = await payuService.getCredentials(connection_id);
    if (!credentials?.apiKey || !credentials?.apiLogin) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de PayU para esta conexión' },
        { status: 404 }
      );
    }

    const isTest = detectEnvironment(credentials.merchantId) === 'sandbox';
    const result = await payuService.createPayment(credentials, transaction, isTest);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error creating PayU payment:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al crear el pago' },
      { status: 500 }
    );
  }
}
