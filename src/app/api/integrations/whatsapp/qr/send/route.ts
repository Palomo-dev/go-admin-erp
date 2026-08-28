import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';

// POST: Enviar mensaje via Baileys
export async function POST(request: NextRequest) {
  try {
    const { channel_id, to, text, media, conversation_id, organization_id } = await request.json();
    if (!channel_id || !to) {
      return NextResponse.json({ error: 'channel_id y to son requeridos' }, { status: 400 });
    }

    let result: { externalId: string | null };
    if (media) {
      result = await whatsappQrService.sendMedia(channel_id, to, media.type, media.url, media.caption);
    } else {
      if (!text) {
        return NextResponse.json({ error: 'text o media es requerido' }, { status: 400 });
      }
      result = await whatsappQrService.sendText(channel_id, to, text);
    }

    // Persistir mensaje saliente en BD
    if (conversation_id && organization_id) {
      const { getSupabaseAdmin } = await import('@/lib/supabase/admin');
      await getSupabaseAdmin().from('messages').insert({
        conversation_id,
        organization_id,
        sender_type: 'member',
        role: 'agent',
        content_type: media ? media.type : 'text',
        payload: media ? { url: media.url, caption: media.caption } : { text },
        external_id: result.externalId,
        status: 'sent',
      });
      await getSupabaseAdmin()
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), last_agent_message_at: new Date().toISOString() })
        .eq('id', conversation_id);
    }

    return NextResponse.json({ success: true, message_id: result.externalId });
  } catch (error) {
    console.error('[WhatsApp QR send] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
