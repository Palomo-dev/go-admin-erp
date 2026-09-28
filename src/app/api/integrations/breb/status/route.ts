// ============================================================
// GET /api/integrations/breb/status?reference=
// Consulta el estado de una sesion QR Bre-B.
//
// SEGURIDAD (GO-sec, 2026-09-24): la organizacion sale de la sesion
// (`withOrg`); un `organizationId` ajeno en la query → 403 y registro. Antes
// bastaba cualquier sesion y la organizacion de la query.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getQrSessionByReference } from '@/lib/services/integrations/qrShared/qrSessionService';

const RUTA = '/api/integrations/breb/status';

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

  return NextResponse.json({
    status: qrSession.status,
    reference,
    amount: qrSession.amount,
    paid_at: qrSession.paid_at ?? undefined,
  });
});
