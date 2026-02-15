/**
 * API Route: Enviar código OTP via Twilio Verify
 * POST /api/integrations/twilio/verify/send
 */

import { NextRequest, NextResponse } from 'next/server';
import { twilioVerifyService } from '@/lib/services/integrations/twilio';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, channel } = body;

    if (!to) {
      return NextResponse.json(
        { error: 'Falta campo requerido: to' },
        { status: 400 }
      );
    }

    const result = await twilioVerifyService.sendCode({
      to,
      channel: channel || 'sms',
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      status: result.status,
    });
  } catch (error) {
    console.error('[API] Error enviando OTP:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
