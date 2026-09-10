import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import OpenAIService from '@/lib/services/openaiService';
import { consumeAICredits } from '@/lib/services/aiCreditsService';

/**
 * POST /api/chat/ai/generate-summary
 * Seguridad (F0, C-B): org de sesión; `organizationId` del body solo se acepta si coincide.
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
    const supabase = ctx.supabase;
    const organizationId = ctx.organizationId;

    const body = await request.json();
    const { conversationId } = body;

    if (body.organizationId !== undefined && Number(body.organizationId) !== organizationId) {
      return NextResponse.json({ error: 'organizationId no coincide con la organización activa' }, { status: 403 });
    }

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId es requerido' },
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
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });

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

    const summaryResult = await openaiService.generateConversationSummary(context);

    // Descontar créditos de IA (1 crédito por resumen)
    const creditsConsumed = await consumeAICredits(organizationId, 1);
    if (!creditsConsumed) {
      console.warn('⚠️ No se pudieron descontar créditos de IA para org:', organizationId);
    }

    const { data: summaryRecord, error: summaryError } = await supabase
      .from('conversation_summaries')
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        summary: summaryResult.summary,
        key_points: summaryResult.keyPoints,
        sentiment: summaryResult.sentiment,
        generated_by: 'ai',
      })
      .select()
      .single();

    if (summaryError) {
      console.error('Error guardando resumen:', summaryError);
    }

    return NextResponse.json({
      success: true,
      summary: summaryResult.summary,
      keyPoints: summaryResult.keyPoints,
      sentiment: summaryResult.sentiment,
      summaryId: summaryRecord?.id,
    });
  } catch (error: any) {
    console.error('Error generando resumen:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
