/**
 * GET /api/crm/voice-agent-calls — Lista las llamadas de agentes de voz.
 *
 * Query params: voice_agent_id?, campaign_id?, status?, customer_id?, limit?, offset?
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getVoiceAgentCalls } from '@/lib/services/crm/voiceAgentService';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const { searchParams } = new URL(request.url);

    const filters = {
      voice_agent_id: searchParams.get('voice_agent_id') || undefined,
      campaign_id: searchParams.get('campaign_id') || undefined,
      status: (searchParams.get('status') as 'pending' | 'in_progress' | 'completed' | 'failed' | 'transferred') || undefined,
      customer_id: searchParams.get('customer_id') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined,
    };

    const calls = await getVoiceAgentCalls(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json({ success: true, data: calls }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agent Calls] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
