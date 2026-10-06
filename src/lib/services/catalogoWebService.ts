/**
 * Lectura del CATÁLOGO COMPLETO de una tienda en línea — SOLO SERVIDOR.
 *
 * Por qué aquí y no en la Edge Function `product-scraper`: las APIs públicas
 * de catálogo (Shopify, WooCommerce, VTEX, Magento, PrestaShop) y el sitemap +
 * JSON-LD son deterministas, no usan IA ni secretos y no cuestan créditos. En
 * un route handler con `withOrg` se reusa la sesión, la organización y el
 * permiso del asistente, se prueban con jest y no hace falta desplegar nada.
 * La lectura va POR PARTES (un cursor por llamada) para que un catálogo de
 * miles de productos no choque con el límite de tiempo de la ruta y el usuario
 * vea el progreso y pueda detenerla. La Edge Function sigue para lo que sí
 * necesita IA: leer UNA página sin catálogo y completar fichas.
 *
 * Guardas: solo http(s) públicos (`urlPublicaSegura` en cada salto de
 * redirección), timeout por petición, tope de tamaño, pausa entre peticiones a
 * la misma tienda y reintento con espera ante 429/5xx. Nada se escribe: los
 * productos vuelven al asistente, que importa por la RPC de siempre.
 */

import { urlPublicaSegura } from '@/lib/services/urlSegura';
import { CONECTORES, detectarPlataforma, ordenDeSondeo } from '@/lib/inventario/importacion/catalogo';
import { conectorGenerico, leerPaginasProducto } from '@/lib/inventario/importacion/catalogo/generica';
import { MAX_URLS_POR_LLAMADA, PLATAFORMAS, type CursorCatalogo, type DeteccionCatalogo, type Lector, type PaginaCatalogo, type RespuestaHttp } from '@/lib/inventario/importacion/catalogo/tipos';

export type { DeteccionCatalogo };
import { mismoSitio } from '@/lib/inventario/importacion/catalogo/util';
import type { ProductoWeb } from '@/lib/inventario/importacion/web';

const AGENTE = 'Mozilla/5.0 (compatible; GOAdmin-Importador/1.0; +catalogo)';
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_CURSOR_BYTES = 256 * 1024;
const MAX_REDIRECCIONES = 4;
const ESPERA_MAXIMA_REINTENTO_MS = 5000;
const BLOQUEADA = Symbol('bloqueada');

export class ErrorCatalogo extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = 'ErrorCatalogo';
  }
}

export interface OpcionesLector {
  timeoutMs?: number;
  pausaMs?: number;
  reintentos?: number;
  /** Para las pruebas. */
  fetchImpl?: typeof fetch;
  dormir?: (ms: number) => Promise<void>;
}

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function leerCuerpo(res: Response): Promise<string | null> {
  const largo = Number(res.headers.get('content-length') ?? 0);
  if (largo > MAX_BYTES) return null;
  if (!res.body) return res.text();
  const lector = res.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await lector.cancel().catch(() => undefined);
      return null;
    }
    partes.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    todo.set(p, pos);
    pos += p.byteLength;
  }
  return new TextDecoder('utf-8').decode(todo);
}

/**
 * `Lector` con las guardas del servidor. Una instancia por llamada a la ruta:
 * la pausa se cuenta entre las peticiones de esa instancia.
 */
export function crearLector(opciones: OpcionesLector = {}): Lector {
  const timeoutMs = opciones.timeoutMs ?? 15_000;
  const pausaMs = opciones.pausaMs ?? 150;
  const reintentos = opciones.reintentos ?? 2;
  const pedir = opciones.fetchImpl ?? fetch;
  const dormir = opciones.dormir ?? dormirReal;
  let ultima = 0;

  /** `BLOQUEADA`: URL o redirección a un host no público. No se reintenta. */
  async function una(url: string, op: Parameters<Lector>[1]): Promise<RespuestaHttp | typeof BLOQUEADA | null> {
    let actual = urlPublicaSegura(url)?.toString() ?? null;
    if (!actual) return BLOQUEADA;
    let metodo = op?.method ?? 'GET';
    let cuerpo = op?.body;
    for (let salto = 0; actual && salto <= MAX_REDIRECCIONES; salto++) {
      const controlador = new AbortController();
      const reloj = setTimeout(() => controlador.abort(), timeoutMs);
      try {
        const res: Response = await pedir(actual, {
          method: metodo,
          body: metodo === 'POST' ? cuerpo : undefined,
          redirect: 'manual',
          signal: controlador.signal,
          headers: { 'User-Agent': AGENTE, 'Accept-Language': 'es-CO,es;q=0.9,en;q=0.6', ...(op?.headers ?? {}) },
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          actual = urlPublicaSegura(new URL(res.headers.get('location')!, actual).toString())?.toString() ?? null;
          if (!actual) return BLOQUEADA;
          if (res.status !== 307 && res.status !== 308) {
            metodo = 'GET';
            cuerpo = undefined;
          }
          continue;
        }
        const texto = await leerCuerpo(res);
        if (texto === null) return null;
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
        return { status: res.status, headers, texto, url: actual };
      } catch {
        return null;
      } finally {
        clearTimeout(reloj);
      }
    }
    return null;
  }

  return async (url, op) => {
    for (let intento = 0; ; intento++) {
      const espera = ultima + pausaMs - Date.now();
      if (espera > 0) await dormir(espera);
      ultima = Date.now();
      const respuesta = await una(url, op);
      if (respuesta === BLOQUEADA) return null;
      const r = respuesta;
      const reintentable = !r || r.status === 429 || r.status === 502 || r.status === 503 || r.status === 504;
      if (!reintentable || intento >= reintentos) return r;
      const retryAfter = Number(r?.headers['retry-after']);
      await dormir(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 800 * (intento + 1), ESPERA_MAXIMA_REINTENTO_MS));
    }
  };
}

function origenSeguro(valor: unknown): string {
  const u = typeof valor === 'string' ? urlPublicaSegura(valor) : null;
  if (!u) throw new ErrorCatalogo('URL inválida: debe empezar por http:// o https:// y ser pública', 400, 'INVALID_URL');
  return u.origin;
}

function claveValida(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const c = v.trim();
  // Las claves del webservice de PrestaShop son 32 caracteres alfanuméricos.
  return /^[A-Za-z0-9]{16,64}$/.test(c) ? c : undefined;
}


/** Detecta la plataforma y confirma que su catálogo público responde. */
export async function detectarCatalogo(urlTexto: unknown, claveCruda?: unknown, opciones: OpcionesLector = {}): Promise<DeteccionCatalogo> {
  const origenPedido = origenSeguro(urlTexto);
  const clave = claveValida(claveCruda);
  const lector = crearLector({ timeoutMs: 10_000, reintentos: 1, ...opciones });
  const inicio = await lector(String(urlTexto), { headers: { Accept: 'text/html,application/xhtml+xml' } });
  // `tienda.myshopify.com` → dominio propio, `http` → `https`, etc.
  const origen = inicio?.url ? new URL(inicio.url).origin : origenPedido;
  const detectadas = inicio ? detectarPlataforma(inicio.texto, inicio.headers) : [];
  const esPrestashop = detectadas.includes('prestashop');

  const intentos = ordenDeSondeo(detectadas);
  if (clave) intentos.unshift('prestashop');
  for (const p of intentos) {
    const sondeo = await CONECTORES[p].sondear(lector, origen, p === 'prestashop' ? clave : undefined);
    if (sondeo) return { ...sondeo, detectada: detectadas[0] ?? p, disponible: true };
  }

  const generica = await conectorGenerico.sondear(lector, origen);
  return {
    plataforma: 'generica',
    detectada: detectadas[0] ?? null,
    origen,
    disponible: !!generica,
    total: generica?.total,
    urlsProducto: generica?.urlsProducto,
    cursor: {},
    avisos: generica?.avisos ?? [],
    requiereClave: esPrestashop && !clave ? true : undefined,
  };
}

function cursorValido(v: unknown): CursorCatalogo {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ErrorCatalogo('Cursor inválido', 400, 'INVALID_CURSOR');
  if (JSON.stringify(v).length > MAX_CURSOR_BYTES) throw new ErrorCatalogo('Cursor demasiado grande', 413, 'CURSOR_TOO_LARGE');
  return v as CursorCatalogo;
}

function traducirError(err: unknown): never {
  const m = err instanceof Error ? err.message : '';
  if (m === 'CATALOGO_NO_DISPONIBLE') throw new ErrorCatalogo('La tienda no respondió con su catálogo', 502, 'CATALOG_UNAVAILABLE');
  if (m === 'PAGINA_FALLIDA') throw new ErrorCatalogo('Una página del catálogo no respondió; se puede reintentar', 503, 'PAGE_FAILED');
  if (m === 'CLAVE_REQUERIDA') throw new ErrorCatalogo('Falta la clave del webservice', 400, 'KEY_REQUIRED');
  throw err;
}

/** Una tanda del catálogo (≈ 300–1 000 productos según la plataforma). */
export async function leerTandaCatalogo(origenCrudo: unknown, plataformaCruda: unknown, cursorCrudo: unknown, claveCruda?: unknown, opciones: OpcionesLector = {}): Promise<PaginaCatalogo> {
  const origen = origenSeguro(origenCrudo);
  const plataforma = PLATAFORMAS.find((p) => p === plataformaCruda);
  if (!plataforma || plataforma === 'generica') throw new ErrorCatalogo('Plataforma no válida', 400, 'INVALID_PLATFORM');
  const cursor = cursorValido(cursorCrudo);
  const clave = claveValida(claveCruda);
  if (plataforma === 'prestashop' && !clave) throw new ErrorCatalogo('Falta la clave del webservice', 400, 'KEY_REQUIRED');
  try {
    return await CONECTORES[plataforma].pagina(crearLector(opciones), origen, cursor, clave);
  } catch (err) {
    traducirError(err);
  }
}

/** Fichas de producto (lectura genérica): hasta `MAX_URLS_POR_LLAMADA` URLs del mismo sitio. */
export async function leerFichasProducto(origenCrudo: unknown, urlsCrudas: unknown, opciones: OpcionesLector = {}): Promise<{ productos: ProductoWeb[]; sinDatos: string[] }> {
  const origen = origenSeguro(origenCrudo);
  if (!Array.isArray(urlsCrudas) || urlsCrudas.length === 0) throw new ErrorCatalogo('Sin URLs', 400, 'URLS_REQUIRED');
  if (urlsCrudas.length > MAX_URLS_POR_LLAMADA) throw new ErrorCatalogo(`Máximo ${MAX_URLS_POR_LLAMADA} URLs por llamada`, 413, 'TOO_MANY_URLS');
  const urls = urlsCrudas
    .filter((u): u is string => typeof u === 'string')
    .map((u) => urlPublicaSegura(u)?.toString())
    .filter((u): u is string => !!u && mismoSitio(u, origen));
  if (urls.length === 0) throw new ErrorCatalogo('Las URLs no son del sitio analizado', 400, 'INVALID_URL');
  return leerPaginasProducto(crearLector({ timeoutMs: 12_000, reintentos: 1, ...opciones }), urls);
}
