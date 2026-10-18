/**
 * La portada en carrusel pinta `slides`. El editor también guarda el banner en
 * `image_url` / `image_url_mobile` de la sección (los mismos campos que las
 * otras variantes de portada). Sin diapositivas, el carrusel se quedaba en el
 * color de marca y el banner no se veía.
 *
 * El lienzo manda estas diapositivas solo en el mensaje de vista previa. No se
 * escriben en el borrador: si una diapositiva ya trae imagen, esa gana, y un
 * banner sintético guardado dejaría de seguir los campos de la sección.
 */

export interface SlideVisible {
  title?: string;
  subtitle?: string;
  image_url?: string;
  image_url_mobile?: string;
  video_url?: string;
  cta_text?: string;
  cta_url?: string;
  buttons?: unknown;
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function esRegistro(valor: unknown): valor is Record<string, unknown> {
  return !!valor && typeof valor === 'object' && !Array.isArray(valor);
}

function tieneMedio(slide: Record<string, unknown>): boolean {
  return texto(slide.image_url).length > 0 || texto(slide.image_url_mobile).length > 0 || texto(slide.video_url).length > 0;
}

/** Escritorio, o la móvil si el escritorio está vacío, para que se vea a cualquier ancho. */
function normalizar(slide: Record<string, unknown>): SlideVisible {
  const escritorio = texto(slide.image_url);
  const movil = texto(slide.image_url_mobile);
  const video = texto(slide.video_url);
  const src = escritorio || movil;
  const siguiente: Record<string, unknown> = { ...slide };
  if (src) siguiente.image_url = src;
  else delete siguiente.image_url;
  if (movil && movil !== src) siguiente.image_url_mobile = movil;
  else delete siguiente.image_url_mobile;
  if (video) siguiente.video_url = video;
  else delete siguiente.video_url;
  return siguiente as SlideVisible;
}

function bannerDeSeccion(contenido: Record<string, unknown>): SlideVisible | null {
  const escritorio = texto(contenido.image_url);
  const movil = texto(contenido.image_url_mobile);
  const video = texto(contenido.video_url);
  if (!escritorio && !movil && !video) return null;
  const src = escritorio || movil;
  const slide: SlideVisible = {};
  if (typeof contenido.title === 'string') slide.title = contenido.title;
  if (typeof contenido.subtitle === 'string') slide.subtitle = contenido.subtitle;
  if (typeof contenido.cta_text === 'string') slide.cta_text = contenido.cta_text;
  if (typeof contenido.cta_url === 'string') slide.cta_url = contenido.cta_url;
  if (contenido.buttons !== undefined) slide.buttons = contenido.buttons;
  if (src) slide.image_url = src;
  if (movil && movil !== src) slide.image_url_mobile = movil;
  if (video) slide.video_url = video;
  return slide;
}

/**
 * Diapositivas que el carrusel puede pintar.
 * Si alguna ya trae imagen o video, se usan esas (la móvil cubre el escritorio vacío).
 * Si no, el banner de la sección es la única diapositiva.
 */
export function slidesDePortada(contenido: unknown): SlideVisible[] {
  const c = esRegistro(contenido) ? contenido : {};
  const crudos = Array.isArray(c.slides) ? c.slides.filter(esRegistro) : [];
  if (crudos.some(tieneMedio)) return crudos.map(normalizar);
  const banner = bannerDeSeccion(c);
  if (banner) return [banner];
  return crudos.map(normalizar);
}

/** Sustituye `slides` solo en la portada carrusel. El resto del contenido no cambia. */
export function contenidoPortadaVisible<T>(tipo: unknown, variante: unknown, contenido: T): T {
  if (tipo !== 'hero' || variante !== 'slider') return contenido;
  if (!esRegistro(contenido)) return contenido;
  return { ...contenido, slides: slidesDePortada(contenido) };
}
