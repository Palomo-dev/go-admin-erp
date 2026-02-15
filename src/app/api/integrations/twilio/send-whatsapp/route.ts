/**
 * API Route: Enviar WhatsApp via Twilio
 * POST /api/integrations/twilio/send-whatsapp
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { twilioService } from '@/lib/services/integrations/twilio';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const body = await request.json();
    const { orgId, to, message, module, mediaUrl } = body;

    if (!orgId || !to || !message) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos: orgId, to, message' },
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
