import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { CRM_PERMISOS, exigirPermisoCrm, exigirUuid, respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { eliminarPipeline, marcarPipelinePorDefecto } from '@/lib/services/crm/pipelineWriteService';

/**
 * /api/crm/pipelines/[id] — CRM ola 1 (plan §4.3, M6). `crm.pipelines.manage`.
 *
 * PATCH  { is_default: true } → `crm_set_default_pipeline` (uno por organización).
 * DELETE → `crm_delete_pipeline`: 409 `pipeline_con_oportunidades` si tiene
 *          alguna (la FK de opportunities es ON DELETE CASCADE: borrarlo las
 *          borraría).
 */
const patchSchema = z.object({ is_default: z.literal(true) }).strict();

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    const body: Record<string, unknown> = await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.pipelinesGestionar], 'PATCH /api/crm/pipelines/[id]');
    const parsed = patchSchema.safeParse(sinClavesDeOrganizacion(body));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Datos inválidos', details: parsed.error.flatten() }, { status: 400 });
    }
    const data = await marcarPipelinePorDefecto(ctx, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'PATCH /api/crm/pipelines/[id]');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);
    const id = exigirUuid((await params).id);
    await exigirPermisoCrm(ctx, [CRM_PERMISOS.pipelinesGestionar], 'DELETE /api/crm/pipelines/[id]');
    const data = await eliminarPipeline(ctx, id);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return respuestaErrorCrm(error, 'DELETE /api/crm/pipelines/[id]');
  }
}
