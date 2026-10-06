/**
 * ¿El slug de una sede choca con una página del sitio principal?
 *
 * El sitio resuelve `/<slug>` como la sede antes que como página, así que una sede con el
 * slug de una página deja la página inalcanzable (y al revés, en el editor). Antes solo había
 * un aviso; ahora el formulario de Sucursales rechaza publicar la sede.
 *
 * Mira las páginas legacy (`website_pages`, sitio principal) y las de la revisión V2 publicada
 * del sitio principal (`website_site_states` → `website_site_revisions.document.paginas`).
 * Con el cliente de la sesión: RLS deja leerlas a los miembros de la organización.
 * Un fallo de lectura no bloquea (se registra): el slug reservado lo valida `validateSlug`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

interface PaginaDocumento {
  slug?: unknown;
}

export async function slugChocaConPagina(
  cliente: SupabaseClient,
  organizationId: number,
  slug: string,
): Promise<boolean> {
  const buscado = slug.trim().toLowerCase();
  if (!buscado) return false;
  try {
    const { data: legacy, error: errorLegacy } = await cliente
      .from('website_pages')
      .select('id')
      .eq('organization_id', organizationId)
      .is('branch_id', null)
      .eq('slug', buscado)
      .limit(1);
    if (errorLegacy) throw errorLegacy;
    if ((legacy ?? []).length > 0) return true;

    const { data: estado, error: errorEstado } = await cliente
      .from('website_site_states')
      .select('id, published_revision_id')
      .eq('organization_id', organizationId)
      .is('branch_id', null)
      .maybeSingle();
    if (errorEstado) throw errorEstado;
    const revisionId = (estado as { published_revision_id: string | null } | null)?.published_revision_id;
    if (!revisionId) return false;

    const { data: revision, error: errorRevision } = await cliente
      .from('website_site_revisions')
      .select('paginas:document->paginas')
      .eq('id', revisionId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (errorRevision) throw errorRevision;
    const paginas = (revision as { paginas: PaginaDocumento[] | null } | null)?.paginas ?? [];
    return Array.isArray(paginas) && paginas.some((p) => typeof p?.slug === 'string' && p.slug.toLowerCase() === buscado);
  } catch (error) {
    console.error('[sucursales] No se pudo comprobar el slug contra las páginas del sitio', {
      organizationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
