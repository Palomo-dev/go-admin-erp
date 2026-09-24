// ============================================================
// POST /api/integrations/qr/auto-match
// Auto-concilia un payment con un bank_transaction despues de un webhook.
//
// SEGURIDAD (GO-sec, 2026-09-24): la organizacion sale de la sesion
// (`withOrg`); organizacion ajena en body o query → 403 y registro. Antes
// exigia `organizationId` en el body (el unico llamante,
// ConciliacionService.autoMatchFromWebhook, no lo manda: respondia 400) y
// solo comprobaba `auth.getSession()`. `autoMatchFromWebhook` exige ademas que
// el pago y la transaccion sean de esa organizacion.
// ============================================================

import { NextResponse } from 'next/server';
import { withOrg } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { OrgContextError } from '@/lib/utils/orgContextError';
import { autoMatchFromWebhook } from '@/lib/services/integrations/qrShared/autoReconciliation';

const RUTA = '/api/integrations/qr/auto-match';

export const POST = withOrg(async (ctx, request) => {
  try {
    const body = await readOrgBody<Record<string, unknown>>(ctx, request, { route: RUTA });
    const paymentId = typeof body.paymentId === 'string' ? body.paymentId.trim() : '';
    const bankTransactionId = Number(body.bankTransactionId);

    if (!paymentId || !Number.isInteger(bankTransactionId) || bankTransactionId <= 0) {
      return NextResponse.json(
        { success: false, message: 'Faltan campos requeridos: paymentId, bankTransactionId' },
        { status: 400 },
      );
    }

    const result = await autoMatchFromWebhook(paymentId, bankTransactionId, ctx.organizationId);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof OrgContextError) throw err;
    console.error('[API QR Auto-Match] Error:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, message: 'Error interno del servidor' }, { status: 500 });
  }
});
