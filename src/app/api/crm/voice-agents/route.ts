/**
 * GET /api/crm/voice-agents — Lista los agentes de voz de la organización.
 * POST /api/crm/voice-agents — Crea un nuevo agente de voz.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getVoiceAgents,
  createVoiceAgent,
} from '@/lib/services/crm/voiceAgentService';

export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const agents = await getVoiceAgents(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: agents }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agents] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name' },
        { status: 400 }
      );
    }

    const agent = await createVoiceAgent(
      ctx.organizationId,
      {
        name: body.name,
        slug: body.slug,
        description: body.description,
        engine: body.engine,
        purpose_type: body.purpose_type,
        system_prompt: body.system_prompt,
        first_message: body.first_message,
        voice_provider: body.voice_provider,
        voice_id: body.voice_id,
        voice_settings: body.voice_settings,
        language: body.language,
        stt_provider: body.stt_provider,
        llm_provider: body.llm_provider,
        llm_model: body.llm_model,
        temperature: body.temperature,
        max_turns: body.max_turns,
        max_duration_seconds: body.max_duration_seconds,
        allowed_tools: body.allowed_tools,
        guardrails: body.guardrails,
        transfer_to_human_rules: body.transfer_to_human_rules,
        business_hours: body.business_hours,
        retry_policy: body.retry_policy,
        is_active: body.is_active,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: agent }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agents] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
