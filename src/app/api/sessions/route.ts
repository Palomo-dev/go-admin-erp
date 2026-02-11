import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

// Función para crear un cliente de Supabase Admin con la clave de servicio
const createAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('supabaseUrl is required. Verifica que NEXT_PUBLIC_SUPABASE_URL esté configurada en .env.local')
  }
  
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
    
    // Obtener el device_fingerprint de la sesión actual desde el header o parámetros
    const url = new URL(request.url)
    const currentDeviceFingerprint = url.searchParams.get('current_fingerprint')
    
    // Obtener dispositivos asociados desde user_devices (solo activos)
    const { data: devices, error: devicesError } = await supabase.from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('last_active_at', { ascending: false })
    
    if (devicesError) {
      console.error('Error al obtener dispositivos:', devicesError)
      return NextResponse.json({ error: 'Error al obtener dispositivos' }, { status: 500 })
    }
    
    // Si no tenemos el fingerprint actual, marcar como actual el último activo
    let currentDeviceId = null
    if (currentDeviceFingerprint) {
      const currentDevice = devices.find(d => d.device_fingerprint === currentDeviceFingerprint)
      currentDeviceId = currentDevice?.id || null
    } else {
      // Si no hay fingerprint, marcar como actual el más reciente
      currentDeviceId = devices.length > 0 ? devices[0].id : null
    }
    
    // Convertir dispositivos a sesiones para mantener compatibilidad con la interfaz
    const enhancedSessions = devices.map((device: any) => {
      return {
        id: device.id,
        created_at: device.first_seen_at,
        updated_at: device.last_active_at,
        // Marcar como actual solo el dispositivo identificado
        current: device.id === currentDeviceId,
        device_name: device.device_name || 'Dispositivo desconocido',
        device_type: device.device_type || 'desktop',
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
    
    // Obtener datos del request
    const requestData = await request.json()
    const { 
      device_name: deviceName, 
      device_type: deviceType, 
      user_agent: userAgent, 
      browser, 
      browser_version, 
      os, 
      os_version, 
      device_fingerprint: clientFingerprint, 
      ip_address: ipAddress, 
      location 
    } = requestData
    
    console.log('[API:Sessions] Datos recibidos:', {
      deviceName,
      deviceType, 
      userAgent: userAgent ? userAgent.substring(0, 50) + '...' : null,
      browser,
      browser_version,
      os,
      os_version,
      fingerprint: clientFingerprint ? clientFingerprint.substring(0, 10) + '...' : null
    })
    
    // Validar que tenemos la huella digital del dispositivo
    if (!clientFingerprint) {
      return NextResponse.json({ error: 'device_fingerprint es requerido' }, { status: 400 })
    }
    
    // Para manejo simplificado, usaremos el id del usuario como session_id
    const sessionId = userId
    
    // Obtener IP del request usando la lógica mejorada
    const getClientIP = () => {
      if (ipAddress) return ipAddress
      
      const forwarded = request.headers.get('x-forwarded-for')
      if (forwarded) {
        // x-forwarded-for puede contener múltiples IPs separadas por comas
        return forwarded.split(',')[0].trim()
      }
      
      return request.headers.get('x-real-ip') || 
             request.headers.get('cf-connecting-ip') || // Cloudflare
             request.headers.get('x-client-ip') || 
             null
    }
    
    const finalIpAddress = getClientIP()
    
    // Buscar si ya existe un dispositivo con esta huella digital para este usuario
    const { data: existingDevice, error: searchError } = await supabase
      .from('user_devices')
      .select('*')
      .eq('user_id', userId)
      .eq('device_fingerprint', clientFingerprint)
      .eq('is_active', true)
      .maybeSingle()
    
    if (searchError) {
      console.error('[API:Sessions] Error buscando dispositivo:', searchError)
      return NextResponse.json({ error: 'Error al buscar dispositivo' }, { status: 500 })
    }
    
    let result
    
    if (existingDevice) {
      console.log('[API:Sessions] Actualizando dispositivo existente:', existingDevice.id)
      
      // Determinar la ubicación actualizada
      let finalLocation = location
      
      // Si no hay ubicación del cliente y la IP cambió, obtener por IP
      if (!finalLocation && finalIpAddress && finalIpAddress !== existingDevice.ip_address) {
        console.log('[API:Sessions] IP cambió, obteniendo nueva geolocalización:', finalIpAddress)
        finalLocation = await getLocationFromIP(finalIpAddress)
      }
      
      // Si el cliente envió un mensaje de estado, mantenerlo y agregar info de IP si es útil
      if (location && (
        location.includes('denegó') || 
        location.includes('no disponible') || 
        location.includes('no soportada') ||
        location.includes('Error al obtener') ||
        location.includes('Timeout')
      )) {
        // Solo agregar ubicación por IP si la IP cambió
        if (finalIpAddress && finalIpAddress !== existingDevice.ip_address) {
          const ipLocation = await getLocationFromIP(finalIpAddress)
          finalLocation = ipLocation ? `${location} (IP: ${ipLocation})` : location
        } else {
          finalLocation = location // Mantener solo el mensaje de estado
        }
      }
      
      // Actualizar dispositivo existente
      const updateData: any = {
        session_id: sessionId,
        last_active_at: new Date().toISOString(),
      }
      
      // Actualizar campos si vienen con nuevos valores
      if (deviceName) updateData.device_name = deviceName
      if (userAgent) updateData.user_agent = userAgent
      if (finalIpAddress) updateData.ip_address = finalIpAddress
      if (finalLocation) updateData.location = finalLocation
      if (browser) updateData.browser = browser
      if (browser_version) updateData.browser_version = browser_version
      if (os) updateData.os = os
      if (os_version) updateData.os_version = os_version
      
      result = await supabase.from('user_devices').update(updateData).eq('id', existingDevice.id)
      
    } else {
      console.log('[API:Sessions] Creando nuevo dispositivo con fingerprint:', clientFingerprint.substring(0, 10) + '...')
      
      // Determinar la ubicación final
      let finalLocation = location
      
      // Si no hay ubicación del cliente, intentar obtenerla por IP
      if (!finalLocation && finalIpAddress) {
        console.log('[API:Sessions] Obteniendo geolocalización para IP:', finalIpAddress)
        finalLocation = await getLocationFromIP(finalIpAddress)
      }
      
      // Si el cliente envió un mensaje de estado (ej: "Usuario denegó..."), no sobrescribir con IP
      if (location && (
        location.includes('denegó') || 
        location.includes('no disponible') || 
        location.includes('no soportada') ||
        location.includes('Error al obtener') ||
        location.includes('Timeout')
      )) {
        // Mantener el mensaje de estado del cliente y agregar ubicación por IP si está disponible
        const ipLocation = finalIpAddress ? await getLocationFromIP(finalIpAddress) : null
        finalLocation = ipLocation ? `${location} (IP: ${ipLocation})` : location
      }
      
      // Crear nuevo registro de dispositivo
      const newDeviceData = {
        user_id: userId,
        session_id: sessionId,
        device_name: deviceName || 'Nuevo dispositivo',
        device_type: deviceType || detectDeviceType(userAgent) || 'desktop',
        browser: browser || null,
        browser_version: browser_version || null,
        os: os || null,
        os_version: os_version || null,
        device_fingerprint: clientFingerprint,
        user_agent: userAgent || null,
        ip_address: finalIpAddress,
        location: finalLocation || null,
        is_active: true,
        is_trusted: false,
        first_seen_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        revoked_at: null
      }
      
      console.log('[API:Sessions] Insertando nuevo dispositivo:', {
        ...newDeviceData,
        user_agent: newDeviceData.user_agent ? newDeviceData.user_agent.substring(0, 50) + '...' : null
      })
      
      result = await supabase.from('user_devices').insert(newDeviceData)
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
      // Primero verificar que el dispositivo a revocar no sea el actual
      const { data: deviceToRevoke, error: deviceError } = await supabase
        .from('user_devices')
        .select('device_fingerprint')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()
      
      if (deviceError) {
        console.error('Error al buscar dispositivo:', deviceError)
        return NextResponse.json({ error: 'Dispositivo no encontrado' }, { status: 404 })
      }
      
      // Obtener el fingerprint del dispositivo actual desde el request
      const url = new URL(request.url)
      const currentFingerprint = url.searchParams.get('current_fingerprint')
      
      // Prevenir revocar la sesión actual
      if (currentFingerprint && deviceToRevoke.device_fingerprint === currentFingerprint) {
        return NextResponse.json({ 
          error: 'No puedes desconectar tu dispositivo actual. Usa "Cerrar sesión" en su lugar.' 
        }, { status: 400 })
      }
      
      // Marcar el dispositivo específico como inactivo
      const { error } = await supabase.from('user_devices')
        .update({
          is_active: false,
          revoked_at: currentTime
        })
        .eq('id', sessionId)
        .eq('user_id', userId)
      
      if (error) {
        console.error('Error al revocar el dispositivo:', error)
        return NextResponse.json({ error: 'Error al revocar el dispositivo' }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, message: 'Dispositivo desconectado correctamente' })
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

// Función para obtener geolocalización basada en IP
async function getLocationFromIP(ipAddress: string | null): Promise<string | null> {
  if (!ipAddress || ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.')) {
    return 'Ubicación local'
  }
  
  try {
    // Usar un servicio gratuito de geolocalización por IP
    const response = await fetch(`http://ip-api.com/json/${ipAddress}?fields=status,message,country,regionName,city,lat,lon`)
    
    if (!response.ok) {
      console.warn('Error al obtener geolocalización:', response.status)
      return null
    }
    
    const data = await response.json()
    
    if (data.status === 'success') {
      const location = [data.city, data.regionName, data.country].filter(Boolean).join(', ')
      return location || 'Ubicación desconocida'
    } else {
      console.warn('Error en servicio de geolocalización:', data.message)
      return null
    }
  } catch (error) {
    console.error('Error al obtener geolocalización:', error)
    return null
  }
}

// Función auxiliar para detectar el tipo de dispositivo basado en user-agent
function detectDeviceType(userAgent: string | null): string {
  if (!userAgent) return 'desktop'
  
  const ua = userAgent.toLowerCase()
  
  // Detectar móviles primero
  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('ipod') || 
      (ua.includes('android') && ua.includes('mobile'))) {
    return 'mobile'
  }
  
  // Detectar tablets
  if (ua.includes('ipad') || (ua.includes('android') && !ua.includes('mobile')) ||
      ua.includes('tablet')) {
    return 'tablet'
  }
  
  // Todo lo demás es desktop
  return 'desktop'
}
