/**
 * Grupos de campos reutilizables para el editor de secciones (FASE 0 - F0.2).
 *
 * Estos grupos se inyectan automáticamente en cada definición de sección al
 * construir `SECTION_CATALOG` (ver `websitePageBuilderService.ts`), de modo
 * que un cambio de estilo beneficia a todos los tipos a la vez.
 *
 * - `STYLE_FIELDS`: fondo, color de texto, bordes, sombra, ancho de contenedor.
 *   Se inyecta en TODAS las secciones.
 * - `CAROUSEL_FIELDS`: se inyecta solo en secciones tipo carrusel (a demanda).
 * - `GRID_FIELDS`: rejilla responsive (columnas/filas/gap/aspect_ratio).
 * - `CARD_FIELDS`: apariencia de tarjetas (radius, shadow, hover, layout...).
 * - `BUTTON_ITEM_FIELDS`: campos de un item-botón dentro de un repeater.
 *
 * Los campos de padding/margen los cubre hoy `SectionSpacingEditor`; se
 * migran aquí en 0.4 como `SPACING_FIELDS`.
 */

import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';

// ============================================================
// STYLE_FIELDS — inyectado en todas las secciones
// ============================================================

export const STYLE_FIELDS: ContentFieldDef[] = [
  {
    key: 'bg_type',
    label: 'Tipo de fondo',
    type: 'select',
    group: 'style',
    defaultValue: 'none',
    options: [
      { value: 'none', label: 'Sin fondo' },
      { value: 'color', label: 'Color' },
      { value: 'gradient', label: 'Degradado' },
      { value: 'image', label: 'Imagen' },
    ],
  },
  {
    key: 'bg_color',
    label: 'Color de fondo',
    type: 'color',
    group: 'style',
    showIf: { field: 'bg_type', equals: 'color' },
  },
  {
    key: 'bg_gradient_from',
    label: 'Degradado desde',
    type: 'color',
    group: 'style',
    showIf: { field: 'bg_type', equals: 'gradient' },
  },
  {
    key: 'bg_gradient_to',
    label: 'Degradado hasta',
    type: 'color',
    group: 'style',
    showIf: { field: 'bg_type', equals: 'gradient' },
  },
  {
    key: 'bg_gradient_dir',
    label: 'Dirección',
    type: 'select',
    group: 'style',
    defaultValue: 'to-r',
    showIf: { field: 'bg_type', equals: 'gradient' },
    options: [
      { value: 'to-r', label: '→ Izquierda a derecha' },
      { value: 'to-br', label: '↘ Diagonal abajo-derecha' },
      { value: 'to-b', label: '↓ Arriba a abajo' },
      { value: 'to-bl', label: '↙ Diagonal abajo-izquierda' },
      { value: 'to-l', label: '← Derecha a izquierda' },
      { value: 'to-t', label: '↑ Abajo a arriba' },
      { value: 'to-tr', label: '↗ Diagonal arriba-derecha' },
      { value: 'to-tl', label: '↖ Diagonal arriba-izquierda' },
    ],
  },
  {
    key: 'bg_image',
    label: 'Imagen de fondo',
    type: 'image',
    group: 'style',
    showIf: { field: 'bg_type', equals: 'image' },
  },
  {
    key: 'bg_overlay',
    label: 'Opacidad del overlay',
    type: 'range',
    group: 'style',
    min: 0,
    max: 100,
    step: 5,
    defaultValue: 0,
    suffix: '%',
    showIf: { field: 'bg_type', equals: 'image' },
  },
  {
    key: 'text_color',
    label: 'Color del texto',
    type: 'color',
    group: 'style',
  },
  {
    key: 'radius',
    label: 'Radio de borde',
    type: 'range',
    group: 'style',
    min: 0,
    max: 48,
    step: 2,
    defaultValue: 0,
    suffix: 'px',
  },
  {
    key: 'shadow',
    label: 'Sombra',
    type: 'select',
    group: 'style',
    defaultValue: 'none',
    options: [
      { value: 'none', label: 'Ninguna' },
      { value: 'sm', label: 'Suave' },
      { value: 'md', label: 'Media' },
      { value: 'lg', label: 'Fuerte' },
      { value: 'xl', label: 'Muy fuerte' },
    ],
  },
  {
    key: 'border_width',
    label: 'Grosor del borde',
    type: 'range',
    group: 'style',
    min: 0,
    max: 8,
    step: 1,
    defaultValue: 0,
    suffix: 'px',
  },
  {
    key: 'border_color',
    label: 'Color del borde',
    type: 'color',
    group: 'style',
    showIf: { field: 'border_width', in: [1, 2, 3, 4, 5, 6, 7, 8] },
  },
  {
    key: 'full_bleed',
    label: 'Ancho completo de pantalla',
    type: 'boolean',
    group: 'layout',
    defaultValue: false,
  },
  {
    key: 'container_width',
    label: 'Ancho del contenido',
    type: 'select',
    group: 'layout',
    defaultValue: 'lg',
    showIf: { field: 'full_bleed', equals: false },
    options: [
      { value: 'sm', label: 'Estrecho' },
      { value: 'md', label: 'Medio' },
      { value: 'lg', label: 'Ancho (por defecto)' },
      { value: 'xl', label: 'Extra ancho' },
    ],
  },
];

// ============================================================
// CAROUSEL_FIELDS — inyectar en secciones tipo carrusel
// ============================================================

export const CAROUSEL_FIELDS: ContentFieldDef[] = [
  {
    key: 'autoplay',
    label: 'Reproducción automática',
    type: 'boolean',
    group: 'carousel',
    defaultValue: true,
  },
  {
    key: 'interval_ms',
    label: 'Tiempo entre slides',
    type: 'range',
    group: 'carousel',
    min: 1000,
    max: 15000,
    step: 500,
    defaultValue: 5000,
    suffix: 'ms',
    showIf: { field: 'autoplay', equals: true },
  },
  {
    key: 'pause_on_hover',
    label: 'Pausar al pasar el mouse',
    type: 'boolean',
    group: 'carousel',
    defaultValue: true,
    showIf: { field: 'autoplay', equals: true },
  },
  {
    key: 'loop',
    label: 'Repetir en bucle',
    type: 'boolean',
    group: 'carousel',
    defaultValue: true,
  },
  {
    key: 'transition',
    label: 'Transición',
    type: 'select',
    group: 'carousel',
    defaultValue: 'slide',
    options: [
      { value: 'slide', label: 'Deslizar' },
      { value: 'fade', label: 'Fundido' },
      { value: 'zoom', label: 'Zoom' },
    ],
  },
  {
    key: 'transition_ms',
    label: 'Velocidad de transición',
    type: 'range',
    group: 'carousel',
    min: 150,
    max: 1500,
    step: 50,
    defaultValue: 500,
    suffix: 'ms',
  },
  {
    key: 'show_arrows',
    label: 'Mostrar flechas',
    type: 'boolean',
    group: 'carousel',
    defaultValue: true,
  },
  {
    key: 'arrow_style',
    label: 'Estilo de flecha',
    type: 'select',
    group: 'carousel',
    defaultValue: 'circle',
    showIf: { field: 'show_arrows', equals: true },
    options: [
      { value: 'circle', label: 'Círculo' },
      { value: 'square', label: 'Cuadrado' },
      { value: 'minimal', label: 'Minimal' },
      { value: 'chevron', label: 'Solo chevrón' },
    ],
  },
  {
    key: 'arrow_position',
    label: 'Posición de flechas',
    type: 'select',
    group: 'carousel',
    defaultValue: 'inside',
    showIf: { field: 'show_arrows', equals: true },
    options: [
      { value: 'inside', label: 'Dentro' },
      { value: 'outside', label: 'Fuera' },
      { value: 'top-right', label: 'Arriba derecha' },
      { value: 'bottom', label: 'Abajo' },
    ],
  },
  {
    key: 'arrow_size',
    label: 'Tamaño de flecha',
    type: 'range',
    group: 'carousel',
    min: 24,
    max: 72,
    step: 4,
    defaultValue: 40,
    suffix: 'px',
    showIf: { field: 'show_arrows', equals: true },
  },
  {
    key: 'arrow_color',
    label: 'Color de flecha',
    type: 'color',
    group: 'carousel',
    showIf: { field: 'show_arrows', equals: true },
  },
  {
    key: 'arrow_bg_color',
    label: 'Fondo de flecha',
    type: 'color',
    group: 'carousel',
    showIf: { field: 'show_arrows', equals: true },
  },
  {
    key: 'show_dots',
    label: 'Mostrar puntos',
    type: 'boolean',
    group: 'carousel',
    defaultValue: true,
  },
  {
    key: 'dot_style',
    label: 'Estilo de puntos',
    type: 'select',
    group: 'carousel',
    defaultValue: 'dots',
    showIf: { field: 'show_dots', equals: true },
    options: [
      { value: 'dots', label: 'Puntos' },
      { value: 'bars', label: 'Barras' },
      { value: 'numbers', label: 'Números' },
    ],
  },
  {
    key: 'enable_swipe',
    label: 'Deslizar con el dedo',
    type: 'boolean',
    group: 'carousel',
    defaultValue: true,
  },
  {
    key: 'slides_per_view',
    label: 'Elementos visibles',
    type: 'number',
    group: 'carousel',
    responsive: true,
    min: 1,
    max: 8,
    defaultValue: 1,
  },
];

// ============================================================
// GRID_FIELDS — rejilla responsive
// ============================================================

export const GRID_FIELDS: ContentFieldDef[] = [
  {
    key: 'columns',
    label: 'Columnas',
    type: 'number',
    group: 'layout',
    responsive: true,
    min: 1,
    max: 8,
    defaultValue: 3,
  },
  {
    key: 'rows',
    label: 'Filas máximas',
    type: 'number',
    group: 'layout',
    min: 1,
    max: 10,
  },
  {
    key: 'gap',
    label: 'Separación',
    type: 'range',
    group: 'layout',
    min: 0,
    max: 48,
    step: 4,
    defaultValue: 16,
    suffix: 'px',
  },
  {
    key: 'aspect_ratio',
    label: 'Proporción',
    type: 'select',
    group: 'layout',
    defaultValue: 'auto',
    options: [
      { value: 'auto', label: 'Automática' },
      { value: '1/1', label: 'Cuadrada' },
      { value: '4/3', label: '4:3' },
      { value: '3/4', label: '3:4 (vertical)' },
      { value: '16/9', label: '16:9' },
    ],
  },
];

// ============================================================
// BUTTON_ITEM_FIELDS — item-botón (uso típico: repeater de botones)
// Definido ANTES que CARD_FIELDS porque este lo spreadea en
// `card_buttons.itemFields` (los const no se hoistean).
// ============================================================

export const BUTTON_ITEM_FIELDS: ContentFieldDef[] = [
  { key: 'label', label: 'Texto', type: 'text', group: 'content' },
  { key: 'url', label: 'Enlace', type: 'url', group: 'content' },
  {
    key: 'variant',
    label: 'Estilo',
    type: 'select',
    group: 'style',
    defaultValue: 'solid',
    options: [
      { value: 'solid', label: 'Sólido' },
      { value: 'outline', label: 'Contorno' },
      { value: 'ghost', label: 'Transparente' },
      { value: 'link', label: 'Enlace' },
    ],
  },
  {
    key: 'size',
    label: 'Tamaño',
    type: 'select',
    group: 'style',
    defaultValue: 'md',
    options: [
      { value: 'sm', label: 'Pequeño' },
      { value: 'md', label: 'Mediano' },
      { value: 'lg', label: 'Grande' },
      { value: 'xl', label: 'Extra grande' },
    ],
  },
  { key: 'icon', label: 'Icono', type: 'icon', group: 'content' },
  {
    key: 'icon_position',
    label: 'Posición del icono',
    type: 'select',
    group: 'layout',
    defaultValue: 'left',
    options: [
      { value: 'left', label: 'Izquierda' },
      { value: 'right', label: 'Derecha' },
    ],
  },
  { key: 'bg_color', label: 'Color', type: 'color', group: 'style' },
  { key: 'text_color', label: 'Color del texto', type: 'color', group: 'style' },
  {
    key: 'radius',
    label: 'Radio',
    type: 'range',
    group: 'style',
    min: 0,
    max: 48,
    step: 2,
    defaultValue: 8,
    suffix: 'px',
  },
  {
    key: 'full_width_mobile',
    label: 'Ancho completo en móvil',
    type: 'boolean',
    group: 'behavior',
    defaultValue: true,
  },
  {
    key: 'open_new_tab',
    label: 'Abrir en pestaña nueva',
    type: 'boolean',
    group: 'behavior',
    defaultValue: false,
  },
];

// ============================================================
// CARD_FIELDS — apariencia de tarjetas
// ============================================================

export const CARD_FIELDS: ContentFieldDef[] = [
  {
    key: 'card_radius',
    label: 'Radio de la tarjeta',
    type: 'range',
    group: 'style',
    min: 0,
    max: 48,
    step: 2,
    defaultValue: 8,
    suffix: 'px',
  },
  {
    key: 'card_shadow',
    label: 'Sombra de la tarjeta',
    type: 'select',
    group: 'style',
    defaultValue: 'sm',
    options: [
      { value: 'none', label: 'Ninguna' },
      { value: 'sm', label: 'Suave' },
      { value: 'md', label: 'Media' },
      { value: 'lg', label: 'Fuerte' },
      { value: 'xl', label: 'Muy fuerte' },
    ],
  },
  {
    key: 'card_border_width',
    label: 'Grosor del borde de la tarjeta',
    type: 'range',
    group: 'style',
    min: 0,
    max: 8,
    step: 1,
    defaultValue: 0,
    suffix: 'px',
  },
  {
    key: 'card_border_color',
    label: 'Color del borde de la tarjeta',
    type: 'color',
    group: 'style',
    showIf: { field: 'card_border_width', in: [1, 2, 3, 4, 5, 6, 7, 8] },
  },
  {
    key: 'card_bg',
    label: 'Fondo de la tarjeta',
    type: 'color',
    group: 'style',
  },
  {
    key: 'card_padding',
    label: 'Padding interno',
    type: 'range',
    group: 'layout',
    min: 0,
    max: 48,
    step: 4,
    defaultValue: 16,
    suffix: 'px',
  },
  {
    key: 'card_hover',
    label: 'Efecto al pasar el mouse',
    type: 'select',
    group: 'behavior',
    defaultValue: 'none',
    options: [
      { value: 'none', label: 'Ninguno' },
      { value: 'zoom', label: 'Zoom' },
      { value: 'lift', label: 'Elevar' },
      { value: 'glow', label: 'Brillo' },
      { value: 'border', label: 'Borde' },
    ],
  },
  {
    key: 'card_shadow_hover',
    label: 'Sombra al pasar el mouse',
    type: 'select',
    group: 'behavior',
    defaultValue: 'lg',
    options: [
      { value: 'none', label: 'Ninguna' },
      { value: 'sm', label: 'Suave' },
      { value: 'md', label: 'Media' },
      { value: 'lg', label: 'Fuerte' },
      { value: 'xl', label: 'Muy fuerte' },
    ],
  },
  {
    key: 'card_layout',
    label: 'Disposición de la tarjeta',
    type: 'select',
    group: 'layout',
    defaultValue: 'vertical',
    options: [
      { value: 'vertical', label: 'Vertical' },
      { value: 'horizontal', label: 'Horizontal' },
      { value: 'overlay', label: 'Superpuesta' },
    ],
  },
  {
    key: 'image_fit',
    label: 'Ajuste de la imagen',
    type: 'select',
    group: 'style',
    defaultValue: 'cover',
    options: [
      { value: 'cover', label: 'Cubrir' },
      { value: 'contain', label: 'Contener' },
      { value: 'fill', label: 'Rellenar' },
    ],
  },
  {
    key: 'image_ratio',
    label: 'Proporción de la imagen',
    type: 'select',
    group: 'style',
    defaultValue: '1:1',
    options: [
      { value: '1:1', label: 'Cuadrada (1:1)' },
      { value: '4:3', label: '4:3' },
      { value: '3:4', label: '3:4 (vertical)' },
      { value: '16:9', label: '16:9' },
    ],
  },
  {
    key: 'text_align',
    label: 'Alineación del texto',
    type: 'alignment',
    group: 'layout',
    defaultValue: 'left',
  },
  {
    key: 'title_lines',
    label: 'Límites de líneas del título',
    type: 'select',
    group: 'layout',
    defaultValue: '2',
    options: [
      { value: '1', label: '1 línea' },
      { value: '2', label: '2 líneas' },
      { value: '3', label: '3 líneas' },
    ],
  },
  {
    key: 'show_description',
    label: 'Mostrar descripción',
    type: 'boolean',
    group: 'content',
    defaultValue: false,
  },
  {
    key: 'price_style',
    label: 'Estilo del precio',
    type: 'select',
    group: 'style',
    defaultValue: 'inline',
    options: [
      { value: 'inline', label: 'En línea' },
      { value: 'stacked', label: 'Apilado' },
    ],
  },
  {
    key: 'show_compare_price',
    label: 'Mostrar precio tachado',
    type: 'boolean',
    group: 'content',
    defaultValue: true,
  },
  {
    key: 'currency_position',
    label: 'Posición del símbolo',
    type: 'select',
    group: 'style',
    defaultValue: 'prefix',
    options: [
      { value: 'prefix', label: 'Antes ($100)' },
      { value: 'suffix', label: 'Después (100$)' },
    ],
  },
];

// ============================================================
// PRODUCT_CARD_INTERACTION_FIELDS — badges, botones y rating de cards de producto
// ============================================================

export const PRODUCT_CARD_INTERACTION_FIELDS: ContentFieldDef[] = [
  {
    key: 'badges',
    label: 'Etiquetas (badges)',
    type: 'repeater',
    group: 'content',
    itemLabelKey: 'type',
    itemFields: [
      {
        key: 'type',
        label: 'Tipo',
        type: 'select',
        group: 'content',
        options: [
          { value: 'discount', label: 'Descuento' },
          { value: 'new', label: 'Nuevo' },
          { value: 'bestseller', label: 'Más vendido' },
          { value: 'out_of_stock', label: 'Agotado' },
          { value: 'low_stock', label: 'Poco stock' },
          { value: 'free_shipping', label: 'Envío gratis' },
          { value: 'variants', label: 'Variantes' },
          { value: 'sales_count', label: 'N° vendidos' },
          { value: 'rating', label: 'Valoración' },
          { value: 'custom', label: 'Personalizado' },
        ],
      },
      {
        key: 'label',
        label: 'Texto',
        type: 'text',
        group: 'content',
        helpText: 'Usa {value} para el dato: "-{value}%"',
      },
      {
        key: 'condition_value',
        label: 'Valor de condición',
        type: 'number',
        group: 'behavior',
        helpText: 'Ej: mostrar "nuevo" si tiene menos de N días',
      },
      { key: 'bg_color', label: 'Color de fondo', type: 'color', group: 'style' },
      { key: 'text_color', label: 'Color del texto', type: 'color', group: 'style' },
      {
        key: 'position',
        label: 'Posición',
        type: 'select',
        group: 'layout',
        defaultValue: 'top-left',
        options: [
          { value: 'top-left', label: 'Arriba izquierda' },
          { value: 'top-right', label: 'Arriba derecha' },
          { value: 'bottom-left', label: 'Abajo izquierda' },
          { value: 'bottom-right', label: 'Abajo derecha' },
        ],
      },
      {
        key: 'shape',
        label: 'Forma',
        type: 'select',
        group: 'style',
        defaultValue: 'pill',
        options: [
          { value: 'pill', label: 'Píldora' },
          { value: 'square', label: 'Cuadrado' },
          { value: 'ribbon', label: 'Cinta' },
          { value: 'corner', label: 'Esquina' },
        ],
      },
      { key: 'icon', label: 'Icono', type: 'icon', group: 'content' },
      {
        key: 'size',
        label: 'Tamaño',
        type: 'select',
        group: 'layout',
        defaultValue: 'sm',
        options: [
          { value: 'sm', label: 'Pequeño' },
          { value: 'md', label: 'Mediano' },
          { value: 'lg', label: 'Grande' },
        ],
      },
    ],
  },
  {
    key: 'card_buttons',
    label: 'Botones de la tarjeta',
    type: 'repeater',
    group: 'content',
    itemLabelKey: 'action',
    itemFields: [
      {
        key: 'action',
        label: 'Acción',
        type: 'select',
        group: 'content',
        defaultValue: 'add_to_cart',
        options: [
          { value: 'add_to_cart', label: 'Agregar al carrito' },
          { value: 'buy_now', label: 'Comprar ahora' },
          { value: 'wishlist', label: 'Favoritos' },
          { value: 'quick_view', label: 'Vista rápida' },
          { value: 'whatsapp', label: 'WhatsApp' },
          { value: 'share', label: 'Compartir' },
          { value: 'view_detail', label: 'Ver detalle' },
          { value: 'custom', label: 'Personalizado' },
        ],
      },
      ...BUTTON_ITEM_FIELDS,
    ],
  },
  {
    key: 'buttons_position',
    label: 'Posición de los botones',
    type: 'select',
    group: 'layout',
    defaultValue: 'below',
    options: [
      { value: 'below', label: 'Debajo' },
      { value: 'overlay_hover', label: 'Al pasar el mouse' },
      { value: 'bottom_bar', label: 'Barra inferior' },
      { value: 'beside_price', label: 'Junto al precio' },
    ],
  },
  {
    key: 'buttons_layout',
    label: 'Distribución de botones',
    type: 'select',
    group: 'layout',
    defaultValue: 'row',
    options: [
      { value: 'row', label: 'En fila' },
      { value: 'column', label: 'En columna' },
      { value: 'wrap', label: 'Ajustable' },
    ],
  },
  {
    key: 'icon_only_buttons',
    label: 'Solo iconos (sin texto)',
    type: 'boolean',
    group: 'behavior',
    defaultValue: false,
  },
  {
    key: 'show_rating',
    label: 'Mostrar valoración',
    type: 'boolean',
    group: 'content',
    defaultValue: false,
    helpText: 'Solo tiene sentido tras la FASE 10 (reviews reales)',
  },
  {
    key: 'rating_style',
    label: 'Estilo de valoración',
    type: 'select',
    group: 'style',
    defaultValue: 'stars',
    showIf: { field: 'show_rating', equals: true },
    options: [
      { value: 'stars', label: 'Estrellas' },
      { value: 'compact', label: 'Compacto' },
      { value: 'stars_count', label: 'Estrellas + cantidad' },
    ],
  },
  {
    key: 'rating_position',
    label: 'Posición de valoración',
    type: 'select',
    group: 'layout',
    defaultValue: 'below_title',
    showIf: { field: 'show_rating', equals: true },
    options: [
      { value: 'below_title', label: 'Debajo del título' },
      { value: 'below_price', label: 'Debajo del precio' },
      { value: 'above_title', label: 'Arriba del título' },
    ],
  },
  {
    key: 'hide_if_no_reviews',
    label: 'Ocultar si no hay reseñas',
    type: 'boolean',
    group: 'behavior',
    defaultValue: true,
    showIf: { field: 'show_rating', equals: true },
  },
];

// ============================================================
// SPACING_FIELDS — inyectado en todas las secciones (F0.4)
// ============================================================
//
// Sustituye al `SectionSpacingEditor` ad-hoc. Se renderiza como un único
// campo `type: 'spacing'` que escribe en las keys `padding_top`,
// `padding_bottom`, `padding_x`, `margin_top`, `margin_bottom` (mismo
// JSON que el editor original).

export const SPACING_FIELDS: ContentFieldDef[] = [
  {
    key: '_spacing',
    label: 'Espaciado',
    type: 'spacing',
    group: 'layout',
    helpText: 'Padding y margen de la sección',
  },
];
