export type GeolocationPreference = 'allowed' | 'denied' | 'not_supported'

import { isMobile, getMobilePlugin } from '@/lib/utils/mobile';

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
 * Intenta obtener la ubicación del navegador. El único permiso es el del propio
 * navegador (o el del sistema en la app móvil): GO Admin ya no pregunta antes.
 * Solo se deja de intentar si quedó guardado un rechazo o que no hay soporte.
 */
export async function getLocationFromBrowser(): Promise<string | null> {
  const preference = getGeolocationPreference()

  if (preference === 'denied' || preference === 'not_supported') {
    return getLocationStatusMessage(preference)
  }

  // Rama móvil (Capacitor): usar plugin nativo de geolocalización
  if (isMobile()) {
    const geo = getMobilePlugin('Geolocation');
    if (geo?.getCurrentPosition) {
      try {
        const position = await geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        return `Coordenadas GPS: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      } catch (error: any) {
        console.log('Error al obtener geolocalización nativa:', error.message);
        return 'Error al obtener ubicación GPS';
      }
    }
    // Si el plugin no está disponible, caer al flujo web
  }

  if (!navigator.geolocation) {
    return getLocationStatusMessage('not_supported')
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
    
    saveGeolocationPreference('allowed')
    return `Coordenadas GPS: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
    
  } catch (error: any) {
    console.log('Error al obtener geolocalización:', error.message)
    // Código 1: la persona dijo que no en el navegador. Un tiempo agotado no es
    // un rechazo y no se guarda: el navegador puede volver a preguntar.
    if (error?.code === 1) saveGeolocationPreference('denied')
    return 'Error al obtener ubicación GPS'
  }
}

/**
 * Obtiene el mensaje de estado según la preferencia
 */
function getLocationStatusMessage(preference: GeolocationPreference): string {
  switch (preference) {
    case 'denied':
      return 'Usuario denegó el acceso a la ubicación'
    case 'not_supported':
      return 'Geolocalización no soportada por el navegador'
    default:
      return 'Estado de ubicación desconocido'
  }
}
