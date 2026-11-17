import { createHash, webcrypto } from 'crypto';
import { esLlave, generarLlave, hashLlave, llaveDeCabecera, nuevoIdLocal } from '../llave';

beforeAll(() => {
  if (!(globalThis as { crypto?: Crypto }).crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
  }
});

describe('clave del equipo (§4.3)', () => {
  test('32 bytes al azar en hexadecimal, distinta cada vez', () => {
    const a = generarLlave();
    const b = generarLlave();
    expect(esLlave(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  test('el hash del equipo es el SHA-256 que guarda la base', async () => {
    const llave = 'a'.repeat(64);
    expect(await hashLlave(llave)).toBe(createHash('sha256').update(llave).digest('hex'));
    await expect(hashLlave('corta')).rejects.toThrow('llave_invalida');
  });

  test('Authorization: Bearer con la forma exacta; lo demás es null', () => {
    const llave = 'b'.repeat(64);
    expect(llaveDeCabecera(`Bearer ${llave}`)).toBe(llave);
    expect(llaveDeCabecera(`Bearer ${llave.toUpperCase()}`)).toBe(llave);
    expect(llaveDeCabecera(llave)).toBeNull();
    expect(llaveDeCabecera('Bearer x')).toBeNull();
    expect(llaveDeCabecera(null)).toBeNull();
  });

  test('id_local es un UUID v4', () => {
    expect(nuevoIdLocal()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
