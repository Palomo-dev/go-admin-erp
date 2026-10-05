import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerOrgContext } from '@/lib/utils/orgContext';
import { readOrgBody } from '@/lib/security/organizationBody';
import { getServiceClient } from '@/lib/supabase/server-service';
import { CrmHttpError, exigirUuid } from './crmErrors';
import { respuestaErrorCrm, sinClavesDeOrganizacion } from './crmRouteSupport';
import { phoneConferenceEnabled, phoneRpc, readPhonePack } from './phoneConferenceRepository';
import { phoneControlDto } from './phoneConferenceTypes';
import { runPhoneControl } from './phoneConferenceControl';
import { reconcilePhonePack } from './phoneConferenceReconcile';
import { publicPhoneState } from './phoneConferenceRepository';
import { puedeGestionarLlamada } from './callAccessService';

const target = z.union([z.object({ userId: z.string().uuid() }).strict(), z.object({ number: z.string().regex(/^\+[1-9]\d{6,14}$/) }).strict()]);
const commandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('hold'), held: z.boolean() }).strict(),
  z.object({ action: z.literal('transfer'), mode: z.enum(['direct', 'consult']), target }).strict(),
  z.object({ action: z.literal('confirm_transfer') }).strict(),
  z.object({ action: z.literal('cancel_transfer') }).strict(),
  z.object({ action: z.literal('hangup') }).strict(),
]);
const bodySchema = z.object({ idempotency_key: z.string().uuid(), command: commandSchema }).strict();

export async function resolvePhoneControl(client: Parameters<typeof phoneRpc>[0], org: number, sid: string) {
  if (!/^(?:CA[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(sid)) {
    throw new CrmHttpError(400, 'llamada_invalida', 'La llamada no es válida');
  }
  const result = await phoneRpc<{ call_id: string; state: unknown }>(client, 'fn_phone_resolve', { p_org: org, p_sid: sid });
  const state = phoneControlDto(result?.state);
  if (!state || !result?.call_id) throw new CrmHttpError(503, 'control_incierto', 'No pudimos confirmar los controles');
  return { call_id: exigirUuid(result.call_id), state };
}

export async function phoneControlRequest(request: NextRequest, sid: string, action?: 'hold' | 'transfer') {
  try {
    const ctx = await getServerOrgContext(request);
    readOrgBody(ctx, {}, { request });
    if (!phoneConferenceEnabled()) throw new CrmHttpError(409, 'conferencia_no_disponible', 'Los controles de conferencia aún no están disponibles');
    const resolved = await resolvePhoneControl(ctx.supabase, ctx.organizationId, sid);
    if (request.method === 'GET') {
      let pack = resolved.state.supported ? await readPhonePack(getServiceClient(), ctx.organizationId, resolved.call_id) : null;
      if (pack && (pack.session.phase === 'error' || pack.operation?.state === 'unknown' || pack.session.phase === 'ended')) {
        pack = await reconcilePhonePack(getServiceClient(), pack);
        resolved.state = publicPhoneState(pack);
      }
      const call = pack ? { id: pack.call.id, status: pack.call.status, recording_enabled: pack.call.recording_enabled,
        consent_given: pack.call.consent_given, recording_started: pack.session.recording_claim_state === 'confirmed' && Boolean(pack.call.metadata?.recording_started_at),
        answered_at: pack.call.answered_at, direction: pack.call.direction,
        can_edit_notes: await puedeGestionarLlamada(ctx, pack.call),
        number: pack.call.direction === 'inbound' ? pack.call.from_number : pack.call.to_number,
        displayName: typeof pack.call.metadata?.caller_name === 'string' ? pack.call.metadata.caller_name.slice(0, 200) : null } : null;
      return NextResponse.json({ success: true, data: { ...resolved, call } }, { headers: { 'Cache-Control': 'private, no-store' } });
    }
    if (!resolved.state.supported) throw new CrmHttpError(409, 'llamada_sin_conferencia', 'La llamada comenzó sin conferencia. Estos controles estarán disponibles en una llamada nueva');
    const raw = readOrgBody(ctx, await request.json().catch(() => null), { request });
    const clean = sinClavesDeOrganizacion(raw);
    const { idempotency_key: aliasKey, ...aliasCommand } = clean && typeof clean === 'object' ? clean : {};
    const parsed = bodySchema.safeParse(action ? { idempotency_key: aliasKey, command: { ...aliasCommand, action } } : clean);
    if (!parsed.success) throw new CrmHttpError(400, 'accion_invalida', 'La acción no es válida');
    const state = await runPhoneControl(ctx.supabase, getServiceClient(), ctx.organizationId, resolved.call_id,
      parsed.data.idempotency_key, parsed.data.command);
    return NextResponse.json({ success: true, data: { state } }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return respuestaErrorCrm(error, 'control_telefonia'); }
}
