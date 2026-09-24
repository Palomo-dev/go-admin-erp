// ============================================================
// POST /api/integrations/redeban/create-qr
// Genera un QR de pago Redeban y registra la sesion QR.
//
// SEGURIDAD (GO-sec, auditoria del POS 2026-09-24): la organizacion sale de
// la sesion (`withOrg`; organizacion ajena en body o query → 403 y registro);
// el permiso de cobro y la conexion de Redeban se resuelven en el servidor
// (`prepararCobroQr`), nunca con el `connectionId` del body. Ver
// `qrShared/cobroQrServidor.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { redebanService } from '@/lib/services/integrations/redeban';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { prepararCobroQr } from '@/lib/services/integrations/qrShared/cobroQrServidor';

const RUTA = '/api/integrations/redeban/create-qr';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: RUTA });
    const cobro = await prepararCobroQr(ctx, body, 'redeban_qr', RUTA);
    const expiresAt = new Date(Date.now() + cobro.expiresInSeconds * 1000).toISOString();

    // 1. Crear QR en Redeban con la conexion de la organizacion
    const qrResponse = await redebanService.createQr(cobro.conexion.id, {
      amount: cobro.amount,
      currency: cobro.currency,
      reference: cobro.reference,
      description: cobro.description,
      expiresAt,
    });

    if (!qrResponse) {
      return NextResponse.json({ error: 'Error al generar QR en Redeban' }, { status: 502 });
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: cobro.organizationId,
      branchId: cobro.branchId,
      providerCode: 'redeban',
      connectorCode: 'redeban_qr',
      integrationConnectionId: cobro.conexion.id,
      reference: cobro.reference,
      externalQrId: qrResponse.id,
      qrData: qrResponse.qr_string,
      qrImageUrl: qrResponse.qr_image_base64,
      amount: cobro.amount,
      currency: cobro.currency,
      source: cobro.source,
      sourceId: cobro.sourceId ?? undefined,
      expiresAt,
      createdBy: cobro.userId,
    });

    if (!qrSession) {
      return NextResponse.json({ error: 'QR generado pero fallo el registro de sesion QR' }, { status: 500 });
    }

    return NextResponse.json({ qrSession, qr: qrResponse });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Redeban CreateQR] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
