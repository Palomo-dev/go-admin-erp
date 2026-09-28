// ============================================================
// Catálogo de zonas horarias que se ofrecen en los selectores.
//
// Vivía en `src/components/calendario/configuracion/types.ts`, es decir
// dentro de un módulo que no todas las organizaciones tienen contratado. La
// ficha de sucursal y la pantalla General —ambas de núcleo— acababan
// importando de la carpeta del calendario para pintar su selector.
//
// Está aquí para que haya UNA lista y no dependa de un módulo. `types.ts` la
// reexporta, así que los llamadores antiguos siguen funcionando.
//
// No pretende ser la lista completa de zonas IANA: son las que se eligen con
// un clic. Una zona fuera de esta lista se puede guardar igual (la valida
// `isSupportedTimeZone` contra el catálogo de ICU y, en la base, el trigger
// contra `pg_timezone_names`), y los selectores la añaden como opción extra
// cuando ya está guardada.
// ============================================================

export interface TimezoneCatalogOption {
  value: string;
  label: string;
}

export const TIMEZONE_OPTIONS: TimezoneCatalogOption[] = [
  { value: 'America/Bogota', label: 'Bogotá (GMT-5)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (GMT-6)' },
  { value: 'America/Lima', label: 'Lima (GMT-5)' },
  { value: 'America/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Santiago', label: 'Santiago (GMT-4)' },
  { value: 'America/New_York', label: 'Nueva York (GMT-5)' },
  { value: 'Europe/Madrid', label: 'Madrid (GMT+1)' },
];
