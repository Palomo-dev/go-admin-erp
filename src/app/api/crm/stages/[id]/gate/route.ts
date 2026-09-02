import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import StageGateService from '@/lib/services/crm/stageGateService';

/**
 * POST /api/crm/stages/[id]/gate — Evalúa el exit_criteria de una etapa contra una oportunidad.
 * Soft-gate: devuelve info de requisitos cumplidos/no cumplidos, no bloquea.
 *
 * Body: { opportunityId: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id: stageId } = await params;

    const body = await request.json();

    if (!body?.opportunityId) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: opportunityId' },
        { status: 400 }
      );
    }

    // 1. Verificar que la etapa pertenece a un pipeline de la organización
    const { data: stage, error: stageError } = await ctx.supabase
      .from('stages')
      .select(`
        id,
        name,
        exit_criteria,
        pipelines!inner(organization_id)
      `)
      .eq('id', stageId)
      .maybeSingle();

    if (stageError) {
      throw stageError;
    }

    if (!stage) {
      return NextResponse.json(
        { success: false, error: 'Etapa no encontrada' },
        { status: 404 }
      );
    }

    const stageOrgId = (stage.pipelines as { organization_id: number }).organization_id;
    if (stageOrgId !== ctx.organizationId) {
      return NextResponse.json(
        { success: false, error: 'La etapa no pertenece a la organización' },
        { status: 403 }
      );
    }

    // 2. Verificar que la oportunidad pertenece a la organización
    const { data: opportunity, error: oppError } = await ctx.supabase
      .from('opportunities')
      .select('id, organization_id')
      .eq('id', body.opportunityId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle();

    if (oppError) {
      throw oppError;
    }

    if (!opportunity) {
      return NextResponse.json(
        { success: false, error: 'Oportunidad no encontrada en la organización' },
        { status: 404 }
      );
    }

    // 3. Evaluar el gate usando el servicio
    const gateService = new StageGateService(ctx.organizationId);
    const result = await gateService.evaluateStageGate(body.opportunityId, stageId);

    return NextResponse.json(
      {
        success: true,
        data: {
          stageId,
          stageName: stage.name,
          opportunityId: body.opportunityId,
          ...result,
        },
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
    console.error('[CRM Stages Gate] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
