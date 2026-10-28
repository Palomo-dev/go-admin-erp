/**
 * Llamadas del asistente de importación a las rutas del servidor. La
 * organización la decide el servidor (sesión); el header solo dice cuál es la
 * activa en esta pestaña y el servidor lo valida contra la membresía.
 */

import type { CuerpoLote } from '@/lib/inventario/importacion/payload';
import type { ResultadoFila } from '@/lib/inventario/importacion/tipos';
import type { ProductoWeb } from '@/lib/inventario/importacion/web';
import type { CursorCatalogo, DeteccionCatalogo, PaginaCatalogo, Plataforma } from '@/lib/inventario/importacion/catalogo/tipos';

export class ErrorApi extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message);
    this.name = 'ErrorApi';
  }
}

async function llamar<T>(url: string, orgId: number | undefined, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (orgId) headers['x-organization-id'] = String(orgId);
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } });
  const tipo = res.headers.get('content-type') || '';
  const esJson = tipo.includes('application/json');
  // Si el servidor redirigió (p. ej. al login) o devolvió HTML, NO es un éxito
  // vacío: antes `res.json().catch(() => ({}))` lo tomaba como `{}` y el lote
  // «terminaba» sin crear nada.
  if (res.redirected || /\/auth\/login/.test(res.url || '')) {
    throw new ErrorApi('La sesión se cerró o está dañada. Vuelve a iniciar sesión y retoma la importación.', 401, 'SESION_CORRUPTA');
  }
  let json: (T & { error?: string; code?: string }) | null = null;
  if (esJson) {
    try {
      json = (await res.json()) as T & { error?: string; code?: string };
    } catch {
      json = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && json?.error === 'sesion_corrupta') {
      throw new ErrorApi('La sesión está dañada. Vuelve a iniciar sesión y retoma la importación.', 401, 'SESION_CORRUPTA');
    }
    throw new ErrorApi(json?.error || `Error del servidor (HTTP ${res.status})`, res.status, json?.code || 'ERROR');
  }
  if (!json) {
    throw new ErrorApi('Respuesta inesperada del servidor (no es JSON).', res.status, 'RESPUESTA_NO_JSON');
  }
  return json;
}

export interface ContextoServidor {
  existentes: Record<string, number>;
  /** SKU (en mayúsculas) que ya son padres con variantes: no reciben stock (opcional por compatibilidad). */
  padres?: string[];
  porNombre: Record<string, { id: number; sku: string }>;
  categorias: string[];
  impuestos: string[];
}

export function pedirContexto(orgId: number | undefined, skus: string[], nombres: string[] = []): Promise<ContextoServidor> {
  return llamar('/api/inventario/productos/importar/contexto', orgId, { method: 'POST', body: JSON.stringify({ skus, nombres }) });
}

export interface RespuestaLote {
  creados: number;
  actualizados: number;
  omitidos: number;
  fallidos: number;
  resultados: ResultadoFila[];
}

export function enviarLote(orgId: number | undefined, cuerpo: CuerpoLote): Promise<RespuestaLote> {
  return llamar('/api/inventario/productos/importar/lote', orgId, { method: 'POST', body: JSON.stringify(cuerpo) });
}

export interface SaldoWeb {
  saldo: number;
  permitido: boolean;
  costos: { analisis: number; detalle: number };
}

export function pedirSaldoWeb(orgId: number | undefined): Promise<SaldoWeb> {
  return llamar('/api/inventario/productos/importar-web', orgId, { method: 'GET' });
}

export function analizarWeb(orgId: number | undefined, url: string, signal?: AbortSignal): Promise<{ productos: ProductoWeb[]; ia: boolean; creditos: number }> {
  return llamar('/api/inventario/productos/importar-web', orgId, { method: 'POST', body: JSON.stringify({ accion: 'analizar', url }), signal });
}

export function detallarWeb(orgId: number | undefined, url: string): Promise<{ producto: ProductoWeb | null; ia: boolean; creditos: number }> {
  return llamar('/api/inventario/productos/importar-web', orgId, { method: 'POST', body: JSON.stringify({ accion: 'detallar', url }) });
}

// ── Catálogo completo por la API pública de la tienda (sin IA, sin costo) ──

export function detectarCatalogoWeb(orgId: number | undefined, url: string, clave?: string, signal?: AbortSignal): Promise<DeteccionCatalogo> {
  return llamar('/api/inventario/productos/importar-web', orgId, { method: 'POST', body: JSON.stringify({ accion: 'detectar', url, clave: clave || undefined }), signal });
}

export function leerTandaCatalogoWeb(
  orgId: number | undefined,
  datos: { origen: string; plataforma: Plataforma; cursor: CursorCatalogo; clave?: string },
  signal?: AbortSignal,
): Promise<PaginaCatalogo> {
  return llamar('/api/inventario/productos/importar-web', orgId, { method: 'POST', body: JSON.stringify({ accion: 'catalogo', ...datos, clave: datos.clave || undefined }), signal });
}

export function leerFichasWeb(orgId: number | undefined, origen: string, urls: string[], signal?: AbortSignal): Promise<{ productos: ProductoWeb[]; sinDatos: string[] }> {
  return llamar('/api/inventario/productos/importar-web', orgId, { method: 'POST', body: JSON.stringify({ accion: 'fichas', origen, urls }), signal });
}
