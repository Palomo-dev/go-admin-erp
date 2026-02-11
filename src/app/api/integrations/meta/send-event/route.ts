import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { metaMarketingService } from '@/lib/services/integrations/meta';
import type { CAPIEventData } from '@/lib/services/integrations/meta';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await request.json();
    const { connection_id, events } = body as {
      connection_id: string;
      events: CAPIEventData[];
    };

    if (!connection_id || !events || events.length === 0) {
      return NextResponse.json(
        { error: 'connection_id y events son requeridos' },
        { status: 400 }
      );
    }

    const credentials = await metaMarketingService.getCredentials(connection_id);
    if (!credentials?.accessToken || !credentials?.pixelId) {
      return NextResponse.json(
        { error: 'No se encontraron credenciales de Meta Marketing (access_token y pixel_id requeridos)' },
        { status: 404 }
      );
    }

    const result = await metaMarketingService.sendEvent(
      credentials.accessToken,
      credentials.pixelId,
      events
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error sending Meta CAPI event:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al enviar evento' },
      { status: 500 }
    );
  }
}
