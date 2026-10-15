/**
 * Lee el manifiesto de secciones del host público de la organización.
 * El host sale de `organization_domains` y del subdominio, nunca del cliente.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { hostSitio, type DominioDelSitio } from '@/lib/website/hostSitio';
import { hostPublicoSeguro, manifiestoDeCuerpo } from '@/lib/website/manifiestoSitio';
import type { SectionManifest } from '@/lib/services/website/sectionContract';

const RUTAS = ['/api/site-capabilities', '/api/_sections/manifest'] as const;

export async function hostPublicoDeLaOrganizacion(
  supabase: SupabaseClient,
  organizationId: number,
): Promise<string | null> {
  const [org, dominios] = await Promise.all([
    supabase.from('organizations').select('subdomain').eq('id', organizationId).maybeSingle(),
    supabase
      .from('organization_domains')
      .select('host, domain_type, status, is_primary, is_active')
      .eq('organization_id', organizationId),
  ]);
  if (org.error) throw org.error;
  if (dominios.error) throw dominios.error;
  const host = hostSitio(
    ((dominios.data ?? []) as DominioDelSitio[]),
    (org.data as { subdomain?: string | null } | null)?.subdomain ?? null,
  );
  return hostPublicoSeguro(host);
}

async function pedir(url: string): Promise<SectionManifest | null> {
  try {
    const respuesta = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
      cache: 'no-store',
    });
    if (!respuesta.ok) return null;
    const tipo = respuesta.headers.get('content-type') ?? '';
    if (!tipo.toLowerCase().includes('application/json')) return null;
    return manifiestoDeCuerpo(await respuesta.json());
  } catch {
    return null;
  }
}

/** JSON del sitio. HTML del catch-all, redirecciones y errores quedan en `null`. */
export async function leerManifiestoDelHost(host: string): Promise<SectionManifest | null> {
  const seguro = hostPublicoSeguro(host);
  if (!seguro) return null;
  for (const ruta of RUTAS) {
    const manifiesto = await pedir(`https://${seguro}${ruta}`);
    if (manifiesto) return manifiesto;
  }
  return null;
}
