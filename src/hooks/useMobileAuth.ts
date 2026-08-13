'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { isMobile } from '@/lib/utils/mobile';
import {
  startMobileOAuth,
  registerMobileAuthListener,
  processMobileAuthUrl,
  type MobileAuthResult,
} from '@/lib/services/mobileAuthService';

// ============================================================================
// Interfaces
// ============================================================================

interface UseMobileAuthReturn {
  /** true si la app corre en móvil nativo (Capacitor). */
  isMobileApp: boolean;
  /** true si hay un flujo OAuth en curso. */
  oauthLoading: boolean;
  /** Error del último flujo OAuth, o null. */
  oauthError: string | null;
  /** Resultado del último deep link procesado, o null. */
  authResult: MobileAuthResult | null;
  /** Inicia OAuth con Google en móvil (abre browser externo). */
  loginWithGoogle: () => Promise<void>;
  /** Inicia OAuth con Microsoft en móvil (abre browser externo). */
  loginWithMicrosoft: () => Promise<void>;
}

// ============================================================================
// Hook principal
// ============================================================================

/**
 * Hook para manejar autenticación OAuth en la app móvil (Capacitor).
 *
 * - Registra listener de deep links (`appUrlOpen`) al montar
 * - Procesa tokens del deep link y establece sesión con `setSession()`
 * - Expone `loginWithGoogle()` y `loginWithMicrosoft()` que abren browser externo
 *
 * En web/desktop, todas las funciones son no-ops y `isMobileApp` es false.
 *
 * @example
 * const { isMobileApp, loginWithGoogle, authResult } = useMobileAuth();
 * if (isMobileApp) { await loginWithGoogle(); }
 */
export function useMobileAuth(): UseMobileAuthReturn {
  const [isMobileApp] = useState(() => isMobile());
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [authResult, setAuthResult] = useState<MobileAuthResult | null>(null);
  const listenerCleanup = useRef<(() => void) | null>(null);

  // ==========================================================================
  // Registrar listener de deep links al montar (solo en móvil)
  // ==========================================================================

  useEffect(() => {
    if (!isMobileApp) return;

    let cancelled = false;

    const setupListener = async () => {
      const cleanup = await registerMobileAuthListener((result) => {
        if (cancelled) return;
        setAuthResult(result);
        setOauthLoading(false);
        if (!result.success && result.error) {
          setOauthError(result.error);
        }
      });
      if (!cancelled) {
        listenerCleanup.current = cleanup;
      }
    };

    setupListener();

    return () => {
      cancelled = true;
      listenerCleanup.current?.();
      listenerCleanup.current = null;
    };
  }, [isMobileApp]);

  // ==========================================================================
  // OAuth con Google
  // ==========================================================================

  const loginWithGoogle = useCallback(async () => {
    if (!isMobileApp) return;
    setOauthLoading(true);
    setOauthError(null);
    const url = await startMobileOAuth('google');
    if (!url) {
      setOauthError('No se pudo iniciar OAuth con Google');
      setOauthLoading(false);
    }
    // El resultado llega via deep link listener, no aquí
  }, [isMobileApp]);

  // ==========================================================================
  // OAuth con Microsoft
  // ==========================================================================

  const loginWithMicrosoft = useCallback(async () => {
    if (!isMobileApp) return;
    setOauthLoading(true);
    setOauthError(null);
    const url = await startMobileOAuth('azure');
    if (!url) {
      setOauthError('No se pudo iniciar OAuth con Microsoft');
      setOauthLoading(false);
    }
  }, [isMobileApp]);

  return {
    isMobileApp,
    oauthLoading,
    oauthError,
    authResult,
    loginWithGoogle,
    loginWithMicrosoft,
  };
}

// ============================================================================
// Hook para procesar un deep link manualmente (ej. al abrir app desde link)
// ============================================================================

/**
 * Hook para procesar una URL de deep link recibida al abrir la app.
 * Útil cuando la app se abre directamente desde un deep link (cold start).
 */
export function useProcessMobileAuthUrl() {
  return useCallback(async (url: string): Promise<MobileAuthResult> => {
    return processMobileAuthUrl(url);
  }, []);
}
