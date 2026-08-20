/**
 * Helpers para resolver la primera página activa de un módulo
 * y construir el destino de redirección cuando un usuario entra a la raíz
 * de un módulo (ej: /app/crm → /app/crm/clientes).
 *
 * Usado por ModuleRootRedirect y la lógica de redirect de las raíces de módulo.
 */

import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { MODULE_PAGES, getModulePages, type ModulePage } from '@/lib/config/modulePages';

/**
 * Páginas que no deben usarse como destino de redirect (dashboards raíz que
 * precisamente estamos eliminando). Se excluyen para que el redirect no caiga
 * en la página que dispara el redirect (loop infinito).
 */
const EXCLUDED_REDIRECT_HREFS = new Set<string>([
  // Las raíces de cada módulo son los dashboards viejos que se eliminan
  '/app/crm',
  '/app/finanzas',
  '/app/inventario',
  '/app/pms',
  '/app/pm',
  '/app/gym',
  '/app/parking',
  '/app/transporte',
  '/app/notificaciones',
  '/app/chat',
  '/app/integraciones',
  // POS, Calendario y Timeline son páginas funcionales (no dashboards)
  // y NO deben redirigir a /app/inicio
]);

/**
 * Obtiene las páginas activas de un módulo para una organización,
 * consultando `organization_module_pages` y filtrando por las páginas
 * estáticas definidas en `MODULE_PAGES`.
 *
 * Si la organización no tiene páginas activas registradas en DB (caso de
 * módulos core o configuración legacy), cae al fallback estático de
 * `MODULE_PAGES` para ese código.
 */
async function resolveActivePages(
  moduleCode: string,
  organizationId: number,
): Promise<ModulePage[]> {
  // 1. Intentar páginas activas desde DB
  const activePagesMap = await moduleManagementService
    .getActiveModulePages(organizationId)
    .catch(() => null);

  const staticPages = getModulePages(moduleCode);
  if (!staticPages.length) return [];

  // 2. Si hay páginas activas en DB, filtrar las estáticas por las activas
  if (activePagesMap && activePagesMap[moduleCode]?.length) {
    const activeHrefs = new Set(activePagesMap[moduleCode]);
    const filtered = staticPages.filter(
      (p) => activeHrefs.has(p.href) && !EXCLUDED_REDIRECT_HREFS.has(p.href),
    );
    if (filtered.length) return filtered;
  }

  // 3. Fallback: páginas estáticas excluyendo las raíces de dashboard
  return staticPages.filter((p) => !EXCLUDED_REDIRECT_HREFS.has(p.href));
}

/**
 * Resuelve la primera página activa de un módulo para una organización.
 * Devuelve el href absoluto (ej: '/app/crm/clientes') o null si no hay
 * ninguna página disponible.
 */
export async function getFirstActivePageHref(
  moduleCode: string,
  organizationId: number,
): Promise<string | null> {
  const pages = await resolveActivePages(moduleCode, organizationId);
  return pages[0]?.href ?? null;
}

/**
 * Destino por defecto cuando un módulo no tiene páginas activas.
 * Redirige al inicio del dashboard unificado.
 */
export const DEFAULT_REDIRECT = '/app/inicio';

/**
 * Resuelve el destino de redirección para la raíz de un módulo.
 * - Si el módulo tiene páginas activas → primera página activa
 * - Si no → /app/inicio
 */
export async function resolveModuleRootRedirect(
  moduleCode: string,
  organizationId: number,
): Promise<string> {
  const firstPage = await getFirstActivePageHref(moduleCode, organizationId);
  return firstPage ?? DEFAULT_REDIRECT;
}

/**
 * Versión síncrona de fallback usando solo `MODULE_PAGES` estático.
 * Útil para casos donde no se puede esperar la consulta a DB (ej: SSR sin
 * organización cargada). Devuelve la primera página no-excluida del módulo.
 */
export function getStaticFirstPageHref(moduleCode: string): string | null {
  const pages = (MODULE_PAGES[moduleCode] || []).filter(
    (p) => !EXCLUDED_REDIRECT_HREFS.has(p.href),
  );
  return pages[0]?.href ?? null;
}
