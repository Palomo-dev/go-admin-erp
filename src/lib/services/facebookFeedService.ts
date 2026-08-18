/**
 * Servicio server-side para generar el feed de catálogo de Facebook.
 * Usa Supabase service role key (sin RLS) para consultar todos los productos.
 * Reutiliza la lógica de facebookCatalogExport.ts pero con cliente admin.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

function getServerSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

/**
 * Genera el CSV del catálogo de Facebook para una organización.
 * Retorna el contenido CSV listo para servir como feed.
 */
export async function generateFacebookFeedCSV(
  organizationId: number
): Promise<{ csv: string; count: number }> {
  const supabase = getServerSupabase();

  // 1. Obtener moneda base
  const { data: currencyData } = await supabase
    .from('organization_currencies')
    .select('currency_code')
    .eq('organization_id', organizationId)
    .eq('is_base', true)
    .maybeSingle();
  const currency = currencyData?.currency_code || 'COP';

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
  let mainProducts: any[] = [];
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

  const productIds = mainProducts.map((p: any) => p.id);

  // 5. Consultar hijos (variantes)
  let childrenData: any[] = [];
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
  const childrenMap = new Map<number, any[]>();
  childrenData.forEach((child: any) => {
    const parentId = child.parent_product_id;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(child);
  });

  // 7. Recopilar todos los ids para consultar relaciones
  const allIds = [...productIds, ...childrenData.map((c: any) => c.id)];

  const batchedFetch = async (table: string, select: string, column: string) => {
    const allData: any[] = [];
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
  const pricesMap = new Map<number, any[]>();
  pricesData.forEach((p: any) => {
    if (!pricesMap.has(p.product_id)) pricesMap.set(p.product_id, []);
    pricesMap.get(p.product_id)!.push(p);
  });

  const imagesMap = new Map<number, any[]>();
  imagesData.forEach((img: any) => {
    if (!imagesMap.has(img.product_id)) imagesMap.set(img.product_id, []);
    imagesMap.get(img.product_id)!.push(img);
  });

  const stockMap = new Map<number, number>();
  stockData.forEach((s: any) => {
    const available = (s.qty_on_hand || 0) - (s.qty_reserved || 0);
    stockMap.set(s.product_id, (stockMap.get(s.product_id) || 0) + available);
  });

  const tagsMap = new Map<number, string[]>();
  if (tagsRelationsData && tagsRelationsData.length > 0) {
    tagsRelationsData.forEach((rel: any) => {
      const tag = tagsData.find((t: any) => t.id === rel.tag_id);
      if (tag) {
        const existing = tagsMap.get(rel.product_id) || [];
        existing.push(tag.name);
        tagsMap.set(rel.product_id, existing);
      }
    });
  }

  // 9. Construir filas CSV
  const rows: FacebookRow[] = [];

  const buildProductData = (raw: any) => {
    const pid = raw.id;
    const prices = pricesMap.get(pid) || [];
    const validPrices = prices
      .filter((pp: any) => !pp.effective_to || new Date(pp.effective_to) > new Date())
      .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
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
    const pid = Number(product.id);
    rows.push(buildFacebookRow(product, '', currency, webDomain, organizationName, tagsMap.get(pid) || [], undefined));

    const children = childrenMap.get(raw.id) || [];
    for (const childRaw of children) {
      const child = buildProductData(childRaw);
      const childId = Number(child.id);
      rows.push(buildFacebookRow(child, product.sku || '', currency, webDomain, organizationName, tagsMap.get(childId) || tagsMap.get(pid) || [], product));
    }
  }

  // 10. Generar CSV
  const csvContent = buildCSV(rows);
  return { csv: csvContent, count: rows.length };
}

// ─── Helpers (duplicados de facebookCatalogExport para uso server-side) ───

function buildFacebookRow(
  product: any,
  parentSku: string,
  currency: string,
  webDomain?: string,
  organizationName?: string,
  tags?: string[],
  parentData?: any
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
  const priceStr = price > 0 ? formatPrice(price, currency) : '';

  const comparePrice = product.compare_price ?? parentData?.compare_price ?? 0;
  const salePriceStr = comparePrice > 0 ? formatPrice(comparePrice, currency) : '';

  const pricesSource = (product.product_prices && product.product_prices.length > 0)
    ? product.product_prices
    : parentData?.product_prices;
  let saleDateRange = '';
  if (comparePrice > 0 && pricesSource && pricesSource.length > 0) {
    const validPrice = pricesSource
      .filter((pp: any) => !pp.effective_to || new Date(pp.effective_to) > new Date())
      .sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];
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
    const primaryImg = imagesSource.find((img: any) => img.is_primary);
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

function extractVariantData(variantData: any): VariantInfo {
  const info: VariantInfo = {};
  if (!variantData) return info;
  try {
    const vd = typeof variantData === 'string' ? JSON.parse(variantData) : variantData;
    if (Array.isArray(vd)) {
      vd.forEach((attr: any) => {
        const type = (attr.type || attr.name || '').toLowerCase();
        const value = attr.value || '';
        assignVariantField(info, type, value);
      });
    } else if (vd.attributes && Array.isArray(vd.attributes)) {
      vd.attributes.forEach((attr: any) => {
        const type = (attr.type || attr.name || '').toLowerCase();
        const value = attr.value || '';
        assignVariantField(info, type, value);
      });
    } else {
      Object.entries(vd).forEach(([key, value]) => {
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
  return storedToken === token;
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
  const random = Math.random().toString(36).substring(2, 15);
  const timestamp = Date.now().toString(36);
  const orgHash = Buffer.from(`${organizationId}`).toString('base64url').substring(0, 8);
  return `${orgHash}-${timestamp}-${random}`;
}
