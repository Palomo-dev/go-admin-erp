import twilio from 'twilio';
import { buildCallbackUrl } from './twimlBuilders';
import { signBridgeToken } from './bridgeTokens';

export type PhoneConferenceRole = 'customer' | 'agent' | 'transfer';

export function phoneConferenceName(organizationId: number, callId: string): string {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId)) {
    throw new Error('Ámbito de conferencia inválido');
  }
  return `go_${organizationId}_${callId.toLowerCase()}`;
}

/** El caller resuelve SID/tenant/rol desde la sesión privada antes de generar este documento. */
export function buildPhoneConferenceTwiml(input: {
  origin: string;
  organizationId: number;
  callId: string;
  role: PhoneConferenceRole;
  muted: boolean;
  inviteId: string;
  recording?: boolean;
  announcement?: string | null;
}): string {
  const response = new twilio.twiml.VoiceResponse();
  if (input.announcement) response.say({ language: 'es-MX', voice: 'Polly.Mia-Neural' }, input.announcement);
  if (input.recording) response.start().recording({ channels: 'dual', track: 'both',
    recordingStatusCallback: buildCallbackUrl(input.origin, '/api/voice/recording', { callId: input.callId,
      token: signBridgeToken(`phone-call:${input.callId}`) }), recordingStatusCallbackMethod: 'POST',
    recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'] });
  const dial = response.dial({
    action: buildCallbackUrl(input.origin, '/api/voice/conference/leave', { callId: input.callId,
      inviteId: input.inviteId, token: signBridgeToken(`phone-invite:${input.inviteId}`) }),
    method: 'POST',
  });
  dial.conference({
    beep: 'false',
    participantLabel: input.inviteId,
    muted: input.muted,
    startConferenceOnEnter: input.role !== 'customer',
    endConferenceOnExit: false,
    maxParticipants: 12,
    record: 'do-not-record',
    statusCallback: buildCallbackUrl(input.origin, '/api/voice/conference/status', { callId: input.callId, token: signBridgeToken(`phone-call:${input.callId}`) }),
    statusCallbackMethod: 'POST',
    statusCallbackEvent: ['start', 'end', 'join', 'leave', 'mute', 'hold'],
    waitUrl: buildCallbackUrl(input.origin, '/api/voice/conference/music', { callId: input.callId, token: signBridgeToken(`phone-call:${input.callId}`) }),
    waitMethod: 'POST',
  }, phoneConferenceName(input.organizationId, input.callId));
  return response.toString();
}
