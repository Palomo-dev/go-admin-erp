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
import { tiposDetalleFaltantes, type TipoPaginaDetalle } from '@/components/sitio-web/paginas/paginasDetalle';
import { agotadoAhora } from '@/lib/services/website/cartaSede';
import {
  MAX_DESTACADAS_POR_PRODUCTO,
  actualizarResenaProducto,
  cambiarFotoResena,
  contarDestacadas,
  listarResenasProducto,
  privadoDe,
  type EstadoResena,
} from '@/lib/services/website/resenasProducto';
import { COLUMNAS_AJUSTES_RESENAS, columnasDeCambios, leerAjustesResenas, type AjustesResenas } from '@/lib/website/ajustesResenas';

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
  /**
   * Páginas de detalle que el borrador V2 del sitio principal todavía no tiene, y la versión del
   * borrador para crearlas («Crear ficha editable», Figma 2700:57498). Sin sitio V2: nada que crear.
   */
  detalles: { faltan: TipoPaginaDetalle[]; version: number | null };
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
  /** Moderación (Figma 4A-4D, 2026-11-25). Opcionales: el panel heredado no los trae. */
  imagenes?: string[];
  imagenesOcultas?: string[];
  destacada?: boolean;
  /** «Llegó por»: ficha | correo | pedido | cuenta; null = anterior al flujo. */
  llegoPor?: string | null;
  /** No se publica. */
  correo?: string | null;
  /** sesion | pedido | enlace; null = sin verificar. */
  verificadaPor?: string | null;
  pedido?: { id: string; numero: string; entregadoEn: string | null } | null;
}

/** Tarjetas de la pestaña Reseñas (Figma 4A). */
export interface ResumenResenas {
  porRevisar: number;
  /** La pendiente más antigua (fecha de creación), si hay. */
  pendienteMasVieja: string | null;
  publicadas: number;
  /** Publicadas en los últimos 30 días. */
  publicadasMes: number;
  /** Promedio de las publicadas (solo opiniones de clientes); 0 sin publicadas. */
  promedio: number;
  verificadas: number;
}

export interface RespuestaResenas {
  resenas: ResenaTienda[];
  total: number;
  pagina: number;
  tamano: number;
  puedeEditar: boolean;
  resumen?: ResumenResenas;
}

export const TAMANO_PAGINA_RESENAS = 20;
/**
 * - `aprobar` / `rechazar`: «Publicar» / «Ocultar» (los nombres de la UI cambiaron el 2026-11-25;
 *   el estado de la BD sigue siendo approved / rejected).
 * - `publicar`: publica y, si trae texto, responde en la misma escritura («Publicar y responder»).
 * - `destacar` / `quitarDestacada`, `ocultarFoto` / `mostrarFoto` (con `foto`).
 */
export type AccionResena = 'aprobar' | 'rechazar' | 'responder' | 'publicar' | 'destacar' | 'quitarDestacada' | 'ocultarFoto' | 'mostrarFoto';
export const ACCIONES_RESENA: readonly AccionResena[] = ['aprobar', 'rechazar', 'responder', 'publicar', 'destacar', 'quitarDestacada', 'ocultarFoto', 'mostrarFoto'];

export class ErrorTienda extends Error {
  constructor(
    public readonly codigo: 'sin_permiso' | 'peticion_invalida' | 'sin_ajustes' | 'no_encontrada' | 'limite_destacadas',
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

async function leerPlantillas(ctx: Ctx): Promise<{ plantillas: PlantillaTienda[]; detalles: RespuestaTienda['detalles'] }> {
  const sitios = await listarSitios(ctx.supabase, ctx.organizationId);
  const principal = sitios.find((s) => s.branchId === null);
  if (principal?.versionBorrador) {
    const b = await obtenerBorrador(ctx.supabase, ctx.organizationId, principal.id);
    return {
      plantillas: b.documento.paginas
        .filter((p) => esPlantillaTienda(p))
        .map((p) => ({ id: p.id, titulo: p.titulo, tipo: p.tipo, ruta: `/${p.slug}`, origen: 'v2' as const })),
      detalles: { faltan: tiposDetalleFaltantes(b.documento), version: b.version },
    };
  }
  const { data, error } = await ctx.supabase
    .from('website_pages')
    .select('id, title, slug, page_type')
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .in('page_type', [...TIPOS_PLANTILLA_TIENDA])
    .order('title');
  if (error) throw error;
  const plantillas = ((data ?? []) as { id: string; title: string; slug: string; page_type: string }[]).map((p) => ({
    id: p.id,
    titulo: p.title,
    tipo: p.page_type,
    ruta: `/${p.slug}`,
    origen: 'legacy' as const,
  }));
  return { plantillas, detalles: { faltan: [], version: null } };
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
    plantillas: plantillas.plantillas,
    detalles: plantillas.detalles,
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
  const db = getServiceClient();
  const [{ resenas, total }, resumen] = await Promise.all([
    listarResenasProducto(db, ctx.organizationId, {
      estado: filtros.estado,
      pagina,
      tamano: TAMANO_PAGINA_RESENAS,
      columnas: 'moderacion',
    }),
    resumenResenas(db, ctx.organizationId),
  ]);
  // «Ver pedido»: número y entrega de los pedidos de la página (una consulta).
  const idsPedido = Array.from(new Set(resenas.map((r) => r.order_id).filter((x): x is string => typeof x === 'string')));
  const pedidos = new Map<string, { numero: string; entregadoEn: string | null }>();
  if (idsPedido.length > 0) {
    const { data, error } = await db.from('web_orders').select('id, order_number, delivered_at').eq('organization_id', ctx.organizationId).in('id', idsPedido);
    if (error) throw error;
    for (const p of (data ?? []) as { id: string; order_number: string; delivered_at: string | null }[]) pedidos.set(p.id, { numero: p.order_number, entregadoEn: p.delivered_at });
  }
  return {
    resumen,
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
      imagenes: r.images ?? [],
      imagenesOcultas: privadoDe(r)?.hidden_images ?? [],
      destacada: r.is_featured === true,
      llegoPor: r.source ?? null,
      correo: privadoDe(r)?.author_email ?? null,
      verificadaPor: privadoDe(r)?.verification_method ?? null,
      pedido: r.order_id && pedidos.has(r.order_id) ? { id: r.order_id, ...pedidos.get(r.order_id)! } : null,
    })),
    total,
    pagina,
    tamano: TAMANO_PAGINA_RESENAS,
    puedeEditar: permisos.editar,
  };
}

const MAX_RESPUESTA = 1000;

type ClienteServicio = ReturnType<typeof getServiceClient>;

async function contarResenas(db: ClienteServicio, org: number, filtro: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any -- constructor de PostgREST
  const { count, error } = await filtro(db.from('product_reviews').select('id', { count: 'exact', head: true }).eq('organization_id', org));
  if (error) throw error;
  return count ?? 0;
}

/** Tarjetas de Reseñas: conteos exactos sin traer filas (head), en paralelo. */
async function resumenResenas(db: ClienteServicio, org: number, ahora: Date = new Date()): Promise<ResumenResenas> {
  const hace30 = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [porRevisar, publicadas, publicadasMes, verificadas, ...estrellas] = await Promise.all([
    contarResenas(db, org, (q) => q.eq('status', 'pending')),
    contarResenas(db, org, (q) => q.eq('status', 'approved')),
    contarResenas(db, org, (q) => q.eq('status', 'approved').gte('created_at', hace30)),
    contarResenas(db, org, (q) => q.eq('status', 'approved').eq('is_verified_purchase', true)),
    ...[1, 2, 3, 4, 5].map((n) => contarResenas(db, org, (q) => q.eq('status', 'approved').eq('rating', n))),
  ]);
  const vieja = await db.from('product_reviews').select('created_at').eq('organization_id', org).eq('status', 'pending').order('created_at', { ascending: true }).limit(1);
  if (vieja.error) throw vieja.error;
  const cantidad = estrellas.reduce((s, n) => s + n, 0);
  const suma = estrellas.reduce((s, n, i) => s + n * (i + 1), 0);
  return {
    porRevisar,
    pendienteMasVieja: (vieja.data as { created_at: string }[] | null)?.[0]?.created_at ?? null,
    publicadas,
    publicadasMes,
    promedio: cantidad > 0 ? Math.round((suma / cantidad) * 10) / 10 : 0,
    verificadas,
  };
}

/**
 * Modera una reseña. Exige `website.sites.edit`.
 * - aprobar / rechazar / responder: como siempre.
 * - publicar: aprueba y, con texto, responde (una sola escritura).
 * - destacar: hasta 3 por producto (409 `limite_destacadas`).
 * - ocultarFoto / mostrarFoto: mueve la foto entre la lista pública y la privada.
 */
export async function moderarResenaTienda(ctx: Ctx, id: string, accion: AccionResena, respuesta?: string | null, foto?: string | null): Promise<void> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorTienda('sin_permiso', 403, 'No tienes permiso para moderar reseñas.');
  const db = getServiceClient();
  const noExiste = () => new ErrorTienda('no_encontrada', 404, 'Esa reseña no existe.');

  if (accion === 'ocultarFoto' || accion === 'mostrarFoto') {
    if (typeof foto !== 'string' || !foto.startsWith('https://') || foto.length > 500) throw new ErrorTienda('peticion_invalida', 400, 'Falta la foto.');
    const r = await cambiarFotoResena(db, ctx.organizationId, id, foto, accion === 'ocultarFoto');
    if (!r) throw noExiste();
    return;
  }

  if (accion === 'destacar') {
    const { data, error } = await db.from('product_reviews').select('product_id').eq('id', id).eq('organization_id', ctx.organizationId).maybeSingle();
    if (error) throw error;
    if (!data) throw noExiste();
    const otras = await contarDestacadas(db, ctx.organizationId, (data as { product_id: number }).product_id, id);
    if (otras >= MAX_DESTACADAS_POR_PRODUCTO) {
      throw new ErrorTienda('limite_destacadas', 409, `Ya hay ${MAX_DESTACADAS_POR_PRODUCTO} opiniones destacadas en este producto. Quita una para destacar otra.`);
    }
  }

  let texto: string | null | undefined;
  if (accion === 'responder' || (accion === 'publicar' && typeof respuesta === 'string')) {
    texto = typeof respuesta === 'string' ? respuesta.trim() : '';
    if (texto.length > MAX_RESPUESTA) throw new ErrorTienda('peticion_invalida', 400, `La respuesta admite hasta ${MAX_RESPUESTA} caracteres.`);
    if (texto === '') texto = null;
  }
  const cambio =
    accion === 'responder' ? { respuesta: texto }
      : accion === 'publicar' ? { estado: 'approved' as const, ...(texto !== undefined ? { respuesta: texto } : {}) }
        : accion === 'destacar' ? { destacada: true }
          : accion === 'quitarDestacada' ? { destacada: false }
            : { estado: accion === 'aprobar' ? ('approved' as const) : ('rejected' as const) };
  const r = await actualizarResenaProducto(db, ctx.organizationId, id, cambio, ctx.userId);
  if (!r) throw noExiste();
}

// ─── Ajustes de reseñas (Figma 3C) ───────────────────────────────────────────

export interface AjustesResenasTienda extends AjustesResenas {
  /** Con qué nombre y desde qué dirección salen los correos a compradores. */
  remitente: { nombre: string; correo: string | null; dominioVerificado: boolean };
  puedeEditar: boolean;
}

/** Lee los ajustes (fila principal) y el remitente. Exige `website.sites.edit`. */
export async function leerAjustesResenasTienda(ctx: Ctx): Promise<AjustesResenasTienda> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorTienda('sin_permiso', 403, 'No tienes permiso para ver el sitio web.');
  const db = getServiceClient();
  const [ajustes, org, dominios] = await Promise.all([
    db.from('website_settings').select(COLUMNAS_AJUSTES_RESENAS).eq('organization_id', ctx.organizationId).is('branch_id', null).maybeSingle(),
    db.from('organizations').select('name').eq('id', ctx.organizationId).maybeSingle(),
    db.from('email_domains').select('from_email, is_default').eq('organization_id', ctx.organizationId).eq('status', 'verified'),
  ]);
  if (ajustes.error) throw ajustes.error;
  if (org.error) throw org.error;
  if (dominios.error) throw dominios.error;
  const lista = (dominios.data ?? []) as { from_email: string | null; is_default: boolean | null }[];
  const dominio = lista.find((d) => d.is_default) ?? lista[0] ?? null;
  return {
    ...leerAjustesResenas(ajustes.data as Record<string, unknown> | null),
    remitente: {
      nombre: ((org.data as { name?: string } | null)?.name ?? '').trim(),
      correo: dominio?.from_email ?? null,
      dominioVerificado: !!dominio?.from_email,
    },
    puedeEditar: permisos.editar,
  };
}

/** Guarda los cambios de la hoja (solo lo que viene). Exige `website.sites.edit`. */
export async function guardarAjustesResenasTienda(ctx: Ctx, body: unknown): Promise<AjustesResenasTienda> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorTienda('sin_permiso', 403, 'No tienes permiso para editar el sitio web.');
  const cambios = columnasDeCambios(body);
  if (!cambios.ok) throw new ErrorTienda('peticion_invalida', 400, cambios.mensaje);
  const { data, error } = await getServiceClient()
    .from('website_settings')
    .update({ ...cambios.columnas, updated_at: new Date().toISOString() })
    .eq('organization_id', ctx.organizationId)
    .is('branch_id', null)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new ErrorTienda('sin_ajustes', 404, 'El sitio aún no tiene ajustes. Créalo desde el Resumen.');
  return leerAjustesResenasTienda(ctx);
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
