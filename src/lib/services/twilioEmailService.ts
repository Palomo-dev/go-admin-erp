import { createActivity } from './activityService'
import { ActivityType } from '@/types/activity'
import { createClient } from '@supabase/supabase-js'

// Tipos de datos para Email con Twilio
export interface TwilioEmailEventData {
  messageId: string
  from: string
  to: string
  subject: string
  event: string
  timestamp: Date
  provider: string
  organizationId?: number
  userId?: string
  templateId?: string
  campaignId?: string
  errorCode?: string
  errorMessage?: string
  metadata?: Record<string, any>
}

// Datos específicos de Twilio Email API
export interface TwilioEmailEvent {
  message_id?: string
  id?: string
  from_email?: string
  from?: string
  to_email?: string
  to?: string
  subject?: string
  event_type?: string
  event?: string
  timestamp?: number
  template_id?: string
  campaign_id?: string
  bounce_reason?: string
  unsubscribe_reason?: string
  [key: string]: any
}

// Estados de email normalizados
export enum EmailStatus {
  PROCESSED = 'processed',
  DELIVERED = 'delivered',
  BOUNCED = 'bounced',
  DROPPED = 'dropped',
  SPAM_REPORT = 'spam_report',
  UNSUBSCRIBE = 'unsubscribe',
  OPENED = 'opened',
  CLICKED = 'clicked'
}

/**
 * Servicio para procesamiento de eventos de Email con Twilio
 */
export class TwilioEmailService {
  /**
   * Procesa un evento de email y crea una actividad
   */
  static async processEmailEvent(eventData: TwilioEmailEventData): Promise<any> {
    try {
      console.log('📧 Procesando evento de Twilio Email:', eventData)
      
      // 1. Normalizar evento de email
      const normalizedData = this.normalizeEmailEvent(eventData)
      
      // 2. Filtrar eventos irrelevantes
      if (!this.shouldCreateActivity(normalizedData)) {
        console.log('⏭️ Evento de email ignorado:', normalizedData.event)
        return null
      }

      // 3. Enriquecer datos con información del CRM
      const enrichedData = await this.enrichEmailData(normalizedData)
      
      // 4. Crear actividad en Supabase
      const activity = await createActivity({
        activity_type: ActivityType.EMAIL,
        notes: this.generateEmailNotes(enrichedData),
        user_id: enrichedData.userId,
        related_type: enrichedData.relatedType,
        related_id: enrichedData.relatedId,
        occurred_at: enrichedData.timestamp.toISOString(),
        metadata: {
          ...enrichedData,
          email_message_id: enrichedData.messageId,
          email_from: enrichedData.from,
          email_to: enrichedData.to,
          email_subject: enrichedData.subject,
          email_event: enrichedData.event,
          email_provider: enrichedData.provider,
          email_template_id: enrichedData.templateId,
          email_campaign_id: enrichedData.campaignId,
          email_error_code: enrichedData.errorCode,
          email_error_message: enrichedData.errorMessage
        }
      }, enrichedData.organizationId)

      console.log('✅ Actividad de email creada:', activity.id)
      return activity

    } catch (error) {
      console.error('❌ Error procesando evento de Twilio Email:', error)
      throw error
    }
  }

  /**
   * Normaliza evento de email a formato estándar
   */
  private static normalizeEmailEvent(eventData: TwilioEmailEventData): TwilioEmailEventData {
    return {
      ...eventData,
      timestamp: eventData.timestamp || new Date(),
      provider: eventData.provider || 'twilio_email',
      event: this.normalizeStatus(eventData.event)
    }
  }

  /**
   * Normaliza estados de email
   */
  private static normalizeStatus(status: string): string {
    const statusMap: Record<string, string> = {
      'processed': EmailStatus.PROCESSED,
      'delivered': EmailStatus.DELIVERED,
      'bounced': EmailStatus.BOUNCED,
      'dropped': EmailStatus.DROPPED,
      'spam_report': EmailStatus.SPAM_REPORT,
      'unsubscribe': EmailStatus.UNSUBSCRIBE,
      'open': EmailStatus.OPENED,
      'opened': EmailStatus.OPENED,
      'click': EmailStatus.CLICKED,
      'clicked': EmailStatus.CLICKED
    }
    
    return statusMap[status?.toLowerCase()] || status
  }

  /**
   * Determina si se debe crear una actividad para este evento
   */
  private static shouldCreateActivity(eventData: TwilioEmailEventData): boolean {
    // Crear actividades para todos los eventos importantes
    const importantEvents = [
      EmailStatus.DELIVERED,
      EmailStatus.BOUNCED,
      EmailStatus.DROPPED,
      EmailStatus.SPAM_REPORT,
      EmailStatus.UNSUBSCRIBE,
      EmailStatus.OPENED,
      EmailStatus.CLICKED
    ]
    
    return importantEvents.includes(eventData.event as EmailStatus)
  }

  /**
   * Enriquece datos de email con información del CRM
   */
  private static async enrichEmailData(eventData: TwilioEmailEventData): Promise<TwilioEmailEventData & {
    relatedType?: string
    relatedId?: string
  }> {
    try {
      // Determinar organización si no está especificada
      if (!eventData.organizationId) {
        eventData.organizationId = await this.getOrganizationFromEmail(eventData.to)
      }

      // Determinar usuario si no está especificado
      if (!eventData.userId) {
        eventData.userId = await this.getUserFromEmail(eventData.to)
      }

      // Buscar entidad relacionada por email
      const relatedEntity = await this.findRelatedEntityByEmail(eventData.to)
      
      return {
        ...eventData,
        relatedType: relatedEntity?.type,
        relatedId: relatedEntity?.id
      }
    } catch (error) {
      console.error('❌ Error enriqueciendo datos de email:', error)
      return eventData
    }
  }

  /**
   * Genera notas descriptivas para la actividad
   */
  private static generateEmailNotes(eventData: TwilioEmailEventData): string {
    const status = this.translateStatus(eventData.event)
    
    let notes = `Email ${status}`
    
    if (eventData.from && eventData.to) {
      notes += ` de ${eventData.from} a ${eventData.to}`
    }
    
    if (eventData.subject) {
      notes += `\n\nAsunto: "${eventData.subject}"`
    }

    if (eventData.templateId) {
      notes += `\n\nTemplate ID: ${eventData.templateId}`
    }

    if (eventData.campaignId) {
      notes += `\nCampaña ID: ${eventData.campaignId}`
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
      [EmailStatus.PROCESSED]: 'procesado',
      [EmailStatus.DELIVERED]: 'entregado',
      [EmailStatus.BOUNCED]: 'rebotado',
      [EmailStatus.DROPPED]: 'descartado',
      [EmailStatus.SPAM_REPORT]: 'reportado como spam',
      [EmailStatus.UNSUBSCRIBE]: 'desuscripción',
      [EmailStatus.OPENED]: 'abierto',
      [EmailStatus.CLICKED]: 'click registrado'
    }
    
    return translations[status] || status
  }

  /**
   * Determina la organización basada en el email
   */
  private static async getOrganizationFromEmail(email: string): Promise<number> {
    // TODO: Implementar lógica para mapear dominios de email a organizaciones
    const domain = email.split('@')[1]
    // Por ejemplo, mapear dominios específicos a organizaciones
    return 1 // Placeholder
  }

  /**
   * Determina el usuario basado en el email
   */
  private static async getUserFromEmail(email: string): Promise<string | undefined> {
    // TODO: Implementar lógica para determinar usuario
    // Por ejemplo, buscar en user_profiles por email
    return undefined // Placeholder
  }

  /**
   * Busca entidad relacionada por email
   */
  private static async findRelatedEntityByEmail(email: string): Promise<{
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
        .eq('email', email)
        .single()
      
      if (customer) {
        return { type: 'customer', id: customer.id }
      }

      // Buscar en leads
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('email', email)
        .single()
      
      if (lead) {
        return { type: 'lead', id: lead.id }
      }

      return null
    } catch (error) {
      console.error('❌ Error buscando entidad relacionada por email:', error)
      return null
    }
  }
}

/**
 * Utilidades para convertir eventos de Twilio Email API
 */
export class TwilioEmailProviderUtils {
  /**
   * Convierte evento de Twilio Email API a formato estándar
   */
  static twilioEmailToEmailEvent(twilioEvent: TwilioEmailEvent): TwilioEmailEventData {
    return {
      messageId: twilioEvent.message_id || twilioEvent.id || '',
      from: twilioEvent.from_email || twilioEvent.from || '',
      to: twilioEvent.to_email || twilioEvent.to || '',
      subject: twilioEvent.subject || '',
      event: twilioEvent.event_type || twilioEvent.event || '',
      timestamp: twilioEvent.timestamp ? new Date(twilioEvent.timestamp * 1000) : new Date(),
      provider: 'twilio_email',
      templateId: twilioEvent.template_id,
      campaignId: twilioEvent.campaign_id,
      errorMessage: twilioEvent.bounce_reason || twilioEvent.unsubscribe_reason,
      metadata: {
        twilio_message_id: twilioEvent.message_id,
        twilio_email_id: twilioEvent.id,
        twilio_template_id: twilioEvent.template_id,
        twilio_campaign_id: twilioEvent.campaign_id,
        ...twilioEvent
      }
    }
  }
}
