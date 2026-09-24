// ============================================================
// POST /api/integrations/bold/create-pos-payment
// Crea un pago POS en Bold (terminal fisica) y registra la sesion QR.
//
// SEGURIDAD (GO-sec, auditoria del POS 2026-09-24): la organizacion sale de
// la sesion (`withOrg`; organizacion ajena en body o query → 403 y registro);
// el permiso de cobro y la conexion de Bold se resuelven en el servidor
// (`prepararCobroQr`). El datafono (serial y modelo) y el correo del operador
// salen de la conexion y la sucursal (`datafonoBoldDeConexion`), no del body:
// el POS nunca los mandaba y la ruta respondia 400 siempre.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { boldService, type BoldPaymentMethod } from '@/lib/services/integrations/bold';
import { createQrSession } from '@/lib/services/integrations/qrShared/qrSessionService';
import {
  datafonoBoldDeConexion,
  MONEDA_RIELES_QR,
  prepararCobroQr,
} from '@/lib/services/integrations/qrShared/cobroQrServidor';

const RUTA = '/api/integrations/bold/create-pos-payment';

/** Metodos que tienen sentido en el datafono desde el cobro del POS. */
const METODOS_DATAFONO: readonly BoldPaymentMethod[] = ['PAY_BY_QR_BOLD', 'POS'];

function esMetodoDatafono(value: unknown): value is BoldPaymentMethod {
  return typeof value === 'string' && (METODOS_DATAFONO as readonly string[]).includes(value);
}

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const cobro = await prepararCobroQr(ctx, body, 'bold_qr', RUTA);

    const paymentMethod = body.payment_method ?? 'PAY_BY_QR_BOLD';
    if (!esMetodoDatafono(paymentMethod)) {
      return NextResponse.json({ error: 'Metodo de pago no soportado en el datafono de Bold' }, { status: 400 });
    }
    const datafono = datafonoBoldDeConexion(cobro.conexion, cobro.branchId, cobro.userEmail);

    // 1. Crear pago POS en Bold con la conexion de la organizacion
    const posResponse = await boldService.createPosPayment(cobro.conexion.id, {
      amount: cobro.amount,
      currency: MONEDA_RIELES_QR,
      reference: cobro.reference,
      payment_method: paymentMethod,
      terminal_model: datafono.terminalModel,
      terminal_serial: datafono.terminalSerial,
      user_email: datafono.userEmail,
      description: cobro.description,
      // `reference` en metadata: el webhook de Bold la lee de `data.metadata.reference`.
      metadata: {
        reference: cobro.reference,
        source: cobro.source,
        sourceId: cobro.sourceId,
        organizationId: cobro.organizationId,
        branchId: cobro.branchId,
      },
    });

    if (!posResponse) {
      return NextResponse.json({ error: 'Error al crear pago POS en Bold' }, { status: 502 });
    }

    // 2. Registrar sesion QR en BD
    const qrSession = await createQrSession({
      organizationId: cobro.organizationId,
      branchId: cobro.branchId,
      providerCode: 'bold_pos',
      connectorCode: 'bold',
      integrationConnectionId: cobro.conexion.id,
      reference: cobro.reference,
      externalQrId: posResponse.integration_id,
      amount: cobro.amount,
      currency: cobro.currency,
      source: cobro.source,
      sourceId: cobro.sourceId ?? undefined,
      createdBy: cobro.userId,
    });

    if (!qrSession) {
      return NextResponse.json({ error: 'Pago POS creado pero fallo el registro de sesion QR' }, { status: 500 });
    }

    return NextResponse.json({
      integration_id: posResponse.integration_id,
      qr_session_id: qrSession.id,
      reference: cobro.reference,
    });
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API Bold CreatePosPayment] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
});
