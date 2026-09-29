/**
 * Documento legible de cada movimiento de kardex (`fn_inv_documentos`).
 *
 * El kardex, los movimientos, la trazabilidad y la pestaña de inventario del
 * producto enlazan cada fila a su documento (venta, factura, OC, ajuste,
 * traslado, orden de producción, folio, pedido web). El servidor resuelve el
 * número y la ruta en lote y solo para documentos de la organización; aquí se
 * piden en bloques de 500 y se deduplican.
 *
 * Mientras llega la respuesta, `documentoProvisional` da el tipo a partir del
 * origen (sin número ni enlace), para que la celda no salte.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/config';
import { metaOrigen } from './origenesMovimientoStock';
import type { DocumentoMovimiento, RefDocumento } from './nucleo/tipos';

export const MAX_REFS_POR_LLAMADA = 500;

/** Clave estable de una referencia (origen + id + producto). */
export function claveDocumento(ref: RefDocumento): string {
  return `${ref.source}|${ref.source_id ?? ''}|${ref.product_id ?? ''}`;
}

export function documentoProvisional(ref: RefDocumento): DocumentoMovimiento {
  return {
    source: String(ref.source),
    source_id: ref.source_id ?? null,
    product_id: ref.product_id ?? null,
    tipo: metaOrigen(String(ref.source))?.documento ?? 'otro',
    numero: null,
    ruta: null,
  };
}

/** Referencias únicas, en el orden en que aparecen. */
export function refsUnicas(refs: readonly RefDocumento[]): RefDocumento[] {
  const vistas = new Set<string>();
  const salida: RefDocumento[] = [];
  for (const r of refs) {
    const k = claveDocumento(r);
    if (vistas.has(k)) continue;
    vistas.add(k);
    salida.push({ source: r.source, source_id: r.source_id ?? null, product_id: r.product_id ?? null });
  }
  return salida;
}

/**
 * Resuelve los documentos de una página de movimientos. Devuelve un mapa por
 * `claveDocumento`. Lanza el error de la RPC (p. ej. 42501 sin permiso de ver).
 */
export async function resolverDocumentos(
  organizacionId: number,
  refs: readonly RefDocumento[],
  cliente: Pick<SupabaseClient, 'rpc'> = supabase,
): Promise<Map<string, DocumentoMovimiento>> {
  const unicas = refsUnicas(refs);
  const mapa = new Map<string, DocumentoMovimiento>();
  for (let i = 0; i < unicas.length; i += MAX_REFS_POR_LLAMADA) {
    const bloque = unicas.slice(i, i + MAX_REFS_POR_LLAMADA);
    const { data, error } = await cliente.rpc('fn_inv_documentos', { p_org: organizacionId, p_refs: bloque });
    if (error) throw error;
    const docs = (Array.isArray(data) ? data : []) as DocumentoMovimiento[];
    docs.forEach((d, idx) => mapa.set(claveDocumento(bloque[idx]), d));
  }
  return mapa;
}
