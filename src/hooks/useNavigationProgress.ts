'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Hook para mostrar indicador de progreso durante la navegación
 * Proporciona feedback visual inmediato cuando el usuario cambia de ruta
 */
export function useNavigationProgress() {
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Iniciar navegación manualmente (para cuando se hace clic en un link)
  const startNavigation = useCallback(() => {
    setIsNavigating(true);
    setProgress(30); // Inicio rápido para feedback inmediato
  }, []);

  // Finalizar navegación
  const finishNavigation = useCallback(() => {
    setProgress(100);
    // Pequeño delay para mostrar el 100% antes de ocultar
    setTimeout(() => {
      setIsNavigating(false);
      setProgress(0);
    }, 200);
  }, []);

  // Detectar cambio de ruta para finalizar la navegación
  useEffect(() => {
    // Cuando la ruta cambia, significa que la navegación terminó
    finishNavigation();
  }, [pathname, searchParams, finishNavigation]);

  // Simular progreso mientras navega
  useEffect(() => {
    if (!isNavigating) return;

    // Incrementar progreso gradualmente
    const interval = setInterval(() => {
      setProgress((prev) => {
        // Nunca llegar a 100 hasta que termine realmente
        if (prev >= 90) return prev;
        // Incremento más lento mientras más avanza
        const increment = Math.max(1, (90 - prev) / 10);
        return Math.min(prev + increment, 90);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isNavigating]);

  return {
    isNavigating,
    progress,
    startNavigation,
    finishNavigation,
  };
}

export default useNavigationProgress;
