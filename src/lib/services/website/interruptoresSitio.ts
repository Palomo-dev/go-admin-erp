/**
 * Interruptores del inspector ↔ lo que de verdad lee cada componente del sitio (goadmin-websites).
 *
 * Fuente única de verdad de dos cosas que el catálogo (`websitePageBuilderService.ts`) no puede
 * expresar por sí solo, porque sus grupos de campos (CARD_FIELDS, CAROUSEL_FIELDS,
 * BUTTON_ITEM_FIELDS…) se comparten entre secciones y variantes:
 *
 * 1. `INTERRUPTORES_EN_SITIO`: para cada sección, los interruptores que el sitio NO lee en todas
 *    sus variantes, con la lista de variantes cuyo componente SÍ los lee (`[]` = ninguna). Un
 *    interruptor que no aparece aquí se lee en todas las variantes donde el catálogo lo ofrece.
 *    Las claves `repetidor[].campo` son campos dentro de un repetidor: el repetidor no conoce la
 *    variante, así que solo se pueden quitar cuando ninguna variante los lee (lista vacía).
 * 2. `DEFAULT_POR_VARIANTE`: el estado que pinta el switch cuando la clave no existe, cuando el
 *    sitio no hace lo mismo en todas las variantes. Debe ser lo que el sitio hace HOY con la clave
 *    ausente.
 *
 * Solo cambia lo que muestra el inspector (`showIf.variantIn`, `defaultValue`): nada se escribe
 * ni se borra del contenido guardado, y los ítems de un repetidor conservan sus claves al editarse.
 *
 * Cómo se obtuvo y cómo se mantiene: se cruzó cada booleano del catálogo con el código del
 * componente de cada variante en `SECTION_MAP` (goadmin-websites,
 * `components/sections/SectionRenderer.tsx`) y sus imports. Si un componente empieza a leer un
 * interruptor, añade la variante aquí; `scripts/verify-interruptores.mjs` del sitio prueba los que
 * se implementaron pintando los componentes reales. El test
 * `__tests__/interruptoresSeccion.test.ts` fija la lista.
 */
import type { ContentFieldDef, SectionTypeDefinition } from '@/lib/services/websitePageBuilderService';

/**
 * sección → interruptor → variantes cuyo componente lo lee.
 *
 * Lo que queda fuera está OCULTO, no resuelto: la lista de pendientes, con prioridad, componente
 * a tocar y el procedimiento para volver a mostrar cada uno, está en
 * `docs/sitio-web/PENDIENTE-interruptores-sin-implementar.md`.
 */
export const INTERRUPTORES_EN_SITIO: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  brands: {
    'autoplay': [],
    'enable_swipe': [],
    'loop': [],
    'pause_on_hover': [],
    'show_arrows': [],
    'show_dots': [],
  },
  categories_grid: {
    'full_width': [],
  },
  cta: {
    'buttons[].full_width': [],
    'buttons[].full_width_mobile': [],
    'buttons[].icon_only': [],
    'buttons[].open_new_tab': [],
  },
  // `card_buttons[].icon_only` y `.full_width` los lee la tarjeta (grid, carrusel) y no «hero_product»;
  // dentro de un repetidor no se puede ocultar por variante, así que siguen visibles en las tres.
  featured_products: {
    'autoplay': [],
    'card_buttons[].full_width': ['grid', 'carousel'],
    'card_buttons[].full_width_mobile': [],
    'card_buttons[].icon_only': ['grid', 'carousel'],
    'card_buttons[].open_new_tab': [],
    'enable_swipe': [],
    'hide_if_no_reviews': ['grid', 'carousel'],
    'loop': [],
    'show_compare_price': ['grid', 'carousel'],
    'show_filters': [],
    'show_rating': ['grid', 'carousel'],
    'show_search': [],
  },
  gallery: {
    'autoplay': [],
    'enable_swipe': [],
    'lightbox': [],
    'loop': [],
    'pause_on_hover': [],
    'show_arrows': [],
    'show_dots': [],
  },
  // HeroButtons no lee el `full_width` de cada botón (el slider lee el suyo, que es de la sección).
  hero: {
    'buttons[].full_width': [],
    'buttons[].icon_only': [],
  },
  map: {
    'show_marker': [],
  },
  membership_plans: {
    'plans[].highlighted': [],
    'show_compare_price': [],
  },
  menu_preview: {
    'show_compare_price': [],
  },
  offers: {
    'card_buttons[].full_width_mobile': [],
    'card_buttons[].open_new_tab': [],
    'show_filters': [],
    'show_search': [],
  },
  parking_pass_plans: {
    'show_compare_price': [],
    'show_description': [],
  },
  parking_pricing: {
    'show_compare_price': [],
    'show_description': [],
  },
  partners: {
    'autoplay': [],
    'enable_swipe': [],
    'loop': [],
    'pause_on_hover': [],
    'show_arrows': [],
    'show_dots': [],
  },
  pricing_table: {
    'show_compare_price': [],
  },
  product_actions: {
    'buttons[].full_width': [],
    'buttons[].full_width_mobile': [],
    'buttons[].icon_only': [],
    'buttons[].open_new_tab': [],
  },
  products_grid: {
    'autoplay': [],
    'card_buttons[].full_width_mobile': [],
    'card_buttons[].open_new_tab': [],
    'enable_swipe': [],
    'loop': [],
    'show_filters': ['default', 'grid'],
    'show_search': [],
  },
  room_types: {
    'show_compare_price': [],
    'show_description': ['detailed'],
  },
  routes: {
    'show_compare_price': [],
    'show_description': [],
  },
  services_list: {
    'show_compare_price': [],
    'show_description': ['cards', 'grid', 'list'],
  },
  specialties: {
    'card_buttons[].full_width': [],
    'card_buttons[].full_width_mobile': [],
    'card_buttons[].icon_only': [],
    'card_buttons[].open_new_tab': [],
    'hide_if_no_reviews': [],
    'show_compare_price': [],
    'show_description': [],
    'show_rating': [],
  },
};

/** sección → interruptor → variante → estado con la clave ausente (lo que el sitio hace hoy). */
export const DEFAULT_POR_VARIANTE: Readonly<Record<string, Readonly<Record<string, Readonly<Record<string, boolean>>>>>> = {
  // HeroSlider: `show_arrows ?? false`. CAROUSEL_FIELDS lo declara encendido.
  hero: { show_arrows: { slider: false } },
  // ContactFormWithMap solo pinta teléfono, email y dirección con `true`; «Dividido» los pinta salvo `false`.
  contact_form: {
    show_phone: { with_map: false },
    show_email: { with_map: false },
    show_address: { with_map: false },
  },
  // FeaturedProductsHero pinta la descripción salvo `false`; la tarjeta de producto (grid, carrusel) solo con `true`.
  featured_products: { show_description: { hero_product: true } },
};

function conVariantes(campo: ContentFieldDef, variantes: string[]): ContentFieldDef {
  return { ...campo, showIf: { ...(campo.showIf ?? {}), variantIn: variantes } };
}

/**
 * Aplica los dos mapas a una sección del catálogo:
 * - restringe `showIf.variantIn` a las variantes que leen el interruptor;
 * - quita de un repetidor los campos que ninguna variante lee;
 * - si el default cambia según la variante, desdobla el campo en copias con la misma clave, una
 *   por grupo de variantes con el mismo default (el inspector solo muestra la de la variante).
 */
export function aplicarInterruptoresSitio(seccion: SectionTypeDefinition): SectionTypeDefinition {
  const leidos = INTERRUPTORES_EN_SITIO[seccion.type] ?? {};
  const defaults = DEFAULT_POR_VARIANTE[seccion.type] ?? {};
  const todas = seccion.variants.map((v) => v.id);

  const contentFields = seccion.contentFields.flatMap((campo): ContentFieldDef[] => {
    let c = campo;
    if (c.type === 'repeater' && c.itemFields) {
      const sinEfecto = new Set(
        Object.entries(leidos)
          .filter(([clave, variantes]) => clave.startsWith(`${c.key}[].`) && variantes.length === 0)
          .map(([clave]) => clave.slice(c.key.length + 3)),
      );
      if (sinEfecto.size > 0) c = { ...c, itemFields: c.itemFields.filter((f) => !sinEfecto.has(f.key)) };
    }

    const ofrecidas = c.showIf?.variantIn ?? todas;
    const lectoras = leidos[c.key];
    const visibles = lectoras ? ofrecidas.filter((v) => lectoras.includes(v)) : ofrecidas;
    if (lectoras) c = conVariantes(c, visibles);

    const porVariante = defaults[c.key];
    if (!porVariante || visibles.length === 0) return [c];
    const grupos = new Map<boolean, string[]>();
    for (const v of visibles) {
      const d = porVariante[v] ?? c.defaultValue === true;
      grupos.set(d, [...(grupos.get(d) ?? []), v]);
    }
    if (grupos.size === 1) return [{ ...c, defaultValue: [...grupos.keys()][0] }];
    return [...grupos.entries()].map(([d, vs]) => ({ ...conVariantes(c, vs), defaultValue: d }));
  });

  return { ...seccion, contentFields };
}
