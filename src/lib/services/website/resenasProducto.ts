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

/**
 * Columnas de la moderación de Sitio web › Tienda › Reseñas (Figma 4A-4D, 2026-11-25): las de
 * siempre + «Destacar», «Llegó por», el pedido y los datos privados (`product_review_private`:
 * correo, cómo se verificó y fotos ocultas). Solo las pide la ruta con `website.sites.edit`; el
 * panel heredado (`/api/product-reviews`) sigue con `COLUMNAS_RESENA`.
 */
export const COLUMNAS_RESENA_MODERACION = `
  id,
  product_id,
  order_id,
  author_name,
  author_city,
  rating,
  title,
  content,
  images,
  is_verified_purchase,
  is_featured,
  source,
  status,
  rejection_reason,
  reply_text,
  reply_at,
  helpful_count,
  created_at,
  products!inner (id, name, slug, uuid ),
  product_review_private ( author_email, verification_method, hidden_images )
`;

export interface PrivadoResena {
  author_email: string | null;
  verification_method: string | null;
  hidden_images: string[] | null;
}

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
  /** Solo con `COLUMNAS_RESENA_MODERACION`. */
  order_id?: string | null;
  is_featured?: boolean;
  source?: string | null;
  product_review_private?: PrivadoResena | PrivadoResena[] | null;
}

/** El embebido 1 a 1 llega como objeto o como lista según la versión de PostgREST. */
export function privadoDe(fila: Pick<FilaResenaProducto, 'product_review_private'>): PrivadoResena | null {
  const p = fila.product_review_private;
  if (!p) return null;
  return Array.isArray(p) ? p[0] ?? null : p;
}

export interface FiltrosResenas {
  /** `all` o ausente: todas. */
  estado?: EstadoResena | 'all' | null;
  productoId?: number | null;
  /** Con `pagina` y `tamano` se pagina y se devuelve el total. */
  pagina?: number;
  tamano?: number;
  /** `moderacion`: `COLUMNAS_RESENA_MODERACION`. Sin valor, las de siempre. */
  columnas?: 'moderacion';
}

export async function listarResenasProducto(
  db: SupabaseClient,
  organizationId: number,
  filtros: FiltrosResenas = {},
): Promise<{ resenas: FilaResenaProducto[]; total: number }> {
  const paginar = filtros.pagina !== undefined && filtros.tamano !== undefined;
  // `string` (no la unión de los dos literales): el tipo de PostgREST no tiene que desarmarlos.
  const columnas: string = filtros.columnas === 'moderacion' ? COLUMNAS_RESENA_MODERACION : COLUMNAS_RESENA;
  let q = db
    .from('product_reviews')
    .select(columnas, paginar ? { count: 'exact' } : undefined)
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
  /** «Destacar esta opinión»: sale primero en la ficha y en Carrusel. */
  destacada?: boolean;
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
  if (cambio.destacada !== undefined) fila.is_featured = cambio.destacada;
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

/** Destacadas por producto (la ficha muestra hasta 3 primero). */
export const MAX_DESTACADAS_POR_PRODUCTO = 3;

export async function contarDestacadas(db: SupabaseClient, organizationId: number, productId: number, excepto: string): Promise<number> {
  const { count, error } = await db
    .from('product_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('product_id', productId)
    .eq('is_featured', true)
    .neq('id', excepto);
  if (error) throw error;
  return count ?? 0;
}

/**
 * «Ocultar foto» / «Mostrar foto» (Figma 4B): la foto sale de `product_reviews.images` (pública) y
 * queda en `product_review_private.hidden_images` (privada), o al revés. `null` si la reseña no es
 * de la organización o la foto no es suya.
 */
export async function cambiarFotoResena(
  db: SupabaseClient,
  organizationId: number,
  id: string,
  url: string,
  ocultar: boolean,
): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from('product_reviews')
    .select('id, images, product_review_private ( hidden_images )')
    .eq('id', id)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const fila = data as unknown as { id: string; images: string[] | null; product_review_private: { hidden_images: string[] | null } | { hidden_images: string[] | null }[] | null };
  const privado = Array.isArray(fila.product_review_private) ? fila.product_review_private[0] ?? null : fila.product_review_private;
  const visibles = fila.images ?? [];
  const ocultas = privado?.hidden_images ?? [];
  const desde = ocultar ? visibles : ocultas;
  if (!desde.includes(url)) return null;
  const nuevasVisibles = ocultar ? visibles.filter((u) => u !== url) : [...visibles, url];
  const nuevasOcultas = ocultar ? [...ocultas, url] : ocultas.filter((u) => u !== url);
  // Primero la privada (si falla, la foto sigue visible: nunca se pierde).
  const { error: errorPrivado } = await db
    .from('product_review_private')
    .upsert({ review_id: id, organization_id: organizationId, hidden_images: nuevasOcultas }, { onConflict: 'review_id' });
  if (errorPrivado) throw errorPrivado;
  const { error: errorPublico } = await db
    .from('product_reviews')
    .update({ images: nuevasVisibles.length > 0 ? nuevasVisibles : null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', organizationId);
  if (errorPublico) throw errorPublico;
  return { id };
}
