/**
 * Códigos de módulo viejos que siguen llegando desde otros repositorios o marcadores guardados.
 *
 * «gym» se generalizó como «memberships» (docs/design/MEMBRESIAS-FASE-1-2.md §3 M4). En la base,
 * `modules.gym` queda inactivo pero NO se borra (su FK ON DELETE CASCADE borraría las
 * activaciones), y un disparador replica en «memberships» lo que otro repositorio haga con «gym».
 * En el ERP, activar o desactivar «gym» actúa sobre «memberships». Se retira cuando go-admin-super
 * y goadmin-websites dejen de usar «gym».
 *
 * Módulo hoja: sin dependencias, para que lo usen el middleware, los servicios y las pruebas.
 */
export const MODULE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  gym: 'memberships',
});

/** Código canónico de un módulo (resuelve alias; el resto se devuelve igual). */
export function canonicalModuleCode(code: string): string {
  return MODULE_ALIASES[code] ?? code;
}

/** Códigos equivalentes a uno canónico (él mismo y sus alias), p. ej. memberships → [memberships, gym]. */
export function moduleCodeVariants(code: string): string[] {
  const canonical = canonicalModuleCode(code);
  return [canonical, ...Object.keys(MODULE_ALIASES).filter((alias) => MODULE_ALIASES[alias] === canonical)];
}
