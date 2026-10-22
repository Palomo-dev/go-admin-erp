/**
 * Host público del sitio de una organización: UNA regla para el servidor (Resumen, Dominios,
 * cron de reservas) y para las pantallas del módulo, que la reciben reexportada desde
 * `components/sitio-web/rutasSitioWeb.ts`. Puro, sin React ni Supabase.
 *
 * La misma regla está en `fn_url_publica_org`: dominio propio principal verificado,
 * si no el subdominio del sistema, si no `organizations.subdomain`.
 */
/** Dominio de los subdominios de sitio (`<subdominio>.goadmin.io`). */
export const DOMINIO_SITIOS = 'goadmin.io';

/** Lo mínimo de una fila de `organization_domains` para decidir la URL pública. */
export interface DominioDelSitio {
  host: string;
  domain_type: string;
  status: string;
  is_primary: boolean;
  is_active: boolean;
  updated_at?: string | null;
}

function hostUtil(valor: string | null | undefined): string | null {
  if (!valor || typeof valor !== 'string') return null;
  let host = valor.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!host || host.length > 253 || host.includes('..') || host.includes(' ')) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return null;
  return host;
}

function subdominioUtil(valor: string | null | undefined): string | null {
  if (!valor || typeof valor !== 'string') return null;
  const sub = valor.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) return null;
  return sub;
}

function momento(d: DominioDelSitio): number {
  const t = d.updated_at ? Date.parse(d.updated_at) : 0;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Host público del sitio: el dominio propio PRINCIPAL, verificado y activo; si
 * no hay, el subdominio del sistema; si tampoco, `<subdominio>.goadmin.io`.
 * Sin ninguno de los tres, `null`. No lee `organizations.custom_domain`.
 */
export function hostSitio(dominios: readonly DominioDelSitio[], subdominio: string | null | undefined): string | null {
  const propio = dominios
    .map((d) => ({ ...d, host: hostUtil(d.host) ?? '' }))
    .filter((d) => d.host && d.domain_type === 'custom_domain' && d.status === 'verified' && d.is_active && d.is_primary)
    .sort((a, b) => momento(b) - momento(a))[0];
  if (propio?.host) return propio.host;

  const sistema = dominios
    .map((d) => ({ ...d, host: hostUtil(d.host) ?? '' }))
    .filter((d) => d.host && d.domain_type === 'system_subdomain' && d.is_active)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || momento(b) - momento(a))[0];
  if (sistema?.host) return sistema.host;

  const sub = subdominioUtil(subdominio);
  return sub ? `${sub}.${DOMINIO_SITIOS}` : null;
}

/** `https://` + host público, o null si no hay host. */
export function urlPublicaDeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  return `https://${host}`;
}
