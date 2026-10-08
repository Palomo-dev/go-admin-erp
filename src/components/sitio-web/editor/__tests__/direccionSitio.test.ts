/**
 * Direcciones del sitio que se edita (direccionSitio.ts): «Ver sitio publicado» de la sede, lienzo
 * sobre el borrador firmado y espera de los datos de la sede antes de fijar la URL del lienzo.
 * Datos ficticios: org 120 en `tienda-120.goadmin.io`, sede 7 servida en `/norte`.
 */
import {
  baseLienzoSitio,
  MARGEN_RENOVAR_FIRMA_MS,
  pedirFirmaLienzo,
  urlLienzoBorrador,
  urlPublicaSitio,
} from '../direccionSitio';

const HOST = 'https://tienda-120.goadmin.io';
const norte = { id: 7, is_main: false, is_active: true, is_web_published: true, slug: 'norte', custom_domain: null };
const conDominio = { id: 8, is_main: false, is_active: true, is_web_published: true, slug: 'sur', custom_domain: 'sur-ejemplo.com' };
const sinPublicar = { id: 9, is_main: false, is_active: true, is_web_published: false, slug: 'centro', custom_domain: null };
const SEDES = [norte, conDominio, sinPublicar];

describe('Ver sitio publicado', () => {
  test('con una sede elegida abre la URL pública de ESA sede', () => {
    expect(urlPublicaSitio(HOST, 7, SEDES)).toBe(`${HOST}/norte`);
    expect(urlPublicaSitio(HOST, 8, SEDES)).toBe('https://sur-ejemplo.com');
  });

  test('el principal sigue abriendo la URL de la organización', () => {
    expect(urlPublicaSitio(HOST, null, SEDES)).toBe(HOST);
    expect(urlPublicaSitio(HOST, null, null)).toBe(HOST);
  });

  test('una sede que el sitio no sirve aparte no ofrece el principal como si fuera suyo', () => {
    expect(urlPublicaSitio(HOST, 9, SEDES)).toBeNull();
    expect(urlPublicaSitio(HOST, 99, SEDES)).toBeNull();
  });

  test('mientras llegan las sedes no hay enlace (nunca el del principal)', () => {
    expect(urlPublicaSitio(HOST, 7, null)).toBeNull();
  });
});

describe('base del lienzo (sin borrador firmado)', () => {
  test('sede elegida y sus datos sin llegar: cargando, no el principal', () => {
    expect(baseLienzoSitio(HOST, 7, null)).toBeUndefined();
  });

  test('con los datos: la sede servida aparte; si no se sirve aparte, el principal como antes', () => {
    expect(baseLienzoSitio(HOST, 7, SEDES)).toBe(`${HOST}/norte`);
    expect(baseLienzoSitio(HOST, 9, SEDES)).toBe(HOST);
    expect(baseLienzoSitio(HOST, null, null)).toBe(HOST);
    expect(baseLienzoSitio(null, 7, SEDES)).toBeNull();
  });
});

describe('lienzo sobre el borrador', () => {
  test('la vista previa firmada, capa interior, en el host de la organización', () => {
    expect(urlLienzoBorrador(HOST, 'carga.firma', 'home')).toBe(`${HOST}/vista-previa/carga.firma?marco=1`);
    expect(urlLienzoBorrador(`${HOST}/`, 'carga.firma', 'carta-qr')).toBe(`${HOST}/vista-previa/carga.firma/carta-qr?marco=1`);
  });

  test('la ruta y el token van codificados', () => {
    expect(urlLienzoBorrador(HOST, 'a/b', 'mi página')).toBe(`${HOST}/vista-previa/a%2Fb/mi%20p%C3%A1gina?marco=1`);
  });

  test('la firma se pide una vez por sitio, se renueva antes de caducar y no se insiste si falla', () => {
    const ahora = Date.parse('2026-10-08T12:00:00Z');
    expect(pedirFirmaLienzo(null, null, ahora)).toBe(false);
    expect(pedirFirmaLienzo('s1', null, ahora)).toBe(true);
    const vigente = { sitioId: 's1', token: 't', caducaEn: ahora + 24 * 60 * 60 * 1000 };
    expect(pedirFirmaLienzo('s1', vigente, ahora)).toBe(false);
    expect(pedirFirmaLienzo('s2', vigente, ahora)).toBe(true);
    expect(pedirFirmaLienzo('s1', { ...vigente, caducaEn: ahora + MARGEN_RENOVAR_FIRMA_MS - 1 }, ahora)).toBe(true);
    expect(pedirFirmaLienzo('s1', { sitioId: 's1', token: null, caducaEn: 0 }, ahora)).toBe(false);
  });
});
