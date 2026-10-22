/**
 * La cuenta de Stripe (live o test) tiene que coincidir con el entorno.
 * Producción con una clave `sk_test_` responde `resource_missing` para
 * cualquier id creado en live, y al revés igual.
 */

export function exigeClaveLive(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEXT_PHASE === 'phase-production-build') return false;
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production';
  return env.NODE_ENV === 'production';
}

export function modoDeClaveStripe(clave: string | undefined): 'live' | 'test' | 'desconocido' | 'ausente' {
  if (!clave) return 'ausente';
  if (clave.startsWith('sk_live_')) return 'live';
  if (clave.startsWith('sk_test_')) return 'test';
  return 'desconocido';
}

/** Lanza si producción no usa una clave live. No incluye la clave en el mensaje. */
export function validarModoClaveStripe(clave: string | undefined, exigeLive: boolean): void {
  const modo = modoDeClaveStripe(clave);
  if (modo === 'ausente') return;
  if (exigeLive && modo !== 'live') {
    throw new Error('STRIPE_SECRET_KEY no es de live y este proceso está en producción.');
  }
  if (!exigeLive && modo === 'live') {
    console.warn('[stripe] STRIPE_SECRET_KEY es de live y este proceso no está en producción.');
  }
}

export function validarModoClaveAlArrancar(env: NodeJS.ProcessEnv = process.env): void {
  validarModoClaveStripe(env.STRIPE_SECRET_KEY, exigeClaveLive(env));
}
