/**
 * API Route: Enviar WhatsApp via Twilio
 * POST /api/integrations/twilio/send-whatsapp
 *
 * Seguridad (F0, C4 msg): sesión + org activa (`getServerOrgContext`);
 * el `orgId` del body se ignora (si viene y no coincide → 403).
 */

import { NextRequest, NextResponse } from 'next/server';
import { twilioService } from '@/lib/services/integrations/twilio';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const body = await request.json();
    const { to, message, module, mediaUrl } = body;
    const orgId = ctx.organizationId;

    if (body.orgId !== undefined && Number(body.orgId) !== orgId) {
      return NextResponse.json({ error: 'orgId no coincide con la organización activa' }, { status: 403 });
    }

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: to, message' },
        { status: 400 }
      );
    }

    const result = await twilioService.sendWhatsApp(orgId, to, message, module, mediaUrl);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      messageSid: result.messageSid,
      status: result.status,
      creditsUsed: result.creditsUsed,
    });
  } catch (error) {
    console.error('[API] Error enviando WhatsApp:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
