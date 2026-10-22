/**
 * Cuándo renovar el access token mientras la pestaña sigue abierta.
 *
 * El middleware no refresca: lee el access token de la cookie y, si `exp`
 * ya pasó, manda al login. Con la renovación automática apagada, una pestaña
 * quieta dejaba vencer ese token (en un JWT de 10 minutos, a los 10 minutos).
 * Se renueva antes del vencimiento y el storage reescribe la cookie.
 */

const MARGEN_MAX_MS = 90_000;
const MARGEN_MIN_MS = 20_000;

/**
 * Milisegundos de espera hasta la próxima renovación.
 * `expiraEn` y `ahora` son epoch en milisegundos.
 * Cero si el token ya venció o está dentro del margen.
 */
export function esperaRenovacionMs(expiraEn: number, ahora: number): number {
  const vida = expiraEn - ahora;
  if (!Number.isFinite(vida) || vida <= 0) return 0;
  const cuarto = Math.floor(vida * 0.25);
  const margen = Math.min(MARGEN_MAX_MS, Math.max(MARGEN_MIN_MS, cuarto));
  return Math.max(0, vida - margen);
}
