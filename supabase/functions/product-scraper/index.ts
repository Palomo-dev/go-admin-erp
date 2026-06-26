import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey);

const DEFAULT_UNIT_CODE = "UN";
const MAX_IMAGES_PER_PRODUCT = 8;
const MAX_VARIANT_CHILDREN = 50;

type DuplicateMode = "skip" | "update" | "create";

interface ScrapedProduct {
  name: string;
  description?: string;
  price?: number;
  compare_price?: number;
  cost?: number;
  sku?: string;
  barcode?: string;
  brand?: string;
  category?: string;
  tags?: string[];
  images?: string[];
  stock?: number;
  url?: string;
  variants?: { name: string; values: string[] }[];
}

function extractJsonLd(html: string): string[] {
  const results: string[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1]);
      const str = JSON.stringify(parsed);
      if (/Product|Offer|ItemList/i.test(str)) {
        results.push(str.substring(0, 20000));
      }
    } catch (_) { /* ignore */ }
  }
  return results;
}

// Extrae bloques JSON embebidos por frameworks SPA (Next.js __NEXT_DATA__, application/json)
// que suelen contener el catálogo aunque el HTML visible no lo tenga
function extractInlineJson(html: string): string[] {
  const results: string[] = [];
  const regex = /<script[^>]*(?:id=["']__NEXT_DATA__["']|type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const raw = m[1].trim();
    if (raw.length < 50) continue;
    if (/(price|product|name|sku|variant|image|title)/i.test(raw)) {
      results.push(raw.substring(0, 40000));
    }
    if (results.length >= 3) break;
  }
  return results;
}

// Convierte un precio en texto/número a entero, respetando el formato latinoamericano.
// "79900.00" -> 79900 | "79.902" -> 79902 | "1.299.900" -> 1299900 | "$799,50" -> 800
function parsePrice(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw > 0 ? Math.round(raw) : null;
  let s = String(raw).trim().replace(/[^\d.,]/g, "");
  if (!s) return null;
  // Si termina en separador + 1-2 dígitos, eso es decimal; el resto son miles
  const decMatch = s.match(/[.,](\d{1,2})$/);
  if (decMatch) {
    const sep = decMatch[0][0];
    const idx = s.lastIndexOf(sep);
    const intPart = s.slice(0, idx).replace(/[.,]/g, "");
    const val = Number(`${intPart}.${decMatch[1]}`);
    return val > 0 ? Math.round(val) : null;
  }
  // Si no hay decimales, los separadores son de miles -> eliminarlos
  const val = Number(s.replace(/[.,]/g, ""));
  return val > 0 ? Math.round(val) : null;
}

// Normaliza el campo "image" de JSON-LD (string | array | objetos {url})
function normalizeJsonLdImages(img: unknown, baseUrl: string): string[] {
  const out: string[] = [];
  const push = (u: unknown) => {
    if (typeof u === "string") {
      try {
        const abs = new URL(u, baseUrl).href;
        if (isProductImage(abs)) out.push(abs);
      } catch (_) { /* ignore */ }
    } else if (u && typeof u === "object" && typeof (u as any).url === "string") {
      push((u as any).url);
    }
  };
  if (Array.isArray(img)) img.forEach(push);
  else push(img);
  return out;
}

// Recorre recursivamente JSON-LD buscando nodos de tipo Product
function findProductNodes(node: any, acc: any[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((n) => findProductNodes(n, acc)); return; }
  const t = node["@type"];
  const isProduct = (typeof t === "string" && /product/i.test(t)) ||
    (Array.isArray(t) && t.some((x) => typeof x === "string" && /product/i.test(x)));
  if (isProduct) acc.push(node);
  if (node["@graph"]) findProductNodes(node["@graph"], acc);
}

interface DetailData {
  price?: number;
  compare_price?: number;
  images: string[];
  sku?: string;
  brand?: string;
  name?: string;
}

// Extrae de forma DETERMINISTA (sin IA) los datos estructurales del detalle de un producto.
// Fuentes: JSON-LD (Product/offers), meta og:image/price, y cross-check de precios Shopify (en centavos).
function parseProductDetail(html: string, baseUrl: string): DetailData {
  const data: DetailData = { images: [] };
  const productNodes: any[] = [];
  const ldRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = ldRegex.exec(html)) !== null) {
    try { findProductNodes(JSON.parse(m[1]), productNodes); } catch (_) { /* ignore */ }
  }
  for (const node of productNodes) {
    if (!data.name && typeof node.name === "string") data.name = node.name;
    if (!data.sku && (typeof node.sku === "string" || typeof node.sku === "number")) data.sku = String(node.sku);
    if (!data.brand) {
      const b = node.brand;
      if (typeof b === "string") data.brand = b;
      else if (b && typeof b === "object" && typeof b.name === "string") data.brand = b.name;
    }
    if (node.image) data.images.push(...normalizeJsonLdImages(node.image, baseUrl));
    const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
    if (offers && typeof offers === "object") {
      const p = parsePrice(offers.price ?? offers.lowPrice);
      if (p && !data.price) data.price = p;
      const hi = parsePrice(offers.highPrice);
      if (hi && !data.compare_price) data.compare_price = hi;
    }
  }

  // meta og:image como imagen principal
  const og = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i);
  if (og) {
    try {
      const abs = new URL(og[1], baseUrl).href;
      if (isProductImage(abs)) data.images.unshift(abs);
    } catch (_) { /* ignore */ }
  }
  // meta de precio (Open Graph / itemprop) como respaldo
  if (!data.price) {
    const mp = html.match(/<meta[^>]+(?:property|name)=["'](?:og:price:amount|product:price:amount)["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i);
    if (mp) data.price = parsePrice(mp[1]) || undefined;
  }

  // Cross-check Shopify: price/compare_at_price suelen venir en CENTAVOS en el JSON embebido.
  // Si los centavos/100 coinciden con el precio del JSON-LD, derivamos el compare_price con seguridad.
  const priceCents = html.match(/"price"\s*:\s*(\d{3,})/);
  const compareCents = html.match(/"compare_at_price"\s*:\s*(\d{3,})/);
  if (data.price && compareCents) {
    const cents = Number(compareCents[1]);
    if (priceCents && Math.round(Number(priceCents[1]) / 100) === data.price) {
      const comp = Math.round(cents / 100);
      if (comp > data.price) data.compare_price = comp;
    }
  }

  // dedupe imágenes conservando orden (principal primero)
  data.images = [...new Set(data.images)];
  return data;
}

// Patrones de imágenes que NO son fotos de producto (íconos, logos, placeholders, medios de pago, redes, etc.)
const IMAGE_BLOCKLIST = /(logo|icon|sprite|banner|flag|payment|favicon|placeholder|no[-_]?image|noimage|sin[-_]?imagen|default|blank|loader|loading|spinner|pixel|transparent|swatch|social|whatsapp|facebook|instagram|twitter|tiktok|youtube|visa|mastercard|amex|paypal|pse|addi|sistecredito|nequi|baloto|efecty|badge|sello|seal|garantia|envio|shipping|cintillo|empty|blur|skeleton)/i;
// Tamaños diminutos típicos de íconos (16x16 ... 64x64), no de fotos de producto
const IMAGE_TINY_SIZE = /[_\-\/](?:16|24|32|40|48|56|64)x(?:16|24|32|40|48|56|64)[_\-\/.]/;
// Enlaces que apuntan a la página de detalle de un producto (formato común en e-commerce)
const PRODUCT_LINK_RE = /\/(?:product|products|producto|productos|item|items|dp|sku|p)\//i;

function isProductImage(url: string): boolean {
  if (!url || url.startsWith("data:")) return false;
  if (IMAGE_BLOCKLIST.test(url)) return false;
  if (IMAGE_TINY_SIZE.test(url)) return false;
  return true;
}

// Obtiene la mejor URL de imagen de una etiqueta <img>, entendiendo lazy-load y srcset.
// Muchos sitios ponen un placeholder gris en src y la foto real en data-src/srcset.
function pickImgUrl(tag: string): string | null {
  const attr = (name: string): string | null => {
    const mm = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
    return mm ? mm[1] : null;
  };
  // Prioriza atributos de carga diferida (la foto real)
  let src = attr("data-src") || attr("data-lazy-src") || attr("data-original") || attr("data-image");
  if (!src) {
    const plain = attr("src");
    if (plain && !plain.startsWith("data:")) src = plain;
  }
  // srcset: tomar el último candidato (normalmente el de mayor resolución)
  if (!src) {
    const srcset = attr("data-srcset") || attr("srcset");
    if (srcset) {
      const parts = srcset.split(",").map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
      if (parts.length) src = parts[parts.length - 1];
    }
  }
  return src || null;
}

function extractImages(content: string, baseUrl: string): string[] {
  const imgs = new Set<string>();
  const tagRegex = /<img[^>]*>/gi;
  let m;
  while ((m = tagRegex.exec(content)) !== null) {
    const raw = pickImgUrl(m[0]);
    if (!raw) continue;
    try {
      const url = new URL(raw, baseUrl).href;
      if (/\.(jpg|jpeg|png|webp|avif)/i.test(url) && isProductImage(url)) {
        imgs.add(url);
      }
    } catch (_) { /* ignore */ }
  }
  const mdRegex = /https?:\/\/[^\s\)\]"']+\.(?:jpg|jpeg|png|webp|avif)[^\s\)\]"']*/gi;
  while ((m = mdRegex.exec(content)) !== null) {
    if (isProductImage(m[0])) {
      imgs.add(m[0]);
    }
  }
  return [...imgs].slice(0, 100);
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
  "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// Peso mínimo (bytes) para considerar una imagen como foto real y no un placeholder gris/1x1
const MIN_IMAGE_BYTES = 2500;

// Verifica que una URL devuelva REALMENTE una foto que carga (descarta rotas y placeholders grises)
async function urlIsImage(u: string): Promise<boolean> {
  // URLs con plantillas sin resolver nunca cargan
  if (/\{|\}/.test(u)) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Range": "bytes=0-0" },
      signal: ctrl.signal,
    });
    if (!res.ok && res.status !== 206) return false;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return false;
    // Tamaño total real: preferir Content-Range (bytes 0-0/TOTAL), si no Content-Length
    let total = 0;
    const range = res.headers.get("content-range");
    if (range) {
      const mm = range.match(/\/(\d+)\s*$/);
      if (mm) total = Number(mm[1]);
    }
    if (!total) total = Number(res.headers.get("content-length") || "0");
    // Si conocemos el tamaño y es minúsculo, es un placeholder gris -> descartar
    if (total > 0 && total < MIN_IMAGE_BYTES) return false;
    return true;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Igual que urlIsImage pero devuelve el tamaño total en bytes (0 si no es una imagen válida)
async function imageByteSize(u: string): Promise<number> {
  if (/\{|\}/.test(u)) return 0;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"], "Range": "bytes=0-0" },
      signal: ctrl.signal,
    });
    if (!res.ok && res.status !== 206) return 0;
    const ct = res.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return 0;
    let total = 0;
    const range = res.headers.get("content-range");
    if (range) {
      const mm = range.match(/\/(\d+)\s*$/);
      if (mm) total = Number(mm[1]);
    }
    if (!total) total = Number(res.headers.get("content-length") || "0");
    return total;
  } catch (_) {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

// Filtra una lista de imágenes dejando solo las que cargan (probando hasta `check` candidatas)
async function filterWorkingImages(urls: string[], max = 8, check = 8): Promise<string[]> {
  const candidates = urls.slice(0, check);
  const results = await Promise.all(
    candidates.map(async (u) => ((await urlIsImage(u)) ? u : null)),
  );
  return results.filter((u): u is string => !!u).slice(0, max);
}

// Valores placeholder que la IA a veces deja por error y no deben importarse
const PLACEHOLDER_VALUES = new Set(["null", "undefined", "texto", "valor", "...", "n/a", "na", "-"]);
function limpiarPlaceholder(v?: string): string | undefined {
  if (!v) return undefined;
  return PLACEHOLDER_VALUES.has(v.trim().toLowerCase()) ? undefined : v;
}
function sanitizeProduct(p: ScrapedProduct): ScrapedProduct {
  p.brand = limpiarPlaceholder(p.brand);
  p.category = limpiarPlaceholder(p.category);
  p.sku = limpiarPlaceholder(p.sku);
  return p;
}

// Valida las imágenes de todos los productos por lotes (concurrencia controlada)
async function validateProductsImages(products: ScrapedProduct[], max = 6, check = 10): Promise<ScrapedProduct[]> {
  const BATCH = 8;
  for (let i = 0; i < products.length; i += BATCH) {
    const slice = products.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (p) => {
        sanitizeProduct(p);
        if (p.images && p.images.length > 0) {
          p.images = await filterWorkingImages(p.images, max, check);
        }
      }),
    );
  }
  return products;
}

async function jinaRequest(url: string, useBrowser: boolean): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      "Accept": "text/plain",
      "X-With-Images-Summary": "true",
      "X-With-Links-Summary": "true",
    };
    // Motor de navegador real: más lento pero atraviesa sitios con JS pesado / anti-bots.
    // X-Timeout deja que el SPA termine de cargar el catálogo (XHR) antes de capturar.
    if (useBrowser) {
      headers["X-Engine"] = "browser";
      headers["X-Timeout"] = "30";
    }
    const res = await fetch(`https://r.jina.ai/${url}`, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200 ? text : null;
  } catch (_) {
    return null;
  }
}

// Heurística de "riqueza" de un render: cuántas señales de producto contiene (enlaces e imágenes)
function jinaRichness(text: string | null): number {
  if (!text) return 0;
  const links = (text.match(/\]\(https?:\/\//g) || []).length;
  const imgs = (text.match(/!\[/g) || []).length;
  return links + imgs + Math.floor(text.length / 4000);
}

async function fetchWithJina(url: string): Promise<string | null> {
  // Intento rápido (motor por defecto)
  const fast = await jinaRequest(url, false);
  // En SPAs el render rápido devuelve un "cascarón" (chrome + carrusel) con pocos productos.
  // Si tiene pocas señales de producto, forzamos el motor de navegador con espera de render
  // y nos quedamos con la fuente MÁS RICA de las dos.
  if (fast && jinaRichness(fast) >= 40) return fast;
  const browser = await jinaRequest(url, true);
  if (!browser) return fast;
  if (!fast) return browser;
  return jinaRichness(browser) >= jinaRichness(fast) ? browser : fast;
}

// Obtiene AMBAS fuentes en paralelo y las devuelve sin descartar ninguna,
// para poder extraer productos de la que más contenido aporte (HTML con JSON-LD o Jina con JS renderizado)
async function fetchSources(url: string): Promise<{ direct: string | null; jina: string | null }> {
  const [directResult, jinaResult] = await Promise.allSettled([
    fetch(url, { headers: BROWSER_HEADERS }).then(async (res) => {
      if (!res.ok) return null;
      const html = await res.text();
      if (html.length > 2000 && !/captcha|cf-challenge|access denied/i.test(html.substring(0, 3000))) {
        return html;
      }
      return null;
    }),
    fetchWithJina(url),
  ]);

  const direct = directResult.status === "fulfilled" ? directResult.value : null;
  const jina = jinaResult.status === "fulfilled" ? jinaResult.value : null;

  if (!direct && !jina) {
    throw new Error("No se pudo acceder a la página (bloqueo anti-bots o sitio caído). Intente con otra URL.");
  }
  return { direct, jina };
}

// ───────────────────────── CATÁLOGO NATIVO (sin IA) ─────────────────────────
// Cuando el sitio expone una API de catálogo (Shopify / VTEX), la usamos directamente:
// devuelve TODOS los productos con precio/imágenes/variantes EXACTOS y paginados.

// Decodifica las entidades HTML más comunes y numéricas
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// Convierte HTML de descripción a texto plano legible
function htmlToPlain(html: string, maxLen = 1200): string {
  const text = decodeEntities(
    (html || "")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|br)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
}

// Shopify: /collections/<handle>/products.json?limit=250&page=N (catálogo completo)
async function fetchShopifyCatalog(url: string): Promise<ScrapedProduct[] | null> {
  let origin = "", path = "";
  try {
    const u = new URL(url);
    origin = u.origin;
    path = u.pathname.replace(/\/$/, "");
  } catch (_) { return null; }

  // Base del endpoint: colección concreta o catálogo global
  const colMatch = path.match(/\/collections\/[^/]+/);
  const base = colMatch ? `${origin}${colMatch[0]}/products.json` : `${origin}/products.json`;

  const out: ScrapedProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    let data: any;
    try {
      const res = await fetch(`${base}?limit=250&page=${page}`, { headers: BROWSER_HEADERS });
      if (!res.ok) break;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) break;
      data = await res.json();
    } catch (_) { break; }
    const products: any[] = data?.products || [];
    if (products.length === 0) break;
    for (const p of products) {
      const variant = (p.variants && p.variants[0]) || {};
      const price = parsePrice(variant.price);
      const compare = parsePrice(variant.compare_at_price);
      const images: string[] = Array.isArray(p.images)
        ? p.images.map((im: any) => im?.src).filter((s: any): s is string => !!s)
        : [];
      const variants = (p.options || [])
        .filter((o: any) => o?.name && !/^title$/i.test(o.name) && !(o.values?.length === 1 && /default title/i.test(o.values[0])))
        .map((o: any) => ({ name: o.name, values: o.values || [] }));
      out.push({
        name: p.title,
        description: htmlToPlain(p.body_html || ""),
        price: price || undefined,
        compare_price: compare && price && compare > price ? compare : undefined,
        sku: variant.sku || undefined,
        brand: p.vendor || undefined,
        category: p.product_type || undefined,
        tags: Array.isArray(p.tags) ? p.tags.slice(0, 10) : undefined,
        images,
        variants: variants.length ? variants : undefined,
        url: `${origin}/products/${p.handle}`,
      });
    }
    if (products.length < 250) break;
  }
  return out.length ? out : null;
}

// VTEX: /api/catalog_system/pub/products/search/<path>?_from=F&_to=T (responde 206 + paginado)
async function fetchVtexCatalog(url: string): Promise<ScrapedProduct[] | null> {
  let origin = "", path = "";
  try {
    const u = new URL(url);
    origin = u.origin;
    path = u.pathname.replace(/^\/|\/$/g, "");
  } catch (_) { return null; }

  const out: ScrapedProduct[] = [];
  const STEP = 50;
  for (let from = 0; from < 2500; from += STEP) {
    const to = from + STEP - 1;
    const endpoint = `${origin}/api/catalog_system/pub/products/search/${path}?_from=${from}&_to=${to}`;
    let arr: any[];
    try {
      const res = await fetch(endpoint, { headers: { ...BROWSER_HEADERS, "Accept": "application/json" } });
      // VTEX devuelve 200 o 206 (rango parcial); cualquier otra cosa = no es VTEX o fin
      if (res.status !== 200 && res.status !== 206) break;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("json")) break;
      arr = await res.json();
    } catch (_) { break; }
    if (!Array.isArray(arr) || arr.length === 0) break;
    for (const p of arr) {
      const item = (p.items && p.items[0]) || {};
      const offer = (item.sellers && item.sellers[0]?.commertialOffer) || {};
      const price = parsePrice(offer.Price);
      const compare = parsePrice(offer.ListPrice);
      const images: string[] = Array.isArray(item.images)
        ? item.images.map((im: any) => im?.imageUrl).filter((s: any): s is string => !!s)
        : [];
      out.push({
        name: p.productName,
        description: htmlToPlain(p.description || p.metaTagDescription || ""),
        price: price || undefined,
        compare_price: compare && price && compare > price ? compare : undefined,
        sku: item.itemId || p.productReference || undefined,
        brand: p.brand || undefined,
        category: Array.isArray(p.categories) && p.categories[0]
          ? p.categories[0].split("/").filter(Boolean).pop()
          : undefined,
        images,
        url: p.link || undefined,
      });
    }
    if (arr.length < STEP) break;
  }
  return out.length ? out : null;
}

// ── Algolia (común en SAP Commerce y muchos retailers): el listado se sirve por su API ──
interface AlgoliaCfg { appId: string; apiKey: string; indexName: string; categoryAttribute: string }

// Extrae las credenciales públicas de Algolia embebidas en el HTML de la página
function extractAlgoliaConfig(html: string): AlgoliaCfg | null {
  const pick = (key: string) =>
    html.match(new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']{3,80})["']`, "i"))?.[1];
  const appId = pick("appId") || pick("applicationId");
  // La apiKey de Algolia es un hash hex de 32 chars. Hay que evitar capturar otras claves del HTML
  // (p. ej. la de Google/Firebase "AIzaSy..."), que suelen aparecer antes en la página.
  const pickAlgoliaKey = (): string | undefined => {
    const hex = html.match(/(?:api[_-]?key|searchApiKey)["']?\s*:\s*["']([a-f0-9]{32})["']/i)?.[1];
    if (hex) return hex;
    const re = /(?:api[_-]?key|searchApiKey)["']?\s*:\s*["']([^"']{16,80})["']/ig;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      if (!/^AIza/i.test(m[1])) return m[1];
    }
    return undefined;
  };
  const apiKey = pickAlgoliaKey();
  const indexName = pick("indexName");
  if (!appId || !apiKey || !indexName) return null;
  const categoryAttribute = pick("categoryAttribute") || "hierarchicalcategory_string_mv.lvl0";
  return { appId, apiKey, indexName, categoryAttribute };
}

// Limpia un título de categoría: quita prefijos comerciales ("Compra un...") y el nombre del sitio tras "|" o "-"
function cleanCategoryTitle(raw: string): string {
  return decodeEntities(raw)
    .replace(/\s*[|\u00bb].*$/s, "")
    .replace(/^\s*compra(?:r)?\s+(?:un[ao]?|el|la|los|las|tu[s]?)?\s*/i, "")
    .trim();
}

// Nombre de la categoría: JSON-LD (@type Category), og:title, <h1> o <title> (en ese orden de fiabilidad)
function extractCategoryName(html: string): string | null {
  const ld = html.match(/@type"\s*:\s*"Category"[\s\S]{0,160}?"name"\s*:\s*"([^"]+)"/i)?.[1];
  if (ld && ld.trim()) return cleanCategoryTitle(ld);
  const og = html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/i)?.[1];
  if (og && og.trim()) return cleanCategoryTitle(og);
  const h1 = html.match(/<h1[^>]*>\s*([^<]{2,80})\s*</i)?.[1];
  if (h1 && h1.trim()) return cleanCategoryTitle(h1);
  const title = html.match(/<title[^>]*>\s*([^<]{2,120})\s*<\/title>/i)?.[1];
  if (title && title.trim()) return cleanCategoryTitle(title);
  return null;
}

// Plantilla de imagen del sitio (p. ej. .../products/{code}/{code}-001.webp) para derivar por objectID
function extractImageTemplate(html: string): ((code: string) => string) | null {
  const m = html.match(/(https?:\/\/[^"'\\\s]+\/products\/)\d+\/\d+(-0*1)?\.(webp|jpg|jpeg|png)/i);
  if (!m) return null;
  // El JSON-LD a veces concatena dos URLs (https://dominiohttps://cdn...): tomamos el último esquema válido
  let base = m[1];
  const lastScheme = Math.max(base.lastIndexOf("https://"), base.lastIndexOf("http://"));
  if (lastScheme > 0) base = base.slice(lastScheme);
  const suffix = m[2] || "-001";
  const ext = m[3];
  return (code: string) => `${base}${code}/${code}${suffix}.${ext}`;
}

// Plantilla parametrizada por índice (1..N) para derivar TODA la galería: {code}-001, {code}-002, ...
function extractGalleryTemplate(html: string): ((code: string, n: number) => string) | null {
  const m = html.match(/(https?:\/\/[^"'\\\s]+\/products\/)\d+\/\d+-0*\d+\.(webp|jpg|jpeg|png)/i)
    || html.match(/(https?:\/\/[^"'\\\s]+\/products\/)\d+\/\d+\.(webp|jpg|jpeg|png)/i);
  if (!m) return null;
  let base = m[1];
  const lastScheme = Math.max(base.lastIndexOf("https://"), base.lastIndexOf("http://"));
  if (lastScheme > 0) base = base.slice(lastScheme);
  const ext = m[2];
  return (code: string, n: number) => `${base}${code}/${code}-${String(n).padStart(3, "0")}.${ext}`;
}

// Deriva la galería real desde la plantilla por código. El CDN sirve un placeholder de tamaño
// CONSTANTE para los índices inexistentes, así que descartamos los tamaños que se repiten.
async function deriveGallery(
  galleryFor: (code: string, n: number) => string,
  code: string,
  candidates = 10,
  keep = 6,
): Promise<string[]> {
  const urls = Array.from({ length: candidates }, (_, i) => galleryFor(code, i + 1));
  const sizes = await Promise.all(urls.map((u) => imageByteSize(u)));
  const count = new Map<number, number>();
  for (const s of sizes) if (s >= MIN_IMAGE_BYTES) count.set(s, (count.get(s) || 0) + 1);
  const result: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const s = sizes[i];
    if (s < MIN_IMAGE_BYTES) continue;
    if ((count.get(s) || 0) >= 2) continue; // tamaño repetido = placeholder "sin imagen" del CDN
    result.push(urls[i]);
    if (result.length >= keep) break;
  }
  return result;
}

async function algoliaQuery(cfg: AlgoliaCfg, params: string): Promise<any | null> {
  try {
    const res = await fetch(`https://${cfg.appId}-dsn.algolia.net/1/indexes/${cfg.indexName}/query`, {
      method: "POST",
      headers: {
        "X-Algolia-API-Key": cfg.apiKey,
        "X-Algolia-Application-Id": cfg.appId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ params }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

// Resuelve el facetFilter jerárquico (atributo + valor) cuyo último segmento coincide con la categoría
async function resolveAlgoliaCategory(cfg: AlgoliaCfg, categoryName: string): Promise<string | null> {
  const baseAttr = cfg.categoryAttribute.replace(/\.lvl\d+$/i, "");
  const levels = [`${baseAttr}.lvl2`, `${baseAttr}.lvl1`, `${baseAttr}.lvl0`];
  const facetsParam = encodeURIComponent(JSON.stringify(levels));
  const data = await algoliaQuery(cfg, `hitsPerPage=0&maxValuesPerFacet=1000&facets=${facetsParam}&query=`);
  const facets = data?.facets;
  if (!facets) return null;
  const target = categoryName.trim().toLowerCase();
  for (const attr of levels) {
    const values = facets[attr];
    if (!values) continue;
    for (const value of Object.keys(values)) {
      const last = value.split(">").pop()?.trim().toLowerCase();
      if (last === target) return `${attr}:${value}`;
    }
  }
  return null;
}

// Conector Algolia: trae el catálogo COMPLETO de la categoría, paginado y exacto, sin IA.
async function fetchAlgoliaCatalog(url: string): Promise<ScrapedProduct[] | null> {
  let html = "";
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;
    html = await res.text();
  } catch (_) { return null; }

  const cfg = extractAlgoliaConfig(html);
  if (!cfg) return null;
  const categoryName = extractCategoryName(html);
  if (!categoryName) return null;
  const facetFilter = await resolveAlgoliaCategory(cfg, categoryName);
  if (!facetFilter) return null;

  const imageFor = extractImageTemplate(html);
  const galleryFor = extractGalleryTemplate(html);
  let origin = "";
  try { origin = new URL(url).origin; } catch (_) { /* noop */ }
  const ff = encodeURIComponent(JSON.stringify([[facetFilter]]));
  const attrs = encodeURIComponent(JSON.stringify([
    "name_text_es", "pricevalue_cop_double", "discountprice_double",
    "url_es_string", "objectID", "brand_string_mv", "description_text_es",
    "keyfeatures_string_mv", "color_string_mv", "variantdescriptor_string",
  ]));

  const out: ScrapedProduct[] = [];
  const PAGE_SIZE = 200;
  for (let page = 0; page < 13; page++) {
    const data = await algoliaQuery(
      cfg,
      `hitsPerPage=${PAGE_SIZE}&page=${page}&facetFilters=${ff}&attributesToRetrieve=${attrs}&query=`,
    );
    const hits: any[] = data?.hits || [];
    if (hits.length === 0) break;
    for (const h of hits) {
      const venta = h.discountprice_double && h.discountprice_double > 0
        ? h.discountprice_double : h.pricevalue_cop_double;
      const price = parsePrice(venta);
      const compare = parsePrice(h.pricevalue_cop_double);
      const code = h.objectID ? String(h.objectID) : "";
      const brand = Array.isArray(h.brand_string_mv) ? h.brand_string_mv[0] : h.brand_string_mv;
      const rel = h.url_es_string || "";
      // Descripción: características clave del índice (quitando el prefijo "N=") + color/tamaño
      const features: string[] = Array.isArray(h.keyfeatures_string_mv)
        ? h.keyfeatures_string_mv.map((f: any) => String(f).replace(/^\s*\d+\s*=\s*/, "").trim()).filter(Boolean)
        : [];
      const colors: string[] = Array.isArray(h.color_string_mv)
        ? h.color_string_mv.map((c: any) => String(c).trim()).filter(Boolean) : [];
      const descParts: string[] = [];
      if (h.description_text_es) descParts.push(htmlToPlain(h.description_text_es));
      if (features.length) descParts.push(features.join(". "));
      if (colors.length) descParts.push(`Color: ${colors.join(", ")}`);
      if (typeof h.variantdescriptor_string === "string" && h.variantdescriptor_string.includes(":")) {
        const idx = h.variantdescriptor_string.indexOf(":");
        const lbl = h.variantdescriptor_string.slice(0, idx).trim();
        const val = h.variantdescriptor_string.slice(idx + 1).trim();
        if (lbl && val) descParts.push(`${lbl.charAt(0).toUpperCase()}${lbl.slice(1)}: ${val}`);
      }
      const description = descParts.join(". ").replace(/\s*\.\s*\.+/g, ".").trim() || undefined;
      out.push({
        name: h.name_text_es,
        description,
        price: price || undefined,
        compare_price: compare && price && compare > price ? compare : undefined,
        sku: code || undefined,
        brand: brand || undefined,
        category: categoryName,
        // Solo creamos variantes cuando hay varios valores reales (evita hijos espurios de 1 sola opción)
        variants: colors.length > 1 ? [{ name: "Color", values: colors }] : undefined,
        images: imageFor && code ? [imageFor(code)] : [],
        url: rel ? (rel.startsWith("http") ? rel : `${origin}${rel}`) : undefined,
      });
    }
    const nbPages = data?.nbPages ?? 1;
    if (page + 1 >= nbPages) break;
  }

  // Galería completa: derivar y validar por lotes (sin IA) cuando la plataforma usa plantilla por código
  if (galleryFor) {
    const BATCH = 12;
    for (let i = 0; i < out.length; i += BATCH) {
      await Promise.all(out.slice(i, i + BATCH).map(async (p) => {
        if (!p.sku) return;
        const imgs = await deriveGallery(galleryFor, p.sku);
        if (imgs.length) p.images = imgs;
      }));
    }
  }
  return out.length ? out : null;
}

// Intenta obtener el catálogo desde la API nativa de la plataforma (Shopify / VTEX / Algolia).
// Devuelve null si el sitio no expone ninguna conocida (se usa entonces el scraping con IA).
async function fetchNativeCatalog(url: string): Promise<ScrapedProduct[] | null> {
  const shopify = await fetchShopifyCatalog(url);
  if (shopify && shopify.length) return shopify;
  const vtex = await fetchVtexCatalog(url);
  if (vtex && vtex.length) return vtex;
  const algolia = await fetchAlgoliaCatalog(url);
  if (algolia && algolia.length) return algolia;
  return null;
}

async function callOpenAI(prompt: string): Promise<any> {
  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 16000,
      response_format: { type: "json_object" },
    }),
  });
  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`Error de OpenAI: ${errText.substring(0, 200)}`);
  }
  const aiData = await aiRes.json();
  return JSON.parse(aiData.choices?.[0]?.message?.content || "{}");
}

function buildContext(content: string, isMarkdown: boolean, maxChars = 60000, baseUrl = ""): string {
  if (isMarkdown) {
    return `CONTENIDO DE LA PÁGINA (markdown):\n${content.substring(0, maxChars)}`;
  }
  const jsonLd = extractJsonLd(content);
  const cleaned = htmlToStructuredText(content, baseUrl).substring(0, maxChars);
  return jsonLd.length > 0
    ? `DATOS ESTRUCTURADOS JSON-LD:\n${jsonLd.join("\n").substring(0, 20000)}\n\nTEXTO DE LA PÁGINA (con marcadores [IMG:url]):\n${cleaned.substring(0, maxChars - 20000)}`
    : `TEXTO DE LA PÁGINA (con marcadores [IMG:url]):\n${cleaned}`;
}

// Convierte HTML a texto CONSERVANDO la imagen y el enlace de cada producto en línea,
// para que la IA asocie correctamente nombre↔precio↔imagen↔URL. Genérico para cualquier sitio.
function htmlToStructuredText(html: string, baseUrl: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // NO eliminar el contenido de <noscript>: ahí suele estar la imagen REAL
    // de los productos con carga diferida (lazy-load). Solo quitamos las etiquetas.
    .replace(/<\/?noscript[^>]*>/gi, " ");

  // Imagen de producto en línea: [IMG:url] (entiende lazy-load/srcset; descarta logos/íconos/placeholders)
  s = s.replace(/<img[^>]*>/gi, (tag) => {
    const raw = pickImgUrl(tag);
    if (!raw) return " ";
    try {
      const abs = new URL(raw, baseUrl).href;
      return isProductImage(abs) ? ` [IMG:${abs}] ` : " ";
    } catch (_) {
      return " ";
    }
  });

  // Enlace en línea: SOLO enlaces de detalle de producto (evita inflar con menús/footer)
  s = s.replace(/<a[^>]*?href=["']([^"']+)["'][^>]*>/gi, (_m, href) => {
    try {
      const abs = new URL(href, baseUrl).href;
      return PRODUCT_LINK_RE.test(abs) ? ` (LINK:${abs}) ` : " ";
    } catch (_) {
      return " ";
    }
  });

  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Texto de la página, listo para trocear (conserva imágenes/enlaces en HTML)
function getCleanedText(content: string, isMarkdown: boolean, baseUrl = ""): string {
  if (isMarkdown) return content;
  return htmlToStructuredText(content, baseUrl);
}

// Divide una cadena en trozos con solapamiento, para no cortar tarjetas de producto a la mitad
function chunkString(str: string, size: number, maxChunks: number, overlap = 0): string[] {
  const chunks: string[] = [];
  const step = Math.max(1, size - overlap);
  for (let i = 0; i < str.length && chunks.length < maxChunks; i += step) {
    chunks.push(str.substring(i, i + size));
  }
  return chunks;
}

// Tokeniza un texto en palabras significativas (sin tildes, sin palabras cortas)
function tokenizar(s: string): Set<string> {
  return new Set(
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

// B: recolecta todas las URLs de detalle de producto presentes en el contenido (HTML o markdown)
function collectDetailUrls(content: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const add = (raw: string) => {
    try {
      const abs = new URL(raw, baseUrl).href.split("?")[0].replace(/\/$/, "");
      if (PRODUCT_LINK_RE.test(abs)) urls.add(abs);
    } catch (_) { /* ignore */ }
  };
  let m: RegExpExecArray | null;
  const hrefRe = /href=["']([^"']+)["']/gi;
  while ((m = hrefRe.exec(content)) !== null) add(m[1]);
  const mdRe = /\]\((https?:\/\/[^\s)]+)\)/gi;
  while ((m = mdRe.exec(content)) !== null) add(m[1]);
  return [...urls];
}

// B: asigna una URL de detalle a los productos que no la tienen, por coincidencia nombre↔slug
function assignMissingUrls(products: ScrapedProduct[], urls: string[]): void {
  if (urls.length === 0) return;
  const urlTokens = urls.map((u) => {
    const seg = u.split("/").filter(Boolean).pop() || "";
    return { url: u, tokens: tokenizar(seg.replace(/[-_]+/g, " ")) };
  });
  for (const p of products) {
    if (p.url || !p.name) continue;
    const nameTokens = tokenizar(p.name);
    if (nameTokens.size === 0) continue;
    let best: string | null = null;
    let bestScore = 0;
    for (const { url, tokens } of urlTokens) {
      if (tokens.size === 0) continue;
      let comunes = 0;
      nameTokens.forEach((t) => { if (tokens.has(t)) comunes += 1; });
      const score = comunes / Math.min(nameTokens.size, tokens.size);
      if (score > bestScore) { bestScore = score; best = url; }
    }
    if (best && bestScore >= 0.5) p.url = best;
  }
}

function productKey(p: ScrapedProduct): string {
  const u = (p.url || "").toLowerCase().trim();
  if (u) return u.split("?")[0].replace(/\/$/, "");
  return (p.name || "").toLowerCase().trim().replace(/\s+/g, " ");
}

// Fusiona productos duplicados (mismo producto visto en varias fuentes o fragmentos)
// combinando los mejores datos: conserva imágenes y precios de la fuente que sí los tenga.
function mergeProducts(products: ScrapedProduct[]): ScrapedProduct[] {
  const map = new Map<string, ScrapedProduct>();
  for (const p of products) {
    if (!p?.name) continue;
    const key = productKey(p);
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...p });
      continue;
    }
    // Imágenes: quedarse con la lista más completa
    if ((p.images?.length || 0) > (cur.images?.length || 0)) cur.images = p.images;
    // Precio: preferir un valor positivo
    if (!(cur.price && cur.price > 0) && p.price && p.price > 0) cur.price = p.price;
    if (!(cur.compare_price && cur.compare_price > 0) && p.compare_price && p.compare_price > 0) cur.compare_price = p.compare_price;
    if (!cur.url && p.url) cur.url = p.url;
    if (!cur.brand && p.brand) cur.brand = p.brand;
    if (!cur.category && p.category) cur.category = p.category;
    if ((p.variants?.length || 0) > (cur.variants?.length || 0)) cur.variants = p.variants;
    if ((p.name?.length || 0) > (cur.name?.length || 0)) cur.name = p.name;
  }
  return [...map.values()].map(normalizePrices).slice(0, 150);
}

// El precio de comparación SIEMPRE debe ser el mayor (precio anterior/tachado).
// Si la IA los invirtió, se corrigen; si son iguales, se elimina compare_price.
function normalizePrices(p: ScrapedProduct): ScrapedProduct {
  if (p.price && p.compare_price && p.price > 0 && p.compare_price > 0) {
    if (p.compare_price < p.price) {
      const menor = p.compare_price;
      p.compare_price = p.price;
      p.price = menor;
    } else if (p.compare_price === p.price) {
      p.compare_price = undefined;
    }
  }
  return p;
}

// Extrae productos de un único trozo de contexto
async function extractChunk(context: string, url: string, imgList: string): Promise<ScrapedProduct[]> {
  const prompt = `Extrae TODOS los productos de esta página e-commerce: ${url}

${context}

IMÁGENES DISPONIBLES:
${imgList}

JSON con formato (los valores aquí son SOLO ejemplos de estructura, NO los copies):
{"products":[{"name":"texto","price":null,"compare_price":null,"brand":"texto","category":"texto","images":["url"],"url":"url-detalle","variants":[{"name":"Color","values":["valor"]}]}]}

El CONTENIDO incluye marcadores en línea junto a cada producto:
- [IMG:url] = imagen que aparece junto a ese producto en la página.
- (LINK:url) = enlace de detalle que aparece junto a ese producto.

Reglas CRÍTICAS sobre precios:
- Cada producto tiene su PROPIO precio que aparece junto a su nombre en el texto. Toma EXACTAMENTE ese número.
- NUNCA copies el precio de otro producto ni inventes un número. PROHIBIDO usar los números del ejemplo de arriba.
- Si NO encuentras el precio real de un producto, pon price: null y compare_price: null. Es mejor null que un número inventado.
- FORMATO DE PRECIO (Colombia/Latinoamérica): el punto "." y la coma "," son separadores de MILES, NO decimales. Los precios NO tienen decimales.
  Conserva TODOS los dígitos eliminando puntos y comas. Ejemplos: "$119.900" → 119900, "1.299.900" → 1299900, "79.902" → 79902, "$199.947" → 199947.
  NUNCA recortes dígitos: "119.900" son 119900, no 119.
- price = precio de VENTA actual (el menor si hay precio tachado). compare_price = precio anterior/tachado (mayor).

Otras reglas:
- Extrae TODOS los productos presentes en este fragmento, hasta 100. No omitas ninguno.
- images: usa los [IMG:url] que aparecen JUNTO a cada producto (asócialos por cercanía). Incluye TODAS las imágenes cercanas a ese producto, no solo una. Si no hay [IMG:...] cercano, usa de IMÁGENES DISPONIBLES la que corresponda. NUNCA logos, íconos, banners, medios de pago, placeholders ni grises.
- url: usa el (LINK:url) más cercano al producto (enlace ABSOLUTO a su detalle). Es clave para no mezclar datos.
- brand: marca mostrada. category: categoría corta en español.
- Si no hay un dato, pon null u omítelo.
- description: NO la incluyas en este paso (se obtiene después).
- Si el fragmento no contiene productos, devuelve {"products":[]}`;

  try {
    const parsed = await callOpenAI(prompt);
    return parsed.products || [];
  } catch (_) {
    return [];
  }
}

// Procesa TODO el contenido troceándolo en varios fragmentos (en paralelo) y fusiona resultados
async function extractProductsFromContent(content: string, url: string, isMarkdown: boolean): Promise<ScrapedProduct[]> {
  const images = extractImages(content, url);
  const imgList = images.slice(0, 80).join("\n");
  const jsonLd = isMarkdown ? [] : extractJsonLd(content);
  const inlineJson = isMarkdown ? [] : extractInlineJson(content);
  const text = getCleanedText(content, isMarkdown, url);

  const CHUNK_SIZE = 45000;
  const OVERLAP = 6000; // solapamiento para no cortar tarjetas de producto
  const MAX_CHUNKS = 10;
  const chunks = chunkString(text, CHUNK_SIZE, MAX_CHUNKS, OVERLAP);

  const tasks: Promise<ScrapedProduct[]>[] = chunks.map((chunk, i) => {
    const context = `CONTENIDO (${isMarkdown ? "markdown" : "texto"}) parte ${i + 1}/${chunks.length}:\n${chunk}`;
    return extractChunk(context, url, imgList);
  });

  // Llamada DEDICADA a los datos estructurados completos (JSON-LD / SPA), troceados aparte.
  // Son la fuente más fiable de precio + imagen por producto y NO deben truncarse junto al texto.
  const structuredBlobs = [...jsonLd, ...inlineJson];
  if (structuredBlobs.length > 0) {
    const structuredText = structuredBlobs.join("\n");
    const structuredChunks = chunkString(structuredText, CHUNK_SIZE, 3, OVERLAP);
    for (let i = 0; i < structuredChunks.length; i++) {
      const context = `DATOS ESTRUCTURADOS (JSON-LD / SPA) parte ${i + 1}/${structuredChunks.length} — contienen los productos con precio e imagen:\n${structuredChunks[i]}`;
      tasks.push(extractChunk(context, url, imgList));
    }
  }

  const results = await Promise.all(tasks);
  return mergeProducts(results.flat());
}

// Obtiene productos de AMBAS fuentes (HTML directo y Jina) y FUSIONA la unión.
// Así el conteo es estable entre intentos y las imágenes/precios provienen de la fuente que sí los tenga.
async function extractWithAI(direct: string | null, jina: string | null, url: string): Promise<ScrapedProduct[]> {
  const sources: { content: string; isMarkdown: boolean }[] = [];
  if (jina && jina.length > 500) sources.push({ content: jina, isMarkdown: true });
  if (direct && direct.length > 1000) sources.push({ content: direct, isMarkdown: false });
  if (sources.length === 0) return [];

  const all = await Promise.all(
    sources.map((s) => extractProductsFromContent(s.content, url, s.isMarkdown))
  );
  const merged = mergeProducts(all.flat());
  // B: asegurar URL de detalle para los productos que no la captaron (por similitud nombre↔slug),
  // así TODOS pasan por el enriquecimiento determinista.
  const detailUrls = sources.flatMap((s) => collectDetailUrls(s.content, url));
  assignMissingUrls(merged, [...new Set(detailUrls)]);
  // Validar que las imágenes carguen de verdad: descarta URLs rotas/placeholders (grises)
  return await validateProductsImages(merged);
}

async function enrichProduct(url: string): Promise<ScrapedProduct | null> {
  // Para detalle de producto, fetch directo es suficiente y más rápido
  let content: string;
  let isMarkdown = false;
  try {
    const res = await fetch(url, { headers: BROWSER_HEADERS });
    if (res.ok) {
      const html = await res.text();
      if (html.length > 2000 && !/captcha|cf-challenge/i.test(html.substring(0, 3000))) {
        content = html;
      } else {
        const jina = await fetchWithJina(url);
        if (!jina) throw new Error("No content");
        content = jina;
        isMarkdown = true;
      }
    } else {
      const jina = await fetchWithJina(url);
      if (!jina) throw new Error("No content");
      content = jina;
      isMarkdown = true;
    }
  } catch (_) {
    const jina = await fetchWithJina(url);
    if (!jina) return null;
    content = jina;
    isMarkdown = true;
  }

  // Si la página vino casi vacía (bloqueo/redirección), no enriquecer para evitar datos inventados
  const cleanedLen = getCleanedText(content, isMarkdown, url).length;
  if (cleanedLen < 400) return null;

  const images = extractImages(content, url);
  const context = buildContext(content, isMarkdown, 40000, url);
  const imgList = images.slice(0, 30).join("\n");

  const prompt = `Extrae los datos del producto en: ${url}

${context}

IMÁGENES:
${imgList}

JSON (los valores son SOLO ejemplos de estructura, NO los copies):
{"product":{"name":"texto","description":"texto","price":null,"compare_price":null,"sku":"texto","brand":"texto","category":"texto","tags":["texto"],"images":["url"],"variants":[{"name":"Color","values":["valor"]}]}}

Reglas:
- description: completa con materiales, tecnología, beneficios (3-4 oraciones)
- images: TODAS las fotos REALES del producto que encuentres (incluye las de [IMG:url], hasta 10). Más imágenes es mejor. NUNCA logos, íconos, banners, medios de pago, placeholders ni grises.
- variants: todas las opciones reales (color, talla, capacidad...)
- sku: código/referencia real si aparece
- price/compare_price: toma EXACTAMENTE los números reales de esta página. NUNCA inventes ni uses los del ejemplo. Si no aparece, pon null (nunca 0). compare_price debe ser el precio anterior/mayor.
- FORMATO DE PRECIO (Colombia): el punto y la coma son separadores de MILES, NO decimales; los precios NO tienen decimales. Conserva TODOS los dígitos quitando puntos/comas. Ejemplos: "$119.900" → 119900, "1.299.900" → 1299900. NUNCA recortes dígitos.
- Pon null en los campos sin dato real`;

  const parsed = await callOpenAI(prompt);
  if (!parsed.product) return null;
  const prod = sanitizeProduct(parsed.product);

  // A: datos DETERMINISTAS del detalle (JSON-LD/meta) tienen prioridad sobre lo que infiere la IA
  const detail: DetailData = isMarkdown ? { images: [] } : parseProductDetail(content, url);
  if (detail.price) prod.price = detail.price;
  if (detail.compare_price) prod.compare_price = detail.compare_price;
  if (detail.sku && !prod.sku) prod.sku = detail.sku;
  if (detail.brand && !prod.brand) prod.brand = detail.brand;

  // C: si aún no hay precio, último recurso por regex sobre el texto del detalle
  if (!prod.price || prod.price <= 0) {
    const fallback = regexPriceFromText(getCleanedText(content, isMarkdown, url));
    if (fallback) prod.price = fallback;
  }

  // D: galería con imagen principal (og:image / JSON-LD) primero, luego las que halló la IA
  const galeria = [...detail.images, ...(prod.images || [])];
  const candidatas = [...new Set(galeria)];
  prod.images = candidatas.length > 0 ? await filterWorkingImages(candidatas, 10, 14) : prod.images;

  return normalizePrices(prod);
}

// C: extrae un precio del texto como último recurso (montos con $ o COP). Devuelve el menor mostrado (precio de venta).
function regexPriceFromText(text: string): number | null {
  const matches = [...text.matchAll(/(?:\$|COP)\s*([\d][\d.,]{3,})/gi)]
    .map((x) => parsePrice(x[1]))
    .filter((n): n is number => !!n && n >= 1000);
  if (matches.length === 0) return null;
  return Math.min(...matches);
}

async function uploadImage(imageUrl: string, productId: number, index: number): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": BROWSER_HEADERS["User-Agent"] },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 5 * 1024 * 1024) return null;
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const path = `products/${productId}/scraped_${Date.now()}_${index}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, buffer, { contentType, upsert: false });
    if (error) return null;
    return path;
  } catch (_) {
    return null;
  }
}

// Normaliza una URL de imagen para detectar duplicados (mismo archivo en distinto tamaño o con query params)
function normalizeImageKey(url: string): string {
  try {
    const u = new URL(url);
    let path = u.pathname.toLowerCase();
    // Quitar tokens de tamaño comunes: _500x500, -1000x1000, /w_500/, /h_600/, @2x, _thumb, _large
    path = path
      .replace(/[_-]\d{2,4}x\d{2,4}/g, "")
      .replace(/\/(?:w|h|c|q|s)_\d+\//g, "/")
      .replace(/[_-](?:thumb|small|medium|large|xlarge|original|full|zoom|\d{2,4}w)\b/g, "")
      .replace(/@\dx/g, "")
      .replace(/\/+/g, "/");
    return `${u.hostname}${path}`;
  } catch (_) {
    return url.split("?")[0].toLowerCase();
  }
}

function dedupeImages(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    if (!url) continue;
    const key = normalizeImageKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(url);
  }
  return result;
}

async function uploadProductImages(productId: number, imageUrls: string[], altText: string): Promise<void> {
  // Descarta logos/íconos/placeholders aunque la IA los haya seleccionado
  const filtered = (imageUrls || []).filter(isProductImage);
  const urls = dedupeImages(filtered).slice(0, MAX_IMAGES_PER_PRODUCT);
  const uploads = await Promise.all(urls.map((u, i) => uploadImage(u, productId, i)));
  let isPrimary = true;
  for (let i = 0; i < uploads.length; i++) {
    const path = uploads[i];
    if (path) {
      await supabase.from("product_images").insert({
        product_id: productId,
        storage_path: path,
        display_order: i,
        is_primary: isPrimary,
        alt_text: altText.substring(0, 100),
      });
      isPrimary = false;
    }
  }
}

// Genera el producto cartesiano de todos los tipos de variante (Color × Talla × ...)
function cartesianVariants(
  variants: { name: string; values: string[] }[]
): Record<string, string>[] {
  let combos: Record<string, string>[] = [{}];
  for (const tipo of variants) {
    const vals = (tipo.values || []).map((v) => (v || "").trim()).filter(Boolean);
    if (vals.length === 0 || !tipo.name) continue;
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const val of vals) {
        next.push({ ...combo, [tipo.name]: val });
      }
    }
    combos = next;
  }
  // Si no se generó ninguna combinación válida, devolver vacío
  return combos.length === 1 && Object.keys(combos[0]).length === 0 ? [] : combos;
}

// Crear productos hijos (variantes reales) combinando TODOS los tipos (Color + Talla, etc.)
async function createVariantChildren(
  parentId: number,
  parentSku: string,
  p: ScrapedProduct,
  organizationId: number
): Promise<number> {
  if (!p.variants || p.variants.length === 0) return 0;
  const combos = cartesianVariants(p.variants).slice(0, MAX_VARIANT_CHILDREN);
  let creados = 0;
  const ahora = new Date().toISOString();

  for (let i = 0; i < combos.length; i++) {
    const combo = combos[i];
    const etiqueta = Object.values(combo).join(" / ");
    const childSku = `${parentSku}-V${i + 1}`;
    const { data: child, error } = await supabase
      .from("products")
      .insert({
        organization_id: organizationId,
        sku: childSku,
        name: `${p.name} - ${etiqueta}`.substring(0, 200),
        parent_product_id: parentId,
        is_parent: false,
        category_id: null,
        barcode: null,
        status: "active",
        unit_code: DEFAULT_UNIT_CODE,
        variant_data: combo,
      })
      .select("id")
      .single();
    if (error || !child) continue;

    // Registrar relaciones tipo/valor para cada atributo de la combinación
    for (const [tipoName, valor] of Object.entries(combo)) {
      const variantTypeId = await findOrCreateVariantType(tipoName, organizationId);
      if (!variantTypeId) continue;
      const variantValueId = await findOrCreateVariantValue(variantTypeId, valor);
      if (!variantValueId) continue;
      await supabase.from("product_variant_relations").insert({
        product_id: child.id,
        variant_type_id: variantTypeId,
        variant_value_id: variantValueId,
      });
    }

    if (p.price && p.price > 0) {
      await supabase.from("product_prices").insert({
        product_id: child.id,
        price: p.price,
        effective_from: ahora,
      });
    }
    creados++;
  }
  return creados;
}

async function findOrCreateVariantType(name: string, organizationId: number): Promise<number | null> {
  if (!name) return null;
  const { data: existing } = await supabase
    .from("variant_types")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("variant_types")
    .insert({ organization_id: organizationId, name })
    .select("id")
    .single();
  return created?.id || null;
}

async function findOrCreateVariantValue(variantTypeId: number, value: string): Promise<number | null> {
  if (!value) return null;
  const { data: existing } = await supabase
    .from("variant_values")
    .select("id")
    .eq("variant_type_id", variantTypeId)
    .ilike("value", value)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("variant_values")
    .insert({ variant_type_id: variantTypeId, value, display_order: 0 })
    .select("id")
    .single();
  return created?.id || null;
}

async function findOrCreateCategory(name: string, organizationId: number): Promise<number | null> {
  if (!name) return null;
  const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("categories")
    .insert({ organization_id: organizationId, name, slug: `${slug}-${Date.now() % 10000}`, rank: 0 })
    .select("id")
    .single();
  return created?.id || null;
}

async function findOrCreateSupplier(brand: string, organizationId: number, sourceUrl: string): Promise<number | null> {
  if (!brand) return null;
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", brand)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("suppliers")
    .insert({ organization_id: organizationId, name: brand, notes: `Creado por scraping desde ${sourceUrl}`, is_active: true })
    .select("id")
    .single();
  return created?.id || null;
}

async function linkSupplier(productId: number, supplierId: number, cost: number, sku?: string): Promise<void> {
  const { data: existing } = await supabase
    .from("product_suppliers")
    .select("id")
    .eq("product_id", productId)
    .eq("supplier_id", supplierId)
    .maybeSingle();
  if (existing) return;
  await supabase.from("product_suppliers").insert({
    product_id: productId,
    supplier_id: supplierId,
    cost: cost || 0,
    is_preferred: true,
    supplier_sku: sku || null,
    notes: "Vinculado por importación IA",
  });
}

async function findOrCreateTag(name: string, organizationId: number): Promise<number | null> {
  if (!name) return null;
  const { data: existing } = await supabase
    .from("product_tags")
    .select("id")
    .eq("organization_id", organizationId)
    .ilike("name", name)
    .maybeSingle();
  if (existing) return existing.id;
  const { data: created } = await supabase
    .from("product_tags")
    .insert({ organization_id: organizationId, name })
    .select("id")
    .single();
  return created?.id || null;
}

async function findExistingProduct(p: ScrapedProduct, organizationId: number): Promise<{ id: number; sku: string } | null> {
  if (p.sku) {
    const { data } = await supabase
      .from("products")
      .select("id, sku")
      .eq("organization_id", organizationId)
      .eq("sku", p.sku)
      .neq("status", "deleted")
      .maybeSingle();
    if (data) return data;
  }
  const { data: byName } = await supabase
    .from("products")
    .select("id, sku")
    .eq("organization_id", organizationId)
    .ilike("name", p.name)
    .neq("status", "deleted")
    .is("parent_product_id", null)
    .limit(1);
  return byName?.[0] || null;
}

async function updateExistingProduct(
  existingId: number,
  existingSku: string,
  p: ScrapedProduct,
  organizationId: number,
  branchId: number | null,
  sourceUrl: string
): Promise<void> {
  const categoryId = await findOrCreateCategory(p.category || "", organizationId);
  const supplierId = await findOrCreateSupplier(p.brand || "", organizationId, sourceUrl);
  const ahora = new Date().toISOString();

  const updateData: Record<string, unknown> = { updated_at: ahora };
  if (p.description) updateData.description = p.description;
  if (categoryId) updateData.category_id = categoryId;
  if (p.barcode) updateData.barcode = p.barcode;
  if (p.variants && p.variants.length > 0) {
    updateData.is_parent = true;
  }
  await supabase.from("products").update(updateData).eq("id", existingId);

  if (supplierId) {
    await linkSupplier(existingId, supplierId, p.cost || 0, p.sku);
  }

  if (p.price && p.price > 0) {
    await supabase
      .from("product_prices")
      .update({ effective_to: ahora })
      .eq("product_id", existingId)
      .is("effective_to", null);
    await supabase.from("product_prices").insert({
      product_id: existingId,
      price: p.price,
      compare_price: p.compare_price && p.compare_price > p.price ? p.compare_price : null,
      effective_from: ahora,
    });
  }

  if (p.cost && p.cost > 0) {
    await supabase
      .from("product_costs")
      .update({ effective_to: ahora })
      .eq("product_id", existingId)
      .is("effective_to", null);
    await supabase.from("product_costs").insert({
      product_id: existingId,
      cost: p.cost,
      supplier_id: supplierId,
      effective_from: ahora,
    });
  }

  if (branchId && typeof p.stock === "number" && p.stock > 0) {
    const { data: sl } = await supabase
      .from("stock_levels")
      .select("id")
      .eq("product_id", existingId)
      .eq("branch_id", branchId)
      .is("lot_id", null)
      .maybeSingle();
    if (sl) {
      await supabase.from("stock_levels").update({ qty_on_hand: p.stock, updated_at: ahora }).eq("id", sl.id);
    } else {
      await supabase.from("stock_levels").insert({ product_id: existingId, branch_id: branchId, qty_on_hand: p.stock, qty_reserved: 0 });
    }
  }

  // Imágenes: agregar las que falten si tiene menos de 3
  const { data: existingImgs } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", existingId);
  if (!existingImgs || existingImgs.length < 3) {
    await uploadProductImages(existingId, p.images || [], p.name);
  }

  // Variantes: crear hijos si no existen
  const { data: existingChildren } = await supabase
    .from("products")
    .select("id")
    .eq("parent_product_id", existingId)
    .limit(1);
  if ((!existingChildren || existingChildren.length === 0) && p.variants && p.variants.length > 0) {
    await createVariantChildren(existingId, existingSku, p, organizationId);
  }
}

async function importProduct(
  p: ScrapedProduct,
  organizationId: number,
  branchId: number | null,
  sourceUrl: string,
  duplicateMode: DuplicateMode
): Promise<{ ok: boolean; name: string; action?: string; error?: string }> {
  try {
    const existing = await findExistingProduct(p, organizationId);

    if (existing) {
      if (duplicateMode === "skip") {
        return { ok: false, name: p.name, error: "Ya existe (omitido)" };
      }
      if (duplicateMode === "update") {
        await updateExistingProduct(existing.id, existing.sku, p, organizationId, branchId, sourceUrl);
        return { ok: true, name: p.name, action: "actualizado" };
      }
      p = { ...p, sku: undefined };
    }

    const categoryId = await findOrCreateCategory(p.category || "", organizationId);
    const supplierId = await findOrCreateSupplier(p.brand || "", organizationId, sourceUrl);
    const tagId = p.tags && p.tags.length > 0 ? await findOrCreateTag(p.tags[0], organizationId) : null;

    let sku = p.sku || `SCR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const { data: dupe } = await supabase
      .from("products")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("sku", sku)
      .maybeSingle();
    if (dupe) {
      sku = `${sku}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
    }

    const hasVariants = p.variants && p.variants.length > 0;
    const { data: product, error: prodError } = await supabase
      .from("products")
      .insert({
        organization_id: organizationId,
        sku,
        name: p.name.substring(0, 200),
        description: p.description || null,
        category_id: categoryId,
        barcode: p.barcode || null,
        status: "active",
        unit_code: DEFAULT_UNIT_CODE,
        tag_id: tagId,
        is_parent: hasVariants || false,
        variant_data: hasVariants ? { types: p.variants } : null,
      })
      .select("id")
      .single();

    if (prodError || !product) {
      return { ok: false, name: p.name, error: prodError?.message || "Error al crear" };
    }

    const productId = product.id;
    const ahora = new Date().toISOString();

    if (supplierId) {
      await linkSupplier(productId, supplierId, p.cost || 0, p.sku);
    }

    if (p.price && p.price > 0) {
      await supabase.from("product_prices").insert({
        product_id: productId,
        price: p.price,
        compare_price: p.compare_price && p.compare_price > p.price ? p.compare_price : null,
        effective_from: ahora,
      });
    }

    if (p.cost && p.cost > 0) {
      await supabase.from("product_costs").insert({
        product_id: productId,
        cost: p.cost,
        supplier_id: supplierId,
        effective_from: ahora,
      });
    }

    if (branchId && typeof p.stock === "number" && p.stock > 0) {
      await supabase.from("stock_levels").insert({
        product_id: productId,
        branch_id: branchId,
        qty_on_hand: p.stock,
        qty_reserved: 0,
      });
    }

    await uploadProductImages(productId, p.images || [], p.name);

    // Crear variantes como productos hijos
    if (hasVariants) {
      await createVariantChildren(productId, sku, p, organizationId);
    }

    return { ok: true, name: p.name, action: existing ? "creado (duplicado)" : "creado" };
  } catch (e) {
    return { ok: false, name: p.name, error: (e as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "preview") {
      const { url } = body;
      if (!url || !/^https?:\/\//.test(url)) {
        return new Response(JSON.stringify({ error: "URL inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // 1) Intentar API nativa de la plataforma (Shopify/VTEX): catálogo COMPLETO y exacto, sin IA
      const native = await fetchNativeCatalog(url);
      if (native && native.length) {
        return new Response(JSON.stringify({ products: native }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // 2) Fallback: scraping del HTML/markdown con IA
      const { direct, jina } = await fetchSources(url);
      const products = await extractWithAI(direct, jina, url);
      return new Response(JSON.stringify({ products }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "enrich") {
      const { url } = body;
      if (!url || !/^https?:\/\//.test(url)) {
        return new Response(JSON.stringify({ error: "URL inválida" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const product = await enrichProduct(url);
      return new Response(JSON.stringify({ product }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "import") {
      const { products, organization_id, branch_id, source_url, duplicate_mode } = body;
      if (!products?.length || !organization_id) {
        return new Response(JSON.stringify({ error: "Faltan datos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const mode: DuplicateMode = ["skip", "update", "create"].includes(duplicate_mode) ? duplicate_mode : "skip";
      const results = [];
      for (const p of products.slice(0, 150)) {
        results.push(await importProduct(p, organization_id, branch_id || null, source_url || "", mode));
      }
      const exitosos = results.filter((r) => r.ok).length;
      const fallidos = results.filter((r) => !r.ok);
      return new Response(JSON.stringify({ exitosos, fallidos: fallidos.length, errores: fallidos, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no válida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
