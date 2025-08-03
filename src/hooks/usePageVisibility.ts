'use client';

import { useState, useEffect } from 'react';

/**
 * Hook para detectar cuando la página se vuelve visible/invisible
 * Útil para evitar re-cargas innecesarias cuando se cambia de app
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(true);
  const [wasHidden, setWasHidden] = useState(false);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      
      if (!visible) {
        // La página se está ocultando
        setWasHidden(true);
      } else if (wasHidden) {
        // La página vuelve a ser visible después de estar oculta
        // No hacer nada especial, solo actualizar el estado
      }
      
      setIsVisible(visible);
    };

    // Verificar soporte de la API
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      // Estado inicial
      setIsVisible(!document.hidden);
    }

    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [wasHidden]);

  return {
    isVisible,
    wasHidden,
    resetHiddenState: () => setWasHidden(false)
  };
}
