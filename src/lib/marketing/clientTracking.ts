/**
 * Utilidades cliente: Disparar eventos de conversión en el navegador
 * 
 * CUMPLIMIENTO LEY 1581:
 * - Solo dispara eventos si hay consentimiento de marketing
 * - Lee la cookie goadmin_consent
 * 
 * Estos eventos se envían desde el navegador y se deduplicarán con
 * los eventos del servidor usando el mismo event_id.
 */

interface ConsentData {
  v: number
  analytics: boolean
  marketing: boolean
  ts: number
}

/**
 * Lee la cookie goadmin_consent
 */
function readConsent(): ConsentData | null {
  if (typeof document === 'undefined') return null

  const cookies = document.cookie.split(';')
  const consentCookie = cookies.find((c) => c.trim().startsWith('goadmin_consent='))

  if (!consentCookie) return null

  try {
    const value = consentCookie.split('=')[1]
    const decoded = decodeURIComponent(value)
    
    // Manejar formato heredado 'all'
    if (decoded === 'all') {
      return { v: 1, analytics: true, marketing: true, ts: Date.now() }
    }

    const parsed = JSON.parse(decoded) as ConsentData
    return parsed
  } catch {
    return null
  }
}

/**
 * Dispara el evento CompleteRegistration en el píxel de Meta
 * 
 * @param userId - ID del usuario para deduplicación (event_id)
 */
export function trackCompleteRegistration(userId: string) {
  const consent = readConsent()
  if (!consent?.marketing) {
    console.log('[trackEvents] Sin consentimiento de marketing - omitiendo CompleteRegistration')
    return
  }

  // Meta Pixel
  if (typeof window !== 'undefined' && (window as any).fbq) {
    ;(window as any).fbq('track', 'CompleteRegistration', {}, { eventID: userId })
    console.log('[trackEvents] CompleteRegistration enviado a Meta Pixel con event_id:', userId)
  }

  // GA4
  if (typeof window !== 'undefined' && (window as any).gtag) {
    ;(window as any).gtag('event', 'sign_up', {
      method: 'email',
    })
    console.log('[trackEvents] sign_up enviado a GA4')
  }
}

/**
 * Dispara el evento StartTrial (píxel de Google Ads)
 * 
 * @param subscriptionId - ID de la suscripción para deduplicación
 * @param value - Valor mensual del plan en USD
 * @param email - Email del usuario para conversiones mejoradas
 * @param phone - Teléfono del usuario para conversiones mejoradas
 */
export function trackStartTrial(
  subscriptionId: string,
  value: number,
  email?: string,
  phone?: string
) {
  const consent = readConsent()
  if (!consent?.marketing) {
    console.log('[trackEvents] Sin consentimiento de marketing - omitiendo StartTrial')
    return
  }

  // Google Ads - Conversión 'prueba_creada' con conversiones mejoradas
  if (typeof window !== 'undefined' && (window as any).gtag) {
    const gadsId = process.env.NEXT_PUBLIC_GADS_ID
    const gadsLabel = process.env.NEXT_PUBLIC_GADS_TRIAL_LABEL

    if (gadsId && gadsLabel && !gadsId.startsWith('your-') && !gadsLabel.startsWith('your-')) {
      // Conversiones mejoradas (email y teléfono)
      const userData: Record<string, string> = {}
      if (email) userData.email = email
      if (phone) userData.phone_number = phone

      ;(window as any).gtag('set', 'user_data', userData)

      // Evento de conversión
      ;(window as any).gtag('event', 'conversion', {
        send_to: `${gadsId}/${gadsLabel}`,
        value: value,
        currency: 'USD',
        transaction_id: subscriptionId,
      })

      console.log('[trackEvents] prueba_creada enviado a Google Ads con transaction_id:', subscriptionId)
    }
  }

  // Meta Pixel (también registra StartTrial)
  if (typeof window !== 'undefined' && (window as any).fbq) {
    ;(window as any).fbq('track', 'StartTrial', {
      value: value,
      currency: 'USD',
      predicted_ltv: value * 12, // Valor anual estimado
    }, { eventID: subscriptionId })
    console.log('[trackEvents] StartTrial enviado a Meta Pixel con event_id:', subscriptionId)
  }
}
