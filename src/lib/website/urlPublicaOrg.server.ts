/**
 * URL pública de la tienda para código de servidor. Lee `organization_domains`
 * y aplica `hostSitio` (la misma regla que `fn_url_publica_org`). No usa
 * `organizations.custom_domain`: esa columna es un espejo, no la fuente.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { hostSitio, urlPublicaDeHost, type DominioDelSitio } from '@/lib/website/hostSitio';

export async function hostPublicoOrg(db: SupabaseClient, organizationId: number): Promise<string | null> {
  if (!Number.isInteger(organizationId) || organizationId <= 0) return null;
  const [{ data: dominios, error: errorDominios }, { data: org, error: errorOrg }] = await Promise.all([
    db
      .from('organization_domains')
      .select('host, domain_type, status, is_primary, is_active, updated_at')
      .eq('organization_id', organizationId)
      .eq('is_active', true),
    db.from('organizations').select('subdomain').eq('id', organizationId).maybeSingle(),
  ]);
  if (errorDominios || errorOrg) return null;
  const filas = ((dominios ?? []) as DominioDelSitio[]).map((d) => ({
    host: String(d.host || ''),
    domain_type: String(d.domain_type || ''),
    status: String(d.status || ''),
    is_primary: d.is_primary === true,
    is_active: d.is_active === true,
    updated_at: d.updated_at ?? null,
  }));
  const sub = (org as { subdomain?: string | null } | null)?.subdomain ?? null;
  return hostSitio(filas, sub);
}

export async function urlPublicaOrg(db: SupabaseClient, organizationId: number): Promise<string | null> {
  return urlPublicaDeHost(await hostPublicoOrg(db, organizationId));
}
