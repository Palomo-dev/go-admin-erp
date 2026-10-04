import { NextRequest } from 'next/server';
import { POST } from '@/app/api/integrations/twilio/verify/check/route';
import { twilioVerifyService } from '@/lib/services/integrations/twilio';
import { getServiceClient } from '@/lib/supabase/server-service';
import { phoneConferenceEnabled } from '../phoneConferenceRepository';
const actor = '11111111-1111-4111-8111-111111111112';
jest.mock('@/lib/utils/orgContext', () => ({ getServerOrgContext: async () => ({ organizationId: 7, userId: actor }), OrgContextError: jest.requireActual('@/lib/utils/orgContextError').OrgContextError }));
jest.mock('@/lib/services/integrations/twilio', () => ({ twilioVerifyService: { checkCode: jest.fn() } }));
jest.mock('@/lib/services/integrations/twilio/twilioConfig', () => ({ formatE164: (value: string) => value }));
jest.mock('@/lib/security/rateLimit', () => ({ checkRateLimits: async () => ({ allowed: true }), getClientIp: () => 'local' }));
jest.mock('@/lib/security/rateLimitStore', () => ({ getRateLimitStore: () => ({}) }));
jest.mock('@/lib/supabase/server-service', () => ({ getServiceClient: jest.fn() }));
jest.mock('../phoneConferenceRepository', () => ({ phoneConferenceEnabled: jest.fn() }));
const profile = jest.fn(); const rpc = jest.fn();
const original = process.env.VOICE_CALLBACK_SECRET;
beforeAll(() => { process.env.VOICE_CALLBACK_SECRET = 'prueba-approval-ruta-local'; });
afterAll(() => { if (original === undefined) delete process.env.VOICE_CALLBACK_SECRET; else process.env.VOICE_CALLBACK_SECRET = original; });
beforeEach(() => {
  jest.clearAllMocks(); jest.mocked(phoneConferenceEnabled).mockReturnValue(true);
  profile.mockResolvedValue({ data: { metadata: { pending_mobile_verification: { phone: '+573001234567', organization_id: 7 } } }, error: null });
  jest.mocked(getServiceClient).mockReturnValue({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: profile }) }) }) } as never);
  jest.mocked(twilioVerifyService.checkCode).mockResolvedValue({ success: true, status: 'approved', sid: `VE${'1'.repeat(32)}` } as never);
});
function request(body: object) { return new NextRequest('https://app.example/api/integrations/twilio/verify/check', { method: 'POST', body: JSON.stringify({ to: '+573001234567', code: '123456', purpose: 'mobile_verification', ...body }) }); }
it('OTP aprobado y TX fallida devuelve 503; recibo reintenta la misma aprobación sin segundo OTP', async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: '40001' } });
  const response = await POST(request({})); const body = await response.json();
  expect(response.status).toBe(503); expect(body.success).toBe(false); expect(body.code).toBe('mobile_approval_pending');
  expect(typeof body.approval_receipt).toBe('string');
  const proof = rpc.mock.calls[0][1].p_proof;
  rpc.mockResolvedValueOnce({ data: { phone: '+573001234567', verified_at: '2026-10-02T10:00:00Z' }, error: null });
  const retry = await POST(request({ approval_receipt: body.approval_receipt, code: '' }));
  expect(retry.status).toBe(200); expect(await retry.json()).toMatchObject({ success: true, status: 'approved' });
  expect(twilioVerifyService.checkCode).toHaveBeenCalledTimes(1); expect(profile).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[1][1].p_proof).toEqual(proof);
});
it('pendiente de otra organización no consume OTP ni acredita marca editable', async () => {
  profile.mockResolvedValue({ data: { metadata: { pending_mobile_verification: { phone: '+573001234567', organization_id: 8 }, mobile_verified_at: '2026-10-01T10:00:00Z' } } });
  expect((await POST(request({}))).status).toBe(403);
  expect(twilioVerifyService.checkCode).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
it('success del proveedor sin status approved no genera attestation', async () => {
  jest.mocked(twilioVerifyService.checkCode).mockResolvedValue({ success: true, status: 'pending' } as never);
  expect((await POST(request({}))).status).toBe(400); expect(rpc).not.toHaveBeenCalled();
});
it('recibo manipulado no se presenta al proveedor y falla honestamente', async () => {
  expect((await POST(request({ approval_receipt: 'falso.recibo' }))).status).toBe(400);
  expect(twilioVerifyService.checkCode).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
});
