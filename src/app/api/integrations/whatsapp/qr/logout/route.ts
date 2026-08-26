import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';

// POST: Logout total (borra creds, requiere re-escaneo)
export async function POST(request: NextRequest) {
  try {
    const { channel_id } = await request.json();
    if (!channel_id) {
      return NextResponse.json({ error: 'channel_id es requerido' }, { status: 400 });
    }
    await whatsappQrService.logoutSession(channel_id);
    return NextResponse.json({ success: true, status: 'disconnected', cleared: true });
  } catch (error) {
    console.error('[WhatsApp QR logout] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
