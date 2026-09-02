import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getDownloadUrl } from '@/lib/services/crm/documentService';

/**
 * GET /api/crm/documents/[id]/download — Genera URL firmada para descargar el documento.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const url = await getDownloadUrl(id, ctx.organizationId, ctx.supabase);

    if (!url) {
      return NextResponse.json(
        { success: false, error: 'Documento no encontrado o error generando URL' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, url }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Documents] download error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
