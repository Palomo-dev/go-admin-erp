// ============================================================
// POST /api/integrations/redeban/create-qr
// Genera un QR de pago Redeban y registra la sesion QR
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redebanService } from '@/lib/services/integrations/redeban';
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
  expiresInSeconds?: number;
}

/** Convierte expiresInSeconds a fecha ISO de expiracion. */
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
    if (!body.connectionId || !body.amount || !body.currency || !body.reference || !body.organizationId) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: connectionId, amount, currency, reference, organizationId' },
        { status: 400 }
      );
    }

    const expiresAt = calcExpiresAt(body.expiresInSeconds);

    // 1. Crear QR en Redeban
    const qrResponse = await redebanService.createQr(body.connectionId, {
      amount: body.amount,
      currency: body.currency,
      reference: body.reference,
      description: body.description ?? body.reference,
      expiresAt,
    });

    if (!qrResponse) {
      return NextResponse.json(
        { error: 'Error al generar QR en Redeban' },
        { status: 502 }
      );
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: body.organizationId,
      branchId: body.branchId,
      providerCode: 'redeban',
      connectorCode: 'redeban_qr',
      integrationConnectionId: body.connectionId,
      reference: body.reference,
      externalQrId: qrResponse.id,
      qrData: qrResponse.qr_string,
      qrImageUrl: qrResponse.qr_image_base64,
      amount: body.amount,
      currency: body.currency,
      source: body.source,
      sourceId: body.sourceId,
      expiresAt,
    });

    if (!qrSession) {
      return NextResponse.json(
        { error: 'QR generado pero fallo el registro de sesion QR' },
        { status: 500 }
      );
    }

    // 3. Retornar sesion y respuesta del proveedor
    return NextResponse.json({
      qrSession,
      qr: qrResponse,
    });
  } catch (err) {
    console.error('[API Redeban CreateQR] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
