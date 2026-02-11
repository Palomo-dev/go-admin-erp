// ============================================================
// POST /api/integrations/wompi/create-transaction
// Crea una transacción en Wompi desde el backend
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { wompiService } from '@/lib/services/integrations/wompi/wompiService';
import type {
  WompiPaymentMethod,
  WompiPaymentMethodType,
} from '@/lib/services/integrations/wompi/wompiTypes';

interface CreateTransactionBody {
  connectionId: string;
  amountInCents: number;
  customerEmail: string;
  reference?: string;
  paymentMethod: WompiPaymentMethod;
  paymentMethodType?: WompiPaymentMethodType;
  customerData?: {
    phone_number?: string;
    full_name?: string;
    legal_id?: string;
    legal_id_type?: string;
  };
  redirectUrl?: string;
  expirationTime?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body: CreateTransactionBody = await request.json();

    // Validaciones básicas
    if (!body.connectionId || !body.amountInCents || !body.customerEmail || !body.paymentMethod) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: connectionId, amountInCents, customerEmail, paymentMethod' },
        { status: 400 }
      );
    }

    if (body.amountInCents < 100) {
      return NextResponse.json(
        { error: 'El monto mínimo es 100 centavos (1 COP)' },
        { status: 400 }
      );
    }

    // Obtener credenciales de la conexión
    const credentials = await wompiService.getCredentials(body.connectionId);
    if (!credentials) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales para esta conexión' },
        { status: 404 }
      );
    }

    // Obtener tokens de aceptación (requeridos por ley colombiana)
    const acceptanceTokens = await wompiService.getAcceptanceTokens(credentials);
    if (!acceptanceTokens) {
      return NextResponse.json(
        { error: 'No se pudieron obtener tokens de aceptación de Wompi' },
        { status: 502 }
      );
    }

    // Obtener organization_id de la conexión para generar referencia
    const { data: connection } = await supabase
      .from('integration_connections')
      .select('organization_id')
      .eq('id', body.connectionId)
      .single();

    const orgId = connection?.organization_id || 0;
    const reference = body.reference || wompiService.generateReference(orgId);

    // Generar firma de integridad
    const signature = wompiService.generateIntegritySignature(
      reference,
      body.amountInCents,
      'COP',
      credentials.integritySecret,
      body.expirationTime
    );

    // Crear transacción
    const result = await wompiService.createTransaction(credentials, {
      acceptance_token: acceptanceTokens.acceptanceToken,
      accept_personal_auth: acceptanceTokens.acceptPersonalAuth,
      amount_in_cents: body.amountInCents,
      currency: 'COP',
      customer_email: body.customerEmail,
      reference,
      signature,
      payment_method: body.paymentMethod,
      payment_method_type: body.paymentMethodType,
      customer_data: body.customerData,
      redirect_url: body.redirectUrl,
      expiration_time: body.expirationTime,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Error al crear transacción en Wompi' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      transaction: result.data,
      reference,
    });
  } catch (err) {
    console.error('[API Wompi] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
