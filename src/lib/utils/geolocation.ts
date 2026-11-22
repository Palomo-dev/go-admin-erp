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
 * ¿El navegador (o el sistema, en la app móvil) YA concedió la ubicación?
 * Solo consulta el estado: nunca abre el aviso de permiso. Sin forma de
 * saberlo (Permissions API ausente), responde `false`.
 */
async function ubicacionYaConcedida(): Promise<boolean> {
  if (isMobile()) {
    const geo = getMobilePlugin('Geolocation');
    if (geo?.checkPermissions) {
      try {
        const estado = await geo.checkPermissions();
        return estado?.location === 'granted';
      } catch {
        return false;
      }
    }
  }
  try {
    const permisos = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!permisos?.query) return false;
    const estado = await permisos.query({ name: 'geolocation' as PermissionName });
    return estado.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * Ubicación para el registro del dispositivo al iniciar sesión, SIN pedir
 * permiso (2026-11-20). Antes se llamaba a `getCurrentPosition` al entrar: en
 * iPhone salía el aviso del sistema sobre «Elige una organización», la
 * redirección del login cortaba la espera, quedaba `pendingDeviceRegister` y
 * `AppLayout` lo reintentaba en la página siguiente → el aviso volvía a salir
 * respondiera lo que respondiera. Ahora solo se lee la posición si el permiso
 * ya estaba concedido; si no, se devuelve un estado y no se pregunta. Las
 * pantallas que sí necesitan la ubicación (marcar turno, mapas) la piden en su
 * contexto.
 */
export async function getLocationFromBrowser(): Promise<string | null> {
  const preference = getGeolocationPreference()

  if (preference === 'denied' || preference === 'not_supported') {
    return getLocationStatusMessage(preference)
  }

  if (!(await ubicacionYaConcedida())) {
    return 'Ubicación no solicitada al iniciar sesión'
  }

  // Rama móvil (Capacitor): plugin nativo, con el permiso ya concedido.
  if (isMobile()) {
    const geo = getMobilePlugin('Geolocation');
    if (geo?.getCurrentPosition) {
      try {
        const position = await geo.getCurrentPosition({ enableHighAccuracy: false, timeout: 5000 });
        return `Coordenadas GPS: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`;
      } catch {
        return 'Error al obtener ubicación GPS';
      }
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return getLocationStatusMessage('not_supported')
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Timeout')), 5000)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timeoutId)
          resolve(pos)
        },
        (err) => {
          clearTimeout(timeoutId)
          reject(err)
        },
        { timeout: 4000, enableHighAccuracy: false, maximumAge: 300000 }
      )
    })
    saveGeolocationPreference('allowed')
    return `Coordenadas GPS: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`
  } catch (error: unknown) {
    if ((error as { code?: number })?.code === 1) saveGeolocationPreference('denied')
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
