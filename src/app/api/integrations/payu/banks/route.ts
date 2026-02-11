import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { payuService } from '@/lib/services/integrations/payu';
import { detectEnvironment } from '@/lib/services/integrations/payu/payuConfig';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const connectionId = request.nextUrl.searchParams.get('connection_id');
    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id es requerido' }, { status: 400 });
    }

    const credentials = await payuService.getCredentials(connectionId);
    if (!credentials?.apiKey || !credentials?.apiLogin) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de PayU' },
        { status: 404 }
      );
    }

    const isTest = detectEnvironment(credentials.merchantId) === 'sandbox';
    const result = await payuService.getPSEBanks(credentials, isTest);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching PayU PSE banks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al obtener bancos PSE' },
      { status: 500 }
    );
  }
}
