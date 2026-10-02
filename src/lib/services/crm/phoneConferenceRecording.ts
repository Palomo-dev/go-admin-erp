import type { SupabaseClient } from '@supabase/supabase-js';
import { verifyBridgeToken } from './bridgeTokens';
import { exigirUuid } from './crmErrors';
import { getTwilioClientForOrg, accountSidMatchesOrg } from './voiceContextService';
import { readPhonePack, mutatePhonePack } from './phoneConferenceRepository';
import { WebhookError } from '@/lib/security/errors';

export interface PhoneRecordingScope { callId: string; org: number }

/** Sólo lo llama el callback después de verificar la firma Twilio. HMAC + SID nativo acreditan el scope. */
export async function resolvePhoneRecordingScope(request: Request, params: Record<string, string>, accountSid: string,
  service: SupabaseClient): Promise<PhoneRecordingScope | null> {
  const query = new URL(request.url).searchParams;
  if (!query.has('callId')) return null;
  const callId = exigirUuid(query.get('callId') ?? '');
  if (!verifyBridgeToken(`phone-call:${callId}`, query.get('token'))) throw new WebhookError(403, 'PHONE_RECORDING_TOKEN');
  const { data, error } = await service.from('calls').select('organization_id').eq('id', callId).maybeSingle();
  if (error) throw error;
  const pack = data ? await readPhonePack(service, data.organization_id, callId) : null;
  if (!pack || !(await accountSidMatchesOrg(pack.session.organization_id, accountSid, service))) throw new WebhookError(403, 'PHONE_RECORDING_SCOPE');
  const customer = pack.invites?.find((row) => row.role === 'customer' && row.call_sid === params.CallSid);
  if (!customer || (pack.session.customer_sid && pack.session.customer_sid !== params.CallSid)) throw new WebhookError(403, 'PHONE_RECORDING_LEG');
  const { client, creds } = await getTwilioClientForOrg(pack.session.organization_id);
  const actualCall = await client.calls(params.CallSid).fetch();
  if (actualCall.accountSid !== creds.accountSid || actualCall.accountSid !== accountSid) throw new WebhookError(403, 'PHONE_RECORDING_ACCOUNT');
  if (params.RecordingStatus === 'absent') {
    const recordings = await client.calls(params.CallSid).recordings.list({ limit: 1 });
    if (recordings.length) throw new WebhookError(409, 'PHONE_RECORDING_EXISTS');
    await mutatePhonePack(service, pack, () => ({ session: pack.call.ended_at
      ? { recording_claim_state: 'absent', recording_claim_until: null }
      : { recording_claim_state: 'unknown' } }));
  } else {
    if (!/^RE[0-9a-f]{32}$/i.test(params.RecordingSid ?? '')) throw new WebhookError(403, 'PHONE_RECORDING_SID');
    const actual = await client.recordings(params.RecordingSid).fetch();
    if (actual.sid !== params.RecordingSid || actual.callSid !== params.CallSid || actual.accountSid !== creds.accountSid) {
      throw new WebhookError(403, 'PHONE_RECORDING_BINDING');
    }
  }
  return { callId, org: pack.session.organization_id };
}

/** Se confirma después de que el escritor canónico guardó su evidencia, nunca antes. */
export async function confirmPhoneRecordingScope(service: SupabaseClient, scope: PhoneRecordingScope | null, status: string): Promise<void> {
  if (!scope || !['in-progress', 'completed'].includes(status)) return;
  const pack = await readPhonePack(service, scope.org, scope.callId);
  if (!pack) throw new Error('Conferencia no encontrada al confirmar grabación');
  await mutatePhonePack(service, pack, () => ({ session: { recording_claim_state: 'confirmed', recording_claim_until: null } }));
}
