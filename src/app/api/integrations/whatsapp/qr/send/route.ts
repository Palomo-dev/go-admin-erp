import { NextRequest, NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';
import { getServiceClient } from '@/lib/supabase/server-service';
import { requireOwnedChannel } from '../_shared';

// POST: Enviar mensaje via Baileys (Evolution API)
// F0 (C2/C20 msg): sesión + canal de la org activa; organization_id de sesión;
// el mensaje se persiste con la shape viva (direction/role/channel_id/content)
// y marcado como ya despachado (dispatch_channel 'baileys') para que
// trg_channel_dispatch no lo reenvíe.
export async function POST(request: NextRequest) {
  try {
    const { channel_id, to, text, media, conversation_id } = await request.json();
    if (!to) {
      return NextResponse.json({ error: 'channel_id y to son requeridos' }, { status: 400 });
    }
    const guard = await requireOwnedChannel(request, channel_id);
    if ('response' in guard) return guard.response;
    const { ctx } = guard;

    let result: { externalId: string | null };
    if (media) {
      result = await whatsappQrService.sendMedia(channel_id, to, media.type, media.url, media.caption);
    } else {
      if (!text) {
        return NextResponse.json({ error: 'text o media es requerido' }, { status: 400 });
      }
      result = await whatsappQrService.sendText(channel_id, to, text);
    }

    // Persistir mensaje saliente en BD (solo si la conversación es de la org)
    if (conversation_id) {
      const service = getServiceClient();
      const { data: conv } = await service
        .from('conversations')
        .select('id')
        .eq('id', conversation_id)
        .eq('organization_id', ctx.organizationId)
        .eq('channel_id', channel_id)
        .maybeSingle();

      if (conv) {
        await service.from('messages').insert({
          organization_id: ctx.organizationId,
          conversation_id,
          channel_id,
          direction: 'outbound',
          role: 'agent',
          content_type: media ? media.type : 'text',
          content: media ? (media.caption || `[${media.type}]`) : text,
          sender_member_id: ctx.memberId,
          payload: media ? { url: media.url, caption: media.caption } : { text },
          external_message_id: result.externalId,
          is_read: true,
          metadata: { dispatched: true, dispatching: false, dispatch_channel: 'baileys', source: 'qr_send' },
        });
        await service
          .from('conversations')
          .update({ last_message_at: new Date().toISOString(), last_agent_message_at: new Date().toISOString() })
          .eq('id', conversation_id)
          .eq('organization_id', ctx.organizationId);
      }
    }

    return NextResponse.json({ success: true, message_id: result.externalId });
  } catch (error) {
    console.error('[WhatsApp QR send] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
