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
import {
  CLAVES_CARTA_QR,
  CLAVES_PORTADA_MESA,
  CLAVES_SECCION_MESA,
  TIPOS_SECCION_MESA,
  VARIANTES_SECCION_MESA,
} from '@/lib/website/contrato/seccionesMesa'

/** Claves sin repetir y ordenadas (el manifiesto vivo las publica así). */
const unir = (...listas: ReadonlyArray<readonly string[]>): string[] => [...new Set(listas.flat())].sort()

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
    {
      type: 'chef_team',
      variants: ['chef', 'team'],
      // Expone CONTENT_KEYS (Figma «Secciones nuevas» 167:5358).
      contentKeys: [
        'bio',
        'eyebrow',
        'image_alt',
        'image_url',
        'members',
        'name',
        'quote',
        'role',
        'subtitle',
        'title',
      ],
    },
    { type: 'class_schedule', variants: ['grid'], contentKeys: [] },
    { type: 'contact_form', variants: ['default', 'simple', 'split', 'with_map'], contentKeys: [] },
    { type: 'coverage_map', variants: ['static'], contentKeys: [] },
    { type: 'countdown', variants: ['banner', 'compact', 'inline'], contentKeys: [] },
    { type: 'cta', variants: ['banner', 'centered', 'split', 'with_image'], contentKeys: [] },
    { type: 'delivery_cta', variants: ['banner'], contentKeys: [] },
    {
      type: 'events',
      variants: ['detail', 'list'],
      // Expone CONTENT_KEYS (Figma «Secciones nuevas» 167:5358).
      contentKeys: [
        'detail_url',
        'empty_text',
        'events',
        'eyebrow',
        'list_url',
        'reserve_text',
        'reserve_url',
        'subtitle',
        'title',
      ],
    },
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
    {
      type: 'gallery_bento',
      variants: ['default'],
      // Expone CONTENT_KEYS (Figma «Secciones nuevas» 167:5358).
      contentKeys: [
        'eyebrow',
        'images',
        'instagram_handle',
        'instagram_url',
        'subtitle',
        'title',
      ],
    },
    { type: 'gym_features', variants: ['icons'], contentKeys: [] },
    { type: 'hero', variants: ['fullscreen', 'minimal', 'slider', 'split', 'video'], contentKeys: [] },
    {
      type: 'hours_location',
      variants: ['cards', 'hours_map', 'list'],
      // HoursLocation expone CONTENT_KEYS (Figma Locations 144:6644).
      contentKeys: [
        'branch_ids',
        'eyebrow',
        'order_url',
        'reserve_url',
        'show_call',
        'show_directions',
        'show_map',
        'show_order',
        'show_photos',
        'show_reserve',
        'subtitle',
        'title',
      ],
    },
    { type: 'how_it_works', variants: ['steps'], contentKeys: [] },
    { type: 'image_text', variants: ['image_left', 'image_right', 'image_top'], contentKeys: [] },
    { type: 'integrations', variants: ['logos'], contentKeys: [] },
    { type: 'map', variants: ['default', 'embedded', 'full_width', 'with_directions'], contentKeys: [] },
    {
      type: 'marquee',
      variants: ['photos', 'text'],
      // Expone CONTENT_KEYS (Figma «Secciones nuevas» 167:5358).
      contentKeys: [
        'images',
        'label',
        'phrases',
        'separator',
        'speed',
      ],
    },
    { type: 'membership_plans', variants: ['pricing_table'], contentKeys: [] },
    { type: 'menu_preview', variants: ['tabs'], contentKeys: [] },
    {
      type: 'menu_full',
      variants: ['anchors', 'editorial', 'per_category', 'qr', 'tabs'],
      // MenuFull expone CONTENT_KEYS como estática: el manifiesto vivo las publica.
      // La variante «qr» suma las claves de la Carta QR (contrato seccionesMesa.ts).
      contentKeys: unir(
        [
          'carta_platos',
          'columns',
          'eyebrow',
          'menus',
          'pdf_url',
          'selected_category_ids',
          'show_description',
          'show_photos',
          'size',
          'subtitle',
          'title',
        ],
        CLAVES_CARTA_QR,
      ),
    },
    { type: 'newsletter', variants: ['banner', 'simple', 'with_image'], contentKeys: [] },
    { type: 'offers', variants: ['grid'], contentKeys: [] },
    { type: 'parking_availability', variants: ['summary'], contentKeys: [] },
    { type: 'parking_features', variants: ['icons'], contentKeys: [] },
    { type: 'parking_pass_plans', variants: ['cards'], contentKeys: [] },
    { type: 'parking_pricing', variants: ['cards'], contentKeys: [] },
    { type: 'parking_zones', variants: ['grid'], contentKeys: [] },
    { type: 'partners', variants: ['cards', 'carousel', 'logos'], contentKeys: [] },
    { type: 'pricing_table', variants: ['three_columns'], contentKeys: [] },
    {
      type: 'private_events',
      variants: ['default'],
      // Expone CONTENT_KEYS (Figma «Secciones nuevas» 167:5358).
      contentKeys: [
        'budget_options',
        'event_types',
        'eyebrow',
        'form_note',
        'form_title',
        'packages',
        'steps',
        'submit_text',
        'subtitle',
        'title',
      ],
    },
    { type: 'product_actions', variants: ['default'], contentKeys: [] },
    { type: 'product_benefits', variants: ['default'], contentKeys: [] },
    { type: 'product_description', variants: ['default'], contentKeys: [] },
    { type: 'product_faq', variants: ['default'], contentKeys: [] },
    { type: 'product_gallery', variants: ['default'], contentKeys: [] },
    { type: 'product_info', variants: ['default'], contentKeys: [] },
    { type: 'product_shipping', variants: ['default'], contentKeys: [] },
    { type: 'product_specs', variants: ['default'], contentKeys: [] },
    { type: 'product_reviews', variants: ['default'], contentKeys: [] },
    { type: 'products_grid', variants: ['carousel', 'default', 'grid', 'list'], contentKeys: [] },
    { type: 'promo_banners', variants: ['carousel', 'grid', 'stack'], contentKeys: [] },
    {
      type: 'reservation',
      variants: ['band', 'external', 'form_image', 'hero_widget', 'stepper'],
      // Reservation expone CONTENT_KEYS (Figma TableReservation 141:5796).
      contentKeys: [
        'anchor_id',
        'branch_ids',
        'cta_text',
        'cta_url',
        'external_button_text',
        'external_url',
        'eyebrow',
        'image_url',
        'max_days',
        'max_guests',
        'min_guests',
        'pending_message',
        'policy_text',
        'require_email',
        'show_notes',
        'subtitle',
        'success_message',
        'title',
      ],
    },
    { type: 'reservation_cta', variants: ['simple', 'with_form'], contentKeys: [] },
    {
      type: 'restaurant_hero',
      variants: ['mesa', 'split_bento', 'typographic'],
      // Expone CONTENT_KEYS (Figma «Secciones nuevas» 167:5358); la variante «mesa» (Carta QR)
      // suma las suyas del contrato seccionesMesa.ts.
      contentKeys: unir(
        [
          'cards',
          'eyebrow',
          'image_alt',
          'image_url',
          'primary_cta_text',
          'primary_cta_url',
          'secondary_cta_text',
          'secondary_cta_url',
          'subtitle',
          'title',
        ],
        CLAVES_PORTADA_MESA,
      ),
    },
    // Carta QR en la mesa: los cuatro tipos nuevos (contrato seccionesMesa.ts).
    ...TIPOS_SECCION_MESA.map((type) => ({
      type,
      variants: [...VARIANTES_SECCION_MESA[type]].sort(),
      contentKeys: unir(CLAVES_SECCION_MESA[type]),
    })),
    { type: 'related_products', variants: ['default'], contentKeys: [] },
    { type: 'room_types', variants: ['cards', 'detailed'], contentKeys: [] },
    { type: 'routes', variants: ['cards'], contentKeys: [] },
    { type: 'services_list', variants: ['cards', 'grid', 'icons_row', 'list'], contentKeys: [] },
    {
      type: 'signature_dishes',
      variants: ['carousel', 'scrollytelling'],
      // Expone CONTENT_KEYS (Figma «Secciones nuevas» 167:5358).
      contentKeys: [
        'dishes',
        'eyebrow',
        'link_to_product',
        'show_price',
        'subtitle',
        'title',
      ],
    },
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
