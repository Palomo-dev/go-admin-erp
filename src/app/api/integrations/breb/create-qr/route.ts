// ============================================================
// POST /api/integrations/breb/create-qr
// Genera un QR de pago Bre-B via Mono (crea una collection)
// y registra la sesion QR en BD.
//
// SEGURIDAD (GO-sec, auditoria del POS 2026-09-24): la organizacion sale de
// la sesion (`withOrg`; organizacion ajena en body o query → 403 y registro),
// el permiso de cobro y la conexion de Mono se resuelven en el servidor
// (`prepararCobroQr`) y la llave Bre-B —a donde llega el dinero— sale de la
// conexion, nunca del body. Ver `qrShared/cobroQrServidor.ts`.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { monoService } from '@/lib/services/integrations/breb';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { llaveBrebDeConexion, prepararCobroQr } from '@/lib/services/integrations/qrShared/cobroQrServidor';

const RUTA = '/api/integrations/breb/create-qr';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: RUTA });
    const cobro = await prepararCobroQr(ctx, body, 'breb_qr', RUTA);
    const { keyValue, keyType } = llaveBrebDeConexion(cobro.conexion);

    // 1. Crear collection en Mono con la conexion de la organizacion
    const qrResponse = await monoService.createCollection(cobro.conexion.id, {
      amount: cobro.amount,
      currency: cobro.currency,
      key_type: keyType,
      key_value: keyValue,
      description: cobro.description,
      expires_in: cobro.expiresInSeconds,
      metadata: {
        reference: cobro.reference,
        source: cobro.source,
        sourceId: cobro.sourceId,
        organizationId: cobro.organizationId,
        branchId: cobro.branchId,
      },
    });

    if (!qrResponse) {
      return NextResponse.json({ error: 'Error al generar QR en Mono (Bre-B)' }, { status: 502 });
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: cobro.organizationId,
      branchId: cobro.branchId,
      providerCode: 'breb',
      connectorCode: 'breb_mono',
      integrationConnectionId: cobro.conexion.id,
      reference: cobro.reference,
      externalQrId: qrResponse.id,
      qrData: qrResponse.qr,
      qrImageUrl: qrResponse.qr_image,
      amount: cobro.amount,
      currency: cobro.currency,
      source: cobro.source,
      sourceId: cobro.sourceId ?? undefined,
      expiresAt: qrResponse.expires_at,
      createdBy: cobro.userId,
    });

    if (!qrSession) {
      return NextResponse.json({ error: 'QR generado pero fallo el registro de sesion QR' }, { status: 500 });
    }

    return NextResponse.json({ qrSession, qr: qrResponse });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API BreB CreateQR] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
