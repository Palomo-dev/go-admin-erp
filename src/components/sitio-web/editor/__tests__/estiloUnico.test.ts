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
  it('lee Avanzado > anterior > Estilo y al editar deja solo Estilo', () => {
    expect(leerColorTextoUnico(vacia)).toBeUndefined();
    expect(leerColorTextoUnico({ settings: { text_color: '#111111' }, contenido: {} })).toBe('#111111');
    expect(leerColorTextoUnico({ settings: { text_color: '#111111' }, contenido: { text_color: '#222222' } })).toBe('#222222');
    const r = cambioColorTextoUnico({ settings: { text_color: '#111111' }, contenido: { text_color: '#222222' } }, 'marca:primario');
    expect(r.settings.text_color).toBeUndefined();
    expect(r.contenido.text_color).toBeUndefined();
    expect(leerEstiloSeccion(r.settings).colores?.texto).toBe('marca:primario');
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
