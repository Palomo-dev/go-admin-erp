/**
 * Qué parte del catálogo ve una persona concreta, y qué módulo/página está
 * activo. Funciones puras: no leen la base de datos ni el navegador, así que se
 * prueban sin montar nada (`__tests__/filtrar.test.ts`).
 *
 * Las reglas son las mismas que aplicaban el sidebar y el panel de submenú
 * viejos, cada uno por su cuenta:
 *  - un módulo sin código (Inicio) siempre se ve;
 *  - un módulo se ve si la organización lo tiene activo y el cargo no lo oculta;
 *  - sus páginas se filtran por las páginas activas de la organización, por el
 *    acceso del cargo y por las capacidades calculadas en el servidor;
 *  - si no le queda ninguna página, el módulo desaparece;
 *  - su enlace es su primera página visible (así quien solo tiene la bandeja de
 *    notificaciones entra directo a la bandeja).
 */
import {
  CATALOGO_NAV,
  SECCIONES,
  type CapacidadNav,
  type CodigoSeccion,
  type ModuloNav,
  type PaginaNav,
} from './catalog';

export interface AccesoNav {
  /** Códigos de módulo activos en la organización (`organization_modules` ∪ núcleo). */
  modulosActivos: string[];
  /**
   * Páginas activas por módulo (`organization_module_pages`). Un módulo sin
   * entrada tiene todas sus páginas activas.
   */
  paginasActivas: Record<string, string[]>;
  /** Módulos que permite el cargo. `null` = el cargo no restringe. */
  modulosCargo: string[] | null;
  /** Páginas que permite el cargo. `null` = el cargo no restringe. */
  paginasCargo: string[] | null;
  /** Capacidades que el servidor le reconoce en la organización activa. */
  capacidades: ReadonlySet<CapacidadNav>;
}

export interface ModuloVisible {
  modulo: ModuloNav;
  paginas: PaginaNav[];
  /** Enlace del módulo: su primera página visible. */
  href: string;
  /** true si tiene más de una página: abre el panel de submenú en vez de navegar. */
  tieneSubmenu: boolean;
}

export interface SeccionVisible {
  codigo: CodigoSeccion;
  /** Clave i18n `nav.<etiqueta>`. */
  etiqueta: string;
  modulos: ModuloVisible[];
}

function paginasVisibles(modulo: ModuloNav, acceso: AccesoNav): PaginaNav[] {
  // Los módulos de una sola página (Clientes, Reportes, Configuración) nunca se
  // filtraron por página en el sidebar viejo: su visibilidad la decide el
  // módulo. Filtrarlos ahora haría desaparecer «Clientes» a cualquier cargo con
  // permisos por página que no lo tuviera en su lista.
  const filtrable = modulo.codigo !== null && modulo.paginas.length > 1;
  const activas = filtrable ? acceso.paginasActivas[modulo.codigo!] : undefined;
  return modulo.paginas.filter((p) => {
    if (p.enMenu === false) return false;
    if (activas !== undefined && !activas.includes(p.href)) return false;
    if (filtrable && acceso.paginasCargo !== null && !acceso.paginasCargo.includes(p.href)) {
      return false;
    }
    if (p.requiere && !acceso.capacidades.has(p.requiere)) return false;
    return true;
  });
}

function moduloVisible(modulo: ModuloNav, acceso: AccesoNav): ModuloVisible | null {
  if (modulo.codigo) {
    if (!acceso.modulosActivos.includes(modulo.codigo)) return null;
    if (acceso.modulosCargo !== null && !acceso.modulosCargo.includes(modulo.codigo)) return null;
  }
  const paginas = paginasVisibles(modulo, acceso);
  if (paginas.length === 0) return null;
  return { modulo, paginas, href: paginas[0].href, tieneSubmenu: paginas.length > 1 };
}

/** Secciones con sus módulos visibles, en orden; las secciones vacías no aparecen. */
export function filtrarNavegacion(acceso: AccesoNav, catalogo: ModuloNav[] = CATALOGO_NAV): SeccionVisible[] {
  return SECCIONES.map((s) => ({
    codigo: s.codigo,
    etiqueta: s.etiqueta,
    modulos: catalogo
      .filter((m) => m.seccion === s.codigo)
      .map((m) => moduloVisible(m, acceso))
      .filter((m): m is ModuloVisible => m !== null),
  })).filter((s) => s.modulos.length > 0);
}

function coincide(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(prefijo + '/');
}

export interface RutaActiva {
  modulo: ModuloNav;
  /** Página más específica que contiene la ruta, si la hay. */
  pagina: PaginaNav | null;
}

/**
 * Módulo y página activos para una ruta. Gana la coincidencia más larga, para
 * que `/app/finanzas/contabilidad/asientos` marque «Asientos» y no
 * «Contabilidad», y `/app/pos/ventas/123` marque «Ventas» y no «POS».
 */
export function rutaActiva(pathname: string | null, catalogo: ModuloNav[] = CATALOGO_NAV): RutaActiva | null {
  if (!pathname) return null;
  let mejor: { modulo: ModuloNav; pagina: PaginaNav | null; largo: number } | null = null;

  for (const modulo of catalogo) {
    for (const pagina of modulo.paginas) {
      // Una página fuera del menú no se resalta: resalta la que la contiene.
      if (pagina.enMenu === false) continue;
      if (coincide(pathname, pagina.href) && (!mejor || pagina.href.length > mejor.largo)) {
        mejor = { modulo, pagina, largo: pagina.href.length };
      }
    }
    for (const ruta of modulo.rutas) {
      // Una ruta del módulo sin página propia (p. ej. un detalle) activa el
      // módulo, pero nunca le gana a una página que coincide más.
      if (coincide(pathname, ruta) && (!mejor || ruta.length > mejor.largo)) {
        mejor = { modulo, pagina: null, largo: ruta.length };
      }
    }
  }
  return mejor ? { modulo: mejor.modulo, pagina: mejor.pagina } : null;
}
