import { NextRequest, NextResponse } from 'next/server'
import { VoipCallService } from '@/lib/services/callService'
import type { CallEventData } from '@/lib/services/callService'

/**
 * 🧪 Endpoint de prueba para simular eventos VOIP
 * Útil para probar el sistema sin configurar Twilio
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    console.log('🧪 Simulando evento VOIP:', body)

    // Crear evento simulado con datos por defecto
    const mockCallEvent: CallEventData = {
      callSid: body.callSid || `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      provider: 'TWILIO' as any, // Simulación de prueba
      event: body.event || 'answered',
      timestamp: new Date().toISOString(),
      from: body.from || '+1234567890',
      to: body.to || '+0987654321',
      direction: body.direction || 'inbound',
      duration: body.duration || 45,
      status: body.status || 'completed',
      organizationId: body.organizationId || 1, // Usar organización del request
      userId: body.userId || undefined,
      recordingUrl: body.recordingUrl || undefined
    }

    // Procesar el evento simulado
    const activity = await VoipCallService.processCallEvent(mockCallEvent)
    
    if (activity) {
      console.log('✅ Actividad de prueba creada:', activity.id)
      
      // Emitir evento en tiempo real
      await emitTestCallEvent(activity)
    }

    return NextResponse.json({ 
      success: true,
      message: 'Evento VOIP simulado correctamente',
      activity_id: activity?.id,
      call_data: mockCallEvent
    })

  } catch (error) {
    console.error('❌ Error en simulación VOIP:', error)
    
    const errorDetails = error instanceof Error ? {
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    } : { message: 'Unknown error', raw: error }
    
    return NextResponse.json({ 
      success: false,
      error: 'Error procesando simulación',
      details: errorDetails,
      timestamp: new Date().toISOString(),
      endpoint: '/api/test/voip-simulation'
    }, { status: 500 })
  }
}

/**
 * Endpoint GET para obtener ejemplos de uso
 */
export async function GET() {
  const examples = {
    basic_call: {
      method: 'POST',
      url: '/api/test/voip-simulation',
      body: {
        event: 'answered',
        from: '+1234567890',
        to: '+0987654321',
        direction: 'inbound',
        duration: 45
      }
    },
    missed_call: {
      method: 'POST', 
      url: '/api/test/voip-simulation',
      body: {
        event: 'no-answer',
        from: '+1555444333',
        to: '+0987654321',
        direction: 'inbound'
      }
    },
    outbound_call: {
      method: 'POST',
      url: '/api/test/voip-simulation',
      body: {
        event: 'completed',
        from: '+0987654321',
        to: '+1555444333', 
        direction: 'outbound',
        duration: 120
      }
    }
  }

  return NextResponse.json({
    message: 'Endpoint de simulación VOIP activo',
    environment: process.env.NODE_ENV,
    examples,
    curl_example: `curl -X POST http://localhost:3000/api/test/voip-simulation -H "Content-Type: application/json" -d '${JSON.stringify(examples.basic_call.body)}'`
  })
}

/**
 * Emite evento en tiempo real para prueba
 */
async function emitTestCallEvent(activity: any) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    
    // Usar Service Role Key para bypass de RLS en pruebas
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
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
          organization_id: activity.organization_id,
          test_mode: true // Indicador de que es prueba
        }
      })
    
    console.log('✅ Evento de prueba emitido en tiempo real:', activity.id)
  } catch (error) {
    console.error('❌ Error emitiendo evento de prueba:', error)
  }
}
