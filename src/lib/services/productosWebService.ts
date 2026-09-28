/**
 * Importación de productos desde una web (scraping con IA) — SOLO SERVIDOR.
 *
 * Llama a la Edge Function `product-scraper` con el secreto interno (la
 * función ya no acepta llamadas sin él: antes estaba abierta a internet y su
 * acción `import` escribía con service role en la organización que dijera el
 * body). Créditos de IA con el punto único de cobro:
 *   1. se comprueba el saldo ANTES de llamar al proveedor (`checkAICredits`);
 *   2. se cobra DESPUÉS de que responda, y solo si intervino la IA
 *      (`chargeAiCredits`);
 *   3. si el proveedor falla no se cobra nada.
 */

import { getServiceClient } from '@/lib/supabase/server-service';
import { checkAICredits } from '@/lib/services/aiCreditsService';
import { chargeAiCredits, InsufficientCreditsError } from '@/lib/services/crm/aiCostService';
import { urlPublicaSegura } from '@/lib/services/urlSegura';
import { CREDITOS_ANALISIS_WEB, CREDITOS_DETALLE_WEB } from '@/lib/inventario/importacion/costosWeb';
import type { ProductoWeb } from '@/lib/inventario/importacion/web';

const MODELO_SCRAPER = 'gpt-4o-mini';
const TIMEOUT_ANALISIS_MS = 170_000;
const TIMEOUT_DETALLE_MS = 60_000;

export class ErrorWeb extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = 'ErrorWeb';
  }
}

let secretoCache: string | null = null;
async function secretoInterno(): Promise<string> {
  if (secretoCache) return secretoCache;
  const desdeEntorno = process.env.AI_INTERNAL_SECRET;
  if (desdeEntorno) return (secretoCache = desdeEntorno);
  const { data, error } = await getServiceClient().rpc('get_ai_internal_secret');
  if (error || !data) throw new ErrorWeb('El servicio de lectura web no está disponible', 503, 'SCRAPER_UNAVAILABLE');
  secretoCache = String(data);
  return secretoCache;
}

interface RespuestaScraper {
  products?: ProductoWeb[];
  product?: ProductoWeb | null;
  ia?: boolean;
  error?: string;
}

async function llamarScraper(cuerpo: Record<string, unknown>, timeoutMs: number): Promise<RespuestaScraper> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) throw new ErrorWeb('Configuración incompleta', 500, 'CONFIG');
  const controlador = new AbortController();
  const t = setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/functions/v1/product-scraper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': await secretoInterno(),
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
      },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
    });
    const json = (await res.json().catch(() => ({}))) as RespuestaScraper;
    if (!res.ok || json.error) throw new ErrorWeb(json.error || `La lectura de la página falló (${res.status})`, 502, 'PROVIDER_ERROR');
    return json;
  } catch (err) {
    if (err instanceof ErrorWeb) throw err;
    if ((err as { name?: string })?.name === 'AbortError') throw new ErrorWeb('La página tardó demasiado en responder', 504, 'PROVIDER_TIMEOUT');
    throw new ErrorWeb('No se pudo leer la página', 502, 'PROVIDER_ERROR');
  } finally {
    clearTimeout(t);
  }
}

export interface SaldoWeb {
  saldo: number;
  permitido: boolean;
  costos: { analisis: number; detalle: number };
}

export async function saldoParaWeb(orgId: number): Promise<SaldoWeb> {
  const c = await checkAICredits(orgId);
  return { saldo: c.creditsRemaining, permitido: c.allowed, costos: { analisis: CREDITOS_ANALISIS_WEB, detalle: CREDITOS_DETALLE_WEB } };
}

async function exigirSaldo(orgId: number, creditos: number): Promise<void> {
  const c = await checkAICredits(orgId);
  if (!c.allowed || c.creditsRemaining < creditos) {
    throw new ErrorWeb(`Créditos de IA insuficientes: se necesitan ${creditos} y quedan ${c.creditsRemaining}`, 402, 'insufficient_credits');
  }
}

async function cobrar(orgId: number, userId: string, accion: string, creditos: number, metadata: Record<string, unknown>): Promise<number> {
  try {
    const cargo = await chargeAiCredits({ orgId, userId, actionType: accion, model: MODELO_SCRAPER, units: creditos * 1000, credits: creditos, metadata });
    return cargo.credits;
  } catch (err) {
    if (err instanceof InsufficientCreditsError) throw new ErrorWeb('Créditos de IA insuficientes', 402, err.code);
    throw err;
  }
}

function validarUrl(url: unknown): string {
  const u = typeof url === 'string' ? urlPublicaSegura(url) : null;
  if (!u) throw new ErrorWeb('URL inválida: debe empezar por http:// o https:// y ser pública', 400, 'INVALID_URL');
  return u.toString();
}

/** Lista de productos de la página. Cobra solo si la leyó la IA. */
export async function analizarPagina(orgId: number, userId: string, url: unknown): Promise<{ productos: ProductoWeb[]; ia: boolean; creditos: number }> {
  const destino = validarUrl(url);
  await exigirSaldo(orgId, CREDITOS_ANALISIS_WEB);
  const r = await llamarScraper({ action: 'preview', url: destino }, TIMEOUT_ANALISIS_MS);
  const productos = Array.isArray(r.products) ? r.products.filter((p) => p && typeof p.name === 'string' && p.name.trim()) : [];
  const ia = r.ia !== false;
  // Sin productos no hubo generación útil: no se cobra.
  const creditos = ia && productos.length > 0 ? await cobrar(orgId, userId, 'product_scraping', CREDITOS_ANALISIS_WEB, { host: new URL(destino).host, productos: productos.length }) : 0;
  return { productos: productos.slice(0, 5000), ia, creditos };
}

/** Ficha de un producto (descripción, galería, variantes). Cobra solo si la leyó la IA. */
export async function detallarProducto(orgId: number, userId: string, url: unknown): Promise<{ producto: ProductoWeb | null; ia: boolean; creditos: number }> {
  const destino = validarUrl(url);
  await exigirSaldo(orgId, CREDITOS_DETALLE_WEB);
  const r = await llamarScraper({ action: 'enrich', url: destino }, TIMEOUT_DETALLE_MS);
  const producto = r.product && typeof r.product.name === 'string' ? r.product : null;
  const ia = r.ia !== false;
  const creditos = ia && producto ? await cobrar(orgId, userId, 'product_scraping_detail', CREDITOS_DETALLE_WEB, { host: new URL(destino).host }) : 0;
  return { producto, ia, creditos };
}
