/**
 * POST /api/crm/voice-agents/campaigns/preview-audience — vista previa de la
 * audiencia del asistente de campañas de voz (paso 2, Figma CRM 1681:856945).
 *
 * Body: { target_source, target_config }. Devuelve cuántos objetivos se
 * llamarán, cuántos se excluyen y por qué (baja voluntaria, lista de excluidos
 * de la organización, sin teléfono) y una muestra de 20 con el teléfono
 * enmascarado. No crea filas ni marca: solo lee (`campanaVozAudiencia.ts`).
 *
 * Organización de la sesión (una ajena en el body → 403, `readOrgBody`) y
 * permiso `crm.campaigns.manage` resuelto en el servidor (reglas duras 5 y 6).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { AudienciaPreviaError, previsualizarAudiencia } from '@/lib/services/crm/campanaVozAudiencia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const body = (await readOrgBody(ctx, request)) as Record<string, unknown> | null;
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.campanasGestionar], 'POST /api/crm/voice-agents/campaigns/preview-audience');
    const data = await previsualizarAudiencia(ctx.organizationId, ctx.supabase, {
      target_source: body?.target_source,
      target_config: body?.target_config,
    });
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AudienciaPreviaError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    return respuestaErrorCrm(error, 'POST /api/crm/voice-agents/campaigns/preview-audience');
  }
}
