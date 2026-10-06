/**
 * Lógica pura de «SEO y redes» (Figma B/08-01…08-05). Sin React ni red.
 *
 * - Contadores de longitud con umbral (título ≤ 60, descripción ≤ 160).
 * - Calidad SEO por página: parte de `saludSeo` (la MISMA regla que la
 *   columna SEO de Páginas) y añade el detalle por campo (Bien / Mejorable /
 *   Falta) que pide la tabla de B/08-01.
 * - Redes sociales: lo que escribe la persona («@tumarca», «+57 300…») se
 *   guarda como URL (el contrato V2 exige URL) y se muestra en forma corta.
 * - Código de verificación de Search Console: acepta la etiqueta completa.
 * - Resumen de las filas del móvil (B/08-03).
 */
import type { CampoHeredable, DocumentoSitio, PaginaSitio } from '@/lib/website/contrato/documentoSitio';
import { saludSeo, type SaludSeo } from '../paginas/saludSeo';
import { esInicio, esPlantillaTienda } from '../paginas/tipoPagina';

export const LIMITE_TITULO = 60;
export const LIMITE_DESCRIPCION = 160;
/** Por debajo de esto un título o una descripción se marca «Mejorable». */
export const MINIMO_TITULO = 10;
export const MINIMO_DESCRIPCION = 50;
/**
 * Imágenes para compartir que admite el contrato del sitio (`seo.imagenOgUrl`).
 * El diseño muestra hasta 5 con principal y orden; el contrato V2 guarda una.
 * Ampliarlo exige cambiar `documentoSitio.ts` en los dos repos (reportado).
 */
export const MAX_IMAGENES_COMPARTIR = 1;

export type EstadoLongitud = 'bien' | 'largo' | 'falta';

export function estadoLongitud(texto: string, limite: number): { largo: number; estado: EstadoLongitud } {
  const largo = Array.from(texto.trim()).length;
  if (largo === 0) return { largo, estado: 'falta' };
  return { largo, estado: largo > limite ? 'largo' : 'bien' };
}

// ─── Valores del documento ────────────────────────────────────────────────────

export function textoCampo(campo: CampoHeredable<string> | undefined): string {
  return campo && campo.mode === 'value' ? campo.value : '';
}

/** Campo del sitio principal: texto vacío → `clear` (no hereda; es el principal). */
export function campoTexto(valor: string): CampoHeredable<string> {
  const limpio = valor.trim();
  return limpio ? { mode: 'value', value: limpio } : { mode: 'clear' };
}

// ─── Calidad por página ───────────────────────────────────────────────────────

export type NivelCampo = 'bien' | 'mejorable' | 'falta';
export type CalidadGeneral = 'bien' | 'mejorable' | 'falta_titulo' | 'falta_descripcion' | 'falta_imagen';

export interface CalidadPagina {
  id: string;
  titulo: string;
  slug: string;
  tipo: string;
  esInicio: boolean;
  campos: { titulo: NivelCampo; descripcion: NivelCampo; imagen: NivelCampo };
  general: CalidadGeneral;
}

function nivelLongitud(texto: string, minimo: number, maximo: number): NivelCampo {
  const n = Array.from(texto.trim()).length;
  if (n === 0) return 'falta';
  return n < minimo || n > maximo ? 'mejorable' : 'bien';
}

const GENERAL_DE_SALUD: Record<Exclude<SaludSeo, 'completo' | 'sin_revisar'>, CalidadGeneral> = {
  falta_titulo: 'falta_titulo',
  falta_descripcion: 'falta_descripcion',
  falta_imagen: 'falta_imagen',
};

export function calidadPagina(pagina: PaginaSitio, documento: Pick<DocumentoSitio, 'seo'>): CalidadPagina {
  const inicio = esInicio(pagina);
  const titulo = textoCampo(pagina.seo?.titulo) || pagina.titulo;
  const descripcion = textoCampo(pagina.seo?.descripcion) || (inicio ? textoCampo(documento.seo?.descripcion) : '');
  const imagen = textoCampo(pagina.seo?.imagenOgUrl) || textoCampo(documento.seo?.imagenOgUrl);
  const campos = {
    titulo: nivelLongitud(titulo, MINIMO_TITULO, LIMITE_TITULO),
    descripcion: nivelLongitud(descripcion, MINIMO_DESCRIPCION, LIMITE_DESCRIPCION),
    imagen: (imagen.trim() ? 'bien' : 'falta') as NivelCampo,
  };
  // La regla de «falta» es la de Páginas (`saludSeo`); «Mejorable» solo afina el «completo».
  const salud = saludSeo(pagina, documento);
  const general: CalidadGeneral =
    salud === 'completo' || salud === 'sin_revisar'
      ? campos.titulo === 'mejorable' || campos.descripcion === 'mejorable'
        ? 'mejorable'
        : 'bien'
      : GENERAL_DE_SALUD[salud];
  return { id: pagina.id, titulo: pagina.titulo, slug: pagina.slug, tipo: pagina.tipo, esInicio: inicio, campos, general };
}

/**
 * Páginas que se revisan: las publicadas, sin las plantillas de Tienda
 * (producto, categoría, carrito, pago…), que heredan del inventario o no se
 * indexan. Inicio primero; las que fallan, antes que las que están bien.
 */
export function calidadPaginas(documento: Pick<DocumentoSitio, 'seo' | 'paginas'>): CalidadPagina[] {
  const peso: Record<CalidadGeneral, number> = { falta_titulo: 0, falta_descripcion: 1, falta_imagen: 2, mejorable: 3, bien: 4 };
  return documento.paginas
    .filter((p) => p.publicada && !esPlantillaTienda(p))
    .map((p) => calidadPagina(p, documento))
    .sort((a, b) => Number(b.esInicio) - Number(a.esInicio) || peso[a.general] - peso[b.general] || a.titulo.localeCompare(b.titulo, 'es'));
}

// ─── Redes sociales ───────────────────────────────────────────────────────────

export const REDES_SEO = ['instagram', 'facebook', 'tiktok', 'whatsapp'] as const;
export type RedSeo = (typeof REDES_SEO)[number];

const DOMINIO_RED: Record<Exclude<RedSeo, 'whatsapp'>, RegExp> = {
  instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/@?([A-Za-z0-9._]+)\/?(?:[?#].*)?$/i,
  facebook: /^(?:https?:\/\/)?(?:www\.|m\.)?(?:facebook|fb)\.com\/([A-Za-z0-9.\-/=?]+?)\/?$/i,
  tiktok: /^(?:https?:\/\/)?(?:www\.)?tiktok\.com\/@?([A-Za-z0-9._]+)\/?(?:[?#].*)?$/i,
};

/**
 * Lo que escribe la persona → URL para el documento. `''` → `null` (sin red).
 * `undefined` si no se reconoce (el formulario muestra el error).
 */
export function normalizarRed(red: RedSeo, entrada: string): string | null | undefined {
  const v = entrada.trim();
  if (!v) return null;
  if (red === 'whatsapp') {
    const wa = /^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?\+?(\d{8,15})/i.exec(v);
    const digitos = wa ? wa[1] : v.replace(/[\s().-]/g, '').replace(/^\+/, '');
    if (!/^\d{8,15}$/.test(digitos)) return undefined;
    // Un celular colombiano sin indicativo (10 dígitos que empiezan por 3) lleva el 57.
    const completo = digitos.length === 10 && digitos.startsWith('3') ? `57${digitos}` : digitos;
    return `https://wa.me/${completo}`;
  }
  const url = DOMINIO_RED[red].exec(v);
  if (url) {
    const usuario = url[1].replace(/\/+$/, '');
    return red === 'tiktok' ? `https://www.tiktok.com/@${usuario}` : `https://www.${red}.com/${usuario}`;
  }
  if (/^https?:\/\//i.test(v) || v.includes('/')) return undefined;
  const usuario = v.replace(/^@/, '');
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(usuario)) return undefined;
  return red === 'tiktok' ? `https://www.tiktok.com/@${usuario}` : `https://www.${red}.com/${usuario}`;
}

/** URL guardada → forma corta para el campo («@tumarca», «facebook.com/tumarca», «+57 300 555 0100»). */
export function mostrarRed(red: RedSeo, url: string | null | undefined): string {
  if (!url) return '';
  if (red === 'whatsapp') {
    const m = /wa\.me\/(\d+)/i.exec(url) ?? /phone=(\d+)/i.exec(url);
    if (!m) return url;
    const d = m[1];
    if (d.startsWith('57') && d.length === 12) return `+57 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
    return `+${d}`;
  }
  if (red === 'facebook') {
    const m = DOMINIO_RED.facebook.exec(url);
    return m ? `facebook.com/${m[1].replace(/\/+$/, '')}` : url;
  }
  const m = DOMINIO_RED[red].exec(url);
  return m ? `@${m[1]}` : url;
}

/** Clave con que se guarda cada red en `contenido.redesSociales` (la del sitio importado). */
export function claveRed(redes: Record<string, string>, red: RedSeo): string {
  const existente = Object.keys(redes).find((k) => k.toLowerCase() === red);
  return existente ?? red;
}

// ─── Documento V2 ↔ formulario ───────────────────────────────────────────────

export function valoresDesdeDocumento(doc: DocumentoSitio | null): ValoresSeo {
  const redesDoc = doc?.contenido?.redesSociales?.mode === 'value' ? doc.contenido.redesSociales.value : {};
  const redes = Object.fromEntries(
    REDES_SEO.map((r) => [r, mostrarRed(r, redesDoc[claveRed(redesDoc, r)] ?? null)]),
  ) as Record<RedSeo, string>;
  return {
    titulo: textoCampo(doc?.seo?.titulo),
    descripcion: textoCampo(doc?.seo?.descripcion),
    imagen: textoCampo(doc?.seo?.imagenOgUrl) || null,
    redes,
  };
}

/** Aplica el formulario al documento: solo los campos de esta pantalla; las demás redes se conservan. */
export function aplicarAlDocumento(doc: DocumentoSitio, f: ValoresSeo): DocumentoSitio {
  const previas = doc.contenido?.redesSociales?.mode === 'value' ? { ...doc.contenido.redesSociales.value } : {};
  for (const r of REDES_SEO) {
    const clave = claveRed(previas, r);
    const url = normalizarRed(r, f.redes[r]);
    if (url) previas[clave] = url;
    else delete previas[clave];
  }
  return {
    ...doc,
    seo: {
      ...doc.seo,
      titulo: campoTexto(f.titulo),
      descripcion: campoTexto(f.descripcion),
      imagenOgUrl: f.imagen ? { mode: 'value', value: f.imagen } : { mode: 'clear' },
    },
    contenido: {
      ...doc.contenido,
      redesSociales: Object.keys(previas).length > 0 ? { mode: 'value', value: previas } : { mode: 'clear' },
    },
  };
}

// ─── Search Console ───────────────────────────────────────────────────────────

/**
 * Código de verificación de Google: acepta el código solo o la etiqueta
 * `<meta name="google-site-verification" content="…">`. `''` → `null`;
 * `undefined` si no tiene forma de código.
 */
export function extraerCodigoVerificacion(entrada: string): string | null | undefined {
  const v = entrada.trim();
  if (!v) return null;
  const meta = /content\s*=\s*["']([^"']+)["']/i.exec(v);
  const codigo = (meta ? meta[1] : v).trim();
  return /^[A-Za-z0-9_-]{10,100}$/.test(codigo) ? codigo : undefined;
}

// ─── Primera vez y móvil ──────────────────────────────────────────────────────

export interface ValoresSeo {
  titulo: string;
  descripcion: string;
  imagen: string | null;
  redes: Record<RedSeo, string>;
}

/** «Primera vez» (B/08-02): sin título, sin descripción y sin imagen. */
export function seoVacio(v: Pick<ValoresSeo, 'titulo' | 'descripcion' | 'imagen'>): boolean {
  return !v.titulo.trim() && !v.descripcion.trim() && !v.imagen;
}

/** Propuesta sin IA para «Usar sugerencias»: nombre y giro del negocio. */
export function sugerenciaBasica(nombre: string, giro: string | null, logo: string | null): Pick<ValoresSeo, 'titulo' | 'descripcion' | 'imagen'> {
  const n = nombre.trim();
  const frase = giro ? `${n} · ${giro}` : n;
  const titulo = Array.from(frase).slice(0, LIMITE_TITULO).join('');
  const descripcion = giro
    ? `Conoce ${n}: ${giro.toLowerCase()} con atención cercana. Mira lo que ofrecemos, escríbenos y compra en línea.`
    : `Conoce ${n}. Mira lo que ofrecemos, escríbenos y compra en línea.`;
  return { titulo, descripcion: Array.from(descripcion).slice(0, LIMITE_DESCRIPCION).join(''), imagen: logo };
}

export interface ResumenMovilSeo {
  tituloDescripcion: { titulo: number; descripcion: number };
  imagenLista: boolean;
  redes: RedSeo[];
  verificado: boolean;
  calidad: { sinDescripcion: number; mejorables: number };
}

export function resumenSeo(v: ValoresSeo, verificado: boolean, paginas: readonly CalidadPagina[]): ResumenMovilSeo {
  return {
    tituloDescripcion: { titulo: estadoLongitud(v.titulo, LIMITE_TITULO).largo, descripcion: estadoLongitud(v.descripcion, LIMITE_DESCRIPCION).largo },
    imagenLista: !!v.imagen,
    redes: REDES_SEO.filter((r) => v.redes[r].trim() !== ''),
    verificado,
    calidad: {
      sinDescripcion: paginas.filter((p) => p.campos.descripcion === 'falta').length,
      mejorables: paginas.filter((p) => p.general !== 'bien').length,
    },
  };
}

/** Cuántos campos difieren entre dos estados del formulario (para «N cambios»). */
export function contarCambios(a: ValoresSeo & { verificacion: string; ocultar: boolean }, b: ValoresSeo & { verificacion: string; ocultar: boolean }): number {
  let n = 0;
  if (a.titulo.trim() !== b.titulo.trim()) n++;
  if (a.descripcion.trim() !== b.descripcion.trim()) n++;
  if ((a.imagen ?? '') !== (b.imagen ?? '')) n++;
  for (const r of REDES_SEO) if (a.redes[r].trim() !== b.redes[r].trim()) n++;
  if (a.verificacion.trim() !== b.verificacion.trim()) n++;
  if (a.ocultar !== b.ocultar) n++;
  return n;
}
