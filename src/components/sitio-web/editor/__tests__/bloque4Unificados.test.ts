import {
  cambioTextoEncabezado,
  campoCubiertoPorEstilo,
  carruselDesdeClavesAnteriores,
  carruselGlobalActivo,
  entradasAnterioresSeccion,
  valorTextoEncabezado,
  accionDesdeVerTodo,
} from '../inspector/espaciadoSeccion';
import { fuenteEncabezadoAlCampo, fuenteEncabezadoAlGuardar } from '@/lib/website/v2/fuenteTema';

describe('título y subtítulo: un solo campo (CASCAR-02)', () => {
  it('muestra lo que pinta la tienda y al editar borra la copia del encabezado', () => {
    const c = { title: 'Viejo', subtitle: 'Sub', section_header: { title: 'Encabezado', align: 'center' } };
    expect(valorTextoEncabezado(c, 'title')).toBe('Encabezado');
    expect(valorTextoEncabezado(c, 'subtitle')).toBe('Sub');
    expect(cambioTextoEncabezado(c, 'title', 'Nuevo')).toEqual({ title: 'Nuevo', subtitle: 'Sub', section_header: { align: 'center' } });
    expect(cambioTextoEncabezado({ section_header: { description: 'd' } }, 'subtitle', 'x')).toEqual({ subtitle: 'x' });
    expect(cambioTextoEncabezado({ title: 'a' }, 'title', 'b')).toEqual({ title: 'b' });
  });
});

describe('«Ver todo» anterior pasa a la acción (CASCAR-05/06)', () => {
  it('lee view_all_* como la tienda', () => {
    expect(accionDesdeVerTodo({ view_all: true, view_all_url: '/x', view_all_style: 'ghost' })).toEqual({
      text: 'Ver todo', href: '/x', kind: 'link', position: 'below', style: 'ghost', icon: true,
    });
    expect(accionDesdeVerTodo({ view_all: false, view_all_url: '/x' })).toBeUndefined();
  });
});

describe('fuente del encabezado con FontField (ENCABE-93/97)', () => {
  const fuentes = { titulos: 'Playfair Display', cuerpo: 'Inter' };
  it('lee site / familia y guarda lo que la tienda acepta', () => {
    expect(fuenteEncabezadoAlCampo('site')).toBeNull();
    expect(fuenteEncabezadoAlCampo('Lora')).toBe('Lora');
    expect(fuenteEncabezadoAlGuardar(null, fuentes, 'titulos')).toBeUndefined();
    expect(fuenteEncabezadoAlGuardar('tema:titulos', fuentes, 'titulos')).toBeUndefined();
    expect(fuenteEncabezadoAlGuardar('tema:cuerpo', fuentes, 'titulos')).toBe('Inter');
    expect(fuenteEncabezadoAlGuardar('Lora', fuentes, 'titulos')).toBe('Lora');
  });
});

describe('carrusel anterior de productos (PRODUC-37..40, FEATUR-14..17)', () => {
  it('oculta el grupo carousel y lo lista en anteriores', () => {
    expect(campoCubiertoPorEstilo({ key: 'loop', type: 'boolean', group: 'carousel' }, 'products_grid')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'loop', type: 'boolean', group: 'carousel' }, 'faq')).toBe(false);
    const e = entradasAnterioresSeccion({ slides_per_view: 3 }, 'featured_products');
    expect(e.find((x) => x.id === 'seccion_carrusel')?.motivo).toBe('mandaCarrusel');
  });
  it('arranca el carrusel propio con lo guardado y los valores de siempre', () => {
    expect(carruselDesdeClavesAnteriores({ slides_per_view: { desktop: 5, mobile: 1 }, autoplay: true }, 'products_grid')).toEqual({
      visiblesEscritorio: 5, visiblesTableta: 3, visiblesMovil: 1, autoplay: true, segundos: 5, loop: false, pausaHover: true,
      flechasEscritorio: true, flechasMovil: true, indicador: 'puntos', arrastre: true,
    });
    // Org 348: featured_products con 4 por vista, autoplay y sin loop → 4 en todos los tamaños, sin bucle.
    expect(carruselDesdeClavesAnteriores({ slides_per_view: 4, autoplay: true }, 'featured_products')).toMatchObject({
      visiblesEscritorio: 4, visiblesTableta: 4, visiblesMovil: 4, autoplay: true, loop: false,
    });
    expect(carruselDesdeClavesAnteriores({ autoplay: 'true', loop: 'false', show_dots: 'false', show_arrows: false, interval_ms: 3000, pause_on_hover: 'false' }, 'products_grid')).toMatchObject({
      autoplay: true, loop: false, indicador: 'ninguno', flechasEscritorio: false, flechasMovil: false, segundos: 3, pausaHover: false,
    });
    expect(carruselDesdeClavesAnteriores({}, 'faq')).toEqual({});
    expect(carruselGlobalActivo({ usar_global: true })).toBe(false);
    expect(carruselGlobalActivo({ autoplay: true })).toBe(true);
  });
});

describe('MAP-09', () => {
  it('show_marker no tiene efecto: fuera del panel y en anteriores', () => {
    expect(campoCubiertoPorEstilo({ key: 'show_marker', type: 'boolean' }, 'map')).toBe(true);
    expect(entradasAnterioresSeccion({ show_marker: false }, 'map')[0]).toMatchObject({ id: 'seccion_show_marker', motivo: 'sinEfecto' });
  });
});
