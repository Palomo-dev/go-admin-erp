/**
 * Lectura pura de lo que publica el sitio (Figma B/08-01, bloque de salud en
 * solo lectura, y «Probar eventos» de B/09-01): cuántas direcciones trae el
 * sitemap, qué bloquea robots.txt y si una página carga el ID de un píxel.
 * La descarga la hace el servidor (`/api/sitio-web/seo/salud` y
 * `/api/sitio-web/analitica/pixeles/[tipo]/prueba`) con el host resuelto en el
 * servidor, nunca uno que mande el navegador.
 */

export interface SaludSitemap {
  publicado: boolean;
  direcciones: number;
}

export function leerSitemap(estado: number, cuerpo: string): SaludSitemap {
  if (estado < 200 || estado >= 300) return { publicado: false, direcciones: 0 };
  const esXml = /<(urlset|sitemapindex)[\s>]/i.test(cuerpo);
  if (!esXml) return { publicado: false, direcciones: 0 };
  return { publicado: true, direcciones: (cuerpo.match(/<loc>/gi) ?? []).length };
}

export interface SaludRobots {
  publicado: boolean;
  /** `Disallow: /` para todos los agentes (o para Googlebot). */
  bloqueaTodo: boolean;
  /** Rutas bloqueadas para todos (`User-agent: *`), sin repetir. */
  rutasBloqueadas: string[];
}

export function leerRobots(estado: number, cuerpo: string): SaludRobots {
  if (estado < 200 || estado >= 300 || /<html[\s>]/i.test(cuerpo)) return { publicado: false, bloqueaTodo: false, rutasBloqueadas: [] };
  let agentes: string[] = [];
  let enReglas = false;
  const rutas = new Set<string>();
  let bloqueaTodo = false;
  for (const crudo of cuerpo.split(/\r?\n/)) {
    const linea = crudo.replace(/#.*/, '').trim();
    if (!linea) continue;
    const [campo, ...resto] = linea.split(':');
    const valor = resto.join(':').trim();
    const clave = campo.trim().toLowerCase();
    if (clave === 'user-agent') {
      if (enReglas) agentes = [];
      enReglas = false;
      agentes.push(valor.toLowerCase());
      continue;
    }
    enReglas = true;
    const aplica = agentes.includes('*') || agentes.includes('googlebot');
    if (clave === 'disallow' && aplica && valor) {
      if (valor === '/') bloqueaTodo = true;
      else if (agentes.includes('*')) rutas.add(valor.replace(/\*$/, '').replace(/\/$/, '') || valor);
    }
  }
  return { publicado: true, bloqueaTodo, rutasBloqueadas: Array.from(rutas) };
}

/** Respuesta de `GET /api/sitio-web/seo/salud`. */
export interface SaludSeoRespuesta {
  host: string | null;
  sitemap: SaludSitemap | null;
  robots: SaludRobots | null;
  revisadoEn: string;
}

export type TipoPixel = 'meta' | 'ga4' | 'tiktok' | 'gtm' | 'ads';
export const TIPOS_PIXEL: readonly TipoPixel[] = ['meta', 'ga4', 'tiktok', 'gtm', 'ads'];

/** Columna de `website_settings` de cada píxel. GA4 reutiliza `analytics_id`. */
export const COLUMNA_PIXEL: Record<TipoPixel, string> = {
  meta: 'meta_pixel_id',
  ga4: 'analytics_id',
  tiktok: 'tiktok_pixel_id',
  gtm: 'gtm_id',
  ads: 'google_ads_id',
};

/** Formato de cada ID (el mismo de los CHECK de la migración pendiente). */
export const FORMATO_PIXEL: Record<TipoPixel, RegExp> = {
  meta: /^[0-9]{8,20}$/,
  ga4: /^G-[A-Z0-9]{4,20}$/,
  tiktok: /^[A-Z0-9]{15,25}$/,
  gtm: /^GTM-[A-Z0-9]{4,12}$/,
  ads: /^AW-[0-9]{6,15}$/,
};

export function esTipoPixel(v: unknown): v is TipoPixel {
  return typeof v === 'string' && (TIPOS_PIXEL as readonly string[]).includes(v);
}

/** ID escrito → forma guardada (mayúsculas salvo Meta); `undefined` si no cumple el formato. */
export function normalizarIdPixel(tipo: TipoPixel, entrada: string): string | null | undefined {
  const v = entrada.trim();
  if (!v) return null;
  const id = tipo === 'meta' ? v.replace(/\s/g, '') : v.replace(/\s/g, '').toUpperCase();
  return FORMATO_PIXEL[tipo].test(id) ? id : undefined;
}

export interface EstadoPixel {
  id: string | null;
  /** `false` si la columna aún no existe en la base (migración pendiente). */
  disponible: boolean;
}

/** Respuesta de `GET/PUT /api/sitio-web/analitica/pixeles`. */
export type PixelesRespuesta = {
  pixeles: Record<TipoPixel, EstadoPixel>;
  puedeEditar: boolean;
  /**
   * El código propio (`custom_scripts`, Configuración › Código y píxeles) ya inicializa un píxel
   * de Meta. El sitio público (goadmin-websites, lib/seo/reglaPixeles.ts) NO pinta entonces el
   * Meta tipado encima, para no contar cada evento dos veces.
   */
  metaEnCodigo?: boolean;
};

/**
 * ¿El código propio inicializa un píxel de Meta? Misma expresión que `snippetConMeta` de
 * goadmin-websites/lib/seo/reglaPixeles.ts (repos separados: si cambia una, cambia la otra).
 */
export function snippetConMeta(customScripts: unknown): boolean {
  return typeof customScripts === 'string' && /fbq\s*\(\s*['"]init['"]/.test(customScripts);
}

/** Respuesta de `GET /api/sitio-web/analitica/pixeles/[tipo]/prueba`. */
export interface PruebaPixelRespuesta {
  host: string | null;
  id: string | null;
  resultado: 'encontrado' | 'no_encontrado' | 'sin_host' | 'sin_id' | 'sitio_no_responde';
}

/** «1234…7890»: el ID abreviado de la tarjeta (B/09-01). */
export function abreviarId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

/** ¿La página carga ese ID? Se busca el ID como palabra (no dentro de otro número). */
export function paginaCargaId(html: string, id: string): boolean {
  const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escapado}([^A-Za-z0-9]|$)`).test(html);
}

/** Descarga con tiempo límite (servidor). Nunca sigue a otro host. */
export async function descargar(url: string, ms = 5000): Promise<{ estado: number; cuerpo: string } | null> {
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), ms);
  try {
    const r = await fetch(url, { signal: control.signal, redirect: 'manual', cache: 'no-store', headers: { 'User-Agent': 'GOAdmin-SEO/1.0' } });
    const cuerpo = r.status >= 200 && r.status < 300 ? (await r.text()).slice(0, 2_000_000) : '';
    return { estado: r.status, cuerpo };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
