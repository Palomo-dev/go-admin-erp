import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getServiceClient } from '@/lib/supabase/server-service';
import OpenAIService from '@/lib/services/openaiService';
import { consumeAICredits } from '@/lib/services/aiCreditsService';
import { canAutoReply } from '@/lib/services/crm/whatsapp/consent';

/**
 * POST /api/chat/ai/auto-response
 *
 * Seguridad (F0, C-A): requiere sesión; la organización SIEMPRE sale de
 * `getServerOrgContext()`. Si el body trae `organizationId`, debe coincidir
 * con la org activa (si no → 403). El cliente service-role solo se usa tras
 * verificar membership y siempre filtrando por `ctx.organizationId`.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const body = await request.json();
    const { conversationId, messageId } = body;
    const organizationId = ctx.organizationId;

    if (body.organizationId !== undefined && Number(body.organizationId) !== organizationId) {
      return NextResponse.json({ error: 'organizationId no coincide con la organización activa' }, { status: 403 });
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId es requerido' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // Obtener conversación con canal y cliente
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        customer:customers!customer_id (
          id,
          full_name,
          first_name,
          last_name,
          email
        ),
        channel:channels!channel_id (
          id,
          type,
          name,
          ai_mode
        )
      `)
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversación no encontrada' },
        { status: 404 }
      );
    }

    // Verificar si el canal tiene IA habilitada
    const aiMode = conversation.channel?.ai_mode;
    if (aiMode === 'manual') {
      return NextResponse.json({
        success: false,
        reason: 'Canal en modo manual, IA deshabilitada',
      });
    }

    // Cumplimiento antes que nada (F16 · F-12): el INSERT en `messages` con
    // direction='outbound' y role='ai' dispara `trg_channel_dispatch`, así que
    // el mensaje SALE de verdad hacia Meta. Esta ruta no comprobaba ni el
    // opt-out del destinatario (Habeas Data, Ley 1581 de 2012) ni la ventana
    // de 24 h, saltándose los dos controles que sí aplica el envío manual por
    // `whatsappOutboundService`. Se comprueba ANTES de llamar al proveedor
    // para no gastar créditos de IA en una respuesta que no puede salir.
    const gate = await canAutoReply(
      {
        orgId: organizationId,
        conversationId,
        channelType: conversation.channel?.type ?? null,
        customerId: conversation.customer?.id ?? conversation.customer_id ?? null,
      },
      supabase,
    );
    if (!gate.allowed) {
      console.warn('[auto-response] bloqueada por cumplimiento', {
        organization_id: organizationId,
        conversation_id: conversationId,
        reason: gate.reason,
      });
      return NextResponse.json({ success: false, reason: gate.message, code: gate.reason });
    }

    // Obtener configuración de IA de la organización
    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (!aiSettings?.is_active) {
      return NextResponse.json({
        success: false,
        reason: 'IA no está activa para esta organización',
      });
    }

    // Verificar si hay créditos de IA suficientes (mínimo 1 crédito)
    if (aiSettings.credits_remaining !== null && aiSettings.credits_remaining < 1) {
      return NextResponse.json({
        success: false,
        reason: 'No hay créditos de IA suficientes',
        credits_remaining: aiSettings.credits_remaining,
      });
    }

    // Obtener historial de mensajes
    const { data: messages } = await supabase
      .from('messages')
      .select('content, role, direction, created_at')
      .eq('conversation_id', conversationId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .limit(20);

    const customerName = conversation.customer?.full_name ||
                         `${conversation.customer?.first_name || ''} ${conversation.customer?.last_name || ''}`.trim() ||
                         'Cliente';

    const openaiService = new OpenAIService();

    // Construir contexto de la conversación
    const context = {
      customerName,
      customerEmail: conversation.customer?.email,
      channelType: conversation.channel?.type || 'widget',
      conversationHistory: (messages || []).map((msg: { role: string; content: string; created_at: string }) => ({
        role: msg.role as 'customer' | 'agent' | 'ai',
        content: msg.content,
        timestamp: msg.created_at,
      })),
    };

    // Generar respuesta con IA
    const response = await openaiService.generateAutoResponse(context);
    const cost = await openaiService.calculateCost(supabase, response.usage, response.model);

    // Insertar mensaje de respuesta de IA
    const { data: aiMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        channel_id: conversation.channel_id,
        direction: 'outbound',
        role: 'ai',
        content_type: 'text',
        content: response.content,
        is_read: true,
        metadata: {
          source: 'auto_response',
          model: response.model,
          tokens: response.usage.totalTokens,
          cost,
        },
      })
      .select()
      .single();

    if (msgError) {
      console.error('Error insertando mensaje IA:', msgError);
      return NextResponse.json(
        { error: 'Error guardando respuesta de IA' },
        { status: 500 }
      );
    }

    // Registrar en ai_jobs
    await supabase.from('ai_jobs').insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      trigger_message_id: messageId,
      result_message_id: aiMessage.id,
      job_type: 'auto_response',
      status: 'completed',
      response_text: response.content,
      prompt_tokens: response.usage.promptTokens,
      completion_tokens: response.usage.completionTokens,
      total_cost: cost,
      completed_at: new Date().toISOString(),
    });

    // Descontar créditos de IA (1 crédito por respuesta)
    const creditsConsumed = await consumeAICredits(organizationId, 1);
    if (!creditsConsumed) {
      console.warn('⚠️ No se pudieron descontar créditos de IA para org:', organizationId);
    }

    // Actualizar last_message_at de la conversación
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_agent_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('organization_id', organizationId);

    return NextResponse.json({
      success: true,
      messageId: aiMessage.id,
      content: response.content,
      usage: response.usage,
      cost,
    });
  } catch (error: unknown) {
    console.error('Error en auto-response:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
