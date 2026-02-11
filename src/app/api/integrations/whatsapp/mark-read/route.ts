import { NextRequest, NextResponse } from 'next/server';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';

// POST: Marcar mensaje como leído en WhatsApp
export async function POST(request: NextRequest) {
  try {
    const { channel_id, message_id } = await request.json();

    if (!channel_id || !message_id) {
      return NextResponse.json(
        { error: 'channel_id y message_id son requeridos' },
        { status: 400 }
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
