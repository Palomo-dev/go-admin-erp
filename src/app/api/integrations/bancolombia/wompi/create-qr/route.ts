// ============================================================
// POST /api/integrations/bancolombia/wompi/create-qr
// Genera un QR Bancolombia via Wompi (BANCOLOMBIA_QR).
//
// SEGURIDAD (GO-sec, auditoria del POS 2026-09-24): la organizacion sale de
// la sesion (`withOrg`; organizacion ajena en body o query → 403 y registro);
// el permiso de cobro y la conexion de Wompi se resuelven en el servidor
// (`prepararCobroQr`), nunca con el `connectionId` del body. El correo del
// pagador es el del body si es valido y, si no, el de la sesion.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { getServiceClient } from '@/lib/supabase/server-service';
import { wompiService } from '@/lib/services/integrations/wompi';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import { MONEDA_RIELES_QR, prepararCobroQr } from '@/lib/services/integrations/qrShared/cobroQrServidor';
import { normalizeQrImageSource } from '@/lib/pos/display/payment';

const RUTA = '/api/integrations/bancolombia/wompi/create-qr';
const CORREO_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const cobro = await prepararCobroQr(ctx, body, 'bancolombia_qr_wompi', RUTA);

    const correoBody = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : '';
    const customerEmail = CORREO_RE.test(correoBody) ? correoBody : cobro.userEmail ?? '';
    if (!customerEmail) {
      return NextResponse.json({ error: 'Se requiere un correo del pagador para Wompi' }, { status: 400 });
    }

    // 1. Credenciales de la conexion de la organizacion (service role: la
    //    conexion ya la resolvio el servidor para ESTA organizacion; con el
    //    cliente de navegador, anonimo en el servidor, RLS no dejaba leerlas
    //    y la ruta respondia 412 siempre).
    const credentials = await wompiService.getCredentials(cobro.conexion.id, getServiceClient());
    if (!credentials) {
      return NextResponse.json(
        { error: 'La conexión de Wompi no tiene credenciales activas. Revísela en Integraciones → Conexiones.', code: 'CREDENCIALES_NO_CONFIGURADAS' },
        { status: 412 },
      );
    }

    // 2. Tokens de aceptacion
    const acceptanceTokens = await wompiService.getAcceptanceTokens(credentials);
    if (!acceptanceTokens) {
      return NextResponse.json({ error: 'No se pudieron obtener tokens de aceptacion de Wompi' }, { status: 502 });
    }

    // 3. Expiracion
    const expirationTime = new Date(Date.now() + cobro.expiresInSeconds * 1000).toISOString();

    // 4. Firma de integridad
    const amountInCents = Math.round(cobro.amount * 100);
    const signature = wompiService.generateIntegritySignature(
      cobro.reference,
      amountInCents,
      MONEDA_RIELES_QR,
      credentials.integritySecret,
      expirationTime,
    );

    // 5. Transaccion BANCOLOMBIA_QR en Wompi
    const result = await wompiService.createTransaction(credentials, {
      acceptance_token: acceptanceTokens.acceptanceToken,
      accept_personal_auth: acceptanceTokens.acceptPersonalAuth,
      amount_in_cents: amountInCents,
      currency: MONEDA_RIELES_QR,
      customer_email: customerEmail,
      reference: cobro.reference,
      signature,
      payment_method: {
        type: 'BANCOLOMBIA_QR',
        payment_description: cobro.description,
      },
      payment_method_type: 'BANCOLOMBIA_QR',
      expiration_time: expirationTime,
    });

    if (!result) {
      return NextResponse.json({ error: 'Error al crear transaccion BANCOLOMBIA_QR en Wompi' }, { status: 502 });
    }

    // 6. QR de payment_method.extra
    const extra = result.data.payment_method?.extra as Record<string, unknown> | undefined;
    // Wompi entrega `qr_image` como base64 CRUDO de un SVG (docs/integraciones/
    // bancolombia-breb-redeban-qr-pagos.md: «data:image/svg+xml;base64,{qr_image}»).
    // Se devuelve ya como data URL para que <img> (modal de cobro y pantalla del
    // cliente) lo pinte tal cual; si llegara ya prefijado o vacío, se respeta.
    const rawQrImage = (extra?.qr_image as string) || null;
    const qrImage = rawQrImage ? normalizeQrImageSource(rawQrImage) ?? rawQrImage : null;
    const qrId = (extra?.qr_id as string) || null;

    // 7. Registrar sesion QR
    const qrSession = await createQrSession({
      organizationId: cobro.organizationId,
      branchId: cobro.branchId,
      providerCode: 'wompi',
      connectorCode: 'bancolombia_qr_wompi',
      integrationConnectionId: cobro.conexion.id,
      reference: cobro.reference,
      externalQrId: qrId || result.data.id,
      qrData: qrImage ?? undefined,
      qrImageUrl: qrImage ?? undefined,
      amount: cobro.amount,
      currency: cobro.currency,
      source: cobro.source,
      sourceId: cobro.sourceId ?? undefined,
      expiresAt: expirationTime,
      createdBy: cobro.userId,
    });

    return NextResponse.json({
      qrSession,
      qr: {
        id: result.data.id,
        qr_id: qrId,
        qr_image: qrImage,
        status: result.data.status,
        reference: cobro.reference,
      },
    });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Bancolombia Wompi QR] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
