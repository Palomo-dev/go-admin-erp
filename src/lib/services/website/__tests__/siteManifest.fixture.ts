/**
 * Fixture del manifiesto del sitio (F0.6).
 *
 * Refleja el `SECTION_MAP` de `goadmin-websites/components/sections/SectionRenderer.tsx`
 * y los `CONTENT_KEYS` declarados en los componentes. Se mantiene como fixture
 * estático para que el test de contrato pueda correr en CI sin necesidad de
 * levantar el sitio.
 *
 * **Actualizar cuando se agreguen/eliminen secciones en el sitio.**
 * El endpoint vivo está en `goadmin-websites/app/api/_sections/manifest/route.ts`.
 */

import type { SectionManifest } from '../sectionContract'

export const siteManifestFixture: SectionManifest = {
  version: '1',
  sections: [
    { type: 'amenities', variants: ['grid', 'icons'], contentKeys: [] },
    { type: 'booking_cta', variants: ['banner', 'inline_form', 'simple'], contentKeys: [] },
    { type: 'booking_transport', variants: ['banner', 'form'], contentKeys: [] },
    { type: 'brands', variants: ['logos'], contentKeys: [] },
    { type: 'categories_grid', variants: ['default', 'grid', 'horizontal', 'icons'], contentKeys: [] },
    { type: 'category_products', variants: ['default'], contentKeys: [] },
    { type: 'category_subcategories', variants: ['default'], contentKeys: [] },
    { type: 'category_seo_text', variants: ['default'], contentKeys: [] },
    { type: 'category_header', variants: ['default'], contentKeys: [] },
    { type: 'category_filters', variants: ['default'], contentKeys: [] },
    { type: 'chef_section', variants: ['profile'], contentKeys: [] },
    { type: 'class_schedule', variants: ['grid'], contentKeys: [] },
    { type: 'contact_form', variants: ['default', 'simple', 'split', 'with_map'], contentKeys: [] },
    { type: 'coverage_map', variants: ['static'], contentKeys: [] },
    { type: 'countdown', variants: ['banner', 'compact', 'inline'], contentKeys: [] },
    { type: 'cta', variants: ['banner', 'centered', 'split', 'with_image'], contentKeys: [] },
    { type: 'delivery_cta', variants: ['banner'], contentKeys: [] },
    { type: 'demo_cta', variants: ['form'], contentKeys: [] },
    { type: 'faq', variants: ['accordion', 'simple', 'two_columns'], contentKeys: [] },
    { type: 'featured_products', variants: ['carousel', 'grid', 'hero_product'], contentKeys: [] },
    { type: 'features_grid', variants: ['alternating'], contentKeys: [] },
    { type: 'fleet_showcase', variants: ['grid'], contentKeys: [] },
    {
      type: 'gallery',
      variants: ['carousel', 'fullscreen', 'grid', 'masonry'],
      contentKeys: ['images', 'subtitle', 'title'],
    },
    { type: 'gym_features', variants: ['icons'], contentKeys: [] },
    { type: 'hero', variants: ['fullscreen', 'minimal', 'slider', 'split', 'video'], contentKeys: [] },
    { type: 'how_it_works', variants: ['steps'], contentKeys: [] },
    { type: 'image_text', variants: ['image_left', 'image_right', 'image_top'], contentKeys: [] },
    { type: 'integrations', variants: ['logos'], contentKeys: [] },
    { type: 'map', variants: ['default', 'embedded', 'full_width', 'with_directions'], contentKeys: [] },
    { type: 'membership_plans', variants: ['pricing_table'], contentKeys: [] },
    { type: 'menu_preview', variants: ['tabs'], contentKeys: [] },
    { type: 'newsletter', variants: ['banner', 'simple', 'with_image'], contentKeys: [] },
    { type: 'offers', variants: ['grid'], contentKeys: [] },
    { type: 'parking_availability', variants: ['summary'], contentKeys: [] },
    { type: 'parking_features', variants: ['icons'], contentKeys: [] },
    { type: 'parking_pass_plans', variants: ['cards'], contentKeys: [] },
    { type: 'parking_pricing', variants: ['cards'], contentKeys: [] },
    { type: 'parking_zones', variants: ['grid'], contentKeys: [] },
    { type: 'partners', variants: ['cards', 'carousel', 'logos'], contentKeys: [] },
    { type: 'pricing_table', variants: ['three_columns'], contentKeys: [] },
    { type: 'product_actions', variants: ['default'], contentKeys: [] },
    { type: 'product_benefits', variants: ['default'], contentKeys: [] },
    { type: 'product_description', variants: ['default'], contentKeys: [] },
    { type: 'product_gallery', variants: ['default'], contentKeys: [] },
    { type: 'product_info', variants: ['default'], contentKeys: [] },
    { type: 'product_reviews', variants: ['default'], contentKeys: [] },
    { type: 'products_grid', variants: ['carousel', 'default', 'grid', 'list'], contentKeys: [] },
    { type: 'promo_banners', variants: ['carousel', 'grid', 'stack'], contentKeys: [] },
    { type: 'reservation_cta', variants: ['simple', 'with_form'], contentKeys: [] },
    { type: 'related_products', variants: ['default'], contentKeys: [] },
    { type: 'room_types', variants: ['cards', 'detailed'], contentKeys: [] },
    { type: 'routes', variants: ['cards'], contentKeys: [] },
    { type: 'services_list', variants: ['cards', 'grid', 'icons_row', 'list'], contentKeys: [] },
    { type: 'specialties', variants: ['featured'], contentKeys: [] },
    { type: 'stats', variants: ['cards', 'counters', 'inline'], contentKeys: [] },
    { type: 'team', variants: ['carousel', 'grid', 'simple'], contentKeys: [] },
    { type: 'text_block', variants: ['centered', 'left', 'two_columns'], contentKeys: [] },
    { type: 'testimonials', variants: ['carousel', 'grid', 'minimal', 'quotes'], contentKeys: [] },
    { type: 'transformation', variants: ['before_after'], contentKeys: [] },
    { type: 'trainers', variants: ['grid'], contentKeys: [] },
    { type: 'trip_search', variants: ['form'], contentKeys: [] },
    { type: 'why_choose_us', variants: ['icons'], contentKeys: [] },
  ],
}
