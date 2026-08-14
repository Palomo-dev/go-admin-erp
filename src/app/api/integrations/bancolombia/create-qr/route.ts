// ============================================================
// POST /api/integrations/bancolombia/create-qr
// Registra una intencion de transferencia en Bancolombia (genera QR/Boton)
// y registra la sesion QR en BD
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { bancolombiaService } from '@/lib/services/integrations/bancolombia';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';

interface CreateQrBody {
  connectionId: string;
  amount: number;
  currency: string;
  reference: string;
  description?: string;
  source?: string;
  sourceId?: string;
  branchId?: number;
  organizationId: number;
  commerceUrl?: string;
  expiresInSeconds?: number;
}

/** Convierte expiresInSeconds a fecha ISO de expiracion (default 15 min). */
function calcExpiresAt(expiresInSeconds?: number): string {
  const seconds = expiresInSeconds && expiresInSeconds > 0 ? expiresInSeconds : 900;
  const date = new Date();
  date.setSeconds(date.getSeconds() + seconds);
  return date.toISOString();
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

    const body: CreateQrBody = await request.json();

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

    const expiresAt = calcExpiresAt(body.expiresInSeconds);

    // 1. Construir URL de confirmacion (webhook) para Bancolombia
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://erp.go-admin.co';
    const confirmationURL = `${siteUrl}/api/integrations/bancolombia/webhook?connectionId=${body.connectionId}`;

    // 2. Registrar intencion de transferencia en Bancolombia
    // commerceTransferButtonId se obtiene de las credenciales dentro del servicio
    const qrResponse = await bancolombiaService.registerTransferIntention(
      body.connectionId,
      {
        transferReference: body.reference,
        transferDescription: body.description ?? body.reference,
        transferAmount: body.amount,
        commerceUrl: body.commerceUrl || siteUrl,
        confirmationURL,
      }
    );

    if (!qrResponse) {
      return NextResponse.json(
        { error: 'Error al registrar intencion de transferencia en Bancolombia' },
        { status: 502 }
      );
    }

    // 3. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: body.organizationId,
      branchId: body.branchId,
      providerCode: 'bancolombia',
      connectorCode: 'bancolombia_qr',
      integrationConnectionId: body.connectionId,
      reference: body.reference,
      externalQrId: qrResponse.transferCode,
      qrData: qrResponse.redirectURL,
      amount: body.amount,
      currency: body.currency,
      source: body.source,
      sourceId: body.sourceId,
      expiresAt,
    });

    if (!qrSession) {
      return NextResponse.json(
        { error: 'Intencion registrada pero fallo el registro de sesion QR' },
        { status: 500 }
      );
    }

    // 4. Retornar sesion y respuesta del proveedor
    return NextResponse.json({
      qrSession,
      qr: qrResponse,
    });
  } catch (err) {
    console.error('[API Bancolombia CreateQR] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
