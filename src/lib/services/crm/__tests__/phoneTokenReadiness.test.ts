import { GET } from '@/app/api/voice/token/route';
import { generateVoiceToken } from '../voiceTokenService';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: async () => ({ organizationId: 7, userId: 'actor' }), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
jest.mock('../voiceTokenService', () => ({ generateVoiceToken: jest.fn(), VoiceNotConfiguredError: class extends Error {
  missing: string[]; scope: string; publicMessage = 'Telefonía no disponible';
  constructor(message: string, missing: string[], scope: string) { super(message); this.missing = missing; this.scope = scope; }
} }));
const previousFlag = process.env.CRM_PHONE_CONFERENCE_ENABLED; const previousSecret = process.env.VOICE_CALLBACK_SECRET;
beforeEach(() => { jest.clearAllMocks(); delete process.env.CRM_PHONE_CONFERENCE_ENABLED; });
afterAll(() => {
  if (previousFlag === undefined) delete process.env.CRM_PHONE_CONFERENCE_ENABLED; else process.env.CRM_PHONE_CONFERENCE_ENABLED = previousFlag;
  if (previousSecret === undefined) delete process.env.VOICE_CALLBACK_SECRET; else process.env.VOICE_CALLBACK_SECRET = previousSecret;
});
it('default Conference no registra Device sin HMAC y no expone nombres de secretos al usuario', async () => {
  delete process.env.VOICE_CALLBACK_SECRET;
  const response = await GET(new Request('https://app.example/api/voice/token')); const body = await response.json();
  expect(response.status).toBe(409); expect(body).toMatchObject({ success: false, scope: 'platform', code: 'VOICE_NOT_CONFIGURED' });
  expect(JSON.stringify(body)).not.toContain('VOICE_CALLBACK_SECRET'); expect(generateVoiceToken).not.toHaveBeenCalled();
});
it('configuración lista usa el único generador de token existente', async () => {
  process.env.VOICE_CALLBACK_SECRET = 'prueba-token-hmac-local';
  jest.mocked(generateVoiceToken).mockResolvedValue({ token: 'token-local', identity: 'identity', ttl: 3600, orgId: 7 });
  const response = await GET(new Request('https://app.example/api/voice/token')); expect(response.status).toBe(200);
  expect(generateVoiceToken).toHaveBeenCalledWith(7, 'actor');
});
