/**
 * Instrumentation hook de Next.js.
 *
 * Sentry server-side se maneja via @sentry/react en el cliente.
 * El server no inicializa Sentry para evitar OOM en el build de Vercel.
 *
 * Al arrancar, la clave de Stripe tiene que ser live si el proceso es
 * producción. El build (`NEXT_PHASE`) no cuenta: ahí no hay tráfico.
 */
import { validarModoClaveAlArrancar } from '@/lib/stripe/modoClave'

export async function register() {
  validarModoClaveAlArrancar()
}
