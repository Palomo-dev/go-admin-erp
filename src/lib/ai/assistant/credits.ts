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
