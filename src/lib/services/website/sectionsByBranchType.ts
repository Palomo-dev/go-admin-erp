import type { BranchType } from '@/types/branch';

/**
 * Secciones universales — disponibles para todos los branch_type y para
 * "Global" (organización sin outlet). Fase 4 §3.1.
 */
const UNIVERSAL_SECTIONS: string[] = [
  'hero',
  'gallery',
  'testimonials',
  'cta',
  'contact_form',
  'map',
  'stats',
  'text_block',
  'team',
  'faq',
  'newsletter',
  'image_text',
  'partners',
  'countdown',
  'services_list',
];

/**
 * Secciones de detalle de producto — solo relevantes si el outlet tiene
 * catálogo (retail).
 */
const PRODUCT_DETAIL_SECTIONS: string[] = [
  'product_gallery',
  'product_info',
  'product_actions',
  'product_benefits',
  'product_description',
  'related_products',
  'product_specs',
  'product_faq',
  'product_shipping',
  'product_reviews',
];

const CATEGORY_DETAIL_SECTIONS: string[] = [
  'category_header',
  'category_filters',
  'category_products',
  'category_subcategories',
  'category_seo_text',
];

/**
 * Mapa branch_type → secciones permitidas (además de las universales).
 * Si el outlet es "Global" (branch_type = null) → se muestran TODAS las
 * secciones (comportamiento actual, backward compat).
 */
export const SECTIONS_BY_BRANCH_TYPE: Record<string, string[]> = {
  hotel: [
    ...UNIVERSAL_SECTIONS,
    'room_types',
    'amenities',
    'booking_cta',
    'why_choose_us',
  ],
  restaurant: [
    ...UNIVERSAL_SECTIONS,
    'menu_preview',
    'specialties',
    'reservation_cta',
    'delivery_cta',
    'chef_section',
  ],
  retail: [
    ...UNIVERSAL_SECTIONS,
    'products_grid',
    'categories_grid',
    'featured_products',
    'promo_banners',
    'brands',
    'offers',
    ...PRODUCT_DETAIL_SECTIONS,
    ...CATEGORY_DETAIL_SECTIONS,
  ],
  gym: [
    ...UNIVERSAL_SECTIONS,
    'membership_plans',
    'class_schedule',
    'trainers',
    'gym_features',
    'transformation',
  ],
  transport: [
    ...UNIVERSAL_SECTIONS,
    'routes',
    'fleet_showcase',
    'trip_search',
    'booking_transport',
    'coverage_map',
  ],
  parking: [
    ...UNIVERSAL_SECTIONS,
    'parking_zones',
    'parking_pricing',
    'parking_pass_plans',
    'parking_features',
    'parking_availability',
  ],
  services: [
    ...UNIVERSAL_SECTIONS,
    'features_grid',
    'how_it_works',
    'pricing_table',
    'demo_cta',
    'integrations',
  ],
};

/**
 * Devuelve la lista de section_type permitidos para un branch_type dado.
 * Si branchType es null/undefined (Global) → devuelve null, lo que indica
 * "sin filtro" (todas las secciones del catálogo).
 */
export function getAllowedSectionTypes(
  branchType: BranchType | null | undefined,
): string[] | null {
  if (!branchType) return null; // Global = todas
  return SECTIONS_BY_BRANCH_TYPE[branchType] ?? UNIVERSAL_SECTIONS;
}
