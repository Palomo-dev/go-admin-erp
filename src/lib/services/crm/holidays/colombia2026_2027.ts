/**
 * Festivos de Colombia (Ley 51 de 1983 y Ley 2578 de 2026)
 * 
 * Fuente: reglas_horario_llamadas_v1.md, sección 4
 * Versión: v1 (2026-2027)
 * Última actualización: 27-sep-2026
 * 
 * IMPORTANTE: Este módulo debe actualizarse cada año en noviembre agregando
 * el año siguiente. Si la Corte Constitucional anula la Ley 2578 o el Congreso
 * crea otro festivo, actualizar inmediatamente.
 */

/**
 * Festivos de Colombia para 2026-2027 en formato YYYY-MM-DD
 * (19 festivos al año, incluyendo el 9 de julio por Ley 2578 de 2026)
 */
export const COLOMBIA_HOLIDAYS_2026_2027: readonly string[] = Object.freeze([
  // 2026
  '2026-10-12', // lunes - Día de la Raza (12-oct)
  '2026-11-02', // lunes - Todos los Santos (1-nov, trasladado)
  '2026-11-16', // lunes - Independencia de Cartagena (11-nov, trasladado)
  '2026-12-08', // martes - Inmaculada Concepción
  '2026-12-25', // viernes - Navidad
  // 2027
  '2027-01-01', // viernes - Año Nuevo
  '2027-01-11', // lunes - Reyes Magos (6-ene, trasladado)
  '2027-03-22', // lunes - San José (19-mar, trasladado)
  '2027-03-25', // jueves - Jueves Santo
  '2027-03-26', // viernes - Viernes Santo
  '2027-05-01', // sábado - Día del Trabajo
  '2027-05-10', // lunes - Ascensión del Señor (trasladado)
  '2027-05-31', // lunes - Corpus Christi (trasladado)
  '2027-06-07', // lunes - Sagrado Corazón (trasladado)
  '2027-07-05', // lunes - San Pedro y San Pablo (29-jun, trasladado)
  '2027-07-12', // lunes - Virgen del Rosario de Chiquinquirá (9-jul, trasladado; Ley 2578 de 2026)
  '2027-07-20', // martes - Día de la Independencia
  '2027-08-07', // sábado - Batalla de Boyacá
  '2027-08-16', // lunes - Asunción de la Virgen (15-ago, trasladado)
  '2027-10-18', // lunes - Día de la Raza (12-oct, trasladado)
  '2027-11-01', // lunes - Todos los Santos
  '2027-11-15', // lunes - Independencia de Cartagena (11-nov, trasladado)
  '2027-12-08', // miércoles - Inmaculada Concepción
  '2027-12-25', // sábado - Navidad
]);

/**
 * Verifica si una fecha (en formato YYYY-MM-DD) es festivo en Colombia
 */
export function isColombianHoliday(dateString: string): boolean {
  return COLOMBIA_HOLIDAYS_2026_2027.includes(dateString);
}

/**
 * Obtiene la lista de festivos para un año específico
 */
export function getHolidaysForYear(year: number): string[] {
  return COLOMBIA_HOLIDAYS_2026_2027.filter(date => date.startsWith(String(year)));
}

/**
 * Formatea una fecha Date a YYYY-MM-DD en la zona horaria especificada
 */
export function toDateStringInTz(date: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/**
 * Verifica si una fecha Date es festivo en Colombia (evaluado en la zona horaria dada)
 */
export function isHolidayInTz(date: Date, timezone: string): boolean {
  const dateString = toDateStringInTz(date, timezone);
  return isColombianHoliday(dateString);
}
