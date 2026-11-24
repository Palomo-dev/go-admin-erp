/**
 * GET /api/crm/voice-agents/metrics?dias=7 — Cifras del listado de Agentes IA
 * (Figma 1298:84133): por agente (llamadas, contacto efectivo, agendadas),
 * totales de la ventana y de la anterior, créditos de voz del mes y etapas
 * asignadas. Agregado en SQL (`crm_voice_agents_metricas`), con la sesión.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getOrganizationTimezone } from '@/lib/services/organizationTimezoneService';
import { getVoiceAgentMetrics, inicioDeMesEnZona, leerPeriodo } from '@/lib/services/crm/voiceAgentMetrics';

export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const dias = leerPeriodo(request.nextUrl.searchParams.get('dias'), 7);
    const tz = await getOrganizationTimezone(ctx.organizationId, ctx.supabase);
    const data = await getVoiceAgentMetrics(ctx.organizationId, ctx.supabase, {
      dias,
      mesDesde: inicioDeMesEnZona(tz),
    });
    return NextResponse.json({ success: true, data: { ...data, dias } }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[Voice Agents] GET metrics error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
