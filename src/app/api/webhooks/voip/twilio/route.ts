import { NextRequest, NextResponse } from 'next/server'
import { VoipCallService, TwilioUtils } from '@/lib/services/callService'
import crypto from 'crypto'

/**
 * Webhook para eventos de llamadas de Twilio
 * Documentación: https://www.twilio.com/docs/voice/webhooks
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📞 Webhook Twilio recibido')
    
    // 1. Obtener el body como text para validación
    const body = await request.text()
    const signature = request.headers.get('x-twilio-signature')
    
    // 2. Validar webhook signature de Twilio
    if (!validateTwilioSignature(body, signature)) {
      console.error('❌ Signature inválida de Twilio')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 3. Parsear FormData de Twilio
    const formData = new URLSearchParams(body)
    const twilioEvent = Object.fromEntries(formData.entries())
    
    console.log('📊 Evento Twilio:', {
      CallSid: twilioEvent.CallSid,
      CallStatus: twilioEvent.CallStatus,
      From: twilioEvent.From,
      To: twilioEvent.To,
      Direction: twilioEvent.Direction
    })

    // 4. Convertir evento de Twilio a formato estándar
    const callEventData = TwilioUtils.twilioToCallEvent(twilioEvent)
    
    // 5. Determinar organización y usuario
    callEventData.organizationId = await VoipCallService.getOrganizationFromCall(callEventData.userId)
    callEventData.userId = await getUserFromTwilioNumber(twilioEvent.To)

    // 6. Procesar evento de llamada
    const activity = await VoipCallService.processCallEvent(callEventData)
    
    if (activity) {
      console.log('✅ Actividad procesada:', activity.id)
      
      // 7. Emitir evento en tiempo real para UI
      await emitCallEvent(activity)
    }

    // 8. Responder con TwiML si es necesario
    const twimlResponse = generateTwiMLResponse(twilioEvent)
    
    return new NextResponse(twimlResponse, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml'
      }
    })

  } catch (error) {
    console.error('❌ Error en webhook Twilio:', error)
    return NextResponse.json({ 
      error: 'Error procesando webhook',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * Valida la signature de webhook de Twilio
 */
function validateTwilioSignature(body: string, signature: string | null): boolean {
  if (!signature) return false
  
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!authToken) {
    console.error('❌ TWILIO_AUTH_TOKEN no configurado')
    return false
  }

  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(body)
    .digest('base64')
  
  return signature === expectedSignature
}

/**
 * Determina el usuario asignado desde el número de Twilio
 */
async function getUserFromTwilioNumber(toNumber: string): Promise<string | undefined> {
  // Por ahora retornar undefined - puedes personalizar según tu lógica
  // Ejemplo: mapear números de Twilio a usuarios específicos
  return undefined
}

/**
 * Emite evento en tiempo real para actualizar UI
 */
async function emitCallEvent(activity: any) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    await supabase.channel('activities')
      .send({
        type: 'broadcast',
        event: 'call_activity_created',
        payload: {
          activity_id: activity.id,
          activity_type: 'call',
          call_status: activity.metadata?.call_status,
          phone_number: activity.metadata?.phone_number,
          organization_id: activity.organization_id
        }
      })
    
    console.log('✅ Evento en tiempo real emitido:', activity.id)
  } catch (error) {
    console.error('❌ Error emitiendo evento en tiempo real:', error)
    // No lanzar error para no interrumpir el flujo principal
  }
}

/**
 * Genera respuesta TwiML según el evento
 */
function generateTwiMLResponse(twilioEvent: any): string {
  const callStatus = twilioEvent.CallStatus
  
  switch (callStatus) {
    case 'initiated':
    case 'ringing':
      // Respuesta para llamadas en progreso
      return `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say language="es-MX">Procesando llamada...</Say>
        </Response>`
    
    case 'completed':
    case 'no-answer':
    case 'busy':
    case 'failed':
      // Respuesta para llamadas terminadas
      return `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say language="es-MX">Llamada procesada correctamente</Say>
        </Response>`
    
    default:
      return `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Say language="es-MX">Evento procesado</Say>
        </Response>`
  }
}

// Manejar método GET para verificación de webhook
export async function GET() {
  return NextResponse.json({ 
    status: 'Webhook Twilio VOIP activo',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  })
}
