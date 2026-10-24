/**
 * Resolvedor de la política: la URL manual de `comm_settings` gana.
 * Si no hay, la página publicada de tratamiento con texto.
 * Servidor. No escribe `data_policy_url`.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import { validarDocumentoSitio } from '@/lib/website/contrato/documentoSitio';
import type { ClaveLegal } from '@/lib/website/configuracionSitio';
import { politicaManualValida } from '@/lib/website/configuracionSitio';
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import { caracteresDePagina, definicionLegal, paginaPorClave } from '@/lib/website/legales/lecturaLegal';
import { MIN_TEXTO_LEGAL } from '@/lib/website/legales/plantillasLegales';

export interface DocumentoLegalResuelto {
  url: string | null;
  publicado: boolean;
  conTexto: boolean;
  slug: string;
}

export function resolverPolitica(
  manual: string | null | undefined,
  pagina: { url: string | null; publicado: boolean; conTexto: boolean } | null,
): string | null {
  if (politicaManualValida(manual)) return manual;
  if (pagina?.publicado && pagina.conTexto && politicaManualValida(pagina.url)) return pagina.url;
  return null;
}

export async function obtenerDocumentoLegal(
  supabase: SupabaseClient,
  orgId: number,
  clave: ClaveLegal,
  branchId: number | null = null,
): Promise<DocumentoLegalResuelto> {
  const def = definicionLegal(clave);
  const vacio: DocumentoLegalResuelto = { url: null, publicado: false, conTexto: false, slug: def.slug };
  let consulta = supabase.from('website_site_states').select('id, published_revision_id').eq('organization_id', orgId);
  consulta = branchId == null ? consulta.is('branch_id', null) : consulta.eq('branch_id', branchId);
  const estado = await consulta.maybeSingle();
  const revisionId = (estado.data as { published_revision_id?: string | null } | null)?.published_revision_id;
  if (!revisionId) return vacio;
  const revision = await supabase
    .from('website_site_revisions')
    .select('document')
    .eq('id', revisionId)
    .eq('organization_id', orgId)
    .maybeSingle();
  const validado = validarDocumentoSitio((revision.data as { document?: unknown } | null)?.document);
  if (!validado.ok) return vacio;
  const doc = validado.documento as DocumentoSitio;
  const pagina = paginaPorClave(doc.paginas, clave);
  if (!pagina) return vacio;
  const [orgRes, domainsRes] = await Promise.all([
    supabase.from('organizations').select('subdomain').eq('id', orgId).maybeSingle(),
    supabase.from('organization_domains').select('host, domain_type, status, is_primary, is_active, updated_at').eq('organization_id', orgId),
  ]);
  const host = hostSitio((domainsRes.data ?? []) as DominioDelSitio[], (orgRes.data as { subdomain?: string | null } | null)?.subdomain);
  const conTexto = caracteresDePagina(pagina) >= MIN_TEXTO_LEGAL;
  const url = host && pagina.publicada && conTexto ? `https://${host}/${pagina.slug}` : null;
  return { url, publicado: pagina.publicada, conTexto, slug: pagina.slug };
}

/** URL que citan el agente de voz y el CRM. No modifica la URL guardada. */
export async function urlPoliticaEfectiva(
  supabase: SupabaseClient,
  orgId: number,
  dataPolicyUrl: string | null | undefined,
): Promise<string | null> {
  if (politicaManualValida(dataPolicyUrl)) return dataPolicyUrl;
  const pagina = await obtenerDocumentoLegal(supabase, orgId, 'tratamiento');
  return resolverPolitica(null, pagina);
}
