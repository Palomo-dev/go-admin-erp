import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { transcribeCall } from '@/lib/services/crm/transcriptionService';

/**
 * POST /api/crm/calls/[id]/transcribe — Fuerza/inicia la transcripción de una llamada.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;

    const transcript = await transcribeCall(id, ctx.organizationId, ctx.supabase);

    if (!transcript) {
      return NextResponse.json(
        { success: false, error: 'No se pudo iniciar la transcripción' },
        { status: 500 }
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
    console.error('[CRM Calls Transcribe] POST error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
