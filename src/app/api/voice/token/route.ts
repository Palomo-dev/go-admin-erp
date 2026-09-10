import { NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { generateVoiceToken, VoiceNotConfiguredError } from '@/lib/services/crm/voiceTokenService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET|POST /api/voice/token — AccessToken para Twilio Voice JS SDK (FASE-03 §4.1).
 *
 * Respuesta 200: { success, token, identity, ttl, orgId }
 * 401/403: sin sesión / sin membresía.
 * 409 `VOICE_NOT_CONFIGURED` + `missing: string[]`: faltan TWILIO_ACCOUNT_SID /
 *   API_KEY / API_SECRET / TWIML_APP_SID (registry `provider_configs` o env).
 *   El softphone enumera exactamente cuáles faltan (nombres, nunca valores).
 */
async function handle(request: Request) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const result = await generateVoiceToken(ctx.organizationId, ctx.userId);
    return NextResponse.json({ success: true, ...result }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error: unknown) {
    if (error instanceof VoiceNotConfiguredError) {
      // `missing` son NOMBRES de credenciales, nunca valores: el dock los usa
      // para decir qué falta en vez de un genérico "no configurada".
      return NextResponse.json(
        { success: false, error: error.message, code: 'VOICE_NOT_CONFIGURED', missing: error.missing },
        { status: 409 }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Token] error:', message);
    return NextResponse.json({ success: false, error: 'No se pudo generar el token de voz' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
