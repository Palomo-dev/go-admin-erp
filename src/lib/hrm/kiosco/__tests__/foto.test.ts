import { FOTO_BYTES_MAX, diasFotoValidos, esRutaFoto, fotoBorrable, leerFotoDataUrl, venceFoto } from '../foto';
import { cambiosKiosco, cuerpoKiosco, formularioKioscoDesde, kioscoDeCuerpo, separarCuerpo } from '../metodosKiosco';

const EVENTO = '0f1e2d3c-4b5a-4987-8a6b-5c4d3e2f1a0b';

describe('retención de la foto de evidencia (D5)', () => {
  test('días: 7 a 90, enteros', () => {
    expect(diasFotoValidos(30)).toBe(true);
    expect(diasFotoValidos(7)).toBe(true);
    expect(diasFotoValidos(90)).toBe(true);
    expect(diasFotoValidos(6)).toBe(false);
    expect(diasFotoValidos(91)).toBe(false);
    expect(diasFotoValidos(30.5)).toBe(false);
    expect(diasFotoValidos('30')).toBe(false);
  });

  test('vence a los días de la sede desde la hora de la marca', () => {
    expect(venceFoto('2026-11-16T14:02:00.000Z', 30)).toBe('2026-12-16T14:02:00.000Z');
    expect(venceFoto('2026-11-16T14:02:00.000Z', 3)).toBeNull();
  });

  test('la tarea solo borra lo vencido sin retención por caso', () => {
    const ahora = Date.parse('2026-12-20T00:00:00Z');
    const base = { photo_path: `org/1/2026/11/${EVENTO}.jpg`, photo_expires_at: '2026-12-16T14:02:00Z', photo_hold: false, caso_abierto: false };
    expect(fotoBorrable(base, ahora)).toBe(true);
    expect(fotoBorrable({ ...base, photo_hold: true }, ahora)).toBe(false);
    expect(fotoBorrable({ ...base, caso_abierto: true }, ahora)).toBe(false);
    expect(fotoBorrable({ ...base, photo_expires_at: '2026-12-30T00:00:00Z' }, ahora)).toBe(false);
    expect(fotoBorrable({ ...base, photo_path: null }, ahora)).toBe(false);
  });

  test('la ruta es la de la base y de la organización del equipo', () => {
    expect(esRutaFoto(`org/120/2026/11/${EVENTO}.jpg`, 120)).toBe(true);
    expect(esRutaFoto(`org/121/2026/11/${EVENTO}.jpg`, 120)).toBe(false);
    expect(esRutaFoto(`org/120/2026/13/${EVENTO}.jpg`, 120)).toBe(false);
    expect(esRutaFoto(`../org/120/2026/11/${EVENTO}.jpg`, 120)).toBe(false);
  });

  test('solo JPEG o WebP en data URL y hasta 700 KB', () => {
    const r = leerFotoDataUrl('data:image/jpeg;base64,/9j/4AAQ');
    expect(r?.tipo).toBe('image/jpeg');
    expect(leerFotoDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBeNull();
    expect(leerFotoDataUrl('data:image/jpeg;base64,***')).toBeNull();
    expect(leerFotoDataUrl(`data:image/jpeg;base64,${'A'.repeat(Math.ceil((FOTO_BYTES_MAX * 4) / 3) + 8)}`)).toBeNull();
  });
});

describe('métodos del kiosco en Métodos por sede', () => {
  test('valores por defecto: PIN y carné apagados, foto a 30 días', () => {
    expect(formularioKioscoDesde(null, null)).toEqual({
      pin: { activo: false, foto: true },
      carne: { activo: false, foto: true },
      foto: { dias: 30, letrero: false },
    });
  });

  test('cuerpo del PUT y días inválidos', () => {
    const f = formularioKioscoDesde({ pin: { activo: true, reglas: { foto: false } } }, { dias: 20, letrero_puesto: true });
    expect(cuerpoKiosco(f)).toEqual({
      ok: true,
      metodos: { pin: { activo: true, reglas: { foto: false } }, carne: { activo: false, reglas: { foto: true } }, foto: { dias: 20, letrero_puesto: true } },
    });
    expect(cuerpoKiosco({ ...f, foto: { dias: 120, letrero: false } })).toEqual({ ok: false, error: 'foto_dias_invalido' });
    expect(cambiosKiosco(f, { ...f, pin: { activo: false, foto: false } })).toBe(1);
  });

  test('el servidor separa lo de M0 de lo del kiosco y valida su forma', () => {
    const { m0, kiosco } = separarCuerpo({ qr: { activo: true }, pin: { activo: true, reglas: { foto: true } }, foto: { dias: 30 } });
    expect(Object.keys(m0)).toEqual(['qr']);
    expect(kioscoDeCuerpo(kiosco!)).toEqual({ ok: true, valor: { pin: { activo: true, reglas: { foto: true } }, foto: { dias: 30, letrero_puesto: false } } });
    expect(separarCuerpo({ qr: { activo: true } }).kiosco).toBeNull();
    expect(kioscoDeCuerpo({ foto: { dias: 200 } })).toEqual({ ok: false, error: 'foto_dias_invalido' });
    expect(kioscoDeCuerpo({ pin: { activo: 'si' } })).toEqual({ ok: false, error: 'datos_invalidos' });
  });
});
