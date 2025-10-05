import { NextRequest, NextResponse } from 'next/server'

/**
 * Webhook para eventos de email de Twilio Email API
 * TEMPORALMENTE DESACTIVADO - Simplificado para evitar errores de build
 * TODO: Reactivar cuando los servicios estén completamente implementados
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📧 Webhook Twilio Email recibido (desactivado)')
    
    // Leer el body para evitar errores
    await request.text()
    
    // Responder con éxito sin procesar
    return NextResponse.json({
      message: 'Twilio Email webhook temporalmente desactivado',
      status: 'acknowledged'
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
 * Manejar método GET para verificación de webhook
 */
export async function GET() {
  return NextResponse.json({
    message: 'Twilio Email webhook endpoint activo',
    timestamp: new Date().toISOString()
  })
}
