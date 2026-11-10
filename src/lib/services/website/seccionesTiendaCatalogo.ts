/**
 * Catálogo del editor para las 7 plantillas de tienda (Panorama, Atelier, Radiante, Roble, Marea,
 * Contraste y Hogar; PLANO §3, diseños B2–B5 del «Sistema de diseño»).
 *
 * Claves, variantes, límites y valores por defecto salen del contrato compartido con el sitio
 * (`src/lib/website/contrato/seccionesTienda.ts`): aquí solo se dice CÓMO se edita cada campo
 * (etiqueta, ayuda, pestaña y bloque). Los grupos son los del inspector (`InspectorSeccion.GRUPOS`):
 * Contenido = `content`/`data`, Diseño = `layout`/`carousel`/`behavior`, Avanzado = `style`.
 *
 * Tres piezas:
 * 1. `conVariantesTienda(def)`: a un tipo que ya existe (hero, gallery, image_text…) le suma sus
 *    variantes nuevas y los campos de cada una (limitados con `showIf.variantIn`). Los campos de
 *    siempre quedan en las variantes de siempre: una variante nueva solo ve lo suyo, salvo las que
 *    el sitio arma SOBRE una variante existente (`hero · split_products` sobre `split`,
 *    `products_grid · editorial` sobre `grid`), que heredan de esa base los campos cuya clave su
 *    componente declara en `CONTENT_KEYS`. También suma las claves de AJUSTE de secciones que ya
 *    existen (título resaltado, opciones de categoría, ficha, página de categoría…): ausentes = hoy.
 * 2. `SECCIONES_TIENDA_CATALOGO`: los tipos nuevos (`shop_the_look`, `link_cloud`, `product_pager`…).
 * 3. Etiquetas y descripciones de «Añadir sección» (grupo «Tienda», B3) en `sectionsByBranchType`.
 *
 * Todo lo que se ofrece aquí lo pinta el sitio desplegado (`__tests__/siteManifest.fixture.ts`,
 * copia del manifiesto real): lo comprueba `__tests__/seccionesTiendaCatalogo.test.ts`.
 * Ningún campo inventa datos: productos, categorías y reseñas salen del Inventario; sin ellos la
 * sección no se pinta en la tienda (el sitio lo decide con los `*Visible` del contrato).
 */
import type { ContentFieldDef, SectionTypeDefinition } from '@/lib/services/websitePageBuilderService';
import {
  ANCHOS_TARJETA_EDITORIAL,
  AYUDAS_BOTON,
  CAPAS_MARCA,
  CHIPS_CALIFICACION,
  COLORES_MANIJA,
  COLORES_TARJETA_CATEGORIA,
  DEFAULT_ANTES_DESPUES,
  DEFAULT_COMPLETA_EL_LOOK,
  DEFAULT_COMPRA_EL_LOOK,
  DEFAULT_DISENO_FICHA,
  DEFAULT_FICHA_TECNICA,
  DEFAULT_FILTROS_LATERALES,
  DEFAULT_INDICE_PRODUCTOS,
  DEFAULT_NUBE_ENLACES,
  DEFAULT_PAGINADOR_FICHA,
  DEFAULT_PESTANAS_ANCLA,
  DEFAULT_PORTADA_BUSCADOR,
  DEFAULT_REJILLA_EDITORIAL,
  DEFAULT_VENTANA_BIENVENIDA,
  DESTINOS_ANCLA,
  DISPOSICIONES_ENCABEZADO_CATEGORIA,
  ESTILOS_FILTRO_EDITORIAL,
  ESTILOS_PESTANAS,
  ESTILOS_RESALTADO,
  ESTILOS_SUBCATEGORIA,
  ESTILO_CATEGORIA_TITULO_ARRIBA,
  ETIQUETAS_VARIANTE_TIENDA,
  FRECUENCIAS_BIENVENIDA,
  FUENTES_FICHA_TECNICA,
  FUENTES_LOOK,
  FUENTES_NUBE,
  FUENTES_RESUMEN,
  GALERIA_MOSAICO,
  ICONOS_CTA_CATEGORIA,
  MAX_ANTES_DESPUES,
  MAX_BLOQUES_COLOR,
  MAX_BOTONES_TIENDA,
  MAX_CODIGO_CUPON,
  MAX_COLUMNAS_FOTO,
  MAX_DETALLES_ANATOMIA,
  MAX_ENLACES_NUBE,
  MAX_ENLACES_TARJETA_SERVICIO,
  MAX_FILAS_FICHA_TECNICA,
  MAX_FOTOS_COLLAGE,
  MAX_FOTOS_INSTAGRAM,
  MAX_MINIATURAS_IMAGEN_TEXTO,
  MAX_PESTANAS_ANCLA,
  MAX_PRODUCTOS_INDICE,
  MAX_PRODUCTOS_LOOK,
  MAX_PRODUCTOS_PORTADA,
  MAX_PUNTOS_LOOK,
  MAX_PUNTOS_MARCA,
  MAX_RESALTADO,
  MAX_SEGMENTOS_TEXTO,
  MAX_TARJETAS_EDITORIALES,
  MAX_TARJETAS_FLOTANTES,
  MAX_TARJETAS_SERVICIO,
  MIN_ENLACES_NUBE,
  PAGINADORES_CITAS,
  POSICIONES_TEXTO_CATEGORIA,
  PRODUCTOS_INDICE_POR_DEFECTO,
  TEXTO_BUSCADOR_CATEGORIA,
  TIPOS_TARJETA_FLOTANTE,
  VARIANTES_TIENDA,
  VARIANTE_BOTON_ENLACE,
  type TipoSeccionTienda,
} from '@/lib/website/contrato/seccionesTienda';

const RUTA_PRODUCTOS = '/app/inventario/productos';
const RUTA_CATEGORIAS = '/app/inventario/categorias';

const solo = (...variantes: string[]) => ({ variantIn: variantes });

/** Opciones de un `select` a partir de una lista del contrato y sus nombres visibles. */
function opciones<T extends string | number>(lista: readonly T[], nombres: Readonly<Record<string, string>>): { value: string; label: string }[] {
  return lista.map((v) => ({ value: String(v), label: nombres[String(v)] ?? String(v) }));
}

// ─── Piezas comunes ─────────────────────────────────────────────────────────────────────────

const NOMBRES_VARIANTE_BOTON: Record<string, string> = {
  solid: 'Relleno',
  outline: 'Con borde',
  ghost: 'Fantasma',
  gradient: 'Degradado',
  [VARIANTE_BOTON_ENLACE]: 'Enlace subrayado',
};

/** Botón de las portadas nuevas: texto, destino y estilo (`normalizarPortadaFlotante`). */
const ITEM_BOTON: ContentFieldDef[] = [
  { key: 'label', label: 'Texto', type: 'text', placeholder: 'Ver colección' },
  { key: 'url', label: 'Destino', type: 'url', placeholder: '/productos', helpText: 'Página o categoría del sitio.' },
  {
    key: 'variant',
    label: 'Estilo',
    type: 'select',
    defaultValue: 'solid',
    options: opciones(['solid', 'outline', 'ghost', 'gradient', VARIANTE_BOTON_ENLACE], NOMBRES_VARIANTE_BOTON),
  },
];

/** Punto sobre la foto que abre un producto real (x, y en % de la imagen). */
function itemPunto(conEtiqueta: boolean): ContentFieldDef[] {
  return [
    { key: 'product_id', label: 'Producto', type: 'entity', entity: 'product', helpText: 'Activo y con foto. Sin producto, el punto no se pinta.' },
    { key: 'x', label: 'Horizontal (%)', type: 'number', min: 0, max: 100, step: 1, half: true, helpText: '0 = borde izquierdo de la foto.' },
    { key: 'y', label: 'Vertical (%)', type: 'number', min: 0, max: 100, step: 1, half: true, helpText: '0 = borde de arriba.' },
    ...(conEtiqueta ? [{ key: 'label', label: 'Etiqueta', type: 'text', placeholder: 'Silla Lina', helpText: 'Vacía: el nombre del producto.' } as ContentFieldDef] : []),
  ];
}

/** Foto de una lista (`images[]`): el sitio lee `image_url` (o el texto suelto), no `url`. */
const ITEM_FOTO: ContentFieldDef[] = [{ key: 'image_url', label: 'Foto', type: 'image' }];

const NOMBRES_RESALTADO: Record<string, string> = { pill: 'Píldora', underline: 'Subrayado' };

function camposResaltado(variantes: string[], ayuda: string): ContentFieldDef[] {
  return [
    {
      key: 'title_highlight',
      label: 'Palabra resaltada',
      type: 'text',
      placeholder: 'luz',
      helpText: `${ayuda} Hasta ${MAX_RESALTADO} caracteres; debe estar en el título.`,
      showIf: solo(...variantes),
    },
    {
      key: 'title_highlight_style',
      label: 'Estilo del resaltado',
      type: 'select',
      defaultValue: 'pill',
      options: opciones(ESTILOS_RESALTADO, NOMBRES_RESALTADO),
      showIf: { variantIn: variantes, anyFilled: ['title_highlight'] },
    },
  ];
}

// ─── hero: Buscador, Marca gigante, Tarjetas flotantes, Dividida con productos ─────────────

const CAMPOS_HERO: ContentFieldDef[] = [
  // Buscador (Panorama)
  { key: 'title', label: 'Título', type: 'text', placeholder: 'Todo para tu casa', section: 'Textos', showIf: solo('search') },
  { key: 'subtitle', label: 'Subtítulo', type: 'textarea', section: 'Textos', showIf: solo('search') },
  { key: 'image_url', label: 'Foto de fondo', type: 'image', section: 'Foto', showIf: solo('search') },
  {
    key: 'search_placeholder',
    label: 'Texto del buscador',
    type: 'text',
    placeholder: DEFAULT_PORTADA_BUSCADOR.searchPlaceholder,
    section: 'Buscador',
    helpText: 'Busca en toda la tienda (/search). Sin texto y con categoría elegida, abre esa categoría.',
    showIf: solo('search'),
  },
  {
    key: 'show_category_select',
    label: 'Selector de categoría',
    type: 'boolean',
    defaultValue: DEFAULT_PORTADA_BUSCADOR.showCategorySelect,
    section: 'Buscador',
    helpText: 'Con las categorías reales del Inventario.',
    showIf: solo('search'),
  },
  {
    key: 'rating_chip',
    label: 'Chip de reseñas',
    type: 'select',
    defaultValue: DEFAULT_PORTADA_BUSCADOR.ratingChip,
    section: 'Buscador',
    helpText: 'Promedio y cantidad de reseñas aprobadas de tus productos. Sin reseñas no se muestra.',
    options: opciones(CHIPS_CALIFICACION, { auto: 'Con las reseñas reales', none: 'Sin chip' }),
    showIf: solo('search'),
  },
  {
    key: 'inset',
    label: 'Portada como tarjeta',
    type: 'boolean',
    group: 'layout',
    defaultValue: DEFAULT_PORTADA_BUSCADOR.inset,
    helpText: 'Con margen y el radio del tema. Apagado: a todo el ancho.',
    showIf: solo('search'),
  },

  // Marca gigante (Marea, Contraste)
  {
    key: 'brand_text',
    label: 'Marca',
    type: 'text',
    section: 'Marca',
    helpText: 'Vacío: el nombre de tu organización.',
    showIf: solo('brand_giant'),
  },
  {
    key: 'brand_layer',
    label: 'Dónde va la marca',
    type: 'select',
    defaultValue: 'behind_figure',
    section: 'Marca',
    options: opciones(CAPAS_MARCA, { behind_figure: 'Detrás de la figura recortada', over_photo: 'Sobre la foto' }),
    showIf: solo('brand_giant'),
  },
  { key: 'image_url', label: 'Foto de fondo', type: 'image', section: 'Fotos', showIf: solo('brand_giant') },
  {
    key: 'figure_url',
    label: 'Figura recortada (PNG)',
    type: 'image',
    section: 'Fotos',
    helpText: 'Va delante de la marca. Sin figura, la marca queda sobre la foto.',
    showIf: { variantIn: ['brand_giant'], field: 'brand_layer', in: ['behind_figure', undefined] },
  },
  { key: 'chip', label: 'Etiqueta', type: 'text', placeholder: 'Nueva colección', section: 'Textos', showIf: solo('brand_giant') },
  { key: 'title', label: 'Título', type: 'text', section: 'Textos', showIf: solo('brand_giant') },
  { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Ver la colección', section: 'Textos', showIf: solo('brand_giant') },
  { key: 'cta_url', label: 'Destino del botón', type: 'url', placeholder: '/productos', section: 'Textos', showIf: solo('brand_giant') },
  {
    key: 'hotspots',
    label: 'Puntos de producto',
    type: 'repeater',
    itemLabelKey: 'label',
    maxItems: MAX_PUNTOS_MARCA,
    section: 'Puntos',
    helpText: `Hasta ${MAX_PUNTOS_MARCA} puntos sobre la foto, cada uno con un producto real.`,
    emptyStoreText: 'Sin puntos.',
    itemFields: itemPunto(true),
    showIf: solo('brand_giant'),
  },

  // Tarjetas flotantes (Radiante)
  { key: 'title', label: 'Título', type: 'text', placeholder: 'Piel con luz propia', section: 'Textos', showIf: solo('floating') },
  ...camposResaltado(['floating'], 'Una palabra del título que se destaca.').map((c) => ({ ...c, section: 'Textos' })),
  { key: 'subtitle', label: 'Subtítulo', type: 'textarea', section: 'Textos', showIf: solo('floating') },
  { key: 'image_url', label: 'Foto', type: 'image', section: 'Foto', showIf: solo('floating') },
  {
    key: 'buttons',
    label: 'Botones',
    type: 'repeater',
    itemLabelKey: 'label',
    maxItems: MAX_BOTONES_TIENDA,
    section: 'Botones',
    helpText: `Hasta ${MAX_BOTONES_TIENDA}. Sin texto o sin destino, el botón no se pinta.`,
    itemFields: ITEM_BOTON,
    showIf: solo('floating'),
  },
  {
    key: 'floating_cards',
    label: 'Tarjetas flotantes',
    type: 'repeater',
    itemLabelKey: 'kind',
    maxItems: MAX_TARJETAS_FLOTANTES,
    section: 'Tarjetas',
    helpText: 'Una de cada clase. Categorías y reseñas salen del Inventario; sin reseñas, esa tarjeta no se muestra.',
    itemFields: [
      {
        key: 'kind',
        label: 'Qué muestra',
        type: 'select',
        defaultValue: 'categories',
        options: opciones(TIPOS_TARJETA_FLOTANTE, { categories: 'Categorías', rating: 'Reseñas', video: 'Video' }),
      },
      { key: 'video_url', label: 'Enlace del video', type: 'url', placeholder: 'https://...', helpText: 'Solo para «Video». Sin enlace, la tarjeta no se pinta.', showIf: { field: 'kind', equals: 'video' } },
    ],
    showIf: solo('floating'),
  },

  // Dividida con productos (Hogar): lo de «Dividido» más las mini tarjetas.
  {
    key: 'product_ids',
    label: 'Productos bajo los botones',
    type: 'entity',
    entity: 'product',
    multiple: true,
    group: 'data',
    helpText: `Hasta ${MAX_PRODUCTOS_PORTADA}. Vacío: los ${MAX_PRODUCTOS_PORTADA} primeros con foto de tu tienda.`,
    showIf: solo('split_products'),
  },

  // Título resaltado en «Pantalla completa» (ajuste; ausente = la portada de hoy).
  ...camposResaltado(['fullscreen'], 'Opcional: resalta una palabra del título.'),
];

// ─── transformation · slider («Antes / después», Radiante) ─────────────────────────────────

const NOMBRES_MANIJA: Record<string, string> = { acento: 'Acento del tema', primario: 'Primario del tema', blanco: 'Blanco' };

const CAMPOS_TRANSFORMACION: ContentFieldDef[] = [
  { key: 'title', label: 'Título', type: 'text', placeholder: 'Así cambia una sala', section: 'Textos', showIf: solo('slider') },
  { key: 'subtitle', label: 'Subtítulo', type: 'textarea', section: 'Textos', showIf: solo('slider') },
  {
    key: 'items',
    label: 'Comparaciones',
    type: 'repeater',
    itemLabelKey: 'name',
    maxItems: MAX_ANTES_DESPUES,
    section: 'Comparaciones',
    helpText: 'Cada comparación necesita las dos fotos. Sin ninguna completa, la sección no se pinta.',
    emptyStoreText: 'La sección no se pinta.',
    itemFields: [
      { key: 'name', label: 'Nombre', type: 'text', placeholder: 'Sala', helpText: 'Con dos o más, aparece la fila de nombres.' },
      { key: 'before_url', label: 'Foto de antes', type: 'image' },
      { key: 'after_url', label: 'Foto de después', type: 'image' },
    ],
    showIf: solo('slider'),
  },
  // Decisión 2 del dueño (2026-11-10): las etiquetas se editan. Vacías = «Antes» y «Después».
  { key: 'before_label', label: 'Etiqueta de antes', type: 'text', placeholder: 'Antes', half: true, section: 'Etiquetas de las fotos', showIf: solo('slider') },
  { key: 'after_label', label: 'Etiqueta de después', type: 'text', placeholder: 'Después', half: true, section: 'Etiquetas de las fotos', showIf: solo('slider') },
  {
    key: 'start_position',
    label: 'Posición inicial del control',
    type: 'range',
    min: 0,
    max: 100,
    step: 5,
    suffix: '%',
    defaultValue: DEFAULT_ANTES_DESPUES.startPosition,
    section: 'Control',
    showIf: solo('slider'),
  },
  {
    key: 'handle_color',
    label: 'Color del control',
    type: 'select',
    defaultValue: DEFAULT_ANTES_DESPUES.handleColor,
    section: 'Control',
    options: opciones(COLORES_MANIJA, NOMBRES_MANIJA),
    showIf: solo('slider'),
  },
];

// ─── image_text: Bloque de color (Marea), Editorial (Contraste) y miniaturas ───────────────

const CAMPOS_IMAGEN_TEXTO: ContentFieldDef[] = [
  // Decisión 3 del dueño (2026-11-10): UNA sección con bloques que se repiten. Con bloques se pintan
  // lado a lado; sin ninguno (o vacíos) la sección pinta el bloque único de abajo, como hoy.
  {
    key: 'blocks',
    label: 'Bloques',
    type: 'repeater',
    itemLabelKey: 'title',
    maxItems: MAX_BLOQUES_COLOR,
    section: 'Bloques',
    helpText: `Hasta ${MAX_BLOQUES_COLOR}, lado a lado. Con bloques, el «Bloque único» de abajo no se usa.`,
    emptyStoreText: 'Se pinta el bloque único.',
    itemFields: [
      { key: 'bg_color', label: 'Color de fondo', type: 'color', helpText: 'Vacío: el primario del tema.' },
      { key: 'text_color', label: 'Color del texto', type: 'color', helpText: 'Vacío: negro o blanco, el de más contraste.' },
      { key: 'number', label: 'Número', type: 'text', placeholder: '01' },
      { key: 'title', label: 'Nombre', type: 'text', placeholder: 'Sillas' },
      { key: 'phrase', label: 'Frase', type: 'textarea' },
      { key: 'cta_url', label: 'Enlace a la categoría', type: 'url', placeholder: '/categorias/sillas' },
      { key: 'image_url', label: 'Foto', type: 'image' },
    ],
    showIf: solo('color_block'),
  },
  { key: 'number', label: 'Número', type: 'text', placeholder: '01', section: 'Bloque único', showIf: solo('color_block') },
  { key: 'title', label: 'Nombre', type: 'text', placeholder: 'Sillas', section: 'Bloque único', showIf: solo('color_block') },
  { key: 'phrase', label: 'Frase', type: 'textarea', placeholder: 'Roble macizo y tejidos naturales.', section: 'Bloque único', showIf: solo('color_block') },
  { key: 'image_url', label: 'Foto', type: 'image', section: 'Bloque único', showIf: solo('color_block') },
  { key: 'bg_color', label: 'Color de fondo', type: 'color', section: 'Bloque único', helpText: 'Vacío: el primario del tema.', showIf: solo('color_block') },
  { key: 'text_color', label: 'Color del texto', type: 'color', section: 'Bloque único', helpText: 'Vacío: negro o blanco, el de más contraste.', showIf: solo('color_block') },
  { key: 'cta_url', label: 'Enlace a la categoría', type: 'url', placeholder: '/categorias/sillas', section: 'Bloque único', helpText: '«Ver la colección». Vacío: sin enlace.', showIf: solo('color_block') },

  { key: 'title', label: 'Título', type: 'text', section: 'Textos', showIf: solo('editorial') },
  { key: 'body', label: 'Texto', type: 'textarea', section: 'Textos', showIf: solo('editorial') },
  { key: 'link_text', label: 'Texto del enlace', type: 'text', placeholder: 'Leer la historia', section: 'Textos', showIf: solo('editorial') },
  { key: 'link_url', label: 'Destino del enlace', type: 'url', section: 'Textos', showIf: solo('editorial') },
  { key: 'image_url', label: 'Foto grande', type: 'image', section: 'Fotos', showIf: solo('editorial') },
  { key: 'image_tag', label: 'Etiqueta de la foto grande', type: 'text', section: 'Fotos', showIf: solo('editorial') },
  { key: 'image_small_url', label: 'Foto pequeña', type: 'image', section: 'Fotos', showIf: solo('editorial') },
  { key: 'image_small_caption', label: 'Pie de la foto pequeña', type: 'text', section: 'Fotos', showIf: solo('editorial') },

  // «Imagen derecha» (ajuste, Marea): hasta 3 miniaturas bajo el texto. Vacío = la de hoy.
  {
    key: 'thumbnails',
    label: 'Miniaturas',
    type: 'repeater',
    maxItems: MAX_MINIATURAS_IMAGEN_TEXTO,
    helpText: `Hasta ${MAX_MINIATURAS_IMAGEN_TEXTO}. Vacío: sin miniaturas, como hoy.`,
    itemFields: ITEM_FOTO,
    showIf: solo('image_right'),
  },
];

// ─── gallery: Collage (Radiante), Instagram (Contraste) y carrusel escalonado (Marea) ──────

const CAMPOS_GALERIA: ContentFieldDef[] = [
  {
    key: 'images',
    label: 'Fotos',
    type: 'repeater',
    maxItems: MAX_FOTOS_COLLAGE,
    helpText: `Hasta ${MAX_FOTOS_COLLAGE}.`,
    itemFields: ITEM_FOTO,
    showIf: solo('collage'),
  },
  { key: 'phrase', label: 'Frase', type: 'textarea', showIf: solo('collage') },

  {
    key: 'images',
    label: 'Fotos',
    type: 'repeater',
    maxItems: MAX_FOTOS_INSTAGRAM,
    helpText: `Hasta ${MAX_FOTOS_INSTAGRAM}.`,
    itemFields: ITEM_FOTO,
    showIf: solo('instagram_cta'),
  },
  { key: 'handle', label: 'Usuario de Instagram', type: 'text', placeholder: 'tutienda', helpText: 'Sin «@». Vacío: el de tus redes del sitio.', showIf: solo('instagram_cta') },
  { key: 'cta_title', label: 'Título del llamado', type: 'text', placeholder: 'Síguenos', showIf: solo('instagram_cta') },
  { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Seguir', showIf: solo('instagram_cta') },
  { key: 'cta_url', label: 'Destino del botón', type: 'url', helpText: 'Vacío: tu perfil de Instagram.', showIf: solo('instagram_cta') },

  {
    key: 'stagger',
    label: 'Fotos escalonadas',
    type: 'boolean',
    group: 'layout',
    defaultValue: false,
    helpText: 'Alturas alternas. Apagado: el carrusel de hoy.',
    showIf: solo('carousel'),
  },
];

// ─── text_block · inline_icons (Contraste) ─────────────────────────────────────────────────

const CAMPOS_TEXTO: ContentFieldDef[] = [
  { key: 'title', label: 'Título', type: 'text', showIf: solo('inline_icons') },
  {
    key: 'segments',
    label: 'Frase con íconos',
    type: 'repeater',
    itemLabelKey: 'text',
    maxItems: MAX_SEGMENTOS_TEXTO,
    helpText: 'Cada trozo es un texto o un ícono, en orden.',
    itemFields: [
      { key: 'text', label: 'Texto', type: 'text', placeholder: 'Piezas hechas a mano' },
      { key: 'icon', label: 'Ícono (en vez de texto)', type: 'icon' },
    ],
    showIf: solo('inline_icons'),
  },
];

// ─── features_grid · photo_columns (Roble) ─────────────────────────────────────────────────

const CAMPOS_RASGOS: ContentFieldDef[] = [
  { key: 'title', label: 'Título', type: 'text', showIf: solo('photo_columns') },
  { key: 'subtitle', label: 'Subtítulo', type: 'textarea', showIf: solo('photo_columns') },
  {
    key: 'items',
    label: 'Columnas',
    type: 'repeater',
    itemLabelKey: 'title',
    maxItems: MAX_COLUMNAS_FOTO,
    helpText: `Hasta ${MAX_COLUMNAS_FOTO}. Sin columnas, la sección no se pinta.`,
    itemFields: [
      { key: 'image_url', label: 'Foto', type: 'image' },
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'text', label: 'Texto', type: 'textarea' },
    ],
    showIf: solo('photo_columns'),
  },
];

// ─── products_grid: Rejilla editorial (Atelier) y pestañas subrayadas (ajuste) ─────────────

const CAMPOS_PRODUCTOS: ContentFieldDef[] = [
  {
    key: 'count_header',
    label: 'Conteo sobre la rejilla',
    type: 'boolean',
    defaultValue: DEFAULT_REJILLA_EDITORIAL.countHeader,
    helpText: '«72 productos», con el número real.',
    showIf: solo('editorial'),
  },
  {
    key: 'filters_style',
    label: 'Filtros de categoría',
    type: 'select',
    defaultValue: DEFAULT_REJILLA_EDITORIAL.filtersStyle,
    options: opciones(ESTILOS_FILTRO_EDITORIAL, { text: 'Texto', chips: 'Píldoras' }),
    showIf: solo('editorial'),
  },
  {
    key: 'editorial_cards',
    label: 'Tarjetas editoriales',
    type: 'repeater',
    itemLabelKey: 'title',
    maxItems: MAX_TARJETAS_EDITORIALES,
    helpText: `Hasta ${MAX_TARJETAS_EDITORIALES}, intercaladas entre los productos. Vacío: la rejilla normal.`,
    itemFields: [
      { key: 'after', label: 'Después del producto número', type: 'number', min: 0, max: 200, step: 1, helpText: '0 = antes del primero.' },
      { key: 'span', label: 'Ancho', type: 'select', defaultValue: '2', options: opciones(ANCHOS_TARJETA_EDITORIAL, { '2': '2 columnas', '3': '3 columnas' }) },
      { key: 'image_url', label: 'Foto', type: 'image' },
      { key: 'title', label: 'Título', type: 'text' },
      { key: 'text', label: 'Texto', type: 'textarea' },
      { key: 'url', label: 'Destino', type: 'url' },
    ],
    showIf: solo('editorial'),
  },
];

/**
 * «Pestañas de categoría» de la rejilla de siempre (`tabs_style`; W2, `pestanasSubrayadas` del
 * sitio). Es la barra de filtros de hoy (`BarraFiltrosProductos`): por eso solo se ofrece mientras
 * la barra nueva no esté activa (sin «Estilo del chip», posición, filtros ni chips en celular),
 * igual que en ProductsGrid. No confundir con `chip_style: 'underline'`, que es la forma de los
 * chips de la barra NUEVA.
 */
export const CAMPO_PESTANAS_PRODUCTOS: ContentFieldDef = {
  key: 'tabs_style',
  label: 'Pestañas de categoría',
  type: 'select',
  group: 'layout',
  defaultValue: 'chips',
  helpText: 'La fila de categorías sobre la rejilla. «Subrayadas»: sin caja y con una línea bajo la activa.',
  options: opciones(ESTILOS_PESTANAS, { chips: 'Píldoras (como hoy)', underline: 'Subrayadas' }),
  showIf: { variantIn: ['default', 'grid'], allEmpty: ['chip_style', 'filter_position', 'filters', 'chip_mobile'] },
};

// ─── testimonials (ajuste): resumen de reseñas y citas con foto ────────────────────────────

const CAMPOS_TESTIMONIOS: ContentFieldDef[] = [
  {
    key: 'show_summary',
    label: 'Resumen de reseñas',
    type: 'boolean',
    defaultValue: false,
    helpText: '«4,9 de N reseñas» con el promedio real. Sin reseñas no se muestra.',
  },
  {
    key: 'summary_source',
    label: 'Reseñas del resumen',
    type: 'select',
    defaultValue: 'testimonials',
    options: opciones(FUENTES_RESUMEN, { testimonials: 'Testimonios', product_reviews: 'Reseñas de productos' }),
    showIf: { field: 'show_summary', equals: true },
  },
  { key: 'image_url', label: 'Foto al lado de las citas', type: 'image', helpText: 'Vacía: las citas de hoy.', showIf: solo('quotes') },
  {
    key: 'pager',
    label: 'Paginador',
    type: 'select',
    group: 'layout',
    defaultValue: 'none',
    options: opciones(PAGINADORES_CITAS, { none: 'Sin paginador (como hoy)', fraction: '«1 / 5»' }),
    showIf: solo('quotes'),
  },
];

// ─── categories_grid (ajuste, B2): estilo «Título arriba» y color, texto y flecha ──────────

/** Estilos que leen cada opción nueva (EstilosCategoria y CategoryCard del sitio; ausente = superpuesto). */
const ESTILOS_CON_POSICION = ['card_bottom', 'overlay', undefined, ''];
const ESTILOS_CON_COLOR_Y_FLECHA = ['card_bottom', ESTILO_CATEGORIA_TITULO_ARRIBA, 'overlay', undefined, ''];

export const OPCION_ESTILO_TITULO_ARRIBA = { value: ESTILO_CATEGORIA_TITULO_ARRIBA, label: 'Título arriba' };

/**
 * «Lista de texto» (decisión 1 del dueño, 2026-11-10): una fila de nombres enlazados. El sitio la
 * pinta desde goadmin-websites 956fd16 (`lib/website/opcionesEditorTienda.ts`); no está en el
 * contrato compartido.
 */
export const ESTILO_CATEGORIA_LISTA_TEXTO = 'text_list' as const;
export const OPCION_ESTILO_LISTA_TEXTO = { value: ESTILO_CATEGORIA_LISTA_TEXTO, label: 'Lista de texto' };

const CAMPOS_CATEGORIAS: ContentFieldDef[] = [
  {
    key: 'category_text_position',
    label: 'Posición del texto',
    type: 'select',
    group: 'style',
    defaultValue: 'bottom',
    helpText: 'Con «Tarjeta» o «Superpuesto».',
    options: opciones(POSICIONES_TEXTO_CATEGORIA, { bottom: 'Abajo (como hoy)', top: 'Arriba' }),
    showIf: { field: 'category_style', in: ESTILOS_CON_POSICION },
  },
  {
    key: 'category_card_color',
    label: 'Color propio por tarjeta',
    type: 'select',
    group: 'style',
    defaultValue: 'none',
    helpText: 'El pie de cada tarjeta toma el color de su categoría (Inventario › Categorías). Sin color, el fondo de hoy.',
    options: opciones(COLORES_TARJETA_CATEGORIA, { none: 'Ninguno (como hoy)', per_item: 'El color de cada categoría' }),
    showIf: { field: 'category_style', in: ESTILOS_CON_COLOR_Y_FLECHA },
  },
  {
    key: 'category_cta_icon',
    label: 'Flecha en la tarjeta',
    type: 'select',
    group: 'style',
    defaultValue: 'none',
    helpText: '«Flecha» va junto al nombre; «Flecha en círculo», en la esquina de la foto.',
    options: opciones(ICONOS_CTA_CATEGORIA, { none: 'Ninguna (como hoy)', arrow: 'Flecha', arrow_circle: 'Flecha en círculo' }),
    showIf: { field: 'category_style', in: ESTILOS_CON_COLOR_Y_FLECHA },
  },
];

// ─── category_filters · sidebar_facets (Contraste) y opciones de la barra de hoy ───────────

const CAMPOS_FILTROS_CATEGORIA: ContentFieldDef[] = [
  {
    key: 'subcategory_style',
    label: 'Estilo de las subcategorías',
    type: 'select',
    defaultValue: 'chips',
    options: opciones(ESTILOS_SUBCATEGORIA, { chips: 'Píldoras (como hoy)', text: 'Texto', tabs: 'Pestañas' }),
    showIf: solo('default'),
  },
  {
    key: 'search',
    label: 'Buscador',
    type: 'boolean',
    defaultValue: false,
    helpText: `«${TEXTO_BUSCADOR_CATEGORIA}»: busca en toda la tienda.`,
    showIf: solo('default'),
  },
  {
    key: 'show_subcategories',
    label: 'Subcategorías con casillas',
    type: 'boolean',
    defaultValue: DEFAULT_FILTROS_LATERALES.showSubcategories,
    helpText: 'Selección única. La barra solo filtra por subcategorías.',
    showIf: solo('sidebar_facets'),
  },
  { key: 'show_sort', label: 'Ordenar', type: 'boolean', defaultValue: DEFAULT_FILTROS_LATERALES.showSort, showIf: solo('sidebar_facets') },
  {
    key: 'clear_text',
    label: 'Texto para limpiar',
    type: 'text',
    placeholder: DEFAULT_FILTROS_LATERALES.clearText,
    showIf: solo('sidebar_facets'),
  },
  {
    key: '_aviso_facetas',
    label: 'Solo subcategorías y orden',
    type: 'notice',
    helpText: 'Disponibilidad y precio no están: la tienda filtra por subcategoría y orden. Las 2 columnas aparecen solo con este bloque visible.',
    showIf: solo('sidebar_facets'),
  },
];

// ─── category_header (ajuste): encabezado partido (Hogar) ──────────────────────────────────

const CAMPOS_ENCABEZADO_CATEGORIA: ContentFieldDef[] = [
  {
    key: 'layout',
    label: 'Distribución',
    type: 'select',
    defaultValue: 'stack',
    options: opciones(DISPOSICIONES_ENCABEZADO_CATEGORIA, { stack: 'Apilado (como hoy)', split_text: 'Partido: título a un lado, texto al otro' }),
  },
];

// ─── product_specs: Íconos (Panorama) y Panel (Hogar) ──────────────────────────────────────

const NOMBRES_FUENTE_FICHA: Record<string, string> = {
  brand: 'Marca',
  dimensions: 'Medidas',
  weight: 'Peso',
  warranty: 'Garantía',
  reference: 'Referencia',
  category: 'Categoría',
};

const CAMPOS_ESPECIFICACIONES: ContentFieldDef[] = [
  { key: 'title', label: 'Título', type: 'text', placeholder: DEFAULT_FICHA_TECNICA.title, showIf: solo('icon_grid', 'panel') },
  {
    key: 'rows',
    label: 'Filas',
    type: 'repeater',
    itemLabelKey: 'label',
    maxItems: MAX_FILAS_FICHA_TECNICA,
    helpText: 'Cada fila sale de un dato real del producto; sin el dato, la fila no se pinta. Vacío: las seis de siempre.',
    defaultItems: DEFAULT_FICHA_TECNICA.rows.map((r) => ({ ...r })),
    itemFields: [
      { key: 'source', label: 'Dato', type: 'select', defaultValue: 'brand', options: opciones(FUENTES_FICHA_TECNICA, NOMBRES_FUENTE_FICHA) },
      { key: 'label', label: 'Etiqueta', type: 'text', placeholder: 'Marca' },
      { key: 'icon', label: 'Ícono', type: 'icon', helpText: 'Vacío: el del dato.' },
    ],
    showIf: solo('icon_grid', 'panel'),
  },
];

// ─── product_gallery (ajuste, B5): galería en mosaico y columnas de la ficha ───────────────

const NOMBRES_GALERIA: Record<string, string> = {
  carousel: 'Carrusel (como hoy)',
  scroll: 'Desplazamiento',
  grid: 'Cuadrícula',
  show_all: 'Todas en columna',
  [GALERIA_MOSAICO]: 'Mosaico: 1 grande · 2 medianas · 1 grande',
};

/**
 * Las claves que lee la galería del sitio (`ProductGallery` → `ProductImageGallery`, los mismos
 * nombres de `page_settings`) y `page_layout`, que lee la ficha V2 (`normalizarDisenoFicha`).
 * `page_layout.*` se guarda como un objeto (`contenido.page_layout = { columns, … }`).
 */
const CAMPOS_GALERIA_FICHA: ContentFieldDef[] = [
  {
    key: 'gallery_layout',
    label: 'Distribución de la galería',
    type: 'select',
    section: 'Galería',
    defaultValue: 'carousel',
    options: opciones(['carousel', 'scroll', 'grid', 'show_all', GALERIA_MOSAICO], NOMBRES_GALERIA),
  },
  {
    key: 'thumbnails_position',
    label: 'Miniaturas',
    type: 'select',
    section: 'Galería',
    defaultValue: 'bottom',
    options: opciones(['bottom', 'left', 'right', 'none'], { bottom: 'Abajo', left: 'A la izquierda', right: 'A la derecha', none: 'Sin miniaturas' }),
    showIf: { field: 'gallery_layout', in: ['carousel', undefined, ''] },
  },
  {
    key: 'gallery_arrows',
    label: 'Flechas',
    type: 'boolean',
    section: 'Galería',
    defaultValue: true,
    showIf: { field: 'gallery_layout', in: ['carousel', undefined, ''] },
  },
  {
    key: 'page_layout.columns',
    label: 'Columnas de la ficha',
    type: 'select',
    section: 'Página',
    defaultValue: DEFAULT_DISENO_FICHA.columns,
    helpText: 'Solo en la ficha de la plantilla nueva; las tiendas anteriores siguen con su ficha.',
    options: [
      { value: '2', label: 'Dos (galería e información)' },
      { value: '1', label: 'Una' },
    ],
  },
  {
    key: 'page_layout.gallery_width',
    label: 'Ancho de la galería',
    type: 'range',
    section: 'Página',
    min: 30,
    max: 70,
    step: 5,
    suffix: '%',
    defaultValue: DEFAULT_DISENO_FICHA.galleryWidth,
  },
  { key: 'page_layout.sticky_column', label: 'Información fija al bajar', type: 'boolean', section: 'Página', defaultValue: DEFAULT_DISENO_FICHA.stickyColumn },
  { key: 'page_layout.show_breadcrumb', label: 'Migas de pan', type: 'boolean', section: 'Página', defaultValue: DEFAULT_DISENO_FICHA.showBreadcrumb },
];

// ─── product_actions (ajuste): precio en el botón y pista de variante ──────────────────────

const CAMPOS_ACCIONES_FICHA: ContentFieldDef[] = [
  {
    key: 'show_price_in_button',
    label: 'Precio dentro del botón',
    type: 'boolean',
    defaultValue: false,
    helpText: '«Agregar · $ 189.000», con el precio vigente.',
  },
  {
    key: 'button_hint',
    label: 'Pista antes de elegir variante',
    type: 'select',
    defaultValue: 'none',
    helpText: '«Elige tu acabado», con el nombre del tipo de variante. Solo presentación.',
    options: opciones(AYUDAS_BOTON, { none: 'Ninguna (como hoy)', auto: 'Automática' }),
  },
];

// ─── Registro por tipo existente ───────────────────────────────────────────────────────────

/**
 * Variantes nuevas que el sitio arma SOBRE una variante existente, con las claves que su
 * componente declara (`CONTENT_KEYS` de HeroSplitProductos y RejillaEditorial en goadmin-websites).
 * Heredan de la base los campos con esas claves; el resto de la base no aplica.
 */
export const VARIANTES_SOBRE_BASE: Readonly<Record<string, { base: string; claves: readonly string[] }>> = {
  'hero.split_products': {
    base: 'split',
    claves: ['title', 'subtitle', 'cta_text', 'cta_url', 'cta_secondary_text', 'cta_secondary_url', 'image_url', 'image_url_mobile', 'content_position', 'buttons', 'product_ids'],
  },
  'products_grid.editorial': {
    base: 'grid',
    claves: [
      'title', 'subtitle', 'columns', 'max_items', 'rows', 'sort_order', 'selected_category_ids', 'include_subcategories',
      'exclude_out_of_stock', 'show_filters', 'product_card_style', 'badges', 'card_buttons', 'buttons_position',
      'buttons_layout', 'buttons_full_width', 'icon_only', 'count_header', 'filters_style', 'editorial_cards',
    ],
  },
};

/** Campos nuevos y de ajuste por tipo existente (cada uno limitado a su variante cuando aplica). */
const CAMPOS_POR_TIPO: Readonly<Record<string, readonly ContentFieldDef[]>> = {
  hero: CAMPOS_HERO,
  transformation: CAMPOS_TRANSFORMACION,
  image_text: CAMPOS_IMAGEN_TEXTO,
  gallery: CAMPOS_GALERIA,
  text_block: CAMPOS_TEXTO,
  features_grid: CAMPOS_RASGOS,
  products_grid: CAMPOS_PRODUCTOS,
  testimonials: CAMPOS_TESTIMONIOS,
  categories_grid: CAMPOS_CATEGORIAS,
  category_filters: CAMPOS_FILTROS_CATEGORIA,
  category_header: CAMPOS_ENCABEZADO_CATEGORIA,
  product_specs: CAMPOS_ESPECIFICACIONES,
  product_gallery: CAMPOS_GALERIA_FICHA,
  product_actions: CAMPOS_ACCIONES_FICHA,
};

/** Dónde va cada campo de ajuste dentro de la lista de su tipo: después de esta clave. */
const INSERTAR_DESPUES: Readonly<Record<string, string>> = {
  'categories_grid.category_text_position': 'category_style',
};

/** Variantes de tienda de un tipo existente, con su nombre visible del contrato. */
export function variantesTiendaDe(tipo: string): { id: string; label: string }[] {
  const lista = (VARIANTES_TIENDA as Readonly<Record<string, readonly string[]>>)[tipo] ?? [];
  return lista.map((id) => ({ id, label: ETIQUETAS_VARIANTE_TIENDA[`${tipo}.${id}`] ?? id }));
}

/**
 * Un tipo existente con sus variantes y campos de tienda:
 * - suma las variantes nuevas (sin repetir);
 * - los campos de siempre quedan en las variantes de siempre (`showIf.variantIn`), salvo los que
 *   hereda una variante armada sobre una base (`VARIANTES_SOBRE_BASE`);
 * - agrega los campos nuevos y de ajuste del tipo.
 * Un tipo sin nada de tienda vuelve igual (misma referencia).
 */
export function conVariantesTienda(def: SectionTypeDefinition): SectionTypeDefinition {
  const nuevas = variantesTiendaDe(def.type).filter((v) => !def.variants.some((x) => x.id === v.id));
  const extra = CAMPOS_POR_TIPO[def.type] ?? [];
  if (nuevas.length === 0 && extra.length === 0) return def;

  const viejas = def.variants.map((v) => v.id);
  const idsNuevas = nuevas.map((v) => v.id);
  const campos = def.contentFields.map((campo): ContentFieldDef => {
    if (idsNuevas.length === 0) return campo;
    const ofrecidas = campo.showIf?.variantIn ?? viejas;
    const heredan = idsNuevas.filter((v) => {
      const sobre = VARIANTES_SOBRE_BASE[`${def.type}.${v}`];
      return Boolean(sobre && ofrecidas.includes(sobre.base) && sobre.claves.includes(campo.key));
    });
    if (!campo.showIf?.variantIn && heredan.length === 0) return { ...campo, showIf: { ...(campo.showIf ?? {}), variantIn: viejas } };
    if (heredan.length === 0) return campo;
    return { ...campo, showIf: { ...(campo.showIf ?? {}), variantIn: [...ofrecidas, ...heredan] } };
  });

  for (const c of extra) {
    const despues = INSERTAR_DESPUES[`${def.type}.${c.key}`];
    const i = despues ? campos.findIndex((x) => x.key === despues) : -1;
    if (i >= 0) {
      // Los siguientes campos del mismo bloque van detrás del recién insertado.
      let j = i + 1;
      while (j < campos.length && extra.includes(campos[j])) j++;
      campos.splice(j, 0, c);
    } else {
      campos.push(c);
    }
  }
  // Los campos de categorías van juntos tras «Estilo de las categorías».
  if (def.type === 'categories_grid') {
    const i = campos.findIndex((x) => x.key === 'category_style');
    if (i >= 0) {
      const propios = campos.filter((x) => CAMPOS_CATEGORIAS.includes(x));
      const resto = campos.filter((x) => !CAMPOS_CATEGORIAS.includes(x));
      const k = resto.findIndex((x) => x.key === 'category_style');
      resto.splice(k + 1, 0, ...propios);
      campos.splice(0, campos.length, ...resto);
    }
  }

  return {
    ...def,
    variants: [...def.variants, ...nuevas],
    contentFields: campos,
  };
}

// ─── Tipos nuevos ──────────────────────────────────────────────────────────────────────────

const variantesDe = (tipo: TipoSeccionTienda) => variantesTiendaDe(tipo);

export const SECCIONES_TIENDA_CATALOGO: SectionTypeDefinition[] = [
  {
    type: 'shop_the_look',
    label: 'Compra el espacio',
    icon: 'MousePointerClick',
    description: 'Una foto con puntos que llevan a productos reales del Inventario.',
    variants: variantesDe('shop_the_look'),
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Compra el espacio', section: 'Textos' },
      { key: 'image_url', label: 'Foto del ambiente', type: 'image', section: 'Foto', helpText: 'Sin foto, la sección no se pinta.' },
      {
        key: 'hotspots',
        label: 'Puntos',
        type: 'repeater',
        group: 'data',
        itemLabelKey: 'product_id',
        maxItems: MAX_PUNTOS_LOOK,
        section: 'Puntos',
        helpText: `Hasta ${MAX_PUNTOS_LOOK}. Un punto sin producto, o con uno inactivo o sin foto, no se pinta; sin ningún punto válido la sección se oculta.`,
        emptyStoreText: 'La sección no se pinta.',
        itemFields: itemPunto(false),
      },
      {
        key: 'show_cards',
        label: 'Mostrar las tarjetas de los productos',
        type: 'boolean',
        defaultValue: DEFAULT_COMPRA_EL_LOOK.showCards,
        section: 'Puntos',
        helpText: 'Con «Agregar», la tarjeta de producto de siempre.',
      },
    ],
  },
  {
    type: 'complete_the_look',
    label: 'Completa el look',
    icon: 'Sparkles',
    description: 'Productos que se llevan con este (comparten etiqueta); se agregan con el botón de siempre.',
    variants: variantesDe('complete_the_look'),
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: DEFAULT_COMPLETA_EL_LOOK.title },
      {
        key: 'source',
        label: 'Origen de los productos',
        type: 'select',
        group: 'data',
        defaultValue: DEFAULT_COMPLETA_EL_LOOK.source,
        options: opciones(FUENTES_LOOK, { tag: 'Comparten etiqueta con el producto', manual: 'Elegidos a mano' }),
      },
      {
        key: 'product_ids',
        label: 'Productos',
        type: 'entity',
        entity: 'product',
        multiple: true,
        group: 'data',
        helpText: `Hasta ${MAX_PRODUCTOS_LOOK}.`,
        showIf: { field: 'source', equals: 'manual' },
      },
      { key: 'limit', label: 'Cuántos', type: 'number', group: 'data', min: 1, max: MAX_PRODUCTOS_LOOK, defaultValue: DEFAULT_COMPLETA_EL_LOOK.limit },
      { key: 'image_url', label: 'Foto del look', type: 'image', helpText: 'Vacía: la segunda foto del producto.' },
      {
        key: 'show_add_all',
        label: 'Botón «Agregar todo»',
        type: 'boolean',
        defaultValue: DEFAULT_COMPLETA_EL_LOOK.showAddAll,
        helpText: 'Solo productos simples; los que tienen variantes enlazan a su ficha.',
      },
    ],
  },
  {
    type: 'product_index',
    label: 'Lista numerada de piezas',
    icon: 'List',
    description: 'Índice 01, 02, 03… con el nombre y el precio de productos reales.',
    variants: variantesDe('product_index'),
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Las piezas' },
      {
        key: 'product_ids',
        label: 'Productos',
        type: 'entity',
        entity: 'product',
        multiple: true,
        group: 'data',
        helpText: `Hasta ${MAX_PRODUCTOS_INDICE}. Vacío: los ${PRODUCTOS_INDICE_POR_DEFECTO} primeros con foto.`,
      },
      { key: 'show_price', label: 'Mostrar precio', type: 'boolean', defaultValue: DEFAULT_INDICE_PRODUCTOS.showPrice },
      { key: 'cta_text', label: 'Texto del enlace', type: 'text', placeholder: DEFAULT_INDICE_PRODUCTOS.ctaText },
      { key: 'cta_url', label: 'Destino del enlace', type: 'url', placeholder: DEFAULT_INDICE_PRODUCTOS.ctaUrl },
    ],
  },
  {
    type: 'product_anatomy',
    label: 'Pieza de cerca',
    icon: 'Search',
    description: 'Un producto y hasta 3 detalles que cuenta el dueño.',
    variants: variantesDe('product_anatomy'),
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'De cerca' },
      { key: 'product_id', label: 'Producto', type: 'entity', entity: 'product', group: 'data', helpText: 'Activo y con foto.' },
      {
        key: 'details',
        label: 'Detalles',
        type: 'repeater',
        itemLabelKey: 'title',
        maxItems: MAX_DETALLES_ANATOMIA,
        helpText: `Hasta ${MAX_DETALLES_ANATOMIA}. Sin producto o sin detalles, la sección no se pinta.`,
        emptyStoreText: 'La sección no se pinta.',
        itemFields: [
          { key: 'title', label: 'Título', type: 'text', placeholder: 'Ensamble a mano' },
          { key: 'text', label: 'Texto', type: 'textarea' },
        ],
      },
    ],
  },
  {
    type: 'welcome_popup',
    label: 'Ventana de bienvenida con cupón',
    icon: 'Megaphone',
    description: 'No ocupa lugar en la página: aparece a los pocos segundos, una vez por visitante.',
    variants: variantesDe('welcome_popup'),
    contentFields: [
      {
        key: 'enabled',
        label: 'Activa',
        type: 'boolean',
        defaultValue: DEFAULT_VENTANA_BIENVENIDA.enabled,
        section: 'Cupón',
        helpText: 'Solo se abre activa y con un código.',
      },
      {
        key: 'coupon_code',
        label: 'Código del cupón',
        type: 'text',
        placeholder: 'BIENVENIDA',
        section: 'Cupón',
        helpText: `El que creaste en tus cupones (letras, números, - y _; hasta ${MAX_CODIGO_CUPON}). Se aplica en el campo de cupón del carrito.`,
      },
      { key: 'title', label: 'Título', type: 'text', section: 'Textos' },
      { key: 'text', label: 'Texto', type: 'textarea', section: 'Textos' },
      { key: 'cta_text', label: 'Texto del botón', type: 'text', placeholder: 'Ir a la tienda', section: 'Textos' },
      { key: 'cta_url', label: 'Destino del botón', type: 'url', placeholder: '/productos', section: 'Textos' },
      { key: 'image_url', label: 'Foto', type: 'image', section: 'Textos' },
      {
        key: 'delay_s',
        label: 'Se abre a los',
        type: 'number',
        group: 'behavior',
        min: 0,
        max: 60,
        suffix: 's',
        defaultValue: DEFAULT_VENTANA_BIENVENIDA.delayS,
      },
      {
        key: 'frequency',
        label: 'Frecuencia',
        type: 'select',
        group: 'behavior',
        defaultValue: DEFAULT_VENTANA_BIENVENIDA.frequency,
        options: opciones(FRECUENCIAS_BIENVENIDA, { once: 'Una vez por visitante', session: 'Una vez por visita' }),
      },
    ],
  },
  {
    type: 'link_cloud',
    label: 'Nube de enlaces',
    icon: 'ListChecks',
    description: `Píldoras con las categorías reales o enlaces propios (mínimo ${MIN_ENLACES_NUBE}).`,
    variants: variantesDe('link_cloud'),
    contentFields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Lo más buscado' },
      {
        key: 'source',
        label: 'Enlaces',
        type: 'select',
        group: 'data',
        defaultValue: DEFAULT_NUBE_ENLACES.source,
        options: opciones(FUENTES_NUBE, { categories: 'Mis categorías', manual: 'Escritos a mano' }),
      },
      {
        key: 'links',
        label: 'Enlaces propios',
        type: 'repeater',
        group: 'data',
        itemLabelKey: 'label',
        maxItems: MAX_ENLACES_NUBE,
        helpText: `Con menos de ${MIN_ENLACES_NUBE}, la sección no se pinta.`,
        itemFields: [
          { key: 'label', label: 'Texto', type: 'text' },
          { key: 'url', label: 'Destino', type: 'url' },
        ],
        showIf: { field: 'source', equals: 'manual' },
      },
      { key: 'max', label: 'Máximo de enlaces', type: 'number', group: 'data', min: MIN_ENLACES_NUBE, max: MAX_ENLACES_NUBE, defaultValue: DEFAULT_NUBE_ENLACES.max },
    ],
  },
  {
    type: 'service_cards',
    label: 'Tarjetas de servicio',
    icon: 'LayoutPanelLeft',
    description: `Una foto con hasta ${MAX_TARJETAS_SERVICIO} tarjetas de enlaces y beneficios.`,
    variants: variantesDe('service_cards'),
    contentFields: [
      { key: 'image_url', label: 'Foto', type: 'image' },
      {
        key: 'cards',
        label: 'Tarjetas',
        type: 'repeater',
        itemLabelKey: 'title',
        maxItems: MAX_TARJETAS_SERVICIO,
        helpText: 'Sin tarjetas con título, enlaces o beneficios, la sección no se pinta.',
        itemFields: [
          { key: 'title', label: 'Título', type: 'text' },
          {
            key: 'links',
            label: 'Enlaces',
            type: 'repeater',
            itemLabelKey: 'label',
            maxItems: MAX_ENLACES_TARJETA_SERVICIO,
            itemFields: [
              { key: 'label', label: 'Texto', type: 'text' },
              { key: 'url', label: 'Destino', type: 'url', helpText: 'Una página real del sitio.' },
            ],
          },
          {
            key: 'benefits',
            label: 'Beneficios',
            type: 'chips',
            itemType: 'text',
            helpText: `Frases cortas, hasta ${MAX_ENLACES_TARJETA_SERVICIO}.`,
            maxItems: MAX_ENLACES_TARJETA_SERVICIO,
          },
        ],
      },
    ],
  },
  {
    type: 'product_anchor_nav',
    label: 'Pestañas que llevan a cada parte',
    icon: 'Newspaper',
    description: 'Pestañas fijas que saltan a cada bloque de la ficha (Resumen, Características, Envío, Reseñas).',
    variants: variantesDe('product_anchor_nav'),
    contentFields: [
      {
        key: 'items',
        label: 'Pestañas',
        type: 'repeater',
        itemLabelKey: 'label',
        maxItems: MAX_PESTANAS_ANCLA,
        helpText: 'Vacío: las cuatro de siempre. La tienda quita las que apuntan a un bloque oculto.',
        defaultItems: DEFAULT_PESTANAS_ANCLA.items.map((i) => ({ ...i })),
        itemFields: [
          { key: 'label', label: 'Texto', type: 'text' },
          {
            key: 'target',
            label: 'Lleva a',
            type: 'select',
            defaultValue: 'product_info',
            options: opciones(DESTINOS_ANCLA, {
              product_info: 'Información',
              product_description: 'Descripción',
              product_specs: 'Características',
              product_benefits: 'Beneficios',
              product_shipping: 'Envío',
              product_reviews: 'Reseñas',
              product_faq: 'Preguntas',
              related_products: 'Relacionados',
              complete_the_look: 'Completa el look',
            }),
          },
        ],
      },
      { key: 'sticky', label: 'Fijas arriba al bajar', type: 'boolean', defaultValue: DEFAULT_PESTANAS_ANCLA.sticky },
    ],
  },
  {
    type: 'product_pager',
    label: 'Anterior / siguiente',
    icon: 'MoveHorizontal',
    description: 'Enlaces al producto anterior y al siguiente de la misma categoría.',
    variants: variantesDe('product_pager'),
    contentFields: [
      { key: 'prev_text', label: 'Texto de anterior', type: 'text', placeholder: DEFAULT_PAGINADOR_FICHA.prevText },
      { key: 'next_text', label: 'Texto de siguiente', type: 'text', placeholder: DEFAULT_PAGINADOR_FICHA.nextText },
    ],
  },
];

/** Tipos nuevos que leen productos del Inventario («Faltan datos» en el diálogo). */
export const TIPOS_TIENDA_CON_PRODUCTOS = ['shop_the_look', 'complete_the_look', 'product_index', 'product_anatomy'] as const;

export { RUTA_CATEGORIAS as RUTA_CATEGORIAS_TIENDA, RUTA_PRODUCTOS as RUTA_PRODUCTOS_TIENDA };
