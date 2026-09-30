import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, CrmHttpError, exigirPermisoCrm, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { getPipelineTemplateById } from '@/lib/services/crm/pipelineTemplates';
import { crearPipeline, datosDePipeline } from '@/lib/services/crm/pipelineWriteService';

/**
 * POST /api/crm/pipeline-templates/[id]/import — Importa una plantilla de pipeline
 * creando un pipeline + sus etapas para la organización.
 *
 * CRM ola 1 (M6/M7): exige `crm.pipelines.manage` (antes, rol de administrador)
 * y crea pipeline y etapas en UNA transacción con
 * `crm_create_pipeline_with_stages` (antes, dos escrituras y un borrado
 * compensatorio). Mismo servicio que `POST /api/crm/pipelines`.
 *
 * Body opcional: { pipelineName?: string, setAsDefault?: boolean }
 * 201 { pipelineId, pipelineName, templateId, templateName, stagesCreated, isDefault }
 * 404 plantilla · 409 `nombre_duplicado` (ya existe un pipeline con ese nombre)
 * · 400 plantilla sin etapas (la «en blanco» no es importable: un pipeline sin
 * etapa ganadora no puede cerrar ventas).
 */
const bodySchema = z
  .object({ pipelineName: z.string().trim().min(1).max(120).optional(), setAsDefault: z.boolean().optional() })
  .strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.pipelinesGestionar], 'POST /api/crm/pipeline-templates/[id]/import');

    const { id: templateId } = await params;
    const template = getPipelineTemplateById(templateId);
    if (!template) throw new CrmHttpError(404, 'plantilla_no_encontrada', `Plantilla no encontrada: ${templateId}`);

    const parsed = bodySchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const datos = datosDePipeline({ name: parsed.data.pipelineName, is_default: parsed.data.setAsDefault ?? false }, template);
    if (!datos) throw new CrmHttpError(400, 'sin_etapas', 'La plantilla no trae etapas; crea el pipeline con sus etapas');

    const creado = await crearPipeline(ctx, datos);
    const pipeline = creado.pipeline as { id: string; name: string; is_default: boolean | null };
    return NextResponse.json(
      {
        success: true,
        data: {
          pipelineId: pipeline.id,
          pipelineName: pipeline.name,
          templateId: template.key,
          templateName: template.label,
          stagesCreated: creado.stages.length,
          isDefault: Boolean(pipeline.is_default),
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'POST /api/crm/pipeline-templates/[id]/import');
  }
}
