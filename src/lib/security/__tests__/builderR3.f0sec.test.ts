/// <reference types="jest" />
/**
 * F0-SEC r3 · constructor · cierre de los huecos menores del detector de
 * relleno (tester r2, hallazgos 4 y 5) y del aviso de alias (sonda, anexo A).
 *
 *  - Hueco 4: `AAAA…A=` (base64 de bytes repetidos con relleno) → placeholder.
 *  - Hueco 5: `undefinedundefined`, `undefined-undefined`, `null_null` (dos
 *    palabras de relleno pegadas o separadas) → placeholder; `changeme` en
 *    cualquier posición (`1234changeme5678`) → placeholder.
 *  - Decisiones que se conservan a propósito (documentadas, con test):
 *    `abc-your-…` con ≥ 48 chars sigue aceptándose (el tope de 48 protege a un
 *    secreto largo real que contenga `your-`); `abcdefgh-todo-1234567` sigue
 *    rechazándose (falso positivo conservador: `todo-` tras un prefijo corto);
 *    `min: Infinity` cae al default 16 (no a «rechazar todo»): el tester r2 lo
 *    fijó así en su propio test.
 *  - Sonda: `readRealSecret` con principal de relleno y alias real devuelve el
 *    alias Y avisa (una vez) de que se está usando el alias.
 */
import { isPlaceholderCredential } from '@/lib/crm/providerCatalog';
import { _resetSecretReports, readRealSecret, secretProblem } from '../secrets';

beforeEach(() => {
  _resetSecretReports();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('hueco 4 · base64 de bytes repetidos con "=" de relleno', () => {
  test.each([
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    '////////////////////////////////////////////=',
    'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    'xxxxxxxxxxxxxxxxxxxxx=',
  ])('%s → placeholder', (v) => {
    expect(isPlaceholderCredential(v)).toBe(true);
    expect(secretProblem(v)).toBe('placeholder');
  });

  test('base64 real con relleno o cuerpo no uniforme → válido', () => {
    expect(secretProblem('YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=')).toBe(null);
    expect(secretProblem('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB=')).toBe(null);
    expect(secretProblem('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=B')).toBe(null);
  });
});

describe('hueco 5 · composiciones de palabras de relleno y marcas en cualquier posición', () => {
  test.each([
    'undefinedundefined',
    'undefined-undefined',
    'undefined_undefined',
    'null.null',
    'nullundefined',
    'secret-secret-secret',
    'changemechangeme',
    '1234changeme5678',
    'abc-change-me-xyz-0123456789',
    'sk_live_cambia-esto_9876543210',
    'whsec_undefined-undefined',
  ])('%s → placeholder', (v) => {
    expect(secretProblem(v)).toBe('placeholder');
  });

  test('un secreto real que contiene una palabra de relleno como subcadena (no compuesto solo de ellas) sigue valiendo', () => {
    expect(secretProblem(['sk_test_', '51H8f2kL9mN3pQ7rS1tU5vW9xY2zA4b'].join(''))).toBe(null);
    expect(secretProblem('secretsecretsecret9')).toBe(null); // no es solo palabras de relleno
    expect(secretProblem('0123456789abcdefnullx')).toBe(null);
    // `sk_test_…` sigue valiendo (el prefijo de proveedor se quita y el resto es aleatorio),
    // pero `testtesttesttest` es SOLO la palabra de relleno repetida: mismo trato que `changemechangeme`.
    expect(secretProblem('sk_test_9f8e7d6c5b4a3f2e1d0c')).toBe(null);
    expect(secretProblem('testtesttesttest')).toBe('placeholder');
  });

  test('decisiones conservadas a propósito', () => {
    expect(secretProblem('abc-your-secure-random-token-here-with-a-long-tail-1234567')).toBe(null); // ≥ 48 con your- en medio
    expect(secretProblem('abcdefgh-todo-1234567')).toBe('placeholder'); // falso positivo conservador
    expect(secretProblem('abcdefghijklmno', Infinity)).toBe('too_short');
    expect(secretProblem('abcdefghijklmnop', Infinity)).toBe(null);
  });
});

describe('sonda · alias: se usa y se avisa', () => {
  const MAIN = 'F0SEC_R3_MAIN_SECRET';
  const ALIAS = 'F0SEC_R3_ALIAS_SECRET';
  afterEach(() => { delete process.env[MAIN]; delete process.env[ALIAS]; });

  test('principal de relleno + alias real → devuelve el alias y avisa UNA vez, sin imprimir el valor', () => {
    process.env[MAIN] = 'your-secure-random-token-here';
    process.env[ALIAS] = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    expect(readRealSecret(MAIN, { aliases: [ALIAS] })).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    expect(readRealSecret(MAIN, { aliases: [ALIAS] })).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    const warns = (console.warn as jest.Mock).mock.calls.map((c) => String(c[0]));
    expect(warns.filter((w) => w.includes(MAIN) && w.includes(ALIAS))).toHaveLength(1);
    expect(warns.join('\n')).not.toContain('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    expect(console.error).not.toHaveBeenCalled();
  });

  test('principal corta + alias real → devuelve el alias y avisa de que es corta', () => {
    process.env[MAIN] = 'corto';
    process.env[ALIAS] = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    expect(readRealSecret(MAIN, { aliases: [ALIAS] })).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('demasiado corta'));
  });

  test('principal ausente + alias real → devuelve el alias SIN aviso (uso legítimo del alias legacy)', () => {
    process.env[ALIAS] = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    expect(readRealSecret(MAIN, { aliases: [ALIAS] })).toBe('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6');
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('principal real → nunca se mira el alias', () => {
    process.env[MAIN] = 'f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6';
    process.env[ALIAS] = 'changeme';
    expect(readRealSecret(MAIN, { aliases: [ALIAS] })).toBe('f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6');
    expect(console.warn).not.toHaveBeenCalled();
  });
});
