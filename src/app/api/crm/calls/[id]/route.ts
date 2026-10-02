import { NextRequest, NextResponse } from 'next/server';
import { getServerOrgContext, OrgContextError } from '@/lib/utils/orgContext';
import { ORG_BODY_KEYS, readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { getCall, getCallRecordings } from '@/lib/services/crm/callManagementService';
import { applyDisposition, callPatchSchema, type CallRowForDisposition } from '@/lib/services/crm/callDispositionService';
import { CRM_PERMISOS, CrmHttpError, exigirUuid, respuestaErrorCrm, tienePermisoCrm } from '@/lib/services/crm/crmRouteSupport';
import { mutateCallFromSnapshot } from '@/lib/services/crm/callMutationService';

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
    readOrgBody(ctx, {}, { request });
    const { id } = await params;
    exigirUuid(id);
    const call = await getCall(id, ctx.organizationId, ctx.supabase);
    if (!call) {
      return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });
    }
    if (call.user_id !== ctx.userId && !(await tienePermisoCrm(ctx, CRM_PERMISOS.llamadasVerTodas))) {
      return NextResponse.json({ success: false, error: 'No tienes permiso para consultar esta llamada' }, { status: 403 });
    }
    const [recordings, consentsRes] = await Promise.all([
      getCallRecordings(id, ctx.organizationId, ctx.supabase),
      ctx.supabase
        .from('call_consents')
        .select('id, consent_type, method, locale, announced_at, recorded_announcement_text')
        .eq('organization_id', ctx.organizationId)
        .eq('call_id', id),
    ]);
    if (consentsRes.error) throw consentsRes.error;
    return NextResponse.json(
      { success: true, data: { ...call, recordings, consents: consentsRes.data ?? [] } },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'GET llamada');
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

  try {
    const raw = readOrgBody(ctx, await request.json().catch(() => null), { request });
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : raw;
    if (input && typeof input === 'object' && !Array.isArray(input)) for (const key of ORG_BODY_KEYS) delete input[key];
    const parsed = callPatchSchema.safeParse(input);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Body inválido', issues: parsed.error.issues }, { status: 400 });
    }
    const body = parsed.data;
    const { id } = await params;
    exigirUuid(id);
    const sb = getServiceClient();
    const { data, error: readError } = await sb.from('calls').select('*').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (readError) throw readError;
    const call = data as CallRowForDisposition | null;
    if (!call) {
      return NextResponse.json({ success: false, error: 'Llamada no encontrada' }, { status: 404 });
    }
    const canEditAny = await tienePermisoCrm(ctx, CRM_PERMISOS.actividadesEditarCualquiera);
    if (call.user_id !== ctx.userId && !canEditAny) {
      return NextResponse.json({ success: false, error: 'Solo el dueño de la llamada o un administrador puede editarla' }, { status: 403 });
    }
    const assertOwner = (fresh: CallRowForDisposition) => {
      if (fresh.user_id !== ctx.userId && !canEditAny) {
        throw new CrmHttpError(403, 'llamada_no_es_propia', 'Solo puedes modificar tus llamadas');
      }
    };

    let current = call;
    const disposition = body.disposition ?? (body.outcome ? { outcome: body.outcome, note: body.notes ?? null, next_action: null } : null);
    let taskId: string | null = null;
    let activityId: string | null = null;
    if (disposition) {
      const result = await applyDisposition(current, ctx.userId, disposition, sb, {
        liveNote: body.live_note, assertOwner, sessionClient: ctx.supabase, clientKey: body.client_key,
      });
      current = result.call;
      taskId = result.taskId;
      activityId = result.activityId;
    } else if (body.live_note !== undefined) {
      current = await mutateCallFromSnapshot(sb, current, (fresh) => {
        assertOwner(fresh);
        return { metadata: { ...(fresh.metadata ?? {}), live_note: body.live_note ?? null } };
      });
    }

    return NextResponse.json({ success: true, data: current, task_id: taskId, activity_id: activityId }, { status: 200 });
  } catch (error: unknown) {
    return respuestaErrorCrm(error, 'PATCH llamada');
  }
}
