import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Búsqueda de terceros (clientes, proveedores y empleados) en el servidor.
 * RPC `fn_terceros_buscar`: SECURITY DEFINER, comprueba la organización y no
 * admite anónimo. El texto viaja como argumento; no se interpola en `.or()`.
 */

export interface FilaTerceroBusqueda {
  tipo: 'cliente' | 'proveedor' | 'empleado';
  id: string;
  nombre: string;
  documento: string | null;
  dv: string | null;
  email: string | null;
  tipo_doc: string | null;
}

export interface PaginaTerceros {
  filas: FilaTerceroBusqueda[];
  total: number;
}

const TIPOS = new Set(['cliente', 'proveedor', 'empleado']);

export async function buscarTerceros(
  db: Pick<SupabaseClient, 'rpc'>,
  {
    organizationId,
    texto,
    limite = 20,
    desde = 0,
    signal,
  }: {
    organizationId: number;
    texto: string | null | undefined;
    limite?: number;
    desde?: number;
    signal?: AbortSignal;
  },
): Promise<PaginaTerceros> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const consulta = db.rpc('fn_terceros_buscar', {
    p_organization_id: organizationId,
    p_q: texto ?? '',
    p_limite: limite,
    p_desde: desde,
  });
  const { data, error } = await (signal ? consulta.abortSignal(signal) : consulta);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (error) throw error;
  const r = (data ?? {}) as { total?: number | string; filas?: unknown };
  const crudas = Array.isArray(r.filas) ? r.filas : [];
  const filas: FilaTerceroBusqueda[] = [];
  for (const fila of crudas) {
    if (!fila || typeof fila !== 'object') continue;
    const f = fila as Record<string, unknown>;
    const tipo = String(f.tipo ?? '');
    if (!TIPOS.has(tipo)) continue;
    const nombre = String(f.nombre ?? '').trim();
    if (!nombre) continue;
    filas.push({
      tipo: tipo as FilaTerceroBusqueda['tipo'],
      id: String(f.id ?? ''),
      nombre,
      documento: f.documento == null || String(f.documento).trim() === '' ? null : String(f.documento),
      dv: f.dv == null || String(f.dv).trim() === '' ? null : String(f.dv),
      email: f.email == null || String(f.email).trim() === '' ? null : String(f.email),
      tipo_doc: f.tipo_doc == null || String(f.tipo_doc).trim() === '' ? null : String(f.tipo_doc),
    });
  }
  const total = Number(r.total ?? filas.length);
  return { filas, total: Number.isFinite(total) ? total : filas.length };
}
