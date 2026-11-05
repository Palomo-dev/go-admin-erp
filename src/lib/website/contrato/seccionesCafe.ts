/**
 * Contrato de las variantes de la plantilla «Café de especialidad» (Figma «16 Sitio web»,
 * sección 2223:46106, láminas 11 a 15; componentes en 2224:46106).
 *
 * Las cuatro piezas nuevas NO son tipos nuevos: son VARIANTES de tipos que ya existen, y sirven
 * en cualquier página, plantilla y sede:
 * - `hero` · `carousel_editorial` («Carrusel editorial», lámina 12): las fotos rotan, el texto y
 *   hasta 3 botones quedan fijos. Suma `eyebrow` y `subtitle_style`.
 * - `how_it_works` · `chapters` («Historia por capítulos», lámina 13): cada ítem suma etiqueta e
 *   imagen; numeración automática, animación al pasar el cursor y entrada al hacer scroll.
 * - `menu_full` · `dotted` («Línea de puntos», lámina 14): pestañas en cursiva, contador, línea de
 *   puntos hasta el precio, variantes o adicionales con precio y selector de sede.
 * - `reservation` · `floor_plan` («Plano de mesas», lámina 15): el plano de POS › Mesas de la sede;
 *   el dueño elige cómo se confirma (`booking_mode`: directo al ERP o por WhatsApp).
 *
 * Este archivo es la única definición de lo nuevo y lo leen los dos lados:
 * - el editor del ERP (catálogo de secciones, inspector y plantilla), y
 * - el sitio público (goadmin-websites), que lo copia tal cual (`npm run verify:copias`).
 *
 * Reglas del contrato (las mismas de `seccionesMesa.ts`):
 * - Cada campo tiene su default; ausente, nulo o fuera de la regla = default. Una sección recién
 *   añadida sin tocar se ve igual que las láminas.
 * - `CLAVES_*` son las claves NUEVAS que lee el componente como contenido (van al manifiesto del
 *   sitio); `CLAVES_DISENO_*`, las nuevas de las pestañas Diseño y Avanzado. Las claves que ya
 *   existían en el tipo siguen donde estaban.
 * - Ningún color propio: las variantes usan las variables del tema.
 * - Lo que es operación (mesas, zonas, disponibilidad, precios por sede, número de WhatsApp) sale
 *   de la base, no de aquí.
 *
 * Código puro: sin imports, sin React ni Supabase.
 */

// ─── Variantes ──────────────────────────────────────────────────────────────────────────────

export const VARIANTE_PORTADA_EDITORIAL = 'carousel_editorial' as const;
export const VARIANTE_HISTORIA_CAPITULOS = 'chapters' as const;
export const VARIANTE_CARTA_PUNTOS = 'dotted' as const;
export const VARIANTE_RESERVA_PLANO = 'floor_plan' as const;

/** Tipo de sección → variante nueva. */
export const VARIANTES_CAFE = {
  hero: VARIANTE_PORTADA_EDITORIAL,
  how_it_works: VARIANTE_HISTORIA_CAPITULOS,
  menu_full: VARIANTE_CARTA_PUNTOS,
  reservation: VARIANTE_RESERVA_PLANO,
} as const;
export type TipoSeccionCafe = keyof typeof VARIANTES_CAFE;

/** Nombre visible de cada variante (selector de variante del inspector). */
export const ETIQUETAS_VARIANTE_CAFE: Record<TipoSeccionCafe, string> = {
  hero: 'Carrusel editorial',
  how_it_works: 'Capítulos',
  menu_full: 'Línea de puntos',
  reservation: 'Plano de mesas',
};

export function esVarianteCafe(tipo: string, variante: unknown): boolean {
  return (VARIANTES_CAFE as Record<string, string>)[tipo] === variante;
}

// ─── Lectores de campos ─────────────────────────────────────────────────────────────────────

const MAX_TEXTO = 300;
const MAX_ETIQUETA = 60;
const MAX_URL = 2048;

function texto(valor: unknown, porDefecto: string, max = MAX_TEXTO): string {
  if (typeof valor !== 'string') return porDefecto;
  const t = valor.trim();
  return t === '' ? porDefecto : t.slice(0, max);
}

/** Texto que el editor puede dejar vacío a propósito (`''` = no se muestra). */
function textoOpcional(valor: unknown, porDefecto: string, max = MAX_TEXTO): string {
  if (typeof valor !== 'string') return porDefecto;
  return valor.trim().slice(0, max);
}

function booleano(valor: unknown, porDefecto: boolean): boolean {
  if (typeof valor === 'boolean') return valor;
  if (valor === 'true') return true;
  if (valor === 'false') return false;
  return porDefecto;
}

function enteroEntre(valor: unknown, min: number, max: number, porDefecto: number): number {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
}

function unoDe<T extends string>(valor: unknown, lista: readonly T[], porDefecto: T): T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : porDefecto;
}

/** Enlace de imagen: `https://`, `http://` o ruta propia. Cualquier otra cosa = vacío. */
function urlImagen(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const t = valor.trim();
  return /^(https?:\/\/|\/(?!\/))[^\s]*$/i.test(t) ? t.slice(0, MAX_URL) : '';
}

/** Ids enteros positivos sin repetir. */
function listaIds(valor: unknown, max = 50): number[] {
  if (!Array.isArray(valor)) return [];
  const salida: number[] = [];
  for (const v of valor) {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    if (typeof n === 'number' && Number.isInteger(n) && n > 0 && !salida.includes(n)) salida.push(n);
    if (salida.length >= max) break;
  }
  return salida;
}

/** Textos cortos sin repetir (sin distinguir mayúsculas). Ausente o vacío = `[]`. */
function listaTextos(valor: unknown, max: number): string[] {
  if (!Array.isArray(valor)) return [];
  const salida: string[] = [];
  for (const v of valor) {
    const t = typeof v === 'string' ? v.trim().slice(0, MAX_ETIQUETA) : '';
    if (t && !salida.some((s) => s.toLowerCase() === t.toLowerCase())) salida.push(t);
    if (salida.length >= max) break;
  }
  return salida;
}

function objetos(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor) ? valor.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : [];
}

// ─── hero · «Carrusel editorial» (lámina 12) ────────────────────────────────────────────────

/** Claves nuevas de contenido. Título, subtítulo, fotos (`slides[]`) y botones ya existían. */
export const CLAVES_PORTADA_EDITORIAL = ['eyebrow'] as const;
/** Claves nuevas de Avanzado. */
export const CLAVES_DISENO_PORTADA_EDITORIAL = ['subtitle_style'] as const;
/** Campos de cada foto del carrusel (`slides[]`). */
export const CLAVES_FOTO_PORTADA = ['image_url', 'image_url_mobile', 'alt'] as const;

export const ESTILOS_SUBTITULO = ['normal', 'italic'] as const;
export type EstiloSubtitulo = (typeof ESTILOS_SUBTITULO)[number];
export const TRANSICIONES_PORTADA = ['fade', 'slide', 'zoom'] as const;
export const PUNTOS_PORTADA = ['bars', 'dots', 'numbers'] as const;
export const MAX_FOTOS_PORTADA = 8;
export const MAX_BOTONES_PORTADA = 3;

export interface FotoPortada {
  imageUrl: string;
  /** Vacía: el celular usa la de escritorio. */
  imageUrlMobile: string;
  alt: string;
}

export interface BotonPortada {
  label: string;
  url: string;
  icon: string;
  variant: string;
}

export interface PortadaEditorial {
  /** Antetítulo («MEDELLÍN · CAFÉ DE ESPECIALIDAD»). `''` = no se muestra. */
  eyebrow: string;
  /** Cursiva en la plantilla del café; normal en las demás. */
  subtitleStyle: EstiloSubtitulo;
  /**
   * Fotos que rotan (hasta 8). Vacío: el sitio usa la portada de la sede
   * (`branches.website_cover_url`) y, sin ella, el degradado del tema (E10).
   */
  fotos: FotoPortada[];
  /** Hasta 3 botones con texto y enlace; el resto no se pinta. */
  botones: BotonPortada[];
  autoplay: boolean;
  intervalMs: number;
  pauseOnHover: boolean;
  loop: boolean;
  transition: (typeof TRANSICIONES_PORTADA)[number];
  showArrows: boolean;
  showDots: boolean;
  dotStyle: (typeof PUNTOS_PORTADA)[number];
  enableSwipe: boolean;
  /** Mismas claves que las demás variantes de la portada, con los defaults de la lámina. */
  height: string;
  contentPosition: string;
  textAlign: 'left' | 'center' | 'right';
  overlapHeader: boolean;
  showOverlay: boolean;
  overlayOpacity: number;
}

export const DEFAULT_PORTADA_EDITORIAL: PortadaEditorial = {
  eyebrow: '',
  subtitleStyle: 'normal',
  fotos: [],
  botones: [],
  autoplay: true,
  intervalMs: 6000,
  pauseOnHover: true,
  loop: true,
  transition: 'fade',
  showArrows: false,
  showDots: true,
  dotStyle: 'bars',
  enableSwipe: true,
  height: '100vh',
  contentPosition: 'middle-left',
  textAlign: 'left',
  overlapHeader: true,
  showOverlay: true,
  overlayOpacity: 45,
};

const ALTURAS_PORTADA = ['50vh', '70vh', '100vh', 'auto', 'image', 'custom'] as const;
const POSICION_CONTENIDO = /^(top|middle|bottom)-(left|center|right)$/;

function fotosPortada(valor: unknown): FotoPortada[] {
  const salida: FotoPortada[] = [];
  for (const o of objetos(valor)) {
    const imageUrl = urlImagen(o.image_url);
    const imageUrlMobile = urlImagen(o.image_url_mobile);
    // Solo la de celular: se ve en todos los anchos (misma regla que la portada de hoy).
    if (!imageUrl && !imageUrlMobile) continue;
    salida.push({
      imageUrl: imageUrl || imageUrlMobile,
      imageUrlMobile,
      alt: textoOpcional(o.alt, '', 200),
    });
    if (salida.length >= MAX_FOTOS_PORTADA) break;
  }
  return salida;
}

function botonesPortada(valor: unknown): BotonPortada[] {
  const salida: BotonPortada[] = [];
  for (const o of objetos(valor)) {
    const label = textoOpcional(o.label, '', MAX_ETIQUETA);
    const url = textoOpcional(o.url, '', MAX_URL);
    if (!label || !url) continue;
    salida.push({ label, url, icon: textoOpcional(o.icon, '', MAX_ETIQUETA), variant: textoOpcional(o.variant, 'solid', 20) || 'solid' });
    if (salida.length >= MAX_BOTONES_PORTADA) break;
  }
  return salida;
}

export function normalizarPortadaEditorial(content: Record<string, unknown> | null | undefined): PortadaEditorial {
  const c = content ?? {};
  const d = DEFAULT_PORTADA_EDITORIAL;
  const posicion = typeof c.content_position === 'string' && POSICION_CONTENIDO.test(c.content_position) ? c.content_position : d.contentPosition;
  return {
    eyebrow: textoOpcional(c.eyebrow, d.eyebrow, MAX_ETIQUETA * 2),
    subtitleStyle: unoDe(c.subtitle_style, ESTILOS_SUBTITULO, d.subtitleStyle),
    fotos: fotosPortada(c.slides),
    botones: botonesPortada(c.buttons),
    autoplay: booleano(c.autoplay, d.autoplay),
    intervalMs: enteroEntre(c.interval_ms, 1000, 15000, d.intervalMs),
    pauseOnHover: booleano(c.pause_on_hover, d.pauseOnHover),
    loop: booleano(c.loop, d.loop),
    transition: unoDe(c.transition, TRANSICIONES_PORTADA, d.transition),
    showArrows: booleano(c.show_arrows, d.showArrows),
    showDots: booleano(c.show_dots, d.showDots),
    dotStyle: unoDe(c.dot_style, PUNTOS_PORTADA, d.dotStyle),
    enableSwipe: booleano(c.enable_swipe, d.enableSwipe),
    height: unoDe(c.height, ALTURAS_PORTADA, '100vh'),
    contentPosition: posicion,
    textAlign: unoDe(c.text_align, ['left', 'center', 'right'] as const, d.textAlign),
    overlapHeader: booleano(c.overlap_header, d.overlapHeader),
    showOverlay: booleano(c.show_overlay, d.showOverlay),
    overlayOpacity: enteroEntre(c.overlay_opacity, 0, 100, d.overlayOpacity),
  };
}

// ─── how_it_works · «Capítulos» (lámina 13) ─────────────────────────────────────────────────

/** Claves nuevas de contenido. Título, subtítulo e `items[]` ya existían. */
export const CLAVES_HISTORIA_CAPITULOS = ['eyebrow', 'show_numbers'] as const;
/** Claves nuevas de la pestaña Diseño (bloque Movimiento). */
export const CLAVES_DISENO_HISTORIA_CAPITULOS = ['hover_motion', 'reveal_on_scroll', 'text_align'] as const;
/** Campos NUEVOS de cada capítulo (`items[]`); `step`, `title`, `description` e `icon` ya existían. */
export const CLAVES_ITEM_CAPITULO = ['label', 'image_url', 'image_alt'] as const;

export const MIN_CAPITULOS = 2;
export const MAX_CAPITULOS = 6;

export interface Capitulo {
  /** «01», «02»… con `show_numbers`; si no, el `step` que escribió el dueño (o vacío). */
  numero: string;
  /** «El origen». `''` = sin etiqueta. */
  label: string;
  title: string;
  description: string;
  /** Imagen o ilustración que sube el dueño. Vacía: se usa el icono. */
  imageUrl: string;
  imageAlt: string;
  icon: string;
}

export interface HistoriaCapitulos {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Numerar solo (01, 02, 03 según el orden). */
  showNumbers: boolean;
  /** Sube 6 px, sombra y acento al pasar el cursor. El sitio respeta «reducir movimiento». */
  hoverMotion: boolean;
  /** En celular (sin cursor) la animación se cambia por una entrada suave al hacer scroll. */
  revealOnScroll: boolean;
  capitulos: Capitulo[];
  /** Proporción de la imagen de cada capítulo (`aspect_ratio`; en esta variante, 16:10). */
  proporcionImagen: string;
  textAlign: 'left' | 'center';
}

export const DEFAULT_HISTORIA_CAPITULOS: Omit<HistoriaCapitulos, 'capitulos'> = {
  eyebrow: '',
  title: 'Nuestra historia',
  subtitle: 'Pasa el cursor por cada capítulo: la historia se mueve contigo.',
  showNumbers: true,
  hoverMotion: true,
  revealOnScroll: true,
  proporcionImagen: '16/10',
  textAlign: 'left',
};

/** Proporciones de la imagen del capítulo. */
export const PROPORCIONES_CAPITULO = ['16/10', '4/3', '1/1', '3/4'] as const;

/** Defaults de la rejilla y la tarjeta en esta variante (lámina 13). */
export const DISENO_HISTORIA_CAPITULOS = { columns: 3, gap: 28, cardRadius: 24, cardShadow: 'none', cardBorderWidth: 1 } as const;

/** Tres capítulos de ejemplo, sin hechos inventados: el dueño cuenta su historia. */
export const CAPITULOS_EJEMPLO: readonly { step: number; label: string; title: string; description: string }[] = [
  { step: 1, label: 'El origen', title: 'Dónde empezó todo', description: 'Cuenta aquí cómo nació tu negocio.' },
  { step: 2, label: 'El oficio', title: 'Cómo lo hacemos', description: 'Lo que hacen distinto, contado en dos o tres líneas.' },
  { step: 3, label: 'La casa', title: 'Una puerta abierta', description: 'Cómo es el lugar y a quién recibe.' },
];

export function numeroCapitulo(indice: number): string {
  return String(indice + 1).padStart(2, '0');
}

/** Sin capítulos con texto, los de ejemplo: lo mismo que muestra el editor con la lista vacía. */
function capitulosEjemplo(showNumbers: boolean): Capitulo[] {
  return CAPITULOS_EJEMPLO.map((x, i) => ({
    numero: showNumbers ? numeroCapitulo(i) : String(x.step),
    label: x.label,
    title: x.title,
    description: x.description,
    imageUrl: '',
    imageAlt: '',
    icon: '',
  }));
}

export function normalizarHistoriaCapitulos(content: Record<string, unknown> | null | undefined): HistoriaCapitulos {
  const c = content ?? {};
  const d = DEFAULT_HISTORIA_CAPITULOS;
  const showNumbers = booleano(c.show_numbers, d.showNumbers);
  const capitulos: Capitulo[] = [];
  for (const o of objetos(c.items)) {
    const title = textoOpcional(o.title, '', 120);
    const description = textoOpcional(o.description, '', 600);
    if (!title && !description) continue;
    const step = typeof o.step === 'number' || typeof o.step === 'string' ? String(o.step).trim().slice(0, 12) : '';
    capitulos.push({
      numero: showNumbers ? numeroCapitulo(capitulos.length) : step,
      label: textoOpcional(o.label, '', MAX_ETIQUETA),
      title,
      description,
      imageUrl: urlImagen(o.image_url),
      imageAlt: textoOpcional(o.image_alt, '', 200),
      icon: textoOpcional(o.icon, '', MAX_ETIQUETA),
    });
    if (capitulos.length >= MAX_CAPITULOS) break;
  }
  return {
    eyebrow: textoOpcional(c.eyebrow, d.eyebrow, MAX_ETIQUETA * 2),
    title: texto(c.title, d.title, 120),
    subtitle: textoOpcional(c.subtitle, d.subtitle),
    showNumbers,
    hoverMotion: booleano(c.hover_motion, d.hoverMotion),
    revealOnScroll: booleano(c.reveal_on_scroll, d.revealOnScroll),
    capitulos: capitulos.length > 0 ? capitulos : capitulosEjemplo(showNumbers),
    proporcionImagen: unoDe(c.aspect_ratio, PROPORCIONES_CAPITULO, d.proporcionImagen as (typeof PROPORCIONES_CAPITULO)[number]),
    textAlign: unoDe(c.text_align, ['left', 'center'] as const, d.textAlign),
  };
}

// ─── menu_full · «Línea de puntos» (lámina 14) ──────────────────────────────────────────────

/** Claves nuevas de contenido (las demás siguen en MenuFull.CONTENT_KEYS). */
export const CLAVES_CARTA_PUNTOS = [
  'show_options',
  'show_branch_selector',
  'branch_ids',
  'show_counter',
  'counter_label',
  'only_featured',
  'featured_limit',
  'view_all_text',
  'view_all_url',
] as const;
/** Claves nuevas de Diseño y Avanzado. */
export const CLAVES_DISENO_CARTA_PUNTOS = ['tabs_style', 'branch_selector_style', 'sticky_tabs', 'leader_style', 'show_compare_price'] as const;

export const ESTILOS_PESTANAS = ['italic', 'underline', 'pill'] as const;
export const ESTILOS_SELECTOR_SEDE = ['pill', 'list'] as const;
export const ESTILOS_LINEA_PRECIO = ['dots', 'line', 'none'] as const;

export interface CartaPuntos {
  /** Variantes y adicionales con su precio en la descripción («Bebida vegetal +$2.000»). */
  showOptions: boolean;
  /** Selector de sede para el visitante: cambia precios y platos sin recargar. */
  showBranchSelector: boolean;
  /** Sedes del selector. Vacío: las sedes con sitio (`branches.is_web_published`). */
  branchIds: number[];
  /** «CAFÉ · 12 PREPARACIONES»: cuenta de platos visibles de la pestaña. */
  showCounter: boolean;
  counterLabel: string;
  tabsStyle: (typeof ESTILOS_PESTANAS)[number];
  branchSelectorStyle: (typeof ESTILOS_SELECTOR_SEDE)[number];
  /** Fijar las pestañas al hacer scroll. */
  stickyTabs: boolean;
  /** Línea entre el nombre y el precio. */
  leaderStyle: (typeof ESTILOS_LINEA_PRECIO)[number];
  /** Tachar el precio anterior (`compare_price`) solo si se activa. */
  showComparePrice: boolean;
  /**
   * «Solo destacados» (la carta de Inicio, lámina 11/12): sin pestañas, contador ni selector de
   * sede; pinta los platos marcados como destacados en «Editar la carta» (`carta_platos.destacados`,
   * en su orden) hasta `featuredLimit`, en dos columnas, y el botón «Ver la carta completa». Sin
   * destacados marcados: los primeros `featuredLimit` platos de la carta (nunca una sección vacía).
   */
  onlyFeatured: boolean;
  featuredLimit: number;
  /** Botón al pie con `onlyFeatured`. Texto vacío: sin botón. */
  viewAllText: string;
  viewAllUrl: string;
  /** Claves que ya existían, con el default de esta variante. */
  showPhotos: boolean;
  showDescription: boolean;
  columns: 1 | 2;
}

export const DEFAULT_CARTA_PUNTOS: CartaPuntos = {
  showOptions: true,
  showBranchSelector: true,
  branchIds: [],
  showCounter: true,
  counterLabel: 'preparaciones',
  tabsStyle: 'italic',
  branchSelectorStyle: 'pill',
  stickyTabs: true,
  leaderStyle: 'dots',
  showComparePrice: false,
  onlyFeatured: false,
  featuredLimit: 6,
  viewAllText: 'Ver la carta completa',
  viewAllUrl: '/carta',
  showPhotos: false,
  showDescription: true,
  columns: 2,
};

export const MIN_DESTACADOS_CARTA = 2;
export const MAX_DESTACADOS_CARTA = 12;

/** ¿Se pinta la barra de la carta (pestañas, contador, selector de sede)? No con «solo destacados». */
export function cartaConBarra(carta: Pick<CartaPuntos, 'onlyFeatured'>): boolean {
  return !carta.onlyFeatured;
}

/** Tamaño del plato en esta variante (`size` ya existía; su default general es «auto»). */
export const TAMANO_CARTA_PUNTOS = 'regular' as const;

export function normalizarCartaPuntos(content: Record<string, unknown> | null | undefined): CartaPuntos {
  const c = content ?? {};
  const d = DEFAULT_CARTA_PUNTOS;
  return {
    showOptions: booleano(c.show_options, d.showOptions),
    showBranchSelector: booleano(c.show_branch_selector, d.showBranchSelector),
    branchIds: listaIds(c.branch_ids),
    showCounter: booleano(c.show_counter, d.showCounter),
    counterLabel: texto(c.counter_label, d.counterLabel, 30),
    tabsStyle: unoDe(c.tabs_style, ESTILOS_PESTANAS, d.tabsStyle),
    branchSelectorStyle: unoDe(c.branch_selector_style, ESTILOS_SELECTOR_SEDE, d.branchSelectorStyle),
    stickyTabs: booleano(c.sticky_tabs, d.stickyTabs),
    leaderStyle: unoDe(c.leader_style, ESTILOS_LINEA_PRECIO, d.leaderStyle),
    showComparePrice: booleano(c.show_compare_price, d.showComparePrice),
    onlyFeatured: booleano(c.only_featured, d.onlyFeatured),
    featuredLimit: enteroEntre(c.featured_limit, MIN_DESTACADOS_CARTA, MAX_DESTACADOS_CARTA, d.featuredLimit),
    viewAllText: textoOpcional(c.view_all_text, d.viewAllText, MAX_ETIQUETA),
    // Misma regla que los enlaces de imagen: https://, http:// o ruta propia del sitio.
    viewAllUrl: urlImagen(c.view_all_url) || d.viewAllUrl,
    showPhotos: booleano(c.show_photos, d.showPhotos),
    showDescription: booleano(c.show_description, d.showDescription),
    columns: c.columns === '1' || c.columns === 1 ? 1 : 2,
  };
}

/**
 * ¿Se pinta el selector de sede? Solo en el sitio principal (en la página de una sede la carta
 * muestra esa sede) y con más de una sede para elegir.
 */
export function selectorSedeVisible(carta: Pick<CartaPuntos, 'showBranchSelector'>, contexto: { esPaginaDeSede: boolean; sedes: number }): boolean {
  return carta.showBranchSelector && !contexto.esPaginaDeSede && contexto.sedes > 1;
}

/** «Café · 12 preparaciones». El sitio lo pinta en versalitas. */
export function textoContador(categoria: string, platos: number, etiqueta: string): string {
  return `${categoria.trim()} · ${platos} ${etiqueta.trim()}`.trim();
}

/** Clave de `localStorage` con la sede elegida en la carta: preselecciona la de Reservas (E7). */
export const CLAVE_SEDE_RECORDADA = 'goadmin:sede-elegida';

// ─── reservation · «Plano de mesas» (lámina 15) ─────────────────────────────────────────────

/** Claves nuevas de contenido. Sedes, reglas, política y mensajes ya existían. */
export const CLAVES_RESERVA_PLANO = ['booking_mode', 'also_register', 'zones', 'show_legend', 'show_capacity'] as const;
/** Claves nuevas de Diseño y Avanzado. */
export const CLAVES_DISENO_RESERVA_PLANO = ['plan_position', 'mobile_plan', 'ask_time_first', 'table_optional', 'dim_small_tables', 'plan_style'] as const;

/**
 * Cómo se confirma:
 * - `erp`: disponibilidad real por mesa y hora; la reserva entra a POS › Reservas de mesas con la
 *   mesa elegida y su estado sigue la configuración de la sede (confirmada o por confirmar);
 * - `whatsapp`: sin consulta de disponibilidad; arma el mensaje y abre el chat de la sede.
 */
export const MODOS_RESERVA = ['erp', 'whatsapp'] as const;
export type ModoReserva = (typeof MODOS_RESERVA)[number];
/** Texto del botón con `cta_text` vacío, por modo (lámina 15). */
export const TEXTO_BOTON_RESERVA: Record<ModoReserva, string> = { erp: 'Solicitar reserva', whatsapp: 'Reservar por WhatsApp' };
export const POSICIONES_PLANO = ['left', 'right', 'top'] as const;
/** En celular: hoja con la mesa elegida (`sheet`) o lista de mesas (`list`). */
export const PLANOS_CELULAR = ['sheet', 'list'] as const;
export const ESTILOS_PLANO = ['line', 'filled'] as const;

export interface ReservaPlano {
  /** Sin valor guardado: ver {@link resolverModoReserva} (E1). */
  bookingMode: ModoReserva;
  /** Solo en modo WhatsApp: deja además la solicitud «Por confirmar» en POS › Reservas de mesas. */
  alsoRegister: boolean;
  /** Zonas visibles. Vacío: las `allowed_zones` de la sede; sin ellas, todas con mesas reservables (E5). */
  zones: string[];
  showLegend: boolean;
  /** Número de personas bajo el nombre de cada mesa. */
  showCapacity: boolean;
  planPosition: (typeof POSICIONES_PLANO)[number];
  mobilePlan: (typeof PLANOS_CELULAR)[number];
  /** Modo ERP: primero fecha, hora y personas; luego el plano con la disponibilidad. */
  askTimeFirst: boolean;
  /** Elegir mesa es opcional: «Que la asigne el equipo» (E2). */
  tableOptional: boolean;
  /** Atenuar las mesas que no alcanzan para el grupo. */
  dimSmallTables: boolean;
  planStyle: (typeof ESTILOS_PLANO)[number];
}

export const DEFAULT_RESERVA_PLANO: ReservaPlano = {
  bookingMode: 'erp',
  alsoRegister: true,
  zones: [],
  showLegend: true,
  showCapacity: true,
  planPosition: 'left',
  mobilePlan: 'sheet',
  askTimeFirst: true,
  tableOptional: true,
  dimSmallTables: true,
  planStyle: 'line',
};

export const MAX_ZONAS = 20;

export function normalizarReservaPlano(content: Record<string, unknown> | null | undefined): ReservaPlano {
  const c = content ?? {};
  const d = DEFAULT_RESERVA_PLANO;
  return {
    bookingMode: unoDe(c.booking_mode, MODOS_RESERVA, d.bookingMode),
    alsoRegister: booleano(c.also_register, d.alsoRegister),
    zones: listaTextos(c.zones, MAX_ZONAS),
    showLegend: booleano(c.show_legend, d.showLegend),
    showCapacity: booleano(c.show_capacity, d.showCapacity),
    planPosition: unoDe(c.plan_position, POSICIONES_PLANO, d.planPosition),
    mobilePlan: unoDe(c.mobile_plan, PLANOS_CELULAR, d.mobilePlan),
    askTimeFirst: booleano(c.ask_time_first, d.askTimeFirst),
    tableOptional: booleano(c.table_optional, d.tableOptional),
    dimSmallTables: booleano(c.dim_small_tables, d.dimSmallTables),
    planStyle: unoDe(c.plan_style, ESTILOS_PLANO, d.planStyle),
  };
}

/**
 * Modo efectivo (E1): el que eligió el dueño; sin elegir, `erp` cuando la sede tiene las reservas
 * activas y `whatsapp` cuando no (así nunca se ofrece una reserva que el ERP rechazaría).
 */
export function resolverModoReserva(content: Record<string, unknown> | null | undefined, sede: { reservasActivas: boolean }): ModoReserva {
  const guardado = content?.booking_mode;
  if (typeof guardado === 'string' && (MODOS_RESERVA as readonly string[]).includes(guardado)) return guardado as ModoReserva;
  return sede.reservasActivas ? 'erp' : 'whatsapp';
}

/** Sin plano dibujado la sección cae a esta variante con el mismo contenido: nunca un plano vacío. */
export const VARIANTE_RESPALDO_SIN_PLANO = 'stepper' as const;

/** Mesa tal como la devuelve el plano público (`get_restaurant_floor_plan_public`). */
export interface MesaPlano {
  id: string;
  name: string;
  zone: string | null;
  capacity: number | null;
  position_x: number | null;
  position_y: number | null;
}

/** ¿La sede tiene plano? Al menos una mesa con posición. */
export function tienePlano(mesas: readonly Pick<MesaPlano, 'position_x' | 'position_y'>[]): boolean {
  return mesas.some((m) => typeof m.position_x === 'number' && typeof m.position_y === 'number');
}

/** Mesas sugeridas cuando la elegida se ocupa entre elegir y confirmar (E4). */
export const MESAS_SUGERIDAS = 3;

/**
 * Las mesas libres más parecidas a la elegida: primero la misma zona, luego la capacidad más
 * cercana (sin quedarse corta para el grupo), y el nombre como desempate estable.
 */
export function mesasMasParecidas<T extends Pick<MesaPlano, 'id' | 'name' | 'zone' | 'capacity'>>(
  elegida: Pick<MesaPlano, 'id' | 'zone' | 'capacity'>,
  libres: readonly T[],
  personas: number,
  n = MESAS_SUGERIDAS,
): T[] {
  const capacidad = elegida.capacity ?? personas;
  return libres
    .filter((m) => m.id !== elegida.id && (m.capacity ?? 0) >= personas)
    .map((m) => ({ m, zona: m.zone === elegida.zone ? 0 : 1, dif: Math.abs((m.capacity ?? 0) - capacidad) }))
    .sort((a, b) => a.zona - b.zona || a.dif - b.dif || a.m.name.localeCompare(b.m.name, 'es', { numeric: true }))
    .slice(0, n)
    .map((x) => x.m);
}

/** Datos ya formateados (fecha y hora en la zona horaria de la organización) del mensaje armado. */
export interface DatosMensajeWhatsapp {
  sede: string;
  fecha: string;
  hora: string;
  personas: number;
  nombre: string;
  telefono?: string | null;
  mesa?: string | null;
  zona?: string | null;
  notas?: string | null;
}

/**
 * Mensaje del modo WhatsApp (lámina 05 · A): «Hola, quiero reservar la Mesa 9 (Salón) en Sede
 * Laureles el sábado 17 de octubre a las 10:30 a. m. para 4 personas. A nombre de Laura Gómez ·
 * +57 300 000 0000. Notas: …». Sin mesa: «quiero reservar una mesa».
 */
export function mensajeReservaWhatsapp(d: DatosMensajeWhatsapp): string {
  const mesa = d.mesa?.trim() ? `la ${d.mesa.trim()}${d.zona?.trim() ? ` (${d.zona.trim()})` : ''}` : 'una mesa';
  const personas = d.personas === 1 ? '1 persona' : `${d.personas} personas`;
  const nombre = [d.nombre.trim(), d.telefono?.trim()].filter(Boolean).join(' · ');
  const partes = [`Hola, quiero reservar ${mesa} en ${d.sede.trim()} el ${d.fecha.trim()} a las ${d.hora.trim()} para ${personas}.`, `A nombre de ${nombre}.`];
  if (d.notas?.trim()) partes.push(`Notas: ${d.notas.trim().slice(0, 300)}`);
  return partes.join(' ');
}

/**
 * Solicitud por WhatsApp registrada también en el ERP (E3, sin migración): `source='website'`,
 * estado «Por confirmar» y esta nota; la mesa va como preferencia, sin reservarla.
 */
export const NOTA_SOLICITUD_WHATSAPP = 'Solicitud por WhatsApp';

/** Prefijo del error de la RPC cuando la mesa elegida ya no está disponible (→ 409 en el sitio). */
export const PREFIJO_ERROR_MESA = 'MESA:';

// ─── Claves por variante (manifiesto del sitio ↔ catálogo del editor) ──────────────────────

/** Claves nuevas de CONTENIDO por tipo (van al manifiesto del sitio). */
export const CLAVES_SECCION_CAFE: Record<TipoSeccionCafe, readonly string[]> = {
  hero: CLAVES_PORTADA_EDITORIAL,
  how_it_works: CLAVES_HISTORIA_CAPITULOS,
  menu_full: CLAVES_CARTA_PUNTOS,
  reservation: CLAVES_RESERVA_PLANO,
};

/** Claves nuevas de Diseño y Avanzado por tipo. */
export const CLAVES_DISENO_SECCION_CAFE: Record<TipoSeccionCafe, readonly string[]> = {
  hero: CLAVES_DISENO_PORTADA_EDITORIAL,
  how_it_works: CLAVES_DISENO_HISTORIA_CAPITULOS,
  menu_full: CLAVES_DISENO_CARTA_PUNTOS,
  reservation: CLAVES_DISENO_RESERVA_PLANO,
};
