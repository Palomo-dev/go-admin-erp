'use client';

import { supabase } from '@/lib/supabase/config';
import {
  STYLE_FIELDS,
  SPACING_FIELDS,
  GRID_FIELDS,
  CAROUSEL_FIELDS,
  CARD_FIELDS,
  CATEGORY_CARD_FIELDS,
  BUTTON_ITEM_FIELDS,
  PRODUCT_CARD_INTERACTION_FIELDS,
} from '@/lib/services/website/sectionFieldGroups';

// ============================================================
// INTERFACES
// ============================================================

export interface WebsitePage {
  id: string;
  organization_id: number;
  slug: string;
  title: string;
  description: string | null;
  page_type: string;
  show_in_header: boolean;
  show_in_footer: boolean;
  header_order: number;
  footer_order: number;
  is_published: boolean;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  created_at: string;
  updated_at: string;
  // Jerarquía y mega-menú (Fase 0 - migración header_configurable_mega_menu)
  parent_page_id: string | null;
  linked_category_id: number | null;
  menu_icon: string | null;
  menu_badge: string | null;
  // F9.3 — Ajustes de layout a nivel de página (columns, gallery_width, sticky_column)
  page_settings?: Record<string, any> | null;
  // FASE 12 — borradores y versionado
  draft_content?: { sections: WebsitePageSection[] } | null;
  has_unpublished_changes?: boolean;
  published_at?: string | null;
}

/** Versión publicada de una página (FASE 12). */
export interface WebsitePageVersion {
  id: string;
  page_id: string;
  organization_id: number;
  content_snapshot: { sections: WebsitePageSection[] };
  created_by: string | null;
  created_at: string;
  note: string | null;
}

/** Plantilla de sección guardada por el usuario (FASE 12). */
export interface WebsiteSectionPreset {
  id: string;
  organization_id: number;
  name: string;
  section_type: string;
  section_variant: string;
  content: Record<string, any>;
  created_by: string | null;
  created_at: string;
}

/** Página con hijos anidados (árbol de menú) */
export interface WebsitePageWithChildren extends WebsitePage {
  children: WebsitePageWithChildren[];
  level: number;
}

export interface WebsitePageSection {
  id: string;
  page_id: string;
  organization_id: number;
  section_type: string;
  section_variant: string;
  content: Record<string, any>;
  settings: Record<string, any>;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebsitePageWithSections extends WebsitePage {
  sections: WebsitePageSection[];
}

// ============================================================
// CATÁLOGO DE SECCIÓN TYPES + VARIANTS
// ============================================================

export interface SectionTypeDefinition {
  type: string;
  label: string;
  icon: string;
  description: string;
  variants: { id: string; label: string }[];
  contentFields: ContentFieldDef[];
}

/**
 * Grupo lógico al que pertenece un campo dentro del editor de secciones.
 * El editor agrupa los campos por este valor en paneles/acordeones.
 */
export type FieldGroup =
  | 'content'
  | 'data'
  | 'layout'
  | 'style'
  | 'carousel'
  | 'behavior'
  | 'advanced';

/**
 * Condición para mostrar/ocultar un campo dinámicamente dentro del editor.
 * - `field`: clave de otro campo del mismo contenido (o de la sección).
 * - `equals`: el campo referenciado debe ser exactamente igual a este valor.
 * - `in`: el campo referenciado debe estar dentro de esta lista de valores.
 * - `variantIn`: el campo solo se muestra si la variante de la sección está en esta lista.
 */
export interface FieldCondition {
  field?: string;
  equals?: unknown;
  in?: unknown[];
  variantIn?: string[];
}

export interface ContentFieldDef {
  key: string;
  label: string;
  type:
    | 'text'
    | 'textarea'
    | 'richtext'
    | 'url'
    | 'image'
    | 'color'
    | 'number'
    | 'boolean'
    | 'select'
    | 'range'
    | 'icon'
    | 'repeater'
    | 'entity'
    | 'spacing'
    | 'alignment';
  placeholder?: string;
  /** Texto de ayuda que explica para qué sirve el campo. */
  helpText?: string;
  /** Grupo lógico del editor (default: 'content'). */
  group?: FieldGroup;
  /** Condición para mostrar el campo. */
  showIf?: FieldCondition;
  options?: { value: string; label: string }[];
  /** Valor por defecto (escalar o, si `responsive: true`, `{ desktop, tablet, mobile }`). */
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  /**
   * Si es `true`, el valor se guarda como `{ desktop, tablet, mobile }` en vez
   * de un escalar. Los valores escalares antiguos se siguen aceptando
   * (retrocompatibilidad). El sitio lo resuelve con `resolveResponsive()` (0.5).
   */
  responsive?: boolean;
  // ---- type='repeater' ----
  /** Campos que definen cada item del repeater. */
  itemFields?: ContentFieldDef[];
  /** Clave del itemField cuyo valor se muestra en la fila colapsada. */
  itemLabelKey?: string;
  /** Cantidad máxima de items permitidos. */
  maxItems?: number;
  /** Items por defecto que se muestran cuando el repeater está vacío. */
  defaultItems?: Record<string, unknown>[];
  // ---- type='entity' ----
  /** Tipo de entidad seleccionable. */
  entity?: 'category' | 'product' | 'branch' | 'page' | 'table_zone';
  /** Si es `true`, permite seleccionar varias entidades. */
  multiple?: boolean;
}

/**
 * Catálogo "crudo" de definiciones de secciones.
 * Los campos de estilo (STYLE_FIELDS) se inyectan automáticamente al
 * construir `SECTION_CATALOG`, por lo que NO deben duplicarse aquí.
 * Ver `sectionFieldGroups.ts` (F0.2).
 */
const RAW_CATALOG: SectionTypeDefinition[] = [
  {
    type: 'hero',
    label: 'Hero / Banner',
    icon: 'Image',
    description: 'Sección principal con imagen o video de fondo',
    variants: [
      { id: 'fullscreen', label: 'Pantalla completa' },
      { id: 'minimal', label: 'Minimal' },
      { id: 'slider', label: 'Slider' },
      { id: 'split', label: 'Dividido' },
      { id: 'video', label: 'Video' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Título principal' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea', placeholder: 'Descripción breve' },
      { key: 'image_url', label: 'Imagen escritorio', type: 'image' },
      { key: 'image_url_mobile', label: 'Imagen móvil', type: 'image' },
      { key: 'video_url', label: 'URL de video', type: 'url', placeholder: 'https://...', showIf: { variantIn: ['video'] } },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar Ahora' },
      { key: 'cta_url', label: 'URL del botón', type: 'url', placeholder: '/reservas' },
      { key: 'show_overlay', label: 'Mostrar overlay oscuro', type: 'boolean', defaultValue: true },
      { key: 'show_title', label: 'Mostrar título', type: 'boolean', defaultValue: true },
      { key: 'show_cta', label: 'Mostrar botón', type: 'boolean', defaultValue: true },
      { key: 'full_width', label: 'Ancho completo', type: 'boolean', defaultValue: true },
      { key: 'border_radius', label: 'Bordes redondeados (px)', type: 'range', min: 0, max: 50, step: 1, defaultValue: 0, suffix: 'px' },
      { key: 'shadow_intensity', label: 'Intensidad de sombra', type: 'range', min: 0, max: 50, step: 1, defaultValue: 0, suffix: '' },
      // F3.1 — Altura configurable (grupo Diseño)
      {
        key: 'height',
        label: 'Altura del hero',
        type: 'select',
        group: 'layout',
        defaultValue: 'auto',
        helpText: 'Controla la altura del hero. "auto" mantiene el comportamiento actual.',
        options: [
          { value: '50vh', label: '50 vh (media pantalla)' },
          { value: '70vh', label: '70 vh (pantalla grande)' },
          { value: '100vh', label: '100 vh (pantalla completa)' },
          { value: 'auto', label: 'Automática (según contenido)' },
          { value: 'custom', label: 'Personalizada' },
        ],
      },
      {
        key: 'custom_height',
        label: 'Altura personalizada',
        type: 'number',
        group: 'layout',
        min: 100,
        max: 2000,
        step: 10,
        suffix: 'px',
        showIf: { field: 'height', equals: 'custom' },
        helpText: 'Altura fija en píxeles',
      },
      // F3.1 — Overlay avanzado
      {
        key: 'overlay_opacity',
        label: 'Opacidad del overlay',
        type: 'range',
        group: 'style',
        min: 0,
        max: 100,
        step: 5,
        defaultValue: 70,
        suffix: '%',
        showIf: { field: 'show_overlay', equals: true },
        helpText: '0 = transparente, 100 = opaco. Por defecto 70%.',
      },
      {
        key: 'overlay_color',
        label: 'Color del overlay',
        type: 'color',
        group: 'style',
        showIf: { field: 'show_overlay', equals: true },
        helpText: 'Color del overlay sobre la imagen. Vacío = color primario.',
      },
      // F3.1 — Posición y alineación del contenido
      {
        key: 'content_position',
        label: 'Posición del contenido',
        type: 'alignment',
        group: 'layout',
        defaultValue: 'middle-center',
        helpText: 'Posición del bloque de texto dentro del hero',
      },
      {
        key: 'text_align',
        label: 'Alineación del texto',
        type: 'select',
        group: 'layout',
        defaultValue: 'center',
        options: [
          { value: 'left', label: 'Izquierda' },
          { value: 'center', label: 'Centro' },
          { value: 'right', label: 'Derecha' },
        ],
      },
      // F3.1 — Botones múltiples (repeater). Compatible con cta_text/cta_url heredados.
      {
        key: 'buttons',
        label: 'Botones',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        maxItems: 4,
        helpText: 'Botones múltiples. Si está vacío, se usa el botón único de arriba.',
        itemFields: BUTTON_ITEM_FIELDS,
      },
      // F3.1 — Solape con el header (F1: ya lo lee el componente, ahora se declara)
      {
        key: 'overlap_header',
        label: 'Solapar con el header',
        type: 'boolean',
        group: 'layout',
        defaultValue: true,
        helpText: 'El hero sube debajo del header transparente',
      },
      // Booking widget (reemplaza hero booking switch ad-hoc)
      { key: 'show_booking_widget', label: 'Widget de reserva', type: 'boolean', group: 'behavior', defaultValue: false, helpText: 'Muestra un formulario de reserva sobre el hero' },
      // Slides (reemplaza HeroSlidesEditor ad-hoc, solo variante slider)
      {
        key: 'slides',
        label: 'Slides',
        type: 'repeater',
        group: 'content',
        showIf: { variantIn: ['slider'] },
        itemLabelKey: 'title',
        itemFields: [
          { key: 'title', label: 'Título', type: 'text', placeholder: 'Título del slide' },
          { key: 'subtitle', label: 'Subtítulo', type: 'textarea', placeholder: 'Descripción del slide' },
          { key: 'image_url', label: 'Imagen escritorio', type: 'image' },
          { key: 'image_url_mobile', label: 'Imagen móvil', type: 'image' },
          { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Ver más' },
          { key: 'cta_url', label: 'URL del botón', type: 'url', placeholder: '/productos' },
        ],
      },
      // F3.1 — CAROUSEL_FIELDS solo para la variante slider
      ...CAROUSEL_FIELDS.map((f) => ({ ...f, showIf: { ...f.showIf, variantIn: ['slider'] } })),
    ],
  },
  {
    type: 'room_types',
    label: 'Habitaciones / Espacios',
    icon: 'BedDouble',
    description: 'Muestra los tipos de espacios disponibles',
    variants: [
      { id: 'cards', label: 'Tarjetas' },
      { id: 'detailed', label: 'Detallado' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestras Habitaciones' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'room_type_ids',
        label: 'Tipos de habitación',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todos los tipos',
      },
      { key: 'max_items', label: 'Cantidad a mostrar', type: 'number', placeholder: '6', group: 'data' },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
    ],
  },
  {
    type: 'amenities',
    label: 'Amenidades / Servicios',
    icon: 'Sparkles',
    description: 'Lista de amenidades o servicios',
    variants: [
      { id: 'icons', label: 'Iconos' },
      { id: 'grid', label: 'Grid' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Servicios' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Amenidades',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'icon', label: 'Icono', type: 'icon' },
          { key: 'title', label: 'Nombre', type: 'text', placeholder: 'WiFi gratis' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'gallery',
    label: 'Galería',
    icon: 'Images',
    description: 'Galería de imágenes',
    variants: [
      { id: 'masonry', label: 'Masonry' },
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'fullscreen', label: 'Pantalla completa' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Galería' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      // Reemplaza GalleryItemsEditor ad-hoc. Clave canónica `images` (P4/F2.5):
      // el sitio lee `content.images ?? content.items` para retrocompatibilidad.
      {
        key: 'images',
        label: 'Imágenes',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'alt',
        itemFields: [
          { key: 'url', label: 'Imagen', type: 'image' },
          { key: 'alt', label: 'Texto alternativo', type: 'text' },
          { key: 'caption', label: 'Descripción', type: 'text' },
          { key: 'link', label: 'Enlace (opcional)', type: 'url', placeholder: 'https://...' },
        ],
      },
      { key: 'lightbox', label: 'Lightbox al hacer clic', type: 'boolean', group: 'behavior', defaultValue: true },
      ...GRID_FIELDS,
      // CAROUSEL_FIELDS aplica sobre todo a la variante carousel
      ...CAROUSEL_FIELDS,
    ],
  },
  {
    type: 'testimonials',
    label: 'Testimonios',
    icon: 'MessageSquareQuote',
    description: 'Opiniones de clientes',
    variants: [
      { id: 'carousel', label: 'Carrusel' },
      { id: 'grid', label: 'Grid' },
      { id: 'quotes', label: 'Citas' },
      { id: 'minimal', label: 'Minimal' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Lo que dicen nuestros clientes' },
      // FASE 6 — Fuente de datos
      {
        key: 'data_source',
        label: 'Origen de los testimonios',
        type: 'select',
        group: 'data',
        defaultValue: 'manual',
        helpText: 'manual: testimonios escritos abajo · database: tabla testimonials · featured: solo destacados',
        options: [
          { value: 'manual', label: 'Manual (JSON)' },
          { value: 'database', label: 'Base de datos' },
          { value: 'featured', label: 'Destacados (BD)' },
        ],
      },
      {
        key: 'max_items',
        label: 'Cantidad a mostrar',
        type: 'number',
        group: 'data',
        placeholder: '6',
        helpText: 'Vacío = mostrar todos',
      },
      {
        key: 'randomize_order',
        label: 'Orden aleatorio',
        type: 'boolean',
        group: 'data',
        defaultValue: false,
        helpText: 'Mezcla los testimonios en cada carga de página',
      },
      // Reemplaza TestimonialItemsEditor ad-hoc (solo relevante con data_source = manual)
      {
        key: 'items',
        label: 'Testimonios',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        showIf: { field: 'data_source', in: ['manual', undefined] },
        defaultItems: [
          {
            name: 'María González',
            role: 'Cliente verificada',
            content: 'Excelente producto y servicio. Llegó antes de lo esperado y la calidad superó mis expectativas.',
            rating: 5,
          },
          {
            name: 'Carlos Pérez',
            role: 'Cliente verificado',
            content: 'Muy buena experiencia de compra. Definitivamente volveré a comprar aquí.',
            rating: 5,
          },
          {
            name: 'Ana Martínez',
            role: 'Cliente verificada',
            content: 'Los productos son de excelente calidad y el envío fue rapidísimo.',
            rating: 4,
          },
        ],
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Nombre del cliente' },
          // F2.2: clave canónica `role` (el sitio lee item.role ?? item.company)
          { key: 'role', label: 'Cargo / Empresa', type: 'text', placeholder: 'Cargo o empresa (opcional)' },
          { key: 'content', label: 'Testimonio', type: 'textarea', placeholder: 'Opinión del cliente' },
          { key: 'rating', label: 'Valoración', type: 'range', min: 1, max: 5, step: 1, defaultValue: 5 },
          { key: 'avatar_url', label: 'Foto (opcional)', type: 'image' },
        ],
      },
      // FASE 6 — Composición de la tarjeta
      {
        key: 'avatar_position',
        label: 'Posición del avatar',
        type: 'select',
        group: 'layout',
        defaultValue: 'left',
        options: [
          { value: 'top', label: 'Arriba' },
          { value: 'left', label: 'Izquierda' },
          { value: 'right', label: 'Derecha' },
          { value: 'bottom', label: 'Abajo' },
          { value: 'none', label: 'Sin avatar' },
        ],
      },
      {
        key: 'avatar_shape',
        label: 'Forma del avatar',
        type: 'select',
        group: 'style',
        defaultValue: 'circle',
        options: [
          { value: 'circle', label: 'Círculo' },
          { value: 'square', label: 'Cuadrado' },
          { value: 'rounded', label: 'Redondeado' },
        ],
      },
      {
        key: 'avatar_size',
        label: 'Tamaño del avatar',
        type: 'range',
        group: 'layout',
        min: 24,
        max: 96,
        step: 4,
        defaultValue: 40,
        suffix: 'px',
      },
      {
        key: 'avatar_fallback',
        label: 'Avatar por defecto',
        type: 'select',
        group: 'style',
        defaultValue: 'initial',
        helpText: 'Qué mostrar cuando no hay foto',
        options: [
          { value: 'initial', label: 'Inicial del nombre' },
          { value: 'icon', label: 'Icono de usuario' },
        ],
      },
      // FASE 6 — Comillas
      {
        key: 'quote_marks',
        label: 'Comillas',
        type: 'select',
        group: 'style',
        defaultValue: 'none',
        options: [
          { value: 'none', label: 'Ninguna' },
          { value: 'before', label: 'Antes del texto' },
          { value: 'around', label: 'Rodeando el texto' },
          { value: 'background', label: 'De fondo (decorativa)' },
        ],
      },
      { key: 'quote_mark_color', label: 'Color de comillas', type: 'color', group: 'style', showIf: { field: 'quote_marks', in: ['before', 'around', 'background'] } },
      {
        key: 'quote_mark_size',
        label: 'Tamaño de comillas',
        type: 'range',
        group: 'style',
        min: 16,
        max: 96,
        step: 4,
        defaultValue: 48,
        suffix: 'px',
        showIf: { field: 'quote_marks', in: ['before', 'around', 'background'] } },
      // FASE 6 — Texto
      // text_align viene inyectado por CARD_FIELDS (mismo key/valor por defecto).
      {
        key: 'text_size',
        label: 'Tamaño del texto',
        type: 'select',
        group: 'style',
        defaultValue: 'md',
        options: [
          { value: 'xs', label: 'Muy pequeño' },
          { value: 'sm', label: 'Pequeño' },
          { value: 'md', label: 'Mediano' },
          { value: 'lg', label: 'Grande' },
          { value: 'xl', label: 'Muy grande' },
          { value: '2xl', label: 'Extra grande' },
        ],
      },
      {
        key: 'text_max_lines',
        label: 'Líneas máximas (con "leer más")',
        type: 'number',
        group: 'layout',
        min: 0,
        max: 10,
        helpText: '0 = sin límite',
      },
      // FASE 6 — Valoración
      { key: 'show_rating', label: 'Mostrar valoración', type: 'boolean', group: 'behavior', defaultValue: true },
      {
        key: 'rating_style',
        label: 'Estilo de valoración',
        type: 'select',
        group: 'style',
        defaultValue: 'stars',
        showIf: { field: 'show_rating', equals: true },
        options: [
          { value: 'stars', label: 'Estrellas' },
          { value: 'compact', label: 'Compacto (★ 4.6)' },
          { value: 'stars_count', label: 'Estrellas + valoración (★★★★★ 4.6/5)' },
          { value: 'stars_rating', label: 'Estrellas + valoración (★★★★★ 4.6/5)' },
          { value: 'rating_count', label: 'Solo valoración (4.6/5)' },
        ],
      },
      {
        key: 'rating_position',
        label: 'Posición de la valoración',
        type: 'select',
        group: 'layout',
        defaultValue: 'top',
        showIf: { field: 'show_rating', equals: true },
        options: [
          { value: 'top', label: 'Arriba' },
          { value: 'bottom', label: 'Abajo' },
        ],
      },
      { key: 'rating_color', label: 'Color de estrellas', type: 'color', group: 'style', showIf: { field: 'show_rating', equals: true } },
      // FASE 6 — Fuente y fecha
      { key: 'show_source', label: 'Mostrar origen (Google, Facebook…)', type: 'boolean', group: 'behavior', defaultValue: false },
      {
        key: 'source_badge_style',
        label: 'Estilo del badge de origen',
        type: 'select',
        group: 'style',
        defaultValue: 'pill',
        showIf: { field: 'show_source', equals: true },
        options: [
          { value: 'pill', label: 'Píldora' },
          { value: 'plain', label: 'Texto plano' },
        ],
      },
      { key: 'show_date', label: 'Mostrar fecha', type: 'boolean', group: 'behavior', defaultValue: false },
      // FASE 6 — Grid + Card compartidos
      // Filtrar campos de CARD_FIELDS que no aplican a testimonios
      // (show_description, show_compare_price, price_style, currency_position son de productos)
      ...GRID_FIELDS,
      ...CARD_FIELDS.filter((f) => ![
        'show_description',
        'show_compare_price',
        'price_style',
        'currency_position',
        'title_lines',
      ].includes(f.key)),
    ],
  },
  {
    type: 'cta',
    label: 'Llamada a la Acción',
    icon: 'MousePointerClick',
    description: 'Sección de llamada a la acción',
    variants: [
      { id: 'centered', label: 'Centrado' },
      { id: 'banner', label: 'Banner' },
      { id: 'with_image', label: 'Con imagen' },
      { id: 'split', label: 'Dividido' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: '¿Listo para reservar?' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar Ahora' },
      { key: 'cta_url', label: 'URL del botón', type: 'url', placeholder: '/reservas' },
      { key: 'image_url', label: 'Imagen', type: 'image', showIf: { variantIn: ['with_image', 'split'] } },
      // Repeater de botones usando BUTTON_ITEM_FIELDS (F2.5)
      {
        key: 'buttons',
        label: 'Botones adicionales',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        itemFields: BUTTON_ITEM_FIELDS,
      },
    ],
  },
  {
    type: 'contact_form',
    label: 'Formulario de Contacto',
    icon: 'Mail',
    description: 'Formulario para que los clientes te contacten',
    variants: [
      { id: 'default', label: 'Por defecto' },
      { id: 'simple', label: 'Simple' },
      { id: 'split', label: 'Dividido' },
      { id: 'with_map', label: 'Con mapa' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Contáctanos' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'email_to', label: 'Email de destino', type: 'text', placeholder: 'info@empresa.com', group: 'data', helpText: 'Correo donde llegan los mensajes del formulario' },
      // Repeater de campos del formulario (F2.5)
      {
        key: 'form_fields',
        label: 'Campos del formulario',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        itemFields: [
          { key: 'name', label: 'Nombre del campo', type: 'text', placeholder: 'phone' },
          { key: 'label', label: 'Etiqueta', type: 'text', placeholder: 'Teléfono' },
          { key: 'type', label: 'Tipo', type: 'select', options: [
            { value: 'text', label: 'Texto' },
            { value: 'email', label: 'Email' },
            { value: 'tel', label: 'Teléfono' },
            { value: 'textarea', label: 'Texto largo' },
            { value: 'select', label: 'Desplegable' },
            { value: 'checkbox', label: 'Casilla' },
          ]},
          { key: 'required', label: 'Obligatorio', type: 'boolean', defaultValue: false },
        ],
      },
      { key: 'show_map', label: 'Mostrar mapa', type: 'boolean', group: 'behavior', defaultValue: false },
      { key: 'show_phone', label: 'Mostrar teléfono', type: 'boolean', group: 'behavior', defaultValue: true },
      { key: 'show_email', label: 'Mostrar email', type: 'boolean', group: 'behavior', defaultValue: true },
      { key: 'show_address', label: 'Mostrar dirección', type: 'boolean', group: 'behavior', defaultValue: true },
    ],
  },
  {
    type: 'map',
    label: 'Mapa',
    icon: 'MapPin',
    description: 'Mapa de ubicación',
    variants: [
      { id: 'default', label: 'Por defecto' },
      { id: 'embedded', label: 'Embebido' },
      { id: 'full_width', label: 'Ancho completo' },
      { id: 'with_directions', label: 'Con direcciones' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Encuéntranos' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'address', label: 'Dirección', type: 'text', placeholder: 'Calle 123, Ciudad' },
      { key: 'lat', label: 'Latitud', type: 'number', placeholder: '4.7110', group: 'data' },
      { key: 'lng', label: 'Longitud', type: 'number', placeholder: '-74.0721', group: 'data' },
      { key: 'zoom', label: 'Zoom', type: 'range', min: 1, max: 20, step: 1, defaultValue: 14, group: 'layout' },
      { key: 'height', label: 'Altura (px)', type: 'number', placeholder: '400', group: 'layout' },
      { key: 'map_style', label: 'Estilo del mapa', type: 'select', group: 'style', options: [
        { value: 'default', label: 'Estándar' },
        { value: 'satellite', label: 'Satélite' },
        { value: 'dark', label: 'Oscuro' },
        { value: 'light', label: 'Claro' },
      ]},
      { key: 'show_marker', label: 'Mostrar marcador', type: 'boolean', group: 'behavior', defaultValue: true },
    ],
  },
  {
    type: 'stats',
    label: 'Estadísticas',
    icon: 'BarChart3',
    description: 'Contadores y estadísticas',
    variants: [
      { id: 'counters', label: 'Contadores' },
      { id: 'cards', label: 'Tarjetas' },
      { id: 'inline', label: 'En línea' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Estadísticas',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        itemFields: [
          { key: 'label', label: 'Etiqueta', type: 'text', placeholder: 'Clientes felices' },
          { key: 'value', label: 'Valor', type: 'text', placeholder: '1500' },
          { key: 'suffix', label: 'Sufijo', type: 'text', placeholder: '+' },
          { key: 'icon', label: 'Icono', type: 'icon' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'text_block',
    label: 'Bloque de Texto',
    icon: 'Type',
    description: 'Sección de texto libre',
    variants: [
      { id: 'centered', label: 'Centrado' },
      { id: 'left', label: 'Izquierda' },
      { id: 'two_columns', label: 'Dos columnas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'body', label: 'Contenido', type: 'richtext' },
      { key: 'columns', label: 'Columnas', type: 'select', group: 'layout', defaultValue: '1', options: [
        { value: '1', label: 'Una columna' },
        { value: '2', label: 'Dos columnas' },
        { value: '3', label: 'Tres columnas' },
      ]},
      { key: 'alignment', label: 'Alineación', type: 'alignment', group: 'layout', defaultValue: 'left' },
    ],
  },
  {
    type: 'team',
    label: 'Equipo',
    icon: 'Users',
    description: 'Sección de miembros del equipo',
    variants: [
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'simple', label: 'Simple' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestro Equipo' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Miembros',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Juan Pérez' },
          { key: 'role', label: 'Cargo', type: 'text', placeholder: 'Gerente' },
          { key: 'bio', label: 'Biografía', type: 'textarea' },
          { key: 'image_url', label: 'Foto', type: 'image' },
          { key: 'email', label: 'Email', type: 'text' },
          { key: 'linkedin_url', label: 'LinkedIn', type: 'url' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'faq',
    label: 'Preguntas Frecuentes',
    icon: 'HelpCircle',
    description: 'Sección de FAQ',
    variants: [
      { id: 'accordion', label: 'Acordeón' },
      { id: 'simple', label: 'Simple' },
      { id: 'two_columns', label: 'Dos columnas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Preguntas Frecuentes' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      // Reemplaza FAQItemsEditor ad-hoc
      {
        key: 'items',
        label: 'Preguntas',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'question',
        itemFields: [
          { key: 'question', label: 'Pregunta', type: 'text', placeholder: '¿Pregunta?' },
          { key: 'answer', label: 'Respuesta', type: 'textarea', placeholder: 'Respuesta...' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'newsletter',
    label: 'Newsletter',
    icon: 'Newspaper',
    description: 'Sección de suscripción al newsletter',
    variants: [
      { id: 'simple', label: 'Simple' },
      { id: 'banner', label: 'Banner' },
      { id: 'with_image', label: 'Con imagen' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Suscríbete' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'image_url', label: 'Imagen', type: 'image', showIf: { variantIn: ['with_image', 'banner'] } },
      { key: 'button_text', label: 'Texto del botón', type: 'text', placeholder: 'Suscribirme' },
      { key: 'placeholder', label: 'Placeholder del email', type: 'text', placeholder: 'tu@email.com' },
      { key: 'disclaimer', label: 'Aviso legal', type: 'textarea', placeholder: 'Al suscribirte aceptas nuestra política de privacidad' },
      { key: 'layout', label: 'Distribución', type: 'select', group: 'layout', options: [
        { value: 'centered', label: 'Centrado' },
        { value: 'left', label: 'Izquierda' },
        { value: 'split', label: 'Dividido' },
      ]},
      { key: 'input_bg_color', label: 'Fondo del input', type: 'color', group: 'style' },
      { key: 'input_text_color', label: 'Color del texto del input', type: 'color', group: 'style' },
      { key: 'button_bg_color', label: 'Color del botón', type: 'color', group: 'style' },
      { key: 'button_text_color', label: 'Color del texto del botón', type: 'color', group: 'style' },
    ],
  },
  {
    type: 'products_grid',
    label: 'Productos',
    icon: 'ShoppingBag',
    description: 'Grid de productos',
    variants: [
      { id: 'default', label: 'Por defecto' },
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'list', label: 'Lista' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Productos' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      // Reemplaza CategorySelectorEditor ad-hoc
      {
        key: 'selected_category_ids',
        label: 'Categorías a mostrar',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todas las categorías',
      },
      { key: 'max_items', label: 'Cantidad a mostrar', type: 'number', placeholder: '12', group: 'data' },
      { key: 'sort_order', label: 'Orden', type: 'select', group: 'data', defaultValue: 'default', options: [
        { value: 'default', label: 'Por defecto' },
        { value: 'price_asc', label: 'Precio ascendente' },
        { value: 'price_desc', label: 'Precio descendente' },
        { value: 'name', label: 'Nombre' },
        { value: 'sales', label: 'Más vendidos' },
      ]},
      { key: 'show_filters', label: 'Mostrar filtros', type: 'boolean', group: 'behavior', defaultValue: false },
      { key: 'show_search', label: 'Mostrar buscador', type: 'boolean', group: 'behavior', defaultValue: false },
      { key: 'filter', label: 'Filtro rápido', type: 'select', group: 'data', options: [
        { value: 'none', label: 'Ninguno' },
        { value: 'on_sale', label: 'En oferta' },
        { value: 'featured', label: 'Destacados' },
        { value: 'new', label: 'Novedades' },
      ]},
      // Campos de carrusel solo visibles en variante carousel
      {
        key: 'slides_per_view',
        label: 'Productos visibles a la vez',
        type: 'number',
        group: 'carousel',
        responsive: true,
        min: 1,
        max: 8,
        defaultValue: 4,
        showIf: { variantIn: ['carousel'] },
      },
      {
        key: 'autoplay',
        label: 'Reproducción automática',
        type: 'boolean',
        group: 'carousel',
        defaultValue: false,
        showIf: { variantIn: ['carousel'] },
      },
      {
        key: 'loop',
        label: 'Bucle infinito',
        type: 'boolean',
        group: 'carousel',
        defaultValue: true,
        showIf: { variantIn: ['carousel'] },
      },
      {
        key: 'enable_swipe',
        label: 'Deslizar con el dedo',
        type: 'boolean',
        group: 'carousel',
        defaultValue: true,
        showIf: { variantIn: ['carousel'] },
      },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
      ...PRODUCT_CARD_INTERACTION_FIELDS,
    ],
  },
  {
    type: 'categories_grid',
    label: 'Categorías',
    icon: 'ShoppingBag',
    description: 'Grid, lista o carrusel de categorías de productos',
    variants: [
      { id: 'default', label: 'Categorías' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Categorías' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea', placeholder: 'Explora nuestros productos por categoría' },
      { key: 'max_items', label: 'Cantidad a mostrar', type: 'number', placeholder: '6' },
      { key: 'shape', label: 'Forma', type: 'select', group: 'style', defaultValue: 'square', options: [
        { value: 'square', label: 'Cuadrado' },
        { value: 'rounded', label: 'Redondeado' },
        { value: 'circle', label: 'Círculo' },
        { value: 'card', label: 'Tarjeta' },
        { value: 'round', label: 'Redondo (obsoleto)' },
      ]},
      { key: 'desktop_layout', label: 'Layout en escritorio', type: 'select', group: 'layout', defaultValue: 'grid', options: [
        { value: 'grid', label: 'Grid' },
        { value: 'carousel', label: 'Carrusel' },
        { value: 'list', label: 'Lista' },
      ]},
      { key: 'desktop_columns', label: 'Columnas (escritorio)', type: 'number', group: 'layout', placeholder: 'Auto' },
      { key: 'desktop_rows', label: 'Filas máximas (escritorio)', type: 'number', group: 'layout', placeholder: 'Todas' },
      { key: 'mobile_columns', label: 'Columnas (móvil)', type: 'number', group: 'layout', placeholder: 'Auto', helpText: 'Vacío = hereda de escritorio' },
      { key: 'mobile_rows', label: 'Filas máximas (móvil)', type: 'number', group: 'layout', placeholder: 'Todas' },
      { key: 'mobile_layout', label: 'Layout en móvil', type: 'select', group: 'layout', defaultValue: 'inherit', options: [
        { value: 'inherit', label: 'Heredar de escritorio' },
        { value: 'grid', label: 'Grid' },
        { value: 'list', label: 'Lista' },
        { value: 'carousel', label: 'Carrusel' },
      ]},
      // Reemplaza CategorySelectorEditor ad-hoc
      {
        key: 'selected_category_ids',
        label: 'Categorías a mostrar',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todas las categorías',
      },
      // Reemplaza el bloque ad-hoc de opciones de categories_grid
      { key: 'enable_search', label: 'Buscador de categorías', type: 'boolean', group: 'behavior', defaultValue: false, helpText: 'Muestra una barra de búsqueda para filtrar categorías' },
      { key: 'enable_pagination', label: 'Paginación', type: 'boolean', group: 'behavior', defaultValue: false, helpText: 'Pagina las categorías en lugar de mostrar todas' },
      { key: 'page_size', label: 'Categorías por página', type: 'number', group: 'behavior', defaultValue: 24, min: 6, max: 48, showIf: { field: 'enable_pagination', equals: true } },
      // --- F4.1/F4.2: contenido de la categoría (icono, color, imagen) ---
      { key: 'show_count', label: 'Mostrar cantidad de productos', type: 'boolean', group: 'content', defaultValue: false },
      // `show_description` NO se define aquí: ya viene inyectado por CATEGORY_CARD_FIELDS
      { key: 'show_icon', label: 'Mostrar icono de la categoría', type: 'boolean', group: 'content', defaultValue: false, helpText: 'Usa categories.icon (icono Lucide)' },
      { key: 'show_image', label: 'Mostrar imagen de la categoría', type: 'boolean', group: 'content', defaultValue: true, helpText: 'Usa categories.image_url' },
      { key: 'show_color', label: 'Usar color de la categoría', type: 'boolean', group: 'content', defaultValue: false, helpText: 'Usa categories.color como acento o fondo' },
      { key: 'media_source', label: 'Origen del medio', type: 'select', group: 'content', defaultValue: 'auto', helpText: 'Qué mostrar cuando hay varios disponibles', options: [
        { value: 'auto', label: 'Automático (imagen → icono → color → inicial)' },
        { value: 'image', label: 'Solo imagen' },
        { value: 'icon', label: 'Solo icono' },
        { value: 'color', label: 'Solo color' },
        { value: 'initial', label: 'Solo inicial' },
      ]},
      { key: 'fallback_media', label: 'Fallback sin medio', type: 'select', group: 'content', defaultValue: 'emoji', showIf: { field: 'media_source', equals: 'auto' }, options: [
        { value: 'emoji', label: 'Emoji 🏷️' },
        { value: 'initial', label: 'Inicial sobre color' },
      ]},
      { key: 'media_max_width', label: 'Ancho máximo del medio', type: 'number', group: 'layout', placeholder: 'Auto', suffix: 'px', helpText: 'Útil para layout lista/iconos' },
      // --- F4.3: composición de la tarjeta ---
      { key: 'text_position', label: 'Posición del texto', type: 'select', group: 'layout', defaultValue: 'overlay', options: [
        { value: 'overlay', label: 'Superpuesto (con gradiente)' },
        { value: 'below', label: 'Debajo de la imagen' },
        { value: 'inside', label: 'Dentro (sin gradiente)' },
        { value: 'on_hover', label: 'Al pasar el mouse' },
      ]},
      { key: 'overlay_color', label: 'Color del gradiente', type: 'color', group: 'style', defaultValue: '#000000', showIf: { field: 'text_position', in: ['overlay', 'on_hover'] }, helpText: 'Color base del gradiente sobre la imagen' },
      { key: 'overlay_opacity', label: 'Opacidad del gradiente', type: 'range', group: 'style', min: 0, max: 100, step: 10, defaultValue: 60, suffix: '%', showIf: { field: 'text_position', in: ['overlay', 'on_hover'] } },
      { key: 'overlay_text_color', label: 'Color del texto sobre imagen', type: 'color', group: 'style', defaultValue: '#FFFFFF', showIf: { field: 'text_position', in: ['overlay', 'inside', 'on_hover'] } },
      { key: 'title_size', label: 'Tamaño del título', type: 'select', group: 'style', defaultValue: 'lg', options: [
        { value: 'sm', label: 'Pequeño' },
        { value: 'md', label: 'Mediano' },
        { value: 'lg', label: 'Grande' },
      ]},
      { key: 'badge', label: 'Etiqueta (texto libre)', type: 'text', group: 'content', placeholder: 'N productos' },
      // --- Espaciado de la sección ---
      { key: 'gap', label: 'Separación', type: 'range', group: 'layout', min: 0, max: 48, step: 4, defaultValue: 16, suffix: 'px' },
      { key: 'full_width', label: 'Ancho completo de pantalla', type: 'boolean', group: 'layout', defaultValue: false },
      // --- Tarjeta (inyectado, sin campos de precio) ---
      ...CATEGORY_CARD_FIELDS,
    ],
  },
  {
    type: 'featured_products',
    label: 'Productos Destacados',
    icon: 'Star',
    description: 'Productos destacados o en oferta',
    variants: [
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'hero_product', label: 'Producto Hero' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Productos Destacados' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'selected_category_ids',
        label: 'Categorías a mostrar',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todas las categorías',
      },
      { key: 'max_items', label: 'Cantidad a mostrar', type: 'number', placeholder: '8', group: 'data' },
      { key: 'sort_order', label: 'Orden', type: 'select', group: 'data', defaultValue: 'default', options: [
        { value: 'default', label: 'Por defecto' },
        { value: 'price_asc', label: 'Precio ascendente' },
        { value: 'price_desc', label: 'Precio descendente' },
        { value: 'name', label: 'Nombre' },
        { value: 'sales', label: 'Más vendidos' },
      ]},
      { key: 'show_filters', label: 'Mostrar filtros', type: 'boolean', group: 'behavior', defaultValue: false },
      { key: 'show_search', label: 'Mostrar buscador', type: 'boolean', group: 'behavior', defaultValue: false },
      { key: 'filter', label: 'Filtro rápido', type: 'select', group: 'data', options: [
        { value: 'none', label: 'Ninguno' },
        { value: 'on_sale', label: 'En oferta' },
        { value: 'featured', label: 'Destacados' },
        { value: 'new', label: 'Novedades' },
      ]},
      // Campos de carrusel solo visibles en variante carousel
      {
        key: 'slides_per_view',
        label: 'Productos visibles a la vez',
        type: 'number',
        group: 'carousel',
        responsive: true,
        min: 1,
        max: 8,
        defaultValue: 4,
        showIf: { variantIn: ['carousel'] },
      },
      {
        key: 'autoplay',
        label: 'Reproducción automática',
        type: 'boolean',
        group: 'carousel',
        defaultValue: false,
        showIf: { variantIn: ['carousel'] },
      },
      {
        key: 'loop',
        label: 'Bucle infinito',
        type: 'boolean',
        group: 'carousel',
        defaultValue: true,
        showIf: { variantIn: ['carousel'] },
      },
      {
        key: 'enable_swipe',
        label: 'Deslizar con el dedo',
        type: 'boolean',
        group: 'carousel',
        defaultValue: true,
        showIf: { variantIn: ['carousel'] },
      },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
      ...PRODUCT_CARD_INTERACTION_FIELDS,
    ],
  },
  {
    type: 'booking_cta',
    label: 'Reservar (CTA)',
    icon: 'CalendarCheck',
    description: 'Sección para reservar',
    variants: [
      { id: 'inline_form', label: 'Formulario inline' },
      { id: 'banner', label: 'Banner' },
      { id: 'simple', label: 'Simple' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Reserva tu estancia' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar Ahora' },
    ],
  },
  {
    type: 'image_text',
    label: 'Imagen + Texto',
    icon: 'LayoutPanelLeft',
    description: 'Imagen con texto al lado',
    variants: [
      { id: 'image_left', label: 'Imagen izquierda' },
      { id: 'image_right', label: 'Imagen derecha' },
      { id: 'image_top', label: 'Imagen arriba' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'body', label: 'Contenido', type: 'textarea' },
      { key: 'image_url', label: 'Imagen', type: 'image' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text' },
      { key: 'cta_url', label: 'URL del botón', type: 'url' },
    ],
  },
  {
    type: 'menu_preview',
    label: 'Vista Previa del Menú',
    icon: 'UtensilsCrossed',
    description: 'Preview del menú del restaurante',
    variants: [
      { id: 'tabs', label: 'Tabs por categoría' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestro Menú' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Platos',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Plato del día' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
          { key: 'price', label: 'Precio', type: 'text', placeholder: '$12.000' },
          { key: 'image_url', label: 'Imagen', type: 'image' },
          { key: 'category', label: 'Categoría', type: 'text', placeholder: 'Entradas' },
        ],
      },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
    ],
  },
  {
    type: 'offers',
    label: 'Ofertas / Descuentos',
    icon: 'Flame',
    description: 'Grid de productos en oferta con descuentos automáticos',
    variants: [
      { id: 'grid', label: 'Grid' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Ofertas Especiales' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea', placeholder: 'Aprovecha nuestros descuentos' },
      // Reemplaza CategorySelectorEditor ad-hoc
      {
        key: 'selected_category_ids',
        label: 'Categorías a mostrar',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todas las categorías',
      },
      { key: 'max_items', label: 'Cantidad a mostrar', type: 'number', placeholder: '8', group: 'data' },
      { key: 'sort_order', label: 'Orden', type: 'select', group: 'data', defaultValue: 'default', options: [
        { value: 'default', label: 'Por defecto' },
        { value: 'price_asc', label: 'Precio ascendente' },
        { value: 'price_desc', label: 'Precio descendente' },
        { value: 'name', label: 'Nombre' },
        { value: 'sales', label: 'Más vendidos' },
      ]},
      { key: 'show_filters', label: 'Mostrar filtros', type: 'boolean', group: 'behavior', defaultValue: false },
      { key: 'show_search', label: 'Mostrar buscador', type: 'boolean', group: 'behavior', defaultValue: false },
      { key: 'filter', label: 'Filtro rápido', type: 'select', group: 'data', options: [
        { value: 'none', label: 'Ninguno' },
        { value: 'on_sale', label: 'En oferta' },
        { value: 'featured', label: 'Destacados' },
        { value: 'new', label: 'Novedades' },
      ]},
      ...GRID_FIELDS,
      ...CARD_FIELDS,
      ...PRODUCT_CARD_INTERACTION_FIELDS,
    ],
  },
  {
    type: 'promo_banners',
    label: 'Banners Promocionales',
    icon: 'Megaphone',
    description: 'Bloques promocionales con imagen que enlazan a una categoría, un producto o una URL. Úsalos para destacar campañas.',
    variants: [
      { id: 'grid', label: 'Grid' },
      { id: 'carousel', label: 'Carrusel' },
      { id: 'stack', label: 'Apilado' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Promociones' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'layout',
        label: 'Distribución',
        type: 'select',
        group: 'layout',
        defaultValue: 'grid',
        helpText: 'Cómo se disponen los banners dentro de la sección',
        options: [
          { value: 'grid', label: 'Grid' },
          { value: 'carousel', label: 'Carrusel' },
          { value: 'stack', label: 'Apilado (1 columna)' },
        ],
      },
      // Repeater de banners con destino tipado (F7.1).
      // Los banners sin link_type siguen funcionando: el sitio hace fallback a
      // link_url / cta_url (regla de retrocompatibilidad).
      {
        key: 'banners',
        label: 'Banners',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'title', label: 'Título', type: 'text', placeholder: 'Oferta de verano' },
          { key: 'subtitle', label: 'Subtítulo', type: 'textarea', placeholder: 'Hasta 50% en toda la línea' },
          { key: 'image_url', label: 'Imagen', type: 'image' },
          { key: 'bg_color', label: 'Color de fondo', type: 'color', group: 'style' },
          { key: 'text_color', label: 'Color del texto', type: 'color', group: 'style' },
          {
            key: 'link_type',
            label: 'Tipo de enlace',
            type: 'select',
            group: 'content',
            defaultValue: 'url',
            helpText: 'A qué lleva el banner al hacer clic',
            options: [
              { value: 'url', label: 'URL personalizada' },
              { value: 'category', label: 'Categoría' },
              { value: 'product', label: 'Producto' },
              { value: 'page', label: 'Página del sitio' },
            ],
          },
          {
            key: 'link_category_id',
            label: 'Categoría destino',
            type: 'entity',
            entity: 'category',
            group: 'data',
            helpText: 'Al elegir categoría se arma el enlace /categorias/{slug} automáticamente',
            showIf: { field: 'link_type', equals: 'category' },
          },
          {
            key: 'link_product_id',
            label: 'Producto destino',
            type: 'entity',
            entity: 'product',
            group: 'data',
            helpText: 'Al elegir producto se arma el enlace /productos/{uuid} automáticamente',
            showIf: { field: 'link_type', equals: 'product' },
          },
          {
            key: 'link_page_id',
            label: 'Página destino',
            type: 'entity',
            entity: 'page',
            group: 'data',
            helpText: 'Página interna del sitio (enlace /{slug})',
            showIf: { field: 'link_type', equals: 'page' },
          },
          {
            key: 'link_url',
            label: 'URL destino',
            type: 'url',
            group: 'content',
            placeholder: 'https://... o /ruta',
            showIf: { field: 'link_type', equals: 'url' },
          },
          {
            key: 'show_category_products',
            label: 'Mostrar preview de productos',
            type: 'boolean',
            group: 'behavior',
            defaultValue: false,
            helpText: 'Muestra una miniatura de productos de la categoría dentro del banner',
            showIf: { field: 'link_type', equals: 'category' },
          },
          {
            key: 'max_preview_products',
            label: 'Productos a previsualizar',
            type: 'number',
            group: 'behavior',
            defaultValue: 4,
            min: 1,
            max: 12,
            showIf: { field: 'show_category_products', equals: true },
          },
          { key: 'button_text', label: 'Texto del botón', type: 'text', placeholder: 'Ver más' },
          {
            key: 'button_style',
            label: 'Estilo del botón',
            type: 'select',
            group: 'style',
            defaultValue: 'solid',
            options: [
              { value: 'solid', label: 'Sólido' },
              { value: 'outline', label: 'Contorno' },
              { value: 'ghost', label: 'Transparente' },
            ],
          },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'brands',
    label: 'Marcas',
    icon: 'Award',
    description: 'Logos de marcas asociadas',
    variants: [
      { id: 'logos', label: 'Logos' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestras Marcas' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'layout', label: 'Distribución', type: 'select', options: [
        { value: 'carousel', label: 'Carrusel' },
        { value: 'grid', label: 'Grid' },
        { value: 'flex', label: 'Fluido (wrap)' },
      ]},
      { key: 'logo_size', label: 'Tamaño de logos', type: 'select', options: [
        { value: 'sm', label: 'Pequeño' },
        { value: 'md', label: 'Mediano' },
        { value: 'lg', label: 'Grande' },
      ]},
      { key: 'grayscale', label: 'Efecto blanco y negro', type: 'boolean' },
      // Reemplaza BrandsItemsEditor ad-hoc
      {
        key: 'items',
        label: 'Marcas',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'logo_url', label: 'Logo', type: 'image' },
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Nombre de la marca' },
          { key: 'url', label: 'URL (opcional)', type: 'url', placeholder: 'https://marca.com' },
        ],
      },
      // CAROUSEL_FIELDS para la variante carrusel (F2.5)
      ...CAROUSEL_FIELDS,
    ],
  },
  {
    type: 'membership_plans',
    label: 'Planes / Membresías',
    icon: 'CreditCard',
    description: 'Tabla de precios o membresías',
    variants: [
      { id: 'pricing_table', label: 'Tabla de precios' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Planes' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'plan_ids',
        label: 'Planes a mostrar',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todos los planes',
      },
      {
        key: 'plans',
        label: 'Planes personalizados',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Básico' },
          { key: 'price', label: 'Precio', type: 'text', placeholder: '$29.000/mes' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
          { key: 'features', label: 'Características (una por línea)', type: 'textarea', placeholder: 'Gym ilimitado\nPool\nSauna' },
          { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Suscribirme' },
          { key: 'cta_url', label: 'URL del botón', type: 'url' },
          { key: 'highlighted', label: 'Destacar', type: 'boolean', defaultValue: false },
        ],
      },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
    ],
  },
  {
    type: 'countdown',
    label: 'Countdown Timer',
    icon: 'Flame',
    description: 'Temporizador de cuenta regresiva para ofertas',
    variants: [
      { id: 'banner', label: 'Banner completo' },
      { id: 'inline', label: 'Inline' },
      { id: 'compact', label: 'Compacto' },
    ],
    contentFields: [
      { key: 'title', label: 'Texto', type: 'text', placeholder: '¡Oferta por tiempo limitado!' },
      { key: 'mode', label: 'Modo', type: 'select', options: [
        { value: 'daily_reset', label: 'Se reinicia cada 24h' },
        { value: 'custom', label: 'Fecha personalizada' },
      ]},
      { key: 'end_date', label: 'Fecha fin (modo custom)', type: 'text', placeholder: '2025-12-31T23:59' },
      { key: 'timezone', label: 'Zona horaria', type: 'select', options: [
        { value: 'America/Bogota', label: 'Colombia (GMT-5)' },
        { value: 'America/Mexico_City', label: 'México (GMT-6)' },
        { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (GMT-3)' },
        { value: 'America/Santiago', label: 'Chile (GMT-4)' },
        { value: 'America/Lima', label: 'Perú (GMT-5)' },
        { value: 'Europe/Madrid', label: 'España (GMT+1)' },
        { value: 'America/New_York', label: 'EEUU Este (GMT-5)' },
        { value: 'America/Los_Angeles', label: 'EEUU Oeste (GMT-8)' },
      ]},
      { key: 'reset_hour', label: 'Hora de reinicio (0-23)', type: 'number', placeholder: '0' },
    ],
  },
  // ============================================================
  // F2.3 — Tipos huérfanos declarados en el catálogo
  // (el sitio los renderiza pero el editor no los ofrecía)
  // ============================================================
  {
    type: 'reservation_cta',
    label: 'Reserva de Mesa',
    icon: 'CalendarCheck',
    description: 'Llamada a la acción para reservar mesa (con o sin formulario)',
    variants: [
      { id: 'with_form', label: 'Con formulario' },
      { id: 'simple', label: 'Simple' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Reserva tu mesa' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar' },
      { key: 'cta_url', label: 'URL del botón', type: 'url', placeholder: '/reservas' },
      { key: 'show_form', label: 'Mostrar formulario inline', type: 'boolean', group: 'behavior', defaultValue: false, showIf: { variantIn: ['with_form'] } },
      // F8.3 — Campos del formulario (repeater: qué campos mostrar)
      {
        key: 'form_fields',
        label: 'Campos del formulario',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        showIf: { variantIn: ['with_form'] },
        helpText: 'Define qué campos aparecen en el formulario y su orden. Vacío = nombre, teléfono, fecha, hora, personas.',
        itemFields: [
          { key: 'name', label: 'Campo', type: 'select', options: [
            { value: 'name', label: 'Nombre' },
            { value: 'phone', label: 'Teléfono' },
            { value: 'email', label: 'Email' },
            { value: 'date', label: 'Fecha' },
            { value: 'time', label: 'Hora' },
            { value: 'guests', label: 'Personas' },
          ]},
          { key: 'label', label: 'Etiqueta personalizada', type: 'text', placeholder: 'Teléfono' },
        ],
      },
      // F8.3 — Validación de campos
      { key: 'require_phone', label: 'Teléfono obligatorio', type: 'boolean', group: 'behavior', defaultValue: true, showIf: { variantIn: ['with_form'] } },
      { key: 'require_email', label: 'Email obligatorio', type: 'boolean', group: 'behavior', defaultValue: false, showIf: { variantIn: ['with_form'] } },
      // F8.3 — Aforo
      { key: 'min_guests', label: 'Mínimo de personas', type: 'number', group: 'behavior', defaultValue: 1, min: 1, max: 50, showIf: { variantIn: ['with_form'] } },
      { key: 'max_guests', label: 'Máximo de personas', type: 'number', group: 'behavior', defaultValue: 8, min: 1, max: 100, showIf: { variantIn: ['with_form'] } },
      // F8.3 — Intervalo de horarios
      {
        key: 'time_slot_interval',
        label: 'Intervalo de horarios',
        type: 'select',
        group: 'behavior',
        defaultValue: '30',
        showIf: { variantIn: ['with_form'] },
        helpText: 'Cada cuánto se ofrecen horas en el selector',
        options: [
          { value: '30', label: '30 minutos' },
          { value: '60', label: '60 minutos' },
          { value: '90', label: '90 minutos' },
        ],
      },
      // F8.3 — Mostrar solo horarios disponibles
      { key: 'show_available_times', label: 'Mostrar solo horarios disponibles', type: 'boolean', group: 'behavior', defaultValue: false, showIf: { variantIn: ['with_form'] }, helpText: 'El selector de hora muestra solo horarios con cupo' },
      // F8.3 — Mensajes personalizados
      { key: 'success_message', label: 'Mensaje de éxito', type: 'textarea', group: 'content', placeholder: '¡Reserva confirmada! Te esperamos.', showIf: { variantIn: ['with_form'] } },
      { key: 'error_message', label: 'Mensaje de error', type: 'textarea', group: 'content', placeholder: 'No se pudo completar la reserva. Inténtalo de nuevo.', showIf: { variantIn: ['with_form'] } },
    ],
  },
  {
    type: 'specialties',
    label: 'Especialidades',
    icon: 'UtensilsCrossed',
    description: 'Productos destacados o especialidades de la casa',
    variants: [
      { id: 'featured', label: 'Destacadas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestras especialidades' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'selected_category_ids',
        label: 'Categorías a mostrar',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todas',
      },
      { key: 'max_items', label: 'Cantidad a mostrar', type: 'number', placeholder: '6', group: 'data' },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
      ...PRODUCT_CARD_INTERACTION_FIELDS,
    ],
  },
  {
    type: 'chef_section',
    label: 'Sección del Chef',
    icon: 'ChefHat',
    description: 'Perfil del chef del restaurante',
    variants: [
      { id: 'profile', label: 'Perfil' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestro Chef' },
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Chef Juan Pérez' },
      { key: 'role', label: 'Cargo', type: 'text', placeholder: 'Chef Ejecutivo' },
      { key: 'bio', label: 'Biografía', type: 'textarea' },
      { key: 'image_url', label: 'Foto', type: 'image' },
      { key: 'quote', label: 'Cita destacada', type: 'textarea', placeholder: 'La cocina es pasión...' },
    ],
  },
  {
    type: 'delivery_cta',
    label: 'Delivery (CTA)',
    icon: 'Bike',
    description: 'Banner de llamada a la acción para pedidos a domicilio',
    variants: [
      { id: 'banner', label: 'Banner' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Pide a domicilio' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Pedir ahora' },
      { key: 'cta_url', label: 'URL del botón', type: 'url', placeholder: 'https://...' },
      { key: 'image_url', label: 'Imagen', type: 'image' },
    ],
  },
  {
    type: 'partners',
    label: 'Aliados / Socios',
    icon: 'Handshake',
    description: 'Logos o tarjetas de socios comerciales',
    variants: [
      { id: 'logos', label: 'Logos' },
      { id: 'cards', label: 'Tarjetas' },
      { id: 'carousel', label: 'Carrusel' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Aliados' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Logos',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'logo_url', label: 'Logo', type: 'image' },
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Nombre del aliado' },
          { key: 'url', label: 'URL (opcional)', type: 'url', placeholder: 'https://...' },
        ],
      },
      ...CAROUSEL_FIELDS,
    ],
  },
  {
    type: 'why_choose_us',
    label: 'Por qué elegirnos',
    icon: 'BadgeCheck',
    description: 'Razones para elegir el negocio, con iconos',
    variants: [
      { id: 'icons', label: 'Iconos' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Por qué elegirnos' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Razones',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'icon', label: 'Icono', type: 'icon' },
          { key: 'title', label: 'Título', type: 'text', placeholder: 'Calidad garantizada' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'features_grid',
    label: 'Grid de Características',
    icon: 'LayoutGrid',
    description: 'Características con imagen y texto alternado',
    variants: [
      { id: 'alternating', label: 'Alternado' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Características' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Características',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'title', label: 'Título', type: 'text' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
          { key: 'image_url', label: 'Imagen', type: 'image' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'how_it_works',
    label: 'Cómo Funciona',
    icon: 'ListChecks',
    description: 'Pasos de un proceso numerado',
    variants: [
      { id: 'steps', label: 'Pasos' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Cómo funciona' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Pasos',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'step', label: 'Número de paso', type: 'number', placeholder: '1' },
          { key: 'title', label: 'Título', type: 'text', placeholder: 'Regístrate' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
          { key: 'icon', label: 'Icono', type: 'icon' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'services_list',
    label: 'Lista de Servicios',
    icon: 'ClipboardList',
    description: 'Servicios en tarjetas, grid, lista o fila de iconos',
    variants: [
      { id: 'cards', label: 'Tarjetas' },
      { id: 'grid', label: 'Grid' },
      { id: 'icons_row', label: 'Fila de iconos' },
      { id: 'list', label: 'Lista' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros Servicios' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Servicios',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'title', label: 'Título', type: 'text' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
          { key: 'icon', label: 'Icono', type: 'icon' },
          { key: 'image_url', label: 'Imagen', type: 'image' },
          { key: 'cta_text', label: 'Texto del botón', type: 'text' },
          { key: 'cta_url', label: 'URL del botón', type: 'url' },
        ],
      },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
    ],
  },
  {
    type: 'pricing_table',
    label: 'Tabla de Precios',
    icon: 'Table',
    description: 'Tabla de planes con columnas y características',
    variants: [
      { id: 'three_columns', label: 'Tres columnas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Planes y precios' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'plans',
        label: 'Planes',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Básico' },
          { key: 'price', label: 'Precio', type: 'text', placeholder: '$29.000' },
          { key: 'period', label: 'Periodo', type: 'text', placeholder: '/mes' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
          { key: 'features', label: 'Características (una por línea)', type: 'textarea', placeholder: 'Función 1\nFunción 2' },
          { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Empezar' },
          { key: 'cta_url', label: 'URL del botón', type: 'url' },
          { key: 'highlighted', label: 'Destacar', type: 'boolean', defaultValue: false },
        ],
      },
      ...GRID_FIELDS,
      ...CARD_FIELDS,
    ],
  },
  {
    type: 'demo_cta',
    label: 'Demo (CTA)',
    icon: 'MonitorPlay',
    description: 'Llamada a la acción con formulario para agendar demo',
    variants: [
      { id: 'form', label: 'Con formulario' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Solicita una demo' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Agendar demo' },
      {
        key: 'form_fields',
        label: 'Campos del formulario',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        itemFields: [
          { key: 'name', label: 'Nombre del campo', type: 'text', placeholder: 'company' },
          { key: 'label', label: 'Etiqueta', type: 'text', placeholder: 'Empresa' },
          { key: 'type', label: 'Tipo', type: 'select', options: [
            { value: 'text', label: 'Texto' },
            { value: 'email', label: 'Email' },
            { value: 'tel', label: 'Teléfono' },
            { value: 'textarea', label: 'Texto largo' },
          ]},
          { key: 'required', label: 'Obligatorio', type: 'boolean', defaultValue: false },
        ],
      },
    ],
  },
  {
    type: 'parking_zones',
    label: 'Zonas de Parqueo',
    icon: 'SquareParking',
    description: 'Zonas de parqueo en grid',
    variants: [
      { id: 'grid', label: 'Grid' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Zonas disponibles' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'zone_ids',
        label: 'Zonas a mostrar',
        type: 'entity',
        entity: 'table_zone',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todas las zonas',
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'parking_pricing',
    label: 'Tarifas de Parqueo',
    icon: 'CreditCard',
    description: 'Tarifas de parqueo en tarjetas',
    variants: [
      { id: 'cards', label: 'Tarjetas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestras tarifas' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'rates',
        label: 'Tarifas',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        itemFields: [
          { key: 'label', label: 'Etiqueta', type: 'text', placeholder: 'Hora' },
          { key: 'price', label: 'Precio', type: 'text', placeholder: '$3.000' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
      ...CARD_FIELDS,
    ],
  },
  {
    type: 'parking_features',
    label: 'Características de Parqueo',
    icon: 'Sparkles',
    description: 'Características del parqueo con iconos',
    variants: [
      { id: 'icons', label: 'Iconos' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Características' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Características',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'icon', label: 'Icono', type: 'icon' },
          { key: 'title', label: 'Título', type: 'text' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'parking_availability',
    label: 'Disponibilidad de Parqueo',
    icon: 'Gauge',
    description: 'Resumen de disponibilidad en tiempo real por sucursal',
    variants: [
      { id: 'summary', label: 'Resumen' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Cupos disponibles' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'branch_id',
        label: 'Sucursal',
        type: 'entity',
        entity: 'branch',
        group: 'data',
        helpText: 'Sucursal cuyo parqueo se monitorea',
      },
      { key: 'refresh_seconds', label: 'Refrescar cada (seg)', type: 'number', placeholder: '30', group: 'behavior', defaultValue: 30 },
    ],
  },
  {
    type: 'parking_pass_plans',
    label: 'Planes de Parqueo',
    icon: 'CreditCard',
    description: 'Planes de abono/membresía de parqueo en tarjetas',
    variants: [
      { id: 'cards', label: 'Tarjetas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Planes de parqueo' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'plan_ids',
        label: 'Planes a mostrar',
        type: 'entity',
        entity: 'category',
        multiple: true,
        group: 'data',
        helpText: 'Sin selección: se muestran todos los planes',
      },
      ...CARD_FIELDS,
    ],
  },
  // ---- Tipos huérfanos adicionales del test de contrato (campos mínimos) ----
  {
    type: 'booking_transport',
    label: 'Reserva de Transporte',
    icon: 'Bus',
    description: 'Reserva de transporte con banner o formulario',
    variants: [
      { id: 'banner', label: 'Banner' },
      { id: 'form', label: 'Formulario' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Reserva tu viaje' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Reservar' },
      { key: 'cta_url', label: 'URL del botón', type: 'url' },
    ],
  },
  {
    type: 'class_schedule',
    label: 'Horario de Clases',
    icon: 'CalendarDays',
    description: 'Horario de clases en grid',
    variants: [
      { id: 'grid', label: 'Grid' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Horario de clases' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Clases',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Spinning' },
          { key: 'day', label: 'Día', type: 'text', placeholder: 'Lunes' },
          { key: 'time', label: 'Hora', type: 'text', placeholder: '18:00' },
          { key: 'instructor', label: 'Instructor', type: 'text' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'coverage_map',
    label: 'Mapa de Cobertura',
    icon: 'Map',
    description: 'Mapa estático de cobertura de servicio',
    variants: [
      { id: 'static', label: 'Estático' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Zonas de cobertura' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'image_url', label: 'Imagen del mapa', type: 'image' },
    ],
  },
  {
    type: 'fleet_showcase',
    label: 'Flota de Vehículos',
    icon: 'Truck',
    description: 'Showcase de vehículos en grid',
    variants: [
      { id: 'grid', label: 'Grid' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestra flota' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Vehículos',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Sedán' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
          { key: 'image_url', label: 'Imagen', type: 'image' },
          { key: 'capacity', label: 'Capacidad', type: 'text', placeholder: '4 pasajeros' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'gym_features',
    label: 'Características del Gimnasio',
    icon: 'Dumbbell',
    description: 'Características del gimnasio con iconos',
    variants: [
      { id: 'icons', label: 'Iconos' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Equipamiento' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Características',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'icon', label: 'Icono', type: 'icon' },
          { key: 'title', label: 'Título', type: 'text' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'integrations',
    label: 'Integraciones',
    icon: 'Plug',
    description: 'Logos de integraciones disponibles',
    variants: [
      { id: 'logos', label: 'Logos' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Integraciones' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Integraciones',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'logo_url', label: 'Logo', type: 'image' },
          { key: 'name', label: 'Nombre', type: 'text' },
          { key: 'url', label: 'URL (opcional)', type: 'url' },
        ],
      },
    ],
  },
  {
    // FASE 10.3 — Sección de reseñas con sistema dual (generadas + reales).
    // Los campos del grupo 'data' controlan la fuente de reseñas.
    // Default: reviews_source = 'generated' → cero cambio visual en sitios existentes.
    type: 'product_reviews',
    label: 'Reseñas de Producto',
    icon: 'Star',
    description: 'Sección de opiniones con sistema dual: generadas, reales, mixtas o automáticas',
    variants: [
      { id: 'default', label: 'Lista' },
    ],
    contentFields: [
      // ---- Grupo DATA: control de fuente de reseñas ----
      {
        key: 'reviews_source',
        label: 'Fuente de reseñas',
        type: 'select',
        group: 'data',
        defaultValue: 'generated',
        helpText: 'Generadas = comportamiento actual. Reales = opiniones de clientes verificadas. Mixtas = reales primero, completa con generadas. Automáticas = generadas hasta acumular suficientes reales.',
        options: [
          { value: 'generated', label: 'Generadas (default)' },
          { value: 'real', label: 'Reales (solo product_reviews)' },
          { value: 'mixed', label: 'Mixtas (reales + generadas)' },
          { value: 'auto', label: 'Automáticas (transición sola)' },
        ],
      },
      {
        key: 'auto_switch_threshold',
        label: 'Umbral de cambio automático',
        type: 'number',
        group: 'data',
        defaultValue: 3,
        min: 1,
        max: 20,
        helpText: 'Número de reseñas reales necesarias para que el modo "auto" deje de mostrar generadas.',
        showIf: { field: 'reviews_source', equals: 'auto' },
      },
      {
        key: 'min_visible',
        label: 'Mínimo de reseñas visibles',
        type: 'number',
        group: 'data',
        defaultValue: 10,
        min: 1,
        max: 50,
        helpText: 'Cuántas reseñas completar en modo "mixed" (reales primero, generadas después).',
        showIf: { field: 'reviews_source', in: ['mixed', 'auto'] },
      },
      {
        key: 'rating_source',
        label: 'Origen del promedio del badge',
        type: 'select',
        group: 'data',
        defaultValue: 'same_as_reviews',
        helpText: 'De dónde sale el promedio de estrellas. "same_as_reviews" sigue la fuente activa. Importante: AggregateRating en JSON-LD solo se emite con datos reales.',
        options: [
          { value: 'same_as_reviews', label: 'Igual que la fuente activa' },
          { value: 'real_only', label: 'Solo reales' },
          { value: 'generated_only', label: 'Solo generadas' },
        ],
      },
      {
        key: 'show_generated_disclaimer',
        label: 'Mostrar aviso "Reseñas de muestra"',
        type: 'boolean',
        group: 'data',
        defaultValue: false,
        helpText: 'Muestra un pie indicando que las opiniones son ejemplos generados. Apagado por defecto.',
      },
      // ---- Grupo DATA: configuración de reseñas generadas ----
      {
        key: 'generated_count',
        label: 'Cantidad de reseñas generadas',
        type: 'number',
        group: 'data',
        min: 1,
        max: 5000,
        helpText: 'Cuántas reseñas generar. Vacío = usa la lógica original (800-1600).',
        showIf: { field: 'reviews_source', in: ['generated', 'mixed', 'auto'] },
      },
      {
        key: 'generated_names_pool',
        label: 'Conjunto de nombres',
        type: 'select',
        group: 'data',
        defaultValue: 'colombia',
        helpText: 'De qué país tomar los nombres para las reseñas generadas.',
        options: [
          { value: 'colombia', label: 'Colombia (actual)' },
          { value: 'mexico', label: 'México' },
          { value: 'espana', label: 'España' },
          { value: 'neutro', label: 'Neutro' },
        ],
        showIf: { field: 'reviews_source', in: ['generated', 'mixed', 'auto'] },
      },
      // ---- Grupo CONTENT: textos ----
      { key: 'empty_state_title', label: 'Título estado vacío', type: 'text', placeholder: 'Aún no hay opiniones', group: 'content', helpText: 'Texto cuando no hay reseñas reales en modo "real".' },
      { key: 'empty_state_message', label: 'Mensaje estado vacío', type: 'textarea', placeholder: 'Sé el primero en compartir tu experiencia', group: 'content' },
      { key: 'empty_state_cta', label: 'Botón estado vacío', type: 'text', placeholder: 'Escribir una opinión', group: 'content' },
    ],
  },
  {
    type: 'routes',
    label: 'Rutas',
    icon: 'Route',
    description: 'Rutas de transporte en tarjetas',
    variants: [
      { id: 'cards', label: 'Tarjetas' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestras rutas' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Rutas',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Ruta Centro' },
          { key: 'origin', label: 'Origen', type: 'text' },
          { key: 'destination', label: 'Destino', type: 'text' },
          { key: 'description', label: 'Descripción', type: 'textarea' },
        ],
      },
      ...CARD_FIELDS,
    ],
  },
  {
    type: 'transformation',
    label: 'Transformación',
    icon: 'TrendingUp',
    description: 'Sección de antes y después',
    variants: [
      { id: 'before_after', label: 'Antes y después' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Resultados reales' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'before_image_url', label: 'Imagen "antes"', type: 'image' },
      { key: 'after_image_url', label: 'Imagen "después"', type: 'image' },
      { key: 'description', label: 'Descripción', type: 'textarea' },
    ],
  },
  {
    type: 'trainers',
    label: 'Entrenadores',
    icon: 'Users',
    description: 'Equipo de entrenadores en grid',
    variants: [
      { id: 'grid', label: 'Grid' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Nuestros entrenadores' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      {
        key: 'items',
        label: 'Entrenadores',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'name',
        itemFields: [
          { key: 'name', label: 'Nombre', type: 'text' },
          { key: 'role', label: 'Especialidad', type: 'text', placeholder: 'Crossfit' },
          { key: 'bio', label: 'Biografía', type: 'textarea' },
          { key: 'image_url', label: 'Foto', type: 'image' },
        ],
      },
      ...GRID_FIELDS,
    ],
  },
  {
    type: 'trip_search',
    label: 'Buscador de Viajes',
    icon: 'Search',
    description: 'Formulario de búsqueda de viajes',
    variants: [
      { id: 'form', label: 'Formulario' },
    ],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Busca tu viaje' },
      { key: 'subtitle', label: 'Subtítulo', type: 'textarea' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Buscar' },
    ],
  },
  // ---- FASE 9.2 — Secciones de detalle de producto ----
  {
    type: 'product_gallery',
    label: 'Galería de Producto',
    icon: 'Images',
    description: 'Galería de imágenes del producto con thumbnails y zoom',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'layout',
        label: 'Disposición de thumbnails',
        type: 'select',
        group: 'layout',
        defaultValue: 'thumbs_bottom',
        options: [
          { value: 'thumbs_bottom', label: 'Thumbnails abajo' },
          { value: 'thumbs_left', label: 'Thumbnails izquierda' },
          { value: 'grid', label: 'Grid' },
          { value: 'carousel', label: 'Carrusel' },
          { value: 'stacked', label: 'Apiladas' },
        ],
      },
      {
        key: 'zoom',
        label: 'Tipo de zoom',
        type: 'select',
        group: 'behavior',
        defaultValue: 'hover',
        options: [
          { value: 'hover', label: 'Al pasar el mouse' },
          { value: 'click', label: 'Al hacer clic' },
          { value: 'lightbox', label: 'Lightbox' },
          { value: 'none', label: 'Sin zoom' },
        ],
      },
      {
        key: 'aspect_ratio',
        label: 'Relación de aspecto',
        type: 'select',
        group: 'layout',
        defaultValue: 'square',
        options: [
          { value: 'square', label: 'Cuadrada (1:1)' },
          { value: '4/3', label: '4:3' },
          { value: '16/9', label: '16:9' },
          { value: 'auto', label: 'Automática' },
        ],
      },
      { key: 'show_video', label: 'Mostrar video', type: 'boolean', defaultValue: false, group: 'content' },
      { key: 'show_badges', label: 'Mostrar badges', type: 'boolean', defaultValue: true, group: 'content' },
      {
        key: 'thumb_size',
        label: 'Tamaño de miniaturas',
        type: 'range',
        group: 'layout',
        min: 40,
        max: 120,
        step: 5,
        defaultValue: 80,
        suffix: 'px',
        showIf: { field: 'layout', in: ['thumbs_bottom', 'thumbs_left'] },
        helpText: 'Tamaño de las miniaturas en píxeles',
      },
    ],
  },
  {
    type: 'product_info',
    label: 'Información de Producto',
    icon: 'ShoppingBag',
    description: 'Bloques de información del producto: SKU, título, rating, precio, descripción',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'blocks',
        label: 'Bloques de información',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'id',
        itemFields: [
          {
            key: 'id',
            label: 'Tipo de bloque',
            type: 'select',
            options: [
              { value: 'sku', label: 'SKU' },
              { value: 'title', label: 'Título' },
              { value: 'rating', label: 'Valoración' },
              { value: 'price', label: 'Precio' },
              { value: 'savings', label: 'Ahorro' },
              { value: 'countdown', label: 'Countdown' },
              { value: 'short_description', label: 'Descripción breve' },
              { value: 'variants', label: 'Variantes' },
              { value: 'modifiers', label: 'Modificadores' },
              { value: 'quantity', label: 'Cantidad' },
              { value: 'stock', label: 'Stock' },
              { value: 'share', label: 'Compartir' },
            ],
          },
          { key: 'visible', label: 'Visible', type: 'boolean', defaultValue: true },
        ],
      },
      { key: 'show_countdown', label: 'Mostrar countdown', type: 'boolean', defaultValue: true, group: 'behavior' },
    ],
  },
  {
    type: 'product_actions',
    label: 'Acciones de Producto',
    icon: 'MousePointerClick',
    description: 'Botones de acción: agregar al carrito, comprar ahora',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      { key: 'sticky_mobile', label: 'Sticky en móvil', type: 'boolean', defaultValue: true, group: 'behavior' },
      {
        key: 'position',
        label: 'Posición de botones',
        type: 'select',
        group: 'layout',
        defaultValue: 'below',
        options: [
          { value: 'below', label: 'Debajo de la info' },
          { value: 'sticky', label: 'Sticky al hacer scroll' },
          { value: 'inline', label: 'En línea con el precio' },
        ],
      },
      {
        key: 'buttons',
        label: 'Botones personalizados',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'label',
        maxItems: 4,
        helpText: 'Botones personalizados. Si está vacío, se usan los botones por defecto.',
        itemFields: BUTTON_ITEM_FIELDS,
      },
    ],
  },
  {
    type: 'product_benefits',
    label: 'Beneficios de Producto',
    icon: 'Shield',
    description: 'Grid de beneficios con icono, título y descripción',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'items',
        label: 'Beneficios',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'title',
        itemFields: [
          { key: 'icon', label: 'Icono', type: 'icon' },
          { key: 'title', label: 'Título', type: 'text', placeholder: 'Envío rápido' },
          { key: 'description', label: 'Descripción', type: 'text', placeholder: '24-48 horas' },
        ],
      },
    ],
  },
  {
    type: 'product_description',
    label: 'Descripción de Producto',
    icon: 'Type',
    description: 'Descripción extendida del producto con layout configurable',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'layout',
        label: 'Disposición',
        type: 'select',
        group: 'layout',
        defaultValue: 'full',
        options: [
          { value: 'accordion', label: 'Acordeón' },
          { value: 'tabs', label: 'Pestañas' },
          { value: 'full', label: 'Texto completo' },
        ],
      },
      { key: 'max_height', label: 'Altura máxima (caracteres)', type: 'number', defaultValue: 180, min: 50, max: 1000, group: 'layout' },
      { key: 'show_specs', label: 'Mostrar especificaciones', type: 'boolean', defaultValue: false, group: 'content' },
    ],
  },
  {
    type: 'related_products',
    label: 'Productos Relacionados',
    icon: 'Layout',
    description: 'Productos relacionados: por categoría, tag o comprados juntos',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'source',
        label: 'Fuente',
        type: 'select',
        group: 'data',
        defaultValue: 'category',
        options: [
          { value: 'category', label: 'Misma categoría' },
          { value: 'tag', label: 'Mismo tag' },
          { value: 'manual', label: 'Selección manual' },
          { value: 'bought_together', label: 'Comprados juntos' },
        ],
      },
      { key: 'max_items', label: 'Máximo de productos', type: 'number', defaultValue: 8, min: 1, max: 20, group: 'data' },
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Productos relacionados', group: 'content' },
    ],
  },
  {
    type: 'product_specs',
    label: 'Especificaciones',
    icon: 'List',
    description: 'Tabla de atributos y especificaciones técnicas del producto',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'title',
        label: 'Título',
        type: 'text',
        placeholder: 'Especificaciones técnicas',
        group: 'content',
      },
      {
        key: 'layout',
        label: 'Disposición',
        type: 'select',
        group: 'layout',
        defaultValue: 'table',
        options: [
          { value: 'table', label: 'Tabla' },
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'Lista' },
        ],
      },
      {
        key: 'show_empty',
        label: 'Mostrar atributos vacíos',
        type: 'boolean',
        defaultValue: false,
        group: 'content',
        helpText: 'Muestra atributos sin valor',
      },
      {
        key: 'group_by_category',
        label: 'Agrupar por categoría',
        type: 'boolean',
        defaultValue: true,
        group: 'layout',
      },
    ],
  },
  {
    type: 'product_faq',
    label: 'Preguntas frecuentes',
    icon: 'HelpCircle',
    description: 'FAQ del producto con JSON-LD para SEO',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'title',
        label: 'Título',
        type: 'text',
        placeholder: 'Preguntas frecuentes',
        group: 'content',
      },
      {
        key: 'items',
        label: 'Preguntas',
        type: 'repeater',
        group: 'content',
        itemLabelKey: 'question',
        itemFields: [
          { key: 'question', label: 'Pregunta', type: 'text', placeholder: '¿Pregunta?' },
          { key: 'answer', label: 'Respuesta', type: 'textarea', placeholder: 'Respuesta...' },
        ],
      },
      {
        key: 'layout',
        label: 'Disposición',
        type: 'select',
        group: 'layout',
        defaultValue: 'accordion',
        options: [
          { value: 'accordion', label: 'Acordeón' },
          { value: 'list', label: 'Lista' },
        ],
      },
    ],
  },
  {
    type: 'product_shipping',
    label: 'Envío y devoluciones',
    icon: 'Truck',
    description: 'Información de envío, tiempos y política de devoluciones',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'title',
        label: 'Título',
        type: 'text',
        placeholder: 'Envío y devoluciones',
        group: 'content',
      },
      {
        key: 'show_delivery_time',
        label: 'Mostrar tiempo de entrega',
        type: 'boolean',
        defaultValue: true,
        group: 'content',
      },
      {
        key: 'show_shipping_cost',
        label: 'Mostrar costo de envío',
        type: 'boolean',
        defaultValue: true,
        group: 'content',
      },
      {
        key: 'show_return_policy',
        label: 'Mostrar política de devoluciones',
        type: 'boolean',
        defaultValue: true,
        group: 'content',
      },
      {
        key: 'custom_message',
        label: 'Mensaje personalizado',
        type: 'textarea',
        placeholder: 'Información adicional sobre envíos...',
        group: 'content',
      },
    ],
  },
  // ---- FASE 9.4 — Secciones de detalle de categoría ----
  {
    type: 'category_header',
    label: 'Cabecera de Categoría',
    icon: 'FolderOpen',
    description: 'Título, descripción, imagen de portada y breadcrumb de la categoría',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      { key: 'show_image', label: 'Mostrar imagen de portada', type: 'boolean', defaultValue: true, group: 'content' },
      { key: 'show_breadcrumb', label: 'Mostrar breadcrumb', type: 'boolean', defaultValue: true, group: 'content' },
      { key: 'show_count', label: 'Mostrar contador de productos', type: 'boolean', defaultValue: true, group: 'content' },
    ],
  },
  {
    type: 'category_filters',
    label: 'Filtros de Categoría',
    icon: 'Filter',
    description: 'Pills de subcategorías, selector de ordenamiento y toggle de vista',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      {
        key: 'filter_position',
        label: 'Posición de filtros',
        type: 'select',
        group: 'layout',
        defaultValue: 'top',
        options: [
          { value: 'top', label: 'Barra superior' },
          { value: 'sidebar', label: 'Sidebar izquierdo' },
          { value: 'drawer', label: 'Drawer móvil' },
        ],
      },
      { key: 'show_sort', label: 'Mostrar ordenamiento', type: 'boolean', defaultValue: true, group: 'content' },
      { key: 'show_view_toggle', label: 'Mostrar toggle grid/lista', type: 'boolean', defaultValue: true, group: 'content' },
    ],
  },
  {
    type: 'category_products',
    label: 'Grid de Productos',
    icon: 'LayoutGrid',
    description: 'Grid de productos de la categoría con paginación',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      { key: 'columns', label: 'Columnas', type: 'number', defaultValue: 4, min: 1, max: 6, group: 'layout' },
      { key: 'max_items', label: 'Productos por página', type: 'number', defaultValue: 12, min: 1, max: 48, group: 'data' },
      { key: 'empty_message', label: 'Mensaje sin productos', type: 'text', placeholder: 'No hay productos en esta categoría', group: 'content' },
    ],
  },
  {
    type: 'category_subcategories',
    label: 'Subcategorías',
    icon: 'FolderTree',
    description: 'Tarjetas de subcategorías con icono e imagen',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Subcategorías', group: 'content' },
      {
        key: 'layout',
        label: 'Disposición',
        type: 'select',
        group: 'layout',
        defaultValue: 'grid',
        options: [
          { value: 'grid', label: 'Grid de tarjetas' },
          { value: 'horizontal', label: 'Lista horizontal' },
        ],
      },
    ],
  },
  {
    type: 'category_seo_text',
    label: 'Texto SEO',
    icon: 'FileText',
    description: 'Bloque de texto al pie de la categoría para SEO',
    variants: [{ id: 'default', label: 'Por defecto' }],
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Sobre esta categoría', group: 'content' },
      { key: 'content', label: 'Contenido', type: 'textarea', placeholder: 'Texto descriptivo para SEO...', group: 'content' },
    ],
  },
];

// ============================================================
// CATÁLOGO FINAL (con grupos inyectados automáticamente)
// ============================================================
//
// Los STYLE_FIELDS y SPACING_FIELDS se inyectan a cada sección para que un
// cambio de estilo beneficie a todos los tipos a la vez (F0.2 + F0.4).
export const SECTION_CATALOG: SectionTypeDefinition[] = RAW_CATALOG.map((s) => ({
  ...s,
  contentFields: [...s.contentFields, ...STYLE_FIELDS, ...SPACING_FIELDS],
}));

export function getSectionDefinition(sectionType: string): SectionTypeDefinition | undefined {
  return SECTION_CATALOG.find((s) => s.type === sectionType);
}

// ============================================================
// SERVICIO
// ============================================================

class WebsitePageBuilderService {
  // ---- PAGES ----

  async getPages(organizationId: number): Promise<WebsitePage[]> {
    const { data, error } = await supabase
      .from('website_pages')
      .select('*')
      .eq('organization_id', organizationId)
      .order('header_order', { ascending: true });

    if (error) throw error;
    return (data || []) as WebsitePage[];
  }

  async getPageWithSections(pageId: string): Promise<WebsitePageWithSections | null> {
    const { data: page, error: pageError } = await supabase
      .from('website_pages')
      .select('*')
      .eq('id', pageId)
      .single();

    if (pageError) {
      if (pageError.code === 'PGRST116') return null;
      throw pageError;
    }

    const { data: sections, error: sectionsError } = await supabase
      .from('website_page_sections')
      .select('*')
      .eq('page_id', pageId)
      .order('sort_order', { ascending: true });

    if (sectionsError) throw sectionsError;

    return {
      ...(page as WebsitePage),
      sections: (sections || []) as WebsitePageSection[],
    };
  }

  async createPage(page: {
    organization_id: number;
    slug: string;
    title: string;
    page_type?: string;
    show_in_header?: boolean;
    show_in_footer?: boolean;
    header_order?: number;
    footer_order?: number;
    parent_page_id?: string | null;
    linked_category_id?: number | null;
    menu_icon?: string | null;
    menu_badge?: string | null;
    page_settings?: Record<string, any> | null;
  }): Promise<WebsitePage> {
    const { data, error } = await supabase
      .from('website_pages')
      .insert({
        ...page,
        page_type: page.page_type || 'builtin',
        is_published: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WebsitePage;
  }

  async updatePage(
    pageId: string,
    updates: Partial<Pick<WebsitePage, 'title' | 'slug' | 'show_in_header' | 'show_in_footer' | 'header_order' | 'footer_order' | 'is_published' | 'meta_title' | 'meta_description' | 'og_image_url' | 'parent_page_id' | 'linked_category_id' | 'menu_icon' | 'menu_badge' | 'page_settings'>>
  ): Promise<WebsitePage> {
    const { data, error } = await supabase
      .from('website_pages')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', pageId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase updatePage error:', error.message, error.code, error.details);
      throw new Error(error.message || 'No se pudo actualizar la página. Verifica que tengas permisos de admin/owner.');
    }
    if (!data) {
      throw new Error('No se pudo actualizar la página. Verifica permisos (se requiere rol owner o admin).');
    }
    return data as WebsitePage;
  }

  async deletePage(pageId: string): Promise<void> {
    const { error } = await supabase
      .from('website_pages')
      .delete()
      .eq('id', pageId);

    if (error) throw error;
  }

  // ---- SECTIONS ----

  async addSection(section: {
    page_id: string;
    organization_id: number;
    section_type: string;
    section_variant: string;
    content?: Record<string, any>;
    settings?: Record<string, any>;
    sort_order: number;
  }): Promise<WebsitePageSection> {
    const { data, error } = await supabase
      .from('website_page_sections')
      .insert({
        ...section,
        content: section.content || {},
        settings: section.settings || {},
        is_visible: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data as WebsitePageSection;
  }

  async updateSection(
    sectionId: string,
    updates: Partial<Pick<WebsitePageSection, 'section_variant' | 'content' | 'settings' | 'sort_order' | 'is_visible'>>
  ): Promise<WebsitePageSection> {
    const { data, error } = await supabase
      .from('website_page_sections')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', sectionId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase updateSection error:', error.message, error.code);
      throw new Error(error.message || 'No se pudo actualizar la sección.');
    }
    if (!data) {
      throw new Error('No se pudo actualizar la sección. Verifica permisos (rol owner o admin).');
    }
    return data as WebsitePageSection;
  }

  async deleteSection(sectionId: string): Promise<void> {
    const { error } = await supabase
      .from('website_page_sections')
      .delete()
      .eq('id', sectionId);

    if (error) throw error;
  }

  async reorderSections(pageId: string, sectionIds: string[]): Promise<void> {
    if (!sectionIds.length) return;

    const timestamp = new Date().toISOString();
    const promises = sectionIds.map((id, index) =>
      supabase
        .from('website_page_sections')
        .update({ sort_order: index, updated_at: timestamp })
        .eq('id', id)
        .eq('page_id', pageId)
    );

    const results = await Promise.all(promises);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) {
      console.error('Supabase reorderSections error:', firstError.error.message);
      throw new Error(firstError.error.message || 'No se pudo reordenar las secciones.');
    }
  }

  async toggleSectionVisibility(sectionId: string, isVisible: boolean): Promise<void> {
    const { error } = await supabase
      .from('website_page_sections')
      .update({ is_visible: isVisible, updated_at: new Date().toISOString() })
      .eq('id', sectionId);

    if (error) throw error;
  }

  // ---- MENU TREE (jerarquía header/footer) ----

  /**
   * Obtiene el árbol jerárquico de páginas para el menú del header.
   * Anida por parent_page_id, ordena por header_order.
   */
  async getMenuTree(organizationId: number): Promise<WebsitePageWithChildren[]> {
    const { data, error } = await supabase
      .from('website_pages')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('show_in_header', true)
      .order('header_order', { ascending: true });

    if (error) throw error;
    return this.buildMenuTree((data || []) as WebsitePage[]);
  }

  /**
   * Obtiene el árbol jerárquico de páginas para el menú del footer.
   */
  async getFooterMenuTree(organizationId: number): Promise<WebsitePageWithChildren[]> {
    const { data, error } = await supabase
      .from('website_pages')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('show_in_footer', true)
      .order('footer_order', { ascending: true });

    if (error) throw error;
    return this.buildMenuTree((data || []) as WebsitePage[]);
  }

  /**
   * Construye un árbol jerárquico desde una lista plana de páginas.
   */
  private buildMenuTree(flat: WebsitePage[]): WebsitePageWithChildren[] {
    const map = new Map<string, WebsitePageWithChildren>();
    const roots: WebsitePageWithChildren[] = [];

    flat.forEach(page => {
      map.set(page.id, { ...page, children: [], level: 0 });
    });

    flat.forEach(page => {
      const node = map.get(page.id)!;
      if (page.parent_page_id === null) {
        roots.push(node);
      } else {
        const parent = map.get(page.parent_page_id);
        if (parent) {
          parent.children.push(node);
          node.level = parent.level + 1;
        } else {
          roots.push(node);
        }
      }
    });

    const sortChildren = (pages: WebsitePageWithChildren[]): WebsitePageWithChildren[] => {
      return pages
        .sort((a, b) => a.header_order - b.header_order)
        .map(p => ({ ...p, children: sortChildren(p.children) }));
    };

    return sortChildren(roots);
  }

  /**
   * Actualiza los campos de menú de una página (jerarquía, categoría vinculada, icono, badge, orden).
   */
  async updatePageMenu(
    pageId: string,
    menu: {
      parent_page_id?: string | null;
      linked_category_id?: number | null;
      menu_icon?: string | null;
      menu_badge?: string | null;
      header_order?: number;
      footer_order?: number;
      show_in_header?: boolean;
      show_in_footer?: boolean;
    }
  ): Promise<WebsitePage> {
    const { data, error } = await supabase
      .from('website_pages')
      .update({ ...menu, updated_at: new Date().toISOString() })
      .eq('id', pageId)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase updatePageMenu error:', error.message, error.code);
      throw new Error(error.message || 'No se pudo actualizar el menú de la página.');
    }
    if (!data) {
      throw new Error('No se pudo actualizar el menú. Verifica permisos (rol owner o admin).');
    }
    return data as WebsitePage;
  }

  /**
   * Reordena los items del menú del header en lote.
   */
  async reorderMenuItems(items: { id: string; header_order: number }[]): Promise<void> {
    if (!items.length) return;
    const timestamp = new Date().toISOString();
    const promises = items.map(item =>
      supabase
        .from('website_pages')
        .update({ header_order: item.header_order, updated_at: timestamp })
        .eq('id', item.id)
    );
    const results = await Promise.all(promises);
    const firstError = results.find(r => r.error);
    if (firstError?.error) {
      throw new Error(firstError.error.message || 'No se pudo reordenar el menú.');
    }
  }

  // ---- SEED DEFAULT PAGES ----

  /**
   * Crea las páginas estándar según el tipo de negocio con la estructura correcta:
   * Hero (minimal) + sección de contenido (sin título duplicado).
   * @param typeId - ID del tipo de organización (1=restaurant, 2=hotel, 3=retail, 4=services, 5=gym, 6=parking, 7=transport)
   */
  async seedDefaultPages(organizationId: number, typeId?: number): Promise<void> {
    const pages = this.getDefaultPagesForType(typeId || 3);
    const contactPage = {
      title: 'Contacto',
      slug: 'contacto',
      show_in_header: true,
      header_order: 10,
      sections: [
        { section_type: 'hero', section_variant: 'minimal', content: { title: 'Contáctanos', subtitle: 'Estamos aquí para ayudarte' }, sort_order: 0 },
        { section_type: 'contact_form', section_variant: 'split', content: {}, sort_order: 1 },
        { section_type: 'map', section_variant: 'full_width', content: { title: 'Encuéntranos', subtitle: 'Visítanos en nuestra sede' }, sort_order: 2 },
      ],
    };

    const allPages = [...pages, contactPage];

    for (const pageDef of allPages) {
      // Verificar si la página ya existe
      const { data: existing } = await supabase
        .from('website_pages')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('slug', pageDef.slug)
        .maybeSingle();

      if (existing) continue; // No duplicar

      // Crear página
      const { data: page, error: pageError } = await supabase
        .from('website_pages')
        .insert({
          organization_id: organizationId,
          title: pageDef.title,
          slug: pageDef.slug,
          page_type: 'builtin',
          show_in_header: pageDef.show_in_header,
          header_order: pageDef.header_order,
          is_published: true,
        })
        .select()
        .single();

      if (pageError || !page) {
        console.error(`Error creating page ${pageDef.slug}:`, pageError);
        continue;
      }

      // Crear secciones
      const sectionsToInsert = pageDef.sections.map((s) => ({
        page_id: page.id,
        organization_id: organizationId,
        section_type: s.section_type,
        section_variant: s.section_variant,
        content: s.content,
        settings: {},
        sort_order: s.sort_order,
        is_visible: true,
      }));

      const { error: sectionsError } = await supabase
        .from('website_page_sections')
        .insert(sectionsToInsert);

      if (sectionsError) {
        console.error(`Error creating sections for ${pageDef.slug}:`, sectionsError);
      }
    }
  }

  /**
   * Retorna el set de páginas por defecto según el tipo de negocio.
   */
  private getDefaultPagesForType(typeId: number) {
    const pageSets: Record<number, Array<{ title: string; slug: string; show_in_header: boolean; header_order: number; sections: Array<{ section_type: string; section_variant: string; content: Record<string, any>; sort_order: number }> }>> = {
      // Restaurant
      1: [
        {
          title: 'Menú', slug: 'menu', show_in_header: true, header_order: 1,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Nuestro Menú', subtitle: 'Descubre nuestros platos' }, sort_order: 0 },
            { section_type: 'menu_preview', section_variant: 'tabs', content: {}, sort_order: 1 },
          ],
        },
        {
          title: 'Ofertas', slug: 'ofertas', show_in_header: true, header_order: 2,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Ofertas Especiales', subtitle: 'Aprovecha nuestras promociones' }, sort_order: 0 },
            { section_type: 'offers', section_variant: 'grid', content: {}, sort_order: 1 },
          ],
        },
      ],
      // Hotel
      2: [
        {
          title: 'Habitaciones', slug: 'espacios', show_in_header: true, header_order: 1,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Nuestras Habitaciones', subtitle: 'Comodidad y descanso para ti' }, sort_order: 0 },
            { section_type: 'room_types', section_variant: 'cards', content: {}, sort_order: 1 },
          ],
        },
        {
          title: 'Servicios', slug: 'servicios', show_in_header: true, header_order: 2,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Nuestros Servicios', subtitle: 'Todo lo que necesitas para tu estancia' }, sort_order: 0 },
            { section_type: 'services_list', section_variant: 'cards', content: {}, sort_order: 1 },
          ],
        },
      ],
      // Retail
      3: [
        {
          title: 'Productos', slug: 'productos', show_in_header: true, header_order: 1,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Nuestros Productos', subtitle: 'Descubre todo lo que tenemos para ti' }, sort_order: 0 },
            { section_type: 'products_grid', section_variant: 'grid', content: {}, sort_order: 1 },
          ],
        },
        {
          title: 'Categorías', slug: 'categorias', show_in_header: true, header_order: 2,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Categorías', subtitle: 'Explora nuestros productos por categoría' }, sort_order: 0 },
            { section_type: 'categories_grid', section_variant: 'grid', content: {}, sort_order: 1 },
          ],
        },
        {
          title: 'Ofertas', slug: 'ofertas', show_in_header: true, header_order: 3,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Ofertas Especiales', subtitle: 'Aprovecha nuestros mejores descuentos' }, sort_order: 0 },
            { section_type: 'offers', section_variant: 'grid', content: {}, sort_order: 1 },
            { section_type: 'featured_products', section_variant: 'carousel', content: { title: 'Productos Destacados', subtitle: 'Lo más popular de nuestra tienda' }, sort_order: 2 },
          ],
        },
      ],
      // Services
      4: [
        {
          title: 'Servicios', slug: 'servicios', show_in_header: true, header_order: 1,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Nuestros Servicios', subtitle: 'Conoce todo lo que podemos hacer por ti' }, sort_order: 0 },
            { section_type: 'services_list', section_variant: 'cards', content: {}, sort_order: 1 },
          ],
        },
      ],
      // Gym
      5: [
        {
          title: 'Membresías', slug: 'membresias', show_in_header: true, header_order: 1,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Nuestros Planes', subtitle: 'Elige el plan perfecto para ti' }, sort_order: 0 },
            { section_type: 'membership_plans', section_variant: 'pricing_table', content: {}, sort_order: 1 },
          ],
        },
        {
          title: 'Servicios', slug: 'servicios', show_in_header: true, header_order: 2,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Clases y Servicios', subtitle: 'Entrena con los mejores' }, sort_order: 0 },
            { section_type: 'services_list', section_variant: 'cards', content: {}, sort_order: 1 },
          ],
        },
      ],
      // Parking
      6: [
        {
          title: 'Tarifas', slug: 'productos', show_in_header: true, header_order: 1,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Tarifas', subtitle: 'Consulta nuestras tarifas de estacionamiento' }, sort_order: 0 },
            { section_type: 'products_grid', section_variant: 'grid', content: {}, sort_order: 1 },
          ],
        },
        {
          title: 'Pases', slug: 'pases', show_in_header: true, header_order: 2,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Pases de Estacionamiento', subtitle: 'Obtén tu pase mensual o anual' }, sort_order: 0 },
            { section_type: 'membership_plans', section_variant: 'pricing_table', content: {}, sort_order: 1 },
          ],
        },
      ],
      // Transport
      7: [
        {
          title: 'Viajes', slug: 'viajes', show_in_header: true, header_order: 1,
          sections: [
            { section_type: 'hero', section_variant: 'minimal', content: { title: 'Viajes Disponibles', subtitle: 'Encuentra tu próximo destino' }, sort_order: 0 },
            { section_type: 'products_grid', section_variant: 'grid', content: {}, sort_order: 1 },
          ],
        },
      ],
    };

    return pageSets[typeId] || pageSets[3]; // Fallback a retail
  }

  // ---- POLICY PAGES ----

  /**
   * Crea una página de tipo "policy" (términos, privacidad, cookies, envíos, devoluciones).
   * Las páginas de política son páginas normales con page_type='policy' y show_in_footer=true.
   */
  async createPolicyPage(organizationId: number, data: {
    slug: string;
    title: string;
    description?: string | null;
    meta_title?: string | null;
    meta_description?: string | null;
    footer_order?: number;
  }): Promise<WebsitePage> {
    const { data: page, error } = await supabase
      .from('website_pages')
      .insert({
        organization_id: organizationId,
        slug: data.slug,
        title: data.title,
        description: data.description ?? null,
        page_type: 'policy',
        show_in_header: false,
        show_in_footer: true,
        header_order: 0,
        footer_order: data.footer_order ?? 0,
        is_published: true,
        meta_title: data.meta_title ?? null,
        meta_description: data.meta_description ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return page as WebsitePage;
  }

  /**
   * Obtiene todas las páginas de tipo "policy" de una organización.
   */
  async getPolicyPages(organizationId: number): Promise<WebsitePage[]> {
    const { data, error } = await supabase
      .from('website_pages')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('page_type', 'policy')
      .order('footer_order', { ascending: true });

    if (error) throw error;
    return (data || []) as WebsitePage[];
  }

  // ---- DRAFTS / VERSIONS / PRESETS (FASE 12) ----

  /**
   * Guarda el borrador de una página en `draft_content` (no impacta producción).
   * Marca `has_unpublished_changes = true`.
   */
  async saveDraft(pageId: string, sections: WebsitePageSection[]): Promise<void> {
    const { error } = await supabase
      .from('website_pages')
      .update({
        draft_content: { sections },
        has_unpublished_changes: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pageId);

    if (error) throw new Error(error.message || 'No se pudo guardar el borrador.');
  }

  /**
   * Publica el borrador: copia `draft_content.sections` a las secciones vivas
   * (upsert por id, inserta nuevas, elimina las que ya no existen), crea una
   * versión en `website_page_versions` y limpia el borrador.
   */
  async publishPage(
    pageId: string,
    organizationId: number,
    draftSections: WebsitePageSection[],
    note?: string,
  ): Promise<WebsitePageVersion> {
    // 1. Snapshot de las secciones publicadas actuales (antes de pisar)
    const { data: currentSections } = await supabase
      .from('website_page_sections')
      .select('*')
      .eq('page_id', pageId)
      .order('sort_order', { ascending: true });

    const current = (currentSections || []) as WebsitePageSection[];

    // 2. Sincronizar secciones vivas con el borrador
    const draftIds = new Set(draftSections.map((s) => s.id));
    const currentIds = new Set(current.map((s) => s.id));

    // 2a. Eliminar secciones que ya no están en el borrador
    const toDelete = current.filter((s) => !draftIds.has(s.id));
    if (toDelete.length) {
      await supabase
        .from('website_page_sections')
        .delete()
        .in('id', toDelete.map((s) => s.id));
    }

    // 2b. Upsert: insertar nuevas + actualizar existentes
    const timestamp = new Date().toISOString();
    const upserts = draftSections.map((s, index) => ({
      id: s.id,
      page_id: pageId,
      organization_id: organizationId,
      section_type: s.section_type,
      section_variant: s.section_variant,
      content: s.content,
      settings: s.settings || {},
      sort_order: index,
      is_visible: s.is_visible,
      updated_at: timestamp,
    }));

    if (upserts.length) {
      const { error: upsertError } = await supabase
        .from('website_page_sections')
        .upsert(upserts, { onConflict: 'id' });
      if (upsertError) throw new Error(upsertError.message || 'No se pudo publicar las secciones.');
    }

    // 3. Crear versión (snapshot del estado publicado)
    const { data: version, error: versionError } = await supabase
      .from('website_page_versions')
      .insert({
        page_id: pageId,
        organization_id: organizationId,
        content_snapshot: { sections: draftSections },
        note: note || null,
      })
      .select()
      .single();

    if (versionError) throw new Error(versionError.message || 'No se pudo crear la versión.');

    // 4. Limpiar borrador y marcar publicado
    await supabase
      .from('website_pages')
      .update({
        draft_content: null,
        has_unpublished_changes: false,
        published_at: timestamp,
        updated_at: timestamp,
      })
      .eq('id', pageId);

    // 5. Retención: últimas 20 versiones
    await this.pruneVersions(pageId, 20);

    return version as WebsitePageVersion;
  }

  /**
   * Restaura una versión anterior: copia su `content_snapshot.sections` a las
   * secciones vivas y crea una nueva versión (para no perder la actual).
   */
  async restoreVersion(
    pageId: string,
    organizationId: number,
    versionId: string,
  ): Promise<void> {
    const { data: version, error } = await supabase
      .from('website_page_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error || !version) throw new Error('No se pudo cargar la versión.');

    const snapshot = (version.content_snapshot as { sections: WebsitePageSection[] }).sections;
    await this.publishPage(pageId, organizationId, snapshot, `Restaurado desde versión ${versionId}`);
  }

  /**
   * Obtiene el historial de versiones de una página.
   */
  async getVersions(pageId: string): Promise<WebsitePageVersion[]> {
    const { data, error } = await supabase
      .from('website_page_versions')
      .select('*')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as WebsitePageVersion[];
  }

  /**
   * Elimina versiones antiguas más allá del límite de retención.
   */
  private async pruneVersions(pageId: string, keep: number): Promise<void> {
    const { data } = await supabase
      .from('website_page_versions')
      .select('id')
      .eq('page_id', pageId)
      .order('created_at', { ascending: false })
      .limit(keep);

    const keepIds = new Set((data || []).map((v: any) => v.id));
    const { data: all } = await supabase
      .from('website_page_versions')
      .select('id')
      .eq('page_id', pageId);

    const toDelete = (all || []).filter((v: any) => !keepIds.has(v.id));
    if (toDelete.length) {
      await supabase
        .from('website_page_versions')
        .delete()
        .in('id', toDelete.map((v: any) => v.id));
    }
  }

  /**
   * Duplica una sección: crea una copia con sort_order + 1 y nuevo id.
   */
  async duplicateSection(sectionId: string): Promise<WebsitePageSection> {
    const { data: section, error } = await supabase
      .from('website_page_sections')
      .select('*')
      .eq('id', sectionId)
      .single();

    if (error || !section) throw new Error('No se pudo cargar la sección a duplicar.');

    const { data: newSection, error: insertError } = await supabase
      .from('website_page_sections')
      .insert({
        page_id: section.page_id,
        organization_id: section.organization_id,
        section_type: section.section_type,
        section_variant: section.section_variant,
        content: section.content,
        settings: section.settings,
        sort_order: (section.sort_order || 0) + 1,
        is_visible: section.is_visible,
      })
      .select()
      .single();

    if (insertError) throw new Error(insertError.message || 'No se pudo duplicar la sección.');
    return newSection as WebsitePageSection;
  }

  // ---- SECTION PRESETS (FASE 12) ----

  async getSectionPresets(organizationId: number): Promise<WebsiteSectionPreset[]> {
    const { data, error } = await supabase
      .from('website_section_presets')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data || []) as WebsiteSectionPreset[];
  }

  async saveSectionPreset(
    organizationId: number,
    name: string,
    sectionType: string,
    sectionVariant: string,
    content: Record<string, any>,
  ): Promise<WebsiteSectionPreset> {
    const { data, error } = await supabase
      .from('website_section_presets')
      .insert({
        organization_id: organizationId,
        name,
        section_type: sectionType,
        section_variant: sectionVariant,
        content,
      })
      .select()
      .single();

    if (error) throw new Error(error.message || 'No se pudo guardar la plantilla.');
    return data as WebsiteSectionPreset;
  }

  async deleteSectionPreset(presetId: string): Promise<void> {
    const { error } = await supabase
      .from('website_section_presets')
      .delete()
      .eq('id', presetId);

    if (error) throw error;
  }

  // ---- PREVIEW URL ----

  async getPreviewUrl(organizationId: number, slug?: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('organization_domains')
      .select('host, domain_type, is_primary')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      // Fallback: check subdomain on organizations table
      const { data: org } = await supabase
        .from('organizations')
        .select('subdomain')
        .eq('id', organizationId)
        .single();

      if (org?.subdomain) {
        const base = `https://${org.subdomain}.goadmin.io`;
        return slug && slug !== 'home' ? `${base}/${slug}` : base;
      }
      return null;
    }

    const base = `https://${data.host}`;
    return slug && slug !== 'home' ? `${base}/${slug}` : base;
  }

  // ---- F9.4: ENTIDADES PARA PREVIEW DE PLANTILLAS DE DETALLE ----

  /**
   * Obtiene una lista de entidades para el selector de contexto del editor.
   * Dependiendo del page_type, devuelve productos, categorías o espacios.
   */
  async getPreviewEntities(
    organizationId: number,
    pageType: string,
  ): Promise<Array<{ id: string; label: string }>> {
    if (pageType === 'product_detail') {
      const { data, error } = await supabase
        .from('products')
        .select('id, uuid, name, sku')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('name', { ascending: true })
        .limit(50);
      if (error || !data) return [];
      return data.map((p: any) => ({
        id: p.uuid,
        label: `${p.name}${p.sku ? ` (${p.sku})` : ''}`,
      }));
    }

    if (pageType === 'category_detail') {
      const { data, error } = await supabase
        .from('categories')
        .select('id, slug, name')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })
        .limit(50);
      if (error || !data) return [];
      return data.map((c: any) => ({
        id: c.slug,
        label: c.name,
      }));
    }

    if (pageType === 'space_detail') {
      const { data, error } = await supabase
        .from('space_types')
        .select('id, slug, name')
        .eq('organization_id', organizationId)
        .order('name', { ascending: true })
        .limit(50);
      if (error || !data) return [];
      return data.map((s: any) => ({
        id: s.slug,
        label: s.name,
      }));
    }

    // cart, checkout, order_confirmation, account — no requieren selector
    return [];
  }
}

export const websitePageBuilderService = new WebsitePageBuilderService();
