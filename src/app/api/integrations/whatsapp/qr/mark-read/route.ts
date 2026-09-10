import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';
import { requireOwnedChannel } from '../_shared';

// POST: Marcar mensaje como leído via Baileys
// F0 (C2 msg): sesión + canal de la org activa.
export async function POST(request: NextRequest) {
  try {
    const { channel_id, jid, message_id } = await request.json();
    if (!jid || !message_id) {
      return NextResponse.json({ error: 'channel_id, jid y message_id son requeridos' }, { status: 400 });
    }
    const guard = await requireOwnedChannel(request, channel_id);
    if ('response' in guard) return guard.response;

    const ok = await whatsappQrService.markAsRead(channel_id, jid, message_id);
    return NextResponse.json({ success: ok });
  } catch (error) {
    console.error('[WhatsApp QR mark-read] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
