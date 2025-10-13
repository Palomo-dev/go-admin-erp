/**
 * Configuración del cliente de Stripe para el frontend
 * GO Admin ERP - Stripe Client Configuration
 * 
 * Este archivo configura el cliente de Stripe que se usa en el navegador.
 * La clave publicable es segura para usar en el cliente.
 */

import { loadStripe, Stripe } from '@stripe/stripe-js'

// Verificar que la clave publicable esté configurada
if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
  console.warn(
    '⚠️ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY no está configurada. ' +
    'Los pagos con Stripe no funcionarán.'
  )
}

/**
 * Promise que carga el cliente de Stripe
 * Se carga solo una vez y se reutiliza en toda la aplicación
 */
let stripePromise: Promise<Stripe | null> | null = null

/**
 * Obtener instancia del cliente de Stripe
 * Singleton pattern para evitar múltiples cargas
 * 
 * @returns Promise con la instancia de Stripe
 */
export const getStripe = (): Promise<Stripe | null> => {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

    if (!key) {
      return Promise.resolve(null)
    }

    stripePromise = loadStripe(key, {
      locale: 'es', // Interfaz en español
    })
  }

  return stripePromise
}

/**
 * Exportación por defecto para compatibilidad
 */
export default getStripe

/**
 * Configuración de opciones de apariencia de Stripe Elements
 * Personaliza la apariencia para que coincida con el tema de la app
 */
export const stripeAppearance = {
  theme: 'stripe' as const,
  variables: {
    colorPrimary: '#0F172A', // slate-900
    colorBackground: '#ffffff',
    colorText: '#1e293b', // slate-800
    colorDanger: '#dc2626', // red-600
    fontFamily: 'system-ui, -apple-system, sans-serif',
    spacingUnit: '4px',
    borderRadius: '8px',
  },
}

/**
 * Configuración de apariencia para tema oscuro
 */
export const stripeAppearanceDark = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#60a5fa', // blue-400
    colorBackground: '#1e293b', // slate-800
    colorText: '#f1f5f9', // slate-100
    colorDanger: '#f87171', // red-400
    fontFamily: 'system-ui, -apple-system, sans-serif',
    spacingUnit: '4px',
    borderRadius: '8px',
  },
}

/**
 * Verificar si Stripe está configurado
 * 
 * @returns true si las credenciales están configuradas
 */
export function isStripeConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
}
