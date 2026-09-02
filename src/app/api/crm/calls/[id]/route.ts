import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getCall,
  updateCall,
  getCallRecordings,
  type CallUpdateInput,
} from '@/lib/services/crm/callManagementService';

/**
 * GET /api/crm/calls/[id] — Obtiene una llamada por ID (con sus grabaciones).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const { id } = await params;

    const call = await getCall(id, ctx.organizationId, ctx.supabase);

    if (!call) {
      return NextResponse.json(
        { success: false, error: 'Llamada no encontrada' },
        { status: 404 }
      );
    }

    // Incluir grabaciones asociadas
    const recordings = await getCallRecordings(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json(
      { success: true, data: { ...call, recordings } },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] GET [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/calls/[id] — Actualiza una llamada (status, duration, etc.).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext();
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: err.message },
        { status: err.statusCode }
      );
    }
    throw err;
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const call = await updateCall(id, ctx.organizationId, body as CallUpdateInput, ctx.supabase);

    if (!call) {
      return NextResponse.json(
        { success: false, error: 'Llamada no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: call }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] PATCH [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
