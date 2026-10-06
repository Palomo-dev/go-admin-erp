/**
 * Guardado legacy del editor en el servidor (ver `editorLegacy.ts`). Solo servidor.
 *
 * 1. Permisos: `website.sites.edit` y `website.sites.publish` resueltos en la base
 *    (`permisosSitio` → `fn_website_tiene_permiso`). En legacy guardar es publicar,
 *    así que sin el de publicar se responde 403.
 * 2. Escritura: una sola RPC transaccional `fn_editor_guardar_legacy` (migración en
 *    `supabase/pendientes/20261009090000_editor_guardar_legacy.sql`). Mientras no
 *    esté aplicada, se escribe desde aquí con el cliente de la sesión (RLS) y la
 *    organización de la sesión en cada `where`, en el mismo orden que antes hacía el
 *    navegador. Ese respaldo NO es atómico: se retira al aplicar la migración.
 */
import type { ServerOrgContext } from '@/lib/utils/orgContext';
import { permisosSitio } from '@/lib/services/website/paginasSitioService';
import { ErrorSitio } from '@/lib/services/website/siteDocumentService';
import type { LoteLegacy, RespuestaGuardadoLegacy } from './editorLegacy';

type Ctx = Pick<ServerOrgContext, 'organizationId' | 'supabase'>;

const SIN_FUNCION = new Set(['42883', 'PGRST202']);
const codigoDe = (e: unknown) => ((e as { code?: string } | null)?.code ?? '') as string;

function traducirError(error: unknown, contexto: string): never {
  const code = codigoDe(error);
  if (code === '42501') throw new ErrorSitio('sin_permiso', 'No tienes permiso para publicar el sitio web.');
  if (code === '23505') throw new ErrorSitio('peticion_invalida', 'Ya existe una página con esa dirección en el sitio.');
  if (code === 'P0002') throw new ErrorSitio('sitio_no_encontrado', 'La página o los ajustes del sitio no existen.');
  if (code === '22023') throw new ErrorSitio('peticion_invalida', 'Revisa los cambios del editor.');
  console.error(`[editorLegacy] ${contexto}`, (error as { message?: string } | null)?.message ?? error);
  throw new ErrorSitio('error_interno', 'No se pudo guardar el sitio.');
}

export async function guardarLegacyServidor(ctx: Ctx, lote: LoteLegacy): Promise<RespuestaGuardadoLegacy> {
  const permisos = await permisosSitio(ctx);
  if (!permisos.editar || !permisos.publicar) {
    throw new ErrorSitio('sin_permiso', 'Guardar en este sitio lo publica: necesitas el permiso de publicar el sitio web.');
  }

  const { data, error } = await ctx.supabase.rpc('fn_editor_guardar_legacy', {
    p_org: ctx.organizationId,
    p_page_id: lote.paginaId,
    p_branch: lote.sedeId,
    p_lote: { secciones: lote.secciones, orden: lote.orden, pagina: lote.pagina, ajustes: lote.ajustes, menus: lote.menus },
  });
  if (!error) return { ajustes: (data as { ajustes?: Record<string, unknown> | null } | null)?.ajustes ?? null };
  if (!SIN_FUNCION.has(codigoDe(error))) traducirError(error, 'rpc');
  return guardarSinRpc(ctx, lote);
}

/** Respaldo mientras la RPC está pendiente. Mismo orden y mismas columnas que el editor usaba. */
async function guardarSinRpc(ctx: Ctx, lote: LoteLegacy): Promise<RespuestaGuardadoLegacy> {
  const org = ctx.organizationId;
  const ahora = new Date().toISOString();
  const db = ctx.supabase;

  const { data: pagina, error: ePagina } = await db
    .from('website_pages')
    .select('id, branch_id, slug')
    .eq('id', lote.paginaId)
    .eq('organization_id', org)
    .maybeSingle();
  if (ePagina) traducirError(ePagina, 'pagina');
  if (!pagina) throw new ErrorSitio('sitio_no_encontrado', 'La página no existe en esta organización.');

  for (const s of lote.secciones) {
    const { data, error } = await db
      .from('website_page_sections')
      .update({ ...s.cambios, updated_at: ahora })
      .eq('id', s.id)
      .eq('page_id', lote.paginaId)
      .eq('organization_id', org)
      .select('id');
    if (error) traducirError(error, 'seccion');
    if (!data || data.length === 0) throw new ErrorSitio('sin_permiso', 'No se pudo actualizar una sección: revisa tus permisos.');
  }

  for (const [indice, id] of lote.orden.entries()) {
    const { error } = await db
      .from('website_page_sections')
      .update({ sort_order: indice, updated_at: ahora })
      .eq('id', id)
      .eq('page_id', lote.paginaId)
      .eq('organization_id', org);
    if (error) traducirError(error, 'orden');
  }

  if (Object.keys(lote.pagina).length > 0) {
    const slug = lote.pagina.slug;
    if (typeof slug === 'string' && slug !== (pagina as { slug: string }).slug) {
      let dup = db.from('website_pages').select('id').eq('organization_id', org).eq('slug', slug).neq('id', lote.paginaId);
      const branch = (pagina as { branch_id: number | null }).branch_id;
      dup = branch === null ? dup.is('branch_id', null) : dup.eq('branch_id', branch);
      const { data: existente } = await dup.limit(1);
      if (existente && existente.length > 0) throw new ErrorSitio('peticion_invalida', 'Ya existe una página con esa dirección en el sitio.');
    }
    const { error } = await db
      .from('website_pages')
      .update({ ...lote.pagina, updated_at: ahora })
      .eq('id', lote.paginaId)
      .eq('organization_id', org);
    if (error) traducirError(error, 'pagina.update');
  }

  let ajustes: Record<string, unknown> | null = null;
  if (Object.keys(lote.ajustes).length > 0) ajustes = await escribirAjustes(ctx, lote.sedeId, lote.ajustes, ahora);

  for (const m of lote.menus) {
    const { error } = await db
      .from('website_pages')
      .update({ ...m.cambios, updated_at: ahora })
      .eq('id', m.id)
      .eq('organization_id', org);
    if (error) traducirError(error, 'menu');
  }

  return { ajustes };
}

/** Actualiza la fila del ámbito (principal o sede); si la sede no tiene fila, la crea desde la principal. */
async function escribirAjustes(ctx: Ctx, sedeId: number | null, cambios: Record<string, unknown>, ahora: string) {
  const db = ctx.supabase;
  const org = ctx.organizationId;
  let q = db.from('website_settings').select('id').eq('organization_id', org);
  q = sedeId === null ? q.is('branch_id', null) : q.eq('branch_id', sedeId);
  const { data: fila, error: eFila } = await q.maybeSingle();
  if (eFila) traducirError(eFila, 'ajustes.buscar');

  if (fila) {
    const { data, error } = await db
      .from('website_settings')
      .update({ ...cambios, updated_at: ahora })
      .eq('id', (fila as { id: string }).id)
      .eq('organization_id', org)
      .select()
      .maybeSingle();
    if (error) traducirError(error, 'ajustes.update');
    if (!data) throw new ErrorSitio('sin_permiso', 'No se pudieron guardar los ajustes: revisa tus permisos.');
    return data as Record<string, unknown>;
  }
  if (sedeId === null) throw new ErrorSitio('sitio_no_encontrado', 'El sitio aún no tiene ajustes. Créalo desde el Resumen.');

  const { data: principal } = await db.from('website_settings').select('*').eq('organization_id', org).is('branch_id', null).maybeSingle();
  const base: Record<string, unknown> = { ...((principal as Record<string, unknown> | null) ?? {}) };
  delete base.id;
  delete base.created_at;
  delete base.updated_at;
  const { data, error } = await db
    .from('website_settings')
    .insert({ ...base, ...cambios, organization_id: org, branch_id: sedeId, updated_at: ahora })
    .select()
    .single();
  if (error) traducirError(error, 'ajustes.insert');
  return data as Record<string, unknown>;
}
