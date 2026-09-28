// ============================================================
// Día calendario del negocio → instante, para columnas `timestamptz`.
//
// Fase B, tanda 2. `payments.payment_date`, `accounts_receivable.due_date`,
// `accounts_payable.due_date`, `invoice_sales/purchase.issue_date` y `.due_date`
// son **timestamptz** (verificado en `information_schema.columns`), aunque el
// formulario que las alimenta sea un `<input type="date">`.
//
// Lo que hacía el código antes, en cinco sitios distintos:
//
//     new Date(dia + 'T' + new Date().toTimeString().split(' ')[0]).toISOString()
//
// Eso construye el instante con la hora de pared del NAVEGADOR y lo interpreta
// en la zona del navegador. Acierta solo si el navegador está en la misma zona
// que la organización. Desde Madrid, un abono fechado hoy en una tienda de
// Bogotá se guardaba siete horas antes de lo debido, y en la franja de la noche
// eso es un día entero: un abono del 23 contado en el cierre del 22.
//
// Aquí se hace explícito: el día lo pone el usuario, la hora es la hora de
// pared de la ORGANIZACIÓN (o de la sucursal dueña del dato), y el resultado
// lleva el offset real de esa zona en ese instante, DST incluido.
// ============================================================

import { plainDateToInstant, toPlainDate } from '@/lib/utils/dateCore';
import { formatTimeInTz } from '@/lib/utils/dateDisplay';

/** Hora de pared "HH:mm:ss" de `ahora` en una zona. Medianoche siempre "00". */
function horaDePared(timezone: string, ahora: Date): string {
  const hora = formatTimeInTz(ahora, timezone, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  // Algunos runtimes escriben la medianoche como "24:00:00" con hour12:false.
  return hora.startsWith('24') ? `00${hora.slice(2)}` : hora;
}

/**
 * Día calendario elegido por el usuario + hora actual de pared de la
 * organización → instante ISO con offset, listo para un `timestamptz`.
 *
 * @param plainDate Día `YYYY-MM-DD` tal como lo eligió el usuario.
 * @param timezone Zona de la organización o de la sucursal dueña del dato.
 * @param ahora Instante de referencia; solo se cambia en tests.
 */
export function instantForDayInTz(
  plainDate: string,
  timezone: string,
  ahora: Date = new Date(),
): string {
  return plainDateToInstant(plainDate, timezone, horaDePared(timezone, ahora));
}

/**
 * Día calendario de un valor `timestamptz` en la zona dada.
 *
 * Es el reemplazo de `new Date(valorDeBD).toISOString().split('T')[0]`, que
 * descarta el offset y se queda con el día UTC (regla 2 de
 * `docs/reglas-fechas-timezone.md`). Se usa para los `min`/`max` de un
 * `<input type="date">` y para comparar días.
 *
 * Devuelve `''` si el valor es nulo o ilegible, para que el llamador pueda
 * pasarlo tal cual a un `min`/`max` sin romper el formulario.
 */
export function plainDayOfInstant(
  value: string | Date | null | undefined,
  timezone: string,
): string {
  if (!value) return '';
  const fecha = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(fecha.getTime())) return '';
  return toPlainDate(fecha, timezone);
}
