/// <reference types="jest" />
import { issueWsSessionToken, verifyWsSessionToken } from '../wsSessionToken';

// F0-SEC r2: el secreto tiene que ser real y de >= 32 caracteres (antes bastaba no vacío).
const SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f9001122334455667788990aabbccddeeff';
const OTHER_SECRET = 'ffeeddccbbaa0998877665544332211009f8e7d6c5b4a3928170f6e5d4c3b2a1';

describe('wsSessionToken', () => {
  const original = process.env.WS_SESSION_SECRET;
  beforeEach(() => {
    process.env.WS_SESSION_SECRET = SECRET;
  });
  afterAll(() => {
    if (original === undefined) delete process.env.WS_SESSION_SECRET;
    else process.env.WS_SESSION_SECRET = original;
  });

  test('roundtrip: emite y verifica claims', () => {
    const token = issueWsSessionToken({ orgId: 105, callId: 'vac-1', agentId: 'va-1', callSid: 'CA1' });
    const claims = verifyWsSessionToken(token);
    expect(claims).toMatchObject({ orgId: 105, callId: 'vac-1', agentId: 'va-1', callSid: 'CA1' });
    expect(claims!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test('token manipulado → null', () => {
    const token = issueWsSessionToken({ orgId: 105 });
    const [payload, sig] = token.split('.');
    // Cambiar el payload manteniendo la firma
    const tampered = `${Buffer.from(JSON.stringify({ orgId: 999, exp: 9999999999 })).toString('base64url')}.${sig}`;
    expect(verifyWsSessionToken(tampered)).toBeNull();
    // Cambiar la firma
    expect(verifyWsSessionToken(`${payload}.${sig.slice(0, -2)}xx`)).toBeNull();
    expect(verifyWsSessionToken('garbage')).toBeNull();
    expect(verifyWsSessionToken(null)).toBeNull();
  });

  test('token expirado → null', () => {
    const token = issueWsSessionToken({ orgId: 1 }, -1);
    expect(verifyWsSessionToken(token)).toBeNull();
  });

  test('secreto distinto → null; sin secreto → null (fail-closed)', () => {
    const token = issueWsSessionToken({ orgId: 1 });
    process.env.WS_SESSION_SECRET = OTHER_SECRET;
    expect(verifyWsSessionToken(token)).toBeNull();
    delete process.env.WS_SESSION_SECRET;
    expect(verifyWsSessionToken(token)).toBeNull();
    expect(() => issueWsSessionToken({ orgId: 1 })).toThrow();
  });
});
