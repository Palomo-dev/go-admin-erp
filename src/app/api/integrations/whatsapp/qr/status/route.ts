import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';

// GET: Estado + QR de una sesión Baileys
export async function GET(request: NextRequest) {
  try {
    const channelId = request.nextUrl.searchParams.get('channel_id');
    if (!channelId) {
      return NextResponse.json({ error: 'channel_id es requerido' }, { status: 400 });
    }
    const status = await whatsappQrService.getStatus(channelId);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[WhatsApp QR status] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
