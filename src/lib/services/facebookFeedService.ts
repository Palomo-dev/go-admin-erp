/**
 * Servicio server-side para generar el feed de catálogo de Facebook.
 * Usa Supabase service role key (sin RLS) para consultar todos los productos.
 * Reutiliza la lógica de facebookCatalogExport.ts pero con cliente admin.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'crypto';
import { FACEBOOK_CATALOG_HEADERS } from '@/components/inventario/productos/facebookCatalogExport';

interface FacebookRow {
  [key: string]: string;
}

interface VariantInfo {
  gender?: string;
  color?: string;
  size?: string;
  age_group?: string;
  material?: string;
  pattern?: string;
}

interface CategoryRef {
  id: number;
  name: string;
}

interface ProductRecord {
  id: number;
  uuid: string;
  organization_id: number;
  sku: string;
  name: string;
  description: string | null;
  category_id: number | null;
  unit_code: string | null;
  barcode: string | null;
  status: string;
  track_stock: boolean | null;
  parent_product_id: number | null;
  is_parent: boolean | null;
  product_type: string;
  brand: string | null;
  reference: string | null;
  variant_data: unknown;
  station: string | null;
  tax_id: number | null;
  is_composite: boolean | null;
  production_type: string | null;
  created_at: string;
  updated_at: string;
  categories: CategoryRef | null;
}

interface ProductPrice {
  id: number;
  product_id: number;
  price: string | number;
  compare_price: string | number | null;
  effective_from: string;
  effective_to: string | null;
}

interface ProductImage {
  id: number;
  product_id: number;
  storage_path: string;
  is_primary: boolean | null;
}

interface StockLevel {
  product_id: number;
  branch_id: number;
  qty_on_hand: number | null;
  qty_reserved: number | null;
}

interface ProductTag {
  id: number;
  name: string;
}

interface ProductTagRelation {
  product_id: number;
  tag_id: number;
}

interface ProductData extends ProductRecord {
  price: number;
  compare_price: number;
  stock: number;
  product_prices: ProductPrice[];
  product_images: ProductImage[];
  category: CategoryRef | null;
}

interface VariantAttr {
  type?: string;
  name?: string;
  value?: string;
}

interface OrgCurrency {
  code: string;
  name: string;
  decimals: number;
  is_base: boolean;
}

interface LatestRates {
  rateBase: number;
  rateTarget: number;
  rateDate: string;
}

type PriceFormatter = (amount: number, currency: string) => string;

function getServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

/**
 * Genera el CSV del catálogo de Facebook para una organización.
 * Retorna el contenido CSV listo para servir como feed.
 *
 * Si `targetCurrency` es undefined, null o igual a la moneda base de la organización,
 * se ejecuta exactamente el mismo flujo que antes (sin conversión).
 * Si `targetCurrency` está presente y difiere de la moneda base, se convierten los
 * precios usando la tasa más reciente de `currency_rates`.
 */
export async function generateFacebookFeedCSV(
  organizationId: number,
  targetCurrency?: string | null
): Promise<{ csv: string; count: number; rateDate?: string }> {
  const supabase = getServerSupabase();

  // 1. Obtener moneda base
  const { data: currencyData } = await supabase
    .from('organization_currencies')
    .select('currency_code')
    .eq('organization_id', organizationId)
    .eq('is_base', true)
    .maybeSingle();
  const currency = currencyData?.currency_code || 'COP';

  // Determinar si se requiere conversión de moneda
  const needsConversion = !!targetCurrency && targetCurrency.toUpperCase() !== currency.toUpperCase();

  // Variables para la rama multi-moneda
  let conversionFactor = 1;
  let targetDecimals = 2;
  let activeCurrency = currency;
  let activeFormatter: PriceFormatter | undefined;
  let rateDate: string | undefined;

  if (needsConversion && targetCurrency) {
    const targetCode = targetCurrency.toUpperCase();

    // 1a. Validar que la moneda destino exista en el catálogo maestro (currencies).
    // No se valida contra organization_currencies — cualquier moneda del catálogo
    // maestro puede usarse para generar un feed convertido.
    const targetConfig = await getCurrencyMaster(supabase, targetCode);
    if (!targetConfig) {
      throw new InvalidCurrencyError(targetCode);
    }

    // 1b. Leer decimales de la moneda destino
    targetDecimals = targetConfig.decimals;

    // 1c. Obtener tasas más recientes para base y destino
    const rates = await getLatestRates(supabase, currency, targetCode);
    if (!rates) {
      throw new RateUnavailableError(targetCode);
    }

    // 1d. Calcular factor de conversión: precio_destino = precio_base * (rate_destino / rate_base)
    conversionFactor = rates.rateTarget / rates.rateBase;
    rateDate = rates.rateDate;
    activeCurrency = targetCode;
    activeFormatter = (amount: number, cur: string) =>
      formatPriceWithDecimals(amount, cur, targetDecimals);
  }

  // 2. Obtener dominio web
  const { data: domainData } = await supabase
    .from('organization_domains')
    .select('host')
    .eq('organization_id', organizationId)
    .eq('is_primary', true)
    .eq('status', 'verified')
    .order('domain_type', { ascending: false })
    .limit(1)
    .maybeSingle();
  const webDomain = domainData?.host || undefined;

  // 3. Obtener nombre de la organización
  const { data: orgData } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle();
  const organizationName = orgData?.name || undefined;

  // 4. Consultar todos los productos padres activos
  const PAGE_SIZE = 200;
  let mainProducts: ProductRecord[] = [];
  for (let page = 0; ; page++) {
    const desde = page * PAGE_SIZE;
    const hasta = desde + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, uuid, organization_id, sku, name, description, category_id, unit_code,
        barcode, status, track_stock, parent_product_id, is_parent,
        product_type, brand, reference, variant_data, station,
        tax_id, is_composite, production_type, created_at, updated_at,
        categories(id, name)
      `)
      .eq('organization_id', organizationId)
      .is('parent_product_id', null)
      .neq('status', 'deleted')
      .neq('product_type', 'service')
      .order('id', { ascending: true })
      .range(desde, hasta);

    if (error) throw error;
    if (!data || data.length === 0) break;
    mainProducts = mainProducts.concat(data);
    if (data.length < PAGE_SIZE) break;
  }

  if (mainProducts.length === 0) return { csv: '', count: 0 };

  const productIds = mainProducts.map((p) => p.id);

  // 5. Consultar hijos (variantes)
  let childrenData: ProductRecord[] = [];
  for (let i = 0; i < productIds.length; i += PAGE_SIZE) {
    const batch = productIds.slice(i, i + PAGE_SIZE);
    const { data, error } = await supabase
      .from('products')
      .select(`
        id, uuid, organization_id, sku, name, description, category_id, unit_code,
        barcode, status, track_stock, parent_product_id, is_parent,
        product_type, brand, reference, variant_data, station,
        tax_id, is_composite, production_type, created_at, updated_at,
        categories(id, name)
      `)
      .in('parent_product_id', batch)
      .neq('status', 'deleted');
    if (error) throw error;
    if (data) childrenData = childrenData.concat(data);
  }

  // 6. Mapear hijos por parent_product_id
  const childrenMap = new Map<number, ProductRecord[]>();
  childrenData.forEach((child) => {
    const parentId = child.parent_product_id;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(child);
  });

  // 7. Recopilar todos los ids para consultar relaciones
  const allIds = [...productIds, ...childrenData.map((c) => c.id)];

  const batchedFetch = async (table: string, select: string, column: string) => {
    const allData: Record<string, unknown>[] = [];
    for (let i = 0; i < allIds.length; i += PAGE_SIZE) {
      const batch = allIds.slice(i, i + PAGE_SIZE);
      const { data, error } = await supabase.from(table).select(select).in(column, batch);
      if (error) throw error;
      if (data) allData.push(...data);
    }
    return allData;
  };

  const [pricesData, imagesData, stockData, tagsData, tagsRelationsData] = await Promise.all([
    batchedFetch('product_prices', 'id, product_id, price, compare_price, effective_from, effective_to', 'product_id'),
    batchedFetch('product_images', 'id, product_id, storage_path, is_primary', 'product_id'),
    batchedFetch('stock_levels', 'product_id, branch_id, qty_on_hand, qty_reserved', 'product_id'),
    (async () => {
      const { data } = await supabase
        .from('product_tags')
        .select('id, name')
        .eq('organization_id', organizationId);
      return data || [];
    })(),
    batchedFetch('product_tag_relations', 'product_id, tag_id', 'product_id'),
  ]);

  // 8. Mapear relaciones
  const pricesMap = new Map<number, ProductPrice[]>();
  pricesData.forEach((p) => {
    if (!pricesMap.has(p.product_id)) pricesMap.set(p.product_id, []);
    pricesMap.get(p.product_id)!.push(p);
  });

  const imagesMap = new Map<number, ProductImage[]>();
  imagesData.forEach((img) => {
    if (!imagesMap.has(img.product_id)) imagesMap.set(img.product_id, []);
    imagesMap.get(img.product_id)!.push(img);
  });

  const stockMap = new Map<number, number>();
  stockData.forEach((s) => {
    const available = (s.qty_on_hand || 0) - (s.qty_reserved || 0);
    stockMap.set(s.product_id, (stockMap.get(s.product_id) || 0) + available);
  });

  const tagsMap = new Map<number, string[]>();
  if (tagsRelationsData && tagsRelationsData.length > 0) {
    tagsRelationsData.forEach((rel) => {
      const tag = tagsData.find((t) => t.id === rel.tag_id);
      if (tag) {
        const existing = tagsMap.get(rel.product_id) || [];
        existing.push(tag.name);
        tagsMap.set(rel.product_id, existing);
      }
    });
  }

  // 9. Construir filas CSV
  const rows: FacebookRow[] = [];

  const buildProductData = (raw: ProductRecord): ProductData => {
    const pid = raw.id;
    const prices = pricesMap.get(pid) || [];
    const validPrices = prices
      .filter((pp) => !pp.effective_to || new Date(pp.effective_to) > new Date())
      .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
    const currentPrice = validPrices.length > 0 ? Number(validPrices[0].price) : 0;
    const comparePrice = validPrices.length > 0 && validPrices[0].compare_price ? Number(validPrices[0].compare_price) : 0;

    return {
      ...raw,
      price: currentPrice,
      compare_price: comparePrice,
      stock: stockMap.get(pid) || 0,
      product_prices: prices,
      product_images: imagesMap.get(pid) || [],
      category: raw.categories,
    };
  };

  for (const raw of mainProducts) {
    const product = buildProductData(raw);
    if (needsConversion) {
      product.price = product.price * conversionFactor;
      product.compare_price = product.compare_price * conversionFactor;
    }
    const pid = Number(product.id);
    rows.push(buildFacebookRow(product, '', activeCurrency, webDomain, organizationName, tagsMap.get(pid) || [], undefined, activeFormatter));

    const children = childrenMap.get(raw.id) || [];
    for (const childRaw of children) {
      const child = buildProductData(childRaw);
      if (needsConversion) {
        child.price = child.price * conversionFactor;
        child.compare_price = child.compare_price * conversionFactor;
      }
      const childId = Number(child.id);
      rows.push(buildFacebookRow(child, product.sku || '', activeCurrency, webDomain, organizationName, tagsMap.get(childId) || tagsMap.get(pid) || [], product, activeFormatter));
    }
  }

  // 10. Generar CSV
  const csvContent = buildCSV(rows);
  return { csv: csvContent, count: rows.length, rateDate };
}

// ─── Helpers (duplicados de facebookCatalogExport para uso server-side) ───

function buildFacebookRow(
  product: ProductData,
  parentSku: string,
  currency: string,
  webDomain?: string,
  organizationName?: string,
  tags?: string[],
  parentData?: ProductData,
  formatter?: PriceFormatter
): FacebookRow {
  const pid = Number(product.id);
  const sku = product.sku || String(pid);
  const name = product.name || '';
  const description = product.description || parentData?.description || '';
  const brand = product.brand || parentData?.brand || organizationName || '';
  const barcode = product.barcode || parentData?.barcode || '';
  const uuid = product.uuid || parentData?.uuid || '';

  const stock = product.stock ?? parentData?.stock ?? 0;
  const availability = stock > 0 ? 'in stock' : 'out of stock';

  const price = product.price ?? parentData?.price ?? 0;
  const fmt = formatter || formatPrice;
  const priceStr = price > 0 ? fmt(price, currency) : '';

  const comparePrice = product.compare_price ?? parentData?.compare_price ?? 0;
  const salePriceStr = comparePrice > 0 ? fmt(comparePrice, currency) : '';

  const pricesSource = (product.product_prices && product.product_prices.length > 0)
    ? product.product_prices
    : parentData?.product_prices;
  let saleDateRange = '';
  if (comparePrice > 0 && pricesSource && pricesSource.length > 0) {
    const validPrice = pricesSource
      .filter((pp) => !pp.effective_to || new Date(pp.effective_to) > new Date())
      .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];
    if (validPrice) {
      const from = new Date(validPrice.effective_from).toISOString();
      const to = validPrice.effective_to
        ? new Date(validPrice.effective_to).toISOString()
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      saleDateRange = `${from}/${to}`;
    }
  }

  let link = '';
  if (webDomain && uuid) {
    link = `https://${webDomain}/productos/${uuid}`;
  }

  const imagesSource = (product.product_images && product.product_images.length > 0)
    ? product.product_images
    : parentData?.product_images;
  let imageLink = '';
  if (imagesSource && imagesSource.length > 0) {
    const primaryImg = imagesSource.find((img) => img.is_primary);
    const img = primaryImg || imagesSource[0];
    if (img && img.storage_path) {
      const supabase = getServerSupabase();
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(img.storage_path);
      imageLink = urlData?.publicUrl || '';
    }
  }

  const categoryName = product.category?.name || parentData?.category?.name || '';

  const trackStock = product.track_stock ?? parentData?.track_stock ?? true;
  const quantity = trackStock === false ? '' : String(Math.max(0, Math.floor(stock)));

  const itemGroupId = parentSku || (product.is_parent ? sku : '');

  const variantInfo = extractVariantData(product.variant_data);

  const tag0 = tags && tags.length > 0 ? tags[0] : '';
  const tag1 = tags && tags.length > 1 ? tags[1] : '';

  return {
    id: sku,
    title: name,
    description: description,
    availability: availability,
    condition: 'new',
    price: priceStr,
    link: link,
    image_link: imageLink,
    brand: brand,
    google_product_category: categoryName,
    fb_product_category: categoryName,
    quantity_to_sell_on_facebook: quantity,
    sale_price: salePriceStr,
    sale_price_effective_date: saleDateRange,
    item_group_id: itemGroupId,
    gender: variantInfo.gender || '',
    color: variantInfo.color || '',
    size: variantInfo.size || '',
    age_group: variantInfo.age_group || 'adult',
    material: variantInfo.material || '',
    pattern: variantInfo.pattern || '',
    shipping: '',
    shipping_weight: '',
    offer_disclaimer: '',
    offer_disclaimer_url: '',
    'video[0].url': '',
    'video[0].tag[0]': '',
    gtin: barcode,
    'product_tags[0]': tag0,
    'product_tags[1]': tag1,
    'style[0]': '',
  };
}

function formatPrice(amount: number, currency: string): string {
  const formatted = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${formatted} ${currency}`;
}

/**
 * Formatea un precio usando el número de decimales configurado para la moneda.
 * Usa Intl.NumberFormat con agrupación de miles.
 * No modifica `formatPrice` (que se mantiene para el feed sin conversión).
 */
export function formatPriceWithDecimals(
  amount: number,
  currency: string,
  decimals: number
): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(amount);
  return `${formatted} ${currency}`;
}

function extractVariantData(variantData: unknown): VariantInfo {
  const info: VariantInfo = {};
  if (!variantData) return info;
  try {
    const vd = typeof variantData === 'string' ? JSON.parse(variantData) : variantData;
    if (Array.isArray(vd)) {
      (vd as VariantAttr[]).forEach((attr) => {
        const type = (attr.type || attr.name || '').toLowerCase();
        const value = attr.value || '';
        assignVariantField(info, type, value);
      });
    } else if (vd && typeof vd === 'object' && 'attributes' in vd && Array.isArray((vd as { attributes: unknown }).attributes)) {
      ((vd as { attributes: VariantAttr[] }).attributes).forEach((attr) => {
        const type = (attr.type || attr.name || '').toLowerCase();
        const value = attr.value || '';
        assignVariantField(info, type, value);
      });
    } else if (vd && typeof vd === 'object') {
      Object.entries(vd as Record<string, unknown>).forEach(([key, value]) => {
        const type = key.toLowerCase();
        assignVariantField(info, type, String(value));
      });
    }
  } catch {
    // ignore parse errors
  }
  return info;
}

function assignVariantField(info: VariantInfo, type: string, value: string): void {
  if (type.includes('color') || type.includes('colour')) {
    info.color = value;
  } else if (type.includes('size') || type.includes('talla')) {
    info.size = value;
  } else if (type.includes('gender') || type.includes('género') || type.includes('genero')) {
    info.gender = value;
  } else if (type.includes('age') || type.includes('edad')) {
    info.age_group = value;
  } else if (type.includes('material')) {
    info.material = value;
  } else if (type.includes('pattern') || type.includes('patrón')) {
    info.pattern = value;
  }
}

function escapeCSV(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function buildCSV(rows: FacebookRow[]): string {
  const headerLine = FACEBOOK_CATALOG_HEADERS.join(',');
  const dataLines = rows.map((row) =>
    FACEBOOK_CATALOG_HEADERS.map((h) => escapeCSV(row[h] || '')).join(',')
  );
  return [headerLine, ...dataLines].join('\n');
}

// ─── Helpers de moneda (multi-moneda) ───

/**
 * Obtiene una moneda del catálogo maestro (`currencies`) por su código.
 * Retorna null si no existe o no está activa.
 */
export async function getCurrencyMaster(
  supabase: SupabaseClient,
  code: string
): Promise<{ code: string; name: string; decimals: number } | null> {
  const { data, error } = await supabase
    .from('currencies')
    .select('code, name, decimals')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Obtiene las monedas configuradas para una organización, incluyendo
 * el número de decimales de cada una (join con `currencies`).
 */
export async function getOrgCurrencies(
  supabase: SupabaseClient,
  organizationId: number
): Promise<OrgCurrency[]> {
  // Query 1: monedas configuradas para la organización
  const { data: orgRows, error: orgError } = await supabase
    .from('organization_currencies')
    .select('currency_code, is_base')
    .eq('organization_id', organizationId);

  if (orgError) throw orgError;
  if (!orgRows || orgRows.length === 0) return [];

  // Query 2: datos maestros de las monedas (decimales, nombre)
  const codes = orgRows.map((r) => r.currency_code);
  const { data: curRows, error: curError } = await supabase
    .from('currencies')
    .select('code, name, decimals')
    .in('code', codes);

  if (curError) throw curError;

  // Construir mapa de moneda → datos maestros
  const curMap = new Map<string, { name: string; decimals: number }>();
  for (const c of curRows || []) {
    curMap.set(c.code, { name: c.name, decimals: c.decimals });
  }

  return orgRows.map((row): OrgCurrency => {
    const cur = curMap.get(row.currency_code);
    return {
      code: row.currency_code,
      name: cur?.name || row.currency_code,
      decimals: typeof cur?.decimals === 'number' ? cur.decimals : 2,
      is_base: !!row.is_base,
    };
  });
}

/**
 * Obtiene las tasas más recientes (misma fecha) para la moneda base y la moneda destino.
 * Ambas tasas están expresadas como unidades de la moneda por 1 USD.
 * Devuelve null si no se encuentran ambas tasas en la misma fecha.
 */
export async function getLatestRates(
  supabase: SupabaseClient,
  baseCode: string,
  targetCode: string
): Promise<LatestRates | null> {
  const base = baseCode.toUpperCase();
  const target = targetCode.toUpperCase();

  // Obtener las tasas más recientes para ambas monedas (base_currency_code = 'USD').
  // Se traen los últimos registros ordenados por fecha descendente y se
  // busca la fecha más reciente en la que existan AMBAS tasas.
  const { data: rates, error: ratesError } = await supabase
    .from('currency_rates')
    .select('code, rate_date, rate')
    .in('code', [base, target])
    .eq('base_currency_code', 'USD')
    .order('rate_date', { ascending: false })
    .limit(60);

  if (ratesError) throw ratesError;
  if (!rates || rates.length === 0) return null;

  // Agrupar por fecha y buscar la primera fecha (más reciente) con ambas tasas.
  // El Map preserva el orden de inserción, y la query viene ordenada desc.
  const byDate = new Map<string, { base?: number; target?: number }>();
  for (const r of rates) {
    const dateStr = String(r.rate_date);
    if (!byDate.has(dateStr)) byDate.set(dateStr, {});
    const entry = byDate.get(dateStr)!;
    if (String(r.code).toUpperCase() === base) entry.base = Number(r.rate);
    if (String(r.code).toUpperCase() === target) entry.target = Number(r.rate);
  }

  for (const [dateStr, entry] of byDate) {
    if (entry.base !== undefined && entry.target !== undefined) {
      return {
        rateBase: entry.base,
        rateTarget: entry.target,
        rateDate: dateStr,
      };
    }
  }

  return null;
}

// ─── Gestión del token de feed ───

/**
 * Obtiene o genera el token del feed de Facebook para una organización.
 * El token se guarda en organization_preferences.settings.facebook_feed_token
 */
export async function getOrCreateFeedToken(organizationId: number): Promise<string> {
  const supabase = getServerSupabase();

  // Intentar obtener token existente
  const { data: prefs } = await supabase
    .from('organization_preferences')
    .select('settings')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const existingToken = prefs?.settings?.facebook_feed_token;
  if (existingToken) return existingToken;

  // Generar nuevo token
  const token = generateToken(organizationId);

  // Guardar en organization_preferences (upsert)
  const { data: existing } = await supabase
    .from('organization_preferences')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('organization_preferences')
      .update({
        settings: { ...(prefs?.settings || {}), facebook_feed_token: token },
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId);
  } else {
    await supabase
      .from('organization_preferences')
      .insert({
        organization_id: organizationId,
        settings: { facebook_feed_token: token },
      });
  }

  return token;
}

/**
 * Valida el token del feed para una organización.
 */
export async function validateFeedToken(organizationId: number, token: string): Promise<boolean> {
  const supabase = getServerSupabase();
  const { data: prefs } = await supabase
    .from('organization_preferences')
    .select('settings')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const storedToken = prefs?.settings?.facebook_feed_token;
  if (!storedToken || typeof storedToken !== 'string') return false;

  // Comparación en tiempo constante para mitigar timing attacks
  try {
    const a = Buffer.from(storedToken);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Regenera el token del feed (invalida el anterior).
 */
export async function regenerateFeedToken(organizationId: number): Promise<string> {
  const supabase = getServerSupabase();
  const token = generateToken(organizationId);

  const { data: prefs } = await supabase
    .from('organization_preferences')
    .select('settings')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const { data: existing } = await supabase
    .from('organization_preferences')
    .select('organization_id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('organization_preferences')
      .update({
        settings: { ...(prefs?.settings || {}), facebook_feed_token: token },
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId);
  } else {
    await supabase
      .from('organization_preferences')
      .insert({
        organization_id: organizationId,
        settings: { facebook_feed_token: token },
      });
  }

  return token;
}

function generateToken(organizationId: number): string {
  const orgHash = Buffer.from(`${organizationId}`).toString('base64url').substring(0, 8);
  const uuid = randomUUID();
  return `${orgHash}-${uuid}`;
}

// ─── Configuración multi-moneda del feed (Fase 2) ───

export interface FeedCurrency {
  code: string;
  name: string;
  decimals: number;
  is_base: boolean;
}

export interface FeedConfig {
  token: string;
  currencies: FeedCurrency[];
  rateDate: string | null;
  defaultCurrency: string | null;
}

/**
 * Obtiene SOLO las monedas activas, fecha de tasas y moneda por defecto del feed
 * (sin el token). Es la parte "lenta" de getFeedConfig: 3 queries RLS.
 *
 * Se separa de getFeedConfig para que el dialog pueda pedir el token (rápido)
 * y las monedas (lento) en paralelo, sin bloquear la URL principal.
 *
 * Usa el Supabase client del navegador (con cookies de sesión) para que RLS aplique.
 */
export async function getFeedCurrencies(
  organizationId: number,
  supabase: SupabaseClient
): Promise<Omit<FeedConfig, 'token'>> {
  // Las 4 queries son independientes entre sí → se ejecutan en paralelo para
  // reducir el tiempo total de `get_currencies` (de ~4 RTT secuenciales a 1).
  const [curRes, baseRes, rateRes, prefsRes] = await Promise.all([
    // 1. Todas las monedas activas del catálogo maestro (tabla `currencies`).
    //    No se filtra por organization_currencies — el usuario quiere ver las
    //    10 monedas disponibles para poder generar feeds de cualquiera.
    supabase
      .from('currencies')
      .select('code, name, decimals')
      .eq('is_active', true)
      .order('code', { ascending: true }),

    // 2. Moneda base de la organización (para marcar is_base y que el dialog
    //    la excluya del listado de monedas extra — la base es la URL principal).
    supabase
      .from('organization_currencies')
      .select('currency_code')
      .eq('organization_id', organizationId)
      .eq('is_base', true)
      .maybeSingle(),

    // 3. Fecha más reciente de currency_rates.
    supabase
      .from('currency_rates')
      .select('rate_date')
      .order('rate_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // 4. Moneda por defecto guardada en organization_preferences.settings.
    supabase
      .from('organization_preferences')
      .select('settings')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (curRes.error) throw curRes.error;
  if (baseRes.error) throw baseRes.error;
  if (rateRes.error) throw rateRes.error;
  if (prefsRes.error) throw prefsRes.error;

  const baseCode = (baseRes.data?.currency_code || 'COP').toUpperCase();

  const currencies: FeedCurrency[] = (curRes.data || []).map((c) => ({
    code: c.code,
    name: c.name,
    decimals: c.decimals,
    is_base: c.code.toUpperCase() === baseCode,
  }));

  const rateDate = rateRes.data?.rate_date ?? null;

  const defaultCurrency =
    (prefsRes.data?.settings as Record<string, unknown> | null)?.facebook_feed_default_currency as
      | string
      | null ?? null;

  return { currencies, rateDate, defaultCurrency };
}

/**
 * Obtiene la configuración completa del feed de Facebook para una organización:
 * token, monedas activas, fecha más reciente de tasas y moneda por defecto.
 *
 * Usa el Supabase client del navegador (con cookies de sesión) para que las
 * policies de RLS apliquen automáticamente — solo miembros de la org pueden ver.
 */
export async function getFeedConfig(
  organizationId: number,
  supabase: SupabaseClient
): Promise<FeedConfig> {
  // Token (service role, rápido) y monedas (RLS, lento) en paralelo
  const [token, currencies] = await Promise.all([
    getOrCreateFeedToken(organizationId),
    getFeedCurrencies(organizationId, supabase),
  ]);
  return { token, ...currencies };
}

/**
 * Guarda la moneda por defecto del feed de Facebook para una organización.
 *
 * Valida que la moneda exista en organization_currencies para la org antes de
 * guardarla en organization_preferences.settings.facebook_feed_default_currency.
 *
 * Usa el Supabase client del navegador (con cookies de sesión) para que RLS aplique.
 */
export async function setDefaultFeedCurrency(
  organizationId: number,
  currency: string,
  supabase: SupabaseClient
): Promise<{ success: true; default_currency: string }> {
  // 1. Validar que la moneda exista para la org
  const { data: orgCurrency, error: orgCurrencyError } = await supabase
    .from('organization_currencies')
    .select('currency_code')
    .eq('organization_id', organizationId)
    .eq('currency_code', currency)
    .maybeSingle();

  if (orgCurrencyError) throw orgCurrencyError;

  if (!orgCurrency) {
    throw new InvalidCurrencyError(currency);
  }

  // 2. Leer settings actuales para hacer merge (no sobrescribir otros campos)
  const { data: existing, error: fetchError } = await supabase
    .from('organization_preferences')
    .select('organization_id, settings')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const currentSettings =
    (existing?.settings as Record<string, unknown> | null) ?? {};
  const newSettings = {
    ...currentSettings,
    facebook_feed_default_currency: currency,
  };

  // 3. Upsert en organization_preferences
  if (existing) {
    const { error: updateError } = await supabase
      .from('organization_preferences')
      .update({
        settings: newSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId);

    if (updateError) throw updateError;
  } else {
    const { error: insertError } = await supabase
      .from('organization_preferences')
      .insert({
        organization_id: organizationId,
        settings: { facebook_feed_default_currency: currency },
      });

    if (insertError) throw insertError;
  }

  return { success: true, default_currency: currency };
}

/**
 * Error específico para moneda no configurada en la organización.
 * Permite al endpoint devolver un 400 con código INVALID_CURRENCY.
 */
export class InvalidCurrencyError extends Error {
  code = 'INVALID_CURRENCY' as const;
  currency: string;

  constructor(currency: string) {
    super(`La moneda ${currency} no está configurada para esta organización`);
    this.name = 'InvalidCurrencyError';
    this.currency = currency;
  }
}

/**
 * Error específico para tasas de cambio no disponibles.
 * Permite al endpoint devolver un 503 con código RATE_UNAVAILABLE.
 */
export class RateUnavailableError extends Error {
  code = 'RATE_UNAVAILABLE' as const;
  currency: string;

  constructor(currency: string) {
    super(`No hay tasas de cambio disponibles para ${currency}`);
    this.name = 'RateUnavailableError';
    this.currency = currency;
  }
}

// ─── Tipos auxiliares ───
