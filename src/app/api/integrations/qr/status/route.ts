// ============================================================
// GET /api/integrations/qr/status
// Consulta el estado de una sesion QR (generico para todos los proveedores).
// Usado por QrPoller para hacer polling del estado de pago.
//
// La organización sale de la SESIÓN, no de la query (regla dura 5): el
// `organizationId` del query string solo dice qué organización reclama el
// llamante, y `getServerOrgContextFor` exige membresía activa en ESA
// organización (401 sin sesión, 403 si no pertenece). Antes bastaba tener
// sesión: con referencias predecibles (`POS-<Date.now()>-<orgId>`) un usuario
// de otra organización leía status/amount/paid_at de sesiones ajenas
// (F2 Parte C, ronda 12). El contrato de respuesta no cambia.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContextFor, OrgContextError, type ServerOrgContext } from '@/lib/utils/orgContext';
import { getQrSessionByReference } from '@/lib/services/integrations/qrShared/qrSessionService';

export async function GET(request: NextRequest) {
  try {
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

    // Sesión + membresía activa en la organización reclamada.
    let ctx: ServerOrgContext;
    try {
      ctx = await getServerOrgContextFor(organizationId);
    } catch (err) {
      if (!(err instanceof OrgContextError)) throw err;
      if (err.statusCode === 401) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }
      // Organización ajena en la query: 403 y registro, como hace withOrg.
      if (err.statusCode === 403) {
        console.warn('[API QR Status] organizationId ajeno en la query → 403', {
          organizationId,
          code: err.code,
        });
      }
      // Cualquier otro OrgContextError viaja con SU código de estado (hoy
      // `contextForOrg` solo lanza 401/403; si orgContext añadiera un 400/409
      // no se disfrazaría de 403). Mismo cuerpo que `jsonError` de orgContext.
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }

    // Buscar sesion QR por referencia y organizacion (la de la sesión)
    const qrSession = await getQrSessionByReference(ctx.organizationId, reference);
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
