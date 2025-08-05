import { NextRequest, NextResponse } from 'next/server'
import { TwilioEmailService, TwilioEmailProviderUtils } from '@/lib/services/twilioEmailService'
import { emitActivityEvent } from '@/lib/services/activityService'
import crypto from 'crypto'

/**
 * Webhook para eventos de email de Twilio Email API
 * Documentación: https://www.twilio.com/docs/email/api/events
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📧 Webhook Twilio Email recibido')
    
    // 1. Obtener el body como text para validación
    const body = await request.text()
    const signature = request.headers.get('x-twilio-signature')
    
    // 2. Validar webhook signature de Twilio
    if (!validateTwilioSignature(body, signature, request.url)) {
      console.error('❌ Signature inválida de Twilio Email')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Parsear JSON de Twilio Email API
    const twilioEmailEvents = JSON.parse(body)
    
    // Manejar tanto array como objeto individual
    const events = Array.isArray(twilioEmailEvents) ? twilioEmailEvents : [twilioEmailEvents]
    
    // 4. Procesar cada evento
    const results = []
    
    for (const twilioEvent of events) {
      try {
        console.log('📊 Evento Twilio Email:', {
          message_id: twilioEvent.message_id || twilioEvent.id,
          event_type: twilioEvent.event_type || twilioEvent.event,
          to: twilioEvent.to_email || twilioEvent.to,
          from: twilioEvent.from_email || twilioEvent.from
        })

        // 5. Convertir evento de Twilio Email a formato estándar
        const emailEventData = TwilioEmailProviderUtils.twilioEmailToEmailEvent(twilioEvent)
        
        // 6. Determinar organización y usuario
        emailEventData.organizationId = await getOrganizationFromEmail(emailEventData.to)
        emailEventData.userId = await getUserFromEmail(emailEventData.to)

        // 7. Procesar evento de email
        const activity = await TwilioEmailService.processEmailEvent(emailEventData)
        
        if (activity) {
          console.log('✅ Actividad de email procesada:', activity.id)
          
          // 8. Emitir evento en tiempo real para UI
          await emitActivityEvent(activity, 'twilio_email_event')
          
          results.push({ 
            message_id: twilioEvent.message_id || twilioEvent.id,
            status: 'processed',
            activity_id: activity.id 
          })
        } else {
          results.push({ 
            message_id: twilioEvent.message_id || twilioEvent.id,
            status: 'ignored' 
          })
        }
        
      } catch (error) {
        console.error('❌ Error procesando evento Twilio Email individual:', error)
        results.push({ 
          message_id: twilioEvent.message_id || twilioEvent.id,
          status: 'error',
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    // 9. Responder con resultados
    return NextResponse.json({
      message: 'Eventos Twilio Email procesados',
      results: results
    })

  } catch (error) {
    console.error('❌ Error en webhook Twilio Email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Valida la signature de webhook de Twilio
 */
function validateTwilioSignature(body: string, signature: string | null, url: string): boolean {
  if (!process.env.TWILIO_AUTH_TOKEN) {
    console.warn('⚠️ TWILIO_AUTH_TOKEN no configurado - saltando validación')
    return true // En desarrollo, permitir sin validación
  }

  if (!signature) {
    console.error('❌ No se encontró signature de Twilio')
    return false
  }

  try {
    const computedSignature = crypto
      .createHmac('sha1', process.env.TWILIO_AUTH_TOKEN)
      .update(url + body)
      .digest('base64')
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(computedSignature)
    )
  } catch (error) {
    console.error('❌ Error validando signature Twilio:', error)
    return false
  }
}

/**
 * Determina la organización desde el email
 */
async function getOrganizationFromEmail(email: string): Promise<number> {
  // TODO: Implementar lógica para determinar organización
  // Por ejemplo, mapear dominios de email a organizaciones
  const domain = email.split('@')[1]
  // Placeholder: mapear dominios específicos
  return 1
}

/**
 * Determina el usuario asignado desde el email
 */
async function getUserFromEmail(email: string): Promise<string | undefined> {
  // TODO: Implementar lógica para determinar usuario
  // Por ejemplo, buscar en user_profiles por email
  return undefined // Placeholder
}

/**
 * Manejar método GET para verificación de webhook
 */
export async function GET() {
  return NextResponse.json({
    message: 'Twilio Email webhook endpoint activo',
    timestamp: new Date().toISOString()
  })
}
