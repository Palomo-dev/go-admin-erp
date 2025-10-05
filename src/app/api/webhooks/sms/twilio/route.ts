import { NextRequest, NextResponse } from 'next/server'

/**
 * Webhook para eventos de SMS de Twilio
 * TEMPORALMENTE DESACTIVADO - Simplificado para evitar errores de build
 * TODO: Reactivar cuando los servicios estén completamente implementados
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📱 Webhook Twilio SMS recibido (desactivado)')
    
    // Leer el body para evitar errores
    await request.text()
    
    // Responder con éxito sin procesar
    return NextResponse.json({
      message: 'Twilio SMS webhook temporalmente desactivado',
      status: 'acknowledged'
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
 * Manejar método GET para verificación de webhook
 */
export async function GET() {
  return NextResponse.json({
    message: 'Twilio SMS webhook endpoint activo',
    timestamp: new Date().toISOString()
  })
}
