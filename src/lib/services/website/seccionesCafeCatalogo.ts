/**
 * Catálogo del editor para las variantes de «Café de especialidad» (Figma «16 Sitio web»,
 * 2223:46106, láminas 12 a 15): `hero` · «Carrusel editorial», `how_it_works` · «Capítulos»,
 * `menu_full` · «Línea de puntos» y `reservation` · «Plano de mesas».
 *
 * Claves, variantes y valores por defecto salen del contrato compartido con el sitio
 * (`src/lib/website/contrato/seccionesCafe.ts`): aquí solo se dice CÓMO se edita cada campo
 * (etiqueta, ayuda y pestaña). Los grupos son los del inspector (`InspectorSeccion.GRUPOS`):
 * Contenido = `content`/`data`, Diseño = `layout`/`carousel`/`behavior`, Avanzado = `style`.
 *
 * Los campos nuevos solo se muestran en su variante (`showIf.variantIn`). Cuando un campo que ya
 * existía necesita otra forma en la variante (las fotos del carrusel, los botones con máximo 3,
 * los capítulos con imagen), va una COPIA con la misma clave limitada a la variante: el inspector
 * muestra la de la variante y el contenido guardado no cambia al cambiar de variante.
 */
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import { BUTTON_ITEM_FIELDS, CARD_FIELDS, GRID_FIELDS } from '@/lib/services/website/sectionFieldGroups';
import {
  CAPITULOS_EJEMPLO,
  DEFAULT_CARTA_PUNTOS,
  DEFAULT_HISTORIA_CAPITULOS,
  DEFAULT_RESERVA_PLANO,
  DISENO_HISTORIA_CAPITULOS,
  ETIQUETAS_VARIANTE_CAFE,
  MAX_BOTONES_PORTADA,
  MAX_CAPITULOS,
  MAX_DESTACADOS_CARTA,
  MAX_FOTOS_PORTADA,
  MIN_DESTACADOS_CARTA,
  TEXTO_BOTON_RESERVA,
  VARIANTE_CARTA_PUNTOS,
  VARIANTE_HISTORIA_CAPITULOS,
  VARIANTE_PORTADA_EDITORIAL,
  VARIANTE_RESERVA_PLANO,
} from '@/lib/website/contrato/seccionesCafe';

const RUTA_PRODUCTOS = '/app/inventario/productos';

const solo = (variante: string) => ({ variantIn: [variante] });

// ─── hero · «Carrusel editorial» (lámina 12) ────────────────────────────────────────────────

export const VARIANTE_PORTADA_EDITORIAL_CATALOGO = { id: VARIANTE_PORTADA_EDITORIAL, label: ETIQUETAS_VARIANTE_CAFE.hero };

const SOLO_EDITORIAL = solo(VARIANTE_PORTADA_EDITORIAL);

/** Antetítulo: va antes del título, como en el bloque «Textos» de la lámina. */
export const CAMPO_ANTETITULO_PORTADA: ContentFieldDef = {
  key: 'eyebrow',
  label: 'Antetítulo',
  type: 'text',
  placeholder: 'Medellín · Café de especialidad',
  helpText: 'Línea corta sobre el título. Vacío: no se muestra.',
  showIf: SOLO_EDITORIAL,
};

/** Campos nuevos de la portada y las copias de fotos y botones para esta variante. */
export const CAMPOS_PORTADA_EDITORIAL: ContentFieldDef[] = [
  {
    key: 'slides',
    label: 'Fotos del carrusel',
    type: 'repeater',
    group: 'content',
    itemLabelKey: 'alt',
    maxItems: MAX_FOTOS_PORTADA,
    helpText: 'Las fotos rotan; el texto y los botones quedan fijos. Sin fotos: la portada de la sede.',
    showIf: SOLO_EDITORIAL,
    itemFields: [
      { key: 'image_url', label: 'Imagen de escritorio', type: 'image', helpText: 'Se ve en computador y tableta. Si queda vacía, se usa la de celular.' },
      { key: 'image_url_mobile', label: 'Imagen de celular', type: 'image', helpText: 'Vacía: el celular usa la de escritorio.' },
      { key: 'alt', label: 'Texto alternativo', type: 'text', placeholder: 'Terraza con mesas al sol', helpText: 'Describe la foto para quien no la ve.' },
    ],
  },
  {
    key: 'buttons',
    label: 'Botones',
    type: 'repeater',
    group: 'content',
    itemLabelKey: 'label',
    maxItems: MAX_BOTONES_PORTADA,
    helpText: 'Hasta 3 botones. Los destinos son páginas reales del sitio.',
    showIf: SOLO_EDITORIAL,
    itemFields: BUTTON_ITEM_FIELDS.map((f) => (f.key === 'full_width' ? { ...f, defaultValue: false } : f)),
  },
  {
    key: 'subtitle_style',
    label: 'Subtítulo en cursiva',
    type: 'select',
    group: 'style',
    defaultValue: 'normal',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'italic', label: 'Cursiva' },
    ],
    showIf: SOLO_EDITORIAL,
  },
];

// ─── how_it_works · «Capítulos» (lámina 13) ─────────────────────────────────────────────────

export const VARIANTE_HISTORIA_CAPITULOS_CATALOGO = { id: VARIANTE_HISTORIA_CAPITULOS, label: ETIQUETAS_VARIANTE_CAFE.how_it_works };

const SOLO_CAPITULOS = solo(VARIANTE_HISTORIA_CAPITULOS);

const CLAVES_TARJETA = ['card_radius', 'card_shadow', 'card_border_width', 'card_border_color', 'card_bg'];
const DEFAULT_TARJETA_CAPITULO: Record<string, unknown> = {
  card_radius: DISENO_HISTORIA_CAPITULOS.cardRadius,
  card_shadow: DISENO_HISTORIA_CAPITULOS.cardShadow,
  card_border_width: DISENO_HISTORIA_CAPITULOS.cardBorderWidth,
};

/** Antetítulo de los capítulos: antes del título. */
export const CAMPO_ANTETITULO_CAPITULOS: ContentFieldDef = {
  key: 'eyebrow',
  label: 'Antetítulo',
  type: 'text',
  placeholder: 'Nuestra historia',
  helpText: 'Vacío: no se muestra.',
  showIf: SOLO_CAPITULOS,
};

export const CAMPOS_HISTORIA_CAPITULOS: ContentFieldDef[] = [
  {
    key: 'items',
    label: 'Capítulos',
    type: 'repeater',
    group: 'content',
    itemLabelKey: 'title',
    maxItems: MAX_CAPITULOS,
    defaultItems: CAPITULOS_EJEMPLO.map((c) => ({ ...c })),
    helpText: 'De 2 a 6. Al volver a «Pasos» se conservan número, título y descripción.',
    showIf: SOLO_CAPITULOS,
    itemFields: [
      { key: 'step', label: 'Número', type: 'number', placeholder: '1', helpText: 'Solo si apagas «Numerar solo».' },
      { key: 'label', label: 'Etiqueta del capítulo', type: 'text', placeholder: 'El origen' },
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Una finca en la montaña' },
      { key: 'description', label: 'Texto', type: 'textarea' },
      { key: 'image_url', label: 'Imagen o ilustración', type: 'image', helpText: 'La sube el dueño. Sin imagen se usa el icono.' },
      { key: 'image_alt', label: 'Texto alternativo', type: 'text', placeholder: 'Cafeto en flor' },
      { key: 'icon', label: 'Icono (sin imagen)', type: 'icon' },
    ],
  },
  {
    key: 'show_numbers',
    label: 'Numerar solo',
    type: 'boolean',
    defaultValue: DEFAULT_HISTORIA_CAPITULOS.showNumbers,
    helpText: '01, 02, 03… según el orden de los capítulos.',
    showIf: SOLO_CAPITULOS,
  },
  // Rejilla de «Capítulos» (lámina 13): la proporción de la imagen es 16:10 y el texto, a la izquierda.
  {
    ...(GRID_FIELDS.find((f) => f.key === 'aspect_ratio') as ContentFieldDef),
    label: 'Proporción de la imagen',
    defaultValue: DEFAULT_HISTORIA_CAPITULOS.proporcionImagen,
    options: [
      { value: '16/10', label: '16:10' },
      { value: '4/3', label: '4:3' },
      { value: '1/1', label: 'Cuadrada' },
      { value: '3/4', label: '3:4 (vertical)' },
    ],
    showIf: SOLO_CAPITULOS,
  },
  {
    key: 'text_align',
    label: 'Alineación del texto',
    type: 'select',
    group: 'layout',
    defaultValue: DEFAULT_HISTORIA_CAPITULOS.textAlign,
    options: [
      { value: 'left', label: 'Izquierda' },
      { value: 'center', label: 'Centro' },
    ],
    showIf: SOLO_CAPITULOS,
  },
  {
    key: 'hover_motion',
    label: 'Animación al pasar el cursor',
    type: 'boolean',
    group: 'behavior',
    defaultValue: DEFAULT_HISTORIA_CAPITULOS.hoverMotion,
    helpText: 'La tarjeta sube 6 px, con sombra y acento. Respeta «reducir movimiento».',
    showIf: SOLO_CAPITULOS,
  },
  {
    key: 'reveal_on_scroll',
    label: 'Entrada al hacer scroll (celular)',
    type: 'boolean',
    group: 'behavior',
    defaultValue: DEFAULT_HISTORIA_CAPITULOS.revealOnScroll,
    helpText: 'En celular no hay cursor: las tarjetas entran suave al aparecer.',
    showIf: SOLO_CAPITULOS,
  },
  ...CARD_FIELDS.filter((f) => CLAVES_TARJETA.includes(f.key)).map(
    (f): ContentFieldDef => ({
      ...f,
      ...(f.key in DEFAULT_TARJETA_CAPITULO ? { defaultValue: DEFAULT_TARJETA_CAPITULO[f.key] } : {}),
      showIf: { ...(f.showIf ?? {}), variantIn: [VARIANTE_HISTORIA_CAPITULOS] },
    }),
  ),
];

// ─── menu_full · «Línea de puntos» (lámina 14) ──────────────────────────────────────────────

export const VARIANTE_CARTA_PUNTOS_CATALOGO = { id: VARIANTE_CARTA_PUNTOS, label: ETIQUETAS_VARIANTE_CAFE.menu_full };

const SOLO_PUNTOS = solo(VARIANTE_CARTA_PUNTOS);
/** La carta entera (no «Solo destacados»): pestañas, contador y selector de sede. */
const CARTA_ENTERA = { field: 'only_featured', in: [false, undefined, null], variantIn: [VARIANTE_CARTA_PUNTOS] };
const SOLO_DESTACADOS = { field: 'only_featured', equals: true, variantIn: [VARIANTE_CARTA_PUNTOS] };

export const CAMPOS_CARTA_PUNTOS: ContentFieldDef[] = [
  {
    key: '_precio_sede',
    label: 'Precios de la sede',
    type: 'notice',
    group: 'data',
    helpText: 'Cada plato muestra el precio vigente de la sede elegida. Si la sede no tiene precio propio, el general. No se escribe aquí.',
    link: { label: 'Abrir Inventario › Productos', href: RUTA_PRODUCTOS },
    showIf: SOLO_PUNTOS,
  },
  {
    key: 'only_featured',
    label: 'Solo destacados',
    type: 'boolean',
    group: 'data',
    defaultValue: DEFAULT_CARTA_PUNTOS.onlyFeatured,
    helpText:
      'Para Inicio: los platos marcados como destacados en «Editar la carta», sin pestañas ni selector de sede, y el botón a la carta completa. Sin destacados marcados: los primeros de la carta.',
    showIf: SOLO_PUNTOS,
  },
  {
    key: 'featured_limit',
    label: 'Cuántos platos',
    type: 'number',
    group: 'data',
    min: MIN_DESTACADOS_CARTA,
    max: MAX_DESTACADOS_CARTA,
    placeholder: String(DEFAULT_CARTA_PUNTOS.featuredLimit),
    helpText: 'En dos columnas.',
    showIf: SOLO_DESTACADOS,
  },
  {
    key: 'view_all_text',
    label: 'Texto del botón',
    type: 'text',
    group: 'data',
    placeholder: DEFAULT_CARTA_PUNTOS.viewAllText,
    helpText: 'Vacío: sin botón.',
    showIf: SOLO_DESTACADOS,
  },
  {
    key: 'view_all_url',
    label: 'Enlace del botón',
    type: 'url',
    group: 'data',
    placeholder: DEFAULT_CARTA_PUNTOS.viewAllUrl,
    showIf: SOLO_DESTACADOS,
  },
  {
    key: 'show_branch_selector',
    label: 'Selector de sede para el visitante',
    type: 'boolean',
    group: 'data',
    defaultValue: DEFAULT_CARTA_PUNTOS.showBranchSelector,
    helpText: 'Cambia precios y platos sin recargar. En la página de una sede no se muestra.',
    showIf: CARTA_ENTERA,
  },
  {
    key: 'branch_ids',
    label: 'Sedes que se muestran',
    type: 'entity',
    entity: 'branch',
    multiple: true,
    group: 'data',
    helpText: 'Sin selección: las sedes con sitio publicado.',
    showIf: { field: 'show_branch_selector', in: [true, undefined], variantIn: [VARIANTE_CARTA_PUNTOS], and: CARTA_ENTERA },
  },
  {
    key: 'show_counter',
    label: 'Mostrar contador',
    type: 'boolean',
    group: 'data',
    defaultValue: DEFAULT_CARTA_PUNTOS.showCounter,
    helpText: '«Café · 12 preparaciones»: cuenta los platos visibles de la pestaña.',
    showIf: CARTA_ENTERA,
  },
  {
    key: 'counter_label',
    label: 'Texto del contador',
    type: 'text',
    group: 'data',
    placeholder: DEFAULT_CARTA_PUNTOS.counterLabel,
    showIf: { field: 'show_counter', in: [true, undefined], variantIn: [VARIANTE_CARTA_PUNTOS], and: CARTA_ENTERA },
  },
  {
    key: 'show_options',
    label: 'Variantes y adicionales con precio',
    type: 'boolean',
    group: 'data',
    defaultValue: DEFAULT_CARTA_PUNTOS.showOptions,
    helpText: '«Bebida vegetal +$2.000». Salen de las variantes y adicionales del producto; lo que la sede oculta no aparece.',
    showIf: SOLO_PUNTOS,
  },
  {
    key: 'tabs_style',
    label: 'Pestañas de categoría',
    type: 'select',
    group: 'layout',
    defaultValue: DEFAULT_CARTA_PUNTOS.tabsStyle,
    options: [
      { value: 'italic', label: 'Cursiva con subrayado' },
      { value: 'pill', label: 'Píldora' },
      { value: 'underline', label: 'Subrayado' },
    ],
    showIf: CARTA_ENTERA,
  },
  {
    key: 'branch_selector_style',
    label: 'Selector de sede',
    type: 'select',
    group: 'layout',
    defaultValue: DEFAULT_CARTA_PUNTOS.branchSelectorStyle,
    options: [
      { value: 'pill', label: 'Píldora centrada' },
      { value: 'list', label: 'Lista' },
    ],
    showIf: { field: 'show_branch_selector', in: [true, undefined], variantIn: [VARIANTE_CARTA_PUNTOS], and: CARTA_ENTERA },
  },
  {
    key: 'sticky_tabs',
    label: 'Fijar pestañas al hacer scroll',
    type: 'boolean',
    group: 'layout',
    defaultValue: DEFAULT_CARTA_PUNTOS.stickyTabs,
    showIf: CARTA_ENTERA,
  },
  {
    key: 'leader_style',
    label: 'Línea hasta el precio',
    type: 'select',
    group: 'style',
    defaultValue: DEFAULT_CARTA_PUNTOS.leaderStyle,
    options: [
      { value: 'dots', label: 'Puntos' },
      { value: 'line', label: 'Línea' },
      { value: 'none', label: 'Ninguna' },
    ],
    showIf: SOLO_PUNTOS,
  },
  {
    key: 'show_compare_price',
    label: 'Tachar precio anterior',
    type: 'boolean',
    group: 'style',
    defaultValue: DEFAULT_CARTA_PUNTOS.showComparePrice,
    helpText: 'Solo los platos con precio anterior en Inventario.',
    showIf: SOLO_PUNTOS,
  },
];

// ─── reservation · «Plano de mesas» (lámina 15) ─────────────────────────────────────────────

export const VARIANTE_RESERVA_PLANO_CATALOGO = { id: VARIANTE_RESERVA_PLANO, label: ETIQUETAS_VARIANTE_CAFE.reservation };

const SOLO_PLANO = solo(VARIANTE_RESERVA_PLANO);
const MODO_WHATSAPP = { field: 'booking_mode', equals: 'whatsapp', variantIn: [VARIANTE_RESERVA_PLANO] };

/**
 * Pestaña Contenido en el orden y con los bloques de la lámina 15: Textos · Cómo se confirma ·
 * Sedes y plano · Reglas. Los campos de textos, sedes y reglas ya existían en `reservation`: aquí
 * van COPIAS con la misma clave, limitadas a esta variante, para que el panel tenga los bloques y
 * el orden de la lámina (en las demás variantes no cambia nada y el contenido guardado es el
 * mismo). El ancla pasa a Avanzado, como en la lámina.
 */
const TEXTOS = 'Textos';
const CONFIRMA = 'Cómo se confirma';
const SEDES_PLANO = 'Sedes y plano';
const REGLAS = 'Reglas';

export const CAMPOS_RESERVA_PLANO: ContentFieldDef[] = [
  { key: 'eyebrow', label: 'Antetítulo', type: 'text', section: TEXTOS, placeholder: 'Reservas', showIf: SOLO_PLANO },
  { key: 'title', label: 'Título', type: 'text', section: TEXTOS, placeholder: 'Reserva tu mesa', showIf: SOLO_PLANO },
  { key: 'subtitle', label: 'Texto de introducción', type: 'textarea', section: TEXTOS, placeholder: 'Escoge la fecha, toca en el plano la mesa que prefieras y déjanos tus datos.', showIf: SOLO_PLANO },
  {
    key: 'cta_text',
    label: 'Texto del botón',
    type: 'text',
    section: TEXTOS,
    placeholder: TEXTO_BOTON_RESERVA.erp,
    helpText: `Vacío: «${TEXTO_BOTON_RESERVA.erp}»; en modo WhatsApp, «${TEXTO_BOTON_RESERVA.whatsapp}».`,
    showIf: SOLO_PLANO,
  },
  {
    key: 'booking_mode',
    label: 'Modo',
    type: 'select',
    display: 'dropdown',
    group: 'data',
    section: CONFIRMA,
    // Sin elegir lo resuelve la sede (E1): así lo dice el campo en vez de «Elige una opción».
    placeholder: 'Según la sede',
    options: [
      { value: 'erp', label: 'Directo al ERP' },
      { value: 'whatsapp', label: 'Por WhatsApp' },
    ],
    helpText:
      'Directo al ERP: disponibilidad real por mesa y hora; la reserva entra a POS › Reservas de mesas. Por WhatsApp: abre el chat de la sede con el mensaje armado. Sin elegir: directo al ERP si la sede tiene las reservas activas; si no, por WhatsApp.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'also_register',
    label: 'Registrar también en el ERP',
    type: 'boolean',
    group: 'data',
    section: CONFIRMA,
    defaultValue: DEFAULT_RESERVA_PLANO.alsoRegister,
    helpText: 'La solicitud queda «Por confirmar» en POS › Reservas de mesas.',
    showIf: MODO_WHATSAPP,
  },
  {
    key: '_whatsapp_sede',
    label: 'WhatsApp que recibe',
    type: 'notice',
    display: 'field',
    group: 'data',
    section: CONFIRMA,
    placeholder: 'El de cada sede',
    helpText: 'Sale de la sede o del sitio (Configuración); no se escribe aquí.',
    showIf: MODO_WHATSAPP,
  },
  {
    key: 'branch_ids',
    label: 'Sedes que reciben reservas',
    type: 'entity',
    entity: 'branch',
    multiple: true,
    group: 'data',
    section: SEDES_PLANO,
    helpText: 'Sin selección: las sedes con mesas y reservas activas. En la página de una sede, solo esa. El plano es el de POS › Mesas de cada sede.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'zones',
    label: 'Zonas que se muestran',
    type: 'entity',
    entity: 'zone',
    multiple: true,
    group: 'data',
    section: SEDES_PLANO,
    helpText: 'Sin selección: las zonas que la sede deja reservar (POS › Reservas de mesas › Configuración).',
    showIf: SOLO_PLANO,
  },
  {
    key: 'show_legend',
    label: 'Mostrar leyenda',
    type: 'boolean',
    group: 'data',
    section: SEDES_PLANO,
    defaultValue: DEFAULT_RESERVA_PLANO.showLegend,
    helpText: 'Disponible · Tu selección · No disponible a esa hora.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'show_capacity',
    label: 'Mostrar capacidad bajo cada mesa',
    type: 'boolean',
    group: 'data',
    section: SEDES_PLANO,
    defaultValue: DEFAULT_RESERVA_PLANO.showCapacity,
    showIf: SOLO_PLANO,
  },
  { key: 'min_guests', label: 'Personas desde', type: 'number', group: 'data', section: REGLAS, half: true, min: 1, max: 50, placeholder: '1', showIf: SOLO_PLANO },
  {
    key: 'max_guests',
    label: 'hasta',
    type: 'number',
    group: 'data',
    section: REGLAS,
    half: true,
    min: 1,
    max: 100,
    placeholder: '8',
    showIf: SOLO_PLANO,
  },
  {
    key: 'max_days',
    label: 'Días de anticipación',
    type: 'number',
    group: 'data',
    section: REGLAS,
    min: 0,
    max: 365,
    placeholder: '30',
    helpText: 'Personas y días nunca salen de lo que permite la sede.',
    showIf: SOLO_PLANO,
  },
  { key: 'show_notes', label: 'Pedir notas', type: 'boolean', group: 'data', section: REGLAS, defaultValue: true, showIf: SOLO_PLANO },
  { key: 'require_email', label: 'Correo obligatorio', type: 'boolean', group: 'data', section: REGLAS, defaultValue: false, showIf: SOLO_PLANO },
  {
    key: 'policy_text',
    label: 'Política de reservas',
    type: 'textarea',
    group: 'data',
    section: REGLAS,
    placeholder: 'Vacío: la de la sede',
    helpText: 'Si la sede tiene política en su configuración, manda la de la sede.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'success_message',
    label: 'Mensaje: confirmada',
    type: 'text',
    group: 'data',
    section: REGLAS,
    placeholder: 'Te esperamos. Si dejaste tu correo, te enviamos la confirmación.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'pending_message',
    label: 'Mensaje: por confirmar',
    type: 'text',
    group: 'data',
    section: REGLAS,
    placeholder: 'El equipo revisará tu solicitud y te avisará cuando la confirme.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'anchor_id',
    label: 'Ancla de la sección',
    type: 'text',
    group: 'advanced',
    placeholder: 'reservar',
    helpText: 'Los botones «Reservar» de «Horario y sedes» enlazan a #reservar con la sede elegida.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'plan_position',
    label: 'Plano y formulario',
    type: 'select',
    group: 'layout',
    defaultValue: DEFAULT_RESERVA_PLANO.planPosition,
    options: [
      { value: 'left', label: 'Plano a la izquierda' },
      { value: 'right', label: 'Plano a la derecha' },
      { value: 'top', label: 'Plano arriba' },
    ],
    showIf: SOLO_PLANO,
  },
  {
    key: 'mobile_plan',
    label: 'En celular',
    type: 'select',
    group: 'layout',
    defaultValue: DEFAULT_RESERVA_PLANO.mobilePlan,
    options: [
      { value: 'sheet', label: 'Plano a lo ancho + hoja con la mesa' },
      { value: 'list', label: 'Lista de mesas' },
    ],
    showIf: SOLO_PLANO,
  },
  {
    key: 'ask_time_first',
    label: 'Primero fecha, hora y personas',
    type: 'boolean',
    group: 'behavior',
    defaultValue: DEFAULT_RESERVA_PLANO.askTimeFirst,
    helpText: 'El plano atenúa las mesas que no sirven a esa hora.',
    showIf: { field: 'booking_mode', in: ['erp', undefined, null, ''], variantIn: [VARIANTE_RESERVA_PLANO] },
  },
  {
    key: 'table_optional',
    label: 'Elegir mesa es opcional',
    type: 'boolean',
    group: 'behavior',
    defaultValue: DEFAULT_RESERVA_PLANO.tableOptional,
    helpText: 'Ofrece «Que la asigne el equipo».',
    showIf: SOLO_PLANO,
  },
  {
    key: 'dim_small_tables',
    label: 'Atenuar mesas que no alcanzan',
    type: 'boolean',
    group: 'behavior',
    defaultValue: DEFAULT_RESERVA_PLANO.dimSmallTables,
    helpText: 'Las mesas con menos puestos que el grupo se ven apagadas.',
    showIf: SOLO_PLANO,
  },
  {
    key: 'plan_style',
    label: 'Estilo del plano',
    type: 'select',
    group: 'style',
    defaultValue: DEFAULT_RESERVA_PLANO.planStyle,
    options: [
      { value: 'line', label: 'Línea' },
      { value: 'filled', label: 'Relleno' },
    ],
    showIf: SOLO_PLANO,
  },
];
