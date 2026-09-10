import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { isOrgAdmin } from '@/lib/utils/rbac';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getCall, getCallRecordings } from '@/lib/services/crm/callManagementService';
import { applyDisposition, callPatchSchema, type CallRowForDisposition } from '@/lib/services/crm/callDispositionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/crm/calls/[id] — Llamada + grabaciones + consentimientos.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  try {
    const { id } = await params;
    const call = await getCall(id, ctx.organizationId, ctx.supabase);
    if (!call) {
      return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });
    }
    const [recordings, consentsRes] = await Promise.all([
      getCallRecordings(id, ctx.organizationId, ctx.supabase),
      ctx.supabase
        .from('call_consents')
        .select('id, consent_type, method, locale, announced_at, recorded_announcement_text')
        .eq('organization_id', ctx.organizationId)
        .eq('call_id', id),
    ]);
    return NextResponse.json(
      { success: true, data: { ...call, recordings, consents: consentsRes.data ?? [] } },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] GET [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/crm/calls/[id] — Disposición / nota en vivo (FASE-03 §4.1).
 *
 * Body (zod `callPatchSchema`):
 *   { disposition?: { outcome, next_action?: { type, due_at?, title? }, note? }, live_note?, outcome?, notes? }
 * Solo el dueño de la llamada (calls.user_id) o un admin de la org (403 si no).
 * Efectos: calls.metadata.disposition_*, status 'voicemail' si aplica, tasks si
 * next_action.type='task', actividad `call` (misma fila F4) y
 * opportunities.last_contact_at/contact_channel/contact_result/next_contact_at.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let ctx;
  try {
    ctx = await getServerOrgContext(request);
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.statusCode });
    }
    throw err;
  }

  const parsed = callPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Body inválido', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const { id } = await params;
    const sb = getServiceClient();
    const { data } = await sb.from('calls').select('*').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
    const call = data as CallRowForDisposition | null;
    if (!call) {
      return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });
    }
    if (call.user_id && call.user_id !== ctx.userId && !isOrgAdmin(ctx) && !ctx.isSuperAdmin) {
      return NextResponse.json({ success: false, error: 'Solo el dueño de la llamada o un administrador puede editarla' }, { status: 403 });
    }

    let current = call;
    if (body.live_note !== undefined) {
      const { data: saved, error } = await sb
        .from('calls')
        .update({ metadata: { ...(current.metadata ?? {}), live_note: body.live_note ?? null } })
        .eq('id', id)
        .eq('organization_id', ctx.organizationId)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      current = saved as CallRowForDisposition;
    }

    const disposition = body.disposition ?? (body.outcome ? { outcome: body.outcome, note: body.notes ?? null, next_action: null } : null);
    let taskId: string | null = null;
    let activityId: string | null = null;
    if (disposition) {
      const result = await applyDisposition(current, ctx.userId, disposition, sb);
      current = result.call;
      taskId = result.taskId;
      activityId = result.activityId;
    }

    return NextResponse.json({ success: true, data: current, task_id: taskId, activity_id: activityId }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    console.error('[CRM Calls] PATCH [id] error:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
