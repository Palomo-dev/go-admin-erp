import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAIService from '@/lib/services/openaiService';
import { consumeAICredits } from '@/lib/services/aiCreditsService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, messageId, organizationId } = body;

    if (!conversationId || !organizationId) {
      return NextResponse.json(
        { error: 'conversationId y organizationId son requeridos' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
      conversationHistory: (messages || []).map((msg: any) => ({
        role: msg.role as 'customer' | 'agent' | 'ai',
        content: msg.content,
        timestamp: msg.created_at,
      })),
    };

    // Configurar opciones desde ai_settings
    const options = {
      model: aiSettings.model,
      temperature: parseFloat(aiSettings.temperature) || 0.7,
      maxTokens: aiSettings.max_tokens || 500,
      organizationConfig: {
        provider: aiSettings.provider,
        model: aiSettings.model,
        temperature: parseFloat(aiSettings.temperature) || 0.7,
        maxTokens: aiSettings.max_tokens || 500,
        systemRules: aiSettings.system_rules,
        tone: aiSettings.tone || 'professional',
        language: aiSettings.language || 'es',
        fallbackMessage: aiSettings.fallback_message,
        confidenceThreshold: parseFloat(aiSettings.confidence_threshold) || 0.7,
        maxFragmentsContext: aiSettings.max_fragments_context || 5,
        isActive: aiSettings.is_active,
      },
    };

    // Generar respuesta con IA
    const response = await openaiService.generateAutoResponse(context);
    const cost = openaiService.calculateCost(response.usage, response.model);

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
      .eq('id', conversationId);

    return NextResponse.json({
      success: true,
      messageId: aiMessage.id,
      content: response.content,
      usage: response.usage,
      cost,
    });
  } catch (error: any) {
    console.error('Error en auto-response:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
