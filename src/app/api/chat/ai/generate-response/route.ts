import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAIService from '@/lib/services/openaiService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, organizationId } = body;

    if (!conversationId || !organizationId) {
      return NextResponse.json(
        { error: 'conversationId y organizationId son requeridos' },
        { status: 400 }
      );
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        *,
        customer:customers!customer_id (
          id,
          full_name,
          email
        ),
        channel:channels!channel_id (
          id,
          type,
          name
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

    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('content, role, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    if (msgError) {
      return NextResponse.json(
        { error: 'Error obteniendo mensajes' },
        { status: 500 }
      );
    }

    const openaiService = new OpenAIService();

    const context = {
      customerName: conversation.customer?.full_name || 'Cliente',
      customerEmail: conversation.customer?.email,
      channelType: conversation.channel?.type || 'chat',
      conversationHistory: (messages || []).map((msg: any) => ({
        role: msg.role as 'customer' | 'agent' | 'ai',
        content: msg.content,
        timestamp: msg.created_at,
      })),
    };

    const response = await openaiService.generateSuggestedResponse(context);

    const cost = openaiService.calculateCost(response.usage, response.model);

    const { data: aiJob, error: jobError } = await supabase
      .from('ai_jobs')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        job_type: 'response',
        status: 'completed',
        response_text: response.content,
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_cost: cost,
        completed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) {
      console.error('Error guardando ai_job:', jobError);
    }

    return NextResponse.json({
      success: true,
      response: response.content,
      usage: response.usage,
      cost,
      jobId: aiJob?.id,
    });
  } catch (error: any) {
    console.error('Error generando respuesta IA:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
