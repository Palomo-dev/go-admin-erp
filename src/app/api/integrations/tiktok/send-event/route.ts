import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tiktokMarketingService } from '@/lib/services/integrations/tiktok';

/**
 * POST /api/integrations/tiktok/send-event
 * Enviar evento(s) a la Events API de TikTok.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { connection_id, events } = await request.json();

    if (!connection_id || !events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: 'Se requieren connection_id y events[]' },
        { status: 400 }
      );
    }

    const creds = await tiktokMarketingService.getCredentials(connection_id);
    if (!creds?.accessToken || !creds?.pixelCode) {
      return NextResponse.json(
        { error: 'Credenciales de TikTok incompletas (falta access_token o pixel_code)' },
        { status: 400 }
      );
    }

    const result = await tiktokMarketingService.sendEvent(
      creds.accessToken,
      creds.pixelCode,
      events
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error in TikTok send event:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al enviar evento' },
      { status: 500 }
    );
  }
}
