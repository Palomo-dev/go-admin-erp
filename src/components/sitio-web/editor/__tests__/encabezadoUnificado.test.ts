import { cambioAlBajar, cambioSobrePortada, modoAlBajar } from '../inspector/encabezadoLogica';

describe('Encabezado unificado (ENCABE-76/80)', () => {
  it('«Al bajar» lee header_sticky y header_scroll viejos', () => {
    expect(modoAlBajar({})).toBe('fijo');
    expect(modoAlBajar({ header_sticky: false, header_scroll: 'encoger' })).toBe('normal');
    expect(modoAlBajar({ header_scroll: 'ocultar_al_bajar' })).toBe('ocultar_al_bajar');
    expect(cambioAlBajar('normal')).toEqual({ header_sticky: false, header_scroll: null });
    expect(cambioAlBajar('encoger')).toEqual({ header_sticky: true, header_scroll: 'encoger' });
  });
  it('un solo interruptor «Sobre la portada»', () => {
    expect(cambioSobrePortada({ header_style: 'default' }, true, 'default')).toEqual({ header_style: 'transparent', header_transparent_over_hero: true });
    expect(cambioSobrePortada({ header_style: 'transparent' }, false, 'centered')).toEqual({ header_transparent_over_hero: null, header_style: 'centered' });
    expect(cambioSobrePortada({ header_style: 'split', header_transparent_over_hero: true }, false, 'default')).toEqual({ header_transparent_over_hero: null });
  });
});
