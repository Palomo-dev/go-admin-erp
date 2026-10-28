import { bannersDesdeAnteriores, carruselDesdeClavesAnteriores, campoCubiertoPorEstilo } from '../inspector/espaciadoSeccion';

describe('bloque 5 · portada y banners', () => {
  it('BANNER-01: lee la distribución anterior', () => {
    expect(bannersDesdeAnteriores({ layout: 'stack', columns: { desktop: 4, tablet: 2 }, columns_mobile: 2, gap: 12 })).toEqual({
      layout: 'full_stack',
      estilo: { columns_desktop: 4, columns_tablet: 2, columns_mobile: 2 },
    });
    expect(bannersDesdeAnteriores({})).toEqual({ layout: 'grid', estilo: {} });
    expect(bannersDesdeAnteriores({ layout: 'carousel', columns: 3 }).estilo.columns_desktop).toBe(3);
  });
  it('BANNER-01: oculta columnas/filas/distribución viejas solo en promo_banners', () => {
    expect(campoCubiertoPorEstilo({ key: 'rows', type: 'number' }, 'promo_banners')).toBe(true);
    expect(campoCubiertoPorEstilo({ key: 'aspect_ratio', type: 'select' }, 'promo_banners')).toBe(false);
    expect(campoCubiertoPorEstilo({ key: 'rows', type: 'number' }, 'products_grid')).toBe(false);
  });
  it('HERO: mapea el carrusel anterior', () => {
    const r = carruselDesdeClavesAnteriores({ show_arrows: true, arrow_style: 'square', arrow_position: 'outside', arrow_size: 48, dot_style: 'bars', interval_ms: 7000 }, 'hero');
    expect(r).toMatchObject({ estiloFlechas: 'cuadrado', posicionFlechas: 'lados_fuera', tamanoFlecha: 'lg', indicador: 'barra', segundos: 7 });
  });
});

describe('QA de2d3ba8e', () => {
  it('P1-P3: portada exacta (puntos dentro y en blanco, posiciones y tamaños exactos)', () => {
    const r = carruselDesdeClavesAnteriores({ arrow_position: 'top-right', arrow_size: 42, interval_ms: 3500, arrow_style: 'minimal' }, 'hero');
    expect(r).toMatchObject({ controlesPortada: true, posicionIndicador: 'abajo_dentro', colorActivo: '#FFFFFF', posicionFlechas: 'arriba_derecha', tamanoFlechaPx: 42, segundos: 3.5, estiloFlechas: 'minimo' });
    expect(carruselDesdeClavesAnteriores({ arrow_position: 'bottom' }, 'hero').posicionFlechas).toBe('abajo');
    // Org 342, sección cb7d5a08: sin autoplay, sin bucle, sin puntos.
    expect(carruselDesdeClavesAnteriores({ autoplay: false, loop: false, show_dots: false }, 'hero')).toMatchObject({ autoplay: false, loop: false, indicador: 'ninguno' });
  });
  it('P4: banners con columns numérico dejan la tableta en min(d,2) y no copian gap (orgs 338, 339, 341, 342)', () => {
    expect(bannersDesdeAnteriores({ columns: 4, gap: 16 })).toEqual({ layout: 'grid', estilo: { columns_desktop: 4, columns_tablet: 2 } });
    expect(bannersDesdeAnteriores({ columns: 1 }).estilo).toEqual({ columns_desktop: 1, columns_tablet: 1 });
  });
  it('"0" cuenta como false en el carrusel de productos, como en la tienda', () => {
    expect(carruselDesdeClavesAnteriores({ loop: '0', autoplay: '1', interval_ms: 3500 }, 'products_grid')).toMatchObject({ loop: false, autoplay: true, segundos: 3.5 });
  });
});
