/// <reference types="jest" />
/**
 * F0-SEC r2 · tester · huecos de cobertura destapados por mutation testing y
 * por la sonda de bordes de `secrets.ts`.
 *
 *  - M11: `WS_SESSION_SECRET_MIN_LENGTH` 32 → 16 sobrevivía: ningún test exigía
 *    que un secreto REAL de 16..31 caracteres se rechace para el token del ws.
 *  - Bordes de `secretProblem`: espacios, `undefined` como string, `.env.example`
 *    con sufijo, huecos de plantilla, mínimo raro.
 *  - Hueco menor (cerrado en r3): base64 de bytes repetidos con `=` de
 *    relleno (`AAAA…A=`) pasaba por secreto real porque `isFillerCredential`
 *    exigía que TODO el cuerpo fuera el mismo carácter y el `=` lo rompía.
 */
import crypto from 'crypto';
import { _resetSecretReports, secretProblem } from '../secrets';
import { issueWsSessionToken, readWsSessionSecret, verifyWsSessionToken, WS_SESSION_SECRET_MIN_LENGTH } from '../wsSessionToken';

const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { fn(); } finally { for (const k of Object.keys(vars)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
};
/** Secreto «real» (hex aleatorio) de exactamente n caracteres. */
const hexOf = (n: number) => crypto.randomBytes(Math.ceil(n / 2)).toString('hex').slice(0, n);

beforeEach(() => { _resetSecretReports(); jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => jest.restoreAllMocks());

describe('wsSessionToken · mínimo de 32 caracteres (M11)', () => {
  test('WS_SESSION_SECRET_MIN_LENGTH es 32', () => expect(WS_SESSION_SECRET_MIN_LENGTH).toBe(32));

  test.each([16, 24, 31])('secreto real de %i caracteres → no se lee, no se emite, no se verifica', (n) => {
    withEnv({ WS_SESSION_SECRET: hexOf(n) }, () => {
      expect(readWsSessionSecret()).toBeNull();
      expect(() => issueWsSessionToken({ orgId: 7 })).toThrow();
      expect(verifyWsSessionToken('abc.def')).toBeNull();
    });
  });

  test('32 caracteres reales → emite y verifica; el mismo token con un secreto corto → null', () => {
    const secret = hexOf(32);
    let token = '';
    withEnv({ WS_SESSION_SECRET: secret }, () => {
      token = issueWsSessionToken({ orgId: 7 });
      expect(verifyWsSessionToken(token)?.orgId).toBe(7);
    });
    withEnv({ WS_SESSION_SECRET: secret.slice(0, 31) }, () => expect(verifyWsSessionToken(token)).toBeNull());
  });

  test('exp exactamente en now + 3600 se acepta; 3601 no', () => {
    withEnv({ WS_SESSION_SECRET: hexOf(64) }, () => {
      expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, 3600))?.orgId).toBe(7);
      expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, 3601))).toBeNull();
      expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 7 }, NaN))).toBeNull();
      expect(verifyWsSessionToken(issueWsSessionToken({ orgId: 1.5 }))).toBeNull();
    });
  });
});

describe('secretProblem · bordes', () => {
  test.each<[string, ReturnType<typeof secretProblem>]>([
    ['abcdefghijklmno', 'too_short'],            // 15
    ['abcdefghijklmnop', null],                   // 16
    ['abcdefghijklmno ', 'too_short'],            // 16 con espacio final: se recorta para medir
    ['                ', 'missing'],              // solo espacios
    ['undefined', 'placeholder'],
    ['null', 'placeholder'],
    ['NaN', 'too_short'],
    ['[object Object]', 'too_short'],
    ['your-secure-random-token-here-1', 'placeholder'],           // .env.example + sufijo
    ['xyour-secure-random-token-here', 'placeholder'],            // prefijo + .env.example
    ['changeme-2026-09-15', 'placeholder'],
    ['changemechangeme', 'placeholder'],
    ['  changeme  ', 'placeholder'],
    ['genera-uno-con-openssl-rand-hex-32', 'placeholder'],
    ['<meta-app-secret-32-characters-long>', 'placeholder'],
    ['${CRON_SECRET}', 'placeholder'],
    ['{{ secret }}', 'placeholder'],
    ['xxxxxxxxxxxxxxxx', 'placeholder'],
    ['whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'placeholder'],     // base64 de ceros sin '='
    ['0123456789abcdef', null],
    ['sk_test_51H1234567890abcdef', null],                         // 'test' como subcadena NO es relleno
  ])('%s → %s', (value, expected) => expect(secretProblem(value)).toBe(expected));

  test('min raro: <= 0, NaN o Infinity caen al default 16; 1e9 rechaza todo', () => {
    expect(secretProblem('abcdefghijklmno', -5)).toBe('too_short');
    expect(secretProblem('abcdefghijklmnop', -5)).toBe(null);
    expect(secretProblem('abcdefghijklmno', NaN)).toBe('too_short');
    expect(secretProblem('abcdefghijklmno', Infinity)).toBe('too_short');
    expect(secretProblem('abcdefghijklmnop', 1e9)).toBe('too_short');
  });

  test('tipos no string → missing', () => {
    expect(secretProblem(123456789012345678)).toBe('missing');
    expect(secretProblem(['abcdefghijklmnop'])).toBe('missing');
    expect(secretProblem({ toString: () => 'abcdefghijklmnop' })).toBe('missing');
  });

  test('r3: base64 de 32 bytes cero con "=" de relleno (AAAA…A=) es relleno (hueco 4 cerrado)', () => {
    expect(secretProblem('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')).toBe('placeholder');
    expect(secretProblem('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==')).toBe('placeholder');
    expect(secretProblem('whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=')).toBe('placeholder');
    // Un base64 real con relleno sigue valiendo.
    expect(secretProblem('YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=')).toBe(null);
  });
});
