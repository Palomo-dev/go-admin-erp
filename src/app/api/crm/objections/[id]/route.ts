import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { objectionCatalogSchema } from '@/lib/services/crm/objectionCatalogSchema';
import { exigirUuid } from '@/lib/services/crm/crmErrors';
import { readOrgBody } from '@/lib/security/organizationBody';
import { updateObjection, deleteObjection } from '@/lib/services/crm/objectionService';

/**
 * PATCH /api/crm/objections/[id] — Actualiza una objection.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw=await readOrgBody(ctx, request);
    const { id } = await params;exigirUuid(id);await requireOrgAdminOrPermission(ctx);
    const clean={...raw};for(const key of ['organization_id','organizationId','org_id','orgId'])delete clean[key];
    const parsed=objectionCatalogSchema.partial().refine(value=>Object.keys(value).some(key=>key!=='expected_updated_at')).safeParse(clean);
    if(!parsed.success)return NextResponse.json({success:false,error:'datos_invalidos'},{status:400});
    const body=parsed.data;


    // Solo las columnas editables: ni id, ni organization_id, ni fechas del body.
    const { title, category, detection_signals, recommended_response, discovery_questions, related_case_studies, vertical_id, is_active, sort_order } = body ?? {};
    const objection = await updateObjection(
      id,
      ctx.organizationId,
      { title, category, detection_signals, recommended_response, discovery_questions, related_case_studies, vertical_id, is_active, sort_order },
      ctx.supabase,body.expected_updated_at
    );

    if (!objection) {
      return NextResponse.json(
        { success: false, error: 'Objection no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: objection }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] PATCH error:', message);
    return respuestaErrorCrm(error,'objections.catalog');
  }
}

/**
 * DELETE /api/crm/objections/[id] — Elimina una objection.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    await readOrgBody(ctx, request);await requireOrgAdminOrPermission(ctx);
    const { id } = await params;exigirUuid(id);

    await deleteObjection(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] DELETE error:', message);
    return respuestaErrorCrm(error,'objections.catalog');
  }
}
