/**
 * Contrato de las secciones y variantes de las 7 plantillas de tienda nuevas (Panorama, Atelier,
 * Radiante, Roble, Marea, Contraste y Hogar; PLANO §2 y §3, 2026-11).
 *
 * Qué define:
 * - Las variantes nuevas de tipos que ya existen (`hero · search`, `image_text · color_block`…) y
 *   los tipos nuevos (`shop_the_look`, `link_cloud`, `product_pager`…), con su nombre visible.
 * - Las claves de contenido de cada una (`CLAVES_SECCION_TIENDA`: van al manifiesto del sitio).
 * - Las claves NUEVAS que ganan secciones existentes (`CLAVES_AJUSTE_TIENDA`: título resaltado,
 *   cupón del banner, opciones de categoría, ficha…).
 * - Defaults, límites y un `normalizar*` por pieza.
 *
 * Reglas (las mismas de `seccionesCafe.ts` y `seccionesMesa.ts`):
 * - Ausente, nulo o fuera de la regla = default. En las claves de AJUSTE el default es el
 *   comportamiento de hoy: una sección existente sin claves nuevas se pinta igual que antes.
 * - Ningún dato inventado: sin reseñas, sin cupón, sin ítems o sin productos, la pieza no se
 *   pinta (`*Visible`). Los textos por defecto son rótulos, nunca hechos («Se lleva con», no
 *   «4,9 de 1.200 reseñas»).
 * - Lo que es operación (productos, categorías, reseñas, redes) sale de la base, no de aquí:
 *   este archivo solo guarda ids, textos del dueño y opciones de presentación.
 * - Nada aquí toca carrito, precios ni checkout. «Agregar todo» y la ventana de bienvenida usan
 *   el carrito y el campo de cupón de siempre.
 *
 * Lo leen los dos lados:
 * - el editor del ERP (catálogo `seccionesTiendaCatalogo.ts`, inspector y «Plantilla completa»), y
 * - el sitio público (goadmin-websites), que lo copia tal cual en
 *   `lib/website/v2/contrato/seccionesTienda.ts` (`npm run verify:copias`).
 *
 * Código puro: sin imports, sin React ni Supabase.
 */

// ─── Variantes y tipos ──────────────────────────────────────────────────────────────────────

/** Tipo de sección → variantes nuevas de las plantillas de tienda. */
export const VARIANTES_TIENDA = {
  hero: ['search', 'brand_giant', 'floating', 'split_products'],
  transformation: ['slider'],
  image_text: ['color_block', 'editorial'],
  gallery: ['collage', 'instagram_cta'],
  text_block: ['inline_icons'],
  features_grid: ['photo_columns'],
  products_grid: ['editorial'],
  category_filters: ['sidebar_facets'],
  product_specs: ['icon_grid', 'panel'],
  shop_the_look: ['hotspots'],
  complete_the_look: ['default'],
  product_index: ['list'],
  product_anatomy: ['default'],
  welcome_popup: ['coupon'],
  link_cloud: ['pills'],
  service_cards: ['over_image'],
  product_anchor_nav: ['tabs'],
  product_pager: ['default'],
} as const;
export type TipoSeccionTienda = keyof typeof VARIANTES_TIENDA;

/** Tipos que no existían antes de las plantillas de tienda (el resto son variantes nuevas). */
export const TIPOS_NUEVOS_TIENDA = [
  'shop_the_look',
  'complete_the_look',
  'product_index',
  'product_anatomy',
  'welcome_popup',
  'link_cloud',
  'service_cards',
  'product_anchor_nav',
  'product_pager',
] as const;

/** Nombre visible de cada variante, por `tipo.variante` (selector de variante del inspector). */
export const ETIQUETAS_VARIANTE_TIENDA: Readonly<Record<string, string>> = {
  'hero.search': 'Buscador',
  'hero.brand_giant': 'Marca gigante',
  'hero.floating': 'Tarjetas flotantes',
  'hero.split_products': 'Dividida con productos',
  'transformation.slider': 'Antes y después',
  'image_text.color_block': 'Bloque de color',
  'image_text.editorial': 'Editorial',
  'gallery.collage': 'Collage',
  'gallery.instagram_cta': 'Instagram',
  'text_block.inline_icons': 'Texto con íconos',
  'features_grid.photo_columns': 'Columnas con foto',
  'products_grid.editorial': 'Rejilla editorial',
  'category_filters.sidebar_facets': 'Filtros laterales',
  'product_specs.icon_grid': 'Íconos',
  'product_specs.panel': 'Panel',
  'shop_the_look.hotspots': 'Compra el look',
  'complete_the_look.default': 'Completa el look',
  'product_index.list': 'Índice de productos',
  'product_anatomy.default': 'Anatomía del producto',
  'welcome_popup.coupon': 'Ventana de bienvenida',
  'link_cloud.pills': 'Nube de enlaces',
  'service_cards.over_image': 'Tarjetas sobre imagen',
  'product_anchor_nav.tabs': 'Pestañas ancla',
  'product_pager.default': 'Anterior y siguiente',
};

export function esVarianteTienda(tipo: string, variante: unknown): boolean {
  const lista = (VARIANTES_TIENDA as Record<string, readonly string[]>)[tipo];
  return !!lista && typeof variante === 'string' && lista.includes(variante);
}

export function esTipoNuevoTienda(tipo: string): boolean {
  return (TIPOS_NUEVOS_TIENDA as readonly string[]).includes(tipo);
}

// ─── Lectores de campos ─────────────────────────────────────────────────────────────────────

const MAX_TEXTO = 300;
const MAX_ETIQUETA = 60;
const MAX_URL = 2048;

/** Texto que el editor puede dejar vacío a propósito (`''` = no se muestra). */
function textoOpcional(valor: unknown, porDefecto: string, max = MAX_TEXTO): string {
  if (typeof valor !== 'string') return porDefecto;
  return valor.trim().slice(0, max);
}

/** Texto con rótulo por defecto: vacío vuelve al default. */
function texto(valor: unknown, porDefecto: string, max = MAX_TEXTO): string {
  if (typeof valor !== 'string') return porDefecto;
  const t = valor.trim();
  return t === '' ? porDefecto : t.slice(0, max);
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

/** Porcentaje 0–100 (admite decimales; se redondea a 1 decimal). `null` si no es válido. */
function porcentaje(valor: unknown): number | null {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 10) / 10;
}

function unoDe<T extends string>(valor: unknown, lista: readonly T[], porDefecto: T): T {
  return typeof valor === 'string' && (lista as readonly string[]).includes(valor) ? (valor as T) : porDefecto;
}

/** Enlace de imagen o video: `https://`, `http://` o ruta propia. Cualquier otra cosa = vacío. */
function urlRecurso(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const t = valor.trim();
  return /^(https?:\/\/|\/(?!\/))[^\s]*$/i.test(t) ? t.slice(0, MAX_URL) : '';
}

/** Enlace de destino: ruta propia, `https://`, `tel:`, `mailto:` o un ancla `#id`. Otro = vacío. */
function urlDestino(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const t = valor.trim();
  if (/^\/(?!\/)[^\s]*$/.test(t) || /^#[\w-]+$/.test(t)) return t.slice(0, MAX_URL);
  if (/^(https:\/\/[^\s]+|tel:\+?[\d\s()-]{5,}|mailto:[^\s@]+@[^\s@]+)$/i.test(t)) return t.slice(0, MAX_URL);
  return '';
}

/** Color fijo «#RGB» o «#RRGGBB». Otro = `''` (el del tema). */
function colorHex(valor: unknown): string {
  return typeof valor === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(valor.trim()) ? valor.trim() : '';
}

/** Id entero positivo o `null`. */
function idProducto(valor: unknown): number | null {
  const n = typeof valor === 'string' && valor.trim() !== '' ? Number(valor) : valor;
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

/** Ids enteros positivos sin repetir, hasta `max`. */
function listaIds(valor: unknown, max: number): number[] {
  if (!Array.isArray(valor)) return [];
  const salida: number[] = [];
  for (const v of valor) {
    const n = idProducto(v);
    if (n !== null && !salida.includes(n)) salida.push(n);
    if (salida.length >= max) break;
  }
  return salida;
}

/** Textos cortos sin repetir (sin distinguir mayúsculas), hasta `max`. */
function listaTextos(valor: unknown, max: number, largo = MAX_ETIQUETA): string[] {
  if (!Array.isArray(valor)) return [];
  const salida: string[] = [];
  for (const v of valor) {
    const t = typeof v === 'string' ? v.trim().slice(0, largo) : '';
    if (t && !salida.some((s) => s.toLowerCase() === t.toLowerCase())) salida.push(t);
    if (salida.length >= max) break;
  }
  return salida;
}

/** Imágenes válidas, en orden, hasta `max`. Acepta textos o `{ image_url }`. */
function listaImagenes(valor: unknown, max: number): string[] {
  if (!Array.isArray(valor)) return [];
  const salida: string[] = [];
  for (const v of valor) {
    const url = urlRecurso(v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>).image_url : v);
    if (url) salida.push(url);
    if (salida.length >= max) break;
  }
  return salida;
}

function objetos(valor: unknown): Record<string, unknown>[] {
  return Array.isArray(valor) ? valor.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)) : [];
}

export interface EnlaceTienda {
  label: string;
  url: string;
}

/** Enlaces con texto y destino válidos, hasta `max`. Sin texto o sin destino no entran. */
function enlaces(valor: unknown, max: number): EnlaceTienda[] {
  const salida: EnlaceTienda[] = [];
  for (const o of objetos(valor)) {
    const label = textoOpcional(o.label, '', MAX_ETIQUETA);
    const url = urlDestino(o.url);
    if (!label || !url) continue;
    salida.push({ label, url });
    if (salida.length >= max) break;
  }
  return salida;
}

// ─── Botones: variante «enlace subrayado» (PLANO §2 ítem 10) ────────────────────────────────

/**
 * `variant: 'link'` en los botones de hero y cta (`buttons[]`): texto con subrayado, sin fondo ni
 * borde. El valor ya existía en el editor (`BUTTON_ITEM_FIELDS`) y `HeroButtons` lo pinta solo con
 * el color; ningún sitio lo usaba (SQL del 2026-11-07: 0 publicados V2 y 0 secciones legacy), así
 * que el subrayado no cambia ninguna tienda. Cualquier otro valor = el botón de hoy.
 */
export const VARIANTE_BOTON_ENLACE = 'link' as const;

export function esBotonEnlace(boton: unknown): boolean {
  return !!boton && typeof boton === 'object' && (boton as Record<string, unknown>).variant === VARIANTE_BOTON_ENLACE;
}

export interface BotonTienda {
  label: string;
  url: string;
  /** `solid` (default), `outline`, `ghost`, `gradient` o `link`. */
  variant: string;
}

export const MAX_BOTONES_TIENDA = 3;
const VARIANTES_BOTON = ['solid', 'outline', 'ghost', 'gradient', VARIANTE_BOTON_ENLACE] as const;

function botones(valor: unknown): BotonTienda[] {
  const salida: BotonTienda[] = [];
  for (const o of objetos(valor)) {
    const label = textoOpcional(o.label, '', MAX_ETIQUETA);
    const url = urlDestino(o.url);
    if (!label || !url) continue;
    salida.push({ label, url, variant: unoDe(o.variant, VARIANTES_BOTON, 'solid') });
    if (salida.length >= MAX_BOTONES_TIENDA) break;
  }
  return salida;
}

// ─── Título resaltado (hero; PLANO §2 ítem 21) ──────────────────────────────────────────────

export const ESTILOS_RESALTADO = ['pill', 'underline'] as const;
export type EstiloResaltado = (typeof ESTILOS_RESALTADO)[number];
export const MAX_RESALTADO = 40;

export interface TituloResaltado {
  /** Palabra o frase del título que se resalta. `''` = el título de hoy. */
  highlight: string;
  style: EstiloResaltado;
}

/** `title_highlight` + `title_highlight_style`. Sin palabra, el título se pinta como hoy. */
export function normalizarTituloResaltado(content: Record<string, unknown> | null | undefined): TituloResaltado {
  const c = content ?? {};
  return {
    highlight: textoOpcional(c.title_highlight, '', MAX_RESALTADO),
    style: unoDe(c.title_highlight_style, ESTILOS_RESALTADO, 'pill'),
  };
}

/**
 * Parte el título alrededor de la primera aparición de la palabra (sin distinguir mayúsculas).
 * `null` si no hay palabra o no está en el título: se pinta el título entero, como hoy.
 */
export function partirTituloResaltado(titulo: string, palabra: string): { antes: string; resaltado: string; despues: string } | null {
  const p = palabra.trim();
  if (!p || !titulo) return null;
  const i = titulo.toLowerCase().indexOf(p.toLowerCase());
  if (i < 0) return null;
  return { antes: titulo.slice(0, i), resaltado: titulo.slice(i, i + p.length), despues: titulo.slice(i + p.length) };
}

// ─── hero · search («Buscador», Panorama) ───────────────────────────────────────────────────

export const CHIPS_CALIFICACION = ['auto', 'none'] as const;

export interface PortadaBuscador {
  title: string;
  subtitle: string;
  imageUrl: string;
  /** Tarjeta con margen y el radio del tema (no a todo el ancho). */
  inset: boolean;
  searchPlaceholder: string;
  /** Selector de categoría (categorías reales del contexto). */
  showCategorySelect: boolean;
  /** `auto` = promedio y conteo de `product_reviews` aprobadas (oculto con 0); `none` = sin chip. */
  ratingChip: (typeof CHIPS_CALIFICACION)[number];
}

export const DEFAULT_PORTADA_BUSCADOR: PortadaBuscador = {
  title: '',
  subtitle: '',
  imageUrl: '',
  inset: true,
  searchPlaceholder: '¿Qué buscas?',
  showCategorySelect: true,
  ratingChip: 'auto',
};

export function normalizarPortadaBuscador(content: Record<string, unknown> | null | undefined): PortadaBuscador {
  const c = content ?? {};
  const d = DEFAULT_PORTADA_BUSCADOR;
  return {
    title: textoOpcional(c.title, d.title, 120),
    subtitle: textoOpcional(c.subtitle, d.subtitle),
    imageUrl: urlRecurso(c.image_url),
    inset: booleano(c.inset, d.inset),
    searchPlaceholder: texto(c.search_placeholder, d.searchPlaceholder, MAX_ETIQUETA),
    showCategorySelect: booleano(c.show_category_select, d.showCategorySelect),
    ratingChip: unoDe(c.rating_chip, CHIPS_CALIFICACION, d.ratingChip),
  };
}

/**
 * Destino del buscador de la portada: con texto, `/search?q=…` (alcance global); sin texto y con
 * categoría, `/categorias/<slug>`; sin nada, `null` (no navega).
 */
export function destinoBuscador(consulta: string, categoriaSlug: string | null | undefined): string | null {
  const q = consulta.trim();
  if (q) return `/search?q=${encodeURIComponent(q)}`;
  const slug = (categoriaSlug ?? '').trim();
  return slug ? `/categorias/${encodeURIComponent(slug)}` : null;
}

// ─── hero · brand_giant («Marca gigante», Marea y Contraste) ────────────────────────────────

export const CAPAS_MARCA = ['behind_figure', 'over_photo'] as const;
export const MAX_PUNTOS_MARCA = 4;

/** Punto sobre la foto que abre un producto real. `x`/`y` en % de la imagen. */
export interface PuntoProducto {
  x: number;
  y: number;
  label: string;
  productId: number;
}

function puntos(valor: unknown, max: number): PuntoProducto[] {
  const salida: PuntoProducto[] = [];
  for (const o of objetos(valor)) {
    const x = porcentaje(o.x);
    const y = porcentaje(o.y);
    const productId = idProducto(o.product_id);
    if (x === null || y === null || productId === null) continue;
    salida.push({ x, y, label: textoOpcional(o.label, '', MAX_ETIQUETA), productId });
    if (salida.length >= max) break;
  }
  return salida;
}

export interface PortadaMarca {
  /** `''` = el nombre de la organización (lo pone el sitio; nunca un nombre fijo aquí). */
  brandText: string;
  /** `behind_figure` = la marca detrás de la figura recortada; `over_photo` = encima de la foto. */
  brandLayer: (typeof CAPAS_MARCA)[number];
  imageUrl: string;
  /** PNG recortado que va delante de la marca (`behind_figure`). */
  figureUrl: string;
  chip: string;
  title: string;
  ctaText: string;
  ctaUrl: string;
  hotspots: PuntoProducto[];
}

export const DEFAULT_PORTADA_MARCA: PortadaMarca = {
  brandText: '',
  brandLayer: 'behind_figure',
  imageUrl: '',
  figureUrl: '',
  chip: '',
  title: '',
  ctaText: '',
  ctaUrl: '',
  hotspots: [],
};

export function normalizarPortadaMarca(content: Record<string, unknown> | null | undefined): PortadaMarca {
  const c = content ?? {};
  const d = DEFAULT_PORTADA_MARCA;
  return {
    brandText: textoOpcional(c.brand_text, d.brandText, MAX_ETIQUETA),
    brandLayer: unoDe(c.brand_layer, CAPAS_MARCA, d.brandLayer),
    imageUrl: urlRecurso(c.image_url),
    figureUrl: urlRecurso(c.figure_url),
    chip: textoOpcional(c.chip, d.chip, MAX_ETIQUETA),
    title: textoOpcional(c.title, d.title, 120),
    ctaText: textoOpcional(c.cta_text, d.ctaText, MAX_ETIQUETA),
    ctaUrl: urlDestino(c.cta_url),
    hotspots: puntos(c.hotspots, MAX_PUNTOS_MARCA),
  };
}

// ─── hero · floating («Tarjetas flotantes», Radiante) ───────────────────────────────────────

export const TIPOS_TARJETA_FLOTANTE = ['categories', 'rating', 'video'] as const;
export const MAX_TARJETAS_FLOTANTES = 3;

export interface TarjetaFlotante {
  /** `categories` = chips de categorías reales; `rating` = reseñas reales (oculta con 0); `video`. */
  kind: (typeof TIPOS_TARJETA_FLOTANTE)[number];
  /** Solo `video`; sin enlace válido la tarjeta de video no entra. */
  videoUrl: string;
}

export interface PortadaFlotante {
  title: string;
  titleHighlight: TituloResaltado;
  buttons: BotonTienda[];
  imageUrl: string;
  floatingCards: TarjetaFlotante[];
}

export const DEFAULT_PORTADA_FLOTANTE: PortadaFlotante = {
  title: '',
  titleHighlight: { highlight: '', style: 'pill' },
  buttons: [],
  imageUrl: '',
  floatingCards: [],
};

export function normalizarPortadaFlotante(content: Record<string, unknown> | null | undefined): PortadaFlotante {
  const c = content ?? {};
  const tarjetas: TarjetaFlotante[] = [];
  for (const o of objetos(c.floating_cards)) {
    const kind = unoDe(o.kind, TIPOS_TARJETA_FLOTANTE, 'categories');
    if (o.kind !== kind) continue;
    const videoUrl = kind === 'video' ? urlRecurso(o.video_url) : '';
    if (kind === 'video' && !videoUrl) continue;
    if (tarjetas.some((t) => t.kind === kind)) continue;
    tarjetas.push({ kind, videoUrl });
    if (tarjetas.length >= MAX_TARJETAS_FLOTANTES) break;
  }
  return {
    title: textoOpcional(c.title, '', 120),
    titleHighlight: normalizarTituloResaltado(c),
    buttons: botones(c.buttons),
    imageUrl: urlRecurso(c.image_url),
    floatingCards: tarjetas,
  };
}

// ─── hero · split_products («Dividida con productos», Hogar) ────────────────────────────────

export const MAX_PRODUCTOS_PORTADA = 3;

/**
 * Solo la clave nueva; el resto es lo de la variante `split`. Vacío = los 3 primeros productos
 * con foto (los elige el sitio).
 */
export function normalizarProductosPortada(content: Record<string, unknown> | null | undefined): { productIds: number[] } {
  return { productIds: listaIds((content ?? {}).product_ids, MAX_PRODUCTOS_PORTADA) };
}

// ─── transformation · slider («Antes y después», Radiante) ──────────────────────────────────

export const COLORES_MANIJA = ['acento', 'primario', 'blanco'] as const;
export const MAX_ANTES_DESPUES = 6;

export interface ParAntesDespues {
  name: string;
  beforeUrl: string;
  afterUrl: string;
}

export interface AntesDespues {
  title: string;
  subtitle: string;
  /** Solo pares con las dos fotos. Vacío = la sección no se pinta. */
  items: ParAntesDespues[];
  /** Posición inicial del divisor, en %. */
  startPosition: number;
  handleColor: (typeof COLORES_MANIJA)[number];
}

export const DEFAULT_ANTES_DESPUES: AntesDespues = { title: '', subtitle: '', items: [], startPosition: 50, handleColor: 'acento' };

export function normalizarAntesDespues(content: Record<string, unknown> | null | undefined): AntesDespues {
  const c = content ?? {};
  const d = DEFAULT_ANTES_DESPUES;
  const items: ParAntesDespues[] = [];
  for (const o of objetos(c.items)) {
    const beforeUrl = urlRecurso(o.before_url);
    const afterUrl = urlRecurso(o.after_url);
    if (!beforeUrl || !afterUrl) continue;
    items.push({ name: textoOpcional(o.name, '', MAX_ETIQUETA), beforeUrl, afterUrl });
    if (items.length >= MAX_ANTES_DESPUES) break;
  }
  return {
    title: textoOpcional(c.title, d.title, 120),
    subtitle: textoOpcional(c.subtitle, d.subtitle),
    items,
    startPosition: enteroEntre(c.start_position, 0, 100, d.startPosition),
    handleColor: unoDe(c.handle_color, COLORES_MANIJA, d.handleColor),
  };
}

// ─── shop_the_look · hotspots («Compra el look», Hogar) ─────────────────────────────────────

export const MAX_PUNTOS_LOOK = 6;

export interface CompraElLook {
  title: string;
  imageUrl: string;
  /** Puntos con producto real. Sin foto o sin puntos, la sección no se pinta. */
  hotspots: PuntoProducto[];
  /** Tarjetas de los productos junto a la foto (ProductCard de siempre). */
  showCards: boolean;
}

export const DEFAULT_COMPRA_EL_LOOK: CompraElLook = { title: '', imageUrl: '', hotspots: [], showCards: true };

export function normalizarCompraElLook(content: Record<string, unknown> | null | undefined): CompraElLook {
  const c = content ?? {};
  return {
    title: textoOpcional(c.title, '', 120),
    imageUrl: urlRecurso(c.image_url),
    hotspots: puntos(c.hotspots, MAX_PUNTOS_LOOK),
    showCards: booleano(c.show_cards, DEFAULT_COMPRA_EL_LOOK.showCards),
  };
}

export function compraElLookVisible(l: CompraElLook): boolean {
  return l.imageUrl !== '' && l.hotspots.length > 0;
}

// ─── complete_the_look · default («Completa el look», en la ficha; Atelier y Marea) ─────────

export const FUENTES_LOOK = ['tag', 'manual'] as const;
export const MAX_PRODUCTOS_LOOK = 8;

export interface CompletaElLook {
  title: string;
  /** `tag` = productos que comparten etiqueta con el actual; `manual` = `productIds`. */
  source: (typeof FUENTES_LOOK)[number];
  productIds: number[];
  limit: number;
  /** Vacía = la segunda foto del producto. */
  imageUrl: string;
  /** «Agregar todo»: solo productos simples; los padres enlazan a su ficha. */
  showAddAll: boolean;
}

export const DEFAULT_COMPLETA_EL_LOOK: CompletaElLook = {
  title: 'Se lleva con',
  source: 'tag',
  productIds: [],
  limit: 4,
  imageUrl: '',
  showAddAll: false,
};

export function normalizarCompletaElLook(content: Record<string, unknown> | null | undefined): CompletaElLook {
  const c = content ?? {};
  const d = DEFAULT_COMPLETA_EL_LOOK;
  return {
    title: texto(c.title, d.title, 120),
    source: unoDe(c.source, FUENTES_LOOK, d.source),
    productIds: listaIds(c.product_ids, MAX_PRODUCTOS_LOOK),
    limit: enteroEntre(c.limit, 1, MAX_PRODUCTOS_LOOK, d.limit),
    imageUrl: urlRecurso(c.image_url),
    showAddAll: booleano(c.show_add_all, d.showAddAll),
  };
}

// ─── product_index · list («Índice de productos», Roble) ────────────────────────────────────

export const MAX_PRODUCTOS_INDICE = 12;
/** Cuántos productos pinta el índice sin `product_ids` (los primeros con foto). */
export const PRODUCTOS_INDICE_POR_DEFECTO = 6;

export interface IndiceProductos {
  title: string;
  productIds: number[];
  showPrice: boolean;
  ctaText: string;
  ctaUrl: string;
}

export const DEFAULT_INDICE_PRODUCTOS: IndiceProductos = {
  title: '',
  productIds: [],
  showPrice: true,
  ctaText: 'Ver todas las piezas',
  ctaUrl: '/productos',
};

export function normalizarIndiceProductos(content: Record<string, unknown> | null | undefined): IndiceProductos {
  const c = content ?? {};
  const d = DEFAULT_INDICE_PRODUCTOS;
  return {
    title: textoOpcional(c.title, d.title, 120),
    productIds: listaIds(c.product_ids, MAX_PRODUCTOS_INDICE),
    showPrice: booleano(c.show_price, d.showPrice),
    ctaText: textoOpcional(c.cta_text, d.ctaText, MAX_ETIQUETA),
    ctaUrl: urlDestino(c.cta_url) || d.ctaUrl,
  };
}

// ─── product_anatomy · default («Anatomía del producto», Roble) ─────────────────────────────

export const MAX_DETALLES_ANATOMIA = 3;

export interface AnatomiaProducto {
  productId: number | null;
  title: string;
  details: { title: string; text: string }[];
}

export const DEFAULT_ANATOMIA_PRODUCTO: AnatomiaProducto = { productId: null, title: '', details: [] };

export function normalizarAnatomiaProducto(content: Record<string, unknown> | null | undefined): AnatomiaProducto {
  const c = content ?? {};
  const details: { title: string; text: string }[] = [];
  for (const o of objetos(c.details)) {
    const title = textoOpcional(o.title, '', MAX_ETIQUETA);
    const text = textoOpcional(o.text, '');
    if (!title && !text) continue;
    details.push({ title, text });
    if (details.length >= MAX_DETALLES_ANATOMIA) break;
  }
  return { productId: idProducto(c.product_id), title: textoOpcional(c.title, '', 120), details };
}

/** Sin producto o sin detalles, la sección no se pinta. */
export function anatomiaVisible(a: AnatomiaProducto): boolean {
  return a.productId !== null && a.details.length > 0;
}

// ─── welcome_popup · coupon («Ventana de bienvenida», Hogar) ────────────────────────────────

export const FRECUENCIAS_BIENVENIDA = ['once', 'session'] as const;
export const MAX_CODIGO_CUPON = 40;

/** Código de cupón escrito por el dueño: letras, números, `-` y `_`, en mayúsculas. Otro = `''`. */
export function normalizarCodigoCupon(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const t = valor.trim().toUpperCase();
  return /^[A-Z0-9_-]{1,40}$/.test(t) ? t : '';
}

export interface VentanaBienvenida {
  /** Apagada por defecto: la plantilla la deja lista, el dueño la prende con su cupón real. */
  enabled: boolean;
  couponCode: string;
  title: string;
  text: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl: string;
  /** Segundos antes de abrirse. */
  delayS: number;
  /** `once` = una vez por navegador; `session` = una vez por sesión. */
  frequency: (typeof FRECUENCIAS_BIENVENIDA)[number];
}

export const DEFAULT_VENTANA_BIENVENIDA: VentanaBienvenida = {
  enabled: false,
  couponCode: '',
  title: '',
  text: '',
  ctaText: '',
  ctaUrl: '',
  imageUrl: '',
  delayS: 4,
  frequency: 'once',
};

export function normalizarVentanaBienvenida(content: Record<string, unknown> | null | undefined): VentanaBienvenida {
  const c = content ?? {};
  const d = DEFAULT_VENTANA_BIENVENIDA;
  return {
    enabled: booleano(c.enabled, d.enabled),
    couponCode: normalizarCodigoCupon(c.coupon_code),
    title: textoOpcional(c.title, d.title, 120),
    text: textoOpcional(c.text, d.text),
    ctaText: textoOpcional(c.cta_text, d.ctaText, MAX_ETIQUETA),
    ctaUrl: urlDestino(c.cta_url),
    imageUrl: urlRecurso(c.image_url),
    delayS: enteroEntre(c.delay_s, 0, 60, d.delayS),
    frequency: unoDe(c.frequency, FRECUENCIAS_BIENVENIDA, d.frequency),
  };
}

/** Solo se abre prendida y con un código real. No pinta nada en el flujo de la página. */
export function ventanaBienvenidaVisible(v: VentanaBienvenida): boolean {
  return v.enabled && v.couponCode !== '';
}

/** Clave de `localStorage` que recuerda que el visitante ya la vio. */
export function claveAlmacenBienvenida(organizationId: number | string): string {
  return `goadmin:bienvenida:${organizationId}`;
}

// ─── image_text · color_block («Bloque de color», Marea) ────────────────────────────────────

/** Cuántos bloques arma «Plantilla completa» (uno por categoría real con color o foto). */
export const MAX_BLOQUES_COLOR = 5;

export interface BloqueColor {
  /** «01». `''` = sin número. */
  number: string;
  title: string;
  phrase: string;
  imageUrl: string;
  /** `''` = el color del tema. */
  bgColor: string;
  textColor: string;
  ctaUrl: string;
}

export const DEFAULT_BLOQUE_COLOR: BloqueColor = { number: '', title: '', phrase: '', imageUrl: '', bgColor: '', textColor: '', ctaUrl: '' };

export function normalizarBloqueColor(content: Record<string, unknown> | null | undefined): BloqueColor {
  const c = content ?? {};
  return {
    number: textoOpcional(c.number, '', 8),
    title: textoOpcional(c.title, '', 120),
    phrase: textoOpcional(c.phrase, ''),
    imageUrl: urlRecurso(c.image_url),
    bgColor: colorHex(c.bg_color),
    textColor: colorHex(c.text_color),
    ctaUrl: urlDestino(c.cta_url),
  };
}

// ─── image_text · editorial («Editorial», Contraste) ────────────────────────────────────────

export interface ImagenTextoEditorial {
  title: string;
  linkText: string;
  linkUrl: string;
  body: string;
  imageSmallUrl: string;
  imageSmallCaption: string;
  imageUrl: string;
  imageTag: string;
}

export const DEFAULT_IMAGEN_TEXTO_EDITORIAL: ImagenTextoEditorial = {
  title: '',
  linkText: '',
  linkUrl: '',
  body: '',
  imageSmallUrl: '',
  imageSmallCaption: '',
  imageUrl: '',
  imageTag: '',
};

export function normalizarImagenTextoEditorial(content: Record<string, unknown> | null | undefined): ImagenTextoEditorial {
  const c = content ?? {};
  return {
    title: textoOpcional(c.title, '', 120),
    linkText: textoOpcional(c.link_text, '', MAX_ETIQUETA),
    linkUrl: urlDestino(c.link_url),
    body: textoOpcional(c.body, '', 1200),
    imageSmallUrl: urlRecurso(c.image_small_url),
    imageSmallCaption: textoOpcional(c.image_small_caption, '', MAX_ETIQUETA * 2),
    imageUrl: urlRecurso(c.image_url),
    imageTag: textoOpcional(c.image_tag, '', MAX_ETIQUETA),
  };
}

// ─── image_text · image_right: miniaturas (ajuste, Marea) ───────────────────────────────────

export const MAX_MINIATURAS_IMAGEN_TEXTO = 3;

/** `thumbnails[]`. Vacío = la variante de hoy, sin miniaturas. */
export function normalizarMiniaturas(content: Record<string, unknown> | null | undefined): string[] {
  return listaImagenes((content ?? {}).thumbnails, MAX_MINIATURAS_IMAGEN_TEXTO);
}

// ─── link_cloud · pills («Nube de enlaces», Panorama) ───────────────────────────────────────

export const FUENTES_NUBE = ['categories', 'manual'] as const;
/** Con menos enlaces la sección no se pinta (una nube de 2 no es nube). */
export const MIN_ENLACES_NUBE = 3;
export const MAX_ENLACES_NUBE = 30;

export interface NubeEnlaces {
  title: string;
  /** `categories` = las categorías reales; `manual` = `links`. */
  source: (typeof FUENTES_NUBE)[number];
  links: EnlaceTienda[];
  max: number;
}

export const DEFAULT_NUBE_ENLACES: NubeEnlaces = { title: '', source: 'categories', links: [], max: 12 };

export function normalizarNubeEnlaces(content: Record<string, unknown> | null | undefined): NubeEnlaces {
  const c = content ?? {};
  const d = DEFAULT_NUBE_ENLACES;
  return {
    title: textoOpcional(c.title, d.title, 120),
    source: unoDe(c.source, FUENTES_NUBE, d.source),
    links: enlaces(c.links, MAX_ENLACES_NUBE),
    max: enteroEntre(c.max, MIN_ENLACES_NUBE, MAX_ENLACES_NUBE, d.max),
  };
}

/** `cantidad` = enlaces que quedan tras resolver la fuente. */
export function nubeEnlacesVisible(cantidad: number): boolean {
  return cantidad >= MIN_ENLACES_NUBE;
}

// ─── promo_banners: cupón del banner (ajuste, Panorama y Hogar) ─────────────────────────────

export interface CuponBanner {
  code: string;
  /** Fecha `YYYY-MM-DD` (día calendario, sin zona). `''` = sin vencimiento. */
  validUntil: string;
  /** Vence antes de `hoy`: el cupón no se pinta (el banner sí). */
  vencido: boolean;
}

function fechaPlana(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const t = valor.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return '';
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mes - 1, dia));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? t : '';
}

/**
 * `banners[].coupon_code` + `banners[].valid_until`. `null` = el banner de hoy (sin cupón).
 * `hoy` es el día calendario de la organización (`todayInTz(tz)` en quien llama), `YYYY-MM-DD`.
 */
export function normalizarCuponBanner(banner: unknown, hoy: string): CuponBanner | null {
  if (!banner || typeof banner !== 'object' || Array.isArray(banner)) return null;
  const o = banner as Record<string, unknown>;
  const code = normalizarCodigoCupon(o.coupon_code);
  if (!code) return null;
  const validUntil = fechaPlana(o.valid_until);
  const dia = fechaPlana(hoy);
  return { code, validUntil, vencido: validUntil !== '' && dia !== '' && validUntil < dia };
}

// ─── service_cards · over_image («Tarjetas sobre imagen», Radiante) ─────────────────────────

export const MAX_TARJETAS_SERVICIO = 2;
export const MAX_ENLACES_TARJETA_SERVICIO = 6;

export interface TarjetaServicio {
  title: string;
  links: EnlaceTienda[];
  benefits: string[];
}

export interface TarjetasServicio {
  imageUrl: string;
  cards: TarjetaServicio[];
}

export function normalizarTarjetasServicio(content: Record<string, unknown> | null | undefined): TarjetasServicio {
  const c = content ?? {};
  const cards: TarjetaServicio[] = [];
  for (const o of objetos(c.cards)) {
    const title = textoOpcional(o.title, '', MAX_ETIQUETA);
    const links = enlaces(o.links, MAX_ENLACES_TARJETA_SERVICIO);
    const benefits = listaTextos(o.benefits, MAX_ENLACES_TARJETA_SERVICIO, 120);
    if (!title && links.length === 0 && benefits.length === 0) continue;
    cards.push({ title, links, benefits });
    if (cards.length >= MAX_TARJETAS_SERVICIO) break;
  }
  return { imageUrl: urlRecurso(c.image_url), cards };
}

// ─── gallery · collage / instagram_cta (Radiante, Contraste) y carousel · stagger (Marea) ──

export const MAX_FOTOS_COLLAGE = 3;
export const MAX_FOTOS_INSTAGRAM = 5;

export interface GaleriaCollage {
  images: string[];
  phrase: string;
}

export function normalizarGaleriaCollage(content: Record<string, unknown> | null | undefined): GaleriaCollage {
  const c = content ?? {};
  return { images: listaImagenes(c.images, MAX_FOTOS_COLLAGE), phrase: textoOpcional(c.phrase, '') };
}

export interface GaleriaInstagram {
  images: string[];
  /** `''` = el usuario de Instagram de `social_links` (lo resuelve el sitio). Sin «@». */
  handle: string;
  ctaTitle: string;
  ctaText: string;
  ctaUrl: string;
}

export function normalizarGaleriaInstagram(content: Record<string, unknown> | null | undefined): GaleriaInstagram {
  const c = content ?? {};
  const handle = typeof c.handle === 'string' ? c.handle.trim().replace(/^@/, '') : '';
  return {
    images: listaImagenes(c.images, MAX_FOTOS_INSTAGRAM),
    handle: /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : '',
    ctaTitle: textoOpcional(c.cta_title, '', 120),
    ctaText: textoOpcional(c.cta_text, '', MAX_ETIQUETA),
    ctaUrl: urlDestino(c.cta_url),
  };
}

/** `gallery · carousel` con `stagger`: fotos a alturas alternas. Ausente = el carrusel de hoy. */
export function galeriaEscalonada(content: Record<string, unknown> | null | undefined): boolean {
  return booleano((content ?? {}).stagger, false);
}

// ─── text_block · inline_icons («Texto con íconos», Contraste) ──────────────────────────────

export const MAX_SEGMENTOS_TEXTO = 12;

/** Un trozo de la frase: texto o un ícono (nombre de lucide, p. ej. `Leaf`). */
export type SegmentoTexto = { text: string } | { icon: string };

export function normalizarTextoConIconos(content: Record<string, unknown> | null | undefined): { segments: SegmentoTexto[] } {
  const segments: SegmentoTexto[] = [];
  for (const o of objetos((content ?? {}).segments)) {
    if (typeof o.icon === 'string' && /^[A-Z][A-Za-z0-9]{1,39}$/.test(o.icon.trim())) segments.push({ icon: o.icon.trim() });
    else if (typeof o.text === 'string' && o.text.trim()) segments.push({ text: o.text.trim().slice(0, 120) });
    else continue;
    if (segments.length >= MAX_SEGMENTOS_TEXTO) break;
  }
  return { segments };
}

// ─── features_grid · photo_columns («Columnas con foto», Roble) ─────────────────────────────

export const MAX_COLUMNAS_FOTO = 6;

export interface ColumnaFoto {
  imageUrl: string;
  title: string;
  text: string;
}

export function normalizarColumnasFoto(content: Record<string, unknown> | null | undefined): { items: ColumnaFoto[] } {
  const items: ColumnaFoto[] = [];
  for (const o of objetos((content ?? {}).items)) {
    const item = { imageUrl: urlRecurso(o.image_url), title: textoOpcional(o.title, '', MAX_ETIQUETA), text: textoOpcional(o.text, '') };
    if (!item.imageUrl && !item.title && !item.text) continue;
    items.push(item);
    if (items.length >= MAX_COLUMNAS_FOTO) break;
  }
  return { items };
}

// ─── testimonials: resumen de reseñas (ajuste, PLANO §2 ítem 28) y quotes (Roble) ───────────

export const FUENTES_RESUMEN = ['testimonials', 'product_reviews'] as const;
export const PAGINADORES_CITAS = ['none', 'fraction'] as const;

export interface AjustesTestimonios {
  /** «4,9 de N reseñas». `false` = lo de hoy (sin resumen). */
  showSummary: boolean;
  summarySource: (typeof FUENTES_RESUMEN)[number];
  /** Solo `quotes`: foto al lado de las citas. `''` = la variante de hoy. */
  imageUrl: string;
  /** Solo `quotes`: «1 / 5». `none` = lo de hoy. */
  pager: (typeof PAGINADORES_CITAS)[number];
}

export const DEFAULT_AJUSTES_TESTIMONIOS: AjustesTestimonios = { showSummary: false, summarySource: 'testimonials', imageUrl: '', pager: 'none' };

export function normalizarAjustesTestimonios(content: Record<string, unknown> | null | undefined): AjustesTestimonios {
  const c = content ?? {};
  const d = DEFAULT_AJUSTES_TESTIMONIOS;
  return {
    showSummary: booleano(c.show_summary, d.showSummary),
    summarySource: unoDe(c.summary_source, FUENTES_RESUMEN, d.summarySource),
    imageUrl: urlRecurso(c.image_url),
    pager: unoDe(c.pager, PAGINADORES_CITAS, d.pager),
  };
}

/**
 * «4,9 de 128 reseñas» con el agregado real. `null` con 0 reseñas o un promedio fuera de 0–5:
 * no se pinta (nunca una cifra inventada).
 */
export function textoResumenResenas(promedio: number | null | undefined, cantidad: number | null | undefined): string | null {
  if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad <= 0) return null;
  if (typeof promedio !== 'number' || !Number.isFinite(promedio) || promedio < 0 || promedio > 5) return null;
  const valor = (Math.round(promedio * 10) / 10).toFixed(1).replace('.', ',');
  const total = cantidad.toLocaleString('es-CO');
  return `${valor} de ${total} ${cantidad === 1 ? 'reseña' : 'reseñas'}`;
}

// ─── products_grid · editorial («Rejilla editorial», Atelier) y pestañas (ajuste) ──────────

export const ESTILOS_FILTRO_EDITORIAL = ['text', 'chips'] as const;
export const ANCHOS_TARJETA_EDITORIAL = [2, 3] as const;
export const MAX_TARJETAS_EDITORIALES = 4;

export interface TarjetaEditorial {
  /** Va después del producto número `after` (0 = antes del primero). */
  after: number;
  /** Columnas que ocupa. */
  span: (typeof ANCHOS_TARJETA_EDITORIAL)[number];
  imageUrl: string;
  title: string;
  text: string;
  url: string;
}

export interface RejillaEditorial {
  /** «24 productos» sobre la rejilla. */
  countHeader: boolean;
  filtersStyle: (typeof ESTILOS_FILTRO_EDITORIAL)[number];
  /** Vacío = la rejilla normal. Ordenadas por `after`, sin repetir posición. */
  editorialCards: TarjetaEditorial[];
}

export const DEFAULT_REJILLA_EDITORIAL: RejillaEditorial = { countHeader: true, filtersStyle: 'text', editorialCards: [] };

export function normalizarRejillaEditorial(content: Record<string, unknown> | null | undefined): RejillaEditorial {
  const c = content ?? {};
  const d = DEFAULT_REJILLA_EDITORIAL;
  const tarjetas: TarjetaEditorial[] = [];
  for (const o of objetos(c.editorial_cards)) {
    const after = enteroEntre(o.after, 0, 200, -1);
    const imageUrl = urlRecurso(o.image_url);
    const title = textoOpcional(o.title, '', 120);
    if (after < 0 || (!imageUrl && !title) || tarjetas.some((t) => t.after === after)) continue;
    const span = enteroEntre(o.span, 2, 3, 2) as TarjetaEditorial['span'];
    tarjetas.push({ after, span, imageUrl, title, text: textoOpcional(o.text, ''), url: urlDestino(o.url) });
    if (tarjetas.length >= MAX_TARJETAS_EDITORIALES) break;
  }
  tarjetas.sort((a, b) => a.after - b.after);
  return {
    countHeader: booleano(c.count_header, d.countHeader),
    filtersStyle: unoDe(c.filters_style, ESTILOS_FILTRO_EDITORIAL, d.filtersStyle),
    editorialCards: tarjetas,
  };
}

/** Pestañas de `products_grid` (`tabs_style`). `chips` = las de hoy. */
export const ESTILOS_PESTANAS = ['chips', 'underline'] as const;

export function estiloPestanas(content: Record<string, unknown> | null | undefined): (typeof ESTILOS_PESTANAS)[number] {
  return unoDe((content ?? {}).tabs_style, ESTILOS_PESTANAS, 'chips');
}

// ─── categories_grid (ajuste, PLANO §2 ítems 15-18) ─────────────────────────────────────────

/** Valor nuevo de `category_style`: título y conteo encima de la foto, «Explorar →» y descripción. */
export const ESTILO_CATEGORIA_TITULO_ARRIBA = 'title_top' as const;
export const POSICIONES_TEXTO_CATEGORIA = ['bottom', 'top'] as const;
export const COLORES_TARJETA_CATEGORIA = ['none', 'per_item'] as const;
export const ICONOS_CTA_CATEGORIA = ['none', 'arrow', 'arrow_circle'] as const;

export interface AjustesCategorias {
  /** `top` = el texto arriba (card_bottom/overlay). `bottom` = lo de hoy. */
  textPosition: (typeof POSICIONES_TEXTO_CATEGORIA)[number];
  /** `per_item` = fondo del pie de la tarjeta = `categories.color`. `none` = lo de hoy. */
  cardColor: (typeof COLORES_TARJETA_CATEGORIA)[number];
  /** Flecha junto al nombre. `none` = lo de hoy. */
  ctaIcon: (typeof ICONOS_CTA_CATEGORIA)[number];
}

export const DEFAULT_AJUSTES_CATEGORIAS: AjustesCategorias = { textPosition: 'bottom', cardColor: 'none', ctaIcon: 'none' };

export function normalizarAjustesCategorias(content: Record<string, unknown> | null | undefined): AjustesCategorias {
  const c = content ?? {};
  const d = DEFAULT_AJUSTES_CATEGORIAS;
  return {
    textPosition: unoDe(c.category_text_position, POSICIONES_TEXTO_CATEGORIA, d.textPosition),
    cardColor: unoDe(c.category_card_color, COLORES_TARJETA_CATEGORIA, d.cardColor),
    ctaIcon: unoDe(c.category_cta_icon, ICONOS_CTA_CATEGORIA, d.ctaIcon),
  };
}

// ─── Página de categoría (ajuste, PLANO §2 ítem 19) y category_filters · sidebar_facets ────

export const DISPOSICIONES_ENCABEZADO_CATEGORIA = ['stack', 'split_text'] as const;
export const ESTILOS_SUBCATEGORIA = ['chips', 'text', 'tabs'] as const;
/** Rótulo del buscador de la página de categoría: busca en TODA la tienda (`/search?q=`). */
export const TEXTO_BUSCADOR_CATEGORIA = 'Buscar en la tienda';

/** `category_header.layout`. `stack` = lo de hoy. */
export function disposicionEncabezadoCategoria(content: Record<string, unknown> | null | undefined): (typeof DISPOSICIONES_ENCABEZADO_CATEGORIA)[number] {
  return unoDe((content ?? {}).layout, DISPOSICIONES_ENCABEZADO_CATEGORIA, 'stack');
}

export interface AjustesFiltrosCategoria {
  /** `chips` = lo de hoy. */
  subcategoryStyle: (typeof ESTILOS_SUBCATEGORIA)[number];
  /** Buscador en píldora (alcance global). `false` = lo de hoy. */
  search: boolean;
}

export function normalizarAjustesFiltrosCategoria(content: Record<string, unknown> | null | undefined): AjustesFiltrosCategoria {
  const c = content ?? {};
  return { subcategoryStyle: unoDe(c.subcategory_style, ESTILOS_SUBCATEGORIA, 'chips'), search: booleano(c.search, false) };
}

export interface FiltrosLaterales {
  /** Casillas de selección única = `?sub=` (lo que el servidor ya filtra). */
  showSubcategories: boolean;
  showSort: boolean;
  clearText: string;
}

export const DEFAULT_FILTROS_LATERALES: FiltrosLaterales = { showSubcategories: true, showSort: true, clearText: 'Limpiar filtros' };

export function normalizarFiltrosLaterales(content: Record<string, unknown> | null | undefined): FiltrosLaterales {
  const c = content ?? {};
  const d = DEFAULT_FILTROS_LATERALES;
  return {
    showSubcategories: booleano(c.show_subcategories, d.showSubcategories),
    showSort: booleano(c.show_sort, d.showSort),
    clearText: texto(c.clear_text, d.clearText, MAX_ETIQUETA),
  };
}

// ─── Ficha: product_actions (ajuste, PLANO §2 ítems 13-14) ──────────────────────────────────

export const AYUDAS_BOTON = ['none', 'auto'] as const;

export interface AjustesAccionesFicha {
  /** «Agregar · $ 120.000». `false` = lo de hoy. */
  showPriceInButton: boolean;
  /** `auto` = «Elige tu talla» mientras no haya variante elegida. `none` = lo de hoy. */
  buttonHint: (typeof AYUDAS_BOTON)[number];
}

export function normalizarAjustesAccionesFicha(content: Record<string, unknown> | null | undefined): AjustesAccionesFicha {
  const c = content ?? {};
  return { showPriceInButton: booleano(c.show_price_in_button, false), buttonHint: unoDe(c.button_hint, AYUDAS_BOTON, 'none') };
}

/** «Agregar · $ 120.000». `precio` ya formateado por quien llama (moneda de la organización). */
export function textoBotonConPrecio(textoBoton: string, precio: string | null | undefined): string {
  const p = (precio ?? '').trim();
  return p ? `${textoBoton} · ${p}` : textoBoton;
}

/**
 * «Elige tu talla» con el nombre de `variant_types.name` (en minúscula). «tu» sirve para
 * cualquier género del nombre. Sin nombre: «Elige una opción».
 */
export function textoAyudaVariante(nombreTipo: string | null | undefined): string {
  const n = (nombreTipo ?? '').trim().replace(/\s+/g, ' ');
  return n ? `Elige tu ${n.toLocaleLowerCase('es-CO')}` : 'Elige una opción';
}

// ─── Ficha: product_gallery (ajuste, PLANO §2 ítem 26) ──────────────────────────────────────

/** Valor nuevo de `gallery_layout`: 1 grande · 2 medianas · 1 grande. */
export const GALERIA_MOSAICO = 'mosaic' as const;

/** Columnas de la ficha en V2 (`product_gallery.contenido.page_layout`). Defaults = la ficha de hoy. */
export interface DisenoFicha {
  columns: '1' | '2';
  stickyColumn: boolean;
  showBreadcrumb: boolean;
  /** % del ancho para la galería (30–70). */
  galleryWidth: number;
}

export const DEFAULT_DISENO_FICHA: DisenoFicha = { columns: '2', stickyColumn: true, showBreadcrumb: true, galleryWidth: 50 };

/**
 * `null` = no hay `page_layout` (lo de hoy). Lo usa la ficha SOLO cuando la página no trae
 * `page_settings` (V2); con `page_settings` (legacy) manda lo de siempre.
 */
export function normalizarDisenoFicha(content: Record<string, unknown> | null | undefined): DisenoFicha | null {
  const p = (content ?? {}).page_layout;
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o = p as Record<string, unknown>;
  const d = DEFAULT_DISENO_FICHA;
  return {
    columns: o.columns === '1' || o.columns === 1 ? '1' : '2',
    stickyColumn: booleano(o.sticky_column, d.stickyColumn),
    showBreadcrumb: booleano(o.show_breadcrumb, d.showBreadcrumb),
    galleryWidth: enteroEntre(o.gallery_width, 30, 70, d.galleryWidth),
  };
}

// ─── Ficha: product_anchor_nav · tabs («Pestañas ancla», Panorama) ──────────────────────────

/** Bloques de la ficha a los que puede saltar una pestaña (el id del bloque es su tipo). */
export const DESTINOS_ANCLA = [
  'product_info',
  'product_description',
  'product_specs',
  'product_benefits',
  'product_shipping',
  'product_reviews',
  'product_faq',
  'related_products',
  'complete_the_look',
] as const;
export type DestinoAncla = (typeof DESTINOS_ANCLA)[number];
export const MAX_PESTANAS_ANCLA = 6;

export interface PestanasAncla {
  items: { label: string; target: DestinoAncla }[];
  sticky: boolean;
}

export const DEFAULT_PESTANAS_ANCLA: PestanasAncla = {
  items: [
    { label: 'Resumen', target: 'product_info' },
    { label: 'Características', target: 'product_specs' },
    { label: 'Envío', target: 'product_shipping' },
    { label: 'Reseñas', target: 'product_reviews' },
  ],
  sticky: true,
};

/** Sin `items` válidos, las cuatro de siempre. El sitio quita las que apuntan a un bloque oculto. */
export function normalizarPestanasAncla(content: Record<string, unknown> | null | undefined): PestanasAncla {
  const c = content ?? {};
  const items: PestanasAncla['items'] = [];
  for (const o of objetos(c.items)) {
    const label = textoOpcional(o.label, '', 40);
    const target = unoDe(o.target, DESTINOS_ANCLA, 'product_info');
    if (!label || o.target !== target || items.some((i) => i.target === target)) continue;
    items.push({ label, target });
    if (items.length >= MAX_PESTANAS_ANCLA) break;
  }
  return {
    items: items.length > 0 ? items : DEFAULT_PESTANAS_ANCLA.items.map((i) => ({ ...i })),
    sticky: booleano(c.sticky, DEFAULT_PESTANAS_ANCLA.sticky),
  };
}

// ─── Ficha: product_specs · icon_grid / panel (Panorama / Hogar) ────────────────────────────

/**
 * De dónde sale cada fila (columnas reales de `products`, verificadas por MCP el 2026-11-07):
 * `brand`, `length_cm`/`width_cm`/`height_cm`, `weight_kg`, `warranty_months`, `reference` y la
 * categoría del producto. Sin el dato, la fila no se pinta.
 */
export const FUENTES_FICHA_TECNICA = ['brand', 'dimensions', 'weight', 'warranty', 'reference', 'category'] as const;
export type FuenteFichaTecnica = (typeof FUENTES_FICHA_TECNICA)[number];
export const MAX_FILAS_FICHA_TECNICA = 8;

export interface FilaFichaTecnica {
  /** Nombre de lucide (`Ruler`). `''` = el ícono de la fuente. */
  icon: string;
  label: string;
  source: FuenteFichaTecnica;
}

export interface FichaTecnica {
  title: string;
  rows: FilaFichaTecnica[];
}

export const DEFAULT_FICHA_TECNICA: FichaTecnica = {
  title: 'Sobre esta pieza',
  rows: [
    { icon: '', label: 'Marca', source: 'brand' },
    { icon: '', label: 'Medidas', source: 'dimensions' },
    { icon: '', label: 'Peso', source: 'weight' },
    { icon: '', label: 'Garantía', source: 'warranty' },
    { icon: '', label: 'Referencia', source: 'reference' },
    { icon: '', label: 'Categoría', source: 'category' },
  ],
};

export function normalizarFichaTecnica(content: Record<string, unknown> | null | undefined): FichaTecnica {
  const c = content ?? {};
  const rows: FilaFichaTecnica[] = [];
  for (const o of objetos(c.rows)) {
    const source = unoDe(o.source, FUENTES_FICHA_TECNICA, 'brand');
    if (o.source !== source || rows.some((r) => r.source === source)) continue;
    const icon = typeof o.icon === 'string' && /^[A-Z][A-Za-z0-9]{1,39}$/.test(o.icon.trim()) ? o.icon.trim() : '';
    const porDefecto = DEFAULT_FICHA_TECNICA.rows.find((r) => r.source === source)?.label ?? '';
    rows.push({ icon, label: texto(o.label, porDefecto, 40), source });
    if (rows.length >= MAX_FILAS_FICHA_TECNICA) break;
  }
  return {
    title: texto(c.title, DEFAULT_FICHA_TECNICA.title, 120),
    rows: rows.length > 0 ? rows : DEFAULT_FICHA_TECNICA.rows.map((r) => ({ ...r })),
  };
}

function numeroCo(n: number): string {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function positivo(v: unknown): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

/** «40 × 30 × 80 cm» (largo × ancho × alto). `null` si falta alguna medida. */
export function textoDimensiones(largo: unknown, ancho: unknown, alto: unknown): string | null {
  const l = positivo(largo);
  const a = positivo(ancho);
  const h = positivo(alto);
  if (l === null || a === null || h === null) return null;
  return `${numeroCo(l)} × ${numeroCo(a)} × ${numeroCo(h)} cm`;
}

/** «2,5 kg». `null` sin peso. */
export function textoPeso(kg: unknown): string | null {
  const n = positivo(kg);
  return n === null ? null : `${numeroCo(n)} kg`;
}

/** «12 meses» / «1 mes». `null` sin garantía. */
export function textoGarantia(meses: unknown): string | null {
  const n = positivo(meses);
  if (n === null || !Number.isInteger(n)) return null;
  return n === 1 ? '1 mes' : `${n} meses`;
}

// ─── Ficha: product_pager · default («Anterior y siguiente», Hogar) ─────────────────────────

export interface PaginadorFicha {
  prevText: string;
  nextText: string;
}

export const DEFAULT_PAGINADOR_FICHA: PaginadorFicha = { prevText: 'Pieza anterior', nextText: 'Pieza siguiente' };

export function normalizarPaginadorFicha(content: Record<string, unknown> | null | undefined): PaginadorFicha {
  const c = content ?? {};
  return { prevText: texto(c.prev_text, DEFAULT_PAGINADOR_FICHA.prevText, 40), nextText: texto(c.next_text, DEFAULT_PAGINADOR_FICHA.nextText, 40) };
}

// ─── Claves (manifiesto del sitio y catálogo del editor) ────────────────────────────────────

/** Claves de contenido de cada variante o tipo nuevo, por `tipo.variante`. */
export const CLAVES_SECCION_TIENDA: Readonly<Record<string, readonly string[]>> = {
  'hero.search': ['title', 'subtitle', 'image_url', 'inset', 'search_placeholder', 'show_category_select', 'rating_chip'],
  'hero.brand_giant': ['brand_text', 'brand_layer', 'image_url', 'figure_url', 'chip', 'title', 'cta_text', 'cta_url', 'hotspots'],
  'hero.floating': ['title', 'title_highlight', 'title_highlight_style', 'buttons', 'image_url', 'floating_cards'],
  'hero.split_products': ['product_ids'],
  'transformation.slider': ['title', 'subtitle', 'items', 'start_position', 'handle_color'],
  'image_text.color_block': ['number', 'title', 'phrase', 'image_url', 'bg_color', 'text_color', 'cta_url'],
  'image_text.editorial': ['title', 'link_text', 'link_url', 'body', 'image_small_url', 'image_small_caption', 'image_url', 'image_tag'],
  'gallery.collage': ['images', 'phrase'],
  'gallery.instagram_cta': ['images', 'handle', 'cta_title', 'cta_text', 'cta_url'],
  'text_block.inline_icons': ['segments'],
  'features_grid.photo_columns': ['items'],
  'products_grid.editorial': ['count_header', 'filters_style', 'editorial_cards'],
  'category_filters.sidebar_facets': ['show_subcategories', 'show_sort', 'clear_text'],
  'product_specs.icon_grid': ['title', 'rows'],
  'product_specs.panel': ['title', 'rows'],
  'shop_the_look.hotspots': ['title', 'image_url', 'hotspots', 'show_cards'],
  'complete_the_look.default': ['title', 'source', 'product_ids', 'limit', 'image_url', 'show_add_all'],
  'product_index.list': ['title', 'product_ids', 'show_price', 'cta_text', 'cta_url'],
  'product_anatomy.default': ['product_id', 'title', 'details'],
  'welcome_popup.coupon': ['enabled', 'coupon_code', 'title', 'text', 'cta_text', 'cta_url', 'image_url', 'delay_s', 'frequency'],
  'link_cloud.pills': ['title', 'source', 'links', 'max'],
  'service_cards.over_image': ['image_url', 'cards'],
  'product_anchor_nav.tabs': ['items', 'sticky'],
  'product_pager.default': ['prev_text', 'next_text'],
};

/**
 * Claves NUEVAS que ganan secciones que ya existen, por tipo (o `tipo.variante` si es solo de una
 * variante). Ausentes = la sección de hoy.
 */
export const CLAVES_AJUSTE_TIENDA: Readonly<Record<string, readonly string[]>> = {
  hero: ['title_highlight', 'title_highlight_style'],
  'image_text.image_right': ['thumbnails'],
  'gallery.carousel': ['stagger'],
  promo_banners: ['banners[].coupon_code', 'banners[].valid_until'],
  testimonials: ['show_summary', 'summary_source'],
  'testimonials.quotes': ['image_url', 'pager'],
  products_grid: ['tabs_style'],
  categories_grid: ['category_text_position', 'category_card_color', 'category_cta_icon'],
  category_header: ['layout'],
  category_filters: ['subcategory_style', 'search'],
  product_actions: ['show_price_in_button', 'button_hint'],
  product_gallery: ['page_layout'],
};

/**
 * Valores NUEVOS de claves que ya existían (el resto de valores siguen igual): `category_style` y
 * `gallery_layout`. (`variant: 'link'` de los botones ya existía: ver {@link VARIANTE_BOTON_ENLACE}.)
 */
export const VALORES_NUEVOS_TIENDA: Readonly<Record<string, readonly string[]>> = {
  'categories_grid.category_style': [ESTILO_CATEGORIA_TITULO_ARRIBA],
  'product_gallery.gallery_layout': [GALERIA_MOSAICO],
};
