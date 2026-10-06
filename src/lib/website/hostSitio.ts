/**
 * Host público del sitio de una organización: UNA regla para el servidor (Resumen, Dominios,
 * cron de reservas) y para las pantallas del módulo, que la reciben reexportada desde
 * `components/sitio-web/rutasSitioWeb.ts`. Puro, sin React ni Supabase.
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
}

/**
 * Host público del sitio: el dominio propio PRINCIPAL, verificado y activo; si
 * no hay, el subdominio del sistema (`<subdominio>.goadmin.io`); si tampoco,
 * `null`. Una sola regla para el Resumen y el menú móvil (Figma 01c).
 */
export function hostSitio(dominios: readonly DominioDelSitio[], subdominio: string | null | undefined): string | null {
  const propio = dominios.find(
    (d) => d.domain_type === 'custom_domain' && d.status === 'verified' && d.is_active && d.is_primary
  );
  if (propio) return propio.host;
  return subdominio ? `${subdominio}.${DOMINIO_SITIOS}` : null;
}
