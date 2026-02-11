import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import OpenAIService from '@/lib/services/openaiService';
import { consumeAICredits } from '@/lib/services/aiCreditsService';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { message, conversationId, organizationId } = body;

    if (!message || !organizationId) {
      return NextResponse.json(
        { error: 'message y organizationId son requeridos' },
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

    if (conversationId && organizationId && result.suggestedTags.length > 0) {
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

    return NextResponse.json({
      success: true,
      intent: result.intent,
      confidence: result.confidence,
      suggestedTags: result.suggestedTags,
    });
  } catch (error: any) {
    console.error('Error clasificando intención:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
