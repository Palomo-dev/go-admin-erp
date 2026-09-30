/**
 * «Primeros pasos» del inicio (Figma 445:137617 escritorio y 448:205616 móvil,
 * «Inicio — vacío (organización nueva)»). Anotación del diseño (§C.4): «el
 * onboarding deja de ser una franja y pasa a ser el contenido de “Hoy”
 * mientras no haya datos».
 *
 * Regla pura: los siete pasos (los mismos del antiguo `OnboardingBanner`, en
 * el orden del diseño), cuándo cuenta cada uno como hecho y cuándo se muestra
 * el bloque. Los conteos los lee el servidor con el cliente de la sesión
 * (`primerosPasos` en `inicio.server.ts`); el enlace de cada paso solo se
 * ofrece si la persona ve esa página en su menú.
 */

export const PASOS = ['modulos', 'organizacion', 'sucursal', 'equipo', 'productos', 'impuestos', 'clientes'] as const;
export type IdPaso = (typeof PASOS)[number];

/** Página a la que lleva «Ir» (se ofrece solo si está en el menú visible). */
export const PAGINA_PASO: Record<IdPaso, string> = {
  modulos: '/app/organizacion/modulos',
  organizacion: '/app/organizacion/informacion',
  sucursal: '/app/organizacion/sucursales',
  equipo: '/app/organizacion/invitaciones',
  productos: '/app/inventario/productos',
  impuestos: '/app/finanzas/impuestos',
  clientes: '/app/clientes',
};

/** Acciones del estado «Todavía no hay movimientos» (Figma 448:73622). */
export const PAGINA_AGREGAR_PRODUCTOS = PAGINA_PASO.productos;
export const PAGINA_POS = '/app/pos';

export interface ConteosPasos {
  /** Módulos activos que no son los de base (clientes, organización, roles…). */
  modulos: number;
  sucursales: number;
  miembros: number;
  productos: number;
  impuestos: number;
  clientes: number;
}

export interface PasoInicio {
  id: IdPaso;
  hecho: boolean;
  href: string | null;
}

export interface PrimerosPasos {
  pasos: PasoInicio[];
  hechos: number;
  /** ¿Hubo alguna vez ventas, facturas, movimientos de stock o reservas? */
  hayMovimientos: boolean;
  /** Acciones del estado vacío, si la persona ve esas páginas. */
  hrefProductos: string | null;
  hrefPos: string | null;
}

export function pasosHechos(c: ConteosPasos): Record<IdPaso, boolean> {
  return {
    modulos: c.modulos > 0,
    // La organización existe: el paso está hecho (igual que antes).
    organizacion: true,
    sucursal: c.sucursales > 0,
    // Hay equipo cuando hay alguien más que quien la creó.
    equipo: c.miembros > 1,
    productos: c.productos > 0,
    impuestos: c.impuestos > 0,
    clientes: c.clientes > 0,
  };
}

export function armarPrimerosPasos(
  c: ConteosPasos,
  hayMovimientos: boolean,
  visible: (href: string) => boolean,
): PrimerosPasos {
  const hechos = pasosHechos(c);
  const pasos = PASOS.map((id) => ({ id, hecho: hechos[id], href: visible(PAGINA_PASO[id]) ? PAGINA_PASO[id] : null }));
  return {
    pasos,
    hechos: pasos.filter((p) => p.hecho).length,
    hayMovimientos,
    hrefProductos: visible(PAGINA_AGREGAR_PRODUCTOS) ? PAGINA_AGREGAR_PRODUCTOS : null,
    hrefPos: visible(PAGINA_POS) ? PAGINA_POS : null,
  };
}

/**
 * «Primeros pasos» ocupa el lugar de «Hoy» mientras la organización no tenga
 * movimientos y quede algún paso, salvo que la persona lo haya ocultado
 * («Ocultar por ahora»).
 */
export function mostrarPrimerosPasos(p: Pick<PrimerosPasos, 'pasos' | 'hayMovimientos'> | null, oculto: boolean): boolean {
  if (!p || oculto || p.hayMovimientos) return false;
  return p.pasos.some((x) => !x.hecho);
}

/** Porcentaje entero de avance («3 de 7 · 43 %»). */
export function porcentajePasos(p: Pick<PrimerosPasos, 'pasos' | 'hechos'>): number {
  return p.pasos.length === 0 ? 0 : Math.round((p.hechos / p.pasos.length) * 100);
}

/** Clave de «Ocultar por ahora» (por organización, en este navegador). */
export const claveOcultarPasos = (organizationId: number) => `inicio.primerosPasos.oculto.${organizationId}`;
