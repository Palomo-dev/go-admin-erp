import { loadStripe } from '@stripe/stripe-js'

// Cargamos Stripe solo una vez para evitar errores
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')

export default stripePromise