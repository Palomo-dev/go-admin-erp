/**
 * Reglas puras de la barra de pestañas de Recursos humanos (Figma 20:
 * Empleados · Áreas · Cargos · Plazas · Aprobaciones). Sin React: las prueba
 * `__tests__/navHrmLogica.test.ts`.
 */

/** Pestañas del módulo, en orden. La lista visible sale del catálogo filtrado. */
export const PESTANAS_HRM = [
  '/app/hrm/empleados',
  '/app/hrm/areas',
  '/app/hrm/cargos',
  '/app/hrm/plazas',
  '/app/hrm/aprobaciones',
] as const;

export const RUTA_APROBACIONES_HRM = '/app/hrm/aprobaciones';

function empiezaPor(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/** Pestaña activa para la ruta, o `null` si la ruta no es de las pestañas. */
export function pestanaHrmActiva(pathname: string): string | null {
  return PESTANAS_HRM.find((h) => empiezaPor(pathname, h)) ?? null;
}

/**
 * Las páginas de detalle y de formulario no muestran la barra: las migas la
 * reemplazan (decisión 15 del dueño). Tampoco las páginas de otros grupos del
 * módulo (turnos, nómina…), que no son pestañas.
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
