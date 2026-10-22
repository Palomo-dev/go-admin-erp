/**
 * Instrumentation hook de Next.js.
 *
 * Sentry server-side se maneja via @sentry/react en el cliente.
 * El server no inicializa Sentry para evitar OOM en el build de Vercel.
 *
 * Al arrancar se registra si la clave de Stripe no es live en producción.
 * No tumba el proceso: el rechazo queda en requireStripe(). El build
 * (`NEXT_PHASE`) no cuenta: ahí no hay tráfico.
 */
import { registrarModoClaveAlArrancar } from '@/lib/stripe/modoClave'

export async function register() {
  registrarModoClaveAlArrancar()
}
