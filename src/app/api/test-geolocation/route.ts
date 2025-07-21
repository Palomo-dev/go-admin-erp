import { NextResponse } from 'next/server'

// Función para obtener geolocalización basada en IP (misma que en sessions)
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

// GET: Probar geolocalización
export async function GET(request: Request) {
  try {
    // Obtener IP del request usando la lógica mejorada
    const getClientIP = () => {
      const forwarded = request.headers.get('x-forwarded-for')
      if (forwarded) {
        return forwarded.split(',')[0].trim()
      }
      
      return request.headers.get('x-real-ip') || 
             request.headers.get('cf-connecting-ip') || 
             request.headers.get('x-client-ip') || 
             '8.8.8.8' // IP de prueba para desarrollo local
    }
    
    const clientIP = getClientIP()
    console.log('IP detectada:', clientIP)
    
    // Obtener geolocalización
    const location = await getLocationFromIP(clientIP)
    
    return NextResponse.json({
      ip: clientIP,
      location: location,
      headers: {
        'x-forwarded-for': request.headers.get('x-forwarded-for'),
        'x-real-ip': request.headers.get('x-real-ip'),
        'cf-connecting-ip': request.headers.get('cf-connecting-ip'),
        'x-client-ip': request.headers.get('x-client-ip')
      }
    })
    
  } catch (error: any) {
    console.error('Error en test de geolocalización:', error)
    return NextResponse.json(
      { error: 'Error del servidor: ' + (error.message || 'Desconocido') }, 
      { status: 500 }
    )
  }
}
