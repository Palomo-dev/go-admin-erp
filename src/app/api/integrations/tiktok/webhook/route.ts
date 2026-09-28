// ============================================================
// /api/integrations/tiktok/webhook — webhook de TikTok.
//
// GET: verificación del endpoint. Credencial: `TIKTOK_WEBHOOK_VERIFY_TOKEN`
//   (entorno). Fail-closed: sin la variable → 403. Antes caía a un token por
//   defecto escrito en el código (repositorio público) y respondía 200 aun
//   con el token equivocado.
//
// POST: CERRADO (401) hasta implementar la firma (GO-sec, 2026-09-24). Antes
//   aceptaba cualquier cuerpo sin verificar nada y lo escribía en los logs
//   (datos de terceros). No procesa ni guarda nada: cerrarlo no pierde
//   información. Credencial que usará el proveedor: el App Secret de TikTok
//   (`TIKTOK_APP_SECRET`); TikTok firma con HMAC-SHA256 `<timestamp>.<raw body>`
//   y manda `TikTok-Signature: t=<timestamp>,s=<firma>`. Implementarlo contra
//   la documentación vigente del producto de TikTok que se suscriba, con
//   comparación en tiempo constante y ventana de tiempo, antes de abrirlo.
//   Mismo criterio que el webhook de Redeban.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { verificarSuscripcionWebhook } from '@/lib/security/suscripcionWebhook';

export async function GET(request: NextRequest) {
  return verificarSuscripcionWebhook(request, {
    variable: 'TIKTOK_WEBHOOK_VERIFY_TOKEN',
    parametroToken: 'verify_token',
    parametroDesafio: 'challenge',
    etiqueta: 'TikTok Webhook',
  });
}

export async function POST() {
  console.warn('[TikTok Webhook] rechazado: la verificación de firma no está implementada (fail-closed)');
  return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
}
