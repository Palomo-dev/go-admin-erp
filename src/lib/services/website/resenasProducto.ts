/**
 * Reseñas de producto (`product_reviews`): la ÚNICA consulta y la ÚNICA
 * escritura de moderación. Las usan `/api/product-reviews` (panel heredado) y
 * `/api/sitio-web/tienda/resenas` (Sitio web › Tienda › Reseñas).
 *
 * SOLO servidor. Recibe un cliente ya elegido por quien llama (service role
 * tras validar organización y permiso) y SIEMPRE filtra por la organización
 * que le pasan, que sale de la sesión.
 *
 * Columnas verificadas contra el esquema (baseline: product_reviews con
 * status pending|approved|rejected, rating 1-5, reply_text/reply_at/reply_by).
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const ESTADOS_RESENA = ['pending', 'approved', 'rejected'] as const;
export type EstadoResena = (typeof ESTADOS_RESENA)[number];

export function esEstadoResena(v: unknown): v is EstadoResena {
  return typeof v === 'string' && (ESTADOS_RESENA as readonly string[]).includes(v);
}

export const COLUMNAS_RESENA = `
  id,
  product_id,
  author_name,
  author_city,
  rating,
  title,
  content,
  images,
  is_verified_purchase,
  status,
  rejection_reason,
  reply_text,
  reply_at,
  helpful_count,
  created_at,
  products!inner (id, name, slug, uuid )
`;

export interface FilaResenaProducto {
  id: string;
  product_id: number;
  author_name: string;
  author_city: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  images: string[] | null;
  is_verified_purchase: boolean;
  status: string;
  rejection_reason: string | null;
  reply_text: string | null;
  reply_at: string | null;
  helpful_count: number;
  created_at: string;
  products: { id: number; name: string; slug: string | null; uuid: string } | null;
}

export interface FiltrosResenas {
  /** `all` o ausente: todas. */
  estado?: EstadoResena | 'all' | null;
  productoId?: number | null;
  /** Con `pagina` y `tamano` se pagina y se devuelve el total. */
  pagina?: number;
  tamano?: number;
}

export async function listarResenasProducto(
  db: SupabaseClient,
  organizationId: number,
  filtros: FiltrosResenas = {},
): Promise<{ resenas: FilaResenaProducto[]; total: number }> {
  const paginar = filtros.pagina !== undefined && filtros.tamano !== undefined;
  let q = db
    .from('product_reviews')
    .select(COLUMNAS_RESENA, paginar ? { count: 'exact' } : undefined)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });
  if (filtros.estado && filtros.estado !== 'all') q = q.eq('status', filtros.estado);
  if (filtros.productoId) q = q.eq('product_id', filtros.productoId);
  if (paginar) {
    const desde = (Math.max(1, filtros.pagina!) - 1) * filtros.tamano!;
    q = q.range(desde, desde + filtros.tamano! - 1);
  }
  const { data, error, count } = await q;
  if (error) throw error;
  const resenas = (data ?? []) as unknown as FilaResenaProducto[];
  return { resenas, total: count ?? resenas.length };
}

export interface CambioResena {
  estado?: EstadoResena;
  motivoRechazo?: string | null;
  respuesta?: string | null;
}

/**
 * Aprueba, rechaza o responde una reseña de la organización. `null` si la
 * reseña no existe o es de otra organización (quien llama responde 404).
 */
export async function actualizarResenaProducto(
  db: SupabaseClient,
  organizationId: number,
  id: string,
  cambio: CambioResena,
  autorRespuesta?: string | null,
): Promise<{ id: string; status: string } | null> {
  const fila: Record<string, unknown> = {};
  if (cambio.estado) fila.status = cambio.estado;
  if (cambio.motivoRechazo !== undefined) fila.rejection_reason = cambio.motivoRechazo;
  if (cambio.respuesta !== undefined) {
    fila.reply_text = cambio.respuesta;
    fila.reply_at = cambio.respuesta ? new Date().toISOString() : null;
    if (autorRespuesta) fila.reply_by = autorRespuesta;
  }
  if (Object.keys(fila).length === 0) throw new Error('sin_cambios');
  fila.updated_at = new Date().toISOString();
  const { data, error } = await db
    .from('product_reviews')
    .update(fila)
    .eq('id', id)
    .eq('organization_id', organizationId)
    .select('id, status')
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; status: string } | null) ?? null;
}
