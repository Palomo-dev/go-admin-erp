import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';

// POST: Iniciar sesión Baileys (genera QR si no hay creds)
export async function POST(request: NextRequest) {
  try {
    const { channel_id } = await request.json();
    if (!channel_id) {
      return NextResponse.json({ error: 'channel_id es requerido' }, { status: 400 });
    }
    const status = await whatsappQrService.startSession(channel_id);
    return NextResponse.json(status);
  } catch (error) {
    console.error('[WhatsApp QR start] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
