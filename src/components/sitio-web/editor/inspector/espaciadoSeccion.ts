import { sanitizarCarrusel } from '@/lib/website/v2/paginacionCarrusel';
/**
 * Espaciado y ancho de una sección: una sola opción por función (Figma v2,
 * pestaña Estilo › Espaciado y Ancho). Los campos sueltos de versiones
 * anteriores (relleno y margen por lado, «Ancho completo de pantalla», ancho del
 * contenido) ya no se pintan en Diseño; si la sección los tiene guardados, la
 * tienda los sigue aplicando y salen en «Ajustes de versiones anteriores».
 */
import type { ContentFieldDef } from '@/lib/services/websitePageBuilderService';
import type { EntradaAnterior } from './anterioresLogica';

/** Campos del catálogo que ya no se pintan: su función la cubre Estilo › Espaciado / Ancho. */
export function campoCubiertoPorEstilo(c: Pick<ContentFieldDef, 'key' | 'type'> & { group?: string }, tipoSeccion: string): boolean {
  if (c.type === 'spacing') return true;
  // PRODUC-37..40 / FEATUR-14..17: el panel «Carrusel» manda; lo guardado pasa a él al editarlo.
  if (c.group === 'carousel' && TIPOS_CARRUSEL_ANTERIOR.includes(tipoSeccion) && (CLAVES_CARRUSEL_ANTERIOR as readonly string[]).includes(c.key)) return true;
  // BANNER-01: la distribución se elige en «Banners».
  if (tipoSeccion === 'promo_banners' && ['layout', 'columns', 'rows', 'gap', 'columns_mobile'].includes(c.key)) return true;
  // HERO-29..44: en la portada el panel «Carrusel» manda; la transición y su velocidad siguen aquí.
  if (c.group === 'carousel' && tipoSeccion === 'hero' && (c.key === 'slides_per_view' || (CLAVES_CARRUSEL_HERO as readonly string[]).includes(c.key))) return true;
  if (c.key === 'full_bleed' || c.key === 'container_width') return true;
  // `categories_grid.full_width`: la tienda no lo lee (sin efecto); el ancho lo da Estilo › Ancho.
  // MAP-09: el mapa embebido siempre muestra el marcador; `show_marker` no tiene efecto.
  if (c.key === 'show_marker' && tipoSeccion === 'map') return true;
  return c.key === 'full_width' && tipoSeccion === 'categories_grid';
}

const TIPOS_CARRUSEL_ANTERIOR = ['products_grid', 'featured_products'];
const CLAVES_CARRUSEL_ANTERIOR = ['slides_per_view', 'autoplay', 'interval_ms', 'loop', 'pause_on_hover', 'show_arrows', 'show_dots', 'enable_swipe'] as const;

const CLAVES_CARRUSEL_HERO = [
  'autoplay', 'interval_ms', 'pause_on_hover', 'loop', 'show_arrows', 'arrow_style', 'arrow_position',
  'arrow_size', 'arrow_color', 'arrow_bg_color', 'show_dots', 'dot_style', 'enable_swipe',
] as const;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Carrusel anterior de la portada (CAROUSEL_FIELDS) leído como panel «Carrusel», con los valores por defecto de HeroSlider. */
function carruselHeroDesdeAnteriores(c: Record<string, unknown>): Record<string, unknown> {
  // Misma lectura que HeroSlider (`clave ?? valor por defecto`), con los valores exactos.
  const si = (v: unknown, porDefecto: boolean) => Boolean(v ?? porDefecto);
  const flechas = si(c.show_arrows, false);
  const puntos = si(c.show_dots, true);
  const estilo = ({ circle: 'circulo', square: 'cuadrado', minimal: 'minimo', chevron: 'chevron' } as Record<string, string>)[String(c.arrow_style || 'circle')] ?? 'circulo';
  const posicion = ({ inside: 'lados_dentro', outside: 'lados_fuera', 'top-right': 'arriba_derecha', bottom: 'abajo' } as Record<string, string>)[String(c.arrow_position || 'inside')] ?? 'lados_dentro';
  const px = Number(c.arrow_size) || 40;
  const indicador = !puntos ? 'ninguno' : (({ dots: 'puntos', bars: 'barra', numbers: 'numeros' } as Record<string, string>)[String(c.dot_style || 'dots')] ?? 'puntos');
  const ms = Number(c.interval_ms) || 5000;
  const salida: Record<string, unknown> = {
    // Flechas y puntos con las piezas de la portada: dentro de la imagen, en blanco, como hoy.
    controlesPortada: true,
    posicionIndicador: 'abajo_dentro',
    colorActivo: '#FFFFFF',
    colorInactivo: '#FFFFFF80',
    autoplay: si(c.autoplay, true),
    segundos: Math.min(15, Math.max(1, Math.round(ms / 10) / 100)),
    pausaHover: si(c.pause_on_hover, true),
    loop: si(c.loop, true),
    arrastre: si(c.enable_swipe, true),
    flechasEscritorio: flechas,
    flechasMovil: flechas,
    estiloFlechas: estilo,
    posicionFlechas: posicion,
    tamanoFlecha: px < 36 ? 'sm' : px <= 44 ? 'md' : 'lg',
    tamanoFlechaPx: Math.min(96, Math.max(16, Math.round(px))),
    indicador,
  };
  if (typeof c.arrow_color === 'string' && HEX_COLOR.test(c.arrow_color)) salida.colorIcono = c.arrow_color;
  if (typeof c.arrow_bg_color === 'string' && HEX_COLOR.test(c.arrow_bg_color)) salida.fondoFlecha = c.arrow_bg_color;
  return salida;
}

function numeroEntre(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : undefined;
}

/**
 * Al dejar de usar el carrusel global en products_grid / featured_products, el carrusel propio
 * arranca con lo que la sección ya tenía (slides_per_view, autoplay, loop, enable_swipe y sus
 * valores por defecto de siempre), así la tienda se ve igual al cambiar de opción.
 */
export function carruselDesdeClavesAnteriores(contenido: Record<string, unknown>, tipoSeccion: string): Record<string, unknown> {
  if (tipoSeccion === 'hero') return carruselHeroDesdeAnteriores(contenido);
  if (!TIPOS_CARRUSEL_ANTERIOR.includes(tipoSeccion)) return {};
  // Igual que FeaturedProductsCarousel / ProductsCarousel de la tienda (HOY + slides_per_view).
  const spv = contenido.slides_per_view;
  const o = spv && typeof spv === 'object' ? (spv as Record<string, unknown>) : null;
  const escritorio = numeroEntre(o ? o.desktop : spv, 1, 8) ?? 4;
  const tableta = numeroEntre(o ? o.tablet : spv, 1, 8) ?? Math.min(3, escritorio);
  const movil = numeroEntre(o ? o.mobile : spv, 1, 8) ?? Math.min(2, escritorio);
  const ms = Number(contenido.interval_ms);
  const flechas = booleano(contenido.show_arrows) ?? true;
  return {
    visiblesEscritorio: escritorio,
    visiblesTableta: tableta,
    visiblesMovil: movil,
    autoplay: booleano(contenido.autoplay) ?? false,
    segundos: Number.isFinite(ms) && ms > 0 ? Math.min(15, Math.max(1, Math.round(ms / 10) / 100)) : 5,
    loop: booleano(contenido.loop) ?? false,
    pausaHover: booleano(contenido.pause_on_hover) ?? true,
    flechasEscritorio: flechas,
    flechasMovil: flechas,
    indicador: (booleano(contenido.show_dots) ?? true) ? 'puntos' : 'ninguno',
    arrastre: booleano(contenido.enable_swipe) ?? true,
  };
}

/** Como `booleano` de la tienda (lib/carrusel/opcionesCarrusel): vacío = sin valor; "false" y "0" = false. */
function booleano(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v !== 'false' && v !== '0';
  return Boolean(v);
}

const CLAVES_BANNERS_ANTERIOR = ['layout', 'columns', 'columns_mobile', 'gap'] as const;

/** Distribución anterior de promo_banners (layout grid/carousel/stack, columns, columns_mobile, gap). */
export function bannersDesdeAnteriores(c: Record<string, unknown>): { layout: string; estilo: Record<string, number> } {
  const layout = c.layout === 'carousel' ? 'carousel' : c.layout === 'stack' ? 'full_stack' : 'grid';
  const estilo: Record<string, number> = {};
  const col = c.columns;
  const o = col && typeof col === 'object' ? (col as Record<string, unknown>) : null;
  const d = numeroEntre(o ? o.desktop : col, 1, 8);
  // Igual que clasesColumnasBanner: un número deja la tableta en min(d, 2).
  const t = o ? numeroEntre(o.tablet ?? o.desktop, 1, 8) ?? (d != null ? Math.min(d, 2) : undefined) : d != null ? Math.min(d, 2) : undefined;
  const m = numeroEntre(c.columns_mobile ?? o?.mobile, 1, 8);
  if (d != null) estilo.columns_desktop = d;
  if (t != null) estilo.columns_tablet = t;
  if (m != null) estilo.columns_mobile = m;
  // `gap` anterior no lo usa la tienda (gap-6 = 24 px fijo): no se copia.
  return { layout, estilo };
}

const GRUPOS: ReadonlyArray<{ id: string; claves: readonly string[]; motivo?: EntradaAnterior['motivo']; solo?: string }> = [
  { id: 'seccion_padding_top', claves: ['padding_top', 'padding_top_px'], motivo: 'mandaEspaciado' },
  { id: 'seccion_padding_bottom', claves: ['padding_bottom', 'padding_bottom_px'], motivo: 'mandaEspaciado' },
  { id: 'seccion_padding_x', claves: ['padding_x'] },
  { id: 'seccion_margin_top', claves: ['margin_top'] },
  { id: 'seccion_margin_bottom', claves: ['margin_bottom'] },
  { id: 'seccion_full_bleed', claves: ['full_bleed'], motivo: 'mandaAncho' },
  { id: 'seccion_container_width', claves: ['container_width'], motivo: 'mandaAncho' },
  { id: 'seccion_full_width', claves: ['full_width'], motivo: 'sinEfecto', solo: 'categories_grid' },
  { id: 'seccion_show_marker', claves: ['show_marker'], motivo: 'sinEfecto', solo: 'map' },
  { id: 'banners_distribucion', claves: CLAVES_BANNERS_ANTERIOR, motivo: 'pasaABanners', solo: 'promo_banners' },
  { id: 'banners_filas', claves: ['rows'], motivo: 'sinEfecto', solo: 'promo_banners' },
  { id: 'seccion_carrusel_portada', claves: CLAVES_CARRUSEL_HERO, motivo: 'mandaCarrusel', solo: 'hero' },
  { id: 'seccion_slides_per_view', claves: ['slides_per_view'], motivo: 'sinEfecto', solo: 'hero' },
  ...TIPOS_CARRUSEL_ANTERIOR.map((solo) => ({ id: 'seccion_carrusel', claves: CLAVES_CARRUSEL_ANTERIOR, motivo: 'mandaCarrusel' as const, solo })),
];

const presente = (v: unknown) => v !== undefined && v !== null && v !== '';

/** Entradas «Ajustes de versiones anteriores» de una sección (solo las que tienen valor guardado). */
export function entradasAnterioresSeccion(contenido: Record<string, unknown>, tipoSeccion: string): EntradaAnterior[] {
  const salida: EntradaAnterior[] = [];
  for (const g of GRUPOS) {
    if (g.solo && g.solo !== tipoSeccion) continue;
    if (!g.claves.some((k) => presente(contenido[k]))) continue;
    salida.push({ id: g.id, quitar: Object.fromEntries(g.claves.map((k) => [k, null])), ...(g.motivo ? { motivo: g.motivo } : {}) });
  }
  // HERO-01/02: la portada pinta su propio título; el del encabezado (Cascarón anterior) es aparte.
  const h = contenido.section_header;
  if (tipoSeccion === 'hero' && h && typeof h === 'object') {
    const header = { ...(h as Record<string, unknown>) };
    if (presente(header.title) || presente(header.description)) {
      delete header.title;
      delete header.description;
      salida.push({ id: 'encabezado_titulo_portada', quitar: { section_header: Object.keys(header).length ? header : null }, motivo: 'tituloEncabezado' });
    }
  }
  return salida;
}

/** Aplica un cambio de «Quitar»: `null` borra la clave del contenido. */
export function aplicarCambioContenido(contenido: Record<string, unknown>, cambio: Record<string, unknown>): Record<string, unknown> {
  const siguiente = { ...contenido };
  for (const [k, v] of Object.entries(cambio)) {
    if (v === null || v === undefined) delete siguiente[k];
    else siguiente[k] = v;
  }
  return siguiente;
}

const IMAGENES_PORTADA = ['image_url', 'image_url_mobile'];
const conImagen = (c: Record<string, unknown>) => IMAGENES_PORTADA.some((k) => typeof c[k] === 'string' && (c[k] as string).trim() !== '');

/**
 * Portada «Pantalla completa»: sin imagen la capa se ve al 100 (D4). Si quedó guardada en 100 y se
 * sube la primera imagen, baja sola a 70 (el default con imagen) para que la foto se vea.
 */
export function capaAlSubirPrimeraImagen(
  tipo: string,
  variante: string | null | undefined,
  antes: Record<string, unknown>,
  despues: Record<string, unknown>,
): Record<string, unknown> {
  if (tipo !== 'hero' || variante !== 'fullscreen') return despues;
  if (conImagen(antes) || !conImagen(despues)) return despues;
  if (Number(despues.overlay_opacity) !== 100) return despues;
  return { ...despues, overlay_opacity: 70 };
}

/**
 * CASCAR-02: un solo campo de título y uno de subtítulo/descripción. La tienda pinta
 * `section_header.title || title` y `section_header.description || descripción`; el campo de
 * Contenido muestra lo que se ve y, al editar, escribe la clave de Contenido y borra la copia
 * del encabezado (si no, el cambio no se vería).
 */
const CLAVE_ENCABEZADO_DE: Record<string, 'title' | 'description'> = { title: 'title', subtitle: 'description', description: 'description' };

export function valorTextoEncabezado(contenido: Record<string, unknown>, clave: string, tipoSeccion?: string): unknown {
  const k = tipoSeccion === 'hero' ? undefined : CLAVE_ENCABEZADO_DE[clave];
  const h = contenido.section_header;
  if (k && h && typeof h === 'object') {
    const v = (h as Record<string, unknown>)[k];
    if (typeof v === 'string' && v) return v;
  }
  return contenido[clave];
}

export function cambioTextoEncabezado(contenido: Record<string, unknown>, clave: string, valor: unknown, tipoSeccion?: string): Record<string, unknown> {
  const siguiente: Record<string, unknown> = { ...contenido, [clave]: valor };
  const k = tipoSeccion === 'hero' ? undefined : CLAVE_ENCABEZADO_DE[clave];
  const h = contenido.section_header;
  if (k && h && typeof h === 'object' && k in (h as Record<string, unknown>)) {
    const header = { ...(h as Record<string, unknown>) };
    delete header[k];
    if (Object.keys(header).length) siguiente.section_header = header;
    else delete siguiente.section_header;
  }
  return siguiente;
}

/** Igual que la tienda: el carrusel global cuenta si tiene algún ajuste además de `usar_global`. */
export function carruselGlobalActivo(global: unknown): boolean {
  const g = sanitizarCarrusel(global);
  if (!g) return false;
  return Object.keys(g).some((k) => k !== 'usar_global');
}

export const CLAVES_VER_TODO = ['view_all', 'view_all_label', 'view_all_url', 'view_all_style'] as const;

/** El botón «Ver todo» anterior, como lo pinta la tienda (`accionDesdeVerTodo` de goadmin-websites). */
export function accionDesdeVerTodo(e: Record<string, unknown>): Record<string, unknown> | undefined {
  const url = typeof e.view_all_url === 'string' ? e.view_all_url.trim().slice(0, 500) : '';
  // Misma validación que la tienda (urlSegura de cascaronSeccion): ruta, ancla o http(s).
  if (e.view_all !== true || !(url.startsWith('/') || url.startsWith('#') || /^https?:\/\//i.test(url))) return undefined;
  const estilo = typeof e.view_all_style === 'string' && e.view_all_style ? e.view_all_style : undefined;
  return {
    text: typeof e.view_all_label === 'string' && e.view_all_label ? e.view_all_label : 'Ver todo',
    href: url,
    kind: estilo === 'ghost' ? 'link' : 'button',
    position: e.layout === 'inline' ? 'inline' : 'below',
    ...(estilo ? { style: estilo } : {}),
    ...(estilo === 'ghost' ? { icon: true } : {}),
  };
}

