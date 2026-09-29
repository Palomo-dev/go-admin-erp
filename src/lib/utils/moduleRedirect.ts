/**
 * Helpers para resolver la primera página activa de un módulo
 * y construir el destino de redirección cuando un usuario entra a la raíz
 * de un módulo (ej: /app/crm → /app/crm/clientes).
 *
 * Usado por ModuleRootRedirect y la lógica de redirect de las raíces de módulo.
 */

import { moduleManagementService } from '@/lib/services/moduleManagementService';
import { MODULE_PAGES, getModulePages, type ModulePage } from '@/lib/config/modulePages';
import { filtrarPaginasActivas } from '@/lib/navigation/paginaActiva';

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
 * Páginas del módulo que esta organización ve, en el orden del catálogo.
 *
 * La regla de activación es la de `paginaActiva()` y solo la de ahí: una página
 * sin fila en `organization_module_pages` está activa, y solo la esconde una
 * fila con `is_active = false`. Aquí llega ya resuelto quién decide; lo único
 * propio de la redirección es no apuntar a los dashboards raíz.
 *
 * Si la consulta falla se cae a todo el catálogo del módulo: es un redirect, y
 * dejar a la persona en `/app/inicio` por un fallo de red es peor que llevarla
 * a una pantalla que la RLS ya protege.
 */
async function resolveActivePages(
  moduleCode: string,
  organizationId: number,
): Promise<ModulePage[]> {
  const staticPages = getModulePages(moduleCode);
  if (!staticPages.length) return [];

  const paginasOcultas = await moduleManagementService
    .getHiddenModulePages(organizationId)
    .catch(() => ({}) as Record<string, string[]>);

  // El módulo ya está activo: a esta función solo se llega desde su raíz, que
  // el middleware corta antes si la organización no lo tiene contratado.
  const visibles = filtrarPaginasActivas(moduleCode, staticPages, {
    modulosActivos: [moduleCode],
    paginasOcultas,
  });

  return visibles.filter((p) => !EXCLUDED_REDIRECT_HREFS.has(p.href));
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
