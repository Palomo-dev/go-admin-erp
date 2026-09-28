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
 * Clave donde se guarda el refresh token de Supabase para el desbloqueo
 * biométrico. Antes se guardaba la CONTRASEÑA del usuario en `userPassword`,
 * codificada con `btoa()` + reverse —reversible en una línea—, y además la
 * pantalla de sesión expirada no la borraba (auditoría de acceso, 2026-09-22).
 * Un refresh token es revocable, caduca y no sirve para entrar en otros
 * sistemas donde el usuario repita la contraseña.
 */
const BIOMETRIC_TOKEN_KEY = 'biometricRefreshToken';

function encode(value: string): string {
  return btoa(value).split('').reverse().join('');
}

function decode(value: string): string | null {
  try {
    return atob(value.split('').reverse().join(''));
  } catch {
    return null;
  }
}

/**
 * Guarda las credenciales del desbloqueo biométrico: el correo (para mostrarlo
 * y para el «Recordarme») y el refresh token de la sesión recién abierta.
 * NUNCA se guarda la contraseña.
 */
export function saveBiometricCredentials(email: string, refreshToken: string): void {
  try {
    localStorage.setItem('userEmail', encode(email));
    localStorage.setItem(BIOMETRIC_TOKEN_KEY, encode(refreshToken));
  } catch {
    // Almacenamiento no disponible (modo privado): el biométrico simplemente
    // no quedará activado.
  }
}

export async function canUseBiometricLogin(): Promise<boolean> {
  const availability = await isBiometricAvailable();
  if (!availability.available) return false;

  return Boolean(
    localStorage.getItem('userEmail') && localStorage.getItem(BIOMETRIC_TOKEN_KEY)
  );
}

/**
 * Elimina las credenciales guardadas (también usadas por rememberMe).
 * Se llama al cerrar sesión. Incluye la limpieza de `userPassword`, que pudo
 * quedar guardada por versiones anteriores.
 */
export function clearBiometricCredentials(): void {
  localStorage.removeItem('userEmail');
  localStorage.removeItem('rememberMe');
  localStorage.removeItem(BIOMETRIC_TOKEN_KEY);
  localStorage.removeItem('userPassword'); // heredado: se purga siempre
}

/** Correo guardado para el desbloqueo biométrico. */
export function getBiometricEmail(): string | null {
  const encoded = localStorage.getItem('userEmail');
  if (!encoded) return null;
  return decode(encoded);
}

/** Refresh token guardado para el desbloqueo biométrico. */
export function getBiometricRefreshToken(): string | null {
  const encoded = localStorage.getItem(BIOMETRIC_TOKEN_KEY);
  if (!encoded) return null;
  return decode(encoded);
}

/**
 * Purga cualquier contraseña guardada por versiones anteriores. Se llama al
 * cargar la pantalla de acceso, para que nadie conserve la suya en el
 * dispositivo tras actualizar.
 */
export function purgeLegacyStoredPassword(): void {
  try {
    localStorage.removeItem('userPassword');
  } catch {
    // sin almacenamiento: nada que purgar
  }
}
