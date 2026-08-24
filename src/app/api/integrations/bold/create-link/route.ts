// ============================================================
// POST /api/integrations/bold/create-link
// Genera un link de pago Bold y registra la sesion QR en BD.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { boldService } from '@/lib/services/integrations/bold';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';

interface CreateLinkBody {
  connectionId: string;
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  payment_methods?: string[];
  callback_url?: string;
  payer_email?: string;
  expiresInSeconds?: number;
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

    const body: CreateLinkBody = await request.json();

    // Validaciones basicas
    if (
      !body.connectionId ||
      !body.amount ||
      !body.currency ||
      !body.reference ||
      !body.organizationId
    ) {
      return NextResponse.json(
        {
          error:
            'Faltan campos requeridos: connectionId, amount, currency, reference, organizationId',
        },
        { status: 400 }
      );
    }

    // 1. Crear link de pago en Bold
    const linkResponse = await boldService.createPaymentLink(
      body.connectionId,
      {
        amount: body.amount,
        currency: body.currency,
        reference: body.reference,
        description: body.description ?? body.reference,
        payment_methods: body.payment_methods,
        callback_url: body.callback_url,
        payer_email: body.payer_email,
        expires_in: body.expiresInSeconds,
        metadata: {
          source: body.source,
          sourceId: body.sourceId,
          organizationId: body.organizationId,
          branchId: body.branchId,
        },
      }
    );

    if (!linkResponse) {
      return NextResponse.json(
        { error: 'Error al generar link de pago en Bold' },
        { status: 502 }
      );
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: body.organizationId,
      branchId: body.branchId,
      providerCode: 'bold_link',
      connectorCode: 'bold',
      integrationConnectionId: body.connectionId,
      reference: body.reference,
      externalQrId: linkResponse.link_id,
      qrImageUrl: linkResponse.payment_url,
      amount: body.amount,
      currency: body.currency,
      source: body.source,
      sourceId: body.sourceId,
      expiresAt: linkResponse.expires_at,
    });

    if (!qrSession) {
      return NextResponse.json(
        { error: 'Link generado pero fallo el registro de sesion QR' },
        { status: 500 }
      );
    }

    // 3. Retornar respuesta del proveedor y sesion
    return NextResponse.json({
      payment_url: linkResponse.payment_url,
      link_id: linkResponse.link_id,
      qr_session_id: qrSession.id,
      expires_at: linkResponse.expires_at,
      reference: body.reference,
    });
  } catch (err) {
    console.error('[API Bold CreateLink] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
