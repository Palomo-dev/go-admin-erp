import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { getPipelineTemplateById } from '@/lib/services/crm/pipelineTemplates';

/**
 * POST /api/crm/pipeline-templates/[id]/import — Importa una plantilla de pipeline
 * creando un pipeline + sus etapas para la organización.
 *
 * Requiere permisos de admin de organización.
 *
 * Body opcional: { pipelineName?: string, setAsDefault?: boolean }
 * - pipelineName: nombre personalizado para el pipeline (default: nombre de la plantilla)
 * - setAsDefault: si true, marca el pipeline como default (default: false)
 *
 * Idempotencia: si ya existe un pipeline con el mismo nombre para la org, no se duplica.
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

    const { id: templateId } = await params;

    // 1. Buscar la plantilla
    const template = getPipelineTemplateById(templateId);
    if (!template) {
      return NextResponse.json(
        { success: false, error: `Plantilla no encontrada: ${templateId}` },
        { status: 404 }
      );
    }

    // 2. Parsear body opcional
    let body: { pipelineName?: string; setAsDefault?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Body vacío es válido
    }

    const pipelineName = body.pipelineName || template.label;
    const setAsDefault = body.setAsDefault ?? false;

    // 3. Verificar idempotencia: si ya existe un pipeline con ese nombre para la org, no duplicar
    const { data: existingPipeline } = await ctx.supabase
      .from('pipelines')
      .select('id, name')
      .eq('organization_id', ctx.organizationId)
      .eq('name', pipelineName)
      .maybeSingle();

    if (existingPipeline) {
      return NextResponse.json(
        {
          success: false,
          error: `Ya existe un pipeline con el nombre "${pipelineName}" para la organización`,
          data: { existingPipelineId: (existingPipeline as { id: string }).id },
        },
        { status: 409 }
      );
    }

    // 4. Si setAsDefault, quitar el flag is_default de otros pipelines de la org
    if (setAsDefault) {
      await ctx.supabase
        .from('pipelines')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('organization_id', ctx.organizationId)
        .eq('is_default', true);
    }

    // 5. Crear el pipeline
    const { data: pipeline, error: pipelineError } = await ctx.supabase
      .from('pipelines')
      .insert({
        organization_id: ctx.organizationId,
        name: pipelineName,
        is_default: setAsDefault,
        pipeline_type: template.pipeline_type,
      })
      .select()
      .single();

    if (pipelineError) {
      throw pipelineError;
    }

    const pipelineData = pipeline as { id: string };
    const pipelineId = pipelineData.id;

    // 6. Crear las etapas
    const stagesToInsert = template.stages.map((stage) => ({
      pipeline_id: pipelineId,
      name: stage.name,
      position: stage.position,
      probability: stage.probability,
      is_won: stage.is_won,
      is_lost: stage.is_lost,
      sla_days: stage.sla_days,
      color: stage.color,
      exit_criteria: stage.exit_criteria ?? null,
    }));

    const { error: stagesError } = await ctx.supabase
      .from('stages')
      .insert(stagesToInsert);

    if (stagesError) {
      // Si falla la inserción de etapas, eliminar el pipeline huérfano
      await ctx.supabase.from('pipelines').delete().eq('id', pipelineId);
      throw stagesError;
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          pipelineId,
          pipelineName,
          templateId: template.key,
          templateName: template.label,
          stagesCreated: template.stages.length,
          isDefault: setAsDefault,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Pipeline Templates Import] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
