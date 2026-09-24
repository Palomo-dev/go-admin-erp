'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { limpiarSesionMuerta } from '@/lib/auth/deadSession';

/**
 * «Iniciar sesión de nuevo» de la pantalla de arranque sin conexión.
 *
 * Borra la sesión local ANTES de ir al login. Sin esto, el middleware ve la
 * cookie del token viejo y devuelve a /app/inicio: el enlace «no hacía nada».
 */
export function useIniciarSesionDeNuevo(): () => Promise<void> {
  const router = useRouter();
  return useCallback(async () => {
    await limpiarSesionMuerta();
    router.replace('/auth/login');
  }, [router]);
}
