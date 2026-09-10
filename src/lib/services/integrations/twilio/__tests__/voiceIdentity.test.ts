jest.mock('twilio', () => ({ __esModule: true, default: { jwt: { AccessToken: class {} } } }));
jest.mock('@/lib/services/crm/voiceContextService', () => ({
  getVoiceCredentials: jest.fn(),
  VoiceNotConfiguredError: class extends Error {},
}));

import { randomUUID } from 'crypto';
import { buildVoiceIdentity, parseVoiceIdentity, isClientFrom } from '@/lib/services/crm/voiceTokenService';

describe('voice identity u_{uuid}_o_{org} (FASE-03 §4.5.3)', () => {
  test('buildVoiceIdentity solo [A-Za-z0-9_] y codifica la org', () => {
    const id = buildVoiceIdentity('1F2E3D4C-5B6A-4798-8000-123456789ABC', 7);
    expect(id).toBe('u_1f2e3d4c5b6a47988000123456789abc_o_7');
    expect(id).toMatch(/^[A-Za-z0-9_]+$/);
    expect(() => buildVoiceIdentity('no-uuid', 7)).toThrow();
    expect(() => buildVoiceIdentity(randomUUID(), 0)).toThrow();
  });

  test('parseVoiceIdentity acepta client: y rechaza formatos inválidos', () => {
    expect(parseVoiceIdentity('client:u_1f2e3d4c5b6a47988000123456789abc_o_7')).toEqual({ userId: '1f2e3d4c-5b6a-4798-8000-123456789abc', orgId: 7 });
    expect(parseVoiceIdentity('u_x_o_1')).toBeNull();
    expect(parseVoiceIdentity('u_1f2e3d4c5b6a47988000123456789abc_o_abc')).toBeNull();
    expect(parseVoiceIdentity('u_1f2e3d4c5b6a4798800012345678_o_7')).toBeNull();
    expect(parseVoiceIdentity('')).toBeNull();
    expect(parseVoiceIdentity(null)).toBeNull();
    expect(parseVoiceIdentity('1f2e3d4c-5b6a-4798-8000-123456789abc')).toBeNull(); // identity antigua (solo uuid)
  });

  test('round-trip con 50 UUIDs aleatorios', () => {
    for (let i = 0; i < 50; i++) {
      const userId = randomUUID();
      const orgId = 1 + Math.floor(Math.random() * 999_999);
      expect(parseVoiceIdentity(buildVoiceIdentity(userId, orgId))).toEqual({ userId, orgId });
    }
  });

  test('isClientFrom', () => {
    expect(isClientFrom('client:u_a_o_1')).toBe(true);
    expect(isClientFrom('+573001234567')).toBe(false);
    expect(isClientFrom(null)).toBe(false);
  });
});
