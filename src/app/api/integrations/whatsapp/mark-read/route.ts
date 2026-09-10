import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';

// POST: Marcar mensaje como leído en WhatsApp
// F0 (C2 msg): sesión + el canal debe pertenecer a la org activa.
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
    const { channel_id, message_id } = await request.json();

    if (!channel_id || !message_id) {
      return NextResponse.json(
        { error: 'channel_id y message_id son requeridos' },
        { status: 400 }
      );
    }

    const { data: channel } = await ctx.supabase
      .from('channels')
      .select('id')
      .eq('id', channel_id)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();
    if (!channel) {
      return NextResponse.json(
        { error: 'Canal no encontrado o no pertenece a la organización' },
        { status: 404 }
      );
    }

    // Obtener credenciales del canal
    const creds = await whatsappCloudService.getCredentialsByChannelId(channel_id);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return NextResponse.json(
        { error: 'Credenciales no configuradas para este canal' },
        { status: 400 }
      );
    }

    // Marcar como leído en WhatsApp
    const success = await whatsappCloudService.markAsRead(
      creds.phoneNumberId,
      creds.accessToken,
      message_id
    );

    return NextResponse.json({ success });
  } catch (error: any) {
    console.error('[WhatsApp Mark Read] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error marcando mensaje como leído' },
      { status: 500 }
    );
  }
}
