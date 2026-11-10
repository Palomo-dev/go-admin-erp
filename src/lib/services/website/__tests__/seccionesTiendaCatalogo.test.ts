/**
 * Catálogo del editor para las plantillas de tienda (PLANO §3, diseños B2–B5).
 *
 * El fixture es la copia del manifiesto real del sitio desplegado: toda variante y toda clave que
 * el editor ofrece aquí la pinta producción. Las variantes de siempre no cambian.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: {}, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { SECTION_CATALOG, type ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { verifySectionContract } from '../sectionContract';
import { siteManifestFixture } from './siteManifest.fixture';
import {
  CAMPO_PESTANAS_PRODUCTOS,
  SECCIONES_TIENDA_CATALOGO,
  VARIANTES_SOBRE_BASE,
  conVariantesTienda,
} from '../seccionesTiendaCatalogo';
import { GRUPOS_SECCIONES, claveEntrada, esEntradaNueva, getSectionCatalogForBranch } from '../sectionsByBranchType';
import { FUENTE_DE_SECCION } from '../fuentesDatosSecciones';
import { CLAVES_SECCION_TIENDA, TIPOS_NUEVOS_TIENDA, VARIANTES_TIENDA } from '@/lib/website/contrato/seccionesTienda';
import { campoVisible } from '@/components/sitio-web/editor/inspector/CampoSeccion';
import { campoLayoutCategorias } from '@/components/sitio-web/editor/inspector/layoutCategorias';
import { cambioTextoEncabezado, valorTextoEncabezado } from '@/components/sitio-web/editor/inspector/espaciadoSeccion';

const def = (tipo: string) => SECTION_CATALOG.find((s) => s.type === tipo)!;
const manifiesto = (tipo: string) => siteManifestFixture.sections.find((s) => s.type === tipo);
/** Campos que el inspector muestra en esa variante con ese contenido. */
const visibles = (tipo: string, variante: string, contenido: Record<string, unknown> = {}) =>
  def(tipo).contentFields.filter((f) => campoVisible(f, contenido, variante));
/** Lo mismo que cuenta `sectionContract`: sin avisos ni el cascarón común (encabezado y fondo). */
const esDelComponente = (f: ContentFieldDef) =>
  !['notice', 'section_header', 'section_background', 'newsletter'].includes(f.type) &&
  ((f.group ?? 'content') === 'content' || f.group === 'data' || !!f.section);
/**
 * Claves que el componente del sitio declara además de las del contrato (CONTENT_KEYS de
 * RasgosConFoto: título y subtítulo comunes). Están en el manifiesto desplegado.
 */
const EXTRA_SITIO: Readonly<Record<string, readonly string[]>> = {
  'features_grid.photo_columns': ['title', 'subtitle'],
  // Decisiones del dueño 2026-11-10 (goadmin-websites 956fd16, lib/website/opcionesEditorTienda.ts).
  'transformation.slider': ['before_label', 'after_label'],
  'image_text.color_block': ['blocks'],
};
const PARES = Object.entries(VARIANTES_TIENDA).flatMap(([tipo, vs]) => vs.map((v) => [tipo, v] as const));

describe('cada variante de tienda que ofrece el editor la pinta el sitio desplegado', () => {
  const resultado = verifySectionContract(SECTION_CATALOG, siteManifestFixture);

  it.each(PARES)('%s · %s está en el catálogo y en el manifiesto', (tipo, variante) => {
    expect(def(tipo).variants.map((v) => v.id)).toContain(variante);
    expect(manifiesto(tipo)?.variants).toContain(variante);
  });

  it('ningún error ni aviso de contrato en los tipos que tocan las plantillas de tienda', () => {
    const tipos = new Set(Object.keys(VARIANTES_TIENDA));
    for (const t of ['categories_grid', 'category_header', 'product_gallery', 'product_actions', 'testimonials']) tipos.add(t);
    expect([...resultado.errors, ...resultado.warnings].filter((i) => tipos.has(i.type))).toEqual([]);
  });

  it('los tipos nuevos están en el catálogo con sus variantes, y nada más', () => {
    for (const tipo of TIPOS_NUEVOS_TIENDA) {
      expect(def(tipo).variants.map((v) => v.id)).toEqual([...VARIANTES_TIENDA[tipo]]);
    }
    expect(SECCIONES_TIENDA_CATALOGO.map((s) => s.type).sort()).toEqual([...TIPOS_NUEVOS_TIENDA].sort());
  });
});

describe('campos de cada variante nueva: las claves exactas del contrato', () => {
  it.each(PARES)('%s · %s ofrece todas sus claves y ninguna de otra variante', (tipo, variante) => {
    const claveContrato = `${tipo}.${variante}`;
    const sobre = VARIANTES_SOBRE_BASE[claveContrato];
    const esperadas = new Set([...(CLAVES_SECCION_TIENDA[claveContrato] ?? []), ...(sobre?.claves ?? []), ...(EXTRA_SITIO[claveContrato] ?? [])]);
    for (const k of EXTRA_SITIO[claveContrato] ?? []) expect(manifiesto(tipo)?.contentKeys).toContain(k);
    // Variantes armadas sobre otra: sus claves editables son las de la base que el sitio lee.
    const propias = visibles(tipo, variante).filter(esDelComponente).filter((f) => f.type !== 'notice').map((f) => f.key);
    for (const k of propias) expect({ clave: k, declarada: esperadas.has(k) }).toEqual({ clave: k, declarada: true });
    // Todas las claves del contrato se pueden editar (en cualquier pestaña).
    const todas = new Set(def(tipo).contentFields.filter((f) => campoVisible(f, { source: 'manual', show_summary: true, title_highlight: 'luz' }, variante)).map((f) => f.key));
    for (const k of CLAVES_SECCION_TIENDA[claveContrato] ?? []) expect({ clave: k, editable: todas.has(k) }).toEqual({ clave: k, editable: true });
  });

  it('las claves heredadas de una base son claves que el sitio declara para ese tipo', () => {
    for (const [clave, { claves }] of Object.entries(VARIANTES_SOBRE_BASE)) {
      const tipo = clave.split('.')[0];
      for (const k of claves) expect({ clave, k, enSitio: manifiesto(tipo)?.contentKeys.includes(k) }).toEqual({ clave, k, enSitio: true });
    }
  });

  it('una variante nueva no muestra los campos de siempre de su tipo', () => {
    const buscador = visibles('hero', 'search').map((f) => f.key);
    expect(buscador).not.toContain('video_url');
    expect(buscador).not.toContain('slides');
    expect(buscador).not.toContain('show_booking_widget');
    expect(visibles('product_specs', 'panel').map((f) => f.key)).not.toContain('show_empty');
    expect(visibles('category_filters', 'sidebar_facets').map((f) => f.key)).not.toContain('show_view_toggle');
  });

  it('«Dividida con productos» hereda lo de «Dividido» que lee el sitio y suma los productos', () => {
    const claves = visibles('hero', 'split_products').map((f) => f.key);
    expect(claves).toEqual(expect.arrayContaining(['title', 'subtitle', 'image_url', 'image_url_mobile', 'buttons', 'product_ids']));
    expect(claves).not.toContain('video_url');
    const productos = def('hero').contentFields.find((f) => f.key === 'product_ids');
    expect(productos).toMatchObject({ type: 'entity', entity: 'product', multiple: true });
  });
});

describe('las variantes de siempre no cambian', () => {
  it('un tipo sin nada de tienda vuelve igual', () => {
    const team = { type: 'team', label: 'Equipo', icon: 'Users', description: '', variants: [{ id: 'grid', label: 'Grid' }], contentFields: [] };
    expect(conVariantesTienda(team)).toBe(team);
  });

  it.each([
    ['hero', 'fullscreen', ['search_placeholder', 'brand_text', 'floating_cards', 'product_ids']],
    ['gallery', 'grid', ['handle', 'phrase', 'stagger']],
    ['image_text', 'image_left', ['number', 'bg_color', 'image_small_url', 'thumbnails']],
    ['transformation', 'before_after', ['items', 'handle_color']],
    ['products_grid', 'grid', ['editorial_cards', 'count_header']],
    ['product_specs', 'default', ['rows']],
    ['category_filters', 'default', ['show_subcategories', 'clear_text']],
  ])('%s · %s no ve las claves de las variantes nuevas', (tipo, variante, ajenas) => {
    const claves = visibles(tipo, variante).map((f) => f.key);
    for (const k of ajenas) expect(claves).not.toContain(k);
  });

  it('los campos de siempre siguen en sus variantes de siempre', () => {
    expect(visibles('hero', 'video').map((f) => f.key)).toEqual(expect.arrayContaining(['title', 'subtitle', 'video_url', 'cta_text']));
    expect(visibles('transformation', 'before_after').map((f) => f.key)).toEqual(['title', 'subtitle', 'before_image_url', 'after_image_url', 'description', ...visibles('transformation', 'before_after').slice(5).map((f) => f.key)]);
    expect(visibles('gallery', 'masonry').map((f) => f.key)).toEqual(expect.arrayContaining(['title', 'subtitle', 'images', 'lightbox']));
  });
});

describe('categorías (B2)', () => {
  const opcionesEstilo = () => def('categories_grid').contentFields.find((f) => f.key === 'category_style')?.options?.map((o) => o.value);

  it('«Título arriba» está entre los estilos', () => {
    expect(opcionesEstilo()).toEqual(['overlay', 'circle', 'card_bottom', 'pill', 'bento', 'minimal_icon', 'title_top', 'text_list']);
  });

  it('«Lista de texto» (decisión 1): sin layout de escritorio ni opciones de tarjeta; con alineación', () => {
    const campo = def('categories_grid').contentFields.find((f) => f.key === 'desktop_layout')!;
    expect(campoLayoutCategorias(campo, { category_style: 'text_list' }, 'categories_grid')).toBeNull();
    const claves = visibles('categories_grid', 'default', { category_style: 'text_list' }).map((f) => f.key);
    expect(claves).toContain('align');
    expect(claves).toContain('show_count');
    for (const k of ['category_text_position', 'category_card_color', 'category_cta_icon']) expect(claves).not.toContain(k);
  });

  it('las tres opciones nuevas van tras el estilo, con «como hoy» por defecto', () => {
    const claves = def('categories_grid').contentFields.map((f) => f.key);
    const i = claves.indexOf('category_style');
    expect(claves.slice(i + 1, i + 4)).toEqual(['category_text_position', 'category_card_color', 'category_cta_icon']);
    for (const [k, d] of [['category_text_position', 'bottom'], ['category_card_color', 'none'], ['category_cta_icon', 'none']]) {
      expect(def('categories_grid').contentFields.find((f) => f.key === k)?.defaultValue).toBe(d);
    }
  });

  it.each([
    [undefined, ['category_text_position', 'category_card_color', 'category_cta_icon']],
    ['overlay', ['category_text_position', 'category_card_color', 'category_cta_icon']],
    ['card_bottom', ['category_text_position', 'category_card_color', 'category_cta_icon']],
    ['title_top', ['category_card_color', 'category_cta_icon']],
    ['circle', []],
    ['pill', []],
    ['bento', []],
  ])('con estilo %s se ven %j', (estilo, esperadas) => {
    const contenido = estilo ? { category_style: estilo } : {};
    const nuevas = visibles('categories_grid', 'default', contenido)
      .map((f) => f.key)
      .filter((k) => ['category_text_position', 'category_card_color', 'category_cta_icon'].includes(k));
    expect(nuevas).toEqual(esperadas);
  });

  it('«Título arriba» no lee «Layout en escritorio»', () => {
    const campo = def('categories_grid').contentFields.find((f) => f.key === 'desktop_layout')!;
    expect(campoLayoutCategorias(campo, { category_style: 'title_top' }, 'categories_grid')).toBeNull();
    expect(campoLayoutCategorias(campo, {}, 'categories_grid')).toBe(campo);
  });
});

describe('decisiones 2 y 3 del dueño (B4)', () => {
  it('Antes/Después: etiquetas editables, vacías = «Antes» y «Después»', () => {
    const campos = visibles('transformation', 'slider');
    expect(campos.find((f) => f.key === 'before_label')).toMatchObject({ type: 'text', placeholder: 'Antes' });
    expect(campos.find((f) => f.key === 'after_label')).toMatchObject({ type: 'text', placeholder: 'Después' });
    expect(visibles('transformation', 'before_after').map((f) => f.key)).not.toContain('before_label');
  });

  it('Bloques a color: UNA sección con repetidor de hasta 5 bloques con las claves del bloque', () => {
    const bloques = visibles('image_text', 'color_block').find((f) => f.key === 'blocks')!;
    expect(bloques).toMatchObject({ type: 'repeater', maxItems: 5 });
    expect(bloques.itemFields?.map((f) => f.key).sort()).toEqual([...CLAVES_SECCION_TIENDA['image_text.color_block']].sort());
    expect(visibles('image_text', 'image_left').map((f) => f.key)).not.toContain('blocks');
  });
});

describe('ficha y página de categoría (B5)', () => {
  it('galería: mosaico y las claves que lee la galería del sitio', () => {
    const campos = def('product_gallery').contentFields;
    expect(campos.find((f) => f.key === 'gallery_layout')?.options?.map((o) => o.value)).toContain('mosaic');
    expect(campos.map((f) => f.key)).toEqual(expect.arrayContaining(['thumbnails_position', 'gallery_arrows', 'page_layout.columns', 'page_layout.gallery_width', 'page_layout.sticky_column', 'page_layout.show_breadcrumb']));
  });

  it('page_layout se guarda como objeto y se lee de vuelta', () => {
    let c: Record<string, unknown> = { gallery_layout: 'mosaic' };
    c = cambioTextoEncabezado(c, 'page_layout.columns', '1');
    c = cambioTextoEncabezado(c, 'page_layout.gallery_width', 60);
    expect(c).toEqual({ gallery_layout: 'mosaic', page_layout: { columns: '1', gallery_width: 60 } });
    expect(valorTextoEncabezado(c, 'page_layout.columns')).toBe('1');
    c = cambioTextoEncabezado(c, 'page_layout.columns', undefined);
    c = cambioTextoEncabezado(c, 'page_layout.gallery_width', '');
    expect(c).toEqual({ gallery_layout: 'mosaic' });
  });

  it('acciones: precio en el botón y pista de variante, apagados por defecto', () => {
    const campos = def('product_actions').contentFields;
    expect(campos.find((f) => f.key === 'show_price_in_button')).toMatchObject({ type: 'boolean', defaultValue: false });
    expect(campos.find((f) => f.key === 'button_hint')?.options?.map((o) => o.value)).toEqual(['none', 'auto']);
  });

  it('encabezado partido y filtros de la barra de hoy', () => {
    expect(def('category_header').contentFields.find((f) => f.key === 'layout')?.options?.map((o) => o.value)).toEqual(['stack', 'split_text']);
    const filtros = visibles('category_filters', 'default').map((f) => f.key);
    expect(filtros).toEqual(expect.arrayContaining(['subcategory_style', 'search']));
  });

  it('filtros laterales: solo subcategorías y orden (decisión 4)', () => {
    const claves = visibles('category_filters', 'sidebar_facets').filter(esDelComponente).map((f) => f.key);
    expect(claves.sort()).toEqual(['clear_text', 'show_sort', 'show_subcategories']);
  });
});

describe('pestañas de la rejilla de productos (`tabs_style`, W2)', () => {
  it('se ofrece en la rejilla de siempre, con «Píldoras» como hoy', () => {
    const campo = def('products_grid').contentFields.find((f) => f.key === 'tabs_style')!;
    expect(campo).toMatchObject({ defaultValue: 'chips', group: 'layout' });
    expect(campo.options?.map((o) => o.value)).toEqual(['chips', 'underline']);
    expect(campo.showIf?.variantIn).toEqual(['default', 'grid']);
    const claves = def('products_grid').contentFields.map((f) => f.key);
    expect(claves.indexOf('tabs_style')).toBe(claves.indexOf('chip_mobile') + 1);
  });

  it('no aparece con la barra nueva (ahí manda «Estilo del chip»)', () => {
    expect(campoVisible(CAMPO_PESTANAS_PRODUCTOS, {}, 'grid')).toBe(true);
    expect(campoVisible(CAMPO_PESTANAS_PRODUCTOS, { chip_style: 'underline' }, 'grid')).toBe(false);
    expect(campoVisible(CAMPO_PESTANAS_PRODUCTOS, { filter_position: 'side' }, 'default')).toBe(false);
    expect(campoVisible(CAMPO_PESTANAS_PRODUCTOS, {}, 'carousel')).toBe(false);
  });
});

describe('«Añadir sección»: grupo «Tienda» (B3)', () => {
  const catalogo = getSectionCatalogForBranch(null);
  const tienda = catalogo.grupos.find((g) => g.id === 'tienda')!;

  it('las diez tarjetas, en el orden del diseño, marcadas como nuevas', () => {
    expect(tienda.nuevo).toBe(true);
    expect(tienda.secciones.map(claveEntrada)).toEqual(GRUPOS_SECCIONES.find((g) => g.id === 'tienda')!.tipos);
    expect(tienda.secciones.map(claveEntrada)).toEqual([
      'transformation:slider', 'shop_the_look', 'complete_the_look', 'product_index', 'product_anatomy',
      'image_text:color_block', 'link_cloud', 'service_cards', 'welcome_popup', 'gallery:instagram_cta',
    ]);
    expect(tienda.secciones.every(esEntradaNueva)).toBe(true);
  });

  it('las tarjetas de variante añaden ESA variante y no se repiten junto a su tipo', () => {
    const slider = tienda.secciones.find((s) => claveEntrada(s) === 'transformation:slider')!;
    expect(slider.variants[0].id).toBe('slider');
    const todas = catalogo.grupos.flatMap((g) => g.secciones.map(claveEntrada));
    expect(todas.filter((k) => k === 'transformation:slider')).toHaveLength(1);
    expect(todas).toContain('transformation');
  });

  it('las portadas nuevas salen en «Presentar», tras la portada', () => {
    const presentar = catalogo.grupos.find((g) => g.id === 'presentar')!.secciones.map(claveEntrada);
    const i = presentar.indexOf('hero');
    expect(presentar.slice(i + 1, i + 6)).toEqual(['hero:carousel_editorial', 'hero:search', 'hero:brand_giant', 'hero:floating', 'hero:split_products']);
  });

  it('la ficha recomienda sus bloques nuevos', () => {
    const ficha = getSectionCatalogForBranch(null, { pageType: 'product_detail' }).recomendadas.map(claveEntrada);
    expect(ficha).toEqual(expect.arrayContaining(['product_anchor_nav', 'product_pager', 'complete_the_look']));
  });

  it('las de siempre no llevan «Nuevo»', () => {
    const presentar = catalogo.grupos.find((g) => g.id === 'presentar')!;
    expect(presentar.secciones.filter((s) => !s.varianteDestacada || s.varianteDestacada === 'carousel_editorial').some(esEntradaNueva)).toBe(false);
  });

  it('las que leen productos o categorías avisan «Faltan datos»', () => {
    expect(FUENTE_DE_SECCION).toMatchObject({ shop_the_look: 'productos', product_index: 'productos', product_anatomy: 'productos', complete_the_look: 'productos', link_cloud: 'categorias' });
  });
});
