/**
 * ¿Esta organización ve esta página? — ÚNICO sitio donde se decide.
 *
 * Antes la respuesta dependía de quién preguntara, porque el código que ESCRIBE
 * `organization_module_pages` y el que la LEE daban a la ausencia de fila
 * significados opuestos:
 *
 *  - Al escribir (`moduleManagementService.toggleModulePage`), una página sin
 *    fila se daba por ACTIVA: `current ? current.is_active : true`.
 *  - Al leer (`filtrar.ts`), una página sin fila se daba por OCULTA:
 *    `if (activas !== undefined && !activas.includes(p.href)) return false`.
 *
 * Consecuencia: cada página nueva del catálogo nacía invisible —para siempre y
 * sin avisar— en toda organización que ya tuviera lista. Medido el 2026-09-23:
 * las tres organizaciones con CRM activo y lista incompleta (orgs 130, 134 y
 * 138) no veían Leads, Llamadas, Objeciones ni Agentes IA, y seis
 * organizaciones no veían `/app/finanzas/documentos-soporte`.
 *
 * La regla, ahora una sola:
 *
 *  1. Un módulo sin código (Inicio) no depende de la organización: visible.
 *  2. Un módulo que la organización no tiene activo lo oculta TODO.
 *  3. Una página con fila `is_active = false` está oculta. Es el único modo de
 *     ocultar una página, y expresa una decisión deliberada de alguien.
 *  4. Cualquier otra página —incluida la que no tiene fila— está activa.
 *
 * O sea: la lista ya no dice qué se ve, dice qué se esconde. Una página nueva
 * del catálogo aparece sola en todas partes, que es lo que se espera al
 * añadirla.
 *
 * Lo que este helper NO decide, porque son mecanismos aparte que no cambian:
 *  - las restricciones por cargo (`paginasCargo` / `modulosCargo`);
 *  - las capacidades calculadas en el servidor (`PaginaNav.requiere`).
 */
import { moduloPorCodigo } from './catalog';

/** Lo que hace falta saber de la organización para decidir. */
export interface AccesoPaginas {
  /** Códigos de módulo activos en la organización (`organization_modules` ∪ núcleo). */
  modulosActivos: string[];
  /**
   * Páginas explícitamente apagadas por módulo: las filas de
   * `organization_module_pages` con `is_active = false`. Un módulo sin entrada
   * no esconde ninguna página. Nunca es «la lista de las que se ven».
   */
  paginasOcultas: Record<string, string[]>;
}

/**
 * Única respuesta a «¿se ve esta página?». Todo lector pasa por aquí: el menú,
 * la redirección a la raíz de un módulo, la navegación del GO Assistant, la
 * pantalla de permisos por cargo y la de módulos de la organización.
 *
 * @param codigoModulo Código del módulo, o `null` para un módulo sin código.
 * @param href Ruta de la página, tal como está en el catálogo.
 */
export function paginaActiva(
  codigoModulo: string | null,
  href: string,
  acceso: AccesoPaginas
): boolean {
  // 1. Un módulo sin código (Inicio) no se contrata: siempre está.
  if (codigoModulo === null) return true;

  // 2. Módulo inactivo → no se ve ninguna de sus páginas.
  if (!acceso.modulosActivos.includes(codigoModulo)) return false;

  // 2.bis. Los módulos de una sola página (Clientes, Reportes, Configuración)
  // nunca se filtraron por página: su visibilidad la decide el módulo. La
  // exención vivía solo en `filtrar.ts` (`filtrable`), así que el menú y el
  // asistente podían discrepar sobre la única página de un módulo. Vive aquí
  // para que la respuesta sea una sola.
  if ((moduloPorCodigo(codigoModulo)?.paginas.length ?? 0) <= 1) return true;

  // 3. Fila con is_active = false → alguien la apagó a propósito.
  const ocultas = acceso.paginasOcultas[codigoModulo];
  if (ocultas !== undefined && ocultas.includes(href)) return false;

  // 4. Ausente de la lista = activa.
  return true;
}

/**
 * La misma regla aplicada a una lista de páginas, para los lectores que
 * recorren el catálogo de un módulo entero. Sirve para cualquier forma que
 * tenga `href`, así que vale igual para `PaginaNav` y para `ModulePage`.
 */
export function filtrarPaginasActivas<T extends { href: string }>(
  codigoModulo: string | null,
  paginas: readonly T[],
  acceso: AccesoPaginas
): T[] {
  return paginas.filter((p) => paginaActiva(codigoModulo, p.href, acceso));
}
