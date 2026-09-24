/**
 * Catálogo de Meta (Facebook / Instagram) — SOLO SERVIDOR.
 *
 * - `generateFacebookFeedCSV(org, moneda?)`: el CSV del feed público por token
 *   y de la exportación con sesión. Mismo generador para ambos (formato en
 *   `facebookCatalog/formatoMeta.ts`, fuente única).
 * - `diagnosticarFeed(org, moneda?)`: incluidos, excluidos y por qué.
 * - Token por organización en `organization_preferences.settings`
 *   (`facebook_feed_token`, `facebook_feed_token_created_at`) y última lectura
 *   del feed (`facebook_feed_last_read`).
 *
 * Usa el cliente service role: la organización llega SIEMPRE ya validada
 * (token del feed comparado en tiempo constante, o sesión + membresía en las
 * rutas con `withOrg`). Toda consulta filtra por `organization_id` o por ids de
 * productos de esa organización.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'crypto';
import { getServiceClient } from '@/lib/supabase/server-service';
import { resolveOrgCurrency } from '@/lib/ai/assistant/orgCurrency';
import {
  COLUMNAS_META,
  construirFeedMeta,
  csvMeta,
  type ProductoMeta,
  type ResultadoFeedMeta,
} from '@/lib/services/facebookCatalog/formatoMeta';

/** @deprecated usar `COLUMNAS_META` de `facebookCatalog/formatoMeta`. */
export const FACEBOOK_CATALOG_HEADERS: readonly string[] = COLUMNAS_META;

const BUCKET_IMAGENES = 'product-images';
const LOTE_IDS = 200;
const PAGINA = 1000;

function db(): SupabaseClient {
  return getServiceClient();
}

// ─── Datos del catálogo ─────────────────────────────────────────────────────

interface FilaProducto {
  id: number;
  uuid: string | null;
  sku: string;
  name: string;
  description: string | null;
  brand: string | null;
  barcode: string | null;
  status: string | null;
  product_type: string | null;
  track_stock: boolean | null;
  is_parent: boolean | null;
  parent_product_id: number | null;
  variant_data: unknown;
  categories: { name: string } | { name: string }[] | null;
}

async function porLotes<T>(ids: number[], consulta: (lote: number[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += LOTE_IDS) {
    const { data, error } = await consulta(ids.slice(i, i + LOTE_IDS));
    if (error) throw new Error(error.message);
    if (Array.isArray(data)) out.push(...(data as T[]));
  }
  return out;
}

/** Todos los productos no eliminados de la organización, con precio vigente, stock, imágenes y etiquetas. */
export async function cargarProductosMeta(organizationId: number, sb: SupabaseClient = db()): Promise<ProductoMeta[]> {
  const productos: FilaProducto[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await sb
      .from('products')
      .select('id, uuid, sku, name, description, brand, barcode, status, product_type, track_stock, is_parent, parent_product_id, variant_data, categories(name)')
      .eq('organization_id', organizationId)
      .neq('status', 'deleted')
      .order('id', { ascending: true })
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as unknown as FilaProducto[];
    productos.push(...pagina);
    if (pagina.length < PAGINA) break;
  }
  if (productos.length === 0) return [];
  const ids = productos.map((p) => p.id);
  const ahoraIso = new Date().toISOString();

  const [precios, imagenes, stock, etiquetas] = await Promise.all([
    porLotes<{ product_id: number; price: number | string; compare_price: number | string | null; effective_from: string; effective_to: string | null }>(ids, (lote) =>
      sb.from('product_prices').select('product_id, price, compare_price, effective_from, effective_to').in('product_id', lote).or(`effective_to.is.null,effective_to.gt.${ahoraIso}`),
    ),
    porLotes<{ product_id: number; storage_path: string; is_primary: boolean | null; display_order: number | null }>(ids, (lote) =>
      sb.from('product_images').select('product_id, storage_path, is_primary, display_order').in('product_id', lote),
    ),
    porLotes<{ product_id: number; qty_on_hand: number | null; qty_reserved: number | null }>(ids, (lote) =>
      sb.from('stock_levels').select('product_id, qty_on_hand, qty_reserved').in('product_id', lote),
    ),
    porLotes<{ product_id: number; product_tags: { name: string } | { name: string }[] | null }>(ids, (lote) =>
      sb.from('product_tag_relations').select('product_id, product_tags(name)').in('product_id', lote),
    ),
  ]);

  const precioVigente = new Map<number, (typeof precios)[number]>();
  for (const p of precios) {
    const actual = precioVigente.get(p.product_id);
    if (!actual || new Date(p.effective_from) > new Date(actual.effective_from)) precioVigente.set(p.product_id, p);
  }
  const urlPublica = (ruta: string) => (/^https?:\/\//.test(ruta) ? ruta : sb.storage.from(BUCKET_IMAGENES).getPublicUrl(ruta).data.publicUrl);
  const imagenesPor = new Map<number, (typeof imagenes)[number][]>();
  for (const i of imagenes) if (i.storage_path) imagenesPor.set(i.product_id, [...(imagenesPor.get(i.product_id) ?? []), i]);
  const stockPor = new Map<number, number>();
  for (const s of stock) stockPor.set(s.product_id, (stockPor.get(s.product_id) ?? 0) + Number(s.qty_on_hand ?? 0) - Number(s.qty_reserved ?? 0));
  const etiquetasPor = new Map<number, string[]>();
  for (const e of etiquetas) {
    const t = Array.isArray(e.product_tags) ? e.product_tags[0] : e.product_tags;
    if (t?.name) etiquetasPor.set(e.product_id, [...(etiquetasPor.get(e.product_id) ?? []), t.name]);
  }

  return productos.map((p): ProductoMeta => {
    const precio = precioVigente.get(p.id);
    const cat = Array.isArray(p.categories) ? p.categories[0] : p.categories;
    const imgs = (imagenesPor.get(p.id) ?? [])
      .slice()
      .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary) || (a.display_order ?? 0) - (b.display_order ?? 0))
      .map((i) => urlPublica(i.storage_path))
      .filter(Boolean);
    return {
      id: p.id,
      uuid: p.uuid,
      sku: p.sku,
      name: p.name,
      description: p.description,
      brand: p.brand,
      barcode: p.barcode,
      status: p.status,
      product_type: p.product_type,
      track_stock: p.track_stock,
      is_parent: p.is_parent,
      parent_product_id: p.parent_product_id,
      variant_data: p.variant_data,
      categoria: cat?.name ?? null,
      precio: precio ? Number(precio.price) || 0 : 0,
      precioComparacion: precio?.compare_price ? Number(precio.compare_price) || 0 : 0,
      precioDesde: precio?.effective_from ?? null,
      precioHasta: precio?.effective_to ?? null,
      stock: stockPor.get(p.id) ?? 0,
      imagenes: Array.from(new Set(imgs)),
      etiquetas: etiquetasPor.get(p.id) ?? [],
    };
  });
}

async function dominioVerificado(organizationId: number, sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb
    .from('organization_domains')
    .select('host')
    .eq('organization_id', organizationId)
    .eq('is_primary', true)
    .eq('status', 'verified')
    .order('domain_type', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { host?: string } | null)?.host ?? null;
}

async function nombreOrganizacion(organizationId: number, sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.from('organizations').select('name').eq('id', organizationId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

export interface ContextoMonedaFeed {
  moneda: string;
  decimales: number;
  monedaBase: string;
  factor: number;
  rateDate?: string;
}

/**
 * Moneda del feed: la base de la organización (fuente única `resolveOrgCurrency`,
 * nunca 'COP' fijo) o, si se pide otra, la conversión con la tasa más reciente.
 */
export async function resolverMonedaFeed(organizationId: number, destino: string | null | undefined, sb: SupabaseClient = db()): Promise<ContextoMonedaFeed> {
  const base = await resolveOrgCurrency(sb, organizationId);
  const monedaBase = base.code.toUpperCase();
  const pedido = destino?.trim().toUpperCase();
  if (!pedido || pedido === monedaBase) return { moneda: monedaBase, decimales: base.decimals, monedaBase, factor: 1 };
  const maestra = await getCurrencyMaster(sb, pedido);
  if (!maestra) throw new InvalidCurrencyError(pedido);
  const tasas = await getLatestRates(sb, monedaBase, pedido);
  if (!tasas) throw new RateUnavailableError(pedido);
  return { moneda: pedido, decimales: maestra.decimals, monedaBase, factor: tasas.rateTarget / tasas.rateBase, rateDate: tasas.rateDate };
}

export interface FeedGenerado extends ResultadoFeedMeta {
  csv: string;
  moneda: string;
  monedaBase: string;
  rateDate?: string;
}

export async function generarFeedMeta(organizationId: number, monedaDestino?: string | null): Promise<FeedGenerado> {
  const sb = db();
  const [moneda, productos, dominio, nombre] = await Promise.all([
    resolverMonedaFeed(organizationId, monedaDestino, sb),
    cargarProductosMeta(organizationId, sb),
    dominioVerificado(organizationId, sb),
    nombreOrganizacion(organizationId, sb),
  ]);
  const resultado = construirFeedMeta(productos, {
    moneda: moneda.moneda,
    decimales: moneda.decimales,
    factor: moneda.factor,
    dominio,
    nombreOrganizacion: nombre,
  });
  return { ...resultado, csv: csvMeta(resultado.filas), moneda: moneda.moneda, monedaBase: moneda.monedaBase, rateDate: moneda.rateDate };
}

/** Compatibilidad con la firma anterior (la usa la ruta del feed). */
export async function generateFacebookFeedCSV(
  organizationId: number,
  targetCurrency?: string | null,
): Promise<{ csv: string; count: number; rateDate?: string }> {
  const feed = await generarFeedMeta(organizationId, targetCurrency);
  return { csv: feed.filas.length ? feed.csv : '', count: feed.filas.length, rateDate: feed.rateDate };
}

/**
 * Formato con decimales y separador de miles (Intl). Se conserva por
 * compatibilidad; el feed usa `formatearPrecioMeta` (sin separador de miles,
 * como pide Meta).
 */
export function formatPriceWithDecimals(amount: number, currency: string, decimals: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(amount);
  return `${formatted} ${currency}`;
}

// ─── Monedas ────────────────────────────────────────────────────────────────

export async function getCurrencyMaster(supabase: SupabaseClient, code: string): Promise<{ code: string; name: string; decimals: number } | null> {
  const { data, error } = await supabase.from('currencies').select('code, name, decimals').eq('code', code).eq('is_active', true).maybeSingle();
  if (error) throw error;
  return data;
}

interface OrgCurrency {
  code: string;
  name: string;
  decimals: number;
  is_base: boolean;
}

export async function getOrgCurrencies(supabase: SupabaseClient, organizationId: number): Promise<OrgCurrency[]> {
  const { data: orgRows, error: orgError } = await supabase.from('organization_currencies').select('currency_code, is_base').eq('organization_id', organizationId);
  if (orgError) throw orgError;
  if (!orgRows || orgRows.length === 0) return [];
  const { data: curRows, error: curError } = await supabase.from('currencies').select('code, name, decimals').in('code', orgRows.map((r) => r.currency_code));
  if (curError) throw curError;
  const curMap = new Map<string, { name: string; decimals: number }>();
  for (const c of curRows || []) curMap.set(c.code, { name: c.name, decimals: c.decimals });
  return orgRows.map((row) => {
    const cur = curMap.get(row.currency_code);
    return { code: row.currency_code, name: cur?.name || row.currency_code, decimals: typeof cur?.decimals === 'number' ? cur.decimals : 2, is_base: !!row.is_base };
  });
}

/**
 * Tasas más recientes (misma fecha) de la moneda base y la destino, ambas por 1 USD.
 * `null` si no hay una fecha con las dos.
 */
export async function getLatestRates(supabase: SupabaseClient, baseCode: string, targetCode: string): Promise<{ rateBase: number; rateTarget: number; rateDate: string } | null> {
  const base = baseCode.toUpperCase();
  const target = targetCode.toUpperCase();
  const { data: rates, error } = await supabase
    .from('currency_rates')
    .select('code, rate_date, rate')
    .in('code', [base, target])
    .eq('base_currency_code', 'USD')
    .order('rate_date', { ascending: false })
    .limit(60);
  if (error) throw error;
  if (!rates || rates.length === 0) return null;
  const porFecha = new Map<string, { base?: number; target?: number }>();
  for (const r of rates) {
    const fecha = String(r.rate_date);
    const e = porFecha.get(fecha) ?? {};
    if (String(r.code).toUpperCase() === base) e.base = Number(r.rate);
    if (String(r.code).toUpperCase() === target) e.target = Number(r.rate);
    porFecha.set(fecha, e);
  }
  for (const [fecha, e] of porFecha) {
    if (e.base !== undefined && e.target !== undefined) return { rateBase: e.base, rateTarget: e.target, rateDate: fecha };
  }
  return null;
}

// ─── Token y preferencias del feed ─────────────────────────────────────────

type Ajustes = Record<string, unknown>;

async function leerAjustes(organizationId: number, sb: SupabaseClient): Promise<{ existe: boolean; ajustes: Ajustes }> {
  const { data, error } = await sb.from('organization_preferences').select('organization_id, settings').eq('organization_id', organizationId).maybeSingle();
  if (error) throw new Error(error.message);
  return { existe: !!data, ajustes: ((data as { settings?: Ajustes } | null)?.settings ?? {}) as Ajustes };
}

/** Mezcla claves en `settings` sin pisar las demás. */
async function guardarAjustes(organizationId: number, cambios: Ajustes, sb: SupabaseClient): Promise<void> {
  const { existe, ajustes } = await leerAjustes(organizationId, sb);
  const settings = { ...ajustes, ...cambios };
  const { error } = existe
    ? await sb.from('organization_preferences').update({ settings, updated_at: new Date().toISOString() }).eq('organization_id', organizationId)
    : await sb.from('organization_preferences').insert({ organization_id: organizationId, settings });
  if (error) throw new Error(error.message);
}

function generateToken(organizationId: number): string {
  const orgHash = Buffer.from(`${organizationId}`).toString('base64url').substring(0, 8);
  return `${orgHash}-${randomUUID()}`;
}

export async function getOrCreateFeedToken(organizationId: number): Promise<string> {
  const sb = db();
  const { ajustes } = await leerAjustes(organizationId, sb);
  const existente = ajustes.facebook_feed_token;
  if (typeof existente === 'string' && existente) return existente;
  const token = generateToken(organizationId);
  await guardarAjustes(organizationId, { facebook_feed_token: token, facebook_feed_token_created_at: new Date().toISOString() }, sb);
  return token;
}

/** Comparación en tiempo constante contra el token de ESA organización. */
export async function validateFeedToken(organizationId: number, token: string): Promise<boolean> {
  const { ajustes } = await leerAjustes(organizationId, db());
  const guardado = ajustes.facebook_feed_token;
  if (!guardado || typeof guardado !== 'string' || !token) return false;
  try {
    const a = Buffer.from(guardado);
    const b = Buffer.from(token);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Regenera el token: la URL anterior deja de funcionar. */
export async function regenerateFeedToken(organizationId: number): Promise<string> {
  const token = generateToken(organizationId);
  await guardarAjustes(organizationId, { facebook_feed_token: token, facebook_feed_token_created_at: new Date().toISOString() }, db());
  return token;
}

export interface LecturaFeed {
  at: string;
  productos: number;
  moneda: string;
  agente: string | null;
}

/**
 * Deja constancia de la última lectura del feed (lo que ve el diálogo como
 * «Última lectura de Meta»). Como mucho una escritura cada 5 minutos, y nunca
 * rompe la respuesta del feed.
 */
export async function registrarLecturaFeed(organizationId: number, lectura: Omit<LecturaFeed, 'at'>): Promise<void> {
  try {
    const sb = db();
    const { ajustes } = await leerAjustes(organizationId, sb);
    const previa = ajustes.facebook_feed_last_read as LecturaFeed | undefined;
    if (previa?.at && Date.now() - new Date(previa.at).getTime() < 5 * 60 * 1000) return;
    await guardarAjustes(organizationId, { facebook_feed_last_read: { ...lectura, at: new Date().toISOString(), agente: lectura.agente?.slice(0, 120) ?? null } }, sb);
  } catch (err) {
    console.warn('[facebookFeed] No se pudo registrar la lectura del feed:', err instanceof Error ? err.message : err);
  }
}

export interface FeedCurrency {
  code: string;
  name: string;
  decimals: number;
  is_base: boolean;
}

export interface FeedConfig {
  token: string;
  tokenCreadoEn: string | null;
  currencies: FeedCurrency[];
  rateDate: string | null;
  defaultCurrency: string | null;
  baseCurrency: string;
  ultimaLectura: LecturaFeed | null;
}

/**
 * Monedas del feed: solo las ACTIVAS de la organización (`organization_currencies`),
 * la base marcada, fecha de la última tasa y la moneda por defecto guardada.
 */
export async function getFeedCurrencies(organizationId: number, supabase: SupabaseClient = db()): Promise<Omit<FeedConfig, 'token' | 'tokenCreadoEn' | 'ultimaLectura'>> {
  const [orgCurrencies, base, rateRes, ajustes] = await Promise.all([
    getOrgCurrencies(supabase, organizationId),
    resolveOrgCurrency(supabase, organizationId),
    supabase.from('currency_rates').select('rate_date').order('rate_date', { ascending: false }).limit(1).maybeSingle(),
    leerAjustes(organizationId, supabase),
  ]);
  const baseCode = base.code.toUpperCase();
  const currencies: FeedCurrency[] = orgCurrencies.map((c) => ({ ...c, is_base: c.code.toUpperCase() === baseCode }));
  if (!currencies.some((c) => c.is_base)) currencies.unshift({ code: baseCode, name: baseCode, decimals: base.decimals, is_base: true });
  const porDefecto = ajustes.ajustes.facebook_feed_default_currency;
  return {
    currencies,
    rateDate: (rateRes.data as { rate_date?: string } | null)?.rate_date ?? null,
    defaultCurrency: typeof porDefecto === 'string' ? porDefecto : null,
    baseCurrency: baseCode,
  };
}

export async function getFeedConfig(organizationId: number): Promise<FeedConfig> {
  const sb = db();
  const token = await getOrCreateFeedToken(organizationId);
  const [monedas, { ajustes }] = await Promise.all([getFeedCurrencies(organizationId, sb), leerAjustes(organizationId, sb)]);
  return {
    token,
    tokenCreadoEn: typeof ajustes.facebook_feed_token_created_at === 'string' ? ajustes.facebook_feed_token_created_at : null,
    ultimaLectura: (ajustes.facebook_feed_last_read as LecturaFeed | undefined) ?? null,
    ...monedas,
  };
}

/** Moneda por defecto del feed: debe ser una moneda activa de la organización. */
export async function setDefaultFeedCurrency(organizationId: number, currency: string): Promise<{ success: true; default_currency: string }> {
  const sb = db();
  const codigo = currency.toUpperCase();
  const activas = await getOrgCurrencies(sb, organizationId);
  const base = await resolveOrgCurrency(sb, organizationId);
  if (!activas.some((c) => c.code.toUpperCase() === codigo) && base.code.toUpperCase() !== codigo) throw new InvalidCurrencyError(codigo);
  await guardarAjustes(organizationId, { facebook_feed_default_currency: codigo }, sb);
  return { success: true, default_currency: codigo };
}

/** Moneda por defecto guardada (o `null`). La usa el feed cuando la URL no trae `currency`. */
export async function monedaPorDefectoFeed(organizationId: number): Promise<string | null> {
  const { ajustes } = await leerAjustes(organizationId, db());
  const m = ajustes.facebook_feed_default_currency;
  return typeof m === 'string' && /^[A-Z]{3}$/i.test(m) ? m.toUpperCase() : null;
}

// ─── Errores ────────────────────────────────────────────────────────────────

export class InvalidCurrencyError extends Error {
  code = 'INVALID_CURRENCY' as const;
  currency: string;
  constructor(currency: string) {
    super(`La moneda ${currency} no está configurada para esta organización`);
    this.name = 'InvalidCurrencyError';
    this.currency = currency;
  }
}

export class RateUnavailableError extends Error {
  code = 'RATE_UNAVAILABLE' as const;
  currency: string;
  constructor(currency: string) {
    super(`No hay tasas de cambio disponibles para ${currency}`);
    this.name = 'RateUnavailableError';
    this.currency = currency;
  }
}
