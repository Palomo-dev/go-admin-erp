/**
 * Servicio de exportación de productos a formato catálogo de Facebook
 *
 * Genera archivos CSV/XLSX compatibles con Facebook Commerce Manager.
 * Toma datos de: products, product_prices, product_images, stock_levels,
 * categories, product_tags, variant_data, suppliers, organization_domains.
 */

import { supabase } from '@/lib/supabase/config';
import { Producto } from './types';

// ─── Columnas del catálogo de Facebook ───
export const FACEBOOK_CATALOG_HEADERS = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'link',
  'image_link',
  'brand',
  'google_product_category',
  'fb_product_category',
  'quantity_to_sell_on_facebook',
  'sale_price',
  'sale_price_effective_date',
  'item_group_id',
  'gender',
  'color',
  'size',
  'age_group',
  'material',
  'pattern',
  'shipping',
  'shipping_weight',
  'offer_disclaimer',
  'offer_disclaimer_url',
  'video[0].url',
  'video[0].tag[0]',
  'gtin',
  'product_tags[0]',
  'product_tags[1]',
  'style[0]',
];

interface FacebookExportOptions {
  organizationId: number;
  products: Producto[];
  /** Moneda base de la organización (ej: COP, USD) */
  currency: string;
  /** Dominio web de la organización (ej: miempresa.goadmin.io) */
  webDomain?: string;
  /** Nombre de la organización (fallback para brand) */
  organizationName?: string;
}

interface FacebookRow {
  [key: string]: string;
}

/**
 * Función principal: genera el CSV en formato Facebook Catalog
 */
export async function exportToFacebookCatalog(
  options: FacebookExportOptions
): Promise<{ csv: string; count: number }> {
  const { organizationId, products, currency, webDomain, organizationName } = options;

  // Filtrar solo productos activos y no eliminados
  const activeProducts = products.filter(
    (p) => p.status === 'active' && p.product_type !== 'service'
  );

  if (activeProducts.length === 0) {
    return { csv: '', count: 0 };
  }

  // Obtener IDs de productos para consultas batch
  const allProductIds: number[] = [];
  activeProducts.forEach((p) => {
    const pid = Number(p.id);
    if (!isNaN(pid)) allProductIds.push(pid);
    if (p.children && p.children.length > 0) {
      p.children.forEach((c) => {
        const cid = Number(c.id);
        if (!isNaN(cid)) allProductIds.push(cid);
      });
    }
  });

  // Consultar datos adicionales en paralelo
  const [tagsData, tagsRelationsData, supplierData] = await Promise.all([
    fetchProductTags(organizationId),
    fetchProductTagRelations(allProductIds),
    fetchSuppliersForProducts(allProductIds),
  ]);

  // Mapear tags por producto
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

  // Mapear proveedores por producto (vía product_costs.supplier_id)
  const supplierMap = new Map<number, string>();
  if (supplierData && supplierData.length > 0) {
    supplierData.forEach((s: any) => {
      supplierMap.set(s.product_id, s.supplier_name || '');
    });
  }

  // Generar filas
  const rows: FacebookRow[] = [];

  for (const product of activeProducts) {
    const pid = Number(product.id);

    // Producto padre (o producto simple sin variantes)
    rows.push(
      buildFacebookRow(
        product,
        '',
        currency,
        webDomain,
        organizationName,
        tagsMap.get(pid) || [],
        undefined
      )
    );

    // Variantes (productos hijos) — heredan datos del padre
    if (product.children && product.children.length > 0) {
      for (const child of product.children) {
        const childId = Number(child.id);
        rows.push(
          buildFacebookRow(
            child as Producto,
            product.sku || '',
            currency,
            webDomain,
            organizationName,
            tagsMap.get(childId) || tagsMap.get(pid) || [],
            product
          )
        );
      }
    }
  }

  // Generar CSV
  const csvContent = buildCSV(rows);

  return { csv: csvContent, count: rows.length };
}

// ─── Helpers ───

function buildFacebookRow(
  product: Producto,
  parentSku: string,
  currency: string,
  webDomain?: string,
  organizationName?: string,
  tags?: string[],
  parentData?: Producto
): FacebookRow {
  const pid = Number(product.id);
  const sku = product.sku || String(pid);
  const name = product.name || '';
  const description = product.description || parentData?.description || '';
  const brand = product.brand || parentData?.brand || organizationName || '';
  const barcode = product.barcode || parentData?.barcode || '';
  const uuid = product.uuid || parentData?.uuid || '';

  // Availability — heredar stock del padre si el hijo no tiene
  const stock = product.stock ?? parentData?.stock ?? 0;
  const availability = stock > 0 ? 'in stock' : 'out of stock';

  // Price — heredar precio del padre si el hijo no tiene
  const price = product.price ?? parentData?.price ?? 0;
  const priceStr = price > 0 ? formatPrice(price, currency) : '';

  // Sale price — heredar compare_price del padre si el hijo no tiene
  const comparePrice = product.compare_price ?? parentData?.compare_price ?? 0;
  const salePriceStr = comparePrice > 0 ? formatPrice(comparePrice, currency) : '';

  // Sale price effective date — usar precios del padre si el hijo no tiene
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

  // Link — usar uuid del padre si el hijo no tiene
  let link = '';
  if (webDomain && uuid) {
    link = `https://${webDomain}/productos/${uuid}`;
  }

  // Image link — heredar imágenes del padre si el hijo no tiene
  const imagesSource = (product.product_images && product.product_images.length > 0)
    ? product.product_images
    : parentData?.product_images;
  let imageLink = '';
  if (imagesSource && imagesSource.length > 0) {
    const primaryImg = imagesSource.find((img: any) => img.is_primary);
    const img = primaryImg || imagesSource[0];
    if (img && (img as any).storage_path) {
      const { data: urlData } = supabase.storage
        .from('product-images')
        .getPublicUrl((img as any).storage_path);
      imageLink = urlData?.publicUrl || '';
    }
  }

  // Categoría — heredar del padre si el hijo no tiene
  const categoryName = product.category?.name || parentData?.category?.name || '';

  // Quantity — heredar track_stock del padre si el hijo no lo tiene
  const trackStock = product.track_stock ?? parentData?.track_stock ?? true;
  const quantity = trackStock === false ? '' : String(Math.max(0, Math.floor(stock)));

  // Item group ID (SKU del padre para variantes)
  const itemGroupId = parentSku || (product.is_parent ? sku : '');

  // Variant data → extraer color, size, gender, material, pattern
  const variantInfo = extractVariantData((product as any).variant_data);

  // Tags
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

interface VariantInfo {
  gender?: string;
  color?: string;
  size?: string;
  age_group?: string;
  material?: string;
  pattern?: string;
}

function extractVariantData(variantData: any): VariantInfo {
  const info: VariantInfo = {};

  if (!variantData) return info;

  try {
    const vd = typeof variantData === 'string' ? JSON.parse(variantData) : variantData;

    // variant_data puede tener estructura como:
    // { "Color": "Rojo", "Talla": "M", "Género": "Unisex" }
    // o { "attributes": [{ "type": "Color", "value": "Rojo" }] }

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
      // Objeto plano: { "Color": "Rojo", "Talla": "M" }
      Object.entries(vd).forEach(([key, value]) => {
        const type = key.toLowerCase();
        assignVariantField(info, type, String(value));
      });
    }
  } catch {
    // Si no se puede parsear, retornar info vacío
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

// ─── Consultas a Supabase ───

async function fetchProductTags(organizationId: number): Promise<any[]> {
  const { data, error } = await supabase
    .from('product_tags')
    .select('id, name')
    .eq('organization_id', organizationId);

  if (error) {
    console.error('Error fetching product tags:', error);
    return [];
  }
  return data || [];
}

async function fetchProductTagRelations(productIds: number[]): Promise<any[]> {
  if (productIds.length === 0) return [];

  const BATCH = 200;
  const allData: any[] = [];

  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('product_tag_relations')
      .select('product_id, tag_id')
      .in('product_id', batch);

    if (error) {
      console.error('Error fetching tag relations:', error);
      continue;
    }
    if (data) allData.push(...data);
  }

  return allData;
}

async function fetchSuppliersForProducts(productIds: number[]): Promise<any[]> {
  if (productIds.length === 0) return [];

  // Obtener supplier_id desde product_costs (relación más reciente)
  const BATCH = 200;
  const allData: any[] = [];

  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('product_costs')
      .select('product_id, supplier_id, suppliers(id, name)')
      .in('product_id', batch)
      .order('effective_from', { ascending: false });

    if (error) {
      console.error('Error fetching suppliers:', error);
      continue;
    }
    if (data) {
      // Solo tomar el primer registro por producto (el más reciente)
      const seen = new Set<number>();
      data.forEach((row: any) => {
        if (!seen.has(row.product_id)) {
          seen.add(row.product_id);
          allData.push({
            product_id: row.product_id,
            supplier_name: row.suppliers?.name || '',
          });
        }
      });
    }
  }

  return allData;
}

/**
 * Obtiene el dominio web principal de una organización
 */
export async function getOrganizationDomain(organizationId: number): Promise<string | null> {
  const { data, error } = await supabase
    .from('organization_domains')
    .select('host')
    .eq('organization_id', organizationId)
    .eq('is_primary', true)
    .eq('status', 'verified')
    .order('domain_type', { ascending: false }) // custom_domain primero
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data.host;
}

/**
 * Obtiene la moneda base de una organización
 */
export async function getOrganizationCurrency(organizationId: number): Promise<string> {
  const { data, error } = await supabase
    .from('organization_currencies')
    .select('currency_code')
    .eq('organization_id', organizationId)
    .eq('is_base', true)
    .maybeSingle();

  if (error || !data) return 'COP';
  return data.currency_code || 'COP';
}

/**
 * Descarga el CSV como archivo en el navegador
 */
export function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Consulta TODOS los productos de la organización desde la BD,
 * con todas las relaciones necesarias para el export a Facebook.
 * No depende del estado de la UI (que puede estar filtrado o paginado).
 */
export async function fetchAllProductsForFacebook(
  organizationId: number
): Promise<Producto[]> {
  const PAGE_SIZE = 200;

  // 1. Consultar productos padres activos con paginación
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

  if (mainProducts.length === 0) return [];

  const productIds = mainProducts.map((p: any) => p.id);

  // 2. Consultar hijos (variantes) con paginación por lotes
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

  // 3. Mapear hijos por parent_product_id
  const childrenMap = new Map<number, any[]>();
  childrenData.forEach((child: any) => {
    const parentId = child.parent_product_id;
    if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
    childrenMap.get(parentId)!.push(child);
  });

  // 4. Recopilar TODOS los ids (padres + hijos) para consultar relaciones
  const allIds = [...productIds, ...childrenData.map((c: any) => c.id)];

  // 5. Consultar relaciones en paralelo con paginación
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

  const [pricesData, imagesData, stockData] = await Promise.all([
    batchedFetch('product_prices', 'id, product_id, price, compare_price, effective_from, effective_to', 'product_id'),
    batchedFetch('product_images', 'id, product_id, storage_path, is_primary', 'product_id'),
    batchedFetch('stock_levels', 'product_id, branch_id, qty_on_hand, qty_reserved', 'product_id'),
  ]);

  // 6. Mapear relaciones por product_id
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

  // 7. Construir array de Producto con todas las relaciones
  const buildProduct = (raw: any): Producto => {
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
    } as Producto;
  };

  const result: Producto[] = mainProducts.map((raw: any) => {
    const product = buildProduct(raw);
    const children = (childrenMap.get(raw.id) || []).map(buildProduct);
    (product as any).children = children;
    return product;
  });

  return result;
}
