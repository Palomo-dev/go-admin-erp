/**
 * «Ajustes de reseñas» (Figma «16 Sitio web» 3131-92277): NULL = lo de antes del 2026-11-25 y la
 * hoja solo escribe lo que manda, validado. Y el contrato del origen y del switch de las de ejemplo
 * (`seccionesFicha.ts`, copia compartida con la tienda).
 */
import { columnasDeCambios, leerAjustesResenas } from '../ajustesResenas';
import {
  CLAVE_EJEMPLOS_VERIFICADA,
  CLAVES_NUEVAS_RESENAS,
  ejemplosConVerificada,
  grupoOrigenResenas,
  leerOpcionesResenas,
  origenEfectivoResenas,
  umbralOrigenResenas,
} from '../v2/seccionesFicha';

describe('leerAjustesResenas', () => {
  test('fila de una tienda de antes (todo NULL): como hoy', () => {
    expect(leerAjustesResenas({ reviews_default_source: null, reviews_auto_approve: false })).toEqual({
      origenTienda: null,
      moderar: true,
      quienEscribe: 'any',
      fotos: true,
      correo: { activo: false, dias: 7, recordatorio: true },
    });
  });

  test('tienda nueva y valores guardados', () => {
    const a = leerAjustesResenas({
      reviews_default_source: 'real',
      reviews_auto_approve: true,
      reviews_who_can_write: 'buyers',
      reviews_allow_photos: false,
      reviews_request_enabled: true,
      reviews_request_days: 10,
      reviews_request_reminder: false,
    });
    expect(a).toEqual({ origenTienda: 'real', moderar: false, quienEscribe: 'buyers', fotos: false, correo: { activo: true, dias: 10, recordatorio: false } });
  });

  test('días fuera de rango o basura: 7', () => {
    expect(leerAjustesResenas({ reviews_request_days: 90 }).correo.dias).toBe(7);
    expect(leerAjustesResenas({ reviews_default_source: 'otra' }).origenTienda).toBeNull();
  });
});

describe('columnasDeCambios', () => {
  test('moderar es auto-aprobar al revés y solo se escribe lo que viene', () => {
    expect(columnasDeCambios({ moderar: false })).toEqual({ ok: true, columnas: { reviews_auto_approve: true } });
    expect(columnasDeCambios({ quienEscribe: 'buyers', correo: { dias: 3 } })).toEqual({
      ok: true,
      columnas: { reviews_who_can_write: 'buyers', reviews_request_days: 3 },
    });
  });

  test('rechaza valores inválidos y el cuerpo vacío', () => {
    expect(columnasDeCambios({ quienEscribe: 'todos' }).ok).toBe(false);
    expect(columnasDeCambios({ correo: { dias: 0 } }).ok).toBe(false);
    expect(columnasDeCambios({ correo: { dias: 31 } }).ok).toBe(false);
    expect(columnasDeCambios({ fotos: 'si' }).ok).toBe(false);
    expect(columnasDeCambios({}).ok).toBe(false);
    expect(columnasDeCambios(null).ok).toBe(false);
  });

  test('el origen no se cambia desde la hoja', () => {
    expect(columnasDeCambios({ origenTienda: 'real' }).ok).toBe(false);
  });
});

describe('origen y switch de la sección', () => {
  test('la sección manda; si no, la tienda; si no, ejemplos (lo de siempre)', () => {
    expect(origenEfectivoResenas({}, null)).toBe('generated');
    expect(origenEfectivoResenas({}, 'real')).toBe('real');
    expect(origenEfectivoResenas({ reviews_source: 'auto' }, 'real')).toBe('auto');
    expect(grupoOrigenResenas('mixed')).toBe('hasta_n');
    expect(umbralOrigenResenas({}, 'mixed')).toBe(10);
    expect(umbralOrigenResenas({}, 'auto')).toBe(3);
  });

  test('switch encendido por defecto y sin activar el pintado nuevo', () => {
    expect(ejemplosConVerificada({})).toBe(true);
    expect(ejemplosConVerificada({ [CLAVE_EJEMPLOS_VERIFICADA]: false })).toBe(false);
    expect(CLAVES_NUEVAS_RESENAS).not.toContain(CLAVE_EJEMPLOS_VERIFICADA);
    expect(leerOpcionesResenas({ [CLAVE_EJEMPLOS_VERIFICADA]: false }).conOpciones).toBe(false);
  });
});
