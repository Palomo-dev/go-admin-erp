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
      if (error.scope === 'platform') {
        // Las llaves que faltan son de la PLATAFORMA (cuenta maestra, el valor
        // por defecto). Eso lo arregla el dueño de la plataforma, no la
        // organización cliente: a ella le llega un texto neutro, sin proveedor
        // ni variables, y los nombres de lo que falta quedan aquí, en el log
        // del servidor, que es donde el dueño los va a ver.
        console.error(
          '[Voice Token] telefonía de plataforma sin configurar (org %d): faltan %s',
          ctx.organizationId,
          error.missing.join(', ')
        );
        return NextResponse.json(
          { success: false, error: error.publicMessage, code: 'VOICE_NOT_CONFIGURED', scope: 'platform' },
          { status: 409 }
        );
      }
      // La organización configuró sus propias llaves y le faltan: su
      // administrador sí puede corregirlo. `missing` son NOMBRES, nunca valores.
      return NextResponse.json(
        { success: false, error: error.publicMessage, code: 'VOICE_NOT_CONFIGURED', scope: 'organization', missing: error.missing },
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
