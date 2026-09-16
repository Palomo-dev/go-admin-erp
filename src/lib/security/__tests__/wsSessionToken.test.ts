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

// ─── F0-SEC r2 (sub-parte D): jti anti-replay ──────────────────────────────
import { _resetWsSessionJtis, consumeWsSessionJti } from '../wsSessionToken';

describe('wsSessionToken · jti anti-replay', () => {
  const original = process.env.WS_SESSION_SECRET;
  beforeEach(() => {
    process.env.WS_SESSION_SECRET = SECRET;
    _resetWsSessionJtis();
  });
  afterAll(() => {
    if (original === undefined) delete process.env.WS_SESSION_SECRET;
    else process.env.WS_SESSION_SECRET = original;
  });

  test('cada token lleva un jti distinto y aleatorio', () => {
    const a = verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }))!;
    const b = verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }))!;
    expect(typeof a.jti).toBe('string');
    expect(a.jti!.length).toBeGreaterThanOrEqual(16);
    expect(a.jti).not.toBe(b.jti);
  });

  test('verificar sigue siendo puro (N veces), pero consumir solo vale UNA vez (replay del setup)', () => {
    const token = issueWsSessionToken({ orgId: 7 });
    for (let i = 0; i < 3; i++) expect(verifyWsSessionToken(token)).not.toBeNull();
    const claims = verifyWsSessionToken(token)!;
    expect(consumeWsSessionJti(claims)).toBe(true);
    expect(consumeWsSessionJti(claims)).toBe(false);
    expect(consumeWsSessionJti(verifyWsSessionToken(token)!)).toBe(false);
  });

  test('dos tokens distintos no se bloquean entre sí', () => {
    expect(consumeWsSessionJti(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }))!)).toBe(true);
    expect(consumeWsSessionJti(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }))!)).toBe(true);
  });

  test('sin jti (token anterior al cambio) o expirado → no se puede consumir', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(consumeWsSessionJti({ exp: now + 60 })).toBe(false);
    expect(consumeWsSessionJti({ jti: '', exp: now + 60 })).toBe(false);
    expect(consumeWsSessionJti({ jti: 'abc', exp: now - 1 })).toBe(false);
  });

  test('un jti consumido se olvida cuando su token expira (no crece sin límite)', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(consumeWsSessionJti({ jti: 'x1', exp: now + 10 }, now)).toBe(true);
    expect(consumeWsSessionJti({ jti: 'x1', exp: now + 10 }, now + 5)).toBe(false);
    // Pasado el exp el token ya no verifica; el registro deja de bloquear (y se barre).
    expect(consumeWsSessionJti({ jti: 'x1', exp: now + 100 }, now + 11)).toBe(true);
  });

  test('un jti inventado en el payload con forma inválida no verifica', () => {
    const payload = Buffer.from(JSON.stringify({ orgId: 7, exp: Math.floor(Date.now() / 1000) + 60, jti: 'x'.repeat(65) })).toString('base64url');
    const sig = require('crypto').createHmac('sha256', SECRET).update(payload).digest('base64url');
    expect(verifyWsSessionToken(`${payload}.${sig}`)).toBeNull();
  });
});
