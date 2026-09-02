import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getTranscript } from '@/lib/services/crm/transcriptionService';

/**
 * GET /api/crm/calls/[id]/transcript — Obtiene la transcripción de una llamada con segmentos.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const transcript = await getTranscript(id, ctx.organizationId, ctx.supabase);

    if (!transcript) {
      return NextResponse.json(
        { success: false, error: 'Transcripción no encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: transcript }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Transcript] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
