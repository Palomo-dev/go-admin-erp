import { NextRequest, NextResponse } from 'next/server'
import { SMSService, SMSProviderUtils } from '@/lib/services/smsService'
import { emitActivityEvent } from '@/lib/services/activityService'
import crypto from 'crypto'

/**
 * Webhook para eventos de SMS de Twilio
 * Documentación: https://www.twilio.com/docs/messaging/webhooks
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📱 Webhook Twilio SMS recibido')
    
    // 1. Obtener el body como text para validación
    const body = await request.text()
    const signature = request.headers.get('x-twilio-signature')
    
    // 2. Validar webhook signature de Twilio
    if (!validateTwilioSignature(body, signature, request.url)) {
      console.error('❌ Signature inválida de Twilio SMS')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Parsear FormData de Twilio
    const formData = new URLSearchParams(body)
    const twilioEvent = Object.fromEntries(formData.entries())
    
    console.log('📊 Evento Twilio SMS:', {
      MessageSid: twilioEvent.MessageSid,
      MessageStatus: twilioEvent.MessageStatus,
      From: twilioEvent.From,
      To: twilioEvent.To,
      Body: twilioEvent.Body?.substring(0, 50) // Mostrar solo primeros 50 caracteres
    })

    // 4. Convertir evento de Twilio a formato estándar
    const smsEventData = SMSProviderUtils.twilioToSMSEvent(twilioEvent)
    
    // 5. Determinar organización y usuario
    smsEventData.organizationId = await getOrganizationFromSMSNumber(twilioEvent.To)
    smsEventData.userId = await getUserFromSMSNumber(twilioEvent.From)

    // 6. Procesar evento de SMS
    const activity = await SMSService.processSMSEvent(smsEventData)
    
    if (activity) {
      console.log('✅ Actividad de SMS procesada:', activity.id)
      
      // 7. Emitir evento en tiempo real para UI
      await emitActivityEvent(activity, 'sms_event')
    }

    // 8. Generar respuesta TwiML si es necesario
    const twimlResponse = generateTwiMLResponse(twilioEvent)

    // 9. Responder con TwiML o JSON
    if (twimlResponse) {
      return new NextResponse(twimlResponse, {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    return NextResponse.json({
      message: 'Evento Twilio SMS procesado',
      activity_id: activity?.id
    })

  } catch (error) {
    console.error('❌ Error en webhook Twilio SMS:', error)
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
 * Determina la organización desde el número SMS
 */
async function getOrganizationFromSMSNumber(toNumber: string): Promise<number> {
  // TODO: Implementar lógica para determinar organización
  // Por ejemplo, mapear números SMS de la organización
  return 1 // Placeholder
}

/**
 * Determina el usuario asignado desde el número de teléfono
 */
async function getUserFromSMSNumber(fromNumber: string): Promise<string | undefined> {
  // TODO: Implementar lógica para determinar usuario
  // Por ejemplo, buscar en customers por número de teléfono
  return undefined // Placeholder
}

/**
 * Genera respuesta TwiML según el evento
 */
function generateTwiMLResponse(twilioEvent: any): string | null {
  // Solo generar respuesta TwiML para mensajes entrantes
  if (twilioEvent.Direction === 'inbound') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>
        <Body>Gracias por tu mensaje. Hemos recibido tu SMS y te responderemos pronto.</Body>
    </Message>
</Response>`
  }
  
  return null
}

/**
 * Manejar método GET para verificación de webhook
 */
export async function GET() {
  return NextResponse.json({
    message: 'Twilio SMS webhook endpoint activo',
    timestamp: new Date().toISOString()
  })
}
