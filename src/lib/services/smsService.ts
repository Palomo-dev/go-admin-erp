import { createActivity } from './activityService'
import { ActivityType } from '@/types/activity'
import { createClient } from '@supabase/supabase-js'

// Tipos de datos para SMS
export interface SMSEventData {
  messageId: string
  from: string
  to: string
  body: string
  status: string
  direction: string
  timestamp: Date
  provider: string
  organizationId?: number
  userId?: string
  errorCode?: string
  errorMessage?: string
  numMedia?: number
  mediaUrls?: string[]
  metadata?: Record<string, any>
}

// Datos específicos de Twilio SMS
export interface TwilioSMSEvent {
  MessageSid: string
  From: string
  To: string
  Body: string
  MessageStatus?: string
  Direction?: string
  DateCreated?: string
  DateSent?: string
  DateUpdated?: string
  ErrorCode?: string
  ErrorMessage?: string
  NumMedia?: string
  MediaUrl0?: string
  MediaUrl1?: string
  MediaUrl2?: string
  MediaUrl3?: string
  MediaUrl4?: string
  [key: string]: any
}

// Estados de SMS normalizados
export enum SMSStatus {
  QUEUED = 'queued',
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  UNDELIVERED = 'undelivered',
  RECEIVED = 'received'
}

// Direcciones de SMS
export enum SMSDirection {
  INBOUND = 'inbound',
  OUTBOUND_API = 'outbound-api',
  OUTBOUND_CALL = 'outbound-call',
  OUTBOUND_REPLY = 'outbound-reply'
}

/**
 * Servicio para procesamiento de eventos SMS
 */
export class SMSService {
  /**
   * Procesa un evento SMS y crea una actividad
   */
  static async processSMSEvent(eventData: SMSEventData): Promise<any> {
    try {
      console.log('📱 Procesando evento de SMS:', eventData)
      
      // 1. Normalizar evento SMS
      const normalizedData = this.normalizeSMSEvent(eventData)
      
      // 2. Filtrar eventos irrelevantes
      if (!this.shouldCreateActivity(normalizedData)) {
        console.log('⏭️ Evento de SMS ignorado:', normalizedData.status)
        return null
      }

      // 3. Enriquecer datos con información del CRM
      const enrichedData = await this.enrichSMSData(normalizedData)
      
      // 4. Crear actividad en Supabase
      const activity = await createActivity({
        activity_type: ActivityType.SMS,
        notes: this.generateSMSNotes(enrichedData),
        user_id: enrichedData.userId,
        related_type: enrichedData.relatedType,
        related_id: enrichedData.relatedId,
        occurred_at: enrichedData.timestamp.toISOString(),
        metadata: {
          ...enrichedData,
          sms_message_id: enrichedData.messageId,
          sms_from: enrichedData.from,
          sms_to: enrichedData.to,
          sms_body: enrichedData.body,
          sms_status: enrichedData.status,
          sms_direction: enrichedData.direction,
          sms_provider: enrichedData.provider,
          sms_error_code: enrichedData.errorCode,
          sms_error_message: enrichedData.errorMessage,
          sms_media_count: enrichedData.numMedia || 0,
          sms_media_urls: enrichedData.mediaUrls || []
        }
      }, enrichedData.organizationId)

      console.log('✅ Actividad de SMS creada:', activity.id)
      return activity

    } catch (error) {
      console.error('❌ Error procesando evento de SMS:', error)
      throw error
    }
  }

  /**
   * Normaliza evento SMS a formato estándar
   */
  private static normalizeSMSEvent(eventData: SMSEventData): SMSEventData {
    return {
      ...eventData,
      timestamp: eventData.timestamp || new Date(),
      provider: eventData.provider || 'twilio',
      status: this.normalizeStatus(eventData.status),
      direction: this.normalizeDirection(eventData.direction)
    }
  }

  /**
   * Normaliza estados de SMS
   */
  private static normalizeStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'queued': SMSStatus.QUEUED,
      'sending': SMSStatus.SENDING,
      'sent': SMSStatus.SENT,
      'delivered': SMSStatus.DELIVERED,
      'failed': SMSStatus.FAILED,
      'undelivered': SMSStatus.UNDELIVERED,
      'received': SMSStatus.RECEIVED
    }
    
    return statusMap[status?.toLowerCase()] || status
  }

  /**
   * Normaliza dirección de SMS
   */
  private static normalizeDirection(direction: string): string {
    const directionMap: Record<string, string> = {
      'inbound': SMSDirection.INBOUND,
      'outbound-api': SMSDirection.OUTBOUND_API,
      'outbound-call': SMSDirection.OUTBOUND_CALL,
      'outbound-reply': SMSDirection.OUTBOUND_REPLY
    }
    
    return directionMap[direction?.toLowerCase()] || direction
  }

  /**
   * Determina si se debe crear una actividad para este evento
   */
  private static shouldCreateActivity(eventData: SMSEventData): boolean {
    // No crear actividades para estados intermedios irrelevantes
    const ignoredStatuses = ['queued', 'sending']
    if (ignoredStatuses.includes(eventData.status)) {
      return false
    }

    // Solo procesar SMS con contenido
    if (!eventData.body && (!eventData.numMedia || eventData.numMedia === 0)) {
      return false
    }

    return true
  }

  /**
   * Enriquece datos SMS con información del CRM
   */
  private static async enrichSMSData(eventData: SMSEventData): Promise<SMSEventData & {
    relatedType?: string
    relatedId?: string
  }> {
    try {
      // Determinar organización si no está especificada
      if (!eventData.organizationId) {
        eventData.organizationId = await this.getOrganizationFromSMSNumber(eventData.to)
      }

      // Determinar usuario si no está especificado
      if (!eventData.userId) {
        eventData.userId = await this.getUserFromSMSNumber(eventData.from)
      }

      // Buscar entidad relacionada por número de teléfono
      const relatedEntity = await this.findRelatedEntityByPhone(eventData.from)
      
      return {
        ...eventData,
        relatedType: relatedEntity?.type,
        relatedId: relatedEntity?.id
      }
    } catch (error) {
      console.error('❌ Error enriqueciendo datos SMS:', error)
      return eventData
    }
  }

  /**
   * Genera notas descriptivas para la actividad
   */
  private static generateSMSNotes(eventData: SMSEventData): string {
    const direction = eventData.direction === SMSDirection.INBOUND ? 'Recibido' : 'Enviado'
    const status = this.translateStatus(eventData.status)
    
    let notes = `${direction} SMS ${status}`
    
    if (eventData.from && eventData.to) {
      notes += ` de ${eventData.from} a ${eventData.to}`
    }
    
    if (eventData.body) {
      const preview = eventData.body.length > 100 
        ? eventData.body.substring(0, 100) + '...'
        : eventData.body
      notes += `\n\nContenido: "${preview}"`
    }

    if (eventData.numMedia && eventData.numMedia > 0) {
      notes += `\n\nAdjuntos: ${eventData.numMedia} archivo(s) multimedia`
    }

    if (eventData.errorMessage) {
      notes += `\n\nError: ${eventData.errorMessage}`
    }
    
    return notes
  }

  /**
   * Traduce estados a español
   */
  private static translateStatus(status: string): string {
    const translations: Record<string, string> = {
      [SMSStatus.QUEUED]: 'en cola',
      [SMSStatus.SENDING]: 'enviando',
      [SMSStatus.SENT]: 'enviado',
      [SMSStatus.DELIVERED]: 'entregado',
      [SMSStatus.FAILED]: 'falló',
      [SMSStatus.UNDELIVERED]: 'no entregado',
      [SMSStatus.RECEIVED]: 'recibido'
    }
    
    return translations[status] || status
  }

  /**
   * Determina la organización basada en el número SMS
   */
  private static async getOrganizationFromSMSNumber(smsNumber: string): Promise<number> {
    // TODO: Implementar lógica para mapear números SMS a organizaciones
    // Por ejemplo, buscar en configuración de números de la organización
    return 1 // Placeholder
  }

  /**
   * Determina el usuario basado en el número de teléfono
   */
  private static async getUserFromSMSNumber(phoneNumber: string): Promise<string | undefined> {
    // TODO: Implementar lógica para determinar usuario
    // Por ejemplo, buscar en user_profiles por teléfono
    return undefined // Placeholder
  }

  /**
   * Busca entidad relacionada por número de teléfono
   */
  private static async findRelatedEntityByPhone(phoneNumber: string): Promise<{
    type: string
    id: string
  } | null> {
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
      
      // Buscar en customers
      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .or(`phone.eq.${phoneNumber},mobile_phone.eq.${phoneNumber}`)
        .single()
      
      if (customer) {
        return { type: 'customer', id: customer.id }
      }

      // Buscar en leads
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .or(`phone.eq.${phoneNumber},mobile_phone.eq.${phoneNumber}`)
        .single()
      
      if (lead) {
        return { type: 'lead', id: lead.id }
      }

      return null
    } catch (error) {
      console.error('❌ Error buscando entidad relacionada por teléfono:', error)
      return null
    }
  }
}

/**
 * Utilidades para convertir eventos de proveedores específicos
 */
export class SMSProviderUtils {
  /**
   * Convierte evento de Twilio SMS a formato estándar
   */
  static twilioToSMSEvent(twilioEvent: TwilioSMSEvent): SMSEventData {
    // Recopilar URLs de medios
    const mediaUrls: string[] = []
    for (let i = 0; i < 5; i++) {
      const mediaUrl = twilioEvent[`MediaUrl${i}`]
      if (mediaUrl) {
        mediaUrls.push(mediaUrl)
      }
    }

    return {
      messageId: twilioEvent.MessageSid,
      from: twilioEvent.From,
      to: twilioEvent.To,
      body: twilioEvent.Body || '',
      status: twilioEvent.MessageStatus || 'received',
      direction: twilioEvent.Direction || 'inbound',
      timestamp: twilioEvent.DateCreated ? new Date(twilioEvent.DateCreated) : new Date(),
      provider: 'twilio',
      errorCode: twilioEvent.ErrorCode,
      errorMessage: twilioEvent.ErrorMessage,
      numMedia: twilioEvent.NumMedia ? parseInt(twilioEvent.NumMedia) : 0,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      metadata: {
        twilio_message_sid: twilioEvent.MessageSid,
        twilio_date_sent: twilioEvent.DateSent,
        twilio_date_updated: twilioEvent.DateUpdated,
        ...twilioEvent
      }
    }
  }
}
