// ============================================================
// /api/integrations/open-finance/webhook
// Recibe notificaciones de webhook de Prometeo (sin sesion de usuario).
//
// SEGURIDAD (GO-sec, 2026-09-23; auditoria de integraciones §1.4, hallazgo 9):
// - Antes llamaba `verifyWebhookSignature` (async) SIN `await`: la promesa
//   siempre es «verdadera» y la verificacion nunca rechazaba. Ahora la
//   verificacion es sincrona (`verificarTokenWebhookPrometeo`), en tiempo
//   constante y FAIL-CLOSED: sin `PROMETEO_WEBHOOK_VERIFY_TOKEN` real o con un
//   token distinto → 401 y no se procesa nada.
// - Antes registraba el body crudo en los logs (datos bancarios). Ahora solo el
//   tipo de evento.
// - El middleware (`src/middleware.ts`) la deja pasar sin cookie para que
//   Prometeo pueda llegar; la unica puerta es este token.
// - Con el token valido se responde 200 aunque el evento no se soporte o falle
//   el procesamiento (evita reintentos del proveedor); el procesamiento en si
//   sigue siendo un TODO del servicio.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';
import { verificarTokenWebhookPrometeo } from '@/lib/services/integrations/openFinance/webhookPrometeo';

// Eventos soportados por Prometeo
const SUPPORTED_EVENTS = ['payin.settled', 'payout.cancelled', 'payout.failed'] as const;
type SupportedEvent = typeof SUPPORTED_EVENTS[number];

/** Verifica si el evento es uno de los soportados. */
function isSupportedEvent(event: string): event is SupportedEvent {
  return (SUPPORTED_EVENTS as readonly string[]).includes(event);
}

// POST - recibe webhook de Prometeo
export async function POST(request: NextRequest) {
  // 1. Verificacion ANTES de leer o procesar nada (fail-closed).
  const url = new URL(request.url);
  const verifyToken =
    request.headers.get('x-verify-token')
    ?? url.searchParams.get('verify_token')
    ?? '';
  if (!verificarTokenWebhookPrometeo(verifyToken)) {
    console.warn('[Open Finance Webhook] verify_token ausente o invalido: rechazado');
    return NextResponse.json({ error: 'webhook_unauthorized' }, { status: 401 });
  }

  try {
    const rawBody = await request.text();
    let payload: { event?: string; data?: Record<string, unknown> };
    try {
      payload = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const event = typeof payload.event === 'string' ? payload.event : '';

    if (!isSupportedEvent(event)) {
      console.warn('[Open Finance Webhook] Evento no soportado:', event.slice(0, 64));
      return NextResponse.json({ received: true }, { status: 200 });
    }

    console.info('[Open Finance Webhook] evento recibido', { event });
    await openFinanceService.processWebhookEvent(null, event, payload.data ?? {});

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Token valido: 200 para que Prometeo no reintente; solo el mensaje al log.
    console.error('[Open Finance Webhook] Error procesando:', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
