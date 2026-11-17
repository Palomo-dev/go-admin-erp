/**
 * Reglas puras de la barra de pestañas de Recursos humanos. Sin React: las
 * prueba `__tests__/navHrmLogica.test.ts`.
 *
 * Decisión 1 del dueño (fase 2, 2026-11-16):
 * - RR. HH. ve 11 pestañas: Empleados · Áreas · Cargos · Plazas · Turnos ·
 *   Marcación · Asistencia · Novedades · Ausencias · Nómina · Aprobaciones.
 *   «Marcación» (Figma 20.26–20.28, plan de Marcación M0) va entre Turnos y
 *   Asistencia y no es pestaña del jefe: configura métodos y dispositivos de la
 *   sede. «Nómina» va antes de Aprobaciones; los préstamos viven dentro de ella.
 * - El jefe ve 6 y la primera es «Mi equipo»: Mi equipo · Turnos · Asistencia ·
 *   Novedades · Ausencias · Aprobaciones.
 * Quién es quién lo decide el servidor (`GET /api/hrm/pestanas`).
 */

export const RUTA_MI_EQUIPO = '/app/hrm/mi-equipo';
export const RUTA_APROBACIONES_HRM = '/app/hrm/aprobaciones';
export const RUTA_EMPLEADOS_HRM = '/app/hrm/empleados';
export const RUTA_NOVEDADES_HRM = '/app/hrm/novedades';

/** Pestañas de RR. HH., en orden. La lista visible sale del catálogo filtrado. */
export const PESTANAS_HRM = [
  '/app/hrm/empleados',
  '/app/hrm/areas',
  '/app/hrm/cargos',
  '/app/hrm/plazas',
  '/app/hrm/turnos',
  '/app/hrm/marcacion',
  '/app/hrm/asistencia',
  '/app/hrm/novedades',
  '/app/hrm/ausencias',
  '/app/hrm/nomina',
  '/app/hrm/aprobaciones',
] as const;

/** Pestañas de la vista del jefe, en orden. */
export const PESTANAS_JEFE = [
  '/app/hrm/mi-equipo',
  '/app/hrm/turnos',
  '/app/hrm/asistencia',
  '/app/hrm/novedades',
  '/app/hrm/ausencias',
  '/app/hrm/aprobaciones',
] as const;

/** Todas las rutas que son pestaña en alguna de las dos vistas. */
export const TODAS_PESTANAS_HRM: readonly string[] = Array.from(new Set<string>([...PESTANAS_HRM, ...PESTANAS_JEFE]));

export type VistaPestanas = 'rrhh' | 'jefe' | 'ninguna';

export function pestanasDeVista(vista: VistaPestanas | null): readonly string[] {
  return vista === 'jefe' ? PESTANAS_JEFE : PESTANAS_HRM;
}

function empiezaPor(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/** Pestaña activa para la ruta, o `null` si la ruta no es de las pestañas. */
export function pestanaHrmActiva(pathname: string): string | null {
  return TODAS_PESTANAS_HRM.find((h) => empiezaPor(pathname, h)) ?? null;
}

/**
 * Las páginas de detalle y de formulario no muestran la barra: las migas la
 * reemplazan (decisión 15 del dueño). Tampoco las páginas de otros grupos del
 * módulo (nómina, préstamos…), que no son pestañas.
 */
export function muestraPestanasHrm(pathname: string): boolean {
  const activa = pestanaHrmActiva(pathname);
  if (!activa) return false;
  const resto = pathname.slice(activa.length).replace(/^\/+|\/+$/g, '');
  return resto === '';
}

/** Aprobaciones solo aparece con algo por aprobar, o si ya se está en ella. */
export function mostrarPestanaAprobaciones(pendientes: number | null, pathname: string): boolean {
  return (pendientes ?? 0) > 0 || empiezaPor(pathname, RUTA_APROBACIONES_HRM);
}

export interface ContadoresPestanas {
  empleados?: number | null;
  equipo?: number | null;
  novedades?: number | null;
}

/** Número junto a la pestaña (Figma 20.8: «Empleados 46», «Novedades 12», «Mi equipo 9»). */
export function contadorDePestana(href: string, c: ContadoresPestanas | null, aprobaciones: number | null): number | null {
  const n =
    href === RUTA_APROBACIONES_HRM
      ? aprobaciones
      : href === RUTA_EMPLEADOS_HRM
        ? (c?.empleados ?? null)
        : href === RUTA_NOVEDADES_HRM
          ? (c?.novedades ?? null)
          : href === RUTA_MI_EQUIPO
            ? (c?.equipo ?? null)
            : null;
  return n && n > 0 ? n : null;
}
