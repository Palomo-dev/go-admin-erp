/**
 * El inspector oculta los interruptores que el componente del sitio no lee en esa variante, y su
 * estado con la clave ausente es el que el sitio muestra hoy.
 *
 * La lista es LITERAL a propósito (no se importa de `interruptoresSitio.ts`): salió de cruzar cada
 * booleano del catálogo con el código de cada componente de goadmin-websites
 * (`components/sections/**`, vía `SECTION_MAP`). El sitio no se puede importar desde aquí (otro
 * repo), así que si un componente empieza a leer un interruptor hay que actualizar a la vez
 * `interruptoresSitio.ts` y esta lista. Los que el sitio sí implementa los prueba
 * `scripts/verify-interruptores.mjs` de goadmin-websites pintando los componentes reales.
 */
jest.mock('@/lib/supabase/config', () => ({ supabase: { from: jest.fn() }, getProjectRef: jest.fn(() => 'test') }));
jest.mock('@/lib/utils/offlineCache', () => ({
  isAppOnline: jest.fn(() => true),
  getCachedResponse: jest.fn(() => null),
  setCachedResponse: jest.fn(),
  queueAction: jest.fn(),
  setOnline: jest.fn(),
}));

import { getSectionDefinition, type ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { campoVisible } from '@/components/sitio-web/editor/inspector/CampoSeccion';

/** Definiciones de `clave` que el inspector muestra en la variante (contenido vacío). */
function visibles(tipo: string, clave: string, variante: string, contenido: Record<string, unknown> = {}): ContentFieldDef[] {
  const def = getSectionDefinition(tipo);
  if (!def) throw new Error(`no existe la sección ${tipo}`);
  return def.contentFields.filter((f) => f.key === clave && campoVisible(f, contenido, variante));
}

/** Estado del switch con la clave ausente, como lo pinta CampoSeccion. */
function estadoInicial(tipo: string, clave: string, variante: string, contenido: Record<string, unknown> = {}): boolean {
  const [campo] = visibles(tipo, clave, variante, contenido);
  if (!campo) throw new Error(`${tipo}/${variante} no muestra ${clave}`);
  return campo.defaultValue === true;
}

/** [sección, interruptor, variantes donde el sitio NO lo lee y el inspector debe ocultarlo]. */
const OCULTOS: [string, string, string[]][] = [
  ['categories_grid', 'full_width', ['default', 'grid', 'horizontal', 'icons']],
  ['featured_products', 'hide_if_no_reviews', ['hero_product']],
  ['featured_products', 'show_rating', ['hero_product']],
  ['gallery', 'autoplay', ['masonry', 'grid']],
  ['gallery', 'enable_swipe', ['masonry', 'grid']],
  ['gallery', 'loop', ['masonry', 'grid']],
  ['gallery', 'pause_on_hover', ['masonry', 'grid']],
  ['gallery', 'show_arrows', ['masonry', 'grid']],
  ['gallery', 'show_dots', ['masonry', 'grid']],
  ['map', 'show_marker', ['default', 'embedded', 'full_width', 'with_directions']],
  ['parking_pass_plans', 'show_compare_price', ['cards']],
  ['parking_pricing', 'show_compare_price', ['cards']],
  ['parking_pricing', 'show_description', ['cards']],
  ['partners', 'autoplay', ['logos', 'cards']],
  ['partners', 'enable_swipe', ['logos', 'cards']],
  ['partners', 'loop', ['logos', 'cards']],
  ['partners', 'pause_on_hover', ['logos', 'cards']],
  ['partners', 'show_arrows', ['logos', 'cards']],
  ['partners', 'show_dots', ['logos', 'cards']],
  ['pricing_table', 'show_compare_price', ['three_columns']],
  ['room_types', 'show_compare_price', ['cards', 'detailed']],
  ['routes', 'show_compare_price', ['cards']],
  ['routes', 'show_description', ['cards']],
  ['services_list', 'show_compare_price', ['cards', 'grid', 'icons_row', 'list']],
  ['specialties', 'hide_if_no_reviews', ['featured']],
  ['specialties', 'show_rating', ['featured']],
];

/** [sección, repetidor, campos del ítem que ninguna variante lee: se quitan del repetidor]. */
const ITEMS_QUITADOS: [string, string, string[]][] = [
  ['cta', 'buttons', ['full_width', 'full_width_mobile', 'icon_only', 'open_new_tab']],
  ['membership_plans', 'plans', ['highlighted']],
  ['offers', 'card_buttons', ['full_width_mobile', 'open_new_tab']],
  ['product_actions', 'buttons', ['full_width', 'full_width_mobile', 'icon_only', 'open_new_tab']],
  ['specialties', 'card_buttons', ['full_width', 'full_width_mobile', 'icon_only', 'open_new_tab']],
];

// Controles que dependen de otro campo: se evalúan con su condición cumplida, para que solo
// cuente la variante.
const CONDICION: Record<string, Record<string, unknown>> = {
  pause_on_hover: { autoplay: true },
  hide_if_no_reviews: { show_rating: true },
};

describe('Interruptores que el sitio no implementa: ocultos en el inspector', () => {
  it.each(OCULTOS)('%s · %s no aparece en %j', (tipo, clave, variantes) => {
    for (const v of variantes) expect(visibles(tipo, clave, v, CONDICION[clave])).toHaveLength(0);
  });

  it.each(ITEMS_QUITADOS)('%s · %s[] ya no ofrece %j', (tipo, repetidor, campos) => {
    const rep = getSectionDefinition(tipo)!.contentFields.find((f) => f.key === repetidor)!;
    const claves = (rep.itemFields ?? []).map((f) => f.key);
    for (const c of campos) expect(claves).not.toContain(c);
  });
});

describe('No se oculta de más: lo que el sitio sí lee sigue visible', () => {
  it.each([
    ['hero', 'show_arrows', 'slider'],
    ['hero', 'show_dots', 'slider'],
    ['hero', 'autoplay', 'slider'],
    ['products_grid', 'show_filters', 'grid'],
    ['products_grid', 'show_filters', 'default'],
    ['featured_products', 'show_rating', 'grid'],
    ['featured_products', 'show_compare_price', 'carousel'],
    ['featured_products', 'show_description', 'hero_product'],
    ['services_list', 'show_description', 'cards'],
    ['room_types', 'show_description', 'detailed'],
    ['testimonials', 'show_rating', 'carousel'],
    ['menu_full', 'show_search', 'qr'],
    ['contact_form', 'show_phone', 'split'],
    ['contact_form', 'show_map', 'with_map'],
  ])('%s · %s sigue en %s', (tipo, clave, variante) => {
    expect(visibles(tipo, clave, variante, CONDICION[clave])).toHaveLength(1);
  });

  it('el repetidor de botones del hero conserva lo que HeroButtons lee', () => {
    const rep = getSectionDefinition('hero')!.contentFields.find((f) => f.key === 'buttons')!;
    const claves = (rep.itemFields ?? []).map((f) => f.key);
    expect(claves).toEqual(expect.arrayContaining(['label', 'url', 'open_new_tab', 'full_width_mobile']));
  });
});

describe('Con la clave ausente, el switch muestra lo que el sitio hace hoy', () => {
  it('flechas del slider de la portada: apagado (HeroSlider usa `?? false`)', () => {
    expect(estadoInicial('hero', 'show_arrows', 'slider')).toBe(false);
    expect(estadoInicial('hero', 'show_dots', 'slider')).toBe(true);
  });

  it('contacto «Con mapa»: teléfono, email y dirección apagados; «Dividido» encendidos', () => {
    for (const clave of ['show_phone', 'show_email', 'show_address']) {
      expect(estadoInicial('contact_form', clave, 'with_map')).toBe(false);
      expect(estadoInicial('contact_form', clave, 'split')).toBe(true);
    }
  });

  it('descripción en «hero_product» encendida; en grid y carrusel sigue apagada (tarjeta de producto)', () => {
    expect(estadoInicial('featured_products', 'show_description', 'hero_product')).toBe(true);
    expect(estadoInicial('featured_products', 'show_description', 'grid')).toBe(false);
    expect(estadoInicial('featured_products', 'show_description', 'carousel')).toBe(false);
  });

  it('cada variante ve una sola definición de cada interruptor desdoblado', () => {
    for (const v of ['split', 'with_map']) expect(visibles('contact_form', 'show_phone', v)).toHaveLength(1);
    for (const v of ['grid', 'carousel', 'hero_product']) expect(visibles('featured_products', 'show_description', v)).toHaveLength(1);
  });
});

/**
 * Implementados en el sitio el 2026-10-07 (goadmin-websites, `scripts/verify-interruptores.mjs`):
 * vuelven a mostrarse. [sección, interruptor, variante, contenido con la condición cumplida].
 */
const CARRUSEL = ['autoplay', 'enable_swipe', 'loop', 'pause_on_hover', 'show_arrows', 'show_dots'];
type FilaImplementado = [string, string, string, Record<string, unknown>?];
const IMPLEMENTADOS: FilaImplementado[] = [
  ...CARRUSEL.flatMap((c): [string, string, string][] => [['gallery', c, 'carousel'], ['gallery', c, 'fullscreen'], ['partners', c, 'carousel']]),
  ...CARRUSEL.map((c): [string, string, string, Record<string, unknown>] => ['brands', c, 'logos', { layout: 'carousel', autoplay: true }]),
  ...['masonry', 'grid', 'carousel', 'fullscreen'].map((v): [string, string, string] => ['gallery', 'lightbox', v]),
  ...['autoplay', 'loop', 'enable_swipe'].flatMap((c): [string, string, string][] => [['products_grid', c, 'carousel'], ['featured_products', c, 'carousel']]),
  ['products_grid', 'show_filters', 'carousel'],
  ['products_grid', 'show_filters', 'list'],
  ...['default', 'grid', 'carousel', 'list'].map((v): [string, string, string] => ['products_grid', 'show_search', v]),
  ...['grid', 'carousel', 'hero_product'].flatMap((v): [string, string, string][] => [['featured_products', 'show_filters', v], ['featured_products', 'show_search', v]]),
  ['featured_products', 'show_compare_price', 'hero_product'],
  ['offers', 'show_filters', 'grid'],
  ['offers', 'show_search', 'grid'],
  ['menu_preview', 'show_compare_price', 'tabs'],
  ['membership_plans', 'show_compare_price', 'pricing_table'],
  ['specialties', 'show_compare_price', 'featured'],
  ['specialties', 'show_description', 'featured'],
  ['room_types', 'show_description', 'cards'],
  ['services_list', 'show_description', 'icons_row'],
  ['parking_pass_plans', 'show_description', 'cards'],
];

describe('Implementados en el sitio: el inspector los vuelve a mostrar', () => {
  // Parámetros por resto: con más parámetros que columnas, jest toma el último por `done`.
  it.each(IMPLEMENTADOS)('%s · %s se ve en %s', (...[tipo, clave, variante, contenido]: FilaImplementado) => {
    expect(visibles(tipo, clave, variante, contenido ?? CONDICION[clave])).toHaveLength(1);
  });

  it('los repetidores recuperan los campos que el sitio ya lee', () => {
    const campos = (tipo: string, rep: string) =>
      (getSectionDefinition(tipo)!.contentFields.find((f) => f.key === rep)!.itemFields ?? []).map((f) => f.key);
    expect(campos('hero', 'buttons')).toEqual(expect.arrayContaining(['full_width', 'icon_only']));
    for (const tipo of ['products_grid', 'featured_products']) {
      expect(campos(tipo, 'card_buttons')).toEqual(expect.arrayContaining(['full_width_mobile', 'open_new_tab']));
    }
  });

  it('marcas: los controles del carrusel solo con la distribución «Carrusel» (BrandsLogos solo los lee ahí)', () => {
    for (const c of ['autoplay', 'loop', 'show_arrows', 'show_dots', 'enable_swipe']) {
      expect(visibles('brands', c, 'logos', { layout: 'grid' })).toHaveLength(0);
      expect(visibles('brands', c, 'logos', {})).toHaveLength(0);
      expect(visibles('brands', c, 'logos', { layout: 'carousel' })).toHaveLength(1);
    }
  });
});

/** [sección, interruptor, variante, estado con la clave ausente = lo que el sitio hace hoy]. */
type FilaDefault = [string, string, string, boolean, Record<string, unknown>?];
const DEFAULTS_IMPLEMENTADOS: FilaDefault[] = [
  ['gallery', 'autoplay', 'carousel', false],
  ['gallery', 'autoplay', 'fullscreen', false],
  ['gallery', 'loop', 'carousel', true],
  ['gallery', 'show_arrows', 'carousel', true],
  ['gallery', 'show_arrows', 'fullscreen', false],
  ['gallery', 'show_dots', 'fullscreen', true],
  ['gallery', 'enable_swipe', 'carousel', false],
  ['gallery', 'pause_on_hover', 'carousel', true, { autoplay: true }],
  ['gallery', 'lightbox', 'masonry', false],
  ['gallery', 'lightbox', 'carousel', false],
  ['partners', 'autoplay', 'carousel', true],
  ['partners', 'loop', 'carousel', true],
  ['partners', 'pause_on_hover', 'carousel', false, { autoplay: true }],
  ['partners', 'show_arrows', 'carousel', false],
  ['partners', 'show_dots', 'carousel', false],
  ['partners', 'enable_swipe', 'carousel', false],
  ['brands', 'autoplay', 'logos', false, { layout: 'carousel' }],
  ['brands', 'loop', 'logos', false, { layout: 'carousel' }],
  ['brands', 'show_arrows', 'logos', true, { layout: 'carousel' }],
  ['brands', 'show_dots', 'logos', false, { layout: 'carousel' }],
  ['brands', 'enable_swipe', 'logos', true, { layout: 'carousel' }],
  ['brands', 'pause_on_hover', 'logos', true, { layout: 'carousel', autoplay: true }],
  ['products_grid', 'autoplay', 'carousel', false],
  ['products_grid', 'loop', 'carousel', false],
  ['products_grid', 'enable_swipe', 'carousel', true],
  ['featured_products', 'loop', 'carousel', false],
  ['products_grid', 'show_filters', 'default', true],
  ['products_grid', 'show_filters', 'grid', true],
  ['products_grid', 'show_filters', 'carousel', false],
  ['products_grid', 'show_filters', 'list', false],
  ['products_grid', 'show_search', 'grid', false],
  ['featured_products', 'show_filters', 'grid', false],
  ['featured_products', 'show_search', 'hero_product', false],
  ['offers', 'show_filters', 'grid', true],
  ['offers', 'show_search', 'grid', false],
  ['featured_products', 'show_compare_price', 'hero_product', false],
  ['featured_products', 'show_compare_price', 'grid', true],
  ['menu_preview', 'show_compare_price', 'tabs', false],
  ['membership_plans', 'show_compare_price', 'pricing_table', false],
  ['specialties', 'show_compare_price', 'featured', false],
  ['specialties', 'show_description', 'featured', false],
  ['room_types', 'show_description', 'cards', false],
  ['room_types', 'show_description', 'detailed', true],
  ['services_list', 'show_description', 'icons_row', false],
  ['services_list', 'show_description', 'cards', true],
  ['parking_pass_plans', 'show_description', 'cards', false],
];

describe('Implementados: con la clave ausente el switch dice lo que el sitio hace hoy', () => {
  it.each(DEFAULTS_IMPLEMENTADOS)('%s · %s · %s → %s', (...[tipo, clave, variante, esperado, contenido]: FilaDefault) => {
    expect(estadoInicial(tipo, clave, variante, contenido ?? {})).toBe(esperado);
  });

  it('botones: «Ancho completo» de la portada y «Ancho completo en móvil» de la tarjeta nacen apagados', () => {
    const item = (tipo: string, rep: string, campo: string) =>
      getSectionDefinition(tipo)!.contentFields.find((f) => f.key === rep)!.itemFields!.find((f) => f.key === campo)!;
    expect(item('hero', 'buttons', 'full_width').defaultValue).toBe(false);
    expect(item('hero', 'buttons', 'full_width_mobile').defaultValue).toBe(true);
    expect(item('products_grid', 'card_buttons', 'full_width_mobile').defaultValue).toBe(false);
    expect(item('products_grid', 'card_buttons', 'full_width').defaultValue).toBe(true);
  });
});
