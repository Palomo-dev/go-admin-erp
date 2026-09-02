import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getDiscoveryTemplates,
  createDiscoveryTemplate,
} from '@/lib/services/crm/discoveryService';

/**
 * GET /api/crm/discovery/templates — Lista los discovery templates activos.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const templates = await getDiscoveryTemplates(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: templates }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Discovery Templates] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/discovery/templates — Crea un nuevo discovery template.
 * Body: { name, vertical_id?, sections, is_active? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name || !body?.sections) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name, sections' },
        { status: 400 }
      );
    }

    const template = await createDiscoveryTemplate(
      ctx.organizationId,
      {
        name: body.name,
        vertical_id: body.vertical_id,
        sections: body.sections,
        is_active: body.is_active,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: template }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Discovery Templates] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
