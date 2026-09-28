// ============================================================
// GET /api/integrations/bancolombia/status?reference=
// Consulta el estado de una sesion QR de Bancolombia.
//
// SEGURIDAD (GO-sec, 2026-09-24): la organizacion sale de la sesion
// (`withOrg`); un `organizationId` ajeno en la query → 403 y registro. La
// consulta al proveedor usa la conexion guardada en la sesion QR, que resolvio
// el servidor al crearla.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getQrSessionByReference } from '@/lib/services/integrations/qrShared/qrSessionService';
import { bancolombiaService } from '@/lib/services/integrations/bancolombia';

const RUTA = '/api/integrations/bancolombia/status';

export const GET = withOrg(async (ctx, request) => {
  await readOrgBody(ctx, request, { route: RUTA });
  const reference = new URL(request.url).searchParams.get('reference');
  if (!reference) {
    return NextResponse.json({ error: 'Falta el parametro reference' }, { status: 400 });
  }

  const qrSession = await getQrSessionByReference(ctx.organizationId, reference);
  if (!qrSession) {
    return NextResponse.json({ error: 'Sesion QR no encontrada' }, { status: 404 });
  }

  // Si sigue pendiente, validar la transferencia en Bancolombia (opcional)
  if (qrSession.status === 'pending' && qrSession.integration_connection_id && qrSession.external_qr_id) {
    try {
      const txStatus = await bancolombiaService.validateTransfer(
        qrSession.integration_connection_id,
        qrSession.external_qr_id,
      );
      if (txStatus?.transferState === 'approved') {
        return NextResponse.json({
          status: 'paid',
          reference,
          amount: qrSession.amount,
          paid_at: new Date().toISOString(),
        });
      }
    } catch (pollErr) {
      console.error('[API Bancolombia Status] Error consultando proveedor:', pollErr instanceof Error ? pollErr.message : String(pollErr));
    }
  }

  return NextResponse.json({
    status: qrSession.status,
    reference,
    amount: qrSession.amount,
    paid_at: qrSession.paid_at ?? undefined,
  });
});
