/**
 * Cliente de Stripe del lado del servidor
 * GO Admin ERP - Stripe Server Client
 * 
 * Este archivo maneja todas las operaciones de Stripe que requieren
 * la clave secreta y deben ejecutarse solo en el servidor.
 */

import Stripe from 'stripe'

// Verificar que la clave secreta esté configurada
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    '❌ STRIPE_SECRET_KEY no está configurada. ' +
    'Por favor, agrega STRIPE_SECRET_KEY a tus variables de entorno.'
  )
}

/**
 * Cliente de Stripe singleton
 * Configurado con la versión de API más reciente
 */
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover', // Última versión estable
  typescript: true,
  appInfo: {
    name: 'GO Admin ERP',
    version: '1.0.0',
    url: 'https://app.goadmin.io',
  },
})

/**
 * Validar firma del webhook de Stripe
 * 
 * @param payload - Body raw de la petición
 * @param signature - Header stripe-signature
 * @returns Evento de Stripe verificado
 */
export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET no está configurado')
  }

  try {
    return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (error) {
    console.error('❌ Error verificando webhook de Stripe:', error)
    throw new Error(`Webhook signature verification failed: ${error}`)
  }
}

/**
 * Convertir monto a centavos según la moneda
 * 
 * @param amount - Monto en unidades de la moneda
 * @param currency - Código de moneda (usd, cop, mxn, etc.)
 * @returns Monto en la unidad más pequeña de la moneda
 */
export function convertToCents(amount: number, currency: string): number {
  // Monedas sin decimales (zero-decimal currencies)
  const zeroDecimalCurrencies = [
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw',
    'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf',
    'xof', 'xpf',
  ]

  const currencyLower = currency.toLowerCase()

  if (zeroDecimalCurrencies.includes(currencyLower)) {
    // Para monedas sin decimales, no multiplicar
    return Math.round(amount)
  }

  // Para la mayoría de monedas, multiplicar por 100
  return Math.round(amount * 100)
}

/**
 * Convertir de centavos a unidades de moneda
 * 
 * @param cents - Monto en centavos
 * @param currency - Código de moneda
 * @returns Monto en unidades de la moneda
 */
export function convertFromCents(cents: number, currency: string): number {
  const zeroDecimalCurrencies = [
    'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw',
    'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf',
    'xof', 'xpf',
  ]

  const currencyLower = currency.toLowerCase()

  if (zeroDecimalCurrencies.includes(currencyLower)) {
    return cents
  }

  return cents / 100
}

/**
 * Obtener información legible de un error de Stripe
 * 
 * @param error - Error de Stripe
 * @returns Mensaje de error legible
 */
export function getStripeErrorMessage(error: any): string {
  if (error instanceof Stripe.errors.StripeError) {
    switch (error.type) {
      case 'StripeCardError':
        return error.message || 'La tarjeta fue rechazada'
      case 'StripeRateLimitError':
        return 'Demasiadas peticiones. Por favor, intenta de nuevo en un momento.'
      case 'StripeInvalidRequestError':
        return 'Petición inválida. Verifica los datos enviados.'
      case 'StripeAPIError':
        return 'Error de comunicación con Stripe. Intenta de nuevo.'
      case 'StripeConnectionError':
        return 'Error de conexión. Verifica tu conexión a internet.'
      case 'StripeAuthenticationError':
        return 'Error de autenticación con Stripe.'
      default:
        return error.message || 'Error procesando el pago'
    }
  }

  return 'Error desconocido procesando el pago'
}

/**
 * Validar que el monto sea válido para Stripe
 * 
 * @param amount - Monto a validar
 * @param currency - Código de moneda
 * @returns true si es válido, false si no
 */
export function isValidAmount(amount: number, currency: string): boolean {
  if (amount <= 0) return false

  // Stripe tiene un mínimo de 50 centavos para USD
  const minimums: Record<string, number> = {
    usd: 50,
    eur: 50,
    gbp: 30,
    cad: 50,
    mxn: 10,
    cop: 1500,
  }

  const currencyLower = currency.toLowerCase()
  const amountInCents = convertToCents(amount, currency)
  const minimum = minimums[currencyLower] || 50

  return amountInCents >= minimum
}

/**
 * Formatear monto para mostrar
 * 
 * @param amount - Monto en centavos
 * @param currency - Código de moneda
 * @returns String formateado
 */
export function formatStripeAmount(amount: number, currency: string): string {
  const amountInUnits = convertFromCents(amount, currency)

  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountInUnits)
}

export default stripe
