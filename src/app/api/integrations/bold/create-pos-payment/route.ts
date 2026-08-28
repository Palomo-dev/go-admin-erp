// ============================================================
// POST /api/integrations/bold/create-pos-payment
// Crea un pago POS en Bold (terminal fisica) y registra la sesion QR.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { boldService } from '@/lib/services/integrations/bold';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';

interface CreatePosPaymentBody {
  connectionId: string;
  amount: number;
  currency: string;
  reference: string;
  payment_method: string;
  terminal_model: string;
  terminal_serial: string;
  user_email: string;
  description?: string;
  source?: string;
  sourceId?: string;
  branchId?: number;
  organizationId: number;
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticacion
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body: CreatePosPaymentBody = await request.json();

    // Validaciones basicas
    if (
      !body.connectionId ||
      !body.amount ||
      !body.currency ||
      !body.reference ||
      !body.payment_method ||
      !body.terminal_serial ||
      !body.user_email ||
      !body.organizationId
    ) {
      return NextResponse.json(
        {
          error:
            'Faltan campos requeridos: connectionId, amount, currency, reference, payment_method, terminal_serial, user_email, organizationId',
        },
        { status: 400 }
      );
    }

    // 1. Crear pago POS en Bold
    const posResponse = await boldService.createPosPayment(
      body.connectionId,
      {
        amount: body.amount,
        currency: body.currency,
        reference: body.reference,
        payment_method: body.payment_method,
        terminal_model: body.terminal_model,
        terminal_serial: body.terminal_serial,
        user_email: body.user_email,
        description: body.description ?? body.reference,
        metadata: {
          source: body.source,
          sourceId: body.sourceId,
          organizationId: body.organizationId,
          branchId: body.branchId,
        },
      }
    );

    if (!posResponse) {
      return NextResponse.json(
        { error: 'Error al crear pago POS en Bold' },
        { status: 502 }
      );
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: body.organizationId,
      branchId: body.branchId,
      providerCode: 'bold_pos',
      connectorCode: 'bold',
      integrationConnectionId: body.connectionId,
      reference: body.reference,
      externalQrId: posResponse.integration_id,
      amount: body.amount,
      currency: body.currency,
      source: body.source,
      sourceId: body.sourceId,
    });

    if (!qrSession) {
      return NextResponse.json(
        { error: 'Pago POS creado pero fallo el registro de sesion QR' },
        { status: 500 }
      );
    }

    // 3. Retornar respuesta del proveedor y sesion
    return NextResponse.json({
      integration_id: posResponse.integration_id,
      qr_session_id: qrSession.id,
      reference: body.reference,
    });
  } catch (err) {
    console.error('[API Bold CreatePosPayment] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
