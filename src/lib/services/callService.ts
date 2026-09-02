import type { SupabaseClient } from '@supabase/supabase-js'
import { Activity, ActivityMetadata, ActivityType, NewActivity } from '@/types/activity'
import { createActivity } from './activityService'

// Tipos de eventos de llamada
export enum CallEvent {
  INITIATED = 'call.initiated',
  RINGING = 'call.ringing', 
  ANSWERED = 'call.answered',
  COMPLETED = 'call.completed',
  FAILED = 'call.failed',
  NO_ANSWER = 'call.no-answer',
  BUSY = 'call.busy',
  VOICEMAIL = 'call.voicemail',
  RECORDING_COMPLETED = 'recording.completed'
}

// Proveedores VOIP soportados
export enum VoipProvider {
  TWILIO = 'twilio',
  AIRCALL = 'aircall',
  RINGCENTRAL = 'ringcentral'
}

// Interfaz para eventos de llamada genéricos
export interface CallEventData {
  callSid: string
  provider: VoipProvider
  event: CallEvent
  timestamp: string
  from: string
  to: string
  direction: 'inbound' | 'outbound'
  duration?: number
  status?: string
  recordingUrl?: string
  userId?: string
  organizationId?: number
  [key: string]: any
}

// Servicio principal para llamadas VOIP
export class VoipCallService {
  
  /**
   * Procesa un evento de llamada y crea/actualiza actividad
   */
  static async processCallEvent(supabase: SupabaseClient, eventData: CallEventData): Promise<Activity | null> {
    try {
      console.log('🔄 Procesando evento de llamada:', eventData.event, eventData.callSid)
      
      // Obtener o crear actividad existente
      const existingActivity = await this.getActivityByCallSid(supabase, eventData.callSid)
      
      if (existingActivity) {
        return await this.updateCallActivity(supabase, existingActivity, eventData)
      } else {
        return await this.createCallActivity(supabase, eventData)
      }
    } catch (error) {
      console.error('❌ Error procesando evento de llamada:', error)
      throw error
    }
  }

  /**
   * Busca actividad existente por call_sid
   */
  private static async getActivityByCallSid(supabase: SupabaseClient, callSid: string): Promise<Activity | null> {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('activity_type', 'call')
      .eq('metadata->>call_sid', callSid) // Consulta JSONB correcta
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return data
  }

  /**
   * Crea nueva actividad para llamada
   */
  private static async createCallActivity(supabase: SupabaseClient, eventData: CallEventData): Promise<Activity> {
    console.log('📞 === CREANDO ACTIVIDAD DE LLAMADA ===');
    console.log('📄 EventData recibido:', eventData);
    
    const activityData: NewActivity = {
      activity_type: ActivityType.CALL,
      user_id: eventData.userId,
      notes: this.generateCallNotes(eventData),
      related_type: await this.getRelatedTypeFromPhone(supabase, eventData.from, eventData.to),
      related_id: await this.getRelatedIdFromPhone(supabase, eventData.from, eventData.to),
      occurred_at: eventData.timestamp,
      metadata: this.buildCallMetadata(eventData)
    }
    
    console.log('📋 Datos de actividad preparados:', activityData);

    // Usar createActivity que maneja organización correctamente
    const activity = await createActivity(activityData, eventData.organizationId);

    console.log('✅ Actividad de llamada creada via createActivity:', activity.id)
    console.log('📞 === ACTIVIDAD DE LLAMADA COMPLETADA ===');
    return activity
  }

  /**
   * Actualiza actividad existente con nuevo evento
   */
  private static async updateCallActivity(supabase: SupabaseClient, activity: Activity, eventData: CallEventData): Promise<Activity> {
    const updatedMetadata = {
      ...activity.metadata,
      ...this.buildCallMetadata(eventData)
    }

    const updatedNotes = this.updateCallNotes(activity.notes || '', eventData)

    const { data, error } = await supabase
      .from('activities')
      .update({
        notes: updatedNotes,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', activity.id)
      .select()
      .single()

    if (error) throw error

    console.log('✅ Actividad de llamada actualizada:', data.id)
    return data
  }

  /**
   * Genera notas para la llamada
   */
  private static generateCallNotes(eventData: CallEventData): string {
    const direction = eventData.direction === 'inbound' ? 'Llamada entrante' : 'Llamada saliente'
    const from = eventData.from
    const to = eventData.to
    
    switch (eventData.event) {
      case CallEvent.INITIATED:
        return `${direction} iniciada de ${from} a ${to}`
      case CallEvent.ANSWERED:
        return `${direction} contestada - ${from} → ${to}`
      case CallEvent.COMPLETED:
        const duration = eventData.duration ? ` (${Math.floor(eventData.duration / 60)}:${(eventData.duration % 60).toString().padStart(2, '0')})` : ''
        return `${direction} completada${duration} - ${from} → ${to}`
      case CallEvent.NO_ANSWER:
        return `${direction} no contestada - ${from} → ${to}`
      case CallEvent.VOICEMAIL:
        return `${direction} terminó en buzón de voz - ${from} → ${to}`
      case CallEvent.FAILED:
        return `${direction} falló - ${from} → ${to}`
      default:
        return `${direction} - ${from} → ${to} (${eventData.event})`
    }
  }

  /**
   * Actualiza notas existentes con nuevo evento
   */
  private static updateCallNotes(existingNotes: string, eventData: CallEventData): string {
    const newEvent = this.generateCallNotes(eventData)
    return `${existingNotes}\n${newEvent}`
  }

  /**
   * Construye metadata para la llamada
   */
  private static buildCallMetadata(eventData: CallEventData): ActivityMetadata {
    return {
      call_sid: eventData.callSid,
      call_direction: eventData.direction,
      call_from: eventData.from,
      call_to: eventData.to,
      call_provider: eventData.provider,
      call_start_time: eventData.timestamp,
      call_end_time: eventData.event === CallEvent.COMPLETED ? eventData.timestamp : undefined,
      call_duration: eventData.duration,
      call_recording_url: eventData.recordingUrl,
      call_status: this.mapEventToStatus(eventData.event),
      phone_number: eventData.direction === 'inbound' ? eventData.from : eventData.to,
      duration: eventData.duration ? Math.ceil(eventData.duration / 60) : undefined, // en minutos
      ...eventData
    }
  }

  /**
   * Mapea eventos a estados de llamada
   */
  private static mapEventToStatus(event: CallEvent): 'answered' | 'missed' | 'voicemail' | undefined {
    switch (event) {
      case CallEvent.COMPLETED:
        return 'answered'
      case CallEvent.NO_ANSWER:
        return 'missed'
      case CallEvent.VOICEMAIL:
        return 'voicemail'
      default:
        return undefined
    }
  }

  /**
   * Determina el tipo de entidad relacionada desde número de teléfono
   */
  private static async getRelatedTypeFromPhone(supabase: SupabaseClient, from: string, to: string): Promise<string | undefined> {
    // Lógica para determinar si es customer, lead, etc.
    const customerPhone = from.startsWith('+') ? from : to
    
  const { data } = await supabase
    .from('customers')
    .select('id')
    .eq('phone', customerPhone)
    .single()

  console.log('🔍 getRelatedTypeFromPhone - phone:', customerPhone, 'data:', data);
  return data ? 'customer' : undefined
  }

  /**
   * Obtiene ID de entidad relacionada desde número de teléfono
   */
  private static async getRelatedIdFromPhone(supabase: SupabaseClient, from: string, to: string): Promise<string | undefined> {
    const customerPhone = from.startsWith('+') ? from : to
    
    const { data } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', customerPhone)
      .single()

    console.log('🔍 getRelatedIdFromPhone - phone:', customerPhone, 'data:', data);
    console.log('🔍 getRelatedIdFromPhone - data?.id:', data?.id);
    return data?.id
  }

}

// Funciones de utilidad para Twilio
export class TwilioUtils {
  
  /**
   * Convierte evento de Twilio a formato estándar
   */
  static twilioToCallEvent(twilioEvent: any, organizationId: number): CallEventData {
    return {
      callSid: twilioEvent.CallSid,
      provider: VoipProvider.TWILIO,
      event: this.mapTwilioEvent(twilioEvent.CallStatus),
      timestamp: new Date().toISOString(),
      from: twilioEvent.From,
      to: twilioEvent.To,
      direction: twilioEvent.Direction === 'inbound' ? 'inbound' : 'outbound',
      duration: parseInt(twilioEvent.CallDuration) || undefined,
      status: twilioEvent.CallStatus,
      recordingUrl: twilioEvent.RecordingUrl,
      organizationId
    }
  }

  /**
   * Mapea estados de Twilio a eventos estándar
   */
  private static mapTwilioEvent(status: string): CallEvent {
    switch (status) {
      case 'initiated':
        return CallEvent.INITIATED
      case 'ringing':
        return CallEvent.RINGING
      case 'in-progress':
        return CallEvent.ANSWERED
      case 'completed':
        return CallEvent.COMPLETED
      case 'failed':
        return CallEvent.FAILED
      case 'no-answer':
        return CallEvent.NO_ANSWER
      case 'busy':
        return CallEvent.BUSY
      default:
        return CallEvent.FAILED
    }
  }
}
