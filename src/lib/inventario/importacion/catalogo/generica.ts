/**
 * Cualquier otra tienda: sitemap de productos + datos estructurados de cada
 * ficha (JSON-LD schema.org `Product` / `ProductGroup`, y como respaldo las
 * etiquetas Open Graph `product:price:amount`). Sin IA y sin costo.
 *
 * Cubre las plataformas que no publican un catálogo JSON estable sin clave:
 * Tiendanube/Nuvemshop, Wix, Squarespace, BigCommerce, Jumpseller y PrestaShop
 * sin clave del webservice. Todas publican sitemap; la ficha trae JSON-LD
 * según la plantilla (si no lo trae, esa URL sale como «sin datos» y queda el
 * análisis con IA de una página).
 *
 * El sitemap se descubre por `robots.txt` y por las rutas habituales; si hay
 * sitemaps específicos de productos (`product-sitemap.xml`,
 * `store-products-sitemap.xml`, `sitemap_products_1.xml`,
 * `xmlsitemap.php?type=products`…) solo se leen esos.
 */

import type { ProductoWeb, VarianteWeb } from '../web';
import type { Conector, Lector } from './tipos';
import { MAX_URLS_SITEMAP } from './tipos';
import { absoluta, decodificarEntidades, esObjeto, htmlAPlano, lista, minimo, mismoSitio, numeroApi, parsearJson, texto } from './util';

const MAX_SITEMAPS = 25;
const RUTAS_SITEMAP = ['/sitemap.xml', '/sitemap_index.xml', '/product-sitemap.xml', '/store-products-sitemap.xml', '/xmlsitemap.php', '/1_index_sitemap.xml'];

const SITEMAP_PRODUCTOS = /(product|producto|produto|store-products|type=products|_products_|catalog)/i;
const URL_PRODUCTO = /(\/(product|products|producto|productos|produto|produtos|item|items|tienda|shop|store|p)\/[^/]+|\/[^/]+\/p\/?$|-p-?\d+|\/\d+-[a-z0-9-]+\.html$|\.html$)/i;
const URL_NO_PRODUCTO = /\/(blog|news|noticias|category|categoria|categorias|collections?|colecciones?|tag|etiqueta|page|pages|paginas?|cart|carrito|checkout|account|cuenta|login|search|buscar|contacto|contact|politica|terminos|legal)(\/|$)/i;

export function locsDeSitemap(xml: string): { sitemaps: string[]; urls: string[] } {
  const sitemaps: string[] = [];
  const urls: string[] = [];
  const bloque = /<(sitemap|url)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = bloque.exec(xml))) {
    const loc = m[2].match(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/i)?.[1];
    if (!loc) continue;
    (m[1].toLowerCase() === 'sitemap' ? sitemaps : urls).push(decodificarEntidades(loc.trim()));
  }
  return { sitemaps, urls };
}

export function pareceUrlProducto(url: string): boolean {
  try {
    const u = new URL(url);
    const ruta = u.pathname;
    if (ruta === '/' || URL_NO_PRODUCTO.test(ruta)) return false;
    return URL_PRODUCTO.test(ruta) || /[?&](id_product|product_id|productId)=/i.test(u.search);
  } catch {
    return false;
  }
}

export function sitemapsDeRobots(robots: string, origen: string): string[] {
  return robots
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*sitemap\s*:\s*(\S+)/i)?.[1])
    .map((u) => absoluta(u, origen))
    .filter((u): u is string => !!u);
}

/** URLs de producto del sitio (mismo dominio), hasta `MAX_URLS_SITEMAP`. */
export async function descubrirUrlsProducto(lector: Lector, origen: string): Promise<{ urls: string[]; sitemaps: number }> {
  const robots = await lector(`${origen}/robots.txt`);
  const declarados = robots && robots.status === 200 ? sitemapsDeRobots(robots.texto, origen) : [];
  const pendientes = Array.from(new Set([...declarados, ...RUTAS_SITEMAP.map((r) => `${origen}${r}`)]));
  const vistos = new Set<string>();
  const deProductos = new Set<string>();
  const genericas = new Set<string>();
  let leidos = 0;
  while (pendientes.length && leidos < MAX_SITEMAPS && deProductos.size < MAX_URLS_SITEMAP) {
    const actual = pendientes.shift()!;
    if (vistos.has(actual) || !mismoSitio(actual, origen)) continue;
    vistos.add(actual);
    const r = await lector(actual, { headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.5' } });
    if (!r || r.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(r.texto)) continue;
    leidos++;
    const { sitemaps, urls } = locsDeSitemap(r.texto);
    // En un índice, los de productos primero; si los hay, el resto sobra.
    const hijos = sitemaps.filter((s) => mismoSitio(s, origen));
    const deProd = hijos.filter((s) => SITEMAP_PRODUCTOS.test(s));
    pendientes.unshift(...(deProd.length ? deProd : hijos));
    if (deProd.length) pendientes.splice(deProd.length);
    const esDeProductos = SITEMAP_PRODUCTOS.test(actual);
    for (const u of urls) {
      if (!mismoSitio(u, origen)) continue;
      if (esDeProductos) deProductos.add(u);
      else if (pareceUrlProducto(u)) genericas.add(u);
    }
  }
  const urls = (deProductos.size ? Array.from(deProductos) : Array.from(genericas)).slice(0, MAX_URLS_SITEMAP);
  return { urls, sitemaps: leidos };
}

// ── JSON-LD ────────────────────────────────────────────────────────────────

const tiposDe = (n: Record<string, unknown>): string[] => (Array.isArray(n['@type']) ? n['@type'] : [n['@type']]).map((t) => String(t ?? '').replace(/^https?:\/\/schema\.org\//, ''));

export function nodosJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  const aplanar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(aplanar);
    else if (esObjeto(v)) {
      out.push(v);
      if (Array.isArray(v['@graph'])) v['@graph'].forEach(aplanar);
    }
  };
  while ((m = re.exec(html))) aplanar(parsearJson(m[1].trim()));
  return out;
}

function imagenesLd(v: unknown, base: string): string[] {
  const crudas = Array.isArray(v) ? v : [v];
  return crudas
    .map((x) => absoluta(esObjeto(x) ? x.url ?? x.contentUrl : x, base))
    .filter((s): s is string => !!s);
}

function ofertas(v: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const o of Array.isArray(v) ? v : [v]) {
    if (!esObjeto(o)) continue;
    out.push(o);
    if (o.offers) out.push(...ofertas(o.offers));
  }
  return out;
}

/** Precio de venta, precio anterior y disponibilidad de las ofertas. */
function precioLd(v: unknown): { precio?: number; comparacion?: number; disponible?: boolean } {
  const os = ofertas(v);
  const precio = minimo(os.flatMap((o) => [numeroApi(o.price), numeroApi(o.lowPrice), ...lista(o.priceSpecification).filter(esObjeto).filter((s) => !/list|strikethrough/i.test(String(s.priceType ?? ''))).map((s) => numeroApi(s.price))]));
  const especificaciones = os.flatMap((o) => (Array.isArray(o.priceSpecification) ? o.priceSpecification : [o.priceSpecification]).filter(esObjeto));
  const comparacion = minimo(especificaciones.filter((s) => /list|strikethrough/i.test(String(s.priceType ?? ''))).map((s) => numeroApi(s.price)));
  const disp = os.map((o) => String(o.availability ?? '')).filter(Boolean);
  return {
    precio,
    comparacion: comparacion && precio && comparacion > precio ? comparacion : undefined,
    disponible: disp.length ? disp.some((a) => /InStock|LimitedAvailability|PreOrder|OnlineOnly/i.test(a)) : undefined,
  };
}

const PROPIEDADES_VARIANTE: Record<string, string> = { color: 'Color', size: 'Talla', material: 'Material', pattern: 'Estampado' };

function opcionesLd(n: Record<string, unknown>, variesBy: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [prop, etiqueta] of Object.entries(PROPIEDADES_VARIANTE)) {
    const v = n[prop];
    const valor = texto(esObjeto(v) ? v.name : v, 100);
    if (valor && (variesBy.length === 0 || variesBy.includes(prop))) out[etiqueta] = valor;
  }
  for (const a of lista(n.additionalProperty).filter(esObjeto)) {
    const nombre = texto(a.name, 80);
    const valor = texto(a.value, 100);
    if (nombre && valor) out[nombre] = valor;
  }
  return out;
}

const gtin = (n: Record<string, unknown>) => texto(n.gtin13 ?? n.gtin ?? n.gtin12 ?? n.gtin14 ?? n.gtin8 ?? n.ean, 60);
const marca = (v: unknown) => texto(esObjeto(v) ? v.name : Array.isArray(v) ? (esObjeto(v[0]) ? v[0].name : v[0]) : v, 100);

function categoriaMigas(nodos: Record<string, unknown>[]): string | undefined {
  const migas = nodos.find((n) => tiposDe(n).includes('BreadcrumbList'));
  if (!migas) return undefined;
  const items = lista(migas.itemListElement)
    .filter(esObjeto)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((i) => texto(i.name ?? (esObjeto(i.item) ? i.item.name : undefined), 120))
    .filter((n): n is string => !!n && !/^(inicio|home|tienda|shop|productos?)$/i.test(n));
  // La última miga es el propio producto.
  return items.length >= 2 ? items[items.length - 2] : undefined;
}

function meta(html: string, propiedad: string): string | undefined {
  const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${propiedad}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1];
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${propiedad}["']`, 'i'))?.[1];
  const v = a ?? b;
  return v ? decodificarEntidades(v).trim() || undefined : undefined;
}

/** Producto de una ficha (JSON-LD o, de respaldo, Open Graph). `null` si la página no declara un producto. */
export function productoDesdeHtml(html: string, url: string): ProductoWeb | null {
  const nodos = nodosJsonLd(html);
  const grupo = nodos.find((n) => tiposDe(n).includes('ProductGroup'));
  const producto = grupo ?? nodos.find((n) => tiposDe(n).includes('Product'));
  const categoriaRuta = categoriaMigas(nodos);

  if (producto) {
    const nombre = texto(producto.name);
    if (!nombre) return null;
    const variesBy = lista(producto.variesBy).map((v) => String(v).replace(/^https?:\/\/schema\.org\//, '').toLowerCase());
    const hijos = lista(producto.hasVariant).filter(esObjeto);
    const detalle: VarianteWeb[] = hijos.map((h) => {
      const p = precioLd(h.offers);
      return {
        opciones: opcionesLd(h, variesBy),
        origen_id: texto(h['@id'] ?? h.sku, 200),
        sku: texto(h.sku, 100),
        barcode: gtin(h),
        price: p.precio,
        compare_price: p.comparacion,
        disponible: p.disponible,
        imagen: imagenesLd(h.image, url)[0],
      };
    });
    const conVariantes = detalle.some((v) => Object.keys(v.opciones).length > 0);
    const p = precioLd(producto.offers);
    const imagenes = imagenesLd(producto.image, url);
    const og = meta(html, 'og:image');
    return {
      name: nombre,
      description: htmlAPlano(producto.description),
      price: conVariantes ? minimo(detalle.map((v) => v.price)) ?? p.precio : p.precio,
      compare_price: conVariantes ? undefined : p.comparacion,
      sku: texto(producto.sku ?? producto.productGroupID ?? producto.mpn, 100),
      barcode: gtin(producto),
      brand: marca(producto.brand),
      category: texto(producto.category, 120)?.split(/\s*[>/|]\s*/).filter(Boolean).pop() ?? categoriaRuta,
      images: imagenes.length ? imagenes : og ? [absoluta(og, url)!].filter(Boolean) : [],
      url,
      origen_id: `url:${url}`,
      variantes_detalle: conVariantes ? detalle : undefined,
      disponible: conVariantes ? detalle.some((v) => v.disponible !== false) : p.disponible,
    };
  }

  // Respaldo: Open Graph de producto (Shopify, Tiendanube, BigCommerce lo publican).
  const precioOg = numeroApi(meta(html, 'product:price:amount') ?? meta(html, 'og:price:amount'));
  const tipoOg = meta(html, 'og:type');
  if (!precioOg && !/product/i.test(tipoOg ?? '')) return null;
  const nombre = texto(meta(html, 'og:title'));
  if (!nombre) return null;
  const imagen = absoluta(meta(html, 'og:image'), url);
  return {
    name: nombre,
    description: htmlAPlano(meta(html, 'og:description')),
    price: precioOg,
    images: imagen ? [imagen] : [],
    brand: texto(meta(html, 'product:brand'), 100),
    category: categoriaRuta,
    url,
    origen_id: `url:${url}`,
  };
}

/** Lectura genérica: el sondeo devuelve las URLs; las fichas se leen con `leerPaginasProducto`. */
export const conectorGenerico: Conector = {
  plataforma: 'generica',
  async sondear(lector, origen) {
    const { urls } = await descubrirUrlsProducto(lector, origen);
    if (urls.length === 0) return null;
    return { plataforma: 'generica', origen, total: urls.length, urlsProducto: urls, cursor: {}, avisos: urls.length >= MAX_URLS_SITEMAP ? ['catalogoTruncado', 'genericaFichas'] : ['genericaFichas'] };
  },
  async pagina() {
    // Las fichas se piden por URL (`leerPaginasProducto`): el cursor no aplica.
    return { productos: [], siguiente: null, avisos: [] };
  },
};

/** Lee las fichas (concurrencia limitada). Devuelve los productos y cuántas URLs no traían datos. */
export async function leerPaginasProducto(lector: Lector, urls: string[], concurrencia = 3): Promise<{ productos: ProductoWeb[]; sinDatos: string[] }> {
  const productos: ProductoWeb[] = [];
  const sinDatos: string[] = [];
  let i = 0;
  const trabajador = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      const r = await lector(url, { headers: { Accept: 'text/html,application/xhtml+xml' } });
      const p = r && r.status === 200 ? productoDesdeHtml(r.texto, r.url || url) : null;
      if (p) productos.push({ ...p, url, origen_id: `url:${url}` });
      else sinDatos.push(url);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrencia, urls.length) }, trabajador));
  // Mismo orden que las URLs (la concurrencia los desordena).
  const orden = new Map(urls.map((u, k) => [u, k]));
  productos.sort((a, b) => (orden.get(a.url ?? '') ?? 0) - (orden.get(b.url ?? '') ?? 0));
  return { productos, sinDatos };
}
