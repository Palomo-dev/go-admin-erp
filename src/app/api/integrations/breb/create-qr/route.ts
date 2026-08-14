// ============================================================
// POST /api/integrations/breb/create-qr
// Genera un QR de pago Bre-B via Mono (crea una collection)
// y registra la sesion QR en BD
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { monoService } from '@/lib/services/integrations/breb';
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
  keyValue: string;
  keyType?: string;
  expiresInSeconds?: number;
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
      !body.organizationId ||
      !body.keyValue
    ) {
      return NextResponse.json(
        {
          error:
            'Faltan campos requeridos: connectionId, amount, currency, reference, organizationId, keyValue',
        },
        { status: 400 }
      );
    }

    // 1. Crear collection en Mono
    const keyType = (body.keyType || 'ALPHA') as 'PHONE' | 'EMAIL' | 'ID' | 'ALPHA' | 'BCODE';
    const qrResponse = await monoService.createCollection(body.connectionId, {
      amount: body.amount,
      currency: body.currency,
      key_type: keyType,
      key_value: body.keyValue as string,
      description: body.description ?? body.reference,
      expires_in: body.expiresInSeconds || 900,
      metadata: {
        reference: body.reference,
        source: body.source,
        sourceId: body.sourceId,
        organizationId: body.organizationId,
        branchId: body.branchId,
      },
    });

    if (!qrResponse) {
      return NextResponse.json(
        { error: 'Error al generar QR en Mono (Bre-B)' },
        { status: 502 }
      );
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: body.organizationId,
      branchId: body.branchId,
      providerCode: 'breb',
      connectorCode: 'breb_mono',
      integrationConnectionId: body.connectionId,
      reference: body.reference,
      externalQrId: qrResponse.id,
      qrData: qrResponse.qr,
      qrImageUrl: qrResponse.qr_image,
      amount: body.amount,
      currency: body.currency,
      source: body.source,
      sourceId: body.sourceId,
      expiresAt: qrResponse.expires_at,
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
    console.error('[API BreB CreateQR] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
