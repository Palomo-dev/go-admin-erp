import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';
import { requireOwnedChannel } from '../_shared';

// POST: Detener sesión (mantiene creds para reconexión)
// F0 (C2 msg): sesión + canal de la org activa.
export async function POST(request: NextRequest) {
  try {
    const { channel_id } = await request.json();
    const guard = await requireOwnedChannel(request, channel_id);
    if ('response' in guard) return guard.response;

    await whatsappQrService.stopSession(channel_id);
    return NextResponse.json({ success: true, status: 'disconnected' });
  } catch (error) {
    console.error('[WhatsApp QR stop] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
