import { getTwilioWebhookOrigin } from '@/lib/security/webhookSignatures';
import { signConsentToken, verifyConsentToken } from './bridgeTokens';
import { getTelephonySettings } from './voiceContextService';
import { recordConsent } from './consentService';
import { buildHangupTwiml, xmlResponse, escapeXml, CONSENT_LANGUAGE, CONSENT_VOICE } from './twimlBuilders';
import { buildPhoneConferenceTwiml } from './phoneConferenceTwiml';
import { phoneCallback } from './phoneConferenceControl';
import { mutatePhonePack, readPhonePack } from './phoneConferenceRepository';
import { phoneWebhookContext, verifyPhoneInvitationLeg, phoneWebhookError } from './phoneConferenceWebhookContext';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { PhonePack } from './phoneConferenceRepository';

export async function claimPhoneCustomerRecording(service: SupabaseClient, initial: PhonePack): Promise<boolean> {
  if (!initial.call.recording_enabled || !initial.call.consent_given || initial.session.recording_claim_state !== 'none') return false;
  await mutatePhonePack(service, initial, (fresh) => {
    if (!fresh.call.recording_enabled || !fresh.call.consent_given || fresh.session.recording_claim_state !== 'none') throw new Error('La autorización de grabación cambió');
    return { session: { recording_claim_state: 'pending', recording_claim_until: new Date(Date.now() + 120000).toISOString() } };
  });
  return true;
}

/** Cada invitación se une desde su TwiML firmado; el navegador nunca suministra SID/destino. */
export async function joinPhoneConference(request: Request): Promise<Response> {
  try {
    const context = await phoneWebhookContext(request, true);
    await verifyPhoneInvitationLeg(context);
    const { service, params, invitation } = context;
    if (!invitation) throw new Error('Invitación no encontrada');
    let pack = context.pack;
    if (pack.call.ended_at || pack.session.phase === 'ended' || ['declined', 'failed'].includes(invitation.state)
      || (invitation.role === 'transfer' && pack.session.transfer_invite_id !== invitation.id)
      || (invitation.role === 'agent' && pack.session.agent_sid && pack.session.agent_sid !== params.CallSid)) {
      return xmlResponse(buildHangupTwiml());
    }
    pack = await mutatePhonePack(service, pack, (fresh) => {
      if (fresh.session.phase === 'ended' || fresh.call.ended_at) throw new Error('La llamada terminó');
      const current = fresh.invites?.find((row) => row.id === invitation.id);
      return { session: {}, inviteId: invitation.id, invite: { call_sid: params.CallSid, state: current?.state === 'joined' ? 'joined' : 'ringing' } };
    });
    const settings = await getTelephonySettings(pack.session.organization_id, service);
    const announcementProof = `phone-announcement:${invitation.id}:${params.CallSid}`;
    const announced = verifyConsentToken(announcementProof, new URL(request.url).searchParams.get('ct'));
    const needsNotice = pack.call.recording_enabled && (invitation.role === 'customer' ? !pack.call.consent_given : !invitation.recording_announced_at);
    if (needsNotice && !announced) {
      const redirect = `${phoneCallback('join', pack.call.id, invitation.id)}&ct=${encodeURIComponent(signConsentToken(announcementProof))}`;
      return xmlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Say language="${CONSENT_LANGUAGE}" voice="${CONSENT_VOICE}">${escapeXml(settings.voice_consent_message)}</Say><Redirect method="POST">${escapeXml(redirect)}</Redirect></Response>`);
    }
    if (needsNotice && announced) {
      if (invitation.role === 'customer') {
        try {
          await recordConsent(pack.session.organization_id, { callId: pack.call.id, consentType: 'recording', consentGiven: true,
            consentMessage: settings.voice_consent_message, method: 'voice_announcement', locale: CONSENT_LANGUAGE }, service);
        } catch {
          pack = await mutatePhonePack(service, pack, () => ({ session: {}, call: { recording_enabled: false } }));
        }
      }
      pack = await mutatePhonePack(service, pack, (fresh) => ({ session: {}, inviteId: invitation.id,
        invite: { recording_announced_at: fresh.invites?.find((row) => row.id === invitation.id)?.recording_announced_at ?? new Date().toISOString() } }));
    }
    pack = await readPhonePack(service, pack.session.organization_id, pack.call.id) ?? (() => { throw new Error('La conferencia dejó de existir'); })();
    const recording = invitation.role === 'customer' && await claimPhoneCustomerRecording(service, pack);
    return xmlResponse(buildPhoneConferenceTwiml({ origin: getTwilioWebhookOrigin(), organizationId: pack.session.organization_id,
      callId: pack.call.id, role: invitation.role, inviteId: invitation.id, muted: false, recording }));
  } catch (error) { return phoneWebhookError(error); }
}
