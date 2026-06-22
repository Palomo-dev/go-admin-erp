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
    // Motor de navegador real: más lento pero atraviesa sitios con JS pesado / anti-bots
    if (useBrowser) headers["X-Engine"] = "browser";
    const res = await fetch(`https://r.jina.ai/${url}`, { headers });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200 ? text : null;
  } catch (_) {
    return null;
  }
}

async function fetchWithJina(url: string): Promise<string | null> {
  // Intento rápido (motor por defecto)
  const fast = await jinaRequest(url, false);
  if (fast && fast.length > 1000) return fast;
  // Reintento con motor de navegador para páginas que devuelven poco contenido (SPA/anti-bot)
  const browser = await jinaRequest(url, true);
  return browser || fast;
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
  const MAX_CHUNKS = 5;
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
  const prod = sanitizeProduct(normalizePrices(parsed.product));
  // Conservar solo imágenes que realmente cargan (evita grises/rotas)
  if (prod.images && prod.images.length > 0) {
    prod.images = await filterWorkingImages(prod.images, 10, 12);
  }
  return prod;
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
