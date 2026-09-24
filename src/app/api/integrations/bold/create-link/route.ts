// ============================================================
// POST /api/integrations/bold/create-link
// Genera un link de pago Bold y registra la sesion QR en BD.
//
// SEGURIDAD (GO-sec, auditoria del POS 2026-09-24): la organizacion sale de
// la sesion (`withOrg`; organizacion ajena en body o query → 403 y registro);
// el permiso de cobro y la conexion de Bold se resuelven en el servidor
// (`prepararCobroQr`), nunca con el `connectionId` del body. Los metodos de
// pago se limitan a los del link y la URL de retorno es la del propio ERP.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { boldService } from '@/lib/services/integrations/bold';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { MONEDA_RIELES_QR, prepararCobroQr } from '@/lib/services/integrations/qrShared/cobroQrServidor';

const RUTA = '/api/integrations/bold/create-link';
const METODOS_LINK = ['CREDIT_CARD', 'PSE', 'BOTON_BANCOLOMBIA', 'NEQUI', 'DAVIPLATA'];
const CORREO_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const cobro = await prepararCobroQr(ctx, body, 'bold_link', RUTA);

    const pedidos = Array.isArray(body.payment_methods) ? body.payment_methods.map(String) : [];
    const paymentMethods = pedidos.filter((m) => METODOS_LINK.includes(m));
    const correo = typeof body.payer_email === 'string' ? body.payer_email.trim() : '';
    const callbackUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;

    // 1. Crear link de pago en Bold con la conexion de la organizacion
    const linkResponse = await boldService.createPaymentLink(cobro.conexion.id, {
      amount: cobro.amount,
      currency: MONEDA_RIELES_QR,
      reference: cobro.reference,
      description: cobro.description,
      payment_methods: paymentMethods.length > 0 ? paymentMethods : undefined,
      callback_url: callbackUrl,
      payer_email: CORREO_RE.test(correo) ? correo : undefined,
      expires_in: cobro.expiresInSeconds,
      // `reference` en metadata: el webhook de Bold la lee de `data.metadata.reference`.
      metadata: {
        reference: cobro.reference,
        source: cobro.source,
        sourceId: cobro.sourceId,
        organizationId: cobro.organizationId,
        branchId: cobro.branchId,
      },
    });

    if (!linkResponse) {
      return NextResponse.json({ error: 'Error al generar link de pago en Bold' }, { status: 502 });
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: cobro.organizationId,
      branchId: cobro.branchId,
      providerCode: 'bold_link',
      connectorCode: 'bold',
      integrationConnectionId: cobro.conexion.id,
      reference: cobro.reference,
      externalQrId: linkResponse.id,
      qrImageUrl: linkResponse.link_url,
      amount: cobro.amount,
      currency: cobro.currency,
      source: cobro.source,
      sourceId: cobro.sourceId ?? undefined,
      expiresAt: linkResponse.expires_at,
      createdBy: cobro.userId,
    });

    if (!qrSession) {
      return NextResponse.json({ error: 'Link generado pero fallo el registro de sesion QR' }, { status: 500 });
    }

    return NextResponse.json({
      payment_url: linkResponse.link_url,
      link_id: linkResponse.id,
      qr_session_id: qrSession.id,
      expires_at: linkResponse.expires_at,
      reference: cobro.reference,
    });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Bold CreateLink] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
