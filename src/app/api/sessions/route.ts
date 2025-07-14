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
      // Cookie storage personalizada para Next.js App Router
      storage: {
        getItem: (key: string) => {
          return cookieStore.get(key)?.value ?? null
        },
        setItem: () => {},
        removeItem: () => {}
      }
    }
  })
}

// GET: Obtener las sesiones activas del usuario
export async function GET(request: Request) {
  try {
    // Cliente con la sesión actual
    const supabase = await createClientWithSession()
    
    // Obtener la sesión actual
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    
    const userId = session.user.id
    // Para manejo simplificado, usamos el id del usuario para identificar la sesión actual
    const currentSessionId = userId
    
    // Obtener dispositivos asociados desde user_devices
    const { data: devices, error: devicesError } = await supabase.from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .order('last_active_at', { ascending: false })
    
    if (devicesError) {
      console.error('Error al obtener dispositivos:', devicesError)
      return NextResponse.json({ error: 'Error al obtener dispositivos' }, { status: 500 })
    }
    
    // Convertir dispositivos a sesiones para mantener compatibilidad con la interfaz
    const enhancedSessions = devices.map((device: any) => {
      return {
        id: device.id,
        created_at: device.first_seen_at,
        updated_at: device.last_active_at,
        // El dispositivo actual es el que tiene session_id igual al userId actual
        current: device.session_id === currentSessionId && device.is_active,
        device_name: device.device_name || 'Dispositivo desconocido',
        device_type: device.device_type || 'Otro',
        browser: device.browser || null,
        browser_version: device.browser_version || null,
        os: device.os || null,
        os_version: device.os_version || null,
        last_active_at: device.last_active_at,
        first_seen_at: device.first_seen_at,
        is_trusted: device.is_trusted || false,
        location: device.location || null,
        user_agent: device.user_agent || null,
        ip_address: device.ip_address || null
      }
    })
    
    return NextResponse.json({ sessions: enhancedSessions })
    
  } catch (error: any) {
    console.error('Error al procesar la solicitud:', error)
    return NextResponse.json(
      { error: 'Error del servidor: ' + (error.message || 'Desconocido') }, 
      { status: 500 }
    )
  }
}

// POST: Registrar un nuevo dispositivo o actualizar uno existente
export async function POST(request: Request) {
  try {
    const supabase = await createClientWithSession()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    
    const userId = session.user.id
    // Obtener el token para buscar el UUID real de la sesión
    const accessToken = session.access_token
    
    const { 
      deviceName, 
      deviceType, 
      userAgent, 
      browser, 
      browser_version, 
      os, 
      os_version, 
      deviceFingerprint: clientFingerprint, 
      ipAddress, 
      location 
    } = await request.json()
    
    // Para manejo simplificado, usaremos el id del usuario como session_id
    // Esto es suficiente para identificar al dispositivo en user_devices
    // y evita problemas con permisos para acceder a auth.sessions
    const sessionId = userId
    
    console.log('[API:Sessions] Usando user_id como session_id:', sessionId)
    
    // Usar la huella digital enviada por el cliente o generarla si no existe
    const deviceFingerprint = clientFingerprint || Buffer.from(
      `${userAgent || ''}:${ipAddress || ''}:${userId}`
    ).toString('base64')
    
    // Buscar si ya existe un dispositivo con esta huella
    // Definir el tipo para el dispositivo
    interface UserDevice {
      id: string;
      device_name?: string;
      device_type?: string;
      user_agent?: string;
      ip_address?: string;
      location?: string | null;
      browser?: string;
      browser_version?: string;
      os?: string;
      os_version?: string;
    }
    
    const { data: existingDevice } = await supabase.from('user_devices')
      .select('id, device_name, user_agent, ip_address, location, browser, browser_version, os, os_version')
      .eq('user_id', userId)
      .eq('device_fingerprint', deviceFingerprint)
      .maybeSingle() as { data: UserDevice | null }
    
    let result
    
    if (existingDevice) {
      console.log('[API:Sessions] Actualizando dispositivo existente:', { 
        id: existingDevice.id,
        fingerprint: deviceFingerprint.substring(0, 10) + '...',
        userId
      });
      
      // Actualizar dispositivo existente
      result = await supabase.from('user_devices').update({
        session_id: sessionId,
        device_name: deviceName || existingDevice.device_name || 'Dispositivo actualizado',
        device_type: deviceType || existingDevice.device_type || 'unknown',
        browser: browser || null,
        browser_version: browser_version || null,
        os: os || null,
        os_version: os_version || null,
        last_active_at: new Date().toISOString(),
        is_active: true,
        user_agent: userAgent || null,
        ip_address: ipAddress || null,
        location: location || null
      }).eq('id', existingDevice.id)
    } else {
      console.log('[API:Sessions] Registrando nuevo dispositivo:', { 
        fingerprint: deviceFingerprint.substring(0, 10) + '...',
        deviceType: deviceType || detectDeviceType(userAgent),
        deviceName: deviceName || 'Nuevo dispositivo', 
        userId
      });
      
      // Crear nuevo registro de dispositivo
      result = await supabase.from('user_devices').insert({
        user_id: userId,
        session_id: sessionId,
        device_name: deviceName || 'Nuevo dispositivo',
        device_type: deviceType || detectDeviceType(userAgent),
        browser: browser || null,
        browser_version: browser_version || null,
        os: os || null,
        os_version: os_version || null,
        device_fingerprint: deviceFingerprint,
        user_agent: userAgent,
        ip_address: ipAddress || request.headers.get('x-forwarded-for') || null,
        location: location,
        is_active: true,
        first_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString()
      })
    }
    
    if (result.error) {
      console.error('Error al guardar dispositivo:', result.error)
      return NextResponse.json({ error: 'Error al guardar dispositivo' }, { status: 500 })
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('Error al procesar la solicitud:', error)
    return NextResponse.json({ error: 'Error del servidor' }, { status: 500 })
  }
}

// DELETE: Revocar una sesión específica o todas las sesiones
export async function DELETE(request: Request) {
  try {
    // Obtener datos de la solicitud
    const requestData = await request.json()
    const { sessionId, revokeAll } = requestData

    if (!sessionId && !revokeAll) {
      return NextResponse.json({ error: 'ID de sesión no proporcionado o flag revokeAll ausente' }, { status: 400 })
    }

    // Cliente con la sesión actual
    const supabase = await createClientWithSession()
    
    // Verificar autenticación
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const userId = session.user.id
    const currentSessionId = userId // Igual que en el POST, usamos userId como identificador de sesión
    const currentTime = new Date().toISOString()
    
    if (revokeAll) {
      // Revocar todos los dispositivos excepto el actual
      const { error } = await supabase.from('user_devices')
        .update({
          is_active: false,
          revoked_at: currentTime
        })
        .eq('user_id', userId)
        .neq('session_id', currentSessionId) // No revocar la sesión actual
      
      if (error) {
        console.error('Error al revocar todos los dispositivos:', error)
        return NextResponse.json({ error: 'Error al revocar los dispositivos' }, { status: 500 })
      }

      // Cerramos todas las demás sesiones con el método de Supabase
      try {
        await supabase.auth.signOut({ scope: 'others' })
      } catch (signOutError) {
        console.error('Error al cerrar otras sesiones con Supabase:', signOutError)
        // Continuamos aunque falle, ya que ya desactivamos los dispositivos en nuestra tabla
      }

      return NextResponse.json({ success: true, message: 'Todos los dispositivos han sido revocados' })
    } else {
      // Marcar el dispositivo específico como inactivo
      const { error } = await supabase.from('user_devices')
        .update({
          is_active: false,
          revoked_at: currentTime
        })
        .eq('id', sessionId)
        .eq('user_id', userId) // Verificar que el dispositivo pertenezca al usuario
      
      if (error) {
        console.error('Error al revocar el dispositivo:', error)
        return NextResponse.json({ error: 'Error al revocar el dispositivo' }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, message: 'Dispositivo revocado correctamente' })
    }
  } catch (error: any) {
    console.error('Error al procesar la solicitud:', error)
    return NextResponse.json({ error: 'Error del servidor: ' + (error.message || 'Desconocido') }, { status: 500 })
  }
}

// PATCH: Actualizar propiedades de un dispositivo (ej: marcar como confiable)
export async function PATCH(request: Request) {
  try {
    const supabase = await createClientWithSession()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    
    const { sessionId, updates } = await request.json()
    
    if (!sessionId || !updates) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 })
    }
    
    // Solo permitir actualizar ciertos campos
    const allowedUpdates = ['device_name', 'is_trusted']
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([key]) => allowedUpdates.includes(key))
    )
    
    if (Object.keys(filteredUpdates).length === 0) {
      return NextResponse.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 })
    }
    
    // Actualizar dispositivo
    const { error } = await supabase.from('user_devices')
      .update(filteredUpdates)
      .eq('session_id', sessionId)
      .eq('user_id', session.user.id)
    
    if (error) {
      console.error('Error al actualizar dispositivo:', error)
      return NextResponse.json({ error: 'Error al actualizar dispositivo' }, { status: 500 })
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
  
  const ua = userAgent.toLowerCase()
  
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
    return 'iOS'
  } else if (ua.includes('android')) {
    return 'Android'
  } else if (ua.includes('windows phone')) {
    return 'Windows Phone'
  } else if (ua.includes('windows')) {
    return 'Windows'
  } else if (ua.includes('mac')) {
    return 'Mac'
  } else if (ua.includes('linux')) {
    return 'Linux'
  } else {
    return 'Otro'
  }
}
