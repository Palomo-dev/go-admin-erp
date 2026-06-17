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

function cleanHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
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

function extractImages(content: string, baseUrl: string): string[] {
  const imgs = new Set<string>();
  const htmlRegex = /<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
  let m;
  while ((m = htmlRegex.exec(content)) !== null) {
    try {
      const url = new URL(m[1], baseUrl).href;
      if (/\.(jpg|jpeg|png|webp|avif)/i.test(url) && !/(logo|icon|sprite|banner|flag|payment|favicon)/i.test(url)) {
        imgs.add(url);
      }
    } catch (_) { /* ignore */ }
  }
  const mdRegex = /https?:\/\/[^\s\)\]"']+\.(?:jpg|jpeg|png|webp|avif)[^\s\)\]"']*/gi;
  while ((m = mdRegex.exec(content)) !== null) {
    if (!/(logo|icon|sprite|banner|flag|payment|favicon)/i.test(m[0])) {
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

async function fetchWithJina(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const res = await fetch(jinaUrl, {
      headers: {
        "Accept": "text/plain",
        "X-With-Images-Summary": "true",
        "X-With-Links-Summary": "true",
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200 ? text : null;
  } catch (_) {
    return null;
  }
}

async function fetchPage(url: string): Promise<{ content: string; isMarkdown: boolean }> {
  // Intentar ambos en paralelo para velocidad
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

  const directHtml = directResult.status === "fulfilled" ? directResult.value : null;
  const jinaText = jinaResult.status === "fulfilled" ? jinaResult.value : null;

  // Preferir Jina si tiene contenido sustancial (renderiza JS, más productos)
  if (jinaText && jinaText.length > 1000) {
    return { content: jinaText, isMarkdown: true };
  }
  // Fallback a HTML directo
  if (directHtml) {
    return { content: directHtml, isMarkdown: false };
  }
  // Si ninguno funcionó pero Jina tiene algo
  if (jinaText) {
    return { content: jinaText, isMarkdown: true };
  }
  throw new Error("No se pudo acceder a la página (bloqueo anti-bots o sitio caído). Intente con otra URL.");
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
      temperature: 0.1,
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

function buildContext(content: string, isMarkdown: boolean, maxChars = 60000): string {
  if (isMarkdown) {
    return `CONTENIDO DE LA PÁGINA (markdown):\n${content.substring(0, maxChars)}`;
  }
  const jsonLd = extractJsonLd(content);
  const cleaned = cleanHtml(content)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .substring(0, maxChars);
  return jsonLd.length > 0
    ? `DATOS ESTRUCTURADOS JSON-LD:\n${jsonLd.join("\n").substring(0, 20000)}\n\nTEXTO DE LA PÁGINA:\n${cleaned.substring(0, maxChars - 20000)}`
    : `TEXTO DE LA PÁGINA:\n${cleaned}`;
}

async function extractWithAI(content: string, url: string, isMarkdown: boolean): Promise<ScrapedProduct[]> {
  const images = extractImages(content, url);
  // Para listados usamos menos contexto para velocidad
  const context = buildContext(content, isMarkdown, 50000);
  const imgList = images.slice(0, 60).join("\n");

  const prompt = `Extrae TODOS los productos de esta página e-commerce: ${url}

${context}

IMÁGENES DISPONIBLES:
${imgList}

JSON con formato:
{"products":[{"name":"...","price":123456,"compare_price":150000,"brand":"...","category":"...","images":["url1"],"url":"https://enlace-detalle","variants":[{"name":"Color","values":["Rojo"]}]}]}

Reglas:
- Extrae TODOS los productos visibles, hasta 80. No omitas ninguno.
- url: enlace ABSOLUTO a la página de detalle (MUY IMPORTANTE)
- price/compare_price: números sin símbolos
- brand: infiere del dominio o nombre
- category: categoría corta en español
- images: solo de la lista proporcionada
- Si no hay un dato, omítelo
- description: OMITIR en este paso (se obtiene después)`;

  const parsed = await callOpenAI(prompt);
  return parsed.products || [];
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

  const images = extractImages(content, url);
  const context = buildContext(content, isMarkdown, 40000);
  const imgList = images.slice(0, 30).join("\n");

  const prompt = `Extrae los datos del producto en: ${url}

${context}

IMÁGENES:
${imgList}

JSON:
{"product":{"name":"...","description":"descripción completa en español","price":123456,"compare_price":150000,"sku":"...","brand":"...","category":"...","tags":["..."],"images":["url1","url2"],"variants":[{"name":"Color","values":["Negro","Blanco"]},{"name":"Talla","values":["7","8"]}]}}

Reglas:
- description: completa con materiales, tecnología, beneficios (3-4 oraciones)
- images: del producto (máx 8)
- variants: todas las opciones disponibles
- sku: código/referencia si aparece
- price/compare_price: números sin símbolos
- Omite campos sin dato`;

  const parsed = await callOpenAI(prompt);
  return parsed.product || null;
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
  const urls = dedupeImages(imageUrls).slice(0, MAX_IMAGES_PER_PRODUCT);
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
      const { content, isMarkdown } = await fetchPage(url);
      const products = await extractWithAI(content, url, isMarkdown);
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
      for (const p of products.slice(0, 80)) {
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
