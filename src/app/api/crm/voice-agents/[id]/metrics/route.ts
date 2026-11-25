/**
 * GET /api/crm/voice-agents/[id]/metrics?periodo=30d — Detalle del agente
 * (Figma 1311:86823): KPI, cómo terminaron las llamadas, herramientas usadas
 * y las últimas llamadas. Agregado en SQL (`crm_voice_agents_metricas`), con
 * la sesión: RLS limita a la organización. 404 si el agente no es de ella.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getVoiceAgent } from '@/lib/services/crm/voiceAgentService';
import { getVoiceAgentMetrics, inicioDeMesEnZona, leerPeriodo } from '@/lib/services/crm/voiceAgentMetrics';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const agent = await getVoiceAgent(id, ctx.organizationId, ctx.supabase);
    if (!agent) {
      return NextResponse.json({ success: false, error: 'Agente no encontrado' }, { status: 404 });
    }
    const dias = leerPeriodo(request.nextUrl.searchParams.get('periodo'), 30);
    const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
    const data = await getVoiceAgentMetrics(ctx.organizationId, ctx.supabase, {
      dias,
      voiceAgentId: id,
      mesDesde: inicioDeMesEnZona(tz),
    });
    return NextResponse.json({ success: true, data: { ...data, dias, agente: agent } }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agents] GET [id]/metrics error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
