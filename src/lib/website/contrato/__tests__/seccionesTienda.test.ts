/**
 * Contrato de las secciones de las plantillas de tienda (PLANO §3): defaults con el contenido
 * vacío, ajustes ausentes = la sección de hoy, valores inválidos ignorados, y nada se pinta sin
 * datos reales.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CLAVES_AJUSTE_TIENDA,
  CLAVES_SECCION_TIENDA,
  DEFAULT_AJUSTES_CATEGORIAS,
  DEFAULT_AJUSTES_TESTIMONIOS,
  DEFAULT_ANATOMIA_PRODUCTO,
  DEFAULT_ANTES_DESPUES,
  DEFAULT_BLOQUE_COLOR,
  DEFAULT_COMPLETA_EL_LOOK,
  DEFAULT_COMPRA_EL_LOOK,
  DEFAULT_FICHA_TECNICA,
  DEFAULT_FILTROS_LATERALES,
  DEFAULT_IMAGEN_TEXTO_EDITORIAL,
  DEFAULT_INDICE_PRODUCTOS,
  DEFAULT_NUBE_ENLACES,
  DEFAULT_PAGINADOR_FICHA,
  DEFAULT_PESTANAS_ANCLA,
  DEFAULT_PORTADA_BUSCADOR,
  DEFAULT_PORTADA_FLOTANTE,
  DEFAULT_PORTADA_MARCA,
  DEFAULT_REJILLA_EDITORIAL,
  DEFAULT_VENTANA_BIENVENIDA,
  ETIQUETAS_VARIANTE_TIENDA,
  MAX_PRODUCTOS_PORTADA,
  MAX_PUNTOS_LOOK,
  MAX_PUNTOS_MARCA,
  TIPOS_NUEVOS_TIENDA,
  VARIANTES_TIENDA,
  anatomiaVisible,
  claveAlmacenBienvenida,
  compraElLookVisible,
  destinoBuscador,
  disposicionEncabezadoCategoria,
  esBotonEnlace,
  esTipoNuevoTienda,
  esVarianteTienda,
  estiloPestanas,
  galeriaEscalonada,
  normalizarAjustesAccionesFicha,
  normalizarAjustesCategorias,
  normalizarAjustesFiltrosCategoria,
  normalizarAjustesTestimonios,
  normalizarAnatomiaProducto,
  normalizarAntesDespues,
  normalizarBloqueColor,
  normalizarCodigoCupon,
  normalizarColumnasFoto,
  normalizarCompletaElLook,
  normalizarCompraElLook,
  normalizarCuponBanner,
  normalizarDisenoFicha,
  normalizarFichaTecnica,
  normalizarFiltrosLaterales,
  normalizarGaleriaCollage,
  normalizarGaleriaInstagram,
  normalizarImagenTextoEditorial,
  normalizarIndiceProductos,
  normalizarMiniaturas,
  normalizarNubeEnlaces,
  normalizarPaginadorFicha,
  normalizarPestanasAncla,
  normalizarPortadaBuscador,
  normalizarPortadaFlotante,
  normalizarPortadaMarca,
  normalizarProductosPortada,
  normalizarRejillaEditorial,
  normalizarTarjetasServicio,
  normalizarTextoConIconos,
  normalizarTituloResaltado,
  normalizarVentanaBienvenida,
  nubeEnlacesVisible,
  partirTituloResaltado,
  textoAyudaVariante,
  textoBotonConPrecio,
  textoDimensiones,
  textoGarantia,
  textoPeso,
  textoResumenResenas,
  ventanaBienvenidaVisible,
} from '../seccionesTienda';

describe('variantes y claves', () => {
  test('cada variante tiene nombre visible y claves de contenido', () => {
    for (const [tipo, variantes] of Object.entries(VARIANTES_TIENDA)) {
      for (const v of variantes) {
        expect(ETIQUETAS_VARIANTE_TIENDA[`${tipo}.${v}`]).toBeTruthy();
        expect(CLAVES_SECCION_TIENDA[`${tipo}.${v}`]?.length).toBeGreaterThan(0);
        expect(esVarianteTienda(tipo, v)).toBe(true);
      }
    }
    expect(Object.keys(ETIQUETAS_VARIANTE_TIENDA).sort()).toEqual(Object.keys(CLAVES_SECCION_TIENDA).sort());
  });

  test('las variantes que ya existen no se reclaman como nuevas', () => {
    expect(esVarianteTienda('hero', 'fullscreen')).toBe(false);
    expect(esVarianteTienda('gallery', 'carousel')).toBe(false);
    expect(esVarianteTienda('transformation', 'before_after')).toBe(false);
    expect(esVarianteTienda('no_existe', 'default')).toBe(false);
    expect(esVarianteTienda('hero', null)).toBe(false);
  });

  test('los tipos nuevos están en VARIANTES_TIENDA', () => {
    for (const t of TIPOS_NUEVOS_TIENDA) expect(VARIANTES_TIENDA).toHaveProperty(t);
    expect(esTipoNuevoTienda('link_cloud')).toBe(true);
    expect(esTipoNuevoTienda('hero')).toBe(false);
  });

  test('ajustes: sin claves repetidas por sección', () => {
    for (const claves of Object.values(CLAVES_AJUSTE_TIENDA)) expect(new Set(claves).size).toBe(claves.length);
  });

  test('código puro: sin imports (se copia tal cual a goadmin-websites)', () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'seccionesTienda.ts'), 'utf8');
    expect(fuente).not.toMatch(/^\s*import\s/m);
    expect(fuente).not.toMatch(/require\(/);
  });
});

describe('sin contenido: los defaults', () => {
  test.each([
    ['buscador', normalizarPortadaBuscador, DEFAULT_PORTADA_BUSCADOR],
    ['marca', normalizarPortadaMarca, DEFAULT_PORTADA_MARCA],
    ['flotante', normalizarPortadaFlotante, DEFAULT_PORTADA_FLOTANTE],
    ['antes y después', normalizarAntesDespues, DEFAULT_ANTES_DESPUES],
    ['compra el look', normalizarCompraElLook, DEFAULT_COMPRA_EL_LOOK],
    ['completa el look', normalizarCompletaElLook, DEFAULT_COMPLETA_EL_LOOK],
    ['índice', normalizarIndiceProductos, DEFAULT_INDICE_PRODUCTOS],
    ['anatomía', normalizarAnatomiaProducto, DEFAULT_ANATOMIA_PRODUCTO],
    ['bienvenida', normalizarVentanaBienvenida, DEFAULT_VENTANA_BIENVENIDA],
    ['bloque de color', normalizarBloqueColor, DEFAULT_BLOQUE_COLOR],
    ['editorial', normalizarImagenTextoEditorial, DEFAULT_IMAGEN_TEXTO_EDITORIAL],
    ['nube', normalizarNubeEnlaces, DEFAULT_NUBE_ENLACES],
    ['rejilla editorial', normalizarRejillaEditorial, DEFAULT_REJILLA_EDITORIAL],
    ['filtros laterales', normalizarFiltrosLaterales, DEFAULT_FILTROS_LATERALES],
    ['pestañas ancla', normalizarPestanasAncla, DEFAULT_PESTANAS_ANCLA],
    ['ficha técnica', normalizarFichaTecnica, DEFAULT_FICHA_TECNICA],
    ['paginador', normalizarPaginadorFicha, DEFAULT_PAGINADOR_FICHA],
  ] as const)('%s', (_n, normalizar, porDefecto) => {
    expect((normalizar as (c: unknown) => unknown)(null)).toEqual(porDefecto);
    expect((normalizar as (c: unknown) => unknown)({})).toEqual(porDefecto);
  });

  test('textos por defecto: rótulos, nunca hechos', () => {
    expect(DEFAULT_PORTADA_BUSCADOR.searchPlaceholder).toBe('¿Qué buscas?');
    expect(DEFAULT_COMPLETA_EL_LOOK.title).toBe('Se lleva con');
    expect(DEFAULT_INDICE_PRODUCTOS.ctaText).toBe('Ver todas las piezas');
    expect(DEFAULT_FILTROS_LATERALES.clearText).toBe('Limpiar filtros');
    expect(DEFAULT_PAGINADOR_FICHA).toEqual({ prevText: 'Pieza anterior', nextText: 'Pieza siguiente' });
    expect(DEFAULT_VENTANA_BIENVENIDA).toMatchObject({ enabled: false, couponCode: '' });
    expect(DEFAULT_PORTADA_MARCA.brandText).toBe('');
  });
});

describe('ajustes de secciones existentes: ausentes = la sección de hoy', () => {
  test('defaults de hoy', () => {
    expect(normalizarTituloResaltado({ title: 'Hola' })).toEqual({ highlight: '', style: 'pill' });
    expect(normalizarMiniaturas({ image_url: '/x.png' })).toEqual([]);
    expect(galeriaEscalonada({})).toBe(false);
    expect(normalizarAjustesTestimonios({})).toEqual(DEFAULT_AJUSTES_TESTIMONIOS);
    expect(DEFAULT_AJUSTES_TESTIMONIOS).toMatchObject({ showSummary: false, pager: 'none' });
    expect(estiloPestanas({})).toBe('chips');
    expect(normalizarAjustesCategorias({ category_style: 'card_bottom' })).toEqual(DEFAULT_AJUSTES_CATEGORIAS);
    expect(DEFAULT_AJUSTES_CATEGORIAS).toEqual({ textPosition: 'bottom', cardColor: 'none', ctaIcon: 'none' });
    expect(disposicionEncabezadoCategoria({})).toBe('stack');
    expect(normalizarAjustesFiltrosCategoria({})).toEqual({ subcategoryStyle: 'chips', search: false });
    expect(normalizarAjustesAccionesFicha({})).toEqual({ showPriceInButton: false, buttonHint: 'none' });
    expect(normalizarDisenoFicha({})).toBeNull();
    expect(normalizarDisenoFicha({ gallery_layout: 'carousel' })).toBeNull();
    expect(normalizarCuponBanner({ title: 'Promo' }, '2026-11-07')).toBeNull();
    expect(esBotonEnlace({ variant: 'solid' })).toBe(false);
    expect(esBotonEnlace(undefined)).toBe(false);
  });

  test('inválidos = default de hoy', () => {
    expect(normalizarTituloResaltado({ title_highlight: 5, title_highlight_style: 'neon' })).toEqual({ highlight: '', style: 'pill' });
    expect(galeriaEscalonada({ stagger: 'si' })).toBe(false);
    expect(normalizarAjustesTestimonios({ show_summary: 1, summary_source: 'google', pager: 'dots', image_url: 'ftp://x' })).toEqual(DEFAULT_AJUSTES_TESTIMONIOS);
    expect(estiloPestanas({ tabs_style: 'texto_subrayado' })).toBe('chips');
    expect(normalizarAjustesCategorias({ category_text_position: 'middle', category_card_color: '#ff0000', category_cta_icon: 'chevron' })).toEqual(DEFAULT_AJUSTES_CATEGORIAS);
    expect(disposicionEncabezadoCategoria({ layout: 'grid' })).toBe('stack');
    expect(normalizarAjustesFiltrosCategoria({ subcategory_style: 'pills', search: 'yes' })).toEqual({ subcategoryStyle: 'chips', search: false });
    expect(normalizarAjustesAccionesFicha({ show_price_in_button: 'x', button_hint: 'siempre' })).toEqual({ showPriceInButton: false, buttonHint: 'none' });
    expect(normalizarDisenoFicha({ page_layout: [] })).toBeNull();
    expect(normalizarDisenoFicha({ page_layout: { columns: '3', gallery_width: 90, sticky_column: 'no' } })).toEqual({
      columns: '2',
      stickyColumn: true,
      showBreadcrumb: true,
      galleryWidth: 50,
    });
  });

  test('con valor', () => {
    expect(normalizarTituloResaltado({ title_highlight: ' hogar ', title_highlight_style: 'underline' })).toEqual({ highlight: 'hogar', style: 'underline' });
    expect(normalizarMiniaturas({ thumbnails: ['/a.png', { image_url: 'https://cdn.ejemplo.co/b.png' }, 'javascript:x', '/c.png', '/d.png'] })).toEqual([
      '/a.png',
      'https://cdn.ejemplo.co/b.png',
      '/c.png',
    ]);
    expect(galeriaEscalonada({ stagger: true })).toBe(true);
    expect(estiloPestanas({ tabs_style: 'underline' })).toBe('underline');
    expect(normalizarAjustesCategorias({ category_text_position: 'top', category_card_color: 'per_item', category_cta_icon: 'arrow_circle' })).toEqual({
      textPosition: 'top',
      cardColor: 'per_item',
      ctaIcon: 'arrow_circle',
    });
    expect(normalizarAjustesFiltrosCategoria({ subcategory_style: 'tabs', search: true })).toEqual({ subcategoryStyle: 'tabs', search: true });
    expect(normalizarAjustesAccionesFicha({ show_price_in_button: true, button_hint: 'auto' })).toEqual({ showPriceInButton: true, buttonHint: 'auto' });
    expect(normalizarDisenoFicha({ page_layout: { sticky_column: false, show_breadcrumb: false, gallery_width: 60, columns: '1' } })).toEqual({
      columns: '1',
      stickyColumn: false,
      showBreadcrumb: false,
      galleryWidth: 60,
    });
    expect(esBotonEnlace({ variant: 'link' })).toBe(true);
  });
});

describe('ayudas puras', () => {
  test('título resaltado', () => {
    expect(partirTituloResaltado('Todo para tu Hogar nuevo', 'hogar')).toEqual({ antes: 'Todo para tu ', resaltado: 'Hogar', despues: ' nuevo' });
    expect(partirTituloResaltado('Sin palabra', '')).toBeNull();
    expect(partirTituloResaltado('Sin palabra', 'otra')).toBeNull();
  });

  test('destino del buscador', () => {
    expect(destinoBuscador(' sofá cama ', 'salas')).toBe('/search?q=sof%C3%A1%20cama');
    expect(destinoBuscador('', 'salas')).toBe('/categorias/salas');
    expect(destinoBuscador('  ', null)).toBeNull();
  });

  test('resumen de reseñas: nunca con 0 ni con promedio imposible', () => {
    expect(textoResumenResenas(4.86, 1280)).toBe(`4,9 de ${(1280).toLocaleString('es-CO')} reseñas`);
    expect(textoResumenResenas(5, 1)).toBe('5,0 de 1 reseña');
    expect(textoResumenResenas(4.5, 0)).toBeNull();
    expect(textoResumenResenas(null, 10)).toBeNull();
    expect(textoResumenResenas(7, 10)).toBeNull();
    expect(textoResumenResenas(4, 2.5)).toBeNull();
  });

  test('botón con precio y ayuda de variante', () => {
    expect(textoBotonConPrecio('Agregar', '$ 120.000')).toBe('Agregar · $ 120.000');
    expect(textoBotonConPrecio('Agregar', '')).toBe('Agregar');
    expect(textoBotonConPrecio('Agregar', null)).toBe('Agregar');
    expect(textoAyudaVariante('Talla')).toBe('Elige tu talla');
    expect(textoAyudaVariante('  Acabado  ')).toBe('Elige tu acabado');
    expect(textoAyudaVariante('')).toBe('Elige una opción');
  });

  test('medidas, peso y garantía', () => {
    expect(textoDimensiones(40, 30.5, '80')).toBe('40 × 30,5 × 80 cm');
    expect(textoDimensiones(40, null, 80)).toBeNull();
    expect(textoDimensiones(40, 0, 80)).toBeNull();
    expect(textoPeso(2.5)).toBe('2,5 kg');
    expect(textoPeso(null)).toBeNull();
    expect(textoGarantia(12)).toBe('12 meses');
    expect(textoGarantia(1)).toBe('1 mes');
    expect(textoGarantia(1.5)).toBeNull();
  });
});

describe('portadas', () => {
  test('buscador con valores e inválidos', () => {
    expect(normalizarPortadaBuscador({ inset: false, search_placeholder: '  ', rating_chip: 'none', image_url: 'javascript:x' })).toMatchObject({
      inset: false,
      searchPlaceholder: '¿Qué buscas?',
      ratingChip: 'none',
      imageUrl: '',
    });
    expect(normalizarPortadaBuscador({ rating_chip: 'siempre', show_category_select: 'no' })).toMatchObject({ ratingChip: 'auto', showCategorySelect: true });
  });

  test('marca gigante: puntos con producto real, máximo 4', () => {
    const puntos = Array.from({ length: 6 }, (_, i) => ({ x: 10 * i, y: 50, label: `P${i}`, product_id: i + 1 }));
    const r = normalizarPortadaMarca({ brand_layer: 'over_photo', hotspots: [{ x: 150, y: 10, product_id: 9 }, { x: 10, y: 10, product_id: 'abc' }, ...puntos] });
    expect(r.brandLayer).toBe('over_photo');
    expect(r.hotspots).toHaveLength(MAX_PUNTOS_MARCA);
    expect(r.hotspots[0]).toEqual({ x: 0, y: 50, label: 'P0', productId: 1 });
    expect(normalizarPortadaMarca({ brand_layer: 'detras' }).brandLayer).toBe('behind_figure');
  });

  test('flotante: tarjetas válidas sin repetir; video sin enlace no entra', () => {
    const r = normalizarPortadaFlotante({
      title: 'Brilla',
      title_highlight: 'Brilla',
      floating_cards: [{ kind: 'categories' }, { kind: 'categories' }, { kind: 'video' }, { kind: 'rating' }, { kind: 'mapa' }],
      buttons: [{ label: 'Ver', url: '/productos', variant: 'link' }, { label: 'Sin url' }, { label: 'X', url: 'javascript:alert(1)' }],
    });
    expect(r.floatingCards).toEqual([{ kind: 'categories', videoUrl: '' }, { kind: 'rating', videoUrl: '' }]);
    expect(r.buttons).toEqual([{ label: 'Ver', url: '/productos', variant: 'link' }]);
    expect(r.titleHighlight).toEqual({ highlight: 'Brilla', style: 'pill' });
  });

  test('dividida con productos: máximo 3 ids sin repetir', () => {
    expect(normalizarProductosPortada({ product_ids: [3, '3', 5, -1, 'x', 7, 9] })).toEqual({ productIds: [3, 5, 7] });
    expect(normalizarProductosPortada({}).productIds).toHaveLength(0);
    expect(MAX_PRODUCTOS_PORTADA).toBe(3);
  });
});

describe('secciones nuevas', () => {
  test('antes y después: solo pares completos', () => {
    const r = normalizarAntesDespues({ items: [{ name: 'Sala', before_url: '/a.png', after_url: '/b.png' }, { before_url: '/a.png' }], start_position: 120, handle_color: 'rojo' });
    expect(r.items).toEqual([{ name: 'Sala', beforeUrl: '/a.png', afterUrl: '/b.png' }]);
    expect(r.startPosition).toBe(50);
    expect(r.handleColor).toBe('acento');
  });

  test('compra el look: oculta sin foto o sin puntos; máximo 6', () => {
    expect(compraElLookVisible(normalizarCompraElLook({}))).toBe(false);
    expect(compraElLookVisible(normalizarCompraElLook({ image_url: '/look.jpg' }))).toBe(false);
    const puntos = Array.from({ length: 8 }, (_, i) => ({ x: 5, y: 5, product_id: i + 1 }));
    const l = normalizarCompraElLook({ image_url: '/look.jpg', hotspots: puntos });
    expect(l.hotspots).toHaveLength(MAX_PUNTOS_LOOK);
    expect(compraElLookVisible(l)).toBe(true);
  });

  test('completa el look', () => {
    expect(normalizarCompletaElLook({ source: 'manual', product_ids: [1, 2], limit: 20, title: '' })).toMatchObject({
      source: 'manual',
      productIds: [1, 2],
      limit: 4,
      title: 'Se lleva con',
    });
    expect(normalizarCompletaElLook({ source: 'ia' }).source).toBe('tag');
  });

  test('índice y anatomía', () => {
    expect(normalizarIndiceProductos({ cta_url: 'javascript:x', show_price: false })).toMatchObject({ ctaUrl: '/productos', showPrice: false });
    expect(anatomiaVisible(normalizarAnatomiaProducto({ product_id: 4 }))).toBe(false);
    const a = normalizarAnatomiaProducto({ product_id: '4', details: [{ title: 'Patas' }, {}, { text: 'Roble' }, { title: 'x' }, { title: 'y' }] });
    expect(a.details).toHaveLength(3);
    expect(anatomiaVisible(a)).toBe(true);
  });

  test('ventana de bienvenida: apagada o sin código no se abre', () => {
    expect(ventanaBienvenidaVisible(normalizarVentanaBienvenida({ enabled: true }))).toBe(false);
    expect(ventanaBienvenidaVisible(normalizarVentanaBienvenida({ coupon_code: 'HOLA10' }))).toBe(false);
    const v = normalizarVentanaBienvenida({ enabled: true, coupon_code: ' hola10 ', delay_s: 600, frequency: 'siempre' });
    expect(v).toMatchObject({ couponCode: 'HOLA10', delayS: 4, frequency: 'once' });
    expect(ventanaBienvenidaVisible(v)).toBe(true);
    expect(normalizarCodigoCupon('con espacio')).toBe('');
    expect(normalizarCodigoCupon('X'.repeat(41))).toBe('');
    expect(claveAlmacenBienvenida(120)).toBe('goadmin:bienvenida:120');
  });

  test('cupón del banner: fecha plana y vencimiento con el día de la organización', () => {
    expect(normalizarCuponBanner({ coupon_code: 'promo-5', valid_until: '2026-11-30' }, '2026-11-07')).toEqual({ code: 'PROMO-5', validUntil: '2026-11-30', vencido: false });
    expect(normalizarCuponBanner({ coupon_code: 'PROMO', valid_until: '2026-11-06' }, '2026-11-07')?.vencido).toBe(true);
    expect(normalizarCuponBanner({ coupon_code: 'PROMO', valid_until: '2026-11-07' }, '2026-11-07')?.vencido).toBe(false);
    expect(normalizarCuponBanner({ coupon_code: 'PROMO', valid_until: '2026-02-30' }, '2026-11-07')).toEqual({ code: 'PROMO', validUntil: '', vencido: false });
    expect(normalizarCuponBanner({ coupon_code: 'PROMO', valid_until: '2026-11-30T00:00:00Z' }, '2026-11-07')?.validUntil).toBe('');
    expect(normalizarCuponBanner({ coupon_code: '' }, '2026-11-07')).toBeNull();
    expect(normalizarCuponBanner(null, '2026-11-07')).toBeNull();
  });

  test('bloque de color y editorial', () => {
    expect(normalizarBloqueColor({ bg_color: 'red', text_color: '#FFF', cta_url: '/categorias/x' })).toMatchObject({ bgColor: '', textColor: '#FFF', ctaUrl: '/categorias/x' });
    expect(normalizarImagenTextoEditorial({ link_url: '//otro.co', image_url: '/a.jpg' })).toMatchObject({ linkUrl: '', imageUrl: '/a.jpg' });
  });

  test('nube de enlaces: oculta con menos de 3', () => {
    expect(nubeEnlacesVisible(2)).toBe(false);
    expect(nubeEnlacesVisible(3)).toBe(true);
    const n = normalizarNubeEnlaces({ source: 'manual', links: [{ label: 'A', url: '/a' }, { label: '', url: '/b' }, { label: 'C', url: 'javascript:x' }], max: 100 });
    expect(n).toMatchObject({ source: 'manual', links: [{ label: 'A', url: '/a' }], max: 12 });
  });

  test('tarjetas de servicio: máximo 2, sin tarjetas vacías', () => {
    const r = normalizarTarjetasServicio({ cards: [{}, { title: 'Envíos', links: [{ label: 'Ver', url: '/envios' }], benefits: ['Rápido', 'rápido'] }, { title: 'B' }, { title: 'C' }] });
    expect(r.cards).toEqual([
      { title: 'Envíos', links: [{ label: 'Ver', url: '/envios' }], benefits: ['Rápido'] },
      { title: 'B', links: [], benefits: [] },
    ]);
  });

  test('galerías', () => {
    expect(normalizarGaleriaCollage({ images: ['/1', '/2', '/3', '/4'] }).images).toHaveLength(3);
    expect(normalizarGaleriaInstagram({ handle: '@mi.tienda' }).handle).toBe('mi.tienda');
    expect(normalizarGaleriaInstagram({ handle: 'no válido!' }).handle).toBe('');
  });

  test('texto con íconos y columnas con foto', () => {
    expect(normalizarTextoConIconos({ segments: [{ text: 'Hecho' }, { icon: 'Leaf' }, { icon: '<script>' }, { text: '  ' }, 'x'] }).segments).toEqual([{ text: 'Hecho' }, { icon: 'Leaf' }]);
    expect(normalizarColumnasFoto({ items: [{}, { title: 'Madera' }] }).items).toEqual([{ imageUrl: '', title: 'Madera', text: '' }]);
  });

  test('rejilla editorial: ordenada, sin posiciones repetidas', () => {
    const r = normalizarRejillaEditorial({
      editorial_cards: [
        { after: 6, span: 3, title: 'B' },
        { after: 2, span: 9, image_url: '/a.jpg' },
        { after: 2, title: 'repetida' },
        { after: -1, title: 'mala' },
        { title: 'sin posición' },
      ],
      filters_style: 'select',
    });
    expect(r.editorialCards.map((t) => [t.after, t.span])).toEqual([[2, 2], [6, 3]]);
    expect(r.filtersStyle).toBe('text');
  });

  test('pestañas ancla: destinos válidos o las cuatro de siempre', () => {
    expect(normalizarPestanasAncla({ items: [{ label: 'X', target: 'checkout' }] }).items).toEqual(DEFAULT_PESTANAS_ANCLA.items);
    expect(normalizarPestanasAncla({ items: [{ label: 'Reseñas', target: 'product_reviews' }, { label: 'Otra', target: 'product_reviews' }], sticky: false })).toEqual({
      items: [{ label: 'Reseñas', target: 'product_reviews' }],
      sticky: false,
    });
  });

  test('ficha técnica: fuentes reales, sin repetir', () => {
    const r = normalizarFichaTecnica({ rows: [{ source: 'dimensions', icon: 'Ruler', label: '' }, { source: 'dimensions' }, { source: 'material' }], title: '' });
    expect(r).toEqual({ title: 'Sobre esta pieza', rows: [{ icon: 'Ruler', label: 'Medidas', source: 'dimensions' }] });
  });

  test('paginador', () => {
    expect(normalizarPaginadorFicha({ prev_text: 'Anterior', next_text: '' })).toEqual({ prevText: 'Anterior', nextText: 'Pieza siguiente' });
  });
});
