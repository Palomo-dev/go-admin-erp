/// <reference types="jest" />
/**
 * `src/lib/security/secrets.ts` (F0-SEC r2): un solo criterio de «secreto real».
 * Complementa la sonda del tester (`placeholderSecrets.test.ts`) con el helper
 * en sí: `.env.example` entero, alias, longitud mínima, códigos y registro.
 */
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_MIN_SECRET_LENGTH,
  _resetSecretReports,
  assertRealSecret,
  isRealSecret,
  readRealSecret,
  requireRealSecret,
  secretProblem,
} from '../secrets';
import { WebhookError } from '../errors';
import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';

const REAL = 'c0ffee1234567890abcdef1234567890';

let errorSpy: jest.SpyInstance;
beforeEach(() => {
  _resetSecretReports();
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errorSpy.mockRestore());

describe('isPlaceholderCredential ampliado', () => {
  test.each([
    'changeme', 'CHANGEME', 'change-me', 'change_me', 'replace-me', 'replaceme',
    'todo', 'TODO', 'example', 'secret', 'test', 'dummy', 'password', 'placeholder', 'xxx',
    'whsec_changeme', 're_secret', 'sk_dummy',
    'cambia-esto-por-un-secreto-largo', 'cambia-esto-por-32-bytes-en-hex', 'genera-uno-con-openssl-rand-hex-32',
    'generate-with-openssl', 'changeme-please-0123456789', 'todo-set-in-vercel',
    '<meta-app-secret>', '${CRON_SECRET}', '{{ secret }}',
    'SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', '00000000000000000000000000000000',
    '', '   ',
  ])('«%s» es relleno', (v) => expect(isPlaceholderCredential(v)).toBe(true));

  test.each([
    REAL,
    ['sk_test_', '51H8abcdefghijklmnopqrstuvwxyz0123'].join(''), // clave de test de Stripe: real, no relleno (partida para que el escáner de GitHub no la tome por una clave real)
    'whsec_dGVzdC1zZWNyZXQtcGFyYS1qZXN0',
    'master-token-abc-0123456789abcdef',
    'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    'testing-9f8e7d6c5b4a39281706f5e4d3c2b1a0',        // contiene «test» pero no es la palabra entera
    'x7Qp9Lm2Rt4Vw8Yz1Bn5Cd3Fg6Hj0Kl',
  ])('«%s» NO es relleno', (v) => expect(isPlaceholderCredential(v)).toBe(false));

  test('todos los valores secretos de .env.example son relleno', () => {
    const envExample = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf8');
    const secretKeys = /(SECRET|TOKEN|_KEY|PASSWORD|AUTH)$/;
    const offenders: string[] = [];
    for (const line of envExample.split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (!m) continue;
      const [, key, value] = m;
      if (!secretKeys.test(key)) continue;
      if (value.trim() === '') continue; // vacío ya cuenta como no configurado
      if (!isPlaceholderCredential(value)) offenders.push(`${key}=${value}`);
    }
    // Si esto falla, alguien puso en .env.example un valor que el sistema
    // aceptaría como secreto real. O es relleno mal escrito, o es un secreto de verdad.
    expect(offenders).toEqual([]);
  });
});

describe('secretProblem / isRealSecret', () => {
  test('missing / placeholder / too_short / null', () => {
    expect(secretProblem(undefined)).toBe('missing');
    expect(secretProblem('')).toBe('missing');
    expect(secretProblem(42)).toBe('missing');
    expect(secretProblem('your-secure-random-token-here')).toBe('placeholder');
    expect(secretProblem('abc')).toBe('too_short');
    expect(secretProblem(REAL)).toBeNull();
    expect(isRealSecret(REAL)).toBe(true);
    expect(isRealSecret('changeme')).toBe(false);
  });

  test('longitud mínima: default 16; un min <= 0 no desactiva la comprobación', () => {
    const fifteen = 'abcdefghijklmno';
    expect(fifteen).toHaveLength(DEFAULT_MIN_SECRET_LENGTH - 1);
    expect(secretProblem(fifteen)).toBe('too_short');
    expect(secretProblem(fifteen + 'p')).toBeNull();
    expect(secretProblem(REAL, 33)).toBe('too_short');
    expect(secretProblem(REAL, 32)).toBeNull();
    expect(secretProblem('abc', 0)).toBe('too_short');
    expect(secretProblem('abc', -5)).toBe('too_short');
    expect(secretProblem('abc', Number.NaN)).toBe('too_short');
  });
});

describe('readRealSecret / requireRealSecret', () => {
  const NAME = 'F0SEC_TEST_SECRET';
  const ALIAS = 'F0SEC_TEST_SECRET_LEGACY';
  afterEach(() => {
    delete process.env[NAME];
    delete process.env[ALIAS];
  });

  test('devuelve el valor tal cual cuando es real', () => {
    process.env[NAME] = REAL;
    expect(readRealSecret(NAME)).toBe(REAL);
    expect(requireRealSecret(NAME)).toBe(REAL);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('ausente / relleno / corto → null y un único registro por variable', () => {
    expect(readRealSecret(NAME)).toBeNull();
    process.env[NAME] = 'your-secure-random-token-here';
    expect(readRealSecret(NAME)).toBeNull();
    expect(readRealSecret(NAME)).toBeNull();
    process.env[NAME] = 'short';
    expect(readRealSecret(NAME)).toBeNull();
    // missing, placeholder, too_short: tres motivos → tres líneas; repetir no añade
    expect(errorSpy).toHaveBeenCalledTimes(3);
    const logged = errorSpy.mock.calls.map((c) => String(c[0]));
    expect(logged.every((l) => l.includes(NAME))).toBe(true);
    // Nunca se imprime el valor
    expect(logged.some((l) => l.includes('your-secure-random-token-here') || l.includes('short:'))).toBe(false);
  });

  test('alias: se usa cuando la principal falta; un alias de relleno no vale', () => {
    process.env[ALIAS] = REAL;
    expect(readRealSecret(NAME, { aliases: [ALIAS] })).toBe(REAL);
    process.env[ALIAS] = 'changeme';
    expect(readRealSecret(NAME, { aliases: [ALIAS] })).toBeNull();
  });

  test('requireRealSecret lanza WebhookError 401 <name>_not_configured; status/code configurables', () => {
    process.env[NAME] = 'whsec_your-webhook-secret';
    expect(() => requireRealSecret(NAME)).toThrow(WebhookError);
    expect(() => requireRealSecret(NAME)).toThrow(expect.objectContaining({ statusCode: 401, code: 'f0sec_test_secret_not_configured' }));
    expect(() => requireRealSecret(NAME, { status: 403, code: 'custom_code' })).toThrow(expect.objectContaining({ statusCode: 403, code: 'custom_code' }));
  });

  test('min: 32 para secretos HMAC largos', () => {
    process.env[NAME] = 'exactly-sixteen!';
    expect(readRealSecret(NAME)).toBe('exactly-sixteen!');
    expect(readRealSecret(NAME, { min: 32 })).toBeNull();
  });
});

describe('assertRealSecret (valores que no vienen de process.env)', () => {
  test('real → devuelve; relleno/corto/ausente → WebhookError con el código pedido', () => {
    expect(assertRealSecret(REAL, 'channel_app_secret')).toBe(REAL);
    for (const bad of [undefined, null, '', 'your-app-secret', 'changeme', 'abc']) {
      expect(() => assertRealSecret(bad, 'channel_app_secret', { status: 403, code: 'signature_secret_missing' }))
        .toThrow(expect.objectContaining({ statusCode: 403, code: 'signature_secret_missing' }));
    }
  });
});
