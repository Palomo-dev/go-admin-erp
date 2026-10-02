import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { exigirUuid, CrmHttpError } from '@/lib/services/crm/crmErrors';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from '@/lib/services/crm/crmRouteSupport';
import { phoneConferenceEnabled, phoneRpc, readPhonePack, mutatePhonePack, publicPhoneState, type PhonePack } from '@/lib/services/crm/phoneConferenceRepository';
import { getTwilioClientForOrg } from '@/lib/services/crm/voiceContextService';
import { terminalPhoneInvitation } from '@/lib/services/crm/phoneConferenceWebhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ idempotency_key: z.string().uuid() }).strict();

/** Rechaza sólo la invitación propia. Contestar desde móvil ocurre por la pata PSTN real. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ callId: string }> }) {
  try {
    const ctx = await getServerOrgContext(request);
    const { callId } = await params; exigirUuid(callId);
    const raw = sinClavesDeOrganizacion(readOrgBody(ctx, await request.json().catch(() => null), { request }));
    const body = schema.safeParse(raw);
    if (!body.success) throw new CrmHttpError(400, 'accion_invalida', 'La acción no es válida');
    if (!phoneConferenceEnabled()) throw new CrmHttpError(503, 'PHONE_NOT_AVAILABLE', 'Telefonía entrante todavía no disponible');
    const ack = await phoneRpc<{ invite_id: string; operation_id: string; revision: number; replay: boolean; response?: unknown }>(ctx.supabase,
      'fn_phone_reject_invite', { p_org: ctx.organizationId, p_call: callId, p_key: body.data.idempotency_key });
    if (ack.replay && ack.response) return NextResponse.json({ success: true, data: { state: ack.response } });
    const service = getServiceClient();
    let pack = await readPhonePack(service, ctx.organizationId, callId);
    const invite = pack?.invites?.find((row) => row.id === ack.invite_id && row.user_id === ctx.userId && row.role === 'agent');
    if (!pack || !invite || pack.operation?.id !== ack.operation_id || pack.session.active_operation_id !== ack.operation_id) {
      throw new CrmHttpError(409, 'invitacion_cambio', 'La invitación cambió');
    }
    if (pack.operation.state !== 'reserved') throw new CrmHttpError(409, 'operacion_pendiente', 'El rechazo sigue pendiente de confirmar');
    pack = await phoneRpc<PhonePack>(service, 'fn_phone_dispatch', { p_org: ctx.organizationId, p_call: callId,
      p_operation: ack.operation_id, p_revision: pack.session.revision });
    if (pack.stale || pack.operation?.id !== ack.operation_id || pack.operation.state !== 'dispatched') throw new CrmHttpError(409, 'invitacion_cambio', 'La invitación cambió');
    if (invite.call_sid) {
      const { client, creds } = await getTwilioClientForOrg(ctx.organizationId);
      const actual = await client.calls(invite.call_sid).fetch();
      if (actual.accountSid !== creds.accountSid) throw new CrmHttpError(403, 'invitacion_invalida', 'La invitación no pertenece a esta organización');
      await client.calls(invite.call_sid).update({ status: 'completed' });
      const ended = await client.calls(invite.call_sid).fetch();
      if (!['completed', 'canceled', 'failed', 'busy', 'no-answer'].includes(ended.status)) throw new CrmHttpError(503, 'rechazo_incierto', 'No pudimos confirmar el rechazo');
    } else if (invite.state !== 'reserved') {
      await mutatePhonePack(service, pack, () => ({ session: { phase: 'error' }, operationId: ack.operation_id, operationState: 'unknown' }));
      throw new CrmHttpError(503, 'rechazo_pendiente', 'La invitación sigue pendiente de confirmar');
    }
    const saved = await mutatePhonePack(service, pack, (fresh) => {
      const session = { ...fresh.session, active_operation_id: null };
      return { session: { active_operation_id: null }, inviteId: invite.id, invite: { state: 'declined' },
        operationId: ack.operation_id, operationState: 'succeeded', result: publicPhoneState({ ...fresh, session }) };
    });
    if (invite.call_sid) await terminalPhoneInvitation(service, saved, invite, invite.call_sid);
    return NextResponse.json({ success: true, data: { state: publicPhoneState(saved) } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'rechazar_invitacion'); }
}
