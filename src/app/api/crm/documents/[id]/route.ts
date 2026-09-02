import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import {
  getDocument,
  updateDocument,
  deleteDocument,
} from '@/lib/services/crm/documentService';

/**
 * GET /api/crm/documents/[id] — Obtiene un documento por ID.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const document = await getDocument(id, ctx.organizationId, ctx.supabase);

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Documento no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: document }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Documents] GET [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/documents/[id] — Actualiza metadata del documento.
 * Body: { name?, description?, folder_id?, tags?, is_confidential? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const body = await request.json();

    const document = await updateDocument(id, ctx.organizationId, body, ctx.supabase);

    if (!document) {
      return NextResponse.json(
        { success: false, error: 'Documento no encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: document }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Documents] PATCH error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/crm/documents/[id] — Elimina documento (archivo + registro).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    await deleteDocument(id, ctx.organizationId, ctx.supabase);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Documents] DELETE error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
