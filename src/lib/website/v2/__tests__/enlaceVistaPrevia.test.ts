import {
  DURACION_ENLACE_SEGUNDOS,
  firmarTokenVistaPrevia,
  secretoVistaPrevia,
  verificarTokenVistaPrevia,
  type CargaVistaPrevia,
} from '../enlaceVistaPrevia';

const SECRETO = 'a'.repeat(16) + 'b7c9d2e4f6a8b1c3d5e7f9a2b4c6d8e0';
const AHORA = 1_790_000_000;
const carga: CargaVistaPrevia = {
  v: 1,
  o: 120,
  s: '0b6a3f6e-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
  e: AHORA + DURACION_ENLACE_SEGUNDOS,
  r: 'https://erp.goadmin.io/organizacion/branding/editor/p1',
};

describe('enlace privado de la vista previa', () => {
  test('firma y verifica ida y vuelta', () => {
    const token = firmarTokenVistaPrevia(carga, SECRETO);
    expect(verificarTokenVistaPrevia(token, SECRETO, AHORA)).toEqual({ ok: true, carga });
  });

  test('caduca a las 24 h', () => {
    const token = firmarTokenVistaPrevia(carga, SECRETO);
    expect(verificarTokenVistaPrevia(token, SECRETO, carga.e)).toEqual({ ok: false, motivo: 'caducado' });
  });

  test('otra organización en la carga invalida la firma', () => {
    const token = firmarTokenVistaPrevia(carga, SECRETO);
    const [, firma] = token.split('.');
    const otraCarga = Buffer.from(JSON.stringify({ ...carga, o: 121 })).toString('base64url');
    expect(verificarTokenVistaPrevia(`${otraCarga}.${firma}`, SECRETO, AHORA)).toEqual({ ok: false, motivo: 'firma' });
  });

  test('otro secreto no verifica', () => {
    const token = firmarTokenVistaPrevia(carga, SECRETO);
    expect(verificarTokenVistaPrevia(token, `${SECRETO}x`, AHORA).ok).toBe(false);
  });

  test('formato inválido', () => {
    expect(verificarTokenVistaPrevia('sin-punto', SECRETO, AHORA)).toEqual({ ok: false, motivo: 'formato' });
    expect(verificarTokenVistaPrevia('a.b.c', SECRETO, AHORA)).toEqual({ ok: false, motivo: 'formato' });
  });

  test('carga mal formada aunque esté firmada', () => {
    const token = firmarTokenVistaPrevia({ ...carga, s: 'no-es-uuid' }, SECRETO);
    expect(verificarTokenVistaPrevia(token, SECRETO, AHORA)).toEqual({ ok: false, motivo: 'formato' });
  });

  test('falla cerrado sin secreto, con relleno o corto', () => {
    expect(secretoVistaPrevia({})).toBeNull();
    expect(secretoVistaPrevia({ WEBSITE_PREVIEW_SECRET: 'corto' })).toBeNull();
    expect(secretoVistaPrevia({ WEBSITE_PREVIEW_SECRET: 'your-secure-random-token-here-your-secure' })).toBeNull();
    expect(secretoVistaPrevia({ WEBSITE_PREVIEW_SECRET: SECRETO })).toBe(SECRETO);
  });
});
