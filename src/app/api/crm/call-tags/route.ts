import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getCallTags, createCallTag } from '@/lib/services/crm/callTagService';

/**
 * GET /api/crm/call-tags — Lista los tags de llamadas de la organización.
 */
export async function GET() {
  try {
    const ctx = await getServerOrgContext();
    const tags = await getCallTags(ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true, data: tags }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Call Tags] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/crm/call-tags — Crea un nuevo tag de llamada.
 * Body: { name, color?, category?, is_auto?, rules? }
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getServerOrgContext();
    const body = await request.json();

    if (!body?.name) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos obligatorios: name' },
        { status: 400 }
      );
    }

    const tag = await createCallTag(
      ctx.organizationId,
      {
        name: body.name,
        color: body.color,
        category: body.category,
        is_auto: body.is_auto,
        rules: body.rules,
      },
      ctx.supabase
    );

    return NextResponse.json({ success: true, data: tag }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Call Tags] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
