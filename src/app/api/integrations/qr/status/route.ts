// ============================================================
// GET /api/integrations/qr/status
// Consulta el estado de una sesion QR (generico para todos los proveedores).
// Usado por QrPoller para hacer polling del estado de pago.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { getQrSessionByReference } from '@/lib/services/integrations/qrShared/qrSessionService';

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

    // Buscar sesion QR por referencia y organizacion
    const qrSession = await getQrSessionByReference(organizationId, reference);
    if (!qrSession) {
      return NextResponse.json(
        { error: 'Sesion QR no encontrada' },
        { status: 404 }
      );
    }

    // Retornar estado actual de la sesion
    return NextResponse.json({
      status: qrSession.status,
      reference,
      amount: qrSession.amount,
      paid_at: qrSession.paid_at ?? undefined,
    });
  } catch (err) {
    console.error('[API QR Status] Error:', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
