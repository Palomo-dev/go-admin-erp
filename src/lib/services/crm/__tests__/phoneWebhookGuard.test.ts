import { phoneWebhookContext, verifyPhoneInvitationLeg } from '../phoneConferenceWebhookContext';
import { verifyTwilioWebhook } from '@/lib/security/webhookSignatures';
import { WebhookError } from '@/lib/security/errors';
import { getServiceClient } from '@/lib/supabase/server-service';
import { verifyBridgeToken } from '../bridgeTokens';
import { phoneRpc } from '../phoneConferenceRepository';
import { accountSidMatchesOrg, getTwilioClientForOrg } from '../voiceContextService';
import { phonePack, CALL_ID, AGENT_SID } from './fixtures/phonePack';

jest.mock('@/lib/security/webhookSignatures', () => ({ verifyTwilioWebhook: jest.fn(), WebhookError: jest.requireActual('@/lib/security/errors').WebhookError }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn(() => ({ service: true })) }));
jest.mock('../bridgeTokens', () => ({ verifyBridgeToken: jest.fn() }));
jest.mock('../phoneConferenceRepository', () => ({ phoneRpc: jest.fn(), readPhonePack: jest.fn() }));
jest.mock('../voiceContextService', () => ({ accountSidMatchesOrg: jest.fn(), getTwilioClientForOrg: jest.fn() }));
const pack = phonePack();
const invitation = pack.invites![0];
const request = new Request(`https://app.example/api/voice/conference/join?callId=${CALL_ID}&inviteId=${invitation.id}&token=signature`, { method: 'POST' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(verifyTwilioWebhook).mockResolvedValue({ params: { CallSid: AGENT_SID }, accountSid: 'AC' + 'a'.repeat(32) } as never);
  jest.mocked(verifyBridgeToken).mockReturnValue(true);
  jest.mocked(phoneRpc).mockResolvedValue({ ...pack, invite: invitation });
  jest.mocked(accountSidMatchesOrg).mockResolvedValue(true);
});

it('firma Twilio inválida falla antes de HMAC, filas privadas y proveedor', async () => {
  jest.mocked(verifyTwilioWebhook).mockRejectedValue(new WebhookError(403, 'TWILIO_INVALID', 'Forbidden'));
  await expect(phoneWebhookContext(request, true)).rejects.toMatchObject({ statusCode: 403 });
  expect(verifyBridgeToken).not.toHaveBeenCalled(); expect(getServiceClient).not.toHaveBeenCalled(); expect(getTwilioClientForOrg).not.toHaveBeenCalled();
});

it('firma Twilio válida no sustituye HMAC de la invitación', async () => {
  jest.mocked(verifyBridgeToken).mockReturnValue(false);
  await expect(phoneWebhookContext(request, true)).rejects.toMatchObject({ statusCode: 403, code: 'PHONE_TOKEN_INVALID' });
  expect(getServiceClient).not.toHaveBeenCalled(); expect(phoneRpc).not.toHaveBeenCalled();
});

it('una cuenta de proveedor de otro tenant se deniega antes de controlar participantes', async () => {
  jest.mocked(accountSidMatchesOrg).mockResolvedValue(false);
  await expect(phoneWebhookContext(request, true)).rejects.toMatchObject({ statusCode: 403, code: 'PHONE_ACCOUNT_INVALID' });
  expect(getTwilioClientForOrg).not.toHaveBeenCalled();
});

it('HMAC válido no acredita una invitación de otra llamada', async () => {
  jest.mocked(phoneRpc).mockResolvedValue({ ...pack, invite: { ...invitation, call_id: '11111111-1111-4111-8111-111111111199' } });
  await expect(phoneWebhookContext(request, true)).rejects.toMatchObject({ statusCode: 404 });
  expect(accountSidMatchesOrg).not.toHaveBeenCalled(); expect(getTwilioClientForOrg).not.toHaveBeenCalled();
});

it('el SID firmado que contradice la pata ligada no obtiene cliente ni éxito', async () => {
  const context = await phoneWebhookContext(request, true);
  context.invitation = { ...invitation, call_sid: 'CA' + 'f'.repeat(32) };
  await expect(verifyPhoneInvitationLeg(context)).rejects.toMatchObject({ statusCode: 403, code: 'PHONE_LEG_INVALID' });
  expect(getTwilioClientForOrg).not.toHaveBeenCalled();
});
