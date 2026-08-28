// ============================================================
// GET /api/integrations/bold/status
// Consulta el estado de una sesion QR de Bold (usado por QrPoller).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getQrSessionByReference } from '@/lib/services/integrations/qrShared/qrSessionService';
import { boldService } from '@/lib/services/integrations/bold';

export async function GET(request: NextRequest) {
  try {
    // Verificar autenticacion
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Leer query params
    const { searchParams } = new URL(request.url);
    const reference = searchParams.get('reference');
    const organizationIdParam = searchParams.get('organizationId');

    if (!reference || !organizationIdParam) {
      return NextResponse.json(
        { error: 'Faltan parametros: reference, organizationId' },
        { status: 400 }
      );
    }

    const organizationId = parseInt(organizationIdParam, 10);
    if (Number.isNaN(organizationId)) {
      return NextResponse.json(
        { error: 'organizationId debe ser un numero valido' },
        { status: 400 }
      );
    }

    // 1. Buscar sesion QR por referencia y organizacion
    const qrSession = await getQrSessionByReference(organizationId, reference);
    if (!qrSession) {
      return NextResponse.json(
        { error: 'Sesion QR no encontrada' },
        { status: 404 }
      );
    }

    // 2. Si sigue pendiente, consultar estado a Bold (opcional)
    if (
      qrSession.status === 'pending' &&
      qrSession.integration_connection_id &&
      qrSession.external_qr_id
    ) {
      try {
        const txStatus = await boldService.getPaymentStatus(
          qrSession.integration_connection_id,
          qrSession.external_qr_id
        );

        // Si el proveedor indica pago, reflejarlo en la respuesta
        if (txStatus?.status === 'approved' || txStatus?.status === 'paid') {
          return NextResponse.json({
            status: 'paid',
            reference,
            amount: qrSession.amount,
            paid_at: txStatus.paid_at ?? new Date().toISOString(),
          });
        }
      } catch (pollErr) {
        // Si falla la consulta al proveedor, continuar con el estado local
        console.error('[API Bold Status] Error consultando proveedor:', pollErr);
      }
    }

    // 3. Retornar estado actual de la sesion
    return NextResponse.json({
      status: qrSession.status,
      reference,
      amount: qrSession.amount,
      paid_at: qrSession.paid_at ?? undefined,
    });
  } catch (err) {
    console.error('[API Bold Status] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
