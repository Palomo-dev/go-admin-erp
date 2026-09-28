/**
 * Llamadas del asistente de importación a las rutas del servidor. La
 * organización la decide el servidor (sesión); el header solo dice cuál es la
 * activa en esta pestaña y el servidor lo valida contra la membresía.
 */

import type { CuerpoLote } from '@/lib/inventario/importacion/payload';
import type { ResultadoFila } from '@/lib/inventario/importacion/tipos';
import type { ProductoWeb } from '@/lib/inventario/importacion/web';

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
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new ErrorApi(json.error || `HTTP ${res.status}`, res.status, json.code || 'ERROR');
  return json;
}

export interface ContextoServidor {
  existentes: Record<string, number>;
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
