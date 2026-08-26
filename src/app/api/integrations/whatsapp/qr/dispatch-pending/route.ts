import { NextResponse } from 'next/server';
import { whatsappQrService } from '@/lib/services/integrations/whatsapp/whatsappQrService';
import { createClient } from '@supabase/supabase-js';

// POST: Despachar mensajes salientes pendientes de canales QR (Baileys)
// En desarrollo, la Edge Function en Supabase Cloud no puede alcanzar el
// microservicio en localhost. Este endpoint hace polling de mensajes
// marcados con dispatch_pending=true y los envía via el microservicio local.
export async function POST() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Buscar mensajes outbound no despachados en canales con sesión QR activa
    // La Edge Function channel-dispatch los marca con dispatched:false cuando
    // no encuentra credenciales Meta (porque es canal Baileys)
    const { data: qrSessions } = await supabase
      .from('whatsapp_qr_sessions')
      .select('channel_id')
      .eq('status', 'connected');

    if (!qrSessions?.length) {
      console.log('[dispatch-pending] No hay sesiones QR conectadas');
      return NextResponse.json({ dispatched: 0 });
    }

    const channelIds = qrSessions.map((s: { channel_id: string }) => s.channel_id);
    console.log('[dispatch-pending] Sesiones conectadas:', channelIds);

    // Query simple sin filtros JSONB complejos (PostgREST no maneja bien or+not en JSONB)
    const { data: allOutbound, error } = await supabase
      .from('messages')
      .select('id, content, channel_id, conversation_id, organization_id, metadata')
      .eq('direction', 'outbound')
      .in('role', ['agent', 'ai'])
      .in('channel_id', channelIds)
      .order('created_at', { ascending: true })
      .limit(50);

    // Filtrar en JS: no despachados, no ya intentados por baileys, y no en proceso de dispatch
    const pendingMessages = (allOutbound || []).filter((msg: { metadata?: Record<string, unknown> }) => {
      const meta = (msg.metadata || {}) as Record<string, unknown>;
      const dispatched = meta.dispatched;
      const dispatchChannel = meta.dispatch_channel;
      const dispatching = meta.dispatching;
      // Solo mensajes no despachados, no en proceso, y no ya intentados por canal baileys
      return (dispatched === false || dispatched === null || dispatched === undefined)
        && dispatching !== true
        && dispatchChannel !== 'baileys';
    });

    // Limitar a 1 mensaje por ciclo para evitar burst y bloqueo de WhatsApp
    const messagesToDispatch = pendingMessages.slice(0, 1);

    console.log('[dispatch-pending] Total outbound:', allOutbound?.length || 0, 'Pendientes:', pendingMessages.length, 'A despachar:', messagesToDispatch.length, 'error:', error?.message || 'none');

    if (error || !pendingMessages.length) {
      return NextResponse.json({ dispatched: 0 });
    }

    let dispatched = 0;
    let failed = 0;

    for (const msg of messagesToDispatch) {
      try {
        // Marcar como "dispatching" atómicamente para evitar duplicados por polling concurrente
        const { data: lockResult, error: lockError } = await supabase
          .from('messages')
          .update({
            metadata: {
              ...(msg.metadata || {}),
              dispatching: true,
            },
          })
          .eq('id', msg.id)
          .eq('direction', 'outbound')
          .filter('metadata->>dispatching', 'is', null)
          .select('id');

        if (lockError || !lockResult?.length) {
          // Otro proceso ya lo tomó
          continue;
        }

        // Obtener customer_id de la conversación
        const { data: conv } = await supabase
          .from('conversations')
          .select('customer_id')
          .eq('id', msg.conversation_id)
          .single();

        if (!conv?.customer_id) {
          failed++;
          continue;
        }

        // Resolver destinatario (phone del customer)
        const { data: customer } = await supabase
          .from('customers')
          .select('phone')
          .eq('id', conv.customer_id)
          .single();

        const phone = customer?.phone;
        if (!phone) {
          failed++;
          continue;
        }

        // Enviar via Evolution API
        try {
          console.log(`[dispatch-pending] Enviando a ${phone}: ${msg.content?.substring(0, 50)}...`);
          await whatsappQrService.sendText(msg.channel_id, phone, msg.content || '');
          console.log(`[dispatch-pending] Enviado OK a ${phone}`);
          await supabase
            .from('messages')
            .update({
              metadata: {
                ...(msg.metadata || {}),
                dispatched: true,
                dispatching: false,
                dispatch_channel: 'baileys',
                dispatch_pending: false,
              },
            })
            .eq('id', msg.id);
          dispatched++;
        } catch (sendErr) {
          await supabase
            .from('messages')
            .update({
              metadata: {
                ...(msg.metadata || {}),
                dispatched: false,
                dispatching: false,
                dispatch_channel: 'baileys',
                dispatch_pending: false,
                dispatch_error: sendErr instanceof Error ? sendErr.message : 'Error enviando',
              },
            })
            .eq('id', msg.id);
          failed++;
        }
      } catch {
        failed++;
      }
    }

    return NextResponse.json({ dispatched, failed, total: messagesToDispatch.length, remaining: pendingMessages.length - messagesToDispatch.length });
  } catch (error) {
    console.error('[WhatsApp QR dispatch-pending] Error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 });
  }
}
