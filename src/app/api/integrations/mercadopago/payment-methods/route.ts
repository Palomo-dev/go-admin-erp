import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { mercadopagoService } from '@/lib/services/integrations/mercadopago';

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

    const credentials = await mercadopagoService.getCredentials(connectionId);
    if (!credentials?.accessToken) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de MercadoPago' },
        { status: 404 }
      );
    }

    const methods = await mercadopagoService.getPaymentMethods(credentials.accessToken);

    return NextResponse.json({ success: true, data: methods });
  } catch (error) {
    console.error('Error fetching MercadoPago payment methods:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al obtener métodos de pago' },
      { status: 500 }
    );
  }
}
