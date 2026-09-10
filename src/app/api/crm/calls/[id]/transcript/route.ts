import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { getTranscript, expireStuckTranscript } from '@/lib/services/crm/transcriptionService';

/**
 * GET /api/crm/calls/[id]/transcript — Transcripción de la llamada con segmentos
 * (`?segments=0` para omitirlos). Incluye el estado del job `transcribe` vivo
 * (queued|running) para que la UI pueda mostrar "Transcribiendo…".
 *
 * Antes de responder caduca una transcripción atascada en `processing` más de
 * `MAX_PROCESSING_MS` (webhook que nunca llegó, worker muerto): así la UI recibe
 * `failed` con su botón de reintento en vez de un spinner eterno (tester r1 nº 7).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getServerOrgContext();
    const { id } = await params;
    const withSegments = request.nextUrl.searchParams.get('segments') !== '0';

    await expireStuckTranscript(ctx.organizationId, id, ctx.supabase).catch(() => null);

    const [transcript, jobRes, recRes] = await Promise.all([
      getTranscript(id, ctx.organizationId, ctx.supabase, withSegments),
      ctx.supabase
        .from('outbound_jobs')
        .select('id, kind, status, attempts, last_error, run_at')
        .eq('organization_id', ctx.organizationId)
        .in('kind', ['transcribe', 'analyze'])
        .eq('payload->>call_id', id)
        .order('created_at', { ascending: false })
        .limit(4),
      ctx.supabase.from('call_recordings').select('id, status, channels, duration_seconds').eq('call_id', id).eq('organization_id', ctx.organizationId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const jobs = (jobRes.data ?? []) as Array<{ id: string; kind: string; status: string; attempts: number; last_error: string | null; run_at: string }>;
    const recording = (recRes.data ?? null) as { id: string; status: string; channels: string | null; duration_seconds: number | null } | null;
    if (!transcript) {
      return NextResponse.json({ success: false, error: 'Transcripción no encontrada', data: { transcript: null, jobs, recording } }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { ...transcript, jobs, recording } }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof OrgContextError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls Transcript] GET error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
