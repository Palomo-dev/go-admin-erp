import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Función para crear un cliente de Supabase Admin con la clave de servicio
const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Faltan credenciales de Supabase')
  }
  
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { 
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Función para crear un cliente de Supabase con la cookie de sesión
const createClientWithSession = async () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  
  const cookieStore = await cookies()
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'Cache-Control': 'no-cache',
      },
    },
  })
}

// POST: Actualizar la actividad del usuario en la base de datos
export async function POST(request: Request) {
  try {
    // Cliente con la sesión actual para verificar autenticación
    const supabase = await createClientWithSession()
    
    // Obtener la sesión actual para verificar la autenticidad
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    
    // Extraer datos de la petición
    const { sessionId, userId } = await request.json()
    
    // Verificar que los IDs coincidan con la sesión actual para seguridad
    if (session.user.id !== userId) {
      return NextResponse.json({ error: 'Datos de sesión inválidos' }, { status: 400 })
    }
    
    // Cliente admin para actualizar los datos
    const supabaseAdmin = createAdminClient()
    
    // Buscar dispositivo existente asociado a la sesión
    const { data: deviceData, error: deviceError } = await supabaseAdmin
      .from('user_devices')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    
    if (deviceError) {
      console.error('Error al buscar dispositivo:', deviceError)
      return NextResponse.json({ error: 'Error al actualizar actividad' }, { status: 500 })
    }
    
    if (deviceData) {
      // Si existe el dispositivo, actualizar última actividad
      await supabaseAdmin.from('user_devices')
        .update({
          last_active_at: new Date().toISOString()
        })
        .eq('id', deviceData.id)
    } else {
      // Si no existe, buscar información del dispositivo actual
      const userAgent = request.headers.get('user-agent') || ''
      const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '0.0.0.0'
      
      // Intentar detectar tipo de dispositivo y nombre
      const deviceType = detectDeviceType(userAgent)
      const deviceName = `${deviceType} (${new Date().toLocaleDateString()})`
      
      // Crear huella digital del dispositivo
      const deviceFingerprint = Buffer.from(
        `${userAgent || ''}:${ipAddress || ''}:${userId}`
      ).toString('base64')
      
      // Registrar nuevo dispositivo
      await supabaseAdmin.from('user_devices').insert({
        user_id: userId,
        session_id: sessionId,
        device_name: deviceName,
        device_type: deviceType,
        device_fingerprint: deviceFingerprint,
        user_agent: userAgent,
        ip_address: ipAddress,
        is_active: true,
        first_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString()
      })
    }
    
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error al procesar la solicitud:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// Función auxiliar para detectar el tipo de dispositivo basado en user-agent
function detectDeviceType(userAgent: string | null): string {
  if (!userAgent) return 'Desconocido'
  
  userAgent = userAgent.toLowerCase()
  
  if (userAgent.includes('mobile') || userAgent.includes('android') || userAgent.includes('iphone')) {
    return 'Móvil'
  } else if (userAgent.includes('tablet') || userAgent.includes('ipad')) {
    return 'Tablet'
  } else if (userAgent.includes('windows') || userAgent.includes('macintosh') || userAgent.includes('linux')) {
    return 'Escritorio'
  } else {
    return 'Otro'
  }
}
