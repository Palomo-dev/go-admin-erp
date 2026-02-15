/**
 * API Route: Verificar código OTP via Twilio Verify
 * POST /api/integrations/twilio/verify/check
 */

import { NextRequest, NextResponse } from 'next/server';
import { twilioVerifyService } from '@/lib/services/integrations/twilio';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { to, code } = body;

    if (!to || !code) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: to, code' },
        { status: 400 }
      );
    }

    const result = await twilioVerifyService.checkCode({ to, code });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Código inválido', status: result.status },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      status: result.status,
    });
  } catch (error) {
    console.error('[API] Error verificando OTP:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
