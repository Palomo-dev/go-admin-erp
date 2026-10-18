/**
 * El banner de la portada vive en la sección. El carrusel solo pinta diapositivas.
 */
import { contenidoPortadaVisible, slidesDePortada } from '../portadaSlider';

const ESCRITORIO = 'https://cdn.example/banner-escritorio.jpg';
const MOVIL = 'https://cdn.example/banner-movil.jpg';

describe('banner de la portada en carrusel', () => {
  it('usa la imagen de la sección cuando no hay diapositivas', () => {
    expect(
      slidesDePortada({
        title: 'Inicio',
        subtitle: 'Sub',
        cta_text: 'Ver',
        cta_url: '/tienda',
        buttons: [{ label: 'Ver' }],
        image_url: ESCRITORIO,
        image_url_mobile: MOVIL,
        slides: null,
      }),
    ).toEqual([
      {
        title: 'Inicio',
        subtitle: 'Sub',
        cta_text: 'Ver',
        cta_url: '/tienda',
        buttons: [{ label: 'Ver' }],
        image_url: ESCRITORIO,
        image_url_mobile: MOVIL,
      },
    ]);
  });

  it('muestra la imagen móvil a ancho de escritorio si la de escritorio está vacía', () => {
    expect(slidesDePortada({ title: 'Inicio', image_url: '   ', image_url_mobile: MOVIL })).toEqual([
      { title: 'Inicio', image_url: MOVIL },
    ]);
  });

  it('no sustituye una diapositiva que ya trae imagen', () => {
    expect(
      slidesDePortada({
        image_url: ESCRITORIO,
        slides: [{ title: 'Uno', image_url: 'https://cdn.example/slide.jpg' }, { title: 'Dos' }],
      }),
    ).toEqual([{ title: 'Uno', image_url: 'https://cdn.example/slide.jpg' }, { title: 'Dos' }]);
  });

  it('completa la imagen de una diapositiva que solo tiene la móvil', () => {
    expect(slidesDePortada({ slides: [{ id: 's1', title: 'Movil', image_url: '', image_url_mobile: MOVIL }] })).toEqual([
      { id: 's1', title: 'Movil', image_url: MOVIL },
    ]);
  });

  it('conserva diapositivas de texto y el vacío', () => {
    expect(slidesDePortada({ title: 'Sin medio', slides: [{ title: 'Texto' }] })).toEqual([{ title: 'Texto' }]);
    expect(slidesDePortada({ title: 'Vacío', slides: null })).toEqual([]);
    expect(slidesDePortada(null)).toEqual([]);
  });

  it('no muta el contenido y solo afecta a la portada carrusel', () => {
    const original = { title: 'Inicio', image_url: ESCRITORIO, slides: [] as unknown[] };
    slidesDePortada(original);
    expect(original.slides).toEqual([]);

    expect(contenidoPortadaVisible('hero', 'fullscreen', { image_url: ESCRITORIO, slides: [] })).toEqual({
      image_url: ESCRITORIO,
      slides: [],
    });
    expect(contenidoPortadaVisible('hero', 'slider', { title: 'Inicio', image_url: ESCRITORIO })).toEqual({
      title: 'Inicio',
      image_url: ESCRITORIO,
      slides: [{ title: 'Inicio', image_url: ESCRITORIO }],
    });
    expect(contenidoPortadaVisible('cta', 'slider', { image_url: ESCRITORIO })).toEqual({ image_url: ESCRITORIO });
  });
});
