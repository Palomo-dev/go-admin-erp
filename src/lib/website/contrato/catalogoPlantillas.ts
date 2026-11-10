/**
 * Catálogo de estilos y plantillas del sitio por giro (Figma A/06a-06c, A/06h-06i):
 * UNA fuente para Diseño (presets de estilo), Plantillas (galería), el asistente
 * de creación y el estilo global del editor. Código puro y versionado, sin React
 * ni Supabase, para poder moverlo al paquete del contrato o copiarlo a
 * goadmin-websites (ADR-002 D2, enmienda A4), como `documentoSitio.ts`.
 *
 * Qué es cada cosa (A/06h):
 * - Un ESTILO (preset) es solo apariencia: modo, fondo, texto, acento, par
 *   tipográfico, redondeo, botones y movimiento. Elegirlo en Diseño no toca las
 *   secciones.
 * - Una PLANTILLA es estructura + estilo: el orden y las variantes de las
 *   secciones de Inicio y su estilo. Usarla crea un borrador y conserva el
 *   contenido («Solo estilo», `usarPlantilla.ts`) o arma el sitio completo
 *   («Plantilla completa», `v2/plantillaCompleta.ts`).
 *
 * De dónde sale:
 * - Restaurante: las 8 plantillas aprobadas en Figma (A/06b, A/07h) más «Café de especialidad»
 *   (2223:46106, lámina 11), con sus
 *   tokens medidos en las capturas. Cada una se apoya en una plantilla base que
 *   el sitio público ya sabe pintar (`base`: `restaurant_elegant`, …): esa es la
 *   que se guarda en `tema.plantillaBase`, porque el sitio resuelve la plantilla
 *   con ese id (`getTemplate(template_id)` en goadmin-websites).
 * - Tienda: las 7 plantillas aprobadas en Figma («04 Tiendas», 2026-11-10: Panorama, Atelier,
 *   Radiante, Roble, Marea, Contraste y Hogar), con su tarjeta de producto, sus perillas del tema y
 *   sus páginas de ficha y categoría (`TIENDA`), más las 4 del sitio (`retail_*`).
 * - Los demás giros (tienda, hotel, servicios, gimnasio, transporte y
 *   parqueadero) aún no tienen diseño propio en Figma: se construyen desde las
 *   plantillas reales del sitio (`TEMPLATE_PRESETS`, que se pasan a
 *   `construirCatalogo`) y su estructura de Inicio, copiada de
 *   `goadmin-websites/lib/templates/presets.ts` en `SECCIONES_INICIO_BASE` (la
 *   prueba de contrato la compara con el sitio cuando el repositorio está al lado).
 */
import type { EstiloBoton, MovimientoSitio, RadioSitio, TokensEstilo } from '@/lib/website/v2/tokensEstilo';
import type { EstiloTarjetaProducto } from '@/lib/website/tarjetaProducto';
import type { EstiloPaginacion, IndicadorCarrusel } from '@/lib/website/v2/paginacionCarrusel';
import { CONTRASTE_AA, contraste } from '@/lib/utils/contrasteColor';

export const VERSION_CATALOGO_PLANTILLAS = 1 as const;

/** Giros del catálogo (las pestañas de A/06b más transporte y parqueadero). */
export const GIROS_CATALOGO = ['restaurante', 'tienda', 'hotel', 'servicios', 'gimnasio', 'transporte', 'parqueadero'] as const;
export type GiroCatalogo = (typeof GIROS_CATALOGO)[number];

/** `organizations.type_id` → giro (verificado en `organization_types`: 1…7). */
const GIRO_DE_TIPO: Record<number, GiroCatalogo> = {
  1: 'restaurante',
  2: 'hotel',
  3: 'tienda',
  4: 'servicios',
  5: 'gimnasio',
  6: 'transporte',
  7: 'parqueadero',
};

/** `business_type` de las plantillas del sitio → giro. */
const GIRO_DE_NEGOCIO: Record<string, GiroCatalogo> = {
  restaurant: 'restaurante',
  retail: 'tienda',
  hotel: 'hotel',
  services: 'servicios',
  gym: 'gimnasio',
  transport: 'transporte',
  parking: 'parqueadero',
};

export function giroCatalogoDeTipo(typeId: number | null | undefined): GiroCatalogo | null {
  return typeId ? GIRO_DE_TIPO[typeId] ?? null : null;
}

/**
 * Sección de la estructura de una plantilla: `[tipo, variante]` del catálogo de secciones y, si la
 * plantilla lo pide, el contenido propio que se mezcla SOBRE el contenido inicial de la sección
 * (`plantillaCompleta.ts`). Un texto `'@pagina:<slug>'` se resuelve contra las páginas reales del
 * documento (sin la página, la clave o el botón no se escriben: nunca un enlace roto).
 */
export type SeccionPlantilla = readonly [tipo: string, variante: string, contenido?: Readonly<Record<string, unknown>>];

/**
 * Perillas del tema que trae una plantilla (`tema.tokens`, ya en el contrato): mayúsculas
 * espaciadas en los botones y efecto al pasar el mouse. Las escribe solo «Plantilla completa».
 */
export interface TokensPlantilla {
  boton?: { mayusculas?: boolean };
  hover?: 'sutil' | 'expresivo';
}

/** Páginas de detalle que arma la plantilla («Plantilla completa» las REEMPLAZA: decisión D4). */
export interface DetallePlantilla {
  /** Bloques de la ficha (`tipo = product_detail`), en orden. */
  producto: readonly SeccionPlantilla[];
  /** Bloques de la página de categoría (`tipo = category_detail`), en orden. */
  categoria: readonly SeccionPlantilla[];
}

/** Clase del par tipográfico, para la descripción de FontPairOption («Elegante · títulos con serifa»). */
export type ClaseFuentes = 'editorial' | 'elegante' | 'clasica' | 'calida' | 'artesanal' | 'divertida' | 'neutra' | 'moderna';

export interface EstiloCatalogo extends TokensEstilo {
  /** Id estable (el de la plantilla que lo trae). */
  id: string;
  nombre: string;
  giro: GiroCatalogo;
  claseFuentes: ClaseFuentes;
  /**
   * Secundario propio (`colores.secundario`). Ausente = el derivado del modo, como siempre
   * (`secundarioDe`). Solo lo traen las plantillas de tienda nuevas (Marea).
   */
  secundario?: string;
  /**
   * Segundo acento (`colores.acento`: resaltados, etiquetas, la manija del antes y después).
   * Ausente = no se escribe: «Solo estilo» de las plantillas de antes queda igual byte a byte.
   */
  acentoSecundario?: string;
}

export interface PlantillaCatalogo {
  id: string;
  nombre: string;
  descripcion: string;
  giro: GiroCatalogo;
  /** Segundo chip del diálogo (A/06c: «Bar de coctelería»). */
  subgiro: string | null;
  /** Plantilla del sitio público sobre la que se apoya (`tema.plantillaBase`). */
  base: string;
  /** Estructura de Inicio, en orden. */
  inicio: readonly SeccionPlantilla[];
  estilo: EstiloCatalogo;
  /** La primera que se sugiere en su giro. */
  porDefecto: boolean;
  // ─── Solo las plantillas de tienda nuevas (2026-11). Ausentes = «Plantilla completa» de antes. ──
  /** Tarjeta de producto del sitio (`tema.tarjetaProducto`, contrato `tarjetaProducto.ts`). */
  tarjetaProducto?: Readonly<EstiloTarjetaProducto>;
  /** Perillas del tema (`tema.tokens`). */
  tokens?: Readonly<TokensPlantilla>;
  /** Carrusel del sitio (`tema.carrusel`; solo con NEXT_PUBLIC_WEBSITE_PAGINACION=1). */
  carrusel?: Readonly<{ indicador?: IndicadorCarrusel }>;
  /** Paginación del sitio (`tema.paginacion`; solo con NEXT_PUBLIC_WEBSITE_PAGINACION=1). */
  paginacion?: Readonly<{ estilo?: EstiloPaginacion }>;
  /** Ficha de producto y página de categoría propias (D4: reemplazan las del borrador). */
  detalle?: Readonly<DetallePlantilla>;
}

export interface CatalogoPlantillas {
  version: typeof VERSION_CATALOGO_PLANTILLAS;
  plantillas: readonly PlantillaCatalogo[];
}

// ─── Restaurante: las 8 de Figma (A/06b, A/07h) y el café (2223:46106) ─────────────────

interface DefinicionRestaurante {
  id: string;
  nombre: string;
  descripcion: string;
  subgiro: string;
  base: string;
  inicio: readonly SeccionPlantilla[];
  modo: 'light' | 'dark';
  fondo: string;
  texto: string;
  acento: string;
  fuenteTitulos: string;
  fuenteCuerpo: string;
  radio: RadioSitio;
  estiloBoton: EstiloBoton;
  movimiento: MovimientoSitio;
  claseFuentes: ClaseFuentes;
}

const RESTAURANTE: readonly DefinicionRestaurante[] = [
  {
    id: 'noir_omakase',
    nombre: 'Noir Omakase',
    descripcion: 'Carta con anclas, reservas y chef.',
    subgiro: 'Barra de autor',
    base: 'restaurant_elegant',
    inicio: [
      ['restaurant_hero', 'typographic'],
      ['chef_team', 'chef'],
      ['signature_dishes', 'scrollytelling'],
      ['menu_preview', 'tabs'],
      ['testimonials', 'quotes'],
      ['reservation', 'form_image'],
      ['hours_location', 'hours_map'],
    ],
    modo: 'dark',
    fondo: '#0E0E0E',
    texto: '#F2EDE4',
    acento: '#C8A97E',
    fuenteTitulos: 'Cormorant',
    fuenteCuerpo: 'Inter',
    radio: 4,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'elegante',
  },
  {
    id: 'velvet_lounge',
    nombre: 'Velvet Lounge',
    descripcion: 'Bar de coctelería con eventos y reservas.',
    subgiro: 'Bar de coctelería',
    base: 'restaurant_elegant',
    inicio: [
      ['hero', 'video'],
      ['menu_preview', 'tabs'],
      ['events', 'list'],
      ['reservation', 'form_image'],
      ['gallery', 'carousel'],
      ['testimonials', 'carousel'],
      ['hours_location', 'hours_map'],
    ],
    modo: 'dark',
    fondo: '#1B0F1E',
    texto: '#F5E9F0',
    acento: '#D4AF37',
    fuenteTitulos: 'Playfair Display',
    fuenteCuerpo: 'Lato',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'medio',
    claseFuentes: 'elegante',
  },
  {
    // «Café de especialidad» (Figma «16 Sitio web» 2223:46106, lámina 11; tercera en la galería,
    // lámina 10). Sus cuatro piezas son variantes de tipos que ya existen (contrato seccionesCafe.ts).
    id: 'cafe_especialidad',
    nombre: 'Café de especialidad',
    descripcion: 'Portada en carrusel, historia, carta por sede y reserva en el plano.',
    subgiro: 'Cafetería',
    base: 'restaurant_rustic',
    inicio: [
      ['hero', 'carousel_editorial'],
      ['how_it_works', 'chapters'],
      ['menu_full', 'dotted'],
      ['reservation', 'band'],
      ['hours_location', 'cards'],
    ],
    modo: 'light',
    fondo: '#F7F2EA',
    texto: '#2E3328',
    acento: '#4A5638',
    fuenteTitulos: 'Playfair Display',
    fuenteCuerpo: 'Inter',
    radio: 24,
    estiloBoton: 'pastilla',
    movimiento: 'medio',
    claseFuentes: 'elegante',
  },
  {
    id: 'fine_dining_oscuro',
    nombre: 'Fine Dining Oscuro',
    descripcion: 'Menú degustación, maridaje y reserva.',
    subgiro: 'Alta cocina',
    base: 'restaurant_elegant',
    inicio: [
      ['restaurant_hero', 'typographic'],
      ['signature_dishes', 'scrollytelling'],
      ['menu_preview', 'tabs'],
      ['chef_team', 'chef'],
      ['gallery_bento', 'default'],
      ['reservation', 'form_image'],
      ['hours_location', 'hours_map'],
    ],
    modo: 'dark',
    fondo: '#101418',
    texto: '#EDEAE3',
    acento: '#B8975A',
    fuenteTitulos: 'Cormorant Garamond',
    fuenteCuerpo: 'Montserrat',
    radio: 4,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'clasica',
  },
  {
    id: 'editorial_marfil',
    nombre: 'Editorial Marfil',
    descripcion: 'Carta editorial, historia y prensa.',
    subgiro: 'Cocina de autor',
    base: 'restaurant_rustic',
    inicio: [
      ['restaurant_hero', 'split_bento'],
      ['image_text', 'image_right'],
      ['menu_preview', 'tabs'],
      ['signature_dishes', 'carousel'],
      ['testimonials', 'quotes'],
      ['reservation', 'band'],
      ['hours_location', 'cards'],
    ],
    modo: 'light',
    fondo: '#F6F1E7',
    texto: '#1F1B16',
    acento: '#8C2F1B',
    fuenteTitulos: 'Libre Caslon Text',
    fuenteCuerpo: 'Inter',
    radio: 0,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'editorial',
  },
  {
    id: 'mediterraneo',
    nombre: 'Mediterráneo',
    descripcion: 'Carta por estaciones y terraza.',
    subgiro: 'Terraza',
    base: 'restaurant_rustic',
    inicio: [
      ['restaurant_hero', 'split_bento'],
      ['menu_preview', 'tabs'],
      ['marquee', 'photos'],
      ['gallery_bento', 'default'],
      ['testimonials', 'minimal'],
      ['reservation', 'band'],
      ['hours_location', 'cards'],
    ],
    modo: 'light',
    fondo: '#FBF8F2',
    texto: '#1D2B36',
    acento: '#1F6F8B',
    fuenteTitulos: 'DM Serif Display',
    fuenteCuerpo: 'DM Sans',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'bajo',
    claseFuentes: 'calida',
  },
  {
    id: 'bistro_ilustrado',
    nombre: 'Bistró Ilustrado',
    descripcion: 'Menú del día y domicilios.',
    subgiro: 'Bistró',
    base: 'restaurant_casual',
    inicio: [
      ['hero', 'split'],
      ['menu_preview', 'tabs'],
      ['delivery_cta', 'banner'],
      ['promo_banners', 'grid'],
      ['testimonials', 'grid'],
      ['faq', 'simple'],
      ['hours_location', 'list'],
    ],
    modo: 'light',
    fondo: '#FFF6E9',
    texto: '#2B2118',
    acento: '#C2410C',
    fuenteTitulos: 'Fraunces',
    fuenteCuerpo: 'Work Sans',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'medio',
    claseFuentes: 'artesanal',
  },
  {
    id: 'pop_callejero',
    nombre: 'Pop Callejero',
    descripcion: 'Combos, pedidos rápidos y redes.',
    subgiro: 'Comida callejera',
    base: 'restaurant_casual',
    inicio: [
      ['hero', 'split'],
      ['promo_banners', 'carousel'],
      ['menu_preview', 'tabs'],
      ['delivery_cta', 'banner'],
      ['testimonials', 'grid'],
      ['newsletter', 'banner'],
      ['hours_location', 'list'],
    ],
    modo: 'light',
    fondo: '#FFE94D',
    texto: '#111111',
    acento: '#E11D48',
    fuenteTitulos: 'Bricolage Grotesque',
    fuenteCuerpo: 'Inter',
    radio: 24,
    estiloBoton: 'pastilla',
    movimiento: 'alto',
    claseFuentes: 'divertida',
  },
  {
    id: 'carta_qr',
    nombre: 'Carta QR',
    descripcion: 'Solo la carta, para leer en la mesa.',
    subgiro: 'Carta en la mesa',
    base: 'restaurant_modern',
    inicio: [
      ['restaurant_hero', 'typographic'],
      ['menu_preview', 'tabs'],
      ['hours_location', 'list'],
    ],
    modo: 'light',
    fondo: '#FFFFFF',
    texto: '#18181B',
    acento: '#15803D',
    fuenteTitulos: 'Inter',
    fuenteCuerpo: 'Inter',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'ninguno',
    claseFuentes: 'neutra',
  },
];

// ─── Tienda: las 7 plantillas nuevas (Figma «GO Admin — Sitios» › 04 Tiendas, 2026-11) ─────────
//
// Aprobadas por el dueño el 2026-11-10 (PLANO §4 y las láminas L0 de cada una). Cada una se apoya
// en una plantilla base del sitio (`base`, un `retail_*` que ya existe: el sitio no necesita un
// preset nuevo) y trae, además del estilo e Inicio, su tarjeta de producto, sus perillas del tema
// y sus páginas de ficha y categoría. Sin bandera propia: el sitio publicado ya pinta todo lo que
// usan (W1–W7), así que aparecen directamente en «Usar plantilla».
//
// Contenido de ejemplo: solo rótulos neutros que el dueño edita («Lo más pedido este mes», «Se lleva
// con»). Nada de cifras, reseñas, cupones ni anuncios de las láminas: serían hechos falsos.

interface DefinicionTienda extends Omit<DefinicionRestaurante, 'subgiro'> {
  subgiro: string;
  secundario?: string;
  acentoSecundario?: string;
  tarjetaProducto: EstiloTarjetaProducto;
  tokens?: TokensPlantilla;
  carrusel?: { indicador?: IndicadorCarrusel };
  paginacion?: { estilo?: EstiloPaginacion };
  detalle: DetallePlantilla;
}

/** Ids de las 7 plantillas de tienda nuevas, en el orden de la galería (A1). */
export const IDS_PLANTILLAS_TIENDA = [
  'retail_panorama',
  'retail_atelier',
  'retail_radiante',
  'retail_roble',
  'retail_marea',
  'retail_contraste',
  'retail_hogar',
] as const;

/** ¿Es una de las 7 plantillas de tienda nuevas? */
export function esPlantillaTiendaNueva(id: string | null | undefined): boolean {
  return !!id && (IDS_PLANTILLAS_TIENDA as readonly string[]).includes(id);
}

/** Página de categoría de siempre (encabezado con migas y conteo, filtros y rejilla). */
const ENCABEZADO_CATEGORIA = { show_image: false, show_breadcrumb: true, show_count: true } as const;
const RELACIONADOS_REJILLA: SeccionPlantilla = ['related_products', 'default', { related_products_layout: 'grid' }];

const TIENDA: readonly DefinicionTienda[] = [
  {
    id: 'retail_panorama',
    nombre: 'Panorama',
    descripcion: 'Deportes, aire libre, tecnología y repuestos: catálogos amplios con el buscador al frente.',
    subgiro: 'Catálogo amplio',
    base: 'retail_modern',
    inicio: [
      ['hero', 'search', { inset: true }],
      ['products_grid', 'grid', { title: 'Lo más pedido este mes', columns: 4 }],
      ['categories_grid', 'horizontal', { title: 'Encuentra lo que necesitas', category_style: 'card_bottom', shape: 'card', desktop_layout: 'grid', desktop_columns: 6, mobile_layout: 'carousel', show_count: true }],
      ['how_it_works', 'steps'],
      ['categories_grid', 'grid', { title: 'Colecciones', category_style: 'overlay', shape: 'rounded', desktop_columns: 4 }],
      ['link_cloud', 'pills', { source: 'categories' }],
      ['promo_banners', 'carousel', { layout: 'carousel' }],
      ['brands', 'logos'],
      ['features_grid', 'icons'],
      ['stats', 'cards'],
      ['cta', 'with_image'],
      ['testimonials', 'grid', { show_summary: true, summary_source: 'product_reviews' }],
      ['faq', 'two_columns'],
    ],
    modo: 'light',
    fondo: '#FFFFFF',
    texto: '#111111',
    acento: '#111111',
    fuenteTitulos: 'Inter',
    fuenteCuerpo: 'Inter',
    radio: 12,
    estiloBoton: 'solido',
    movimiento: 'medio',
    claseFuentes: 'neutra',
    tokens: { hover: 'expresivo' },
    tarjetaProducto: {
      card_preset: 'boxed',
      add: { button_style: 'icon_only', button_shape: 'circle', button_size: 'md', button_width: 'auto', button_position: 'inline_price', button_visibility: 'always', icon: 'ArrowRight' },
      label_shape: 'pill',
      label_style: 'soft',
      label_position: 'top_left',
      text_align: 'left',
      price_position: 'beside_button',
      price_size: 'lg',
      price_prefix: 'desde',
      show_compare_price: false,
      show_reviews: false,
      title_lines: 2,
      title_weight: 'semibold',
      title_size: 'md',
      show_brand: false,
      show_category: true,
      card_subtitle: 'description',
      card_layout: 'vertical',
      card_radius: 12,
      card_border_width: 0,
      card_shadow: 'none',
      card_padding: 20,
      image_ratio: '4:3',
      image_fit: 'contain',
      image_bg: 'transparent',
      image_padding: 0,
      image_radius: 0,
      hover_image: 'zoom',
    },
    detalle: {
      producto: [
        ['product_gallery', 'default', { gallery_layout: 'carousel', thumbnails_position: 'bottom', page_layout: { columns: '2', sticky_column: true, show_breadcrumb: true } }],
        ['product_info', 'default'],
        ['product_anchor_nav', 'tabs'],
        ['product_specs', 'icon_grid'],
        ['product_actions', 'default', { buttons_layout: 'stacked', sticky_mobile: true }],
        ['product_benefits', 'default'],
        ['product_description', 'default'],
        ['product_reviews', 'default'],
        RELACIONADOS_REJILLA,
      ],
      categoria: [
        ['category_header', 'default', ENCABEZADO_CATEGORIA],
        ['category_filters', 'default', { show_sort: true, show_view_toggle: true, subcategory_style: 'chips' }],
        ['category_products', 'default', { columns: 4 }],
      ],
    },
  },
  {
    id: 'retail_atelier',
    nombre: 'Atelier',
    descripcion: 'Moda de autor, boutiques, sastrería, calzado y bolsos: editorial y silenciosa.',
    subgiro: 'Moda de autor',
    base: 'retail_elegant',
    inicio: [
      ['hero', 'fullscreen', { cta_text: 'Ver la colección', cta_url: '@pagina:productos' }],
      ['products_grid', 'editorial', { count_header: true, filters_style: 'text' }],
      ['image_text', 'image_left'],
    ],
    modo: 'light',
    fondo: '#EDE9E3',
    texto: '#1A1715',
    acento: '#1A1715',
    fuenteTitulos: 'Cormorant Garamond',
    fuenteCuerpo: 'Inter',
    radio: 0,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'elegante',
    paginacion: { estilo: 'cargar_mas' },
    tarjetaProducto: {
      card_preset: 'minimal',
      add: { button_style: 'ghost', button_shape: 'square', button_size: 'sm', button_width: 'full', button_position: 'over_image_bottom', button_visibility: 'hover', icon: 'Plus', icon_side: 'right' },
      choose: { button_style: 'ghost', button_shape: 'square', button_size: 'sm', button_width: 'full', button_position: 'over_image_bottom', button_visibility: 'hover', icon: 'Plus', icon_side: 'right' },
      label_shape: 'square',
      label_style: 'outline',
      label_position: 'top_left',
      label_shipping: { show: false },
      label_discount: { show: false },
      text_align: 'left',
      price_position: 'beside_title',
      price_size: 'sm',
      show_compare_price: false,
      show_reviews: false,
      title_lines: 1,
      title_weight: 'normal',
      title_size: 'lg',
      title_font: 'heading',
      show_brand: false,
      show_category: false,
      card_radius: 0,
      card_border_width: 0,
      card_shadow: 'none',
      card_padding: 0,
      image_ratio: '3:4',
      image_fit: 'contain',
      image_bg: '#E6E1D9',
      image_padding: 32,
      image_radius: 0,
      hover_image: 'second',
    },
    detalle: {
      producto: [
        ['product_gallery', 'default', { gallery_layout: 'mosaic', thumbnails_position: 'none' }],
        ['product_info', 'default'],
        ['product_actions', 'default', { buttons_layout: 'stacked', button_hint: 'auto', sticky_mobile: true }],
        ['product_benefits', 'default'],
        ['product_description', 'default'],
        ['complete_the_look', 'default', { source: 'tag' }],
        ['product_reviews', 'default'],
        RELACIONADOS_REJILLA,
      ],
      categoria: [
        ['category_header', 'default', ENCABEZADO_CATEGORIA],
        ['category_filters', 'default', { subcategory_style: 'text', show_view_toggle: false }],
        ['category_products', 'default', { columns: 4 }],
      ],
    },
  },
  {
    id: 'retail_radiante',
    nombre: 'Radiante',
    descripcion: 'Belleza, cosmética y cuidado personal: luminosa, con tarjetas flotantes y palabra resaltada.',
    subgiro: 'Belleza y cuidado personal',
    base: 'retail_classic',
    inicio: [
      ['hero', 'floating', { buttons: [{ label: 'Comprar', url: '@pagina:productos', variant: 'solid' }], floating_cards: [{ kind: 'categories' }, { kind: 'rating' }] }],
      ['featured_products', 'carousel'],
      ['image_text', 'image_left'],
      ['products_grid', 'grid', { columns: 4 }],
      ['service_cards', 'over_image'],
      // «Blog»: no hay tabla de blog (D1, diferido); banners manuales, oculta hasta que el dueño los ponga.
      ['promo_banners', 'grid', { title: 'Blog', banners: [] }],
      ['transformation', 'slider'],
      ['faq', 'two_columns'],
      ['gallery', 'collage'],
      ['cta', 'banner'],
    ],
    modo: 'light',
    fondo: '#FFFFFF',
    texto: '#141414',
    acento: '#141414',
    acentoSecundario: '#F2F06B',
    fuenteTitulos: 'Instrument Serif',
    fuenteCuerpo: 'Inter',
    radio: 24,
    estiloBoton: 'pastilla',
    movimiento: 'medio',
    claseFuentes: 'editorial',
    tarjetaProducto: {
      card_preset: 'boxed',
      add: { button_style: 'soft', button_shape: 'pill', button_size: 'md', button_width: 'full', button_position: 'bottom', button_visibility: 'always', icon: '' },
      label_shape: 'pill',
      label_style: 'solid',
      label_position: 'top_left',
      label_new: { bg: '#F2F06B', text: '#141414' },
      text_align: 'left',
      price_position: 'beside_title',
      price_size: 'md',
      show_compare_price: true,
      show_reviews: true,
      reviews_position: 'below_title',
      reviews_style: 'stars',
      title_lines: 2,
      title_weight: 'normal',
      title_size: 'md',
      title_font: 'heading',
      show_category: true,
      card_radius: 24,
      card_border_width: 0,
      card_shadow: 'none',
      card_padding: 12,
      card_bg: '#F6F4F1',
      image_ratio: '1:1',
      image_fit: 'contain',
      image_bg: '#FFFFFF',
      image_padding: 24,
      image_radius: 12,
      hover_image: 'second',
      wishlist_style: 'circle',
      wishlist_position: 'top_right',
    },
    detalle: {
      producto: [
        ['product_gallery', 'default', { gallery_layout: 'scroll', thumbnails_position: 'none' }],
        ['product_info', 'default'],
        ['product_actions', 'default', { buttons_layout: 'stacked' }],
        ['product_benefits', 'default'],
        ['product_description', 'default'],
        ['product_reviews', 'default'],
        ['product_faq', 'default'],
        RELACIONADOS_REJILLA,
      ],
      categoria: [
        ['category_header', 'default', ENCABEZADO_CATEGORIA],
        ['category_filters', 'default', { show_sort: true, show_view_toggle: true, subcategory_style: 'chips' }],
        ['category_products', 'default', { columns: 4 }],
      ],
    },
  },
  {
    id: 'retail_roble',
    nombre: 'Roble',
    descripcion: 'Muebles de autor, carpintería y objetos hechos a pedido: mucho aire y fotos sobre fondo hueso.',
    subgiro: 'Muebles de autor',
    base: 'retail_modern',
    inicio: [
      ['hero', 'fullscreen', { buttons: [{ label: 'Ver la colección', url: '@pagina:productos', variant: 'link' }] }],
      ['product_index', 'list', { title: 'Nuestras piezas' }],
      ['text_block', 'centered'],
      ['categories_grid', 'grid', { category_style: 'title_top', shape: 'square', desktop_columns: 3, mobile_layout: 'carousel', show_count: true }],
      ['products_grid', 'grid', { tabs_style: 'underline' }],
      ['product_anatomy', 'default'],
      ['features_grid', 'photo_columns'],
      ['stats', 'inline'],
      ['testimonials', 'quotes', { pager: 'fraction', show_summary: true }],
      // «Notas del taller»: sin tabla de blog (D1); banners manuales, oculta hasta que el dueño los ponga.
      ['promo_banners', 'grid', { title: 'Notas del taller', banners: [] }],
    ],
    modo: 'light',
    fondo: '#F6F6F2',
    texto: '#2E2E2A',
    acento: '#2E2E2A',
    fuenteTitulos: 'Inter',
    fuenteCuerpo: 'Inter',
    radio: 0,
    estiloBoton: 'solido',
    movimiento: 'bajo',
    claseFuentes: 'neutra',
    tarjetaProducto: {
      card_preset: 'minimal',
      add: { button_style: 'icon_only', button_shape: 'square', button_size: 'md', button_width: 'auto', button_position: 'over_image_corner', button_visibility: 'hover', icon: 'Plus' },
      label_style: 'soft',
      label_shape: 'square',
      label_position: 'top_left',
      text_align: 'left',
      price_position: 'beside_title',
      price_size: 'sm',
      show_compare_price: true,
      show_reviews: false,
      title_lines: 1,
      title_weight: 'normal',
      title_size: 'sm',
      show_category: false,
      card_subtitle: 'dimensions',
      card_radius: 0,
      card_padding: 0,
      image_ratio: '4:5',
      image_fit: 'cover',
      image_bg: '#E3E3DC',
      image_padding: 0,
      image_radius: 0,
      hover_image: 'second',
    },
    detalle: {
      producto: [
        ['product_gallery', 'default', { gallery_layout: 'scroll', thumbnails_position: 'none', page_layout: { columns: '2', show_breadcrumb: false } }],
        ['product_info', 'default'],
        ['product_description', 'default'],
        ['product_specs', 'panel'],
        ['product_actions', 'default', { buttons_layout: 'split', sticky_mobile: true }],
        ['product_benefits', 'default'],
        ['product_reviews', 'default'],
        RELACIONADOS_REJILLA,
      ],
      categoria: [
        ['category_header', 'default', ENCABEZADO_CATEGORIA],
        ['category_filters', 'default', { subcategory_style: 'tabs', show_view_toggle: false }],
        ['category_products', 'default', { columns: 4 }],
      ],
    },
  },
  {
    id: 'retail_marea',
    nombre: 'Marea',
    descripcion: 'Moda de playa, ropa urbana y colecciones por temporada, con bloques de color por colección.',
    subgiro: 'Moda por temporada',
    base: 'retail_bold',
    inicio: [
      ['hero', 'brand_giant', { brand_layer: 'behind_figure', cta_text: 'Ver la colección', cta_url: '@pagina:productos' }],
      ['categories_grid', 'grid', { category_style: 'card_bottom', shape: 'square', desktop_columns: 5, show_count: false, desktop_layout: 'grid', mobile_layout: 'carousel', category_card_color: 'per_item' }],
      // Un bloque por categoría real (hasta 5): `plantillaCompleta.ts` repite esta sección.
      ['image_text', 'color_block'],
      ['products_grid', 'grid', { columns: 4 }],
      ['gallery', 'carousel', { stagger: true }],
      ['image_text', 'image_left', { bg_type: 'color', bg_color: '#0E2433', text_color: '#EDE8E1' }],
      ['image_text', 'image_right'],
      ['hours_location', 'list'],
      ['newsletter', 'banner', { layout: 'inline_bar' }],
      ['faq', 'two_columns'],
    ],
    modo: 'light',
    fondo: '#EDE8E1',
    texto: '#0E0E0E',
    acento: '#1F3FD8',
    secundario: '#0E2433',
    acentoSecundario: '#DBC6A4',
    fuenteTitulos: 'Archivo',
    fuenteCuerpo: 'Archivo',
    radio: 0,
    estiloBoton: 'pastilla',
    movimiento: 'alto',
    claseFuentes: 'moderna',
    paginacion: { estilo: 'cargar_mas' },
    tarjetaProducto: {
      card_preset: 'minimal',
      card_layout: 'vertical',
      text_align: 'left',
      title_lines: 1,
      title_weight: 'medium',
      title_size: 'sm',
      price_position: 'beside_title',
      price_size: 'sm',
      show_compare_price: true,
      show_reviews: false,
      show_brand: false,
      show_category: false,
      image_ratio: '4:5',
      image_fit: 'contain',
      image_bg: '#E2DACD',
      image_padding: 0,
      image_radius: 0,
      hover_image: 'second',
      card_radius: 0,
      card_border_width: 0,
      card_shadow: 'none',
      card_padding: 0,
      add: { button_style: 'icon_only', button_shape: 'circle', button_size: 'sm', button_width: 'auto', button_position: 'over_image_corner', button_visibility: 'hover', icon: 'Plus' },
      label_shape: 'square',
      label_style: 'solid',
      label_position: 'top_left',
      label_shipping: { show: false },
    },
    detalle: {
      producto: [
        ['product_gallery', 'default', { gallery_layout: 'show_all', thumbnails_position: 'none' }],
        ['product_info', 'default'],
        ['product_description', 'default'],
        ['product_actions', 'default', { buttons_layout: 'stacked', sticky_mobile: true, show_price_in_button: true }],
        ['product_benefits', 'default'],
        ['product_reviews', 'default'],
        ['complete_the_look', 'default', { source: 'tag', limit: 4 }],
        RELACIONADOS_REJILLA,
      ],
      categoria: [
        ['category_header', 'default', ENCABEZADO_CATEGORIA],
        ['category_filters', 'default', { show_sort: true, show_view_toggle: true, subcategory_style: 'chips' }],
        ['category_products', 'default', { columns: 4 }],
      ],
    },
  },
  {
    id: 'retail_contraste',
    nombre: 'Contraste',
    descripcion: 'Muebles modernos, iluminación y diseño: blanco y negro con fotos cálidas y filtros laterales.',
    subgiro: 'Diseño y decoración',
    base: 'retail_bold',
    inicio: [
      ['hero', 'brand_giant', { brand_layer: 'over_photo', cta_text: 'Ver la colección', cta_url: '@pagina:productos' }],
      ['marquee', 'text'],
      ['categories_grid', 'horizontal', { category_style: 'card_bottom', shape: 'square', desktop_layout: 'carousel', mobile_layout: 'carousel', show_count: false }],
      ['image_text', 'editorial', { link_text: 'Ver la colección', link_url: '@pagina:productos' }],
      ['promo_banners', 'grid', { banner_layout: 'triple_center' }],
      ['products_grid', 'grid', { columns: 3 }],
      ['text_block', 'inline_icons'],
      ['stats', 'inline'],
      ['testimonials', 'carousel'],
      // «Nuestro blog»: sin tabla de blog (D1); banners manuales, oculta hasta que el dueño los ponga.
      ['promo_banners', 'grid', { title: 'Nuestro blog', banners: [] }],
      ['gallery', 'instagram_cta'],
    ],
    modo: 'light',
    fondo: '#FFFFFF',
    texto: '#161616',
    acento: '#161616',
    acentoSecundario: '#8C6A4F',
    fuenteTitulos: 'Syne',
    fuenteCuerpo: 'Inter',
    radio: 0,
    estiloBoton: 'solido',
    movimiento: 'medio',
    claseFuentes: 'moderna',
    tokens: { boton: { mayusculas: true } },
    tarjetaProducto: {
      card_preset: 'boxed',
      add: { button_style: 'icon_only', button_shape: 'circle', button_size: 'md', button_width: 'auto', button_position: 'over_image_corner', button_visibility: 'hover', icon: 'ShoppingBag' },
      label_shape: 'square',
      label_style: 'solid',
      label_position: 'top_left',
      label_shipping: { show: false },
      text_align: 'left',
      price_position: 'below_title',
      price_size: 'md',
      show_compare_price: true,
      show_reviews: false,
      title_lines: 1,
      title_weight: 'semibold',
      title_size: 'lg',
      title_font: 'heading',
      card_radius: 0,
      card_border_width: 1,
      card_shadow: 'none',
      card_padding: 20,
      image_ratio: '4:5',
      image_fit: 'contain',
      image_bg: '#F0F0F0',
      image_padding: 0,
      image_radius: 0,
      hover_image: 'zoom',
      card_grid_lines: true,
    },
    detalle: {
      producto: [
        ['product_gallery', 'default', { gallery_layout: 'show_all', thumbnails_position: 'none' }],
        ['product_info', 'default'],
        ['product_description', 'default'],
        ['product_actions', 'default', { buttons_layout: 'stacked' }],
        ['product_benefits', 'default'],
        ['product_reviews', 'default'],
        RELACIONADOS_REJILLA,
      ],
      // Filtros laterales seguidos de la rejilla: así el sitio arma las 2 columnas (W3).
      categoria: [
        ['category_header', 'default', { ...ENCABEZADO_CATEGORIA, show_image: true }],
        ['category_filters', 'sidebar_facets', { show_subcategories: true, show_sort: true }],
        ['category_products', 'default', { columns: 3 }],
        ['image_text', 'image_right'],
        ['features_grid', 'icons'],
      ],
    },
  },
  {
    id: 'retail_hogar',
    nombre: 'Hogar',
    descripcion: 'Muebles, decoración, colchones y menaje: muchas categorías, ofertas y compra el look.',
    subgiro: 'Hogar y decoración',
    base: 'retail_modern',
    inicio: [
      ['hero', 'split_products'],
      ['products_grid', 'grid'],
      ['image_text', 'image_left'],
      ['features_grid', 'icons'],
      ['promo_banners', 'carousel', { layout: 'carousel' }],
      ['promo_banners', 'grid', { banner_layout: 'triple_center' }],
      ['featured_products', 'carousel'],
      ['shop_the_look', 'hotspots'],
      ['categories_grid', 'grid', { category_style: 'card_bottom', shape: 'rounded', desktop_columns: 3, show_count: true, category_cta_icon: 'arrow_circle' }],
      ['testimonials', 'grid', { show_summary: true }],
      // Apagada y oculta hasta que el dueño escriba un cupón real (nunca uno de ejemplo).
      ['welcome_popup', 'coupon', { enabled: false }],
    ],
    // D5 (2026-11-10): primario #1C1A18 y acento #B4583A.
    modo: 'light',
    fondo: '#FFFFFF',
    texto: '#1C1A18',
    acento: '#1C1A18',
    acentoSecundario: '#B4583A',
    fuenteTitulos: 'Outfit',
    fuenteCuerpo: 'Outfit',
    radio: 12,
    estiloBoton: 'pastilla',
    movimiento: 'medio',
    claseFuentes: 'moderna',
    tokens: { hover: 'sutil' },
    carrusel: { indicador: 'barra' },
    paginacion: { estilo: 'cargar_mas' },
    tarjetaProducto: {
      card_preset: 'minimal',
      add: { button_style: 'solid', button_shape: 'pill', button_size: 'sm', button_width: 'full', button_position: 'over_image_bottom', button_visibility: 'hover', icon: 'ShoppingBag', icon_side: 'left' },
      label_shape: 'pill',
      label_style: 'soft',
      label_position: 'top_left',
      text_align: 'left',
      price_position: 'below_title',
      price_size: 'md',
      show_compare_price: true,
      show_reviews: false,
      title_lines: 1,
      title_weight: 'medium',
      title_size: 'md',
      show_category: true,
      card_radius: 0,
      card_padding: 0,
      image_ratio: '1:1',
      image_fit: 'contain',
      image_bg: '#F3F0EB',
      image_padding: 24,
      image_radius: 12,
      hover_image: 'second',
      wishlist_style: 'circle',
      wishlist_position: 'top_right',
      choose_label: 'Elige una opción',
    },
    detalle: {
      producto: [
        ['product_gallery', 'default', { gallery_layout: 'carousel', thumbnails_position: 'bottom' }],
        ['product_info', 'default'],
        ['product_description', 'default'],
        ['product_actions', 'default', { buttons_layout: 'stacked', button_hint: 'auto' }],
        ['product_benefits', 'default'],
        ['product_specs', 'panel'],
        RELACIONADOS_REJILLA,
        ['product_pager', 'default'],
      ],
      categoria: [
        ['category_header', 'default', { layout: 'split_text', show_image: false, show_breadcrumb: false, show_count: true }],
        ['category_filters', 'default', { subcategory_style: 'chips', search: true, show_view_toggle: false }],
        ['category_products', 'default', { columns: 4 }],
      ],
    },
  },
];

// ─── Estructura de Inicio de las plantillas del sitio (copia de goadmin-websites) ──────────

/** `lib/templates/presets.ts` de goadmin-websites, página `home` (verificado 2026-10-06). */
export const SECCIONES_INICIO_BASE: Readonly<Record<string, readonly SeccionPlantilla[]>> = {
  retail_modern: [['hero', 'slider'], ['categories_grid', 'horizontal'], ['featured_products', 'grid'], ['offers', 'grid'], ['products_grid', 'grid'], ['testimonials', 'carousel'], ['newsletter', 'simple'], ['brands', 'logos']],
  retail_classic: [['hero', 'fullscreen'], ['categories_grid', 'grid'], ['featured_products', 'hero_product'], ['offers', 'grid'], ['image_text', 'image_right'], ['products_grid', 'list'], ['testimonials', 'quotes'], ['newsletter', 'with_image']],
  retail_bold: [['hero', 'slider'], ['categories_grid', 'icons'], ['featured_products', 'hero_product'], ['offers', 'grid'], ['products_grid', 'carousel'], ['cta', 'with_image'], ['testimonials', 'grid'], ['brands', 'logos'], ['newsletter', 'banner']],
  retail_elegant: [['hero', 'video'], ['text_block', 'centered'], ['featured_products', 'hero_product'], ['offers', 'grid'], ['image_text', 'image_left'], ['products_grid', 'grid'], ['testimonials', 'minimal'], ['newsletter', 'simple']],
  hotel_luxury: [['hero', 'fullscreen'], ['text_block', 'centered'], ['room_types', 'cards'], ['amenities', 'grid'], ['gallery', 'carousel'], ['testimonials', 'carousel'], ['booking_cta', 'banner'], ['newsletter', 'with_image']],
  hotel_boutique: [['hero', 'slider'], ['text_block', 'centered'], ['room_types', 'cards'], ['image_text', 'image_right'], ['gallery', 'fullscreen'], ['testimonials', 'quotes'], ['booking_cta', 'banner']],
  hotel_minimal: [['hero', 'split'], ['room_types', 'cards'], ['amenities', 'icons'], ['gallery', 'grid'], ['booking_cta', 'banner']],
  hotel_resort: [['hero', 'video'], ['booking_cta', 'banner'], ['room_types', 'cards'], ['amenities', 'grid'], ['gallery', 'carousel'], ['testimonials', 'grid'], ['stats', 'cards'], ['newsletter', 'with_image']],
  gym_power: [['hero', 'video'], ['membership_plans', 'pricing_table'], ['gym_features', 'icons'], ['class_schedule', 'grid'], ['trainers', 'grid'], ['transformation', 'before_after'], ['testimonials', 'carousel'], ['cta', 'with_image'], ['gallery', 'grid']],
  gym_wellness: [['hero', 'split'], ['text_block', 'centered'], ['class_schedule', 'grid'], ['trainers', 'grid'], ['gallery', 'masonry'], ['testimonials', 'quotes'], ['membership_plans', 'pricing_table'], ['newsletter', 'simple']],
  gym_urban: [['hero', 'fullscreen'], ['gym_features', 'icons'], ['membership_plans', 'pricing_table'], ['transformation', 'before_after'], ['class_schedule', 'grid'], ['gallery', 'grid'], ['testimonials', 'grid'], ['cta', 'banner']],
  gym_premium: [['hero', 'video'], ['text_block', 'centered'], ['membership_plans', 'pricing_table'], ['trainers', 'grid'], ['gallery', 'fullscreen'], ['testimonials', 'minimal'], ['stats', 'inline'], ['cta', 'with_image']],
  transport_corporate: [['hero', 'split'], ['trip_search', 'form'], ['routes', 'cards'], ['stats', 'counters'], ['fleet_showcase', 'grid'], ['why_choose_us', 'icons'], ['testimonials', 'carousel'], ['partners', 'logos'], ['cta', 'banner'], ['contact_form', 'split']],
  transport_dynamic: [['hero', 'fullscreen'], ['trip_search', 'form'], ['stats', 'inline'], ['routes', 'cards'], ['fleet_showcase', 'grid'], ['testimonials', 'grid'], ['cta', 'with_image']],
  transport_classic: [['hero', 'slider'], ['routes', 'cards'], ['fleet_showcase', 'grid'], ['stats', 'counters'], ['testimonials', 'quotes'], ['partners', 'logos'], ['map', 'full_width']],
  transport_eco: [['hero', 'split'], ['stats', 'cards'], ['routes', 'cards'], ['image_text', 'image_right'], ['fleet_showcase', 'grid'], ['testimonials', 'minimal'], ['newsletter', 'simple']],
  parking_modern: [['hero', 'split'], ['parking_zones', 'grid'], ['parking_pricing', 'cards'], ['parking_features', 'icons'], ['stats', 'counters'], ['testimonials', 'carousel'], ['faq', 'accordion'], ['map', 'full_width']],
  parking_tech: [['hero', 'fullscreen'], ['parking_features', 'icons'], ['parking_zones', 'grid'], ['stats', 'inline'], ['parking_pricing', 'cards'], ['testimonials', 'minimal'], ['faq', 'two_columns']],
  parking_urban: [['hero', 'split'], ['parking_zones', 'grid'], ['parking_pricing', 'cards'], ['stats', 'cards'], ['testimonials', 'grid'], ['map', 'with_directions']],
  parking_premium: [['hero', 'video'], ['parking_features', 'icons'], ['parking_zones', 'grid'], ['parking_pricing', 'cards'], ['testimonials', 'quotes'], ['stats', 'counters'], ['cta', 'with_image']],
  services_modern: [['hero', 'split'], ['partners', 'logos'], ['features_grid', 'alternating'], ['stats', 'counters'], ['how_it_works', 'steps'], ['pricing_table', 'three_columns'], ['testimonials', 'carousel'], ['integrations', 'logos'], ['faq', 'accordion'], ['demo_cta', 'form']],
  services_corporate: [['hero', 'split'], ['partners', 'logos'], ['features_grid', 'alternating'], ['stats', 'cards'], ['testimonials', 'grid'], ['pricing_table', 'three_columns'], ['faq', 'accordion'], ['demo_cta', 'form']],
  services_creative: [['hero', 'fullscreen'], ['how_it_works', 'steps'], ['features_grid', 'alternating'], ['testimonials', 'quotes'], ['pricing_table', 'three_columns'], ['partners', 'carousel'], ['cta', 'with_image']],
  services_minimal: [['hero', 'minimal'], ['features_grid', 'alternating'], ['image_text', 'image_right'], ['pricing_table', 'three_columns'], ['testimonials', 'minimal'], ['demo_cta', 'form']],
};

// ─── Plantillas del sitio → catálogo ───────────────────────────────────────────────────────

/** Lo que el catálogo lee de una plantilla del sitio (`TemplatePresetInfo` de websiteSettingsService). */
export interface PlantillaBaseSitio {
  id: string;
  name: string;
  description: string;
  business_type: string;
  is_default: boolean;
  theme_mode: 'light' | 'dark';
  colors: { primary: string; secondary: string };
  fonts: { heading: string; body: string };
}

/** Familias con serifa del catálogo (para la descripción del par tipográfico). */
const CON_SERIFA = new Set([
  'Playfair Display', 'Merriweather', 'Cormorant', 'Cormorant Garamond', 'Lora', 'Libre Caslon Text',
  'DM Serif Display', 'Fraunces', 'Instrument Serif',
]);

/** ¿La familia es con serifa? (respaldo CSS `serif` o `sans-serif` en las muestras). */
export function tieneSerifa(familia: string): boolean {
  return CON_SERIFA.has(familia);
}

/** Tipo de letra de los títulos (`serifa` o no): la clase del par en las plantillas del sitio. */
export function claseDeFuentes(titulos: string, cuerpo: string): ClaseFuentes {
  if (CON_SERIFA.has(titulos)) return 'clasica';
  return titulos === cuerpo ? 'neutra' : 'moderna';
}

/** Blanco y casi negro para el modo de las plantillas del sitio (como las pinta el sitio público). */
const FONDO_CLARO = '#FFFFFF';
const TEXTO_OSCURO_SOBRE_FONDO = '#FFFFFF';
/** Texto por defecto de las plantillas claras cuando el secundario del preset no se lee sobre blanco. */
const TEXTO_CLARO_POR_DEFECTO = '#1A1A1A';

/**
 * Texto de una plantilla clara: el secundario del preset solo si se lee sobre el fondo (AA). Varios
 * presets traen como secundario un color de fondo o de acento (#F7FAFC, #FFFFFF, #FF7043…) y el
 * texto quedaba casi blanco sobre blanco o naranja.
 */
export function textoPlantillaClara(secundario: string, fondo: string = FONDO_CLARO): string {
  const razon = contraste(secundario, fondo);
  return razon !== null && razon >= CONTRASTE_AA ? secundario.toUpperCase() : TEXTO_CLARO_POR_DEFECTO;
}

function plantillaDesdeBase(p: PlantillaBaseSitio): PlantillaCatalogo | null {
  const giro = GIRO_DE_NEGOCIO[p.business_type];
  const inicio = SECCIONES_INICIO_BASE[p.id];
  if (!giro || giro === 'restaurante' || !inicio) return null;
  const oscuro = p.theme_mode === 'dark';
  return {
    id: p.id,
    nombre: p.name,
    descripcion: p.description,
    giro,
    subgiro: null,
    base: p.id,
    inicio,
    porDefecto: p.is_default,
    estilo: {
      id: p.id,
      nombre: p.name,
      giro,
      modo: p.theme_mode,
      fondo: oscuro ? p.colors.secondary.toUpperCase() : FONDO_CLARO,
      texto: oscuro ? TEXTO_OSCURO_SOBRE_FONDO : textoPlantillaClara(p.colors.secondary),
      acento: p.colors.primary.toUpperCase(),
      fuenteTitulos: p.fonts.heading,
      fuenteCuerpo: p.fonts.body,
      radio: 4,
      estiloBoton: 'solido',
      movimiento: 'bajo',
      claseFuentes: claseDeFuentes(p.fonts.heading, p.fonts.body),
    },
  };
}

function plantillaRestaurante(d: DefinicionRestaurante, indice: number): PlantillaCatalogo {
  return {
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion,
    giro: 'restaurante',
    subgiro: d.subgiro,
    base: d.base,
    inicio: d.inicio,
    porDefecto: indice === 0,
    estilo: {
      id: d.id,
      nombre: d.nombre,
      giro: 'restaurante',
      modo: d.modo,
      fondo: d.fondo,
      texto: d.texto,
      acento: d.acento,
      fuenteTitulos: d.fuenteTitulos,
      fuenteCuerpo: d.fuenteCuerpo,
      radio: d.radio,
      estiloBoton: d.estiloBoton,
      movimiento: d.movimiento,
      claseFuentes: d.claseFuentes,
    },
  };
}

function plantillaTienda(d: DefinicionTienda): PlantillaCatalogo {
  return {
    id: d.id,
    nombre: d.nombre,
    descripcion: d.descripcion,
    giro: 'tienda',
    subgiro: d.subgiro,
    base: d.base,
    inicio: d.inicio,
    // La de por defecto del giro sigue siendo la del sitio (`retail_modern`).
    porDefecto: false,
    estilo: {
      id: d.id,
      nombre: d.nombre,
      giro: 'tienda',
      modo: d.modo,
      fondo: d.fondo,
      texto: d.texto,
      acento: d.acento,
      fuenteTitulos: d.fuenteTitulos,
      fuenteCuerpo: d.fuenteCuerpo,
      radio: d.radio,
      estiloBoton: d.estiloBoton,
      movimiento: d.movimiento,
      claseFuentes: d.claseFuentes,
      ...(d.secundario ? { secundario: d.secundario } : {}),
      ...(d.acentoSecundario ? { acentoSecundario: d.acentoSecundario } : {}),
    },
    tarjetaProducto: d.tarjetaProducto,
    ...(d.tokens ? { tokens: d.tokens } : {}),
    ...(d.carrusel ? { carrusel: d.carrusel } : {}),
    ...(d.paginacion ? { paginacion: d.paginacion } : {}),
    detalle: d.detalle,
  };
}

/**
 * Catálogo completo: las 9 de restaurante, las 7 de tienda nuevas y las plantillas del sitio de
 * los demás giros (en la pestaña «Tienda», `retail_modern` sigue primero por ser la de por defecto).
 */
export function construirCatalogo(bases: readonly PlantillaBaseSitio[]): CatalogoPlantillas {
  const otras = bases.map(plantillaDesdeBase).filter((p): p is PlantillaCatalogo => p !== null);
  return {
    version: VERSION_CATALOGO_PLANTILLAS,
    plantillas: [...RESTAURANTE.map(plantillaRestaurante), ...TIENDA.map(plantillaTienda), ...otras],
  };
}

// ─── Consultas ─────────────────────────────────────────────────────────────────────────────

/** Las del giro, la de por defecto primero; `'todas'` no filtra. */
export function plantillasDelGiro(catalogo: CatalogoPlantillas, giro: GiroCatalogo | 'todas'): PlantillaCatalogo[] {
  if (giro === 'todas') return [...catalogo.plantillas];
  return catalogo.plantillas.filter((p) => p.giro === giro).sort((a, b) => Number(b.porDefecto) - Number(a.porDefecto));
}

/** Contador de cada pestaña de A/06b (sale del catálogo, no de la captura). */
export function contarPorGiro(catalogo: CatalogoPlantillas): Record<GiroCatalogo | 'todas', number> {
  const cuenta = { todas: catalogo.plantillas.length } as Record<GiroCatalogo | 'todas', number>;
  GIROS_CATALOGO.forEach((g) => {
    cuenta[g] = catalogo.plantillas.filter((p) => p.giro === g).length;
  });
  return cuenta;
}

export function plantillaPorId(catalogo: CatalogoPlantillas, id: string | null | undefined): PlantillaCatalogo | null {
  return id ? catalogo.plantillas.find((p) => p.id === id) ?? null : null;
}

/** Presets de estilo del giro (los de sus plantillas). Sin giro: los de todas. */
export function estilosDelGiro(catalogo: CatalogoPlantillas, giro: GiroCatalogo | null): EstiloCatalogo[] {
  return plantillasDelGiro(catalogo, giro ?? 'todas').map((p) => p.estilo);
}

export function estiloPorId(catalogo: CatalogoPlantillas, id: string | null | undefined): EstiloCatalogo | null {
  return plantillaPorId(catalogo, id)?.estilo ?? null;
}

/**
 * Plantilla en uso del borrador («En uso», A/06b):
 * 1. el preset guardado (`tema.preset`), si es una plantilla;
 * 2. `tema.plantillaBase` igual al id de una plantilla (las de los demás giros);
 * 3. entre las que comparten esa base, la que usa la misma fuente de títulos;
 *    si solo una comparte la base, esa.
 * Sin coincidencia clara: `null` (sin insignia; mejor que una falsa).
 */
export function plantillaEnUso(
  catalogo: CatalogoPlantillas,
  tema: { preset?: string | null; plantillaBase?: string | null; fuenteTitulos?: string | null },
): PlantillaCatalogo | null {
  const porPreset = plantillaPorId(catalogo, tema.preset);
  if (porPreset) return porPreset;
  if (!tema.plantillaBase) return null;
  const exacta = plantillaPorId(catalogo, tema.plantillaBase);
  if (exacta && exacta.base === tema.plantillaBase) return exacta;
  const conBase = catalogo.plantillas.filter((p) => p.base === tema.plantillaBase);
  if (conBase.length === 1) return conBase[0];
  return conBase.find((p) => p.estilo.fuenteTitulos === tema.fuenteTitulos) ?? null;
}

/**
 * Preset elegido en Diseño: el guardado; si no, el que tiene el mismo fondo,
 * acento y fuente de títulos; si no, el estilo de la plantilla en uso cuando
 * coincide la fuente de títulos.
 */
export function estiloEnUso(
  estilos: readonly EstiloCatalogo[],
  estilo: Pick<TokensEstilo, 'fondo' | 'acento' | 'fuenteTitulos'> & { preset: string | null },
  enUso: PlantillaCatalogo | null,
): EstiloCatalogo | null {
  const guardado = estilo.preset ? estilos.find((e) => e.id === estilo.preset) : undefined;
  if (guardado) return guardado;
  const igual = estilos.find(
    (e) => e.fondo === estilo.fondo && e.acento === estilo.acento && e.fuenteTitulos === estilo.fuenteTitulos,
  );
  if (igual) return igual;
  return enUso && enUso.estilo.fuenteTitulos === estilo.fuenteTitulos ? enUso.estilo : null;
}

/** Pares tipográficos distintos de una lista de estilos (Tipografía de A/06a), en orden. */
export function paresTipograficos(estilos: readonly EstiloCatalogo[]): { titulos: string; cuerpo: string; clase: ClaseFuentes }[] {
  const vistos = new Set<string>();
  const pares: { titulos: string; cuerpo: string; clase: ClaseFuentes }[] = [];
  estilos.forEach((e) => {
    const clave = `${e.fuenteTitulos}|${e.fuenteCuerpo}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    pares.push({ titulos: e.fuenteTitulos, cuerpo: e.fuenteCuerpo, clase: e.claseFuentes });
  });
  return pares;
}
