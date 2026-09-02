import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { generateVoiceToken } from '@/lib/services/crm/voiceTokenService';

/**
 * POST /api/voice/token — Genera un token de acceso para Twilio Voice SDK.
 *
 * Body: (vacío — usa el userId de la sesión)
 *
 * Retorna: { token: string, identity: string }
 */
export async function POST(_request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const { token, identity } = await generateVoiceToken(
      ctx.organizationId,
      ctx.userId,
      ctx.supabase
    );

    return NextResponse.json({ success: true, token, identity }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Token] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
