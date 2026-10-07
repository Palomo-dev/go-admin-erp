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
  ['brands', 'autoplay', ['logos']],
  ['brands', 'enable_swipe', ['logos']],
  ['brands', 'loop', ['logos']],
  ['brands', 'pause_on_hover', ['logos']],
  ['brands', 'show_arrows', ['logos']],
  ['brands', 'show_dots', ['logos']],
  ['categories_grid', 'full_width', ['default', 'grid', 'horizontal', 'icons']],
  ['featured_products', 'autoplay', ['carousel']],
  ['featured_products', 'enable_swipe', ['carousel']],
  ['featured_products', 'hide_if_no_reviews', ['hero_product']],
  ['featured_products', 'loop', ['carousel']],
  ['featured_products', 'show_compare_price', ['hero_product']],
  ['featured_products', 'show_filters', ['grid', 'carousel', 'hero_product']],
  ['featured_products', 'show_rating', ['hero_product']],
  ['featured_products', 'show_search', ['grid', 'carousel', 'hero_product']],
  ['gallery', 'autoplay', ['masonry', 'grid', 'carousel', 'fullscreen']],
  ['gallery', 'enable_swipe', ['masonry', 'grid', 'carousel', 'fullscreen']],
  ['gallery', 'lightbox', ['masonry', 'grid', 'carousel', 'fullscreen']],
  ['gallery', 'loop', ['masonry', 'grid', 'carousel', 'fullscreen']],
  ['gallery', 'pause_on_hover', ['masonry', 'grid', 'carousel', 'fullscreen']],
  ['gallery', 'show_arrows', ['masonry', 'grid', 'carousel', 'fullscreen']],
  ['gallery', 'show_dots', ['masonry', 'grid', 'carousel', 'fullscreen']],
  ['map', 'show_marker', ['default', 'embedded', 'full_width', 'with_directions']],
  ['membership_plans', 'show_compare_price', ['pricing_table']],
  ['menu_preview', 'show_compare_price', ['tabs']],
  ['offers', 'show_filters', ['grid']],
  ['offers', 'show_search', ['grid']],
  ['parking_pass_plans', 'show_compare_price', ['cards']],
  ['parking_pass_plans', 'show_description', ['cards']],
  ['parking_pricing', 'show_compare_price', ['cards']],
  ['parking_pricing', 'show_description', ['cards']],
  ['partners', 'autoplay', ['logos', 'cards', 'carousel']],
  ['partners', 'enable_swipe', ['logos', 'cards', 'carousel']],
  ['partners', 'loop', ['logos', 'cards', 'carousel']],
  ['partners', 'pause_on_hover', ['logos', 'cards', 'carousel']],
  ['partners', 'show_arrows', ['logos', 'cards', 'carousel']],
  ['partners', 'show_dots', ['logos', 'cards', 'carousel']],
  ['pricing_table', 'show_compare_price', ['three_columns']],
  ['products_grid', 'autoplay', ['carousel']],
  ['products_grid', 'enable_swipe', ['carousel']],
  ['products_grid', 'loop', ['carousel']],
  ['products_grid', 'show_filters', ['carousel', 'list']],
  ['products_grid', 'show_search', ['default', 'grid', 'carousel', 'list']],
  ['room_types', 'show_compare_price', ['cards', 'detailed']],
  ['room_types', 'show_description', ['cards']],
  ['routes', 'show_compare_price', ['cards']],
  ['routes', 'show_description', ['cards']],
  ['services_list', 'show_compare_price', ['cards', 'grid', 'icons_row', 'list']],
  ['services_list', 'show_description', ['icons_row']],
  ['specialties', 'hide_if_no_reviews', ['featured']],
  ['specialties', 'show_compare_price', ['featured']],
  ['specialties', 'show_description', ['featured']],
  ['specialties', 'show_rating', ['featured']],
];

/** [sección, repetidor, campos del ítem que ninguna variante lee: se quitan del repetidor]. */
const ITEMS_QUITADOS: [string, string, string[]][] = [
  ['cta', 'buttons', ['full_width', 'full_width_mobile', 'icon_only', 'open_new_tab']],
  ['featured_products', 'card_buttons', ['full_width_mobile', 'open_new_tab']],
  ['hero', 'buttons', ['full_width', 'icon_only']],
  ['membership_plans', 'plans', ['highlighted']],
  ['offers', 'card_buttons', ['full_width_mobile', 'open_new_tab']],
  ['product_actions', 'buttons', ['full_width', 'full_width_mobile', 'icon_only', 'open_new_tab']],
  ['products_grid', 'card_buttons', ['full_width_mobile', 'open_new_tab']],
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
