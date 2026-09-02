import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import StageGateService from '@/lib/services/crm/stageGateService';

/**
 * POST /api/crm/leads/[id]/convert — Convierte un lead (record_type='lead') en deal (record_type='deal').
 *
 * Validaciones:
 * 1. El lead debe pertenecer a la organización del usuario.
 * 2. El record_type actual debe ser 'lead'.
 * 3. Evalúa el stage gate de la etapa actual (soft-gate: informa pero no bloquea).
 * 4. Requiere rol de admin de organización.
 *
 * Body opcional: { targetStageId?: string, skipGateCheck?: boolean }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();

    // Validar permisos de admin
    if (!isOrgAdmin(ctx)) {
      return NextResponse.json(
        { success: false, error: 'Se requieren permisos de administrador de organización' },
        { status: 403 }
      );
    }

    const { id: leadId } = await params;

    // Parsear body (puede estar vacío)
    let body: { targetStageId?: string; skipGateCheck?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Body vacío es válido
    }

    // 1. Obtener el lead y verificar que pertenece a la org y es record_type='lead'
    const { data: lead, error: leadError } = await ctx.supabase
      .from('opportunities')
      .select('id, record_type, stage_id, pipeline_id, organization_id, name')
      .eq('id', leadId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (leadError) {
      throw leadError;
    }

    if (!lead) {
      return NextResponse.json(
        { success: false, error: 'Lead no encontrado en la organización' },
        { status: 404 }
      );
    }

    if (lead.record_type !== 'lead') {
      return NextResponse.json(
        { success: false, error: `La oportunidad no es un lead (record_type actual: '${lead.record_type}')` },
        { status: 400 }
      );
    }

    // 2. Evaluar el stage gate de la etapa actual (soft-gate)
    const stageIdToEvaluate = body.targetStageId || lead.stage_id;
    let gateResult = null;

    if (!body.skipGateCheck && stageIdToEvaluate) {
      const gateService = new StageGateService(ctx.organizationId);
      gateResult = await gateService.evaluateStageGate(leadId, stageIdToEvaluate);
    }

    // 3. Convertir: cambiar record_type a 'deal'
    const updateData: { record_type: string; updated_at: string; stage_id?: string } = {
      record_type: 'deal',
      updated_at: new Date().toISOString(),
    };

    // Si se especifica una etapa destino, actualizarla
    if (body.targetStageId) {
      updateData.stage_id = body.targetStageId;
    }

    const { data: updated, error: updateError } = await ctx.supabase
      .from('opportunities')
      .update(updateData)
      .eq('id', leadId)
      .select('id, name, record_type, stage_id, pipeline_id, updated_at')
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json(
      {
        success: true,
        data: updated,
        gate: gateResult,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Leads Convert] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
