import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';
import { requireOwnedChannel } from '../_shared';

// GET: Estado + QR de una sesión Baileys
// F0 (C2 msg): sesión + canal de la org activa.
export async function GET(request: NextRequest) {
  try {
    const channelId = request.nextUrl.searchParams.get('channel_id');
    const guard = await requireOwnedChannel(request, channelId);
    if ('response' in guard) return guard.response;

    const status = await whatsappQrService.getStatus(channelId as string);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[WhatsApp QR status] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
