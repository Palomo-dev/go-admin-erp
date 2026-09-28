/**
 * Páginas de cada módulo, tal como las usan la activación de páginas por
 * organización (`organization_module_pages`), los permisos por cargo y la
 * redirección al primer módulo.
 *
 * Ya NO es una lista escrita a mano: se deriva de `src/lib/navigation/catalog.ts`,
 * la única fuente de módulos y páginas. Antes era una tercera copia que había
 * que «mantener sincronizada con MODULES_WITH_SUBMENU en AppLayout.tsx», y no
 * lo estaba (el CRM tenía 10 páginas aquí y 16 en el sidebar, así que las seis
 * restantes no se podían activar ni asignar a un cargo).
 *
 * La API pública no cambia.
 */
import { CATALOGO_NAV } from '@/lib/navigation/catalog';

export interface ModulePage {
  name: string;
  href: string;
}

export const MODULE_PAGES: Record<string, ModulePage[]> = Object.fromEntries(
  CATALOGO_NAV.filter((m) => m.codigo !== null).map((m) => [
    m.codigo as string,
    m.paginas.map((p) => ({ name: p.nombre, href: p.href })),
  ])
);

/** Obtener las páginas de un módulo por su código. */
export function getModulePages(moduleCode: string): ModulePage[] {
  return MODULE_PAGES[moduleCode] || [];
}

/** Prefijo de ruta → código de módulo. */
export const MODULE_HREF_TO_CODE: Record<string, string> = Object.fromEntries(
  CATALOGO_NAV.filter((m) => m.codigo !== null).flatMap((m) =>
    m.rutas.map((ruta) => [ruta, m.codigo as string])
  )
);

/** Obtener el código de módulo basado en el href. */
export function getModuleCodeByHref(href: string): string | null {
  for (const [moduleHref, code] of Object.entries(MODULE_HREF_TO_CODE)) {
    if (href === moduleHref || href.startsWith(moduleHref + '/')) {
      return code;
    }
  }
  return null;
}
