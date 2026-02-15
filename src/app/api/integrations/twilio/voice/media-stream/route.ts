/**
 * API Route: Media Stream (DEPRECADO)
 * GET /api/integrations/twilio/voice/media-stream
 *
 * Este endpoint ya NO se usa. El Voice Agent ahora utiliza
 * Twilio ConversationRelay, que simplifica la arquitectura:
 *
 * - Twilio maneja STT/TTS automáticamente
 * - Nuestro servidor solo recibe/envía TEXTO (no audio)
 * - El WS server corre en ws-server.ts (puerto 8080)
 *
 * Flujo actual:
 *   Llamada → voice/incoming (TwiML ConversationRelay)
 *           → ws-server.ts /conversation-relay (texto ↔ OpenAI)
 *
 * Ver docs/integraciones/twilio.md para arquitectura completa.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      deprecated: true,
      message: 'Este endpoint fue reemplazado por ConversationRelay',
      newArchitecture: {
        webhook: 'POST /api/integrations/twilio/voice/incoming → TwiML ConversationRelay',
        wsServer: 'ws-server.ts en puerto 8080 → /conversation-relay',
        benefit: 'Twilio maneja STT/TTS; servidor solo procesa texto',
      },
    },
    { status: 410 }
  );
}
