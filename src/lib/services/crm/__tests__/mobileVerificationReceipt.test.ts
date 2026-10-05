import { mobileApprovalReceipt, readMobileApprovalReceipt } from '../mobileVerificationReceipt';
const actor = '11111111-1111-4111-8111-111111111112';
const now = Date.parse('2026-10-02T10:00:00Z');
const original = process.env.VOICE_CALLBACK_SECRET;
beforeAll(() => { process.env.VOICE_CALLBACK_SECRET = 'prueba-hmac-de-otp-local-sin-proveedor'; });
afterAll(() => { if (original === undefined) delete process.env.VOICE_CALLBACK_SECRET; else process.env.VOICE_CALLBACK_SECRET = original; });
it('reintenta la misma aprobación con proof_key estable sin almacenar OTP', () => {
  const receipt = mobileApprovalReceipt(7, actor, '+573001234567', `VE${'1'.repeat(32)}`, now);
  const proof = readMobileApprovalReceipt(receipt, 7, actor, '+573001234567', now + 10000);
  expect(proof).toEqual(readMobileApprovalReceipt(receipt, 7, actor, '+573001234567', now + 30000));
  expect(proof).toMatchObject({ provider_ref: `VE${'1'.repeat(32)}`, approved_at: '2026-10-02T10:00:00.000Z' });
  expect(Object.keys(proof!)).toEqual(['proof_key', 'provider_ref', 'approved_at']);
});
it.each(['org', 'actor', 'number', 'expired', 'future', 'tampered'])('no acepta prueba fuera de su ámbito o caducada: %s', (kind) => {
  let receipt = mobileApprovalReceipt(7, actor, '+573001234567', `VE${'1'.repeat(32)}`, now);
  if (kind === 'tampered') receipt = receipt.replace(/^./, receipt[0] === 'a' ? 'b' : 'a');
  expect(readMobileApprovalReceipt(receipt, kind === 'org' ? 8 : 7, kind === 'actor' ? '11111111-1111-4111-8111-111111111119' : actor,
    kind === 'number' ? '+573001234568' : '+573001234567', kind === 'expired' ? now + 600001 : kind === 'future' ? now - 16000 : now)).toBeNull();
});
it('no construye prueba con referencia del proveedor inválida', () => {
  expect(() => mobileApprovalReceipt(7, actor, '+573001234567', 'aprobado', now)).toThrow();
});
