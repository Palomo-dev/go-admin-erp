import { bannersDesdeAnteriores, carruselDesdeClavesAnteriores, campoCubiertoPorEstilo } from '../inspector/espaciadoSeccion';

describe('bloque 5 · portada y banners', () => {
  it('BANNER-01: lee la distribución anterior', () => {
    expect(bannersDesdeAnteriores({ layout: 'stack', columns: { desktop: 4, tablet: 2 }, columns_mobile: 2, gap: 12 })).toEqual({
      layout: 'full_stack',
      estilo: { columns_desktop: 4, columns_tablet: 2, columns_mobile: 2, gap: 12 },
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
