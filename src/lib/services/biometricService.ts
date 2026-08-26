/**
 * Servicio de autenticación biométrica para Go Admin Mobile (Capacitor).
 *
 * Wrapper sobre @aparajita/capacitor-biometric-auth con graceful degradation.
 * En web/desktop todas las funciones retornan { available: false } o { verified: false }.
 *
 * No importa paquetes @capacitor/* — usa detección runtime via getMobilePlugin().
 */

import {
  isMobile,
  getMobilePlugin,
  type MobileBiometricResult,
} from '@/lib/utils/mobile';

// ============================================================================
// Tipos
// ============================================================================

export interface BiometricAvailability {
  available: boolean;
  biometryType?: 'touchId' | 'faceId' | 'biometrics';
  reason?: string;
}

// ============================================================================
// API pública
// ============================================================================

/**
 * Verifica si la biometría está disponible en el dispositivo.
 * No lanza errores — siempre retorna un resultado estructurado.
 */
export async function isBiometricAvailable(): Promise<BiometricAvailability> {
  if (!isMobile()) {
    return { available: false, reason: 'not_mobile' };
  }

  const biometric = getMobilePlugin('BiometricAuth');
  if (!biometric?.isBiometricAvailable) {
    return { available: false, reason: 'plugin_not_available' };
  }

  try {
    const result = await biometric.isBiometricAvailable();
    return {
      available: result.available,
      biometryType: result.biometryType as BiometricAvailability['biometryType'],
    };
  } catch (error) {
    console.error('[biometricService] Error checking availability:', error);
    return { available: false, reason: 'error' };
  }
}

/**
 * Autentica al usuario con biometría (Touch ID / Face ID / huella Android).
 * @param reason - Texto mostrado en el prompt nativo (ej: "Inicia sesión para continuar")
 */
export async function authenticateWithBiometric(
  reason?: string,
): Promise<MobileBiometricResult> {
  if (!isMobile()) {
    return { verified: false, reason: 'not_mobile' };
  }

  const biometric = getMobilePlugin('BiometricAuth');
  if (!biometric?.authenticate) {
    return { verified: false, reason: 'plugin_not_available' };
  }

  try {
    return await biometric.authenticate({ reason });
  } catch (error) {
    console.error('[biometricService] Error authenticating:', error);
    return { verified: false, reason: 'error' };
  }
}

/**
 * Verifica si el usuario puede usar login biométrico.
 * Combina disponibilidad de hardware + existencia de credenciales guardadas.
 *
 * Las credenciales se guardan en localStorage (base64 + reverse) tras un login
 * exitoso con email/password, solo si el usuario activa la opción "Recordarme".
 *
 * Reutiliza las mismas claves de localStorage que rememberMe (`userEmail`/`userPassword`)
 * con el mismo encoding (btoa + reverse), para evitar duplicación y mantener consistencia.
 */
export async function canUseBiometricLogin(): Promise<boolean> {
  const availability = await isBiometricAvailable();
  if (!availability.available) return false;

  // Reutiliza las credenciales de rememberMe (mismas claves, mismo encoding)
  const hasCredentials = localStorage.getItem('userEmail') && localStorage.getItem('userPassword');
  return !!hasCredentials;
}

/**
 * Elimina las credenciales guardadas (también usadas por rememberMe).
 * Se llama al cerrar sesión.
 */
export function clearBiometricCredentials(): void {
  localStorage.removeItem('userEmail');
  localStorage.removeItem('userPassword');
  localStorage.removeItem('rememberMe');
}

/**
 * Recupera el email guardado para login biométrico.
 * Usa el mismo encoding que rememberMe: atob(reverse(base64)).
 */
export function getBiometricEmail(): string | null {
  const encoded = localStorage.getItem('userEmail');
  if (!encoded) return null;
  try {
    return atob(encoded.split('').reverse().join(''));
  } catch {
    return null;
  }
}

/**
 * Recupera la contraseña guardada para login biométrico.
 * Usa el mismo encoding que rememberMe: atob(reverse(base64)).
 */
export function getBiometricPassword(): string | null {
  const encoded = localStorage.getItem('userPassword');
  if (!encoded) return null;
  try {
    return atob(encoded.split('').reverse().join(''));
  } catch {
    return null;
  }
}
