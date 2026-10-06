/**
 * POST /api/crm/voice-agents/test — «Probar» del editor de agentes (Figma
 * 1318:775924): un turno de conversación de PRUEBA por texto, sin marcar ni
 * ejecutar herramientas. Body: { agent_id?, draft?, customer, message, history }.
 *
 * Organización y permiso (`crm.campaigns.manage`) de la sesión; una
 * organización ajena en el body → 403 (`readOrgBody`). Sin créditos → 402,
 * sin cobrar. El cobro va después de la respuesta (`chargeAiCredits`).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { probarAgenteVoz } from '@/lib/services/crm/voiceAgentTestService';
import { InsufficientCreditsError } from '@/lib/services/crm/aiCostService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = (await readOrgBody(ctx, request)) as Record<string, unknown>;
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'POST /api/crm/voice-agents/test');
    const data = await probarAgenteVoz(ctx, sinClavesDeOrganizacion(body));
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json({ success: false, code: error.code, error: error.message }, { status: 402 });
    }
    return respuestaErrorCrm(error, 'POST /api/crm/voice-agents/test');
  }
}
