import { respuestaErrorCrm } from '@/lib/services/crm/crmRouteSupport';
import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError, requireOrgAdminOrPermission } from '@/lib/utils/orgContext';
import { objectionCatalogSchema } from '@/lib/services/crm/objectionCatalogSchema';
import { readOrgBody } from '@/lib/security/organizationBody';
import {
  getObjections,
  createObjection,
} from '@/lib/services/crm/objectionService';

/**
 * GET /api/crm/objections — Lista las objections de la organización.
 * Query params opcionales: category, vertical_id, includeInactive
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const { searchParams } = new URL(request.url);

    const filters = {
      category: searchParams.get('category') || undefined,
      vertical_id: searchParams.get('vertical_id') || undefined,
      includeInactive: searchParams.get('includeInactive') === 'true',
    };

    readOrgBody(ctx,{}, {request});
    let canManage=false;try{await requireOrgAdminOrPermission(ctx);canManage=true;}catch(error){if(!(error instanceof OrgContextError))throw error;}
    const objections = await getObjections(ctx.organizationId, ctx.supabase, filters);

    return NextResponse.json({ success: true, data: objections,canManage }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] GET error:', message);
    return respuestaErrorCrm(error,'objections.catalog');
  }
}

/**
 * POST /api/crm/objections — Crea una nueva objection.
 * Body: { title, category?, detection_signals?, recommended_response?, discovery_questions?, related_case_studies?, vertical_id?, is_active?, sort_order? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext(request);
    const raw = await readOrgBody(ctx, request);
    await requireOrgAdminOrPermission(ctx);
    const clean={...raw};for(const key of ['organization_id','organizationId','org_id','orgId'])delete clean[key];
    const parsed=objectionCatalogSchema.safeParse(clean);
    if(!parsed.success)return NextResponse.json({success:false,error:'datos_invalidos'},{status:400});
    const body=parsed.data;


    if (!body?.title || typeof body.title !== 'string' || !body?.category || typeof body.category !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: title, category' },
        { status: 400 }
      );
    }

    const objection = await createObjection(
      ctx.organizationId,
      {
        title: body.title,
        category: body.category,
        detection_signals: body.detection_signals,
        recommended_response: body.recommended_response,
        discovery_questions: body.discovery_questions,
        related_case_studies: body.related_case_studies,
        vertical_id: body.vertical_id,
        is_active: body.is_active,
        sort_order: body.sort_order,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: objection }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Objections] POST error:', message);
    return respuestaErrorCrm(error,'objections.catalog');
  }
}
