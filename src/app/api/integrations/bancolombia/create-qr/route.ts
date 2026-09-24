// ============================================================
// POST /api/integrations/bancolombia/create-qr
// Registra una intencion de transferencia en Bancolombia (genera QR/Boton)
// y registra la sesion QR en BD.
//
// SEGURIDAD (GO-sec, auditoria del POS 2026-09-24): la organizacion sale de
// la sesion (`withOrg`; organizacion ajena en body o query → 403 y registro);
// el permiso de cobro y la conexion de Bancolombia se resuelven en el servidor
// (`prepararCobroQr`). La URL de confirmacion (webhook) lleva el id de ESA
// conexion: el webhook verifica el JWT con su secreto y solo toca sesiones QR
// de esa conexion. `commerceUrl` ya no sale del body.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { bancolombiaService } from '@/lib/services/integrations/bancolombia';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { prepararCobroQr } from '@/lib/services/integrations/qrShared/cobroQrServidor';

const RUTA = '/api/integrations/bancolombia/create-qr';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody(ctx, request, { route: RUTA });
    const cobro = await prepararCobroQr(ctx, body, 'bancolombia_qr', RUTA);
    const expiresAt = new Date(Date.now() + cobro.expiresInSeconds * 1000).toISOString();

    // 1. URL de confirmacion (webhook) para Bancolombia, con la conexion resuelta
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://erp.go-admin.co';
    const confirmationURL = `${siteUrl}/api/integrations/bancolombia/webhook?connectionId=${encodeURIComponent(cobro.conexion.id)}`;

    // 2. Registrar intencion de transferencia en Bancolombia
    // commerceTransferButtonId se obtiene de las credenciales dentro del servicio
    const qrResponse = await bancolombiaService.registerTransferIntention(cobro.conexion.id, {
      transferReference: cobro.reference,
      transferDescription: cobro.description,
      transferAmount: cobro.amount,
      commerceUrl: siteUrl,
      confirmationURL,
    });

    if (!qrResponse) {
      return NextResponse.json({ error: 'Error al registrar intencion de transferencia en Bancolombia' }, { status: 502 });
    }

    // 3. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: cobro.organizationId,
      branchId: cobro.branchId,
      providerCode: 'bancolombia',
      connectorCode: 'bancolombia_qr',
      integrationConnectionId: cobro.conexion.id,
      reference: cobro.reference,
      externalQrId: qrResponse.transferCode,
      qrData: qrResponse.redirectURL,
      amount: cobro.amount,
      currency: cobro.currency,
      source: cobro.source,
      sourceId: cobro.sourceId ?? undefined,
      expiresAt,
      createdBy: cobro.userId,
    });

    if (!qrSession) {
      return NextResponse.json({ error: 'Intencion registrada pero fallo el registro de sesion QR' }, { status: 500 });
    }

    return NextResponse.json({ qrSession, qr: qrResponse });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Bancolombia CreateQR] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
