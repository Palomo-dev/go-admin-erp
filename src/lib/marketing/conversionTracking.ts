/**
 * Módulo de servidor: API de conversiones de Meta y GA4 Measurement Protocol
 * 
 * CUMPLIMIENTO LEY 1581: Solo envía datos si la persona dio consentimiento
 * de marketing en el registro (marketing_consent en signup_attribution).
 * 
 * DEPENDENCIAS:
 * - Tabla signup_attribution (creada en paralelo por otro agente):
 *   Debe contener: marketing_consent, fbp, fbc, ga_client_id, user_id, organization_id
 * 
 * VARIABLES DE ENTORNO REQUERIDAS:
 * - META_CAPI_TOKEN: Token de acceso de la API de conversiones de Meta
 * - NEXT_PUBLIC_META_PIXEL_ID: ID del píxel de Meta (también usado en cliente)
 * - NEXT_PUBLIC_GA4_ID: ID de medición de GA4
 * - GA4_API_SECRET: Secreto de la API de Measurement Protocol de GA4
 * 
 * Sin estas variables, las funciones retornan sin hacer nada (fail-safe).
 */

import crypto from 'crypto'

// ─────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────

export type ConversionEventType = 'CompleteRegistration' | 'StartTrial' | 'Purchase'

export interface UserData {
  email?: string
  phone?: string
  firstName?: string
  lastName?: string
  city?: string
  country?: string
  externalId?: string // user_id
  clientIpAddress?: string
  clientUserAgent?: string
  fbp?: string // Cookie _fbp
  fbc?: string // Cookie _fbc (construida con fbclid)
  gaClientId?: string // Cliente GA4
}

export interface ConversionEventData {
  eventName: ConversionEventType
  eventId: string // Para deduplicación: user.id, subscription.id, invoice.id
  eventTime?: number // Unix timestamp en segundos (default: now)
  eventSourceUrl?: string
  userData: UserData
  customData?: {
    value?: number // Monto en USD
    currency?: string
    contentName?: string
    contentCategory?: string
    contents?: Array<{ id: string; quantity: number }>
    predictedLtv?: number
  }
  actionSource?: 'website' | 'system_generated' // website para píxel+CAPI, system_generated para servidor solo
}

interface SignupAttribution {
  marketing_consent: boolean
  fbp?: string | null
  fbc?: string | null
  ga_client_id?: string | null
  user_id: string
  organization_id: number
  consent_ts?: string | null
}

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────

/**
 * Hash SHA-256 de un valor (correo en minúsculas, teléfono E.164 sin '+')
 */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

/**
 * Normaliza el teléfono a formato E.164 sin '+'
 */
function normalizePhone(phone: string): string | undefined {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) return undefined
  return cleaned.startsWith('57') ? cleaned : `57${cleaned}`
}

/**
 * Lee la atribución de registro de la base de datos
 * 
 * IMPORTANTE: Esta función asume que la tabla signup_attribution existe.
 * Si otro agente aún no la ha creado, esta función retornará null.
 */
async function getSignupAttribution(
  userId: string,
  supabase: { from: (table: string) => any }
): Promise<SignupAttribution | null> {
  try {
    const { data, error } = await supabase
      .from('signup_attribution')
      .select('marketing_consent, fbp, fbc, ga_client_id, user_id, organization_id, consent_ts')
      .eq('user_id', userId)
      .single()

    if (error) {
      if (error.code === '42P01') {
        // Tabla no existe todavía
        console.warn('[conversionTracking] signup_attribution no existe aún - esperando creación por otro agente')
        return null
      }
      console.error('[conversionTracking] Error leyendo signup_attribution:', error)
      return null
    }

    return data as SignupAttribution
  } catch (err) {
    console.error('[conversionTracking] Error en getSignupAttribution:', err)
    return null
  }
}

/**
 * Valida que las variables de entorno necesarias estén configuradas
 */
function validateMetaConfig(): boolean {
  const token = process.env.META_CAPI_TOKEN
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID

  if (!token || token.startsWith('your-') || token.length < 16) {
    console.warn('[conversionTracking] META_CAPI_TOKEN no configurado')
    return false
  }

  if (!pixelId || pixelId.startsWith('your-')) {
    console.warn('[conversionTracking] NEXT_PUBLIC_META_PIXEL_ID no configurado')
    return false
  }

  return true
}

function validateGA4Config(): boolean {
  const measurementId = process.env.NEXT_PUBLIC_GA4_ID
  const apiSecret = process.env.GA4_API_SECRET

  if (!measurementId || measurementId.startsWith('your-')) {
    console.warn('[conversionTracking] NEXT_PUBLIC_GA4_ID no configurado')
    return false
  }

  if (!apiSecret || apiSecret.startsWith('your-') || apiSecret.length < 16) {
    console.warn('[conversionTracking] GA4_API_SECRET no configurado')
    return false
  }

  return true
}

// ─────────────────────────────────────────────────────────────
// Meta Conversions API
// ─────────────────────────────────────────────────────────────

/**
 * Envía un evento de conversión a la API de conversiones de Meta
 * 
 * LEY 1581: Solo envía si marketing_consent = true en signup_attribution
 * 
 * @param eventData - Datos del evento
 * @param supabase - Cliente de Supabase (para leer consentimiento)
 * @returns true si se envió exitosamente, false si no
 */
export async function sendMetaConversionEvent(
  eventData: ConversionEventData,
  supabase: { from: (table: string) => any }
): Promise<boolean> {
  try {
    // 1. Validar configuración
    if (!validateMetaConfig()) {
      console.log('[conversionTracking] Meta CAPI no configurado - omitiendo envío')
      return false
    }

    // 2. Verificar consentimiento
    const userId = eventData.userData.externalId
    if (!userId) {
      console.warn('[conversionTracking] No se puede enviar evento Meta sin external_id (user_id)')
      return false
    }

    const attribution = await getSignupAttribution(userId, supabase)
    if (!attribution) {
      console.warn('[conversionTracking] No se encontró atribución para user:', userId)
      return false
    }

    if (!attribution.marketing_consent) {
      console.log('[conversionTracking] Usuario sin consentimiento de marketing - omitiendo Meta CAPI')
      return false
    }

    // 3. Construir payload con datos de atribución guardados
    const eventTime = eventData.eventTime || Math.floor(Date.now() / 1000)
    
    const userData: Record<string, any> = {}

    // Email y teléfono hasheados
    if (eventData.userData.email) {
      userData.em = sha256(eventData.userData.email)
    }
    if (eventData.userData.phone) {
      const normalizedPhone = normalizePhone(eventData.userData.phone)
      if (normalizedPhone) {
        userData.ph = sha256(normalizedPhone)
      }
    }

    // Nombre hasheado
    if (eventData.userData.firstName) {
      userData.fn = sha256(eventData.userData.firstName)
    }
    if (eventData.userData.lastName) {
      userData.ln = sha256(eventData.userData.lastName)
    }

    // Ciudad y país hasheados
    if (eventData.userData.city) {
      userData.ct = sha256(eventData.userData.city.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    }
    if (eventData.userData.country) {
      userData.country = sha256(eventData.userData.country.toLowerCase())
    }

    // External ID hasheado
    userData.external_id = sha256(userId)

    // Usar fbp y fbc de la atribución guardada
    if (attribution.fbp) {
      userData.fbp = attribution.fbp
    }
    if (attribution.fbc) {
      userData.fbc = attribution.fbc
    }

    // IP y User Agent (sin hashear según la spec de Meta)
    if (eventData.userData.clientIpAddress) {
      userData.client_ip_address = eventData.userData.clientIpAddress
    }
    if (eventData.userData.clientUserAgent) {
      userData.client_user_agent = eventData.userData.clientUserAgent
    }

    const payload = {
      data: [
        {
          event_name: eventData.eventName,
          event_time: eventTime,
          event_id: eventData.eventId,
          event_source_url: eventData.eventSourceUrl || 'https://app.goadmin.io',
          action_source: eventData.actionSource || 'website',
          user_data: userData,
          custom_data: eventData.customData || {},
        },
      ],
    }

    // 4. Enviar a Meta CAPI
    const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID!
    const accessToken = process.env.META_CAPI_TOKEN!
    const url = `https://graph.facebook.com/v21.0/${pixelId}/events?access_token=${accessToken}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('[conversionTracking] Error enviando a Meta CAPI:', result)
      return false
    }

    console.log('[conversionTracking] Evento Meta CAPI enviado:', {
      eventName: eventData.eventName,
      eventId: eventData.eventId,
      eventsReceived: result.events_received,
    })

    return true
  } catch (err) {
    console.error('[conversionTracking] Error en sendMetaConversionEvent:', err)
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// GA4 Measurement Protocol
// ─────────────────────────────────────────────────────────────

/**
 * Mapea eventos de GoAdmin a eventos de GA4
 */
const GA4_EVENT_MAP: Record<ConversionEventType, string> = {
  CompleteRegistration: 'sign_up',
  StartTrial: 'begin_checkout', // O 'start_trial' si prefieres un evento personalizado
  Purchase: 'purchase',
}

/**
 * Envía un evento a GA4 Measurement Protocol
 * 
 * LEY 1581: Solo envía si marketing_consent = true en signup_attribution
 * 
 * @param eventData - Datos del evento
 * @param supabase - Cliente de Supabase (para leer consentimiento)
 * @returns true si se envió exitosamente, false si no
 */
export async function sendGA4Event(
  eventData: ConversionEventData,
  supabase: { from: (table: string) => any }
): Promise<boolean> {
  try {
    // 1. Validar configuración
    if (!validateGA4Config()) {
      console.log('[conversionTracking] GA4 MP no configurado - omitiendo envío')
      return false
    }

    // 2. Verificar consentimiento
    const userId = eventData.userData.externalId
    if (!userId) {
      console.warn('[conversionTracking] No se puede enviar evento GA4 sin external_id (user_id)')
      return false
    }

    const attribution = await getSignupAttribution(userId, supabase)
    if (!attribution) {
      console.warn('[conversionTracking] No se encontró atribución para user:', userId)
      return false
    }

    if (!attribution.marketing_consent) {
      console.log('[conversionTracking] Usuario sin consentimiento de marketing - omitiendo GA4 MP')
      return false
    }

    // 3. Usar ga_client_id de la atribución guardada
    const clientId = attribution.ga_client_id
    if (!clientId) {
      console.warn('[conversionTracking] No se encontró ga_client_id en signup_attribution')
      return false
    }

    // 4. Construir payload
    const measurementId = process.env.NEXT_PUBLIC_GA4_ID!
    const apiSecret = process.env.GA4_API_SECRET!
    const eventName = GA4_EVENT_MAP[eventData.eventName] || eventData.eventName

    const params: Record<string, any> = {
      session_id: eventData.eventId,
    }

    // Agregar valor y moneda si están disponibles
    if (eventData.customData?.value !== undefined) {
      params.value = eventData.customData.value
    }
    if (eventData.customData?.currency) {
      params.currency = eventData.customData.currency
    }

    // Para Purchase, agregar transaction_id
    if (eventData.eventName === 'Purchase') {
      params.transaction_id = eventData.eventId
    }

    const payload = {
      client_id: clientId,
      user_id: userId,
      events: [
        {
          name: eventName,
          params,
        },
      ],
    }

    // 5. Enviar a GA4 Measurement Protocol
    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[conversionTracking] Error enviando a GA4 MP:', text)
      return false
    }

    console.log('[conversionTracking] Evento GA4 MP enviado:', {
      eventName: eventName,
      eventId: eventData.eventId,
    })

    return true
  } catch (err) {
    console.error('[conversionTracking] Error en sendGA4Event:', err)
    return false
  }
}

/**
 * Envía un evento de conversión a ambas plataformas (Meta y GA4)
 * 
 * LEY 1581: Solo envía si marketing_consent = true en signup_attribution
 * 
 * Esta función nunca lanza excepciones - todos los errores se capturan y registran.
 * 
 * @param eventData - Datos del evento
 * @param supabase - Cliente de Supabase (para leer consentimiento)
 * @returns Objeto con el estado de cada envío
 */
export async function sendConversionEvent(
  eventData: ConversionEventData,
  supabase: { from: (table: string) => any }
): Promise<{ meta: boolean; ga4: boolean }> {
  try {
    // Enviar en paralelo
    const [metaResult, ga4Result] = await Promise.allSettled([
      sendMetaConversionEvent(eventData, supabase),
      sendGA4Event(eventData, supabase),
    ])

    return {
      meta: metaResult.status === 'fulfilled' ? metaResult.value : false,
      ga4: ga4Result.status === 'fulfilled' ? ga4Result.value : false,
    }
  } catch (err) {
    console.error('[conversionTracking] Error en sendConversionEvent:', err)
    return { meta: false, ga4: false }
  }
}
