/**
 * Páginas y menús del sitio para el módulo «Sitio web › Páginas» (Figma A/04, D/04-09, D/04-10).
 *
 * Solo servidor, con el cliente de la SESIÓN (`ctx.supabase` de `withOrg`): la organización
 * sale de la sesión, los permisos se resuelven con `fn_website_tiene_permiso` y la escritura del
 * borrador pasa por la RLS de `website_site_drafts` y el compare-and-swap de
 * `siteDocumentService.guardarBorrador`. No hay segunda implementación del documento V2: se leen
 * y guardan borradores con `siteDocumentService`, y las operaciones son las funciones puras de
 * `src/components/sitio-web/paginas/operaciones*.ts`.
 *
 * Nada de esto escribe en `website_pages`, `website_menus` ni en la web pública. Mientras el sitio
 * no tiene borrador V2 (hoy, todas las organizaciones), la lista es una importación en memoria
 * del sitio actual; la primera edición crea el borrador con `crearSitio` (importa sin cambiar lo
 * que ve el público).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { validarDocumentoSitio, type DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { documentoSedeDesdeBase, importarSitioLegacy } from '@/lib/website/v2/importadorLegacy';
import {
  ErrorSitio,
  crearSitio,
  errorDesdePostgrest,
  guardarBorrador,
  leerLegacy,
  listarSitios,
  obtenerBorrador,
  resolverBasePrincipal,
} from '@/lib/services/website/siteDocumentService';
import { contarPaginas, filasPaginas } from '@/components/sitio-web/paginas/vistaPaginas';
import { giroDeSede, giroDeTipoOrganizacion, paginasBasePorGiro } from '@/components/sitio-web/paginas/plantillasPagina';
import type {
  CategoriaInventarioMenu,
  RespuestaMenusSitio,
  CodigoErrorPagina,
  PermisosSitio,
  RespuestaEscrituraPaginas,
  RespuestaPaginas,
  SedeWeb,
} from '@/components/sitio-web/paginas/tiposPaginas';
import type { Giro } from '@/components/sitio-web/paginas/plantillasPagina';

export interface ContextoPaginas {
  supabase: SupabaseClient;
  organizationId: number;
}

/** Error de una operación de página: 400 con el código en `details.codigo` (lo lee el diálogo). */
export function errorPagina(codigo: CodigoErrorPagina): ErrorSitio {
  const mensajes: Record<CodigoErrorPagina, string> = {
    titulo_vacio: 'Escribe el nombre de la página.',
    slug_vacio: 'Escribe la dirección de la página.',
    slug_repetido: 'Ya existe una página con esta dirección.',
    slug_de_sede: 'Esa dirección ya es la de una sede publicada. Elige otra para la página.',
    slug_invalido: 'Usa solo letras sin tildes, números y guiones.',
    limite_paginas: 'El sitio llegó al máximo de 200 páginas.',
    pagina_no_existe: 'La página ya no existe en el borrador.',
    no_se_elimina_inicio: 'La página de inicio no se puede eliminar.',
    limite_items: 'El menú llegó al máximo de enlaces.',
    limite_menus: 'El sitio llegó al máximo de 20 menús.',
    plantilla_no_existe: 'La plantilla no existe.',
  };
  return new ErrorSitio('peticion_invalida', mensajes[codigo], { codigo });
}

export async function permisosSitio(ctx: ContextoPaginas): Promise<PermisosSitio> {
  const consultar = async (codigo: string) => {
    const { data, error } = await ctx.supabase.rpc('fn_website_tiene_permiso', { p_org: ctx.organizationId, p_code: codigo });
    if (error) {
      console.warn('[paginasSitio] fn_website_tiene_permiso falló; se deniega', { codigo, message: error.message });
      return false;
    }
    return data === true;
  };
  const [editar, publicar] = await Promise.all([consultar('website.sites.edit'), consultar('website.sites.publish')]);
  return { editar, publicar };
}

/**
 * Giro del sitio: el de la organización en el principal; en una sede, el de su `branch_type`
 * si lo tiene (`giroDeSede`). Decide las plantillas de «Nueva página» y las páginas base.
 */
async function giroDelSitio(ctx: ContextoPaginas, branchId: number | null): Promise<Giro> {
  const [org, sede] = await Promise.all([
    ctx.supabase.from('organizations').select('type_id').eq('id', ctx.organizationId).maybeSingle(),
    branchId === null
      ? Promise.resolve({ data: null, error: null })
      : ctx.supabase.from('branches').select('branch_type').eq('id', branchId).eq('organization_id', ctx.organizationId).maybeSingle(),
  ]);
  if (org.error) throw errorDesdePostgrest(org.error, 'paginas.giro');
  if (sede.error) throw errorDesdePostgrest(sede.error, 'paginas.giroSede');
  const giroOrganizacion = giroDeTipoOrganizacion((org.data as { type_id: number | null } | null)?.type_id ?? null);
  return giroDeSede((sede.data as { branch_type: string | null } | null)?.branch_type ?? null, giroOrganizacion);
}

async function sucursalesWeb(ctx: ContextoPaginas): Promise<{ id: number; name: string }[]> {
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('id, name')
    .eq('organization_id', ctx.organizationId)
    .eq('is_web_published', true)
    .eq('is_active', true)
    .order('name');
  if (error) throw errorDesdePostgrest(error, 'paginas.sucursales');
  return (data ?? []) as { id: number; name: string }[];
}

async function documentoRevision(ctx: ContextoPaginas, revisionId: string): Promise<{ documento: DocumentoSitio; publicadaEn: string } | null> {
  const { data, error } = await ctx.supabase
    .from('website_site_revisions')
    .select('document, published_at')
    .eq('id', revisionId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();
  if (error) throw errorDesdePostgrest(error, 'paginas.revision');
  const fila = data as { document: unknown; published_at: string } | null;
  const v = fila ? validarDocumentoSitio(fila.document) : null;
  return fila && v?.ok ? { documento: v.documento, publicadaEn: fila.published_at } : null;
}

async function importarLegacy(ctx: ContextoPaginas): Promise<{ documento: DocumentoSitio; fechas: Map<string, string> }> {
  const [entrada, fechas] = await Promise.all([
    leerLegacy(ctx.supabase, ctx.organizationId),
    ctx.supabase.from('website_pages').select('id, updated_at').eq('organization_id', ctx.organizationId).is('branch_id', null),
  ]);
  if (fechas.error) throw errorDesdePostgrest(fechas.error, 'paginas.fechasLegacy');
  const r = importarSitioLegacy(entrada);
  if (!r.ok) throw new ErrorSitio('importacion_invalida', 'El sitio actual no se pudo leer en el formato nuevo.', r.errores);
  const mapa = new Map(((fechas.data ?? []) as { id: string; updated_at: string | null }[]).filter((f) => f.updated_at).map((f) => [f.id, f.updated_at as string]));
  return { documento: r.documento, fechas: mapa };
}

/** GET de la lista de Páginas del sitio principal (`branchId = null`) o de una sede. */
export async function leerVistaPaginas(ctx: ContextoPaginas, branchId: number | null): Promise<RespuestaPaginas> {
  const [sitios, permisos, giro, sucursales] = await Promise.all([
    listarSitios(ctx.supabase, ctx.organizationId),
    permisosSitio(ctx),
    giroDelSitio(ctx, branchId),
    sucursalesWeb(ctx),
  ]);
  if (branchId !== null && !sucursales.some((s) => s.id === branchId)) {
    throw new ErrorSitio('sucursal_no_encontrada', 'La sede no existe o no sale en la web.');
  }
  const sedes: SedeWeb[] = sucursales.map((s) => ({ branchId: s.id, nombre: s.name, sitioId: sitios.find((x) => x.branchId === s.id)?.id ?? null }));
  const base = { permisos, giro, paginasBase: paginasBasePorGiro(giro).map((p) => p.titulo), sedes };
  const sitio = sitios.find((s) => s.branchId === branchId);

  if (sitio) {
    const borrador = await obtenerBorrador(ctx.supabase, ctx.organizationId, sitio.id);
    let publicado: DocumentoSitio | null = null;
    let publicadoEn: string | null = null;
    if (sitio.revisionPublicadaId) {
      const r = await documentoRevision(ctx, sitio.revisionPublicadaId);
      publicado = r?.documento ?? null;
      publicadoEn = r?.publicadaEn ?? null;
    } else if (branchId === null) {
      publicado = (await importarLegacy(ctx)).documento;
    } else {
      publicado = borrador.basePrincipal?.documento ?? null;
    }
    const filas = filasPaginas({ documento: borrador.documento, publicado, actualizadoBorrador: borrador.actualizadoEn, publicadoEn });
    return {
      ...base,
      modo: 'v2',
      sitio: {
        id: sitio.id,
        branchId: sitio.branchId,
        version: borrador.version,
        v2Adoptado: sitio.v2Adoptado,
        revisionPublicadaId: sitio.revisionPublicadaId,
      },
      paginas: filas,
      contadores: contarPaginas(filas),
    };
  }

  // Sin borrador V2: lo que hoy ve el público, de solo lectura.
  if (branchId === null) {
    const { documento, fechas } = await importarLegacy(ctx);
    const filas = filasPaginas({ documento, publicado: documento, actualizadoBorrador: null, publicadoEn: null, fechasLegacy: fechas });
    return { ...base, modo: 'legacy', sitio: null, paginas: filas, contadores: contarPaginas(filas) };
  }
  const principal = await resolverBasePrincipal(ctx.supabase, ctx.organizationId);
  const documento = documentoSedeDesdeBase(principal.documento);
  const filas = filasPaginas({ documento, publicado: documento, actualizadoBorrador: null, publicadoEn: null });
  return { ...base, modo: 'legacy', sitio: null, paginas: filas, contadores: contarPaginas(filas) };
}

export type ResultadoOperacion =
  | { ok: true; documento: DocumentoSitio; paginaId?: string; creadas?: number }
  | { ok: false; error: CodigoErrorPagina };

/**
 * Comprobación inversa del slug de sede (plan de restaurante, brecha 60): una página nueva o
 * renombrada no puede usar la dirección de una sede publicada (`tumarca.com/<slug-de-sede>`),
 * porque una de las dos quedaría inalcanzable. Solo mira los slugs que cambian en esta
 * operación: un choque viejo no bloquea ediciones que no lo tocan.
 */
async function exigirSlugsLibresDeSedes(ctx: ContextoPaginas, antes: DocumentoSitio, despues: DocumentoSitio): Promise<void> {
  const previos = new Set(antes.paginas.map((p) => p.slug));
  const nuevos = despues.paginas.map((p) => p.slug).filter((slug) => !previos.has(slug));
  if (nuevos.length === 0) return;
  const { data, error } = await ctx.supabase
    .from('branches')
    .select('slug')
    .eq('organization_id', ctx.organizationId)
    .eq('is_web_published', true)
    .in('slug', nuevos);
  if (error) throw errorDesdePostgrest(error, 'exigirSlugsLibresDeSedes');
  if ((data ?? []).length > 0) throw errorPagina('slug_de_sede');
}

/**
 * Aplica una operación pura al borrador y lo guarda con compare-and-swap.
 * - Si el sitio aún no tiene borrador, lo crea primero (`crearSitio`, sin tocar la web pública)
 *   y la operación se aplica sobre la importación recién creada.
 * - Si lo tiene, `versionEsperada` es obligatoria; otra versión → 409 `conflicto_version`.
 */
export async function aplicarAlBorrador(
  ctx: ContextoPaginas,
  branchId: number | null,
  versionEsperada: number | null,
  operar: (documento: DocumentoSitio, giro: Giro) => ResultadoOperacion,
): Promise<RespuestaEscrituraPaginas> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar) throw new ErrorSitio('sin_permiso', 'Necesitas el permiso «Editar sitio web» (website.sites.edit).');
  const giro = await giroDelSitio(ctx, branchId);

  let sitio = (await listarSitios(ctx.supabase, ctx.organizationId)).find((s) => s.branchId === branchId);
  let version = versionEsperada;
  if (!sitio) {
    sitio = (await crearSitio(ctx.supabase, ctx.organizationId, branchId)).sitio;
    version = sitio.versionBorrador;
  } else if (version === null) {
    // La persona veía la lista sin borrador y alguien lo creó entretanto.
    throw new ErrorSitio('conflicto_version', 'Alguien creó o guardó el borrador mientras tanto.', { actual: sitio.versionBorrador });
  }
  const borrador = await obtenerBorrador(ctx.supabase, ctx.organizationId, sitio.id);
  if (version === null || borrador.version !== version) {
    throw new ErrorSitio('conflicto_version', 'Alguien guardó o publicó una versión más nueva del borrador.', {
      esperada: version,
      actual: borrador.version,
    });
  }
  const resultado = operar(borrador.documento, giro);
  if (!resultado.ok) throw errorPagina(resultado.error);
  await exigirSlugsLibresDeSedes(ctx, borrador.documento, resultado.documento);
  const guardado = await guardarBorrador(ctx.supabase, ctx.organizationId, sitio.id, resultado.documento, version);
  return {
    sitioId: sitio.id,
    version: guardado.version,
    actualizadoEn: guardado.actualizadoEn,
    ...(resultado.paginaId ? { paginaId: resultado.paginaId } : {}),
    ...(resultado.creadas !== undefined ? { creadas: resultado.creadas } : {}),
  };
}

/**
 * GET de Menú y navegación: permisos, sedes y giro, y —solo cuando el sitio aún no tiene
 * borrador V2— el documento de solo lectura (el sitio actual importado o, en una sede, el del
 * principal que hereda). Con borrador, el documento lo lee `useSitioV2`.
 */
export async function leerMenusSitio(ctx: ContextoPaginas, branchId: number | null): Promise<RespuestaMenusSitio> {
  const [sitios, permisos, giro, sucursales] = await Promise.all([
    listarSitios(ctx.supabase, ctx.organizationId),
    permisosSitio(ctx),
    giroDelSitio(ctx, branchId),
    sucursalesWeb(ctx),
  ]);
  if (branchId !== null && !sucursales.some((s) => s.id === branchId)) {
    throw new ErrorSitio('sucursal_no_encontrada', 'La sede no existe o no sale en la web.');
  }
  const sedes: SedeWeb[] = sucursales.map((s) => ({ branchId: s.id, nombre: s.name, sitioId: sitios.find((x) => x.branchId === s.id)?.id ?? null }));
  const sitio = sitios.find((s) => s.branchId === branchId);
  if (sitio) return { modo: 'v2', permisos, giro, sedes, documento: null };
  if (branchId === null) return { modo: 'legacy', permisos, giro, sedes, documento: (await importarLegacy(ctx)).documento };
  const principal = await resolverBasePrincipal(ctx.supabase, ctx.organizationId);
  return { modo: 'heredado', permisos, giro, sedes, documento: principal.documento };
}

const MUESTRA_POR_CATEGORIA = 4;

/** Categorías del Inventario para el menú, con productos activos (D/04-09). */
export async function leerCategoriasMenu(ctx: ContextoPaginas, branchId: number | null): Promise<CategoriaInventarioMenu[]> {
  let consulta = ctx.supabase
    .from('categories')
    .select('id, parent_id, name, slug, image_url, is_active, display_order, branch_id')
    .eq('organization_id', ctx.organizationId)
    .order('display_order', { ascending: true, nullsFirst: false })
    .order('name');
  consulta = branchId === null ? consulta.is('branch_id', null) : consulta.or(`branch_id.is.null,branch_id.eq.${branchId}`);
  const { data, error } = await consulta;
  if (error) throw errorDesdePostgrest(error, 'paginas.categorias');
  const filas = (data ?? []) as {
    id: number;
    parent_id: number | null;
    name: string;
    slug: string;
    image_url: string | null;
    is_active: boolean | null;
    branch_id: number | null;
  }[];
  if (filas.length === 0) return [];

  const { data: productos, error: errProductos } = await ctx.supabase
    .from('products')
    .select('category_id, name')
    .eq('organization_id', ctx.organizationId)
    .eq('status', 'active')
    .in('category_id', filas.map((c) => c.id))
    .order('name')
    .limit(5000);
  if (errProductos) throw errorDesdePostgrest(errProductos, 'paginas.productos');
  const porCategoria = new Map<number, { total: number; muestra: string[] }>();
  for (const p of (productos ?? []) as { category_id: number; name: string }[]) {
    const actual = porCategoria.get(p.category_id) ?? { total: 0, muestra: [] };
    actual.total += 1;
    if (actual.muestra.length < MUESTRA_POR_CATEGORIA) actual.muestra.push(p.name);
    porCategoria.set(p.category_id, actual);
  }
  return filas.map((c) => ({
    id: c.id,
    padreId: c.parent_id,
    nombre: c.name,
    slug: c.slug,
    imagenUrl: c.image_url,
    activa: c.is_active !== false,
    branchId: c.branch_id,
    productos: porCategoria.get(c.id)?.total ?? 0,
    muestra: porCategoria.get(c.id)?.muestra ?? [],
  }));
}
