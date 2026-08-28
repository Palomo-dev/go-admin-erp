import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';

// POST: Marcar mensaje como leído via Baileys
export async function POST(request: NextRequest) {
  try {
    const { channel_id, jid, message_id } = await request.json();
    if (!channel_id || !jid || !message_id) {
      return NextResponse.json({ error: 'channel_id, jid y message_id son requeridos' }, { status: 400 });
    }
    const ok = await whatsappQrService.markAsRead(channel_id, jid, message_id);
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error('[WhatsApp QR mark-read] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
