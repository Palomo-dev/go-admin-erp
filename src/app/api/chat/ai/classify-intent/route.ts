import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import OpenAIService from '@/lib/services/openaiService';
import { consumeAICredits } from '@/lib/services/aiCreditsService';

/**
 * POST /api/chat/ai/classify-intent
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
    const { message, conversationId } = body;

    if (body.organizationId !== undefined && Number(body.organizationId) !== organizationId) {
      return NextResponse.json({ error: 'organizationId no coincide con la organización activa' }, { status: 403 });
    }

    if (!message) {
      return NextResponse.json(
        { error: 'message es requerido' },
        { status: 400 }
      );
    }

    // Verificar créditos de IA
    const { data: aiSettings } = await supabase
      .from('ai_settings')
      .select('credits_remaining, is_active')
      .eq('organization_id', organizationId)
      .single();

    if (!aiSettings?.is_active) {
      return NextResponse.json({
        success: false,
        error: 'IA no está activa para esta organización',
      }, { status: 400 });
    }

    if (aiSettings.credits_remaining !== null && aiSettings.credits_remaining < 1) {
      return NextResponse.json({
        success: false,
        error: 'No hay créditos de IA suficientes',
        credits_remaining: aiSettings.credits_remaining,
      }, { status: 400 });
    }

    const openaiService = new OpenAIService();
    const result = await openaiService.classifyIntent(message);

    // Descontar créditos de IA (1 crédito por clasificación)
    const creditsConsumed = await consumeAICredits(organizationId, 1);
    if (!creditsConsumed) {
      console.warn('⚠️ No se pudieron descontar créditos de IA para org:', organizationId);
    }

    if (conversationId && result.suggestedTags.length > 0) {
      const { data: existingTags } = await supabase
        .from('conversation_tags')
        .select('id, name')
        .eq('organization_id', organizationId)
        .in('name', result.suggestedTags);

      if (existingTags && existingTags.length > 0) {
        for (const tag of existingTags) {
          const { data: existing } = await supabase
            .from('conversation_tag_relations')
            .select('id')
            .eq('conversation_id', conversationId)
            .eq('tag_id', tag.id)
            .single();

          if (!existing) {
            await supabase
              .from('conversation_tag_relations')
              .insert({
                organization_id: organizationId,
                conversation_id: conversationId,
                tag_id: tag.id,
              });
          }
        }
      }
    }

    // Aplicar prioridad sugerida por la IA
    if (conversationId && result.suggestedPriority) {
      await supabase
        .from('conversations')
        .update({ priority: result.suggestedPriority, updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('organization_id', organizationId);
    }

    return NextResponse.json({
      success: true,
      intent: result.intent,
      confidence: result.confidence,
      suggestedTags: result.suggestedTags,
      suggestedPriority: result.suggestedPriority,
    });
  } catch (error: any) {
    console.error('Error clasificando intención:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
