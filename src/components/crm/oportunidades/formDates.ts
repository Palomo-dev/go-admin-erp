/**
 * Puente entre un día calendario (`YYYY-MM-DD`, columna `date`) y el `Date`
 * que exige el componente `Calendar` de shadcn/ui.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * `opportunities.expected_close_date` es una columna **`date`** (verificado por
 * MCP el 2026-09-23). Un día calendario no es un instante: no se convierte de
 * zona horaria (regla 5 de `docs/reglas-fechas-timezone.md`).
 *
 * El formulario hacía `new Date('2026-09-23')`, que en JavaScript es medianoche
 * **UTC**; en Bogotá eso es el 22 a las 19:00, así que `format(d,'yyyy-MM-dd')`
 * devolvía `2026-09-22` y cada guardado corría la fecha un día hacia atrás.
 *
 * ── Por qué NO se usa `toPlainDate(date, timezone)` aquí ────────────────────
 * `toPlainDate` traduce un **instante** al día que le corresponde en la zona de
 * la organización, y es lo correcto para un `timestamptz`. El `Date` que
 * devuelve un selector de calendario no es un instante: es una marca de reloj
 * de pared del día que el usuario pinchó. Traducirlo de zona lo movería cuando
 * el navegador y la organización estén en zonas distintas (navegador en UTC,
 * organización en Bogotá: medianoche local → 22 de septiembre). Por eso el
 * puente usa los campos locales del `Date` en los dos sentidos: el ida y vuelta
 * es exacto con cualquier `TZ` del entorno.
 *
 * Para `next_contact_at`, que sí es `timestamptz`, el formulario usa
 * `toInstant()` / `formatDate()` del hook `useFormatDate()`. No mezclar.
 *
 * Módulo puro: sin React ni Supabase, para poder probarlo con `TZ=UTC` y
 * `TZ=America/Bogota`.
 */

const DIA_CALENDARIO = /^(\d{4})-(\d{2})-(\d{2})/;

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * `YYYY-MM-DD` → `Date` a medianoche **local**, listo para `<Calendar>` y para
 * `format()` de date-fns (que lee los campos locales). Devuelve `undefined` si
 * el valor no es un día calendario válido.
 *
 * Acepta también un `YYYY-MM-DD...` más largo porque PostgREST devuelve la
 * columna `date` como `YYYY-MM-DD`, pero alguna vista antigua la entrega con
 * hora pegada; en ese caso solo cuenta el día, nunca la hora.
 */
export function diaCalendarioADate(valor: string | null | undefined): Date | undefined {
  if (!valor) return undefined;
  const m = DIA_CALENDARIO.exec(valor);
  if (!m) return undefined;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return undefined;
  const d = new Date(anio, mes - 1, dia);
  // Rechaza fechas imposibles ya normalizadas por el constructor (31/02).
  if (d.getFullYear() !== anio || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    return undefined;
  }
  return d;
}

/**
 * `Date` de un selector de calendario → `YYYY-MM-DD` con sus campos **locales**.
 * Nunca `toISOString()`: eso daría el día UTC, que es el bug original.
 */
export function dateADiaCalendario(fecha: Date | null | undefined): string {
  if (!fecha || Number.isNaN(fecha.getTime())) return '';
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}
