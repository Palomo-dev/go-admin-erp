/**
 * GET /api/crm/voice-agents/campaigns — Lista las campañas de agentes de voz.
 * POST /api/crm/voice-agents/campaigns — Crea una nueva campaña.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getVoiceAgentCampaigns,
  createCampaign,
} from '@/lib/services/crm/voiceAgentService';

export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const campaigns = await getVoiceAgentCampaigns(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: campaigns }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Campaigns] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.voice_agent_id) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, voice_agent_id' },
        { status: 400 }
      );
    }

    const campaign = await createCampaign(
      ctx.organizationId,
      {
        voice_agent_id: body.voice_agent_id,
        name: body.name,
        objective: body.objective,
        target_source: body.target_source,
        target_config: body.target_config,
        schedule: body.schedule,
        max_calls_per_day: body.max_calls_per_day,
        max_concurrent: body.max_concurrent,
        status: body.status,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: campaign }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Campaigns] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
