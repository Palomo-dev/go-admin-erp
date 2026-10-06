/**
 * «Tienda» del sitio web (Figma A/01b fila Tienda y A/04i nota 2) en el
 * servidor: lo que la pantalla necesita además de lo que ya sirven
 * `/api/website/carta-sede` (catálogo por sede).
 *
 * - KPIs del catálogo web: productos activos, categorías activas y, por sede,
 *   cuántos están ocultos o agotados en la web (`website_branch_products`, el
 *   MISMO dato que la carta por sede).
 * - Plantillas de detalle (producto, categoría, carrito…): las páginas que
 *   Páginas no lista (`esPlantillaTienda`), del borrador V2 o, si el sitio aún
 *   no tiene V2, de `website_pages`.
 * - Reseñas pendientes y `reviews_auto_approve`.
 * - Moderación de reseñas (`leerResenasTienda` / `moderarResenaTienda`): la
 *   MISMA consulta y escritura de `resenasProducto.ts` que usa
 *   `/api/product-reviews`, pero detrás de `website.sites.edit`.
 *
 * Lectura con el cliente de la SESIÓN. La escritura de la auto-aprobación
 * valida `website.sites.edit` y escribe con el cliente de servicio filtrado por
 * la organización de la sesión (como SEO y Ventas).
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { listarSitios, obtenerBorrador } from '@/lib/services/website/siteDocumentService';
import { seccionesVisiblesServidor } from '@/lib/navigation/navegacionServidor';
import { getServiceClient } from '@/lib/supabase/server-service';
import { esPlantillaTienda, TIPOS_PLANTILLA_TIENDA } from '@/components/sitio-web/paginas/tipoPagina';
import { agotadoAhora } from '@/lib/services/website/cartaSede';
import {
  actualizarResenaProducto,
  listarResenasProducto,
  type EstadoResena,
} from '@/lib/services/website/resenasProducto';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'userId' | 'supabase' | 'memberId'>;

export const RUTA_INVENTARIO_PRODUCTOS = '/app/inventario/productos';

export interface PlantillaTienda {
  id: string;
  titulo: string;
  tipo: string;
  ruta: string;
  /** Solo las del borrador V2 se abren en el editor V2. */
  origen: 'v2' | 'legacy';
}

export interface SedeTienda {
  id: number;
  nombre: string;
  principal: boolean;
  ocultos: number;
  agotados: number;
}

export interface RespuestaTienda {
  permisos: { editar: boolean; publicar: boolean };
  kpis: { productosActivos: number; categorias: number; resenasPendientes: number };
  sedes: SedeTienda[];
  plantillas: PlantillaTienda[];
  autoAprobarResenas: boolean;
  /** «Editar en Inventario» solo si la persona ve esa página. */
  inventarioVisible: boolean;
}

/** Una reseña tal como la pinta Tienda › Reseñas. */
export interface ResenaTienda {
  id: string;
  autor: string;
  ciudad: string | null;
  calificacion: number;
  titulo: string | null;
  texto: string | null;
  compraVerificada: boolean;
  estado: EstadoResena;
  respuesta: string | null;
  respondidaEn: string | null;
  creadaEn: string;
  producto: { id: number; nombre: string } | null;
}

export interface RespuestaResenas {
  resenas: ResenaTienda[];
  total: number;
  pagina: number;
  tamano: number;
  puedeEditar: boolean;
}

export const TAMANO_PAGINA_RESENAS = 20;
export type AccionResena = 'aprobar' | 'rechazar' | 'responder';

export class ErrorTienda extends Error {
  constructor(
    public readonly codigo: 'sin_permiso' | 'peticion_invalida' | 'sin_ajustes' | 'no_encontrada',
    public readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorTienda';
  }
}

async function contar(consulta: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await consulta;
  if (error) throw error;
  return count ?? 0;
}

async function leerPlantillas(ctx: Ctx): Promise<PlantillaTienda[]> {
  const sitios = await listarSitios(ctx.supabase, ctx.organizationId);
  const principal = sitios.find((s) => s.branchId === null);
  if (principal?.versionBorrador) {
    const b = await obtenerBorrador(ctx.supabase, ctx.organizationId, principal.id);
    return b.documento.paginas
      .filter((p) => esPlantillaTienda(p))
      .map((p) => ({ id: p.id, titulo: p.titulo, tipo: p.tipo, ruta: `/${p.slug}`, origen: 'v2' as const }));
  }
  const { data, error } = await ctx.supabase
    .from('website_pages')
    .select('id, title, slug, page_type')
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .in('page_type', [...TIPOS_PLANTILLA_TIENDA])
    .order('title');
  if (error) throw error;
  return ((data ?? []) as { id: string; title: string; slug: string; page_type: string }[]).map((p) => ({
    id: p.id,
    titulo: p.title,
    tipo: p.page_type,
    ruta: `/${p.slug}`,
    origen: 'legacy' as const,
  }));
}

export async function leerTiendaSitio(ctx: Ctx, ahora: Date = new Date()): Promise<RespuestaTienda> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorTienda('sin_permiso', 403, 'No tienes permiso para ver la tienda del sitio.');
  const org = ctx.organizationId;
  const db = ctx.supabase;
  const [productos, categorias, resenas, sucursales, ajustesSede, ajustes, plantillas, secciones] = await Promise.all([
    contar(db.from('products').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'active')),
    contar(db.from('categories').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('is_active', true)),
    contar(db.from('product_reviews').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'pending')),
    db.from('branches').select('id, name, is_main').eq('organization_id', org).eq('is_active', true).order('is_main', { ascending: false }).order('name'),
    db.from('website_branch_products').select('branch_id, is_listed, is_sold_out, sold_out_until').eq('organization_id', org).limit(20000),
    db.from('website_settings').select('reviews_auto_approve').eq('organization_id', org).is('branch_id', null).maybeSingle(),
    leerPlantillas(ctx),
    seccionesVisiblesServidor(ctx as ServerOrgContext).catch(() => []),
  ]);
  for (const r of [sucursales, ajustesSede, ajustes]) if (r.error) throw r.error;
  const porSede = new Map<number, { ocultos: number; agotados: number }>();
  for (const f of (ajustesSede.data ?? []) as { branch_id: number; is_listed: boolean; is_sold_out: boolean; sold_out_until: string | null }[]) {
    const acc = porSede.get(f.branch_id) ?? { ocultos: 0, agotados: 0 };
    if (f.is_listed === false) acc.ocultos += 1;
    else if (agotadoAhora(f, ahora)) acc.agotados += 1;
    porSede.set(f.branch_id, acc);
  }
  const rutas = new Set(secciones.flatMap((s) => s.modulos.flatMap((m) => m.paginas.map((p) => p.href))));
  return {
    permisos,
    kpis: { productosActivos: productos, categorias, resenasPendientes: resenas },
    sedes: ((sucursales.data ?? []) as { id: number; name: string; is_main: boolean | null }[]).map((s) => ({
      id: s.id,
      nombre: s.name,
      principal: s.is_main === true,
      ocultos: porSede.get(s.id)?.ocultos ?? 0,
      agotados: porSede.get(s.id)?.agotados ?? 0,
    })),
    plantillas,
    autoAprobarResenas: (ajustes.data as { reviews_auto_approve: boolean | null } | null)?.reviews_auto_approve === true,
    inventarioVisible: rutas.has(RUTA_INVENTARIO_PRODUCTOS),
  };
}

export async function guardarAutoAprobar(ctx: Ctx, activo: boolean): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorTienda('sin_permiso', 403, 'No tienes permiso para editar el sitio web.');
  const { data, error } = await getServiceClient()
    .from('website_settings')
    .update({ reviews_auto_approve: activo, updated_at: new Date().toISOString() })
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ErrorTienda('sin_ajustes', 404, 'El sitio aún no tiene ajustes. Créalo desde el Resumen.');
}

/** Lista de reseñas para moderar (Tienda › Reseñas). Exige `website.sites.edit`. */
export async function leerResenasTienda(
  ctx: Ctx,
  filtros: { estado: EstadoResena | 'all'; pagina: number },
): Promise<RespuestaResenas> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorTienda('sin_permiso', 403, 'No tienes permiso para moderar reseñas.');
  const pagina = Math.max(1, Math.floor(filtros.pagina) || 1);
  const { resenas, total } = await listarResenasProducto(getServiceClient(), ctx.organizationId, {
    estado: filtros.estado,
    pagina,
    tamano: TAMANO_PAGINA_RESENAS,
  });
  return {
    resenas: resenas.map((r) => ({
      id: r.id,
      autor: r.author_name,
      ciudad: r.author_city,
      calificacion: r.rating,
      titulo: r.title,
      texto: r.content,
      compraVerificada: r.is_verified_purchase === true,
      estado: (['pending', 'approved', 'rejected'] as const).includes(r.status as EstadoResena) ? (r.status as EstadoResena) : 'pending',
      respuesta: r.reply_text,
      respondidaEn: r.reply_at,
      creadaEn: r.created_at,
      producto: r.products ? { id: r.products.id, nombre: r.products.name } : null,
    })),
    total,
    pagina,
    tamano: TAMANO_PAGINA_RESENAS,
    puedeEditar: permisos.editar,
  };
}

const MAX_RESPUESTA = 1000;

/** Aprueba, rechaza o responde una reseña. Exige `website.sites.edit`. */
export async function moderarResenaTienda(ctx: Ctx, id: string, accion: AccionResena, respuesta?: string | null): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorTienda('sin_permiso', 403, 'No tienes permiso para moderar reseñas.');
  let texto: string | null | undefined;
  if (accion === 'responder') {
    texto = typeof respuesta === 'string' ? respuesta.trim() : '';
    if (texto.length > MAX_RESPUESTA) throw new ErrorTienda('peticion_invalida', 400, `La respuesta admite hasta ${MAX_RESPUESTA} caracteres.`);
    if (texto === '') texto = null;
  }
  const r = await actualizarResenaProducto(
    getServiceClient(),
    ctx.organizationId,
    id,
    accion === 'responder' ? { respuesta: texto } : { estado: accion === 'aprobar' ? 'approved' : 'rejected' },
    ctx.userId,
  );
  if (!r) throw new ErrorTienda('no_encontrada', 404, 'Esa reseña no existe.');
}

export function respuestaErrorTienda(error: unknown, ruta: string, organizationId: number): Response {
  const cabeceras = { 'Cache-Control': 'private, no-store' };
  if (error instanceof ErrorTienda) return Response.json({ error: error.message, codigo: error.codigo }, { status: error.status, headers: cabeceras });
  if ((error as { code?: string } | null)?.code === '42501') {
    return Response.json({ error: 'No tienes acceso al sitio web.', codigo: 'sin_permiso' }, { status: 403, headers: cabeceras });
  }
  console.error(`[api/${ruta}]`, { organizationId, message: error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error) });
  return Response.json({ error: 'No pudimos completar la operación.', codigo: 'error_interno' }, { status: 500, headers: cabeceras });
}
