import { NextRequest, NextResponse } from 'next/server'

/**
 * Webhook para eventos de llamadas de Twilio
 * TEMPORALMENTE DESACTIVADO - Simplificado para evitar errores de build
 * TODO: Reactivar cuando los servicios estén completamente implementados
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📞 Webhook Twilio VOIP recibido (desactivado)')
    
    // Leer el body para evitar errores
    await request.text()
    
    // Responder con TwiML simple
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="es-MX">Webhook temporalmente desactivado</Say>
</Response>`
    
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

// Manejar método GET para verificación de webhook
export async function GET() {
  return NextResponse.json({ 
    status: 'Webhook Twilio VOIP activo',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  })
}
