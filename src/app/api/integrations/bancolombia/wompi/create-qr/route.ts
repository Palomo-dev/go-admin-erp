// ============================================================
// POST /api/integrations/bancolombia/wompi/create-qr
// Genera un QR Bancolombia via Wompi (BANCOLOMBIA_QR)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { wompiService } from '@/lib/services/integrations/wompi';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';

interface CreateQrBody {
  connectionId: string;
  amount: number;
  currency: string;
  reference: string;
  description: string;
  customerEmail: string;
  source: string;
  sourceId: string;
  branchId: number;
  organizationId: number;
  expiresInSeconds?: number;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body: CreateQrBody = await request.json();

    if (
      !body.connectionId ||
      !body.amount ||
      !body.currency ||
      !body.reference ||
      !body.organizationId ||
      !body.customerEmail
    ) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: connectionId, amount, currency, reference, organizationId, customerEmail' },
        { status: 400 }
      );
    }

    // 1. Obtener credenciales de Wompi
    const credentials = await wompiService.getCredentials(body.connectionId);
    if (!credentials) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de Wompi para esta conexion' },
        { status: 404 }
      );
    }

    // 2. Obtener tokens de aceptacion
    const acceptanceTokens = await wompiService.getAcceptanceTokens(credentials);
    if (!acceptanceTokens) {
      return NextResponse.json(
        { error: 'No se pudieron obtener tokens de aceptacion de Wompi' },
        { status: 502 }
      );
    }

    // 3. Calcular expiracion (default 15 min)
    const expiresInSeconds = body.expiresInSeconds || 900;
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + expiresInSeconds);
    const expirationTime = expiresAt.toISOString();

    // 4. Generar firma de integridad
    const amountInCents = Math.round(body.amount * 100);
    const signature = wompiService.generateIntegritySignature(
      body.reference,
      amountInCents,
      'COP',
      credentials.integritySecret,
      expirationTime
    );

    // 5. Crear transaccion BANCOLOMBIA_QR en Wompi
    const result = await wompiService.createTransaction(credentials, {
      acceptance_token: acceptanceTokens.acceptanceToken,
      accept_personal_auth: acceptanceTokens.acceptPersonalAuth,
      amount_in_cents: amountInCents,
      currency: 'COP',
      customer_email: body.customerEmail,
      reference: body.reference,
      signature,
      payment_method: {
        type: 'BANCOLOMBIA_QR',
        payment_description: body.description ?? body.reference,
      },
      payment_method_type: 'BANCOLOMBIA_QR',
      expiration_time: expirationTime,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Error al crear transaccion BANCOLOMBIA_QR en Wompi' },
        { status: 502 }
      );
    }

    // 6. Extraer QR de payment_method.extra
    const extra = result.data.payment_method?.extra as Record<string, unknown> | undefined;
    const qrImage = (extra?.qr_image as string) || null;
    const qrId = (extra?.qr_id as string) || null;

    // 7. Registrar sesion QR
    const qrSession = await createQrSession({
      organizationId: body.organizationId,
      branchId: body.branchId,
      providerCode: 'wompi',
      connectorCode: 'bancolombia_qr_wompi',
      integrationConnectionId: body.connectionId,
      reference: body.reference,
      externalQrId: qrId || result.data.id,
      qrData: qrImage ?? undefined,
      qrImageUrl: qrImage ?? undefined,
      amount: body.amount,
      currency: body.currency,
      source: body.source,
      sourceId: body.sourceId,
      expiresAt: expiresAt.toISOString(),
    });

    return NextResponse.json({
      qrSession,
      qr: {
        id: result.data.id,
        qr_id: qrId,
        qr_image: qrImage,
        status: result.data.status,
        reference: body.reference,
      },
    });
  } catch (err) {
    console.error('[API Bancolombia Wompi QR] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
