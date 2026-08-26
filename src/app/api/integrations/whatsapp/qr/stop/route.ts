import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';

// POST: Detener sesión (mantiene creds para reconexión)
export async function POST(request: NextRequest) {
  try {
    const { channel_id } = await request.json();
    if (!channel_id) {
      return NextResponse.json({ error: 'channel_id es requerido' }, { status: 400 });
    }
    await whatsappQrService.stopSession(channel_id);
    return NextResponse.json({ success: true, status: 'disconnected' });
  } catch (error) {
    console.error('[WhatsApp QR stop] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
