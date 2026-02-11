import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { whatsappCloudService } from '@/lib/services/integrations/whatsapp';
import { formatPhoneE164 } from '@/lib/services/integrations/whatsapp';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST: Enviar mensaje via WhatsApp Cloud API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      channel_id,
      to,
      type = 'text',
      text,
      template,
      image,
      document,
      audio,
      video,
      conversation_id,
      organization_id,
    } = body;

    if (!channel_id || !to) {
      return NextResponse.json(
        { error: 'channel_id y to son requeridos' },
        { status: 400 }
      );
    }

    // Obtener credenciales del canal
    const creds = await whatsappCloudService.getCredentialsByChannelId(channel_id);
    if (!creds || !creds.phoneNumberId || !creds.accessToken) {
      return NextResponse.json(
        { error: 'Credenciales no configuradas para este canal' },
        { status: 400 }
      );
    }

    // Construir payload según tipo
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    const formattedTo = formatPhoneE164(to);

    switch (type) {
      case 'text':
        if (!text?.body) {
          return NextResponse.json({ error: 'text.body es requerido' }, { status: 400 });
        }
        result = await whatsappCloudService.sendText(
          creds.phoneNumberId,
          creds.accessToken,
          formattedTo,
          text.body,
          text.preview_url
        );
        break;

      case 'template':
        if (!template?.name || !template?.language?.code) {
          return NextResponse.json(
            { error: 'template.name y template.language.code son requeridos' },
            { status: 400 }
          );
        }
        result = await whatsappCloudService.sendTemplate(
          creds.phoneNumberId,
          creds.accessToken,
          formattedTo,
          template.name,
          template.language.code,
          template.components
        );
        break;

      case 'image':
        if (!image?.link) {
          return NextResponse.json({ error: 'image.link es requerido' }, { status: 400 });
        }
        result = await whatsappCloudService.sendImage(
          creds.phoneNumberId,
          creds.accessToken,
          formattedTo,
          image.link,
          image.caption
        );
        break;

      case 'document':
        if (!document?.link) {
          return NextResponse.json({ error: 'document.link es requerido' }, { status: 400 });
        }
        result = await whatsappCloudService.sendDocument(
          creds.phoneNumberId,
          creds.accessToken,
          formattedTo,
          document.link,
          document.filename,
          document.caption
        );
        break;

      default:
        return NextResponse.json(
          { error: `Tipo de mensaje no soportado: ${type}` },
          { status: 400 }
        );
    }

    // Guardar mensaje en BD si hay conversation_id
    if (conversation_id && organization_id) {
      const externalId = result?.messages?.[0]?.id || null;

      await supabaseAdmin.from('messages').insert({
        conversation_id,
        organization_id,
        sender_type: 'member',
        role: 'agent',
        content_type: type,
        payload: type === 'text' ? { text: text.body } : body[type] || {},
        external_id: externalId,
        status: 'sent',
      });

      // Actualizar last_message_at
      await supabaseAdmin
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', conversation_id);
    }

    return NextResponse.json({
      success: true,
      message_id: result?.messages?.[0]?.id,
      data: result,
    });
  } catch (error: any) {
    console.error('[WhatsApp Send] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error enviando mensaje' },
      { status: 500 }
    );
  }
}
