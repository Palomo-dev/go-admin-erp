/**
 * GO Assistant — umbrales del saldo de créditos.
 *
 * Vive aquí y no en `app/api/ai-assistant/credits/route.ts` porque un
 * `route.ts` del App Router **solo** puede exportar sus handlers y
 * `runtime`/`dynamic`/`config`: cualquier otro export rompe la comprobación de
 * tipos de `.next/types` y tumba el despliegue (Vercel ya no ignora errores de
 * tipos). Lo comparten el endpoint y el composer.
 */

/** Por debajo de esto se avisa en ámbar. */
export const LOW_CREDITS = 50;

export type CreditLevel = 'ok' | 'low' | 'empty';

export function creditLevel(credits: number): CreditLevel {
  if (credits <= 0) return 'empty';
  return credits < LOW_CREDITS ? 'low' : 'ok';
}

/** Por debajo de tantos cobros, el promedio no dice nada: mejor no estimar. */
export const MIN_COBROS_PARA_PROMEDIO = 3;
/** Cuántos cobros recientes entran en el promedio. */
export const COBROS_PARA_PROMEDIO = 50;

/**
 * Créditos que cuesta de verdad una respuesta del asistente EN ESTA
 * organización, a partir de sus últimos cobros `assistant_chat`. Alimenta el
 * «alcanzan para unas N respuestas» del aviso de créditos bajos (Figma
 * `668:38793`), que en el diseño era un número fijo. `null` si no hay
 * suficientes cobros para que el promedio signifique algo.
 */
export function promedioPorRespuesta(cobros: ReadonlyArray<{ credits_consumed: number | null }>): number | null {
  const validos = cobros
    .map((c) => Number(c.credits_consumed))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (validos.length < MIN_COBROS_PARA_PROMEDIO) return null;
  const media = validos.reduce((a, b) => a + b, 0) / validos.length;
  return Math.round(media * 10) / 10;
}
