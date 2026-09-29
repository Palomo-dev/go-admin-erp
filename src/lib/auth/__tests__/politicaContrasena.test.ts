/**
 * Política única de contraseña (decisión v2-5, docs/design/AUTH-ACCESO-V2.md §12.4):
 * 10 caracteres, distinta del correo, no filtrada; sin reglas de composición.
 */
import { webcrypto, createHash } from 'crypto';
import {
  LONGITUD_MINIMA_CONTRASENA,
  esIgualAlCorreo,
  estaFiltrada,
  evaluarContrasena,
  motivoRechazo,
  URL_RANGO_HIBP,
} from '../politicaContrasena';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

describe('política única de contraseña', () => {
  test('mínimo 10 caracteres, sin exigir mayúsculas ni símbolos', () => {
    expect(LONGITUD_MINIMA_CONTRASENA).toBe(10);
    expect(motivoRechazo('corta123')).toBe('longitud');
    expect(motivoRechazo('solominusculas')).toBeNull();
    expect(evaluarContrasena('solominusculas').valida).toBe(true);
  });

  test('no puede ser el correo ni su parte local', () => {
    expect(esIgualAlCorreo('ana.gomez@ejemplo.com', 'Ana.Gomez@Ejemplo.com')).toBe(true);
    expect(esIgualAlCorreo('ana.gomez', 'ana.gomez@ejemplo.com')).toBe(true);
    expect(motivoRechazo('ana.gomez@ejemplo.com', { correo: 'ana.gomez@ejemplo.com' })).toBe('igual_al_correo');
    expect(motivoRechazo('otra-cosa-larga', { correo: 'ana.gomez@ejemplo.com' })).toBeNull();
  });

  test('filtrada = rechazada; sin comprobar no se bloquea en el navegador', () => {
    expect(motivoRechazo('contrasena-filtrada', { filtrada: true })).toBe('filtrada');
    expect(evaluarContrasena('contrasena-filtrada', { filtrada: true }).valida).toBe(false);
    expect(evaluarContrasena('contrasena-filtrada', { filtrada: null }).valida).toBe(true);
  });

  test('niveles del medidor', () => {
    expect(evaluarContrasena('').nivel).toBe('vacia');
    expect(evaluarContrasena('corta').nivel).toBe('debil');
    expect(evaluarContrasena('diezletras').nivel).toBe('aceptable');
    expect(evaluarContrasena('una frase bastante larga').nivel).toBe('fuerte');
  });
});

describe('estaFiltrada (Have I Been Pwned por k-anonimato)', () => {
  const contrasena = 'password123456';
  const sha1 = createHash('sha1').update(contrasena).digest('hex').toUpperCase();

  test('solo viaja el prefijo de 5 caracteres del SHA-1 y la coincidencia se hace aquí', async () => {
    const fetchImpl = jest.fn(async () => new Response(`00000000000000000000000000000000000:0\n${sha1.slice(5)}:42\n`));
    await expect(estaFiltrada(contrasena, { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toBe(true);
    const url = (fetchImpl.mock.calls[0] as unknown[])[0] as string;
    expect(url).toBe(`${URL_RANGO_HIBP}${sha1.slice(0, 5)}`);
    expect(url).not.toContain(contrasena);
  });

  test('no aparece → false; con padding (cuenta 0) tampoco cuenta', async () => {
    const fetchImpl = jest.fn(async () => new Response(`${sha1.slice(5)}:0\nABCDEF:3\n`));
    await expect(estaFiltrada(contrasena, { fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toBe(false);
  });

  test('sin red o error del servicio → null (no se sabe)', async () => {
    const caida = jest.fn(async () => {
      throw new Error('sin red');
    });
    await expect(estaFiltrada(contrasena, { fetchImpl: caida as unknown as typeof fetch })).resolves.toBeNull();
    const error = jest.fn(async () => new Response('x', { status: 503 }));
    await expect(estaFiltrada(contrasena, { fetchImpl: error as unknown as typeof fetch })).resolves.toBeNull();
  });
});
