import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { exigirUuid,respuestaErrorCrm,CrmHttpError } from '@/lib/services/crm/crmRouteSupport';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  getOpportunityObjections,
  addOpportunityObjection,
  resolveOpportunityObjection,
  ObjectionRequestError,
} from '@/lib/services/crm/objectionService';

/**
 * GET /api/crm/objections/opportunity/[opportunityId] — Lista las objections de una oportunidad.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx,{}, {request});
    const { opportunityId } = await params;exigirUuid(opportunityId);

    await requireOrgAdminOrPermission(ctx,'crm.opportunities.view');
    const opportunity=await ctx.supabase.from('opportunities').select('branch_id,salesperson_id').eq('organization_id',ctx.organizationId).eq('id',opportunityId).maybeSingle();
    if(opportunity.error)throw opportunity.error;if(!opportunity.data)throw new CrmHttpError(404,'oportunidad_no_encontrada','Oportunidad no encontrada');
    const branch=await ctx.supabase.rpc('app_branch_access',{p_branch_id:opportunity.data.branch_id});if(branch.error)throw branch.error;if(branch.data!==true)throw new CrmHttpError(403,'sin_permiso','sin_permiso');
    let canRegister=false;try{await requireOrgAdminOrPermission(ctx,'crm.opportunities.edit');if(opportunity.data.salesperson_id!==ctx.userId)await requireOrgAdminOrPermission(ctx,'crm.opportunities.edit_any');canRegister=true;}catch(error){if(!(error instanceof OrgContextError))throw error;}
    const objections = await getOpportunityObjections(opportunityId, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: objections,canRegister }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections Opportunity] GET error:', message);
    return respuestaErrorCrm(error,'objections.opportunity');
  }
}

/**
 * POST /api/crm/objections/opportunity/[opportunityId] — Vincula una objection a una oportunidad.
 * Body: { objection_id, notes? } | { resolveId } — marca una opportunity_objection como resuelta.
 * La oportunidad sale SOLO de la ruta (un `opportunity_id` en el body se ignora) y
 * `detected_by` es siempre 'manual' desde aquí: la IA escribe por otro camino.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ opportunityId: string }> }
) {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx,{}, {request});
    const body = await readOrgBody(ctx, request);
    const { opportunityId } = await params;exigirUuid(opportunityId);await requireOrgAdminOrPermission(ctx,'crm.opportunities.edit');


    if(body.resolveId&&body.objection_id)return NextResponse.json({success:false,error:'datos_invalidos'},{status:400});
    // Si viene resolveId en el body, resolver en lugar de vincular
    if (body?.resolveId) {exigirUuid(body.resolveId);
      const resolved = await resolveOpportunityObjection(body.resolveId, ctx.organizationId, ctx.supabase,opportunityId);
      return NextResponse.json({ success: true, data: resolved }, { status: 200 });
    }

    if (!body?.objection_id) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo obligatorio: objection_id' },
        { status: 400 }
      );
    }

    exigirUuid(body.objection_id);
    const result = await addOpportunityObjection(
      ctx.organizationId,
      opportunityId,
      body.objection_id,
      { notes: body.notes, detected_by: 'manual' },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  } catch (error: unknown) {
    // ObjectionRequestError cubre 404 (no encontrada) y 400 (nota > NOTES_MAX): el statusCode viaja tal cual.
    if (error instanceof OrgContextError || error instanceof ObjectionRequestError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections Opportunity] POST error:', message);
    return respuestaErrorCrm(error,'objections.opportunity');
  }
}
