/**
 * «Botones de las secciones» (Estilo del sitio, 2026-11-07): qué token y qué interruptor del shell
 * escribe cada control, que «Volver a lo de hoy» no borra los tokens del preset y que el documento
 * sigue válido. Datos ficticios (org 120).
 */
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { cambiarBotonesSecciones, leerBotonesSecciones, radioMuestraBoton } from '../botonesSecciones';

function documento(tokens?: unknown, opciones: Record<string, unknown> = { show_topbar: true }): DocumentoSitio {
  const r = validarDocumentoSitio({
    schemaVersion: 1,
    identidad: {},
    tema: { modo: { mode: 'value', value: 'light' }, colores: {}, tipografia: {}, ...(tokens ? { tokens } : {}) },
    seo: {},
    contenido: {},
    shell: {
      header: { composicion: 'default', menuPrincipalId: null, opciones },
      footer: { composicion: 'default', menuIds: [], opciones: {} },
    },
    menus: [],
    paginas: [{ id: 'p1', slug: 'home', tipo: 'home', titulo: 'Inicio', publicada: true, secciones: [] }],
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errores));
  return r.documento;
}

/** Tokens que deja un preset (como «minimal_premium» de presetsDiseno.ts). */
const DEL_PRESET = {
  boton: { forma: { mode: 'value', value: 'redondeado' }, relleno: { mode: 'value', value: 'fantasma' }, tamano: { mode: 'value', value: 's' }, mayusculas: { mode: 'value', value: true } },
};

describe('lectura', () => {
  test('sin tokens ni interruptor: lo de hoy', () => {
    expect(leerBotonesSecciones(documento())).toEqual({ activo: false, forma: null, relleno: null, tamano: null, mayusculas: false });
    expect(leerBotonesSecciones(null).activo).toBe(false);
  });

  test('tokens del preset sin el interruptor: se leen pero no están activos ni pintan mayúsculas', () => {
    const v = leerBotonesSecciones(documento(DEL_PRESET));
    expect(v).toEqual({ activo: false, forma: 'redondeado', relleno: 'fantasma', tamano: 's', mayusculas: false });
  });

  test('mayúsculas = token true Y buttons_uppercase_active', () => {
    expect(leerBotonesSecciones(documento(DEL_PRESET, { buttons_uppercase_active: true })).mayusculas).toBe(true);
    expect(leerBotonesSecciones(documento(undefined, { buttons_uppercase_active: true })).mayusculas).toBe(false);
  });

  test('un interruptor con un valor inválido cuenta como apagado', () => {
    expect(leerBotonesSecciones(documento(DEL_PRESET, { buttons_theme_active: 'si' })).activo).toBe(false);
  });
});

describe('escritura', () => {
  test.each([
    [{ forma: 'pildora' as const }, 'forma', 'pildora'],
    [{ relleno: 'sombra_dura' as const }, 'relleno', 'sombra_dura'],
    [{ tamano: 'l' as const }, 'tamano', 'l'],
  ])('%o escribe tokens.boton.%s y enciende buttons_theme_active', (cambio, token, valor) => {
    const doc = cambiarBotonesSecciones(documento(), cambio);
    expect((doc.tema.tokens?.boton as Record<string, unknown>)[token]).toEqual({ mode: 'value', value: valor });
    expect(doc.shell.header.opciones).toMatchObject({ show_topbar: true, buttons_theme_active: true });
    expect(validarDocumentoSitio(doc).ok).toBe(true);
    expect(leerBotonesSecciones(doc).activo).toBe(true);
  });

  test('conserva los demás tokens (del preset y de otros grupos)', () => {
    const doc = cambiarBotonesSecciones(documento({ ...DEL_PRESET, radio: { mode: 'value', value: 'suave' } }), { forma: 'cuadrado' });
    expect(doc.tema.tokens).toEqual({
      radio: { mode: 'value', value: 'suave' },
      boton: { ...DEL_PRESET.boton, forma: { mode: 'value', value: 'cuadrado' } },
    });
  });

  test('un valor fuera del contrato no cambia nada', () => {
    const d = documento();
    expect(cambiarBotonesSecciones(d, { forma: 'ovalo' as never })).toBe(d);
  });

  test('«Volver a lo de hoy» deja buttons_theme_active en false sin borrar los tokens', () => {
    const activo = cambiarBotonesSecciones(documento(DEL_PRESET), { forma: 'pildora' });
    const doc = cambiarBotonesSecciones(activo, { volverAHoy: true });
    expect(doc.shell.header.opciones.buttons_theme_active).toBe(false);
    expect(doc.tema.tokens?.boton).toEqual({ ...DEL_PRESET.boton, forma: { mode: 'value', value: 'pildora' } });
    expect(leerBotonesSecciones(doc).activo).toBe(false);
    expect(validarDocumentoSitio(doc).ok).toBe(true);
  });

  test('mayúsculas: prender escribe el token y buttons_uppercase_active; apagar solo apaga el interruptor', () => {
    const on = cambiarBotonesSecciones(documento(), { mayusculas: true });
    expect(on.tema.tokens?.boton?.mayusculas).toEqual({ mode: 'value', value: true });
    expect(on.shell.header.opciones).toMatchObject({ buttons_uppercase_active: true });
    expect(on.shell.header.opciones).not.toHaveProperty('buttons_theme_active');
    const off = cambiarBotonesSecciones(on, { mayusculas: false });
    expect(off.shell.header.opciones.buttons_uppercase_active).toBe(false);
    expect(off.tema.tokens?.boton?.mayusculas).toEqual({ mode: 'value', value: true });
    expect(leerBotonesSecciones(off).mayusculas).toBe(false);
  });

  test('no muta el documento de entrada', () => {
    const d = documento(DEL_PRESET);
    const copia = JSON.parse(JSON.stringify(d));
    cambiarBotonesSecciones(d, { relleno: 'solido' });
    cambiarBotonesSecciones(d, { volverAHoy: true });
    expect(d).toEqual(copia);
  });
});

test('radio de la muestra', () => {
  expect(radioMuestraBoton('pildora', 12)).toBe(9999);
  expect(radioMuestraBoton('cuadrado', 12)).toBe(0);
  expect(radioMuestraBoton('redondeado', 12)).toBe(12);
  expect(radioMuestraBoton('redondeado', 0)).toBe(8);
  expect(radioMuestraBoton(null, 4)).toBe(4);
});
