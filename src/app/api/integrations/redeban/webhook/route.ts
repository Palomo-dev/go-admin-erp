// ============================================================
// POST /api/integrations/redeban/webhook
// Recibe notificaciones de Redeban (callback del proveedor).
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria de integraciones §2.2 «Webhooks de
// cobro»): este handler NO verificaba nada. Con un JSON cualquiera (y el
// `connectionId` en el propio body) marcaba una sesion QR como pagada y creaba
// un `payment completed` via `confirmQrPayment`. El middleware no lo protege:
// da por buena una cookie con un JWT sin verificar.
//
// `redebanService.verifyWebhookSignature` existe pero nadie la llamaba, y el
// codigo no dice en que header ni con que credencial firma Redeban. Inventarlo
// seria adivinar el contrato del proveedor, asi que el webhook queda CERRADO
// (fail-closed, 401) hasta implementar la verificacion contra la documentacion
// de Redeban. No hay trafico real (0 peticiones en los logs de produccion).
// ============================================================

import { NextResponse } from 'next/server';

export async function POST() {
  console.warn('[Redeban Webhook] rechazado: la verificacion de firma no esta implementada (fail-closed)');
  return NextResponse.json(
    { error: 'webhook_signature_not_implemented' },
    { status: 401 },
  );
}
