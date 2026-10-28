import {
  CLAVES_AVANZADO_EN_ESTILO,
  cambioColorBordeUnico,
  cambioColorTextoUnico,
  cambioFondoUnico,
  cambioGrosorBordeUnico,
  estiloConFuentesCascaron,
  grosorBordeUnico,
  leerColorBordeUnico,
  leerColorTextoUnico,
  leerFondoUnico,
  sinFuentesCascaron,
} from '../inspector/estiloUnico';
import { campoCubiertoPorEstilo } from '../inspector/espaciadoSeccion';
import { leerEstiloSeccion } from '@/lib/website/v2/estiloSeccion';

const vacia = { settings: {}, contenido: {} };

describe('ESTILO-01 fondo: una sola opción en Estilo', () => {
  it('sin nada guardado: «Del tema», como hoy', () => {
    expect(leerFondoUnico(vacia)).toEqual({ modo: 'tema', origen: 'estilo' });
  });
  it('lee lo que hoy pinta la tienda, con su precedencia', () => {
    expect(leerFondoUnico({ settings: { bg_color: '#112233' }, contenido: {} })).toMatchObject({ modo: 'color', color: '#112233', origen: 'anterior' });
    expect(leerFondoUnico({ settings: { bg_color: '#112233' }, contenido: { bg_type: 'color', bg_color: '#aabbcc' } })).toMatchObject({ modo: 'color', color: '#aabbcc', origen: 'avanzado' });
    expect(leerFondoUnico({ settings: {}, contenido: { bg_type: 'gradient', bg_gradient_from: '#000000', bg_gradient_to: '#ffffff', bg_gradient_dir: 'to-b' } })).toMatchObject({ modo: 'degradado', direccion: 'to-b' });
    expect(leerFondoUnico({ settings: {}, contenido: { bg_type: 'color', bg_color: '#aabbcc', section_background: { image_url: 'https://x/y.jpg' } } })).toMatchObject({ modo: 'imagen', origen: 'cascaron' });
    expect(leerFondoUnico({ settings: {}, contenido: { section_background: { gradient_1: '#000000', gradient_2: '#ffffff', gradient_angle: 180 } } })).toMatchObject({ modo: 'degradado', direccion: 'to-b' });
    expect(leerFondoUnico({ settings: { estilo: { v: 1, fondo: 'oscuro' } }, contenido: {} })).toMatchObject({ modo: 'oscuro', origen: 'estilo' });
  });
  it('al editar escribe en un solo sitio y limpia los demás (sin tocar lo ajeno)', () => {
    const a = {
      settings: { bg_color: '#112233', otra: 1 },
      contenido: { bg_type: 'gradient', bg_gradient_from: '#000000', section_background: { color: '#ff0000', padding_top: 0, separator: 'wave' }, title: 'Hola' },
    };
    const r = cambioFondoUnico(a, { modo: 'oscuro' });
    expect(r.settings.bg_color).toBeUndefined();
    expect(r.settings.otra).toBe(1);
    expect(leerEstiloSeccion(r.settings).fondo).toBe('oscuro');
    expect(r.contenido).toEqual({ section_background: { padding_top: 0, separator: 'wave' }, title: 'Hola' });
    expect(leerFondoUnico(r)).toMatchObject({ modo: 'oscuro' });
  });
  it('color y degradado van a un solo sitio y se vuelven a leer igual', () => {
    const c = cambioFondoUnico(vacia, { modo: 'color', color: '#abcdef' });
    expect(c.contenido).toEqual({ bg_type: 'color', bg_color: '#abcdef' });
    expect(leerFondoUnico(c)).toMatchObject({ modo: 'color', color: '#abcdef' });
    const d = cambioFondoUnico(c, { modo: 'degradado', desde: '#000000', hasta: '#ffffff', direccion: 'to-br' });
    expect(d.contenido).toEqual({ bg_type: 'gradient', bg_gradient_from: '#000000', bg_gradient_to: '#ffffff', bg_gradient_dir: 'to-br' });
  });
  it('imagen va al fondo común y conserva la de celular', () => {
    const r = cambioFondoUnico({ settings: {}, contenido: { section_background: { image_url_mobile: 'm.jpg', parallax: true } } }, { modo: 'imagen', imagen: 'd.jpg', capa: 30 });
    expect(r.contenido.section_background).toEqual({ image_url_mobile: 'm.jpg', parallax: true, image_url: 'd.jpg', overlay_opacity: 30 });
    expect(leerEstiloSeccion(r.settings).fondo).toBe('imagen');
    expect(leerFondoUnico(r)).toMatchObject({ modo: 'imagen', imagen: 'd.jpg', capa: 30 });
  });
  it('Avanzado ya no muestra el fondo, el color del texto ni el borde (una sola opción)', () => {
    for (const key of [...CLAVES_AVANZADO_EN_ESTILO, 'border_width']) {
      expect(campoCubiertoPorEstilo({ key, type: 'color', group: 'style' }, 'products_grid')).toBe(true);
    }
    expect(campoCubiertoPorEstilo({ key: 'radius', type: 'range', group: 'style' }, 'products_grid')).toBe(false);
    expect(campoCubiertoPorEstilo({ key: 'shadow', type: 'select', group: 'style' }, 'products_grid')).toBe(false);
  });
});

describe('ESTILO-06 color del texto', () => {
  it('lee Avanzado > anterior; al editar queda en contenido.text_color (donde la tienda lo lee) sin copias', () => {
    expect(leerColorTextoUnico(vacia)).toBeUndefined();
    expect(leerColorTextoUnico({ settings: { text_color: '#111111' }, contenido: {} })).toBe('#111111');
    expect(leerColorTextoUnico({ settings: { text_color: '#111111' }, contenido: { text_color: '#222222' } })).toBe('#222222');
    const r = cambioColorTextoUnico({ settings: { text_color: '#111111' }, contenido: { text_color: '#222222' } }, 'marca:primario');
    expect(r.settings.text_color).toBeUndefined();
    expect(r.contenido.text_color).toBe('var(--primary-color)');
    expect(leerColorTextoUnico(r)).toBe('marca:primario');
    expect(leerEstiloSeccion(r.settings).colores?.texto).toBeUndefined();
    const nuevo = cambioColorTextoUnico(vacia, 'marca:primario');
    expect(leerEstiloSeccion(nuevo.settings).colores?.texto).toBe('marca:primario');
  });
});

describe('ESTILO-07 borde', () => {
  it('grosor 0 = sin borde (como hoy) y un solo color', () => {
    expect(grosorBordeUnico(vacia)).toBe(0);
    const g = cambioGrosorBordeUnico(vacia, 2);
    expect(g.contenido).toEqual({ border_width: 2 });
    expect(cambioGrosorBordeUnico(g, 0).contenido).toEqual({});
    expect(leerColorBordeUnico({ settings: {}, contenido: { border_color: '#123456' } })).toBe('#123456');
    const c = cambioColorBordeUnico({ settings: {}, contenido: { border_width: 2, border_color: '#123456' } }, '#654321');
    expect(c.contenido).toEqual({ border_width: 2 });
    expect(leerEstiloSeccion(c.settings).colores?.borde).toBe('#654321');
  });
});

describe('ESTILO-05 tipografía', () => {
  it('la fuente del Cascarón se ve en Estilo y al editar pasa a Estilo', () => {
    const a = { settings: {}, contenido: { section_header: { title: 'T', title_font: 'Lora', description_font: 'site' } } };
    const e = estiloConFuentesCascaron(a);
    expect(e.tipografia).toEqual({ modo: 'propia', titulo: { fuente: 'Lora' } });
    expect(sinFuentesCascaron(a.contenido)).toEqual({ section_header: { title: 'T' } });
    expect(sinFuentesCascaron({ title: 'x' })).toEqual({ title: 'x' });
    expect(estiloConFuentesCascaron(vacia)).toEqual(leerEstiloSeccion({}));
  });
});

import { cambioColorEncabezado, leerColorEncabezado } from '../inspector/estiloUnico';

describe('colores del encabezado (ESTILO-06, antes en Cascarón)', () => {
  const base = { settings: {}, contenido: { title: 'Hola' } };
  it('sin valor no lee nada ni cambia el contenido', () => {
    expect(leerColorEncabezado(base, 'title_color')).toBeUndefined();
  });
  it('lee el valor guardado en section_header', () => {
    expect(leerColorEncabezado({ settings: {}, contenido: { section_header: { title_color: '#ff0000' } } }, 'title_color')).toBe('#ff0000');
  });
  it('escribe en section_header sin tocar settings', () => {
    const r = cambioColorEncabezado(base, 'description_color', '#00ff00');
    expect(r.contenido).toEqual({ title: 'Hola', section_header: { description_color: '#00ff00' } });
    expect(r.settings).toBe(base.settings);
  });
  it('quitar el título quita también el degradado y limpia section_header vacío', () => {
    const a = { settings: {}, contenido: { section_header: { title_color: '#111111', title_color_2: '#222222' } } };
    expect(cambioColorEncabezado(a, 'title_color', null).contenido).toEqual({});
  });
  it('el segundo color sin título fija ambos', () => {
    expect(cambioColorEncabezado(base, 'title_color_2', '#333333').contenido.section_header).toEqual({ title_color_2: '#333333', title_color: '#333333' });
  });
});

import { BORDE_TIENDA, DEGRADADO_TIENDA, textoUnico } from '../inspector/estiloUnico';
import { leerFondoUnico as leerFondoQA, cambioFondoUnico as cambioFondoQA, cambioColorTextoUnico as cambioTextoQA, leerColorBordeUnico as leerBordeQA } from '../inspector/estiloUnico';

describe('QA bloque 4 (ROJO e40363ba3): secciones reales', () => {
  it('349 s-1d59b2e0 (text_color #FAF7F2): el color se queda en contenido.text_color, sin pasar a Estilo', () => {
    const a = { settings: {}, contenido: { text_color: '#FAF7F2' } };
    expect(textoUnico(a)).toEqual({ valor: '#FAF7F2', alcance: 'envoltorio' });
    const r = cambioTextoQA(a, '#FAF7F2');
    expect(r.contenido).toEqual({ text_color: '#FAF7F2' });
    expect(r.settings).toEqual({});
  });
  it('338 4c044ae8: editar no fuerza el color sobre títulos y párrafos (sin colores.texto)', () => {
    const a = { settings: { text_color: '#101010' }, contenido: {} };
    const r = cambioTextoQA(a, '#202020');
    expect(r.contenido).toEqual({ text_color: '#202020' });
    expect(JSON.stringify(r.settings)).not.toContain('texto');
    expect(r.settings).not.toHaveProperty('text_color');
  });
  it('326 461068fe borrador {bg_type:gradient}: muestra #000000 → #ffffff, to-br (como la tienda)', () => {
    expect(leerFondoQA({ settings: {}, contenido: { bg_type: 'gradient' } })).toMatchObject({ modo: 'degradado', ...DEGRADADO_TIENDA });
  });
  it('Cascarón: ángulo ausente = 180° (to-b); con un solo color no hay degradado', () => {
    expect(leerFondoQA({ settings: {}, contenido: { section_background: { gradient_1: '#111111', gradient_2: '#222222' } } }).direccion).toBe('to-b');
    expect(leerFondoQA({ settings: {}, contenido: { section_background: { gradient_1: '#111111' } } }).modo).not.toBe('degradado');
  });
  it('fuente del Cascarón: no pasa a Estilo (mismo alcance que hoy)', () => {
    const a = { settings: {}, contenido: { section_header: { title_font: 'Lora' } } };
    const r = cambioFondoQA(a, { modo: 'tema' });
    expect((r.contenido.section_header as Record<string, unknown>).title_font).toBe('Lora');
    expect(JSON.stringify(r.settings)).not.toContain('Lora');
  });
  it('borde sin color: muestra el borde por defecto que pinta la tienda', () => {
    expect(leerBordeQA({ settings: {}, contenido: {} }) ?? BORDE_TIENDA).toBe('#e5e5e5');
  });
  it('org no v2: editar settings.bg_color lo deja en settings (conserva dark:bg-gray-900/40)', () => {
    const r = cambioFondoQA({ settings: { bg_color: '#f5f5f5' }, contenido: {} }, { modo: 'color', color: '#eeeeee' });
    expect(r).toEqual({ settings: { bg_color: '#eeeeee' }, contenido: {} });
  });
  it('fondo «Oscuro» (338 e88e5ba7, 333 s-a20dd89b, 340 s-3f00ee2a): el texto se ve blanco', () => {
    expect(textoUnico({ settings: { estilo: { fondo: 'oscuro' } }, contenido: {} })).toEqual({ valor: '#ffffff', alcance: 'oscuro' });
  });
});
