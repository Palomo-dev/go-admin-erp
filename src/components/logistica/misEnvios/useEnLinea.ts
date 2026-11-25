'use client';

/**
 * ¿Hay señal? (`navigator.onLine` y los eventos `online` / `offline`).
 *
 * Decisión del dueño (2026-11-25): sin conexión la app NO guarda entregas, cobros ni novedades para
 * enviarlos después (esa cola va en otra fase). Mientras tanto se pausan Entregar, Novedad, los
 * cambios de estado y el cierre de jornada con un aviso claro; llamar y cómo llegar siguen.
 *
 * En el primer render (servidor e hidratación) devuelve `true`: nunca se bloquea por adivinar.
 */
import { useEffect, useState } from 'react';

export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(true);
  useEffect(() => {
    if (typeof navigator === 'undefined' || typeof window === 'undefined') return;
    const leer = () => setEnLinea(navigator.onLine !== false);
    leer();
    window.addEventListener('online', leer);
    window.addEventListener('offline', leer);
    return () => {
      window.removeEventListener('online', leer);
      window.removeEventListener('offline', leer);
    };
  }, []);
  return enLinea;
}
