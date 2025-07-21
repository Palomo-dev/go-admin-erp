export type GeolocationPreference = 'allowed' | 'denied' | 'not_supported'

/**
 * Obtiene la preferencia de geolocalización desde las cookies
 */
export function getGeolocationPreference(): GeolocationPreference | null {
  if (typeof document === 'undefined') return null
  
  const cookies = document.cookie.split(';')
  const geolocationCookie = cookies.find(cookie => 
    cookie.trim().startsWith('geolocation_preference=')
  )
  
  if (!geolocationCookie) return null
  
  const value = geolocationCookie.split('=')[1]
  return (['allowed', 'denied', 'not_supported'] as const).includes(value as any) 
    ? (value as GeolocationPreference) 
    : null
}

/**
 * Guarda la preferencia de geolocalización en cookies
 */
export function saveGeolocationPreference(preference: GeolocationPreference) {
  if (typeof document === 'undefined') return
  
  const expirationDate = new Date()
  expirationDate.setFullYear(expirationDate.getFullYear() + 1)
  
  document.cookie = `geolocation_preference=${preference}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Strict`
}

/**
 * Intenta obtener la ubicación del navegador según la preferencia guardada
 */
export async function getLocationFromBrowser(): Promise<string | null> {
  const preference = getGeolocationPreference()
  
  if (preference !== 'allowed' || !navigator.geolocation) {
    return getLocationStatusMessage(preference)
  }

  try {
    console.log('Obteniendo geolocalización (permitida por usuario)...')
    
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Timeout'))
      }, 5000)
      
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeoutId)
          resolve(pos)
        },
        (err) => {
          clearTimeout(timeoutId)
          reject(err)
        },
        { 
          timeout: 4000,
          enableHighAccuracy: false,
          maximumAge: 300000 // 5 minutos
        }
      )
    })
    
    return `Coordenadas GPS: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
    
  } catch (error: any) {
    console.log('Error al obtener geolocalización:', error.message)
    return 'Error al obtener ubicación GPS'
  }
}

/**
 * Obtiene el mensaje de estado según la preferencia
 */
function getLocationStatusMessage(preference: GeolocationPreference | null): string {
  switch (preference) {
    case 'denied':
      return 'Usuario denegó el acceso a la ubicación'
    case 'not_supported':
      return 'Geolocalización no soportada por el navegador'
    case null:
      return 'Preferencia de ubicación no establecida'
    default:
      return 'Estado de ubicación desconocido'
  }
}

/**
 * Verifica si necesita mostrar el modal de geolocalización
 */
export function shouldShowGeolocationModal(): boolean {
  return getGeolocationPreference() === null
}
