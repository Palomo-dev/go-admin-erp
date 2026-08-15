// ============================================================
// /api/integrations/open-finance/webhook
// Recibe notificaciones de webhook de Prometeo.
// Sin autenticacion: es un endpoint publico invocado por Prometeo.
// Verifica verify_token con openFinanceService.verifyWebhookSignature().
// IMPORTANTE: responde 200 siempre para evitar reintentos del proveedor.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { openFinanceService } from '@/lib/services/integrations/openFinance/openFinanceService';

// Eventos soportados por Prometeo
const SUPPORTED_EVENTS = ['payin.settled', 'payout.cancelled', 'payout.failed'] as const;
type SupportedEvent = typeof SUPPORTED_EVENTS[number];

/** Verifica si el evento es uno de los soportados. */
function isSupportedEvent(event: string): event is SupportedEvent {
  return (SUPPORTED_EVENTS as readonly string[]).includes(event);
}

// POST - recibe webhook de Prometeo
export async function POST(request: NextRequest) {
  try {
    // Leer payload crudo
    const rawBody = await request.text();
    console.log('[Open Finance Webhook] Payload recibido:', rawBody);

    // Extraer verify_token de query params o headers
    const url = new URL(request.url);
    const verifyToken =
      url.searchParams.get('verify_token')
      ?? request.headers.get('x-verify-token')
      ?? '';

    // Verificar firma/token del webhook
    const isValid = openFinanceService.verifyWebhookSignature(rawBody, verifyToken);
    if (!isValid) {
      console.error('[Open Finance Webhook] verify_token invalido');
      // Responder 200 igualmente para evitar reintentos
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Parsear payload
    const payload = JSON.parse(rawBody) as { event?: string; data?: Record<string, unknown> };
    const event = payload.event ?? '';

    if (!isSupportedEvent(event)) {
      console.warn('[Open Finance Webhook] Evento no soportado:', event);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Procesar evento con supabase (sin requerir sesion de usuario)
    const supabase = createRouteHandlerClient({ cookies });
    await openFinanceService.processWebhookEvent(supabase, event, payload.data ?? {});

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    // Log del error pero responder 200 para que Prometeo no reintente
    console.error('[Open Finance Webhook] Error procesando:', err);
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
